/**
 * Admin Routes
 * User management endpoints for administrators
 */

const User = require('../../models/User');
const Role = require('../../models/Role');
const { query } = require('../../config/database');
const { clearCache } = require('../../services/data-source-service');
const { requireAuth, requireCapability, requireAdmin } = require('../middleware/auth');
const { getMigrationStatus } = require('../../db/migrator');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const { version } = require('../../../package.json');
const { userSchema } = require('../schemas/user-schemas');

const ADMINISTRATOR_ROLE_SLUG = 'administrator';

const userActionResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    user: userSchema
  }
};

/**
 * Counts active, undeleted users holding the administrator role.
 */
async function countActiveAdministrators() {
  const rows = await query(
    `SELECT COUNT(DISTINCT u.id) AS count
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     JOIN account_statuses s ON s.id = u.status_id
     WHERE r.slug = ? AND s.is_active = 1 AND u.deleted_at IS NULL`,
    [ADMINISTRATOR_ROLE_SLUG]
  );
  return rows[0].count;
}

async function adminRoutes(fastify, _options) {
  /**
   * GET /api/v1/admin/system-info
   * Application/system diagnostics for the admin dashboard.
   * Administrator role only (not capability-gated) — surfaces deployment
   * details (version, environment, migration state) that are admin-only.
   */
  fastify.get(
    '/system-info',
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        tags: ['Admin'],
        description: 'System and deployment info (administrator role only)',
        response: {
          200: {
            type: 'object',
            properties: {
              app: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  environment: { type: 'string' },
                  nodeVersion: { type: 'string' },
                  uptimeSeconds: { type: 'number' }
                }
              },
              database: {
                type: 'object',
                properties: {
                  status: { type: 'string' }
                }
              },
              migrations: {
                type: 'object',
                properties: {
                  applied: { type: 'integer' },
                  total: { type: 'integer' },
                  pending: { type: 'integer' },
                  pendingVersions: { type: 'array', items: { type: 'string' } },
                  latest: {
                    type: ['object', 'null'],
                    properties: {
                      version: { type: 'string' },
                      applied_at: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      // Database connectivity + migration state. If the DB is unreachable we
      // still return the app-level info rather than failing the whole panel.
      let databaseStatus = 'connected';
      let migrations = { applied: 0, total: 0, pending: 0, pendingVersions: [], latest: null };

      try {
        migrations = await getMigrationStatus();
      } catch (error) {
        logger.error('System info: migration status query failed', { error: error.message });
        databaseStatus = 'disconnected';
      }

      return reply.send({
        app: {
          version,
          environment: config.env,
          nodeVersion: process.version,
          uptimeSeconds: Math.round(process.uptime())
        },
        database: {
          status: databaseStatus
        },
        migrations
      });
    }
  );

  /**
   * GET /api/v1/admin/users
   * List all users with pagination and filters
   */
  fastify.get(
    '/users',
    {
      preHandler: [requireAuth, requireCapability('users:list')],
      schema: {
        tags: ['Admin'],
        description: 'List all users (admin only)',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            status: { type: 'string' },
            search: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              users: { type: 'array', items: userSchema },
              total: { type: 'integer' },
              limit: { type: 'integer' },
              offset: { type: 'integer' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { limit, offset, status, search } = request.query;

        const users = await User.list({ limit, offset, status, search });
        const total = await User.count({ status, search });

        return reply.send({
          users,
          total,
          limit,
          offset
        });
      } catch (error) {
        logger.error('List users error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list users'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/users/:id/approve
   * Approve pending user
   */
  fastify.post(
    '/users/:id/approve',
    {
      preHandler: [requireAuth, requireCapability('users:approve')],
      schema: {
        tags: ['Admin'],
        description: 'Approve pending user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            notes: { type: 'string' }
          }
        },
        response: { 200: userActionResponse }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes = 'Approved by administrator' } = request.body;

        // Find "active" status (id = 2)
        const user = await User.changeStatus(id, 2, request.user.id, notes);

        // TODO: Send approval email to user
        logger.info('User approved', { userId: id, approvedBy: request.user.id });

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        logger.error('Approve user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to approve user'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/users/:id/deactivate
   * Deactivate user account
   */
  fastify.post(
    '/users/:id/deactivate',
    {
      preHandler: [requireAuth, requireCapability('users:deactivate')],
      schema: {
        tags: ['Admin'],
        description: 'Deactivate user account',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            notes: { type: 'string' }
          }
        },
        response: { 200: userActionResponse }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes = 'Deactivated by administrator' } = request.body;

        // Prevent self-deactivation
        if (id === request.user.id) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Cannot deactivate your own account'
          });
        }

        // Find "inactive" status (id = 3)
        const user = await User.changeStatus(id, 3, request.user.id, notes);

        logger.info('User deactivated', { userId: id, deactivatedBy: request.user.id });

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        logger.error('Deactivate user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to deactivate user'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/users/:id/activate
   * Reactivate user account
   */
  fastify.post(
    '/users/:id/activate',
    {
      preHandler: [requireAuth, requireCapability('users:deactivate')],
      schema: {
        tags: ['Admin'],
        description: 'Reactivate user account',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            notes: { type: 'string' }
          }
        },
        response: { 200: userActionResponse }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes = 'Reactivated by administrator' } = request.body;

        // Find "active" status (id = 2)
        const user = await User.changeStatus(id, 2, request.user.id, notes);

        logger.info('User activated', { userId: id, activatedBy: request.user.id });

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        logger.error('Activate user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to activate user'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/admin/users/:id
   * Soft delete user
   */
  fastify.delete(
    '/users/:id',
    {
      preHandler: [requireAuth, requireCapability('users:delete')],
      schema: {
        tags: ['Admin'],
        description: 'Soft delete user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        // Prevent self-deletion
        if (id === request.user.id) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Cannot delete your own account'
          });
        }

        await User.softDelete(id);

        logger.info('User deleted', { userId: id, deletedBy: request.user.id });

        return reply.send({
          success: true,
          message: 'User deleted successfully'
        });
      } catch (error) {
        logger.error('Delete user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete user'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/users/:id/roles
   * Assign role to user
   */
  fastify.post(
    '/users/:id/roles',
    {
      preHandler: [requireAuth, requireCapability('roles:assign')],
      schema: {
        tags: ['Admin'],
        description: 'Assign role to user',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['roleId'],
          properties: {
            roleId: { type: 'integer' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { roleId } = request.body;

        if (id === request.user.id) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Cannot change your own roles'
          });
        }

        // Verify role exists
        const role = await Role.findById(roleId);
        if (!role) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Role not found'
          });
        }

        await User.assignRole(id, roleId, request.user.id);

        logger.info('Role assigned', { userId: id, roleId, assignedBy: request.user.id });

        return reply.send({
          success: true,
          message: `Role "${role.name}" assigned successfully`
        });
      } catch (error) {
        logger.error('Assign role error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to assign role'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/admin/users/:id/roles/:roleId
   * Remove role from user
   */
  fastify.delete(
    '/users/:id/roles/:roleId',
    {
      preHandler: [requireAuth, requireCapability('roles:remove')],
      schema: {
        tags: ['Admin'],
        description: 'Remove role from user',
        params: {
          type: 'object',
          required: ['id', 'roleId'],
          properties: {
            id: { type: 'integer' },
            roleId: { type: 'integer' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id, roleId } = request.params;

        const role = await Role.findById(roleId);
        if (role && role.slug === ADMINISTRATOR_ROLE_SLUG) {
          const targetRoles = await User.getRoles(id);
          const targetIsAdministrator = targetRoles.some(
            (targetRole) => targetRole.slug === ADMINISTRATOR_ROLE_SLUG
          );
          if (targetIsAdministrator && (await countActiveAdministrators()) <= 1) {
            return reply.code(400).send({
              error: 'Bad Request',
              message: 'Cannot remove the last active administrator'
            });
          }
        }

        await User.removeRole(id, roleId);

        logger.info('Role removed', { userId: id, roleId, removedBy: request.user.id });

        return reply.send({
          success: true,
          message: 'Role removed successfully'
        });
      } catch (error) {
        logger.error('Remove role error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to remove role'
        });
      }
    }
  );

  // ─── Data Source Management ─────────────────────────────────────────

  /**
   * GET /api/v1/admin/data-sources
   * List all data sources with last scrape info
   */
  fastify.get(
    '/data-sources',
    {
      preHandler: [requireAuth, requireCapability('scraper:configure')],
      schema: {
        tags: ['Admin'],
        description: 'List all data sources with last scrape status'
      }
    },
    async (request, reply) => {
      try {
        const sources = await query(
          `SELECT
            ds.*,
            sh.status AS last_scrape_status,
            sh.started_at AS last_scrape_at,
            sh.duration_ms AS last_scrape_duration_ms,
            sh.records_added AS last_scrape_added,
            sh.records_updated AS last_scrape_updated,
            sh.records_deleted AS last_scrape_deleted,
            sh.error_message AS last_scrape_error
          FROM data_sources ds
          LEFT JOIN scrape_history sh ON sh.id = (
            SELECT id FROM scrape_history
            WHERE data_source_id = ds.id
            ORDER BY started_at DESC
            LIMIT 1
          )
          ORDER BY ds.id`
        );

        return reply.send({ sources });
      } catch (error) {
        logger.error('List data sources error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list data sources'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/admin/data-sources/:id
   * Update data source settings
   */
  fastify.patch(
    '/data-sources/:id',
    {
      preHandler: [requireAuth, requireCapability('scraper:configure')],
      schema: {
        tags: ['Admin'],
        description: 'Update data source settings',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean' },
            show_by_default: { type: 'boolean' },
            scrape_interval_minutes: { type: 'integer', minimum: 1 },
            scrape_window_start_hour: { type: 'integer', minimum: 0, maximum: 24 },
            scrape_window_end_hour: { type: 'integer', minimum: 0, maximum: 24 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;

        // Build SET clause from provided fields
        const allowedFields = [
          'enabled',
          'show_by_default',
          'scrape_interval_minutes',
          'scrape_window_start_hour',
          'scrape_window_end_hour'
        ];
        const setClauses = [];
        const params = [];

        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            const value =
              field === 'enabled' || field === 'show_by_default'
                ? updates[field]
                  ? 1
                  : 0
                : updates[field];
            setClauses.push(`${field} = ?`);
            params.push(value);
          }
        }

        if (setClauses.length === 0) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'No valid fields to update'
          });
        }

        params.push(id);
        await query(`UPDATE data_sources SET ${setClauses.join(', ')} WHERE id = ?`, params);

        // Clear cached source data so scheduler picks up changes
        clearCache();

        // Return updated source
        const rows = await query('SELECT * FROM data_sources WHERE id = ?', [id]);
        if (rows.length === 0) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Data source not found'
          });
        }

        logger.info('Data source updated', {
          dataSourceId: id,
          updates,
          updatedBy: request.user.id
        });

        return reply.send({
          success: true,
          source: rows[0]
        });
      } catch (error) {
        logger.error('Update data source error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update data source'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/data-sources/:id/scrape
   * Trigger a manual scrape for a specific data source
   */
  fastify.post(
    '/data-sources/:id/scrape',
    {
      preHandler: [requireAuth, requireCapability('scraper:trigger')],
      schema: {
        tags: ['Admin'],
        description: 'Trigger a manual scrape for a data source',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const rows = await query('SELECT * FROM data_sources WHERE id = ?', [id]);
        if (rows.length === 0) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Data source not found'
          });
        }

        const source = rows[0];

        // Only sources with implemented scrapers can be triggered
        const implementedSources = ['daily_cause_list', 'future_hearing_list'];
        if (!implementedSources.includes(source.slug)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `Scraper not yet implemented for "${source.display_name}". This source will become available once its scraper is built.`
          });
        }

        logger.info('Manual scrape triggered', {
          dataSourceId: id,
          source: source.slug,
          triggeredBy: request.user.id
        });

        // Runs in the background so the request returns immediately
        const { startManualScrape } = require('../../scrapers/scheduler');
        if (!startManualScrape(source)) {
          return reply.code(409).send({
            error: 'Conflict',
            message: 'A scrape is already running. Try again when it has finished.'
          });
        }

        return reply.send({
          success: true,
          message: `Scrape triggered for "${source.display_name}". Refresh to see results.`
        });
      } catch (error) {
        logger.error('Trigger scrape error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to trigger scrape'
        });
      }
    }
  );

  // ─── User Management ─────────────────────────────────────────────

  /**
   * GET /api/v1/admin/users/:id
   * Get user details by ID
   */
  fastify.get(
    '/users/:id',
    {
      preHandler: [requireAuth, requireCapability('users:view')],
      schema: {
        tags: ['Admin'],
        description: 'Get user details',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        response: {
          200: { type: 'object', properties: { user: userSchema } }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;

        const user = await User.findById(id);
        if (!user) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found'
          });
        }

        const roles = await User.getRoles(id);

        return reply.send({
          user: {
            ...user,
            roles
          }
        });
      } catch (error) {
        logger.error('Get user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/admin/users/:id
   * Update user details
   */
  fastify.patch(
    '/users/:id',
    {
      preHandler: [requireAuth, requireCapability('users:edit')],
      schema: {
        tags: ['Admin'],
        description: 'Update user details',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' }
          }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            status_id: { type: 'integer' }
          }
        },
        response: { 200: userActionResponse }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;

        if (updates.status_id && id === request.user.id) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Cannot change your own account status'
          });
        }

        // If status is being changed, use changeStatus for audit trail
        if (updates.status_id) {
          await User.changeStatus(
            id,
            updates.status_id,
            request.user.id,
            'Updated by administrator'
          );
          delete updates.status_id;
        }

        // Update other fields if present
        if (Object.keys(updates).length > 0) {
          await User.update(id, updates);
        }

        const user = await User.findById(id);

        logger.info('User updated', { userId: id, updatedBy: request.user.id });

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        logger.error('Update user error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update user'
        });
      }
    }
  );
}

module.exports = adminRoutes;

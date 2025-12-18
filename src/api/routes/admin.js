/**
 * Admin Routes
 * User management endpoints for administrators
 */

const User = require('../../models/User');
const Role = require('../../models/Role');
const { requireAuth, requireCapability } = require('../middleware/auth');

async function adminRoutes(fastify, _options) {
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
              users: { type: 'array' },
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
        fastify.log.error({ error }, 'List users error');
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
          properties: {
            notes: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: { type: 'object' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes = 'Approved by administrator' } = request.body;

        // Find "active" status (id = 2)
        const user = await User.changeStatus(id, 2, request.user.id, notes);

        // TODO: Send approval email to user
        fastify.log.info({ userId: id, approvedBy: request.user.id }, 'User approved');

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Approve user error');
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
          properties: {
            notes: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: { type: 'object' }
            }
          }
        }
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

        fastify.log.info({ userId: id, deactivatedBy: request.user.id }, 'User deactivated');

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Deactivate user error');
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
          properties: {
            notes: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: { type: 'object' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes = 'Reactivated by administrator' } = request.body;

        // Find "active" status (id = 2)
        const user = await User.changeStatus(id, 2, request.user.id, notes);

        fastify.log.info({ userId: id, activatedBy: request.user.id }, 'User activated');

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Activate user error');
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

        fastify.log.info({ userId: id, deletedBy: request.user.id }, 'User deleted');

        return reply.send({
          success: true,
          message: 'User deleted successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Delete user error');
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

        // Verify role exists
        const role = await Role.findById(roleId);
        if (!role) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Role not found'
          });
        }

        await User.assignRole(id, roleId, request.user.id);

        fastify.log.info({ userId: id, roleId, assignedBy: request.user.id }, 'Role assigned');

        return reply.send({
          success: true,
          message: `Role "${role.name}" assigned successfully`
        });
      } catch (error) {
        fastify.log.error({ error }, 'Assign role error');
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

        await User.removeRole(id, roleId);

        fastify.log.info({ userId: id, roleId, removedBy: request.user.id }, 'Role removed');

        return reply.send({
          success: true,
          message: 'Role removed successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Remove role error');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to remove role'
        });
      }
    }
  );

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
        fastify.log.error({ error }, 'Get user error');
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
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            status_id: { type: 'integer' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;

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

        fastify.log.info({ userId: id, updatedBy: request.user.id }, 'User updated');

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Update user error');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update user'
        });
      }
    }
  );
}

module.exports = adminRoutes;

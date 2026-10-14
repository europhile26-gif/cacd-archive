/**
 * User Routes
 * Handles user profile management
 */

const User = require('../../models/User');
const logger = require('../../utils/logger');
const { requireAuth, requireCapability } = require('../middleware/auth');
const { roleSchema, userSchema } = require('../schemas/user-schemas');

async function userRoutes(fastify, _options) {
  /**
   * GET /api/v1/users/me
   * Get current user's profile
   */
  fastify.get(
    '/me',
    {
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('profile:view-own')],
      schema: {
        tags: ['Users'],
        description: 'Get current user profile',
        response: {
          200: {
            type: 'object',
            properties: {
              user: userSchema,
              roles: { type: 'array', items: roleSchema },
              capabilities: { type: 'array', items: { type: 'string' } },
              navigation: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    url: { type: 'string' },
                    icon: { type: 'string' },
                    action: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // User already attached by requireAuth middleware
        const roles = await User.getRoles(request.user.id);
        const capabilities = await User.getCapabilities(request.user.id);

        // Build navigation based on roles
        const navigation = [];
        const isAdmin = roles.some((role) => role.slug === 'administrator');

        navigation.push({ label: 'Home', url: '/', icon: 'house' });

        if (isAdmin) {
          navigation.push({ label: 'Admin', url: '/admin', icon: 'shield' });
        }

        navigation.push({ label: 'Dashboard', url: '/dashboard', icon: 'speedometer2' });
        navigation.push({ label: 'Logout', url: '#', action: 'logout', icon: 'box-arrow-right' });

        return reply.send({
          user: {
            ...request.user,
            roles,
            capabilities
          },
          roles,
          capabilities,
          navigation
        });
      } catch (error) {
        logger.error('Get user profile error', { userId: request.user.id, error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user profile'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/users/me
   * Update current user's profile
   */
  fastify.patch(
    '/me',
    {
      preHandler: [requireAuth, requireCapability('profile:edit-own')],
      schema: {
        tags: ['Users'],
        description: 'Update current user profile',
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: userSchema
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const user = await User.update(request.user.id, { name: request.body.name });

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        logger.error('Update user profile error', {
          userId: request.user.id,
          error: error.message
        });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update profile'
        });
      }
    }
  );

  /**
   * GET /api/v1/users/:id
   * Get user by ID (admin or own profile)
   */
  fastify.get(
    '/:id',
    {
      preHandler: [requireAuth, requireCapability('users:view')],
      schema: {
        tags: ['Users'],
        description: 'Get user by ID',
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
              user: userSchema,
              roles: { type: 'array', items: roleSchema }
            }
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

        const roles = await User.getRoles(user.id);

        return reply.send({
          user,
          roles
        });
      } catch (error) {
        logger.error('Get user error', { userId: request.params.id, error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/users/me/notifications
   * Toggle email notifications for saved searches
   */
  fastify.patch(
    '/me/notifications',
    {
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('notifications:manage-own')],
      schema: {
        tags: ['Users'],
        description: 'Turn saved-search alert emails on or off',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              email_notifications_enabled: { type: 'boolean' }
            }
          }
        },
        body: {
          type: 'object',
          required: ['email_notifications_enabled'],
          additionalProperties: false,
          properties: {
            email_notifications_enabled: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { email_notifications_enabled } = request.body;

        await User.updateNotificationPreferences(request.user.id, email_notifications_enabled);

        return reply.send({
          success: true,
          email_notifications_enabled
        });
      } catch (error) {
        logger.error('Update notification preferences error', {
          userId: request.user.id,
          error: error.message
        });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update notification preferences'
        });
      }
    }
  );
}

module.exports = userRoutes;

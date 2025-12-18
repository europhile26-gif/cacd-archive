/**
 * User Routes
 * Handles user profile management
 */

const User = require('../../models/User');
const { requireAuth, requireCapability } = require('../middleware/auth');

async function userRoutes(fastify, _options) {
  /**
   * GET /api/v1/users/me
   * Get current user's profile
   */
  fastify.get(
    '/me',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['Users'],
        description: 'Get current user profile',
        response: {
          200: {
            type: 'object',
            properties: {
              user: { type: 'object' }
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

        return reply.send({
          user: {
            ...request.user,
            roles,
            capabilities
          }
        });
      } catch (error) {
        fastify.log.error({ error }, 'Get user profile error');
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
          properties: {
            name: { type: 'string', minLength: 1 }
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
        const updates = request.body;

        const user = await User.update(request.user.id, updates);

        return reply.send({
          success: true,
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Update user profile error');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
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
              user: { type: 'object' },
              roles: { type: 'array' }
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
        fastify.log.error({ error }, 'Get user error');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user'
        });
      }
    }
  );
}

module.exports = userRoutes;

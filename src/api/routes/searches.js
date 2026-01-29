/**
 * Saved Searches API Routes
 * Endpoints for managing user's saved search queries
 */

const SavedSearch = require('../../models/SavedSearch');
const { requireAuth } = require('../middleware/auth');

/**
 * Register saved search routes
 * @param {FastifyInstance} fastify
 * @param {Object} options
 */
async function savedSearchRoutes(fastify, _options) {
  /**
   * GET /api/v1/searches
   * List all saved searches for authenticated user
   */
  fastify.get(
    '/searches',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['searches'],
        summary: 'List user saved searches',
        description: 'Get all saved searches for the authenticated user'
      }
    },
    async (request, reply) => {
      try {
        const searches = await SavedSearch.listByUser(request.user.id);
        return reply.send({ searches });
      } catch (error) {
        console.error('Error fetching saved searches:', error);
        request.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch saved searches',
          message: error.message
        });
      }
    }
  );

  /**
   * GET /api/v1/searches/:id
   * Get a single saved search
   */
  fastify.get(
    '/searches/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['searches'],
        summary: 'Get saved search by ID',
        description: 'Get a specific saved search by ID',
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
        const search = await SavedSearch.findById(parseInt(id, 10), request.user.id);

        if (!search) {
          return reply.status(404).send({
            error: 'Saved search not found'
          });
        }

        return reply.send({ search });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          error: 'Failed to fetch saved search'
        });
      }
    }
  );

  /**
   * POST /api/v1/searches
   * Create a new saved search
   */
  fastify.post(
    '/searches',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['searches'],
        summary: 'Create saved search',
        description: 'Create a new saved search for the authenticated user',
        body: {
          type: 'object',
          required: ['search_text'],
          properties: {
            search_text: {
              type: 'string',
              minLength: parseInt(process.env.SAVED_SEARCH_MIN_LENGTH || '3', 10),
              maxLength: parseInt(process.env.SAVED_SEARCH_MAX_LENGTH || '255', 10)
            },
            enabled: { type: 'boolean', default: true }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { search_text, enabled = true } = request.body;

        const search = await SavedSearch.create(request.user.id, search_text, enabled);

        return reply.status(201).send({ search });
      } catch (error) {
        request.log.error(error);

        // Handle validation errors
        if (
          error.message.includes('at least') ||
          error.message.includes('exceed') ||
          error.message.includes('Maximum')
        ) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({
          error: 'Failed to create saved search'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/searches/:id
   * Update a saved search
   */
  fastify.patch(
    '/searches/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['searches'],
        summary: 'Update saved search',
        description: 'Update search text or enabled status',
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
            search_text: {
              type: 'string',
              minLength: parseInt(process.env.SAVED_SEARCH_MIN_LENGTH || '3', 10),
              maxLength: parseInt(process.env.SAVED_SEARCH_MAX_LENGTH || '255', 10)
            },
            enabled: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const updates = request.body;

        const search = await SavedSearch.update(parseInt(id, 10), request.user.id, updates);

        return reply.send({ search });
      } catch (error) {
        request.log.error(error);

        if (error.message === 'Saved search not found') {
          return reply.status(404).send({ error: error.message });
        }

        if (error.message.includes('at least') || error.message.includes('exceed')) {
          return reply.status(400).send({ error: error.message });
        }

        return reply.status(500).send({
          error: 'Failed to update saved search'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/searches/:id
   * Delete a saved search
   */
  fastify.delete(
    '/searches/:id',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['searches'],
        summary: 'Delete saved search',
        description: 'Delete a saved search',
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

        await SavedSearch.delete(parseInt(id, 10), request.user.id);

        return reply.status(204).send();
      } catch (error) {
        request.log.error(error);

        if (error.message === 'Saved search not found') {
          return reply.status(404).send({ error: error.message });
        }

        return reply.status(500).send({
          error: 'Failed to delete saved search'
        });
      }
    }
  );
}

module.exports = savedSearchRoutes;

/**
 * Saved Searches API Routes
 * Endpoints for managing user's saved search queries
 */

const SavedSearch = require('../../models/SavedSearch');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const { requireAuth, requireCapability } = require('../middleware/auth');

const savedSearchSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    search_text: { type: 'string' },
    enabled: { type: 'boolean' },
    future_only: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  }
};

const singleSearchResponse = {
  type: 'object',
  properties: { search: savedSearchSchema }
};

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
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('searches:view-own')],
      schema: {
        tags: ['Saved Searches'],
        summary: 'List user saved searches',
        description: 'Get all saved searches for the authenticated user',
        response: {
          200: {
            type: 'object',
            properties: { searches: { type: 'array', items: savedSearchSchema } }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const searches = await SavedSearch.listByUser(request.user.id);
        return reply.send({ searches });
      } catch (error) {
        logger.error('List saved searches error', {
          userId: request.user.id,
          error: error.message
        });
        return reply.status(500).send({
          error: 'Failed to fetch saved searches'
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
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('searches:view-own')],
      schema: {
        tags: ['Saved Searches'],
        summary: 'Get saved search by ID',
        response: { 200: singleSearchResponse },
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
        logger.error('Get saved search error', { userId: request.user.id, error: error.message });
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
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('searches:create')],
      schema: {
        tags: ['Saved Searches'],
        summary: 'Create saved search',
        response: { 201: singleSearchResponse },
        description: 'Create a new saved search for the authenticated user',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['search_text'],
          properties: {
            search_text: {
              type: 'string',
              minLength: config.savedSearches.minLength,
              maxLength: config.savedSearches.maxLength
            },
            enabled: { type: 'boolean', default: true },
            future_only: { type: 'boolean', default: false }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { search_text, enabled = true, future_only = false } = request.body;

        const search = await SavedSearch.create(request.user.id, search_text, enabled, future_only);

        return reply.status(201).send({ search });
      } catch (error) {
        // Handle validation errors
        if (
          error.message.includes('at least') ||
          error.message.includes('exceed') ||
          error.message.includes('Maximum')
        ) {
          return reply.status(400).send({ error: error.message });
        }

        logger.error('Create saved search error', {
          userId: request.user.id,
          error: error.message
        });
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
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('searches:edit-own')],
      schema: {
        tags: ['Saved Searches'],
        summary: 'Update saved search',
        response: { 200: singleSearchResponse },
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
          additionalProperties: false,
          properties: {
            search_text: {
              type: 'string',
              minLength: config.savedSearches.minLength,
              maxLength: config.savedSearches.maxLength
            },
            enabled: { type: 'boolean' },
            future_only: { type: 'boolean' }
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
        if (error.message === 'Saved search not found') {
          return reply.status(404).send({ error: error.message });
        }

        if (
          error.message.includes('at least') ||
          error.message.includes('exceed') ||
          error.message === 'No valid fields to update'
        ) {
          return reply.status(400).send({ error: error.message });
        }

        logger.error('Update saved search error', {
          userId: request.user.id,
          error: error.message
        });
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
      config: { apiKey: true },
      preHandler: [requireAuth, requireCapability('searches:delete-own')],
      schema: {
        tags: ['Saved Searches'],
        summary: 'Delete saved search',
        description: 'Delete a saved search',
        response: { 204: { type: 'null', description: 'Deleted' } },
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
        if (error.message === 'Saved search not found') {
          return reply.status(404).send({ error: error.message });
        }

        logger.error('Delete saved search error', {
          userId: request.user.id,
          error: error.message
        });
        return reply.status(500).send({
          error: 'Failed to delete saved search'
        });
      }
    }
  );
}

module.exports = savedSearchRoutes;

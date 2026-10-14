const { query } = require('../../config/database');
const { version } = require('../../../package.json');
const logger = require('../../utils/logger');

async function healthRoutes(fastify, _options) {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        description: 'Health check endpoint',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              status: { type: 'string' },
              version: { type: 'string' },
              database: { type: 'string' },
              uptime: { type: 'number' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (_request, _reply) => {
      let databaseStatus = 'disconnected';

      try {
        await query('SELECT 1');
        databaseStatus = 'connected';
      } catch (error) {
        logger.error('Database health check failed', { error: error.message });
      }

      return {
        success: true,
        status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
        version,
        database: databaseStatus,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };
    }
  );
}

module.exports = healthRoutes;

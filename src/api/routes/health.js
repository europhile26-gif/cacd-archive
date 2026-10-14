const { query } = require('../../config/database');
const { version } = require('../../../package.json');
const logger = require('../../utils/logger');

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

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
    async (request, _reply) => {
      let databaseStatus = 'disconnected';

      try {
        await query('SELECT 1');
        databaseStatus = 'connected';
      } catch (error) {
        logger.error('Database health check failed', { error: error.message });
      }

      const health = {
        success: true,
        status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
        database: databaseStatus,
        timestamp: new Date().toISOString()
      };

      // Exact version and uptime help scanners; only the host itself is told them.
      if (LOOPBACK_ADDRESSES.includes(request.ip)) {
        health.version = version;
        health.uptime = process.uptime();
      }

      return health;
    }
  );
}

module.exports = healthRoutes;

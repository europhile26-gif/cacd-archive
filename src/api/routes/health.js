const { query } = require('../../config/database');

async function healthRoutes(fastify, options) {
  fastify.get('/health', {
    schema: {
      tags: ['system'],
      description: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
            database: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    let databaseStatus = 'disconnected';
    
    try {
      await query('SELECT 1');
      databaseStatus = 'connected';
    } catch (error) {
      fastify.log.error('Database health check failed:', error);
    }
    
    return {
      success: true,
      status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
      database: databaseStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
}

module.exports = healthRoutes;

const config = require('../../config/config');

module.exports = async function (fastify) {
  // Get public configuration
  fastify.get(
    '/config',
    {
      schema: {
        description: 'Get public application configuration',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              recordsPerPage: { type: 'number' }
            }
          }
        }
      }
    },
    async () => {
      return {
        recordsPerPage: config.frontend.recordsPerPage
      };
    }
  );
};

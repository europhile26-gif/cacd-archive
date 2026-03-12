const config = require('../../config/config');
const { query } = require('../../config/database');

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

  // Get enabled data sources (public — for filter dropdowns)
  fastify.get(
    '/data-sources',
    {
      schema: {
        description: 'Get list of enabled data sources',
        tags: ['System']
      }
    },
    async () => {
      const sources = await query(
        'SELECT id, slug, display_name, show_by_default FROM data_sources WHERE enabled = 1 ORDER BY id'
      );
      return { sources };
    }
  );
};

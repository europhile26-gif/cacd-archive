/**
 * Analytics Routes
 * Read-only aggregations over the request log, for the /analytics page.
 * Gated on the system:analytics capability rather than the administrator role, so
 * access to IP addresses and pseudo-session data can be granted independently of
 * the wider admin surface.
 */

const analyticsQueryService = require('../../services/analytics-query-service');
const analyticsService = require('../../services/analytics-service');
const config = require('../../config/config');
const { requireAuth, requireCapability } = require('../middleware/auth');

const ANALYTICS_CAPABILITY = 'system:analytics';

async function analyticsRoutes(fastify, _options) {
  /**
   * GET /api/v1/admin/analytics/summary
   * Headline counters, the daily series, and the top-N breakdowns.
   */
  fastify.get(
    '/summary',
    {
      preHandler: [requireAuth, requireCapability(ANALYTICS_CAPABILITY)],
      schema: {
        tags: ['Analytics'],
        description: 'Aggregated request analytics for a rolling window',
        querystring: {
          type: 'object',
          properties: {
            days: {
              type: 'integer',
              minimum: 1,
              maximum: analyticsQueryService.MAX_RANGE_DAYS,
              default: analyticsQueryService.DEFAULT_RANGE_DAYS
            }
          }
        }
      }
    },
    async (request) => {
      const summary = await analyticsQueryService.getSummary(request.query.days);

      return {
        success: true,
        // The page needs to explain itself when the table is empty but collection
        // has only just been switched on.
        collecting: config.analytics.enabled,
        retentionDays: config.analytics.retentionDays,
        data: summary
      };
    }
  );

  /**
   * GET /api/v1/admin/analytics/requests
   * Paginated raw log with filters.
   */
  fastify.get(
    '/requests',
    {
      preHandler: [requireAuth, requireCapability(ANALYTICS_CAPABILITY)],
      schema: {
        tags: ['Analytics'],
        description: 'Paginated request log with optional filters',
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: analyticsQueryService.MAX_RANGE_DAYS },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            ip: { type: 'string' },
            country: { type: 'string', minLength: 2, maxLength: 2 },
            asn: { type: 'integer' },
            status: { type: 'integer' },
            method: { type: 'string' },
            route: { type: 'string' },
            fingerprint: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const result = await analyticsQueryService.getRequests(request.query);

      return { success: true, ...result };
    }
  );

  /**
   * GET /api/v1/admin/analytics/sessions/:fingerprint
   * Every request sharing a fingerprint, in order — the pseudo-session view.
   */
  fastify.get(
    '/sessions/:fingerprint',
    {
      preHandler: [requireAuth, requireCapability(ANALYTICS_CAPABILITY)],
      schema: {
        tags: ['Analytics'],
        description: 'Requests grouped into one pseudo-session by fingerprint',
        params: {
          type: 'object',
          properties: {
            fingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' }
          },
          required: ['fingerprint']
        },
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: analyticsQueryService.MAX_RANGE_DAYS }
          }
        }
      }
    },
    async (request) => {
      const session = await analyticsQueryService.getSession(
        request.params.fingerprint,
        request.query.days
      );

      return { success: true, ...session };
    }
  );

  /**
   * GET /api/v1/admin/analytics/status
   * Whether collection is on, and what the buffer is doing.
   */
  fastify.get(
    '/status',
    {
      preHandler: [requireAuth, requireCapability(ANALYTICS_CAPABILITY)],
      schema: {
        tags: ['Analytics'],
        description: 'Analytics collection status'
      }
    },
    async () => ({
      success: true,
      data: {
        enabled: config.analytics.enabled,
        retentionDays: config.analytics.retentionDays,
        excludedRoutes: config.analytics.excludeRoutes,
        respectDoNotTrack: config.analytics.respectDoNotTrack,
        blockedCountries: config.geoip.blockedCountries,
        buffer: analyticsService.getStatus()
      }
    })
  );
}

module.exports = analyticsRoutes;

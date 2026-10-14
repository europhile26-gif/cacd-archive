const { query } = require('../../config/database');
const { buildHearingSearchFilter } = require('../../utils/search-filter');

const hearingSchema = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    listDate: { type: 'string' },
    caseNumber: { type: 'string' },
    time: { type: ['string', 'null'] },
    hearingDateTime: { type: ['string', 'null'] },
    venue: { type: ['string', 'null'] },
    judge: { type: ['string', 'null'] },
    caseDetails: { type: ['string', 'null'] },
    hearingType: { type: ['string', 'null'] },
    additionalInformation: { type: ['string', 'null'] },
    crownCourt: { type: ['string', 'null'] },
    reportingRestriction: { type: ['string', 'null'] },
    division: { type: 'string' },
    dataSourceName: { type: 'string' },
    sourceUrl: { type: 'string' },
    scrapedAt: { type: 'string' }
  }
};

/**
 * Maps a hearings row (joined with its data source name) to the API shape.
 */
function formatHearing(row) {
  return {
    id: row.id,
    listDate: row.list_date,
    caseNumber: row.case_number,
    time: row.time,
    hearingDateTime: row.hearing_datetime,
    venue: row.venue,
    judge: row.judge,
    caseDetails: row.case_details,
    hearingType: row.hearing_type,
    additionalInformation: row.additional_information,
    crownCourt: row.crown_court,
    reportingRestriction: row.reporting_restriction,
    division: row.division,
    dataSourceName: row.data_source_name,
    sourceUrl: row.source_url,
    scrapedAt: row.scraped_at
  };
}

async function hearingsRoutes(fastify, _options) {
  // GET /api/v1/hearings
  fastify.get(
    '/hearings',
    {
      config: { apiKey: true },
      schema: {
        tags: ['Hearings'],
        description: 'Get list of hearings with filtering and pagination',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            date: { type: 'string', format: 'date' },
            dateFrom: { type: 'string', format: 'date' },
            dateTo: { type: 'string', format: 'date' },
            caseNumber: { type: 'string', maxLength: 64 },
            search: { type: 'string', maxLength: 255 },
            division: { type: 'string', maxLength: 64 },
            dataSource: { type: 'string', maxLength: 255 },
            sortBy: {
              type: 'string',
              enum: ['hearing_datetime', 'case_number', 'created_at'],
              default: 'hearing_datetime'
            },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: hearingSchema
              },
              pagination: {
                type: 'object',
                properties: {
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  total: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, _reply) => {
      const {
        limit = 50,
        offset = 0,
        date,
        dateFrom,
        dateTo,
        caseNumber,
        search,
        division,
        dataSource,
        sortBy = 'hearing_datetime',
        sortOrder = 'desc'
      } = request.query;

      // Build query
      let sql = `SELECT h.*, ds.display_name AS data_source_name
        FROM hearings h
        JOIN data_sources ds ON ds.id = h.data_source_id
        WHERE 1=1`;
      const params = [];

      if (date) {
        sql += ' AND h.list_date = ?';
        params.push(date);
      }

      if (dateFrom) {
        sql += ' AND h.list_date >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        sql += ' AND h.list_date <= ?';
        params.push(dateTo);
      }

      if (caseNumber) {
        sql += ' AND h.case_number = ?';
        params.push(caseNumber);
      }

      if (division) {
        sql += ' AND h.division = ?';
        params.push(division);
      }

      if (dataSource) {
        if (dataSource === 'none') {
          sql += ' AND 1=0';
        } else {
          const sourceIds = dataSource
            .split(',')
            .map(Number)
            .filter((n) => n > 0);
          if (sourceIds.length === 1) {
            sql += ' AND h.data_source_id = ?';
            params.push(sourceIds[0]);
          } else if (sourceIds.length > 1) {
            sql += ` AND h.data_source_id IN (${sourceIds.map(() => '?').join(',')})`;
            params.push(...sourceIds);
          }
        }
      }

      if (search) {
        // Exact, case-insensitive phrase match (see utils/search-filter.js).
        const filter = buildHearingSearchFilter(search, 'h.');
        sql += ` AND ${filter.sql}`;
        params.push(...filter.params);
      }

      // Get total count
      const countSql = sql.replace(/SELECT h\.\*.*?FROM/s, 'SELECT COUNT(*) as total FROM');
      const countResult = await query(countSql, params);
      const total = countResult[0].total;

      // Add sorting and pagination (whitelist to prevent SQL injection)
      const allowedSortColumns = {
        hearing_datetime: 'h.hearing_datetime',
        case_number: 'h.case_number',
        created_at: 'h.created_at'
      };
      const allowedSortOrders = { asc: 'ASC', desc: 'DESC' };
      const safeSort = allowedSortColumns[sortBy] || 'h.hearing_datetime';
      const safeOrder = allowedSortOrders[sortOrder] || 'DESC';
      sql += ` ORDER BY ${safeSort} ${safeOrder}`;
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const hearings = await query(sql, params);

      return {
        success: true,
        data: hearings.map(formatHearing),
        pagination: {
          limit,
          offset,
          total
        }
      };
    }
  );

  // GET /api/v1/hearings/:id
  fastify.get(
    '/hearings/:id',
    {
      config: { apiKey: true },
      schema: {
        tags: ['Hearings'],
        description: 'Get single hearing by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: hearingSchema
            }
          }
        }
      }
    },
    async (request, reply) => {
      const hearings = await query(
        `SELECT h.*, ds.display_name AS data_source_name
         FROM hearings h
         JOIN data_sources ds ON ds.id = h.data_source_id
         WHERE h.id = ?`,
        [request.params.id]
      );

      if (hearings.length === 0) {
        reply.code(404);
        return {
          success: false,
          error: 'Hearing not found'
        };
      }

      return {
        success: true,
        data: formatHearing(hearings[0])
      };
    }
  );

  // GET /api/v1/dates
  fastify.get(
    '/dates',
    {
      config: { apiKey: true },
      schema: {
        tags: ['Hearings'],
        description: 'Get the 100 most recent list date and division pairs with hearing counts',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string', format: 'date' },
                    division: { type: 'string' },
                    count: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (_request, _reply) => {
      const dates = await query(`
      SELECT 
        list_date as date,
        division,
        COUNT(*) as count
      FROM hearings
      GROUP BY list_date, division
      ORDER BY list_date DESC
      LIMIT 100
    `);

      return {
        success: true,
        data: dates
      };
    }
  );
}

module.exports = hearingsRoutes;

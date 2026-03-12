const { query } = require('../../config/database');

async function hearingsRoutes(fastify, _options) {
  // GET /api/v1/hearings
  fastify.get(
    '/hearings',
    {
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
            caseNumber: { type: 'string' },
            search: { type: 'string' },
            division: { type: 'string' },
            dataSource: { type: 'string' },
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
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    listDate: { type: 'string' },
                    caseNumber: { type: 'string' },
                    time: { type: 'string' },
                    hearingDateTime: { type: 'string' },
                    venue: { type: 'string' },
                    judge: { type: 'string' },
                    caseDetails: { type: 'string' },
                    hearingType: { type: 'string' },
                    additionalInformation: { type: 'string' },
                    crownCourt: { type: 'string' },
                    division: { type: 'string' },
                    dataSourceName: { type: 'string' },
                    sourceUrl: { type: 'string' },
                    scrapedAt: { type: 'string' }
                  }
                }
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
        sql +=
          ' AND (MATCH(h.case_details, h.hearing_type, h.additional_information, h.judge, h.venue) AGAINST(? IN NATURAL LANGUAGE MODE) OR h.case_number LIKE ?)';
        params.push(search, `%${search}%`);
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

      // Format response
      const formattedHearings = hearings.map((h) => ({
        id: h.id,
        listDate: h.list_date,
        caseNumber: h.case_number,
        time: h.time,
        hearingDateTime: h.hearing_datetime,
        venue: h.venue,
        judge: h.judge,
        caseDetails: h.case_details,
        hearingType: h.hearing_type,
        additionalInformation: h.additional_information,
        crownCourt: h.crown_court,
        division: h.division,
        dataSourceName: h.data_source_name,
        sourceUrl: h.source_url,
        scrapedAt: h.scraped_at
      }));

      return {
        success: true,
        data: formattedHearings,
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
      schema: {
        tags: ['Hearings'],
        description: 'Get single hearing by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer' }
          },
          required: ['id']
        }
      }
    },
    async (request, reply) => {
      const hearings = await query('SELECT * FROM hearings WHERE id = ?', [request.params.id]);

      if (hearings.length === 0) {
        reply.code(404);
        return {
          success: false,
          error: 'Hearing not found'
        };
      }

      const h = hearings[0];
      return {
        success: true,
        data: {
          id: h.id,
          listDate: h.list_date,
          caseNumber: h.case_number,
          time: h.time,
          hearingDateTime: h.hearing_datetime,
          venue: h.venue,
          judge: h.judge,
          caseDetails: h.case_details,
          hearingType: h.hearing_type,
          additionalInformation: h.additional_information,
          division: h.division,
          sourceUrl: h.source_url,
          scrapedAt: h.scraped_at
        }
      };
    }
  );

  // GET /api/v1/dates
  fastify.get(
    '/dates',
    {
      schema: {
        tags: ['Hearings'],
        description: 'Get list of available dates with hearing counts'
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

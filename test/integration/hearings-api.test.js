/**
 * Tests the public hearings endpoints return every field, including reporting restrictions.
 */
const { createServer } = require('../../src/api/server');
const { query, closePool } = require('../helpers/db');

const RESTRICTION = 'S.71 Criminal Justice Act 2003 applies';
// Unique to this file: test files run in parallel against one database.
const CASE_NUMBER = '209900392 Z4';

/**
 * Inserts one fixed-for-hearing record and returns its id.
 */
async function insertRestrictedHearing() {
  const sources = await query("SELECT id FROM data_sources WHERE slug = 'future_hearing_list'");
  const result = await query(
    `INSERT INTO hearings (list_date, case_number, time, hearing_datetime,
      venue, case_details, crown_court, reporting_restriction, division, data_source_id,
      source_url, scraped_at)
     VALUES ('2026-10-30', ?, '10am', '2026-10-30 10:00:00',
      'RCJ - Court 7', 'R v TGR', 'IPSWICH', ?, 'Criminal', ?, 'https://example.invalid/fhl', NOW())`,
    [CASE_NUMBER, RESTRICTION, sources[0].id]
  );

  return result.insertId;
}

describe('hearings API', () => {
  let server;
  let hearingId;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
    await query('DELETE FROM hearings WHERE case_number = ?', [CASE_NUMBER]);
    hearingId = await insertRestrictedHearing();
  });

  afterAll(async () => {
    await query('DELETE FROM hearings WHERE id = ?', [hearingId]);
    await server.close();
    await closePool();
  });

  test('list includes the reporting restriction', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/hearings?caseNumber=${encodeURIComponent(CASE_NUMBER)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      caseNumber: CASE_NUMBER,
      crownCourt: 'IPSWICH',
      reportingRestriction: RESTRICTION,
      dataSourceName: 'Future Hearing List'
    });
  });

  test('detail returns the same fields as the list', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/v1/hearings/${hearingId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: hearingId,
      crownCourt: 'IPSWICH',
      reportingRestriction: RESTRICTION,
      dataSourceName: 'Future Hearing List'
    });
  });

  test('unknown hearing returns 404', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/v1/hearings/999999999' });

    expect(response.statusCode).toBe(404);
  });

  test('rejects an oversized search term', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/hearings?search=${'a'.repeat(256)}`
    });

    expect(response.statusCode).toBe(400);
  });
});

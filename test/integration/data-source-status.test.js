const { listSourcesWithLastScrape } = require('../../src/services/data-source-service');
const { toStatusJson } = require('../../src/cli/commands/scraper');
const { query, closePool, truncateTables } = require('../helpers/db');

let fhlSourceId;

/**
 * Insert a scrape_history row for the FHL source
 */
async function insertScrape(status, startedAt, extra = {}) {
  await query(
    `INSERT INTO scrape_history (scrape_type, data_source_id, status, started_at, duration_ms,
       records_added, records_updated, records_deleted, error_message, error_details)
     VALUES ('scheduled', ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      fhlSourceId,
      status,
      startedAt,
      extra.durationMs || 300,
      extra.added || 0,
      extra.deleted || 0,
      extra.errorMessage || null,
      extra.errorDetails ? JSON.stringify(extra.errorDetails) : null
    ]
  );
}

/**
 * Find the FHL row in the status listing
 */
async function fhlStatus() {
  const sources = await listSourcesWithLastScrape();
  return sources.find((source) => source.id === fhlSourceId);
}

beforeAll(async () => {
  const rows = await query("SELECT id FROM data_sources WHERE slug = 'future_hearing_list'");
  fhlSourceId = rows[0].id;
});

beforeEach(async () => {
  await truncateTables(['scrape_history', 'hearings']);
});

afterAll(async () => {
  await closePool();
});

describe('listSourcesWithLastScrape', () => {
  test('reports a source that has never been scraped', async () => {
    const source = await fhlStatus();

    expect(source.last_scrape_status).toBeNull();
    expect(source.last_success_at).toBeNull();
    expect(Number(source.hearing_count)).toBe(0);
    expect(toStatusJson(source).last_scrape).toBeNull();
  });

  test('reports the latest scrape, the last success and the network cause', async () => {
    await insertScrape('success', '2026-11-24 19:03:00', { added: 43, deleted: 56 });
    await insertScrape('failed', '2026-11-25 07:03:00', {
      errorMessage: 'fetch failed',
      errorDetails: { name: 'TypeError', cause: { code: 'ENOTFOUND', message: 'getaddrinfo' } }
    });

    const status = toStatusJson(await fhlStatus());

    expect(status.last_scrape).toMatchObject({
      status: 'failed',
      error: 'fetch failed',
      error_cause: 'ENOTFOUND'
    });
    expect(status.last_success_at).toBe(new Date('2026-11-24T19:03:00').toISOString());
  });

  test('counts the hearings stored for the source', async () => {
    await query(
      `INSERT INTO hearings (list_date, case_number, time, hearing_datetime, division,
         data_source_id, source_url, scraped_at)
       VALUES ('2026-12-01', '202600001 A1', '10:30am', '2026-12-01 10:30:00', 'Criminal',
         ?, 'http://test.example.com', NOW())`,
      [fhlSourceId]
    );

    expect((await fhlStatus()).hearing_count).toBe(1);
  });
});

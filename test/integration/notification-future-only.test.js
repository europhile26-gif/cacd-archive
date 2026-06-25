/**
 * Tests the future_only flag on saved-search matching.
 * runSearch(text, true) must drop hearings whose start time has already passed,
 * comparing hearing_datetime (a UTC instant) against UTC_TIMESTAMP().
 * Runs against the migrated test database.
 */
const { format } = require('date-fns');
const { query, closePool, clearHearings } = require('../helpers/db');
const notificationService = require('../../src/services/notification-service');

const PHRASE = 'ZZ Future Filter Marker';

// Format a JS Date as a MySQL DATETIME string in UTC components, matching how
// hearing_datetime is stored by sync-service (combineDateTime -> UTC instant).
function toUtcMysql(date) {
  return format(
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
      )
    ),
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}

async function insertHearing(listDate, hearingDatetime, caseNumber, time) {
  await query(
    `INSERT INTO hearings (list_date, case_number, time, hearing_datetime,
      venue, judge, case_details, hearing_type, additional_information,
      crown_court, reporting_restriction, division, data_source_id,
      source_url, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      listDate,
      caseNumber,
      time,
      hearingDatetime,
      'RCJ - Court 1',
      'Lord Justice Test',
      `R v ${PHRASE}`,
      'Application',
      null,
      null,
      null,
      'Criminal',
      sourceId,
      'http://example.com'
    ]
  );
}

let sourceId;

beforeAll(async () => {
  const rows = await query("SELECT id FROM data_sources WHERE slug = 'daily_cause_list'");
  sourceId = rows[0].id;
});

afterAll(async () => {
  await clearHearings();
  await closePool();
});

describe('notificationService.runSearch future_only', () => {
  beforeEach(async () => {
    await clearHearings();

    // list_date uses the same window the matcher computes (server-local today).
    const today = format(new Date(), 'yyyy-MM-dd');

    // Use the DB's own clock so past/future are unambiguous regardless of the
    // server timezone. hearing_datetime is a UTC instant.
    const [{ now }] = await query('SELECT UTC_TIMESTAMP() AS now');
    const nowMs = new Date(`${toUtcMysql(new Date(now))}Z`).getTime();

    const past = toUtcMysql(new Date(nowMs - 2 * 60 * 60 * 1000));
    const future = toUtcMysql(new Date(nowMs + 2 * 60 * 60 * 1000));

    await insertHearing(today, past, '2024 0001 A1', '08:30am');
    await insertHearing(today, future, '2024 0002 A1', '04:30pm');
  });

  test('without future_only, matches both past and future hearings', async () => {
    const matches = await notificationService.runSearch(PHRASE, false);
    expect(matches).toHaveLength(2);
  });

  test('with future_only, drops the hearing that has already started', async () => {
    const matches = await notificationService.runSearch(PHRASE, true);
    expect(matches).toHaveLength(1);
  });

  test('defaults to matching everything when the flag is omitted', async () => {
    const matches = await notificationService.runSearch(PHRASE);
    expect(matches).toHaveLength(2);
  });
});

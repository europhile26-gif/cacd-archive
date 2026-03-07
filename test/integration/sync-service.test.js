const { synchronizeRecords } = require('../../src/services/sync-service');
const { query, closePool, clearHearings } = require('../helpers/db');

afterAll(async () => {
  await closePool();
});

describe('sync-service', () => {
  beforeEach(async () => {
    await clearHearings();
  });

  function makeRecord(overrides = {}) {
    return {
      listDate: '2025-12-11',
      'case number': '202403891 A1',
      time: '10:30am',
      hearingDateTime: '2025-12-11T10:30:00',
      venue: 'RCJ - Court 5',
      judge: 'Lord Justice Males',
      'case details': 'R v ZDX',
      'hearing type': 'FC Application Sentence',
      'additional information': '',
      division: 'Criminal',
      sourceUrl: 'http://test.example.com',
      scrapedAt: new Date().toISOString(),
      ...overrides
    };
  }

  test('inserts new records', async () => {
    const records = [
      makeRecord(),
      makeRecord({ 'case number': '202503277 A5', 'case details': 'Robert McCalla' })
    ];

    const result = await synchronizeRecords(records, '2025-12-11');

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);

    const rows = await query('SELECT * FROM hearings WHERE list_date = ?', ['2025-12-11']);
    expect(rows.length).toBe(2);
  });

  test('updates changed records', async () => {
    const records = [makeRecord()];
    await synchronizeRecords(records, '2025-12-11');

    // Change the judge
    const updated = [makeRecord({ judge: 'Lady Justice Carr' })];
    const result = await synchronizeRecords(updated, '2025-12-11');

    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);
    expect(result.deleted).toBe(0);

    const rows = await query('SELECT judge FROM hearings WHERE list_date = ?', ['2025-12-11']);
    expect(rows[0].judge).toBe('Lady Justice Carr');
  });

  test('deletes records not in new scrape', async () => {
    const records = [makeRecord(), makeRecord({ 'case number': '202503277 A5' })];
    await synchronizeRecords(records, '2025-12-11');

    // Second sync only has one record
    const result = await synchronizeRecords([makeRecord()], '2025-12-11');

    expect(result.deleted).toBe(1);
    expect(result.added).toBe(0);

    const rows = await query('SELECT * FROM hearings WHERE list_date = ?', ['2025-12-11']);
    expect(rows.length).toBe(1);
  });

  test('handles empty input gracefully', async () => {
    const result = await synchronizeRecords([], '2025-12-11');
    expect(result.success).toBe(true);
    expect(result.added).toBe(0);
  });

  test('deduplicates records by composite key', async () => {
    // Two records with the same key — should keep last occurrence
    const records = [
      makeRecord({ 'case details': 'First version' }),
      makeRecord({ 'case details': 'Second version' })
    ];

    const result = await synchronizeRecords(records, '2025-12-11');
    expect(result.added).toBe(1);

    const rows = await query('SELECT case_details FROM hearings WHERE list_date = ?', [
      '2025-12-11'
    ]);
    expect(rows[0].case_details).toBe('Second version');
  });

  test('bulk insert handles multiple records efficiently', async () => {
    // Generate 50 records with unique case numbers
    const records = [];
    for (let i = 0; i < 50; i++) {
      records.push(
        makeRecord({
          'case number': `20250${String(i).padStart(4, '0')} A1`
        })
      );
    }

    const result = await synchronizeRecords(records, '2025-12-11');
    expect(result.added).toBe(50);

    const rows = await query('SELECT COUNT(*) as count FROM hearings WHERE list_date = ?', [
      '2025-12-11'
    ]);
    expect(rows[0].count).toBe(50);
  });
});

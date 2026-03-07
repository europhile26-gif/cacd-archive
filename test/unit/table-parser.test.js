const fs = require('fs');
const path = require('path');
const {
  parseTable,
  validateTime,
  combineDateTime,
  createRecordKey,
  mapHeaders
} = require('../../src/scrapers/table-parser');

const FIXTURES = path.join(__dirname, '../fixtures');

describe('table-parser', () => {
  describe('validateTime', () => {
    test('accepts valid 12-hour times', () => {
      expect(validateTime('10:30am')).toBe(true);
      expect(validateTime('2:00pm')).toBe(true);
      expect(validateTime('12:00pm')).toBe(true);
      expect(validateTime('10am')).toBe(true);
      expect(validateTime('2pm')).toBe(true);
    });

    test('rejects invalid times', () => {
      expect(validateTime('13:00am')).toBe(false);
      expect(validateTime('0:00am')).toBe(false);
      expect(validateTime('10:60am')).toBe(false);
      expect(validateTime('abc')).toBe(false);
      expect(validateTime('')).toBe(false);
    });
  });

  describe('combineDateTime', () => {
    test('combines date and time correctly', () => {
      expect(combineDateTime('2025-12-11', '10:30am')).toBe('2025-12-11T10:30:00');
      expect(combineDateTime('2025-12-11', '2:00pm')).toBe('2025-12-11T14:00:00');
      expect(combineDateTime('2025-12-11', '12:00pm')).toBe('2025-12-11T12:00:00');
      expect(combineDateTime('2025-12-11', '12:00am')).toBe('2025-12-11T00:00:00');
    });

    test('handles times without minutes', () => {
      expect(combineDateTime('2025-12-11', '10am')).toBe('2025-12-11T10:00:00');
      expect(combineDateTime('2025-12-11', '2pm')).toBe('2025-12-11T14:00:00');
    });

    test('throws on invalid time format', () => {
      expect(() => combineDateTime('2025-12-11', 'invalid')).toThrow('Invalid time format');
    });
  });

  describe('createRecordKey', () => {
    test('creates key from scraped record (space-delimited field names)', () => {
      const record = { listDate: '2025-12-11', 'case number': '202403891 A1', time: '10:30am' };
      expect(createRecordKey(record)).toBe('2025-12-11|202403891 A1|10:30am');
    });

    test('creates key from database record (snake_case fields)', () => {
      const record = { list_date: '2025-12-11', case_number: '202403891 A1', time: '10:30am' };
      expect(createRecordKey(record)).toBe('2025-12-11|202403891 A1|10:30am');
    });

    test('handles Date objects for list_date', () => {
      const record = {
        list_date: new Date('2025-12-11T00:00:00Z'),
        case_number: '202403891 A1',
        time: '10:30am'
      };
      expect(createRecordKey(record)).toBe('2025-12-11|202403891 A1|10:30am');
    });
  });

  describe('mapHeaders', () => {
    test('maps standard header names to indexes', () => {
      const headers = [
        'venue',
        'judge',
        'time',
        'case number',
        'case details',
        'hearing type',
        'additional information'
      ];
      const map = mapHeaders(headers);
      expect(map).toEqual({
        venue: 0,
        judge: 1,
        time: 2,
        'case number': 3,
        'case details': 4,
        'hearing type': 5,
        'additional information': 6
      });
    });

    test('handles case-insensitive and partial matches', () => {
      const headers = ['Venue Name', 'Presiding Judge', 'Time', 'Case Number'];
      const map = mapHeaders(headers);
      expect(map.venue).toBe(0);
      expect(map.judge).toBe(1);
      expect(map.time).toBe(2);
      expect(map['case number']).toBe(3);
    });
  });

  describe('parseTable', () => {
    test('parses daily cause list fixture correctly', async () => {
      const html = fs.readFileSync(path.join(FIXTURES, 'daily-cause-list.html'), 'utf8');
      const records = await parseTable(html, '2025-12-11', 'http://test.example.com', 'Criminal');

      expect(records).toHaveLength(3);

      // First record — full data
      expect(records[0]['case number']).toBe('202403891 A1');
      expect(records[0].time).toBe('10:30am');
      expect(records[0].venue).toBe('RCJ - Court 5');
      expect(records[0].division).toBe('Criminal');
      expect(records[0].listDate).toBe('2025-12-11');
      expect(records[0].sourceUrl).toBe('http://test.example.com');
      expect(records[0].hearingDateTime).toBe('2025-12-11T10:30:00');

      // Second record — inherits venue and judge from first row
      expect(records[1]['case number']).toBe('202503277 A5');
      expect(records[1].venue).toBe('RCJ - Court 5');
      expect(records[1].judge).toContain('Lord Justice Males');

      // Third record — new venue and judge
      expect(records[2].venue).toBe('RCJ - Court 3');
      expect(records[2].time).toBe('2:00pm');
      expect(records[2].hearingDateTime).toBe('2025-12-11T14:00:00');
    });

    test('returns empty array for empty table', async () => {
      const html = fs.readFileSync(path.join(FIXTURES, 'empty-table.html'), 'utf8');
      const records = await parseTable(html, '2025-12-14', 'http://test.example.com');
      expect(records).toEqual([]);
    });

    test('throws when table element is missing', async () => {
      await expect(
        parseTable(
          '<html><body>No table here</body></html>',
          '2025-12-11',
          'http://test.example.com'
        )
      ).rejects.toThrow('Table with class "govuk-table" not found');
    });
  });
});

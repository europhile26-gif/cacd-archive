const {
  parseHearingDate,
  validateTime,
  combineDateTime,
  parseFHLTable
} = require('../../src/scrapers/fhl-table-parser');

describe('fhl-table-parser', () => {
  describe('parseHearingDate', () => {
    test('parses standard date format', () => {
      expect(parseHearingDate('1 April 2026')).toBe('2026-04-01');
      expect(parseHearingDate('12 March 2026')).toBe('2026-03-12');
      expect(parseHearingDate('31 December 2025')).toBe('2025-12-31');
    });

    test('handles single-digit days', () => {
      expect(parseHearingDate('3 January 2026')).toBe('2026-01-03');
    });

    test('returns null for invalid formats', () => {
      expect(parseHearingDate('2026-04-01')).toBeNull();
      expect(parseHearingDate('April 1, 2026')).toBeNull();
      expect(parseHearingDate('')).toBeNull();
      expect(parseHearingDate('1 Smarch 2026')).toBeNull();
    });
  });

  describe('validateTime', () => {
    test('accepts valid times', () => {
      expect(validateTime('10:30am')).toBe(true);
      expect(validateTime('10am')).toBe(true);
      expect(validateTime('2:00pm')).toBe(true);
      expect(validateTime('9:30am')).toBe(true);
    });

    test('rejects invalid times', () => {
      expect(validateTime('25:00am')).toBe(false);
      expect(validateTime('10:60am')).toBe(false);
      expect(validateTime('noon')).toBe(false);
      expect(validateTime('')).toBe(false);
    });
  });

  describe('combineDateTime', () => {
    test('combines date and time correctly', () => {
      expect(combineDateTime('2026-04-01', '10:30am')).toBe('2026-04-01T10:30:00');
      expect(combineDateTime('2026-04-01', '2:00pm')).toBe('2026-04-01T14:00:00');
      expect(combineDateTime('2026-04-01', '12pm')).toBe('2026-04-01T12:00:00');
      expect(combineDateTime('2026-04-01', '12am')).toBe('2026-04-01T00:00:00');
    });
  });

  describe('parseFHLTable', () => {
    const makeTable = (rows) => `
      <html><body>
        <table>
          <thead>
            <tr>
              <th>Surname</th>
              <th>Forenames</th>
              <th>CAO Reference number</th>
              <th>Hearing Date</th>
              <th>Court</th>
              <th>Time</th>
              <th>Reporting Restriction</th>
              <th>Crown Court</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>
    `;

    test('parses a valid row', async () => {
      const html = makeTable(`
        <tr>
          <td>Smith</td>
          <td>John</td>
          <td>202500054 A4</td>
          <td>10 March 2026</td>
          <td>6</td>
          <td>10:30am</td>
          <td>1992 Sexual Offences Act applies</td>
          <td>Woolwich</td>
        </tr>
      `);

      const records = await parseFHLTable(html, 'http://test.example.com');

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        listDate: '2026-03-10',
        'case number': '202500054 A4',
        time: '10:30am',
        hearingDateTime: '2026-03-10T10:30:00',
        venue: 'RCJ - Court 6',
        'case details': 'Smith, John',
        'crown court': 'Woolwich',
        'reporting restriction': '1992 Sexual Offences Act applies',
        division: 'Criminal',
        sourceUrl: 'http://test.example.com'
      });
    });

    test('handles row with no forenames (R v format)', async () => {
      const html = makeTable(`
        <tr>
          <td>R V OFM</td>
          <td></td>
          <td>202600249 B2</td>
          <td>1 April 2026</td>
          <td>7</td>
          <td>10:30am</td>
          <td></td>
          <td>Swansea</td>
        </tr>
      `);

      const records = await parseFHLTable(html, 'http://test.example.com');

      expect(records).toHaveLength(1);
      expect(records[0]['case details']).toBe('R V OFM');
      expect(records[0]['reporting restriction']).toBeNull();
    });

    test('skips rows with missing critical fields', async () => {
      const html = makeTable(`
        <tr>
          <td>Smith</td>
          <td>John</td>
          <td></td>
          <td>10 March 2026</td>
          <td>6</td>
          <td>10:30am</td>
          <td></td>
          <td>Woolwich</td>
        </tr>
      `);

      const records = await parseFHLTable(html, 'http://test.example.com');
      expect(records).toHaveLength(0);
    });

    test('parses multiple rows', async () => {
      const html = makeTable(`
        <tr>
          <td>Basra</td>
          <td>Onkar</td>
          <td>202500054 A4</td>
          <td>10 March 2026</td>
          <td>6</td>
          <td>10:30am</td>
          <td></td>
          <td>Woolwich</td>
        </tr>
        <tr>
          <td>Beard</td>
          <td>Adam</td>
          <td>202501323 B2</td>
          <td>24 March 2026</td>
          <td>7</td>
          <td>10:30am</td>
          <td></td>
          <td>Isleworth</td>
        </tr>
      `);

      const records = await parseFHLTable(html, 'http://test.example.com');
      expect(records).toHaveLength(2);
      expect(records[0].listDate).toBe('2026-03-10');
      expect(records[1].listDate).toBe('2026-03-24');
    });
  });
});

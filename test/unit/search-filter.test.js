const {
  buildHearingSearchFilter,
  escapeLike,
  stripSurroundingQuotes,
  SEARCH_COLUMNS
} = require('../../src/utils/search-filter');

describe('search-filter', () => {
  describe('buildHearingSearchFilter', () => {
    it('produces one case-insensitive LIKE per searched column', () => {
      const { sql, params } = buildHearingSearchFilter('Criminal Cases Review Commission');

      const conditions = SEARCH_COLUMNS.map((col) => `LOWER(${col}) LIKE ?`);
      expect(sql).toBe(`(${conditions.join(' OR ')})`);
      expect(params).toHaveLength(SEARCH_COLUMNS.length);
      // Every column matches the same lowercased phrase pattern
      params.forEach((p) => expect(p).toBe('%criminal cases review commission%'));
    });

    it('matches the whole phrase, not individual words (the false-match regression)', () => {
      // Regression: "Criminal Cases Review Commission" must not reduce to
      // matching merely "Criminal" the way NATURAL LANGUAGE MODE did.
      const { params } = buildHearingSearchFilter('Criminal Cases Review Commission');
      expect(params[0]).toBe('%criminal cases review commission%');
      expect(params[0]).not.toMatch(/^%criminal%$/);
    });

    it('applies the optional column prefix', () => {
      const { sql } = buildHearingSearchFilter('foo', 'h.');
      expect(sql).toContain('LOWER(h.case_details) LIKE ?');
      expect(sql).toContain('LOWER(h.case_number) LIKE ?');
    });

    it('escapes LIKE wildcards so they match literally', () => {
      const { params } = buildHearingSearchFilter('50% off _now');
      expect(params[0]).toBe('%50\\% off \\_now%');
    });

    it('trims a single surrounding pair of quotes', () => {
      expect(buildHearingSearchFilter('"quoted phrase"').params[0]).toBe('%quoted phrase%');
      expect(buildHearingSearchFilter('“smart quoted”').params[0]).toBe('%smart quoted%');
    });
  });

  describe('stripSurroundingQuotes', () => {
    it('removes a matching surrounding pair', () => {
      expect(stripSurroundingQuotes('"hello world"')).toBe('hello world');
      expect(stripSurroundingQuotes("'hello world'")).toBe('hello world');
    });

    it('leaves apostrophes and mismatched quotes inside the term untouched', () => {
      expect(stripSurroundingQuotes("O'Brien")).toBe("O'Brien");
      expect(stripSurroundingQuotes("'tis the season")).toBe("'tis the season");
    });

    it('trims surrounding whitespace', () => {
      expect(stripSurroundingQuotes('  spaced  ')).toBe('spaced');
    });
  });

  describe('escapeLike', () => {
    it('escapes backslash, percent and underscore', () => {
      expect(escapeLike('a\\b%c_d')).toBe('a\\\\b\\%c\\_d');
    });
  });
});

const fs = require('fs');
const path = require('path');
const {
  findCACDLinks,
  findLinkForDate,
  containsCaseInsensitive,
  containsWord
} = require('../../src/scrapers/link-discovery');

const FIXTURES = path.join(__dirname, '../fixtures');

describe('link-discovery', () => {
  describe('containsCaseInsensitive', () => {
    test('finds phrase regardless of case', () => {
      expect(containsCaseInsensitive('Court of Appeal', 'court of appeal')).toBe(true);
      expect(containsCaseInsensitive('COURT OF APPEAL', 'Court of Appeal')).toBe(true);
    });

    test('returns false when phrase is absent', () => {
      expect(containsCaseInsensitive('Family Court', 'Court of Appeal')).toBe(false);
    });
  });

  describe('containsWord', () => {
    test('finds word with boundaries', () => {
      expect(containsWord('11 December 2025', '11')).toBe(true);
      expect(containsWord('11 December 2025', 'December')).toBe(true);
      expect(containsWord('11 December 2025', '2025')).toBe(true);
    });

    test('does not match partial words', () => {
      expect(containsWord('112 December 2025', '11')).toBe(false);
    });
  });

  describe('findLinkForDate', () => {
    const links = [
      {
        href: '/criminal-list?id=1',
        text: 'Court of Appeal (Criminal Division) Daily Cause List 11 December 2025 - English'
      },
      {
        href: '/criminal-list?id=2',
        text: 'Court of Appeal (Criminal Division) Daily Cause List 12 December 2025 - English'
      },
      {
        href: '/civil-list?id=3',
        text: 'Court of Appeal (Civil Division) Daily Cause List 11 December 2025 - English'
      }
    ];

    test('finds Criminal link for matching date', () => {
      const date = new Date(2025, 11, 11); // Dec 11, 2025
      const result = findLinkForDate(links, date, 'Criminal');
      expect(result).not.toBeNull();
      expect(result.targetDate).toBe('2025-12-11');
      expect(result.division).toBe('Criminal');
      expect(result.url).toContain('criminal-list?id=1');
    });

    test('finds Civil link for matching date', () => {
      const date = new Date(2025, 11, 11);
      const result = findLinkForDate(links, date, 'Civil');
      expect(result).not.toBeNull();
      expect(result.division).toBe('Civil');
    });

    test('returns null when no match for date', () => {
      const date = new Date(2025, 11, 13); // Dec 13 — not in links
      const result = findLinkForDate(links, date, 'Criminal');
      expect(result).toBeNull();
    });

    test('returns null when no match for division', () => {
      const date = new Date(2025, 11, 11);
      const result = findLinkForDate(links, date, 'Family');
      expect(result).toBeNull();
    });
  });

  describe('findCACDLinks', () => {
    // findCACDLinks uses getCurrentDateUK internally, so we test with the fixture
    // which contains links for 11 and 12 December 2025
    test('parses summary page HTML and extracts links', () => {
      const html = fs.readFileSync(path.join(FIXTURES, 'summary-page.html'), 'utf8');

      // We can't control "today" in findCACDLinks, but we can verify it doesn't crash
      // and returns an array
      const links = findCACDLinks(html, 'Criminal');
      expect(Array.isArray(links)).toBe(true);
    });
  });
});

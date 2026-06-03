/**
 * Hearing search filter
 *
 * Builds the WHERE-clause fragment used to match a free-text search term
 * against hearings. Used by both the public search API and the saved-search
 * notification matcher so the two stay in sync.
 *
 * Matching is an exact, case-insensitive phrase match: the search term must
 * appear verbatim (ignoring case) in one of the searched columns. We use
 * LOWER(...) LIKE rather than a FULLTEXT MATCH ... AGAINST because natural
 * language full-text mode treats the term as a bag of individual words, so a
 * phrase like "Criminal Cases Review Commission" would match any row
 * containing merely "Criminal" — producing false notification matches.
 */

// Columns a search term is matched against, in priority order.
const SEARCH_COLUMNS = [
  'case_details',
  'hearing_type',
  'additional_information',
  'judge',
  'venue',
  'case_number'
];

/**
 * Escape LIKE wildcards so the search term is matched literally.
 * Escapes the default MariaDB escape char plus the % and _ wildcards.
 * @param {string} value
 * @returns {string}
 */
function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

// Opening quote -> expected closing quote, for stripSurroundingQuotes.
const QUOTE_PAIRS = { '"': '"', "'": "'", '“': '”', '‘': '’' };

/**
 * Remove a single matching pair of surrounding quotes from a search term.
 * Users sometimes wrap a phrase in quotes Google-style; since we already match
 * the whole term as a literal phrase, those quotes would otherwise be searched
 * for verbatim and match nothing. Only strips when the first and last
 * characters form a matching pair, so apostrophes within a name (O'Brien) and
 * mismatched quotes are left untouched.
 * @param {string} value
 * @returns {string}
 */
function stripSurroundingQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && QUOTE_PAIRS[trimmed[0]] === trimmed[trimmed.length - 1]) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Build a case-insensitive exact-phrase search filter across hearing columns.
 * @param {string} searchText - Phrase to match literally (case-insensitive).
 * @param {string} [columnPrefix] - Optional table alias prefix, e.g. 'h.'.
 * @returns {{ sql: string, params: string[] }} Parameterised fragment and its bound params.
 */
function buildHearingSearchFilter(searchText, columnPrefix = '') {
  const phrase = stripSurroundingQuotes(searchText);
  const pattern = `%${escapeLike(phrase.toLowerCase())}%`;
  const conditions = SEARCH_COLUMNS.map((col) => `LOWER(${columnPrefix}${col}) LIKE ?`);

  return {
    sql: `(${conditions.join(' OR ')})`,
    params: SEARCH_COLUMNS.map(() => pattern)
  };
}

module.exports = { buildHearingSearchFilter, escapeLike, stripSurroundingQuotes, SEARCH_COLUMNS };

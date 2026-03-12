const { query } = require('../config/database');

/**
 * Data Source Service
 * Manages data source configuration from the data_sources table
 */

let sourceCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Get all enabled data sources
 * @returns {Promise<Array>} Enabled data sources
 */
async function getEnabledSources() {
  const now = Date.now();
  if (sourceCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return sourceCache;
  }

  const rows = await query('SELECT * FROM data_sources WHERE enabled = 1 ORDER BY id');

  sourceCache = rows;
  cacheTimestamp = now;

  return rows;
}

/**
 * Get a data source by slug
 * @param {string} slug - Source slug (e.g. 'daily_cause_list')
 * @returns {Promise<Object|null>} Data source or null
 */
async function getSourceBySlug(slug) {
  const sources = await getEnabledSources();
  return sources.find((s) => s.slug === slug) || null;
}

/**
 * Get a data source by ID
 * @param {number} id - Source ID
 * @returns {Promise<Object|null>} Data source or null
 */
async function getSourceById(id) {
  const sources = await getEnabledSources();
  return sources.find((s) => s.id === id) || null;
}

/**
 * Clear the source cache (useful after config changes)
 */
function clearCache() {
  sourceCache = null;
  cacheTimestamp = 0;
}

module.exports = {
  getEnabledSources,
  getSourceBySlug,
  getSourceById,
  clearCache
};

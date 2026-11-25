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
 * List every data source (enabled or not) with its latest scrape and stored hearing count
 * @returns {Promise<Array>} Data sources with last_scrape_* fields
 */
async function listSourcesWithLastScrape() {
  return query(
    `SELECT
      ds.*,
      sh.status AS last_scrape_status,
      sh.started_at AS last_scrape_at,
      sh.duration_ms AS last_scrape_duration_ms,
      sh.records_added AS last_scrape_added,
      sh.records_updated AS last_scrape_updated,
      sh.records_deleted AS last_scrape_deleted,
      sh.error_message AS last_scrape_error,
      JSON_VALUE(sh.error_details, '$.cause.code') AS last_scrape_error_cause,
      (SELECT MAX(started_at) FROM scrape_history
        WHERE data_source_id = ds.id AND status = 'success') AS last_success_at,
      (SELECT COUNT(*) FROM hearings WHERE data_source_id = ds.id) AS hearing_count
    FROM data_sources ds
    LEFT JOIN scrape_history sh ON sh.id = (
      SELECT id FROM scrape_history
      WHERE data_source_id = ds.id
      ORDER BY started_at DESC
      LIMIT 1
    )
    ORDER BY ds.id`
  );
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
  listSourcesWithLastScrape,
  clearCache
};

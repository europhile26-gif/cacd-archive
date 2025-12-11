const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Scrape History Service
 * Tracks scraping attempts and results in the database
 */

/**
 * Record the start of a scrape operation
 * @param {string} scrapeType - Type: 'scheduled', 'startup', 'manual'
 * @param {string} summaryPageUrl - URL of summary page
 * @returns {Promise<number>} Scrape history ID
 */
async function recordScrapeStart(scrapeType, summaryPageUrl) {
  const [result] = await query(
    `INSERT INTO scrape_history (
      scrape_type, status, summary_page_url, started_at
    ) VALUES (?, ?, ?, NOW())`,
    [scrapeType, 'success', summaryPageUrl] // Optimistic, will update if fails
  );

  return result.insertId;
}

/**
 * Update scrape history with completion details
 * @param {number} scrapeId - Scrape history ID
 * @param {Object} result - Scrape result object
 */
async function recordScrapeComplete(scrapeId, result) {
  const status = result.success ? 'success' : 'failed';
  const duration = result.duration || 0;

  await query(
    `UPDATE scrape_history SET
      status = ?,
      links_discovered = ?,
      links_processed = ?,
      records_added = ?,
      records_updated = ?,
      records_deleted = ?,
      summary_page_status = ?,
      completed_at = NOW(),
      duration_ms = ?
    WHERE id = ?`,
    [
      status,
      result.linksProcessed || 0,
      result.syncResults ? result.syncResults.filter((r) => r.success).length : 0,
      result.recordsAdded || 0,
      result.recordsUpdated || 0,
      result.recordsDeleted || 0,
      200, // Assuming success if we got here
      duration,
      scrapeId
    ]
  );

  logger.info('Scrape history updated', {
    scrapeId,
    status,
    duration: `${duration}ms`
  });
}

/**
 * Record scrape failure
 * @param {number} scrapeId - Scrape history ID
 * @param {Error} error - Error object
 */
async function recordScrapeError(scrapeId, error) {
  await query(
    `UPDATE scrape_history SET
      status = ?,
      error_message = ?,
      error_details = ?,
      completed_at = NOW()
    WHERE id = ?`,
    [
      'failed',
      error.message,
      JSON.stringify({
        name: error.name,
        stack: error.stack,
        code: error.code
      }),
      scrapeId
    ]
  );

  logger.error('Scrape history recorded as failed', {
    scrapeId,
    error: error.message
  });
}

/**
 * Get last successful scrape time
 * @returns {Promise<Date|null>} Last scrape time or null
 */
async function getLastSuccessfulScrape() {
  const rows = await query(
    `SELECT started_at 
     FROM scrape_history 
     WHERE status = 'success' 
     ORDER BY started_at DESC 
     LIMIT 1`
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0].started_at;
}

/**
 * Get scrape history statistics
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>} Recent scrape history
 */
async function getRecentScrapes(limit = 10) {
  const rows = await query(
    `SELECT 
      id,
      scrape_type,
      status,
      links_discovered,
      links_processed,
      records_added,
      records_updated,
      records_deleted,
      started_at,
      completed_at,
      duration_ms,
      error_message
    FROM scrape_history 
    ORDER BY started_at DESC 
    LIMIT ?`,
    [limit]
  );

  return rows;
}

/**
 * Check if enough time has passed since last scrape
 * @param {number} intervalHours - Required interval in hours
 * @returns {Promise<boolean>} True if should scrape
 */
async function shouldScrape(intervalHours) {
  const lastScrape = await getLastSuccessfulScrape();

  if (!lastScrape) {
    logger.info('No previous scrapes found, should scrape');
    return true;
  }

  const now = new Date();
  const hoursSince = (now - new Date(lastScrape)) / (1000 * 60 * 60);

  const should = hoursSince >= intervalHours;

  logger.debug('Checking if should scrape', {
    lastScrape: lastScrape.toISOString(),
    hoursSince: hoursSince.toFixed(2),
    intervalHours,
    shouldScrape: should
  });

  return should;
}

module.exports = {
  recordScrapeStart,
  recordScrapeComplete,
  recordScrapeError,
  getLastSuccessfulScrape,
  getRecentScrapes,
  shouldScrape
};

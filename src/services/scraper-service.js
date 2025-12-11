const axios = require('axios');
const { discoverLinks } = require('../scrapers/link-discovery');
const { parseTable } = require('../scrapers/table-parser');
const { synchronizeRecords } = require('./sync-service');
const {
  recordScrapeStart,
  recordScrapeComplete,
  recordScrapeError
} = require('./scrape-history-service');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Scraper Service
 * Orchestrates the workflow: link discovery → fetch HTML → parse table
 */

/**
 * Run full scraping workflow for Criminal Division
 * @param {string} scrapeType - Type of scrape: 'scheduled', 'startup', 'manual'
 * @returns {Promise<Object>} Result with all scraped records
 */
async function scrapeAll(scrapeType = 'manual') {
  logger.info('Starting scraping workflow', { scrapeType });
  const startTime = Date.now();
  let scrapeId;

  try {
    // Record scrape start
    scrapeId = await recordScrapeStart(scrapeType, config.scraping.summaryPageUrl);
    logger.debug('Scrape history record created', { scrapeId });

    // Step 1: Discover links for today and tomorrow
    const linkResult = await discoverLinks('Criminal');

    if (!linkResult.success || linkResult.linksFound.length === 0) {
      logger.info('No links found, nothing to scrape');
      const result = {
        success: true,
        scrapeType,
        linksProcessed: 0,
        recordsAdded: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        duration: Date.now() - startTime,
        syncResults: []
      };

      await recordScrapeComplete(scrapeId, result);
      return result;
    }

    // Step 2: Fetch, parse, and sync each discovered list
    const syncResults = [];

    for (const link of linkResult.linksFound) {
      try {
        logger.info('Processing list', {
          date: link.targetDate,
          url: link.url
        });

        const html = await fetchListHtml(link.url);
        const records = await parseTable(html, link.targetDate, link.url, link.division);

        logger.info('Parsed records, starting sync', {
          date: link.targetDate,
          records: records.length
        });

        // Step 3: Synchronize with database
        const syncResult = await synchronizeRecords(records, link.targetDate);

        syncResults.push({
          date: link.targetDate,
          url: link.url,
          division: link.division,
          ...syncResult
        });

        logger.info('List synchronized successfully', {
          date: link.targetDate,
          added: syncResult.added,
          updated: syncResult.updated,
          deleted: syncResult.deleted
        });
      } catch (error) {
        logger.error('Failed to process list', {
          date: link.targetDate,
          url: link.url,
          error: error.message
        });

        syncResults.push({
          date: link.targetDate,
          url: link.url,
          success: false,
          error: error.message
        });
        // Continue with next list
      }
    }

    const duration = Date.now() - startTime;
    const totalAdded = syncResults.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalUpdated = syncResults.reduce((sum, r) => sum + (r.updated || 0), 0);
    const totalDeleted = syncResults.reduce((sum, r) => sum + (r.deleted || 0), 0);

    const result = {
      success: true,
      scrapeType,
      linksProcessed: linkResult.linksFound.length,
      recordsAdded: totalAdded,
      recordsUpdated: totalUpdated,
      recordsDeleted: totalDeleted,
      duration,
      syncResults
    };

    await recordScrapeComplete(scrapeId, result);

    logger.info('Scraping workflow completed', {
      scrapeType,
      scrapeId,
      linksProcessed: result.linksProcessed,
      listsSuccessful: syncResults.filter((r) => r.success).length,
      totalAdded,
      totalUpdated,
      totalDeleted,
      duration: `${duration}ms`
    });

    return result;
  } catch (error) {
    logger.error('Scraping workflow failed', {
      error: error.message,
      scrapeType,
      scrapeId
    });

    if (scrapeId) {
      await recordScrapeError(scrapeId, error);
    }

    throw error;
  }
}

/**
 * Fetch HTML content from list URL
 * @param {string} url - List URL
 * @returns {Promise<string>} HTML content
 */
async function fetchListHtml(url) {
  const retryDelays = [5000, 10000, 20000];
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      logger.debug(`Fetching list HTML (attempt ${attempt + 1})`, { url });

      const response = await axios.get(url, {
        timeout: config.scraping.requestTimeout || 10000,
        headers: {
          'User-Agent': config.scraping.userAgent || 'CACD-Archive-Bot/1.0'
        }
      });

      if (response.status === 200) {
        logger.debug('Successfully fetched list HTML', { url });
        return response.data;
      }

      throw new Error(`Unexpected status code: ${response.status}`);
    } catch (error) {
      lastError = error;

      if (error.response) {
        const status = error.response.status;
        if (status === 404) {
          throw new Error('List not found (404)');
        } else if (status >= 500 && attempt < retryDelays.length) {
          const delay = retryDelays[attempt];
          logger.warn(`Server error (${status}), retrying in ${delay}ms`, {
            attempt: attempt + 1,
            url
          });
          await sleep(delay);
          continue;
        }
      } else if (error.code === 'ETIMEDOUT' && attempt < retryDelays.length) {
        const delay = retryDelays[attempt];
        logger.warn(`Request timeout, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          url
        });
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  scrapeAll,
  fetchListHtml
};

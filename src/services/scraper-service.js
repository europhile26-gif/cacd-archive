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
    logger.info('Recording scrape start in database...');
    scrapeId = await recordScrapeStart(scrapeType, config.scraping.summaryPageUrl);
    logger.info('Scrape history record created', { scrapeId });

    // Step 1: Discover links for today and tomorrow
    logger.info('Starting link discovery...');
    const linkResult = await discoverLinks('Criminal');
    logger.info('Link discovery completed', { 
      success: linkResult.success, 
      linksFound: linkResult.linksFound?.length || 0 
    });

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
          error: {
            message: error.message,
            code: error.code,
            errno: error.errno,
            name: error.name
          }
        });
        console.error('Failed to process list - full error:');
        console.error(error);

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
      stack: error.stack,
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
      logger.info(`Fetching list HTML (attempt ${attempt + 1})`, { url });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.scraping.requestTimeout || 10000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': config.scraping.userAgent || 'CACD-Archive-Bot/1.0'
          }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const html = await response.text();
          logger.info('Successfully fetched list HTML', { url });
          return html;
        }

        if (response.status === 404) {
          throw new Error('List not found (404)');
        }

        if (response.status >= 500 && attempt < retryDelays.length) {
          const delay = retryDelays[attempt];
          logger.warn(`Server error (${response.status}), retrying in ${delay}ms`, {
            attempt: attempt + 1,
            url
          });
          await sleep(delay);
          continue;
        }

        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      } catch (fetchError) {
        clearTimeout(timeout);
        throw fetchError;
      }
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        if (attempt < retryDelays.length) {
          const delay = retryDelays[attempt];
          logger.warn(`Request timeout, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            url
          });
          await sleep(delay);
          continue;
        }
        throw new Error('Request timeout after all retry attempts');
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

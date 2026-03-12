const { discoverLinks } = require('../scrapers/link-discovery');
const { parseTable } = require('../scrapers/table-parser');
const { discoverFHLLink } = require('../scrapers/fhl-link-discovery');
const { parseFHLTable } = require('../scrapers/fhl-table-parser');
const { synchronizeRecords, fullReplaceSynchronize } = require('./sync-service');
const {
  recordScrapeStart,
  recordScrapeComplete,
  recordScrapeError
} = require('./scrape-history-service');
const notificationService = require('./notification-service');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Scraper Service
 * Orchestrates scraping workflows for all data sources.
 * Dispatches to source-specific scrapers based on the data source slug.
 */

/**
 * Run scraping workflow for a specific data source
 * @param {string} scrapeType - Type of scrape: 'scheduled', 'startup', 'manual'
 * @param {Object} dataSource - Data source row from data_sources table
 * @returns {Promise<Object>} Result with all scraped records
 */
async function scrapeAll(scrapeType = 'manual', dataSource) {
  const sourceSlug = dataSource?.slug || 'daily_cause_list';

  switch (sourceSlug) {
    case 'daily_cause_list':
      return scrapeDCL(scrapeType, dataSource);
    case 'future_hearing_list':
      return scrapeFHL(scrapeType, dataSource);
    default:
      throw new Error(`No scraper implemented for source: ${sourceSlug}`);
  }
}

/**
 * Scrape Daily Cause List (DCL)
 * Discovers today/tomorrow links → fetches each → parses tables → incremental sync
 */
async function scrapeDCL(scrapeType, dataSource) {
  const dataSourceId = dataSource.id;

  logger.info('Starting DCL scraping workflow', { scrapeType });
  const startTime = Date.now();
  let scrapeId;

  try {
    scrapeId = await recordScrapeStart(scrapeType, dataSource.base_url, dataSourceId);
    logger.info('Scrape history record created', { scrapeId, source: 'daily_cause_list' });

    // Step 1: Discover links for today and tomorrow
    const linkResult = await discoverLinks('Criminal');

    if (!linkResult.success || linkResult.linksFound.length === 0) {
      logger.info('No DCL links found, nothing to scrape');
      const result = buildResult(scrapeType, 0, 0, 0, 0, Date.now() - startTime, []);
      await recordScrapeComplete(scrapeId, result);
      return result;
    }

    // Step 2: Fetch, parse, and sync each discovered list
    const syncResults = [];

    for (const link of linkResult.linksFound) {
      try {
        logger.info('Processing DCL list', { date: link.targetDate, url: link.url });

        const html = await fetchListHtml(link.url);
        const records = await parseTable(html, link.targetDate, link.url, link.division);

        logger.info('Parsed records, starting sync', {
          date: link.targetDate,
          records: records.length
        });

        const syncResult = await synchronizeRecords(records, link.targetDate, dataSourceId);

        syncResults.push({
          date: link.targetDate,
          url: link.url,
          division: link.division,
          ...syncResult
        });

        logger.info('DCL list synchronized', {
          date: link.targetDate,
          added: syncResult.added,
          updated: syncResult.updated,
          deleted: syncResult.deleted
        });
      } catch (error) {
        logger.error('Failed to process DCL list', {
          date: link.targetDate,
          url: link.url,
          error: { message: error.message, code: error.code, name: error.name }
        });
        console.error('Failed to process DCL list - full error:');
        console.error(error);

        syncResults.push({
          date: link.targetDate,
          url: link.url,
          success: false,
          error: error.message
        });
      }
    }

    const totalAdded = syncResults.reduce((sum, r) => sum + (r.added || 0), 0);
    const totalUpdated = syncResults.reduce((sum, r) => sum + (r.updated || 0), 0);
    const totalDeleted = syncResults.reduce((sum, r) => sum + (r.deleted || 0), 0);
    const duration = Date.now() - startTime;

    const result = buildResult(
      scrapeType,
      linkResult.linksFound.length,
      totalAdded,
      totalUpdated,
      totalDeleted,
      duration,
      syncResults
    );

    await recordScrapeComplete(scrapeId, result);

    logger.info('DCL scraping workflow completed', {
      scrapeId,
      linksProcessed: result.linksProcessed,
      totalAdded,
      totalUpdated,
      totalDeleted,
      duration: `${duration}ms`
    });

    // Process saved search notifications if new records were added
    if (totalAdded > 0) {
      try {
        logger.info('Processing saved search notifications', { newRecords: totalAdded });
        const notificationStats = await notificationService.processSavedSearchNotifications();
        logger.info('Notification processing complete', notificationStats);
        result.notifications = notificationStats;
      } catch (error) {
        logger.error('Failed to process notifications', {
          error: error.message,
          stack: error.stack
        });
        result.notifications = { error: error.message };
      }
    }

    return result;
  } catch (error) {
    logger.error('DCL scraping workflow failed', {
      error: error.message,
      scrapeType,
      scrapeId
    });
    if (scrapeId) await recordScrapeError(scrapeId, error);
    throw error;
  }
}

/**
 * Scrape Future Hearing List (FHL)
 * Discovers document link → fetches page → parses table → full-replace sync
 */
async function scrapeFHL(scrapeType, dataSource) {
  const dataSourceId = dataSource.id;

  logger.info('Starting FHL scraping workflow', { scrapeType });
  const startTime = Date.now();
  let scrapeId;

  try {
    scrapeId = await recordScrapeStart(scrapeType, dataSource.base_url, dataSourceId);
    logger.info('Scrape history record created', { scrapeId, source: 'future_hearing_list' });

    // Step 1: Discover the FHL document link
    const discoveryResult = await discoverFHLLink(dataSource.base_url);
    const documentLink = discoveryResult.link;

    logger.info('FHL document link discovered', { url: documentLink.url });

    // Step 2: Fetch the document page
    const html = await fetchListHtml(documentLink.url);

    // Step 3: Parse the FHL table
    const records = await parseFHLTable(html, documentLink.url, 'Criminal');

    logger.info('FHL records parsed', { recordCount: records.length });

    // Step 4: Full-replace sync
    const syncResult = await fullReplaceSynchronize(records, dataSourceId);

    const duration = Date.now() - startTime;

    const result = buildResult(scrapeType, 1, syncResult.added, 0, syncResult.deleted, duration, [
      { url: documentLink.url, ...syncResult }
    ]);

    await recordScrapeComplete(scrapeId, result);

    logger.info('FHL scraping workflow completed', {
      scrapeId,
      recordsParsed: records.length,
      added: syncResult.added,
      deleted: syncResult.deleted,
      skipped: syncResult.skipped,
      duration: `${duration}ms`
    });

    return result;
  } catch (error) {
    logger.error('FHL scraping workflow failed', {
      error: error.message,
      scrapeType,
      scrapeId
    });
    if (scrapeId) await recordScrapeError(scrapeId, error);
    throw error;
  }
}

/**
 * Build a standard result object
 */
function buildResult(scrapeType, linksProcessed, added, updated, deleted, duration, syncResults) {
  return {
    success: true,
    scrapeType,
    linksProcessed,
    recordsAdded: added,
    recordsUpdated: updated,
    recordsDeleted: deleted,
    duration,
    syncResults
  };
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

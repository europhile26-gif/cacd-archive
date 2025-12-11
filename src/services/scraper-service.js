const axios = require('axios');
const { discoverLinks } = require('../scrapers/link-discovery');
const { parseTable } = require('../scrapers/table-parser');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Scraper Service
 * Orchestrates the workflow: link discovery → fetch HTML → parse table
 */

/**
 * Run full scraping workflow for Criminal Division
 * @returns {Promise<Object>} Result with all scraped records
 */
async function scrapeAll() {
  logger.info('Starting scraping workflow');
  const startTime = Date.now();

  try {
    // Step 1: Discover links for today and tomorrow
    const linkResult = await discoverLinks('Criminal');

    if (!linkResult.success || linkResult.linksFound.length === 0) {
      logger.info('No links found, nothing to scrape');
      return {
        success: true,
        linksProcessed: 0,
        recordsScraped: 0,
        lists: []
      };
    }

    // Step 2: Fetch and parse each discovered list
    const lists = [];

    for (const link of linkResult.linksFound) {
      try {
        logger.info('Processing list', {
          date: link.targetDate,
          url: link.url
        });

        const html = await fetchListHtml(link.url);
        const records = await parseTable(html, link.targetDate, link.url, link.division);

        lists.push({
          date: link.targetDate,
          url: link.url,
          division: link.division,
          recordCount: records.length,
          records
        });

        logger.info('List processed successfully', {
          date: link.targetDate,
          records: records.length
        });
      } catch (error) {
        logger.error('Failed to process list', {
          date: link.targetDate,
          url: link.url,
          error: error.message
        });
        // Continue with next list
      }
    }

    const totalRecords = lists.reduce((sum, list) => sum + list.recordCount, 0);
    const duration = Date.now() - startTime;

    logger.info('Scraping workflow completed', {
      linksProcessed: linkResult.linksFound.length,
      listsSuccessful: lists.length,
      totalRecords,
      duration: `${duration}ms`
    });

    return {
      success: true,
      linksProcessed: linkResult.linksFound.length,
      recordsScraped: totalRecords,
      lists
    };
  } catch (error) {
    logger.error('Scraping workflow failed', { error: error.message });
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

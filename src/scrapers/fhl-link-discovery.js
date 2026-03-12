const cheerio = require('cheerio');
const config = require('../config/config');
const logger = require('../utils/logger');
const emailService = require('../services/email-service');

/**
 * FHL Link Discovery Module
 * Finds the "Court of Appeal cases fixed for hearing (Criminal Division)"
 * document link from the GOV.UK publication page.
 *
 * Unlike DCL link discovery (which finds date-specific links), the FHL
 * publication page links to a single document containing all future hearings.
 */

/**
 * Discover the FHL document link from the publication page
 * @param {string} baseUrl - The FHL publication page URL (from data_sources table)
 * @returns {Promise<Object>} Result object with discovered link
 */
async function discoverFHLLink(baseUrl) {
  const startTime = Date.now();
  logger.info('Starting FHL link discovery', { baseUrl });

  try {
    const html = await fetchPage(baseUrl);
    const link = findDocumentLink(html, baseUrl);

    const duration = Date.now() - startTime;
    logger.info('FHL link discovery completed', {
      linkFound: !!link,
      duration: `${duration}ms`
    });

    if (!link) {
      throw new Error('No FHL document link found on publication page');
    }

    return {
      success: true,
      discoveryTimestamp: new Date().toISOString(),
      link
    };
  } catch (error) {
    logger.error('FHL link discovery failed', {
      error: error.message,
      baseUrl
    });

    try {
      await emailService.sendDataError({
        type: 'fhl-link-discovery',
        error: error.message,
        stack: error.stack,
        date: new Date().toISOString().slice(0, 10),
        url: baseUrl,
        context: { baseUrl }
      });
    } catch (emailError) {
      logger.error('Failed to send FHL link discovery error email', {
        error: emailError.message
      });
    }

    throw error;
  }
}

/**
 * Find the document link on the publication page
 * Looks for a link whose text contains "Court of Appeal cases fixed for hearing"
 * @param {string} html - Publication page HTML
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {Object|null} Link object or null
 */
function findDocumentLink(html, baseUrl) {
  const $ = cheerio.load(html);

  let foundLink = null;

  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();

    if (!href || !text) return;

    // Match the document link by text content
    const textLower = text.toLowerCase();
    if (
      textLower.includes('court of appeal') &&
      textLower.includes('cases fixed for hearing') &&
      textLower.includes('criminal')
    ) {
      const fullUrl = resolveUrl(href, baseUrl);

      // Skip the publication page itself (avoid self-referencing)
      if (fullUrl === baseUrl) return;

      logger.info('Found FHL document link', {
        text: text.substring(0, 100),
        url: fullUrl
      });

      foundLink = {
        url: fullUrl,
        linkText: text
      };

      return false; // break .each()
    }
  });

  return foundLink;
}

/**
 * Resolve a URL (relative or absolute) against a base
 * @param {string} href - Href attribute
 * @param {string} baseUrl - Base URL
 * @returns {string} Absolute URL
 */
function resolveUrl(href, baseUrl) {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }

  const base = new URL(baseUrl);
  const cleanHref = href.startsWith('/') ? href : `/${href}`;
  return `${base.origin}${cleanHref}`;
}

/**
 * Fetch a page with retry logic
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchPage(url) {
  const retryDelays = [5000, 10000, 20000];
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      logger.info(`Fetching FHL page (attempt ${attempt + 1})`, { url });

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
          logger.info('Successfully fetched FHL page', { url });
          return html;
        }

        if (response.status === 404) {
          throw new Error(`FHL page not found (404): ${url}`);
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
  discoverFHLLink,
  findDocumentLink
};

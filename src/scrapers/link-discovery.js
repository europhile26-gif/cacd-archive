const cheerio = require('cheerio');
const { format, addDays } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');
const config = require('../config/config');
const logger = require('../utils/logger');
const emailService = require('../services/email-service');

/**
 * Link Discovery Module
 * Finds daily cause list links for Court of Appeal (Criminal Division)
 * from the summary publications page for today and tomorrow.
 */

const SUMMARY_URL =
  'https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109';
const BASE_URL = 'https://www.court-tribunal-hearings.service.gov.uk';
const TIMEZONE = 'Europe/London';

/**
 * Discover links for today and tomorrow's daily cause lists
 * @param {string} division - Division name (default: 'Criminal')
 * @returns {Promise<Object>} Result object with discovered links
 */
async function discoverLinks(division = 'Criminal') {
  const startTime = Date.now();
  logger.info('Starting link discovery', { division });

  try {
    // Fetch summary page
    const html = await fetchSummaryPage();

    // Parse HTML and find links
    const links = findCACDLinks(html, division);

    const duration = Date.now() - startTime;
    logger.info('Link discovery completed', {
      division,
      linksFound: links.length,
      duration: `${duration}ms`
    });

    return {
      success: true,
      discoveryTimestamp: new Date().toISOString(),
      division,
      linksFound: links
    };
  } catch (error) {
    logger.error('Link discovery failed', {
      error: error.message,
      stack: error.stack,
      division
    });

    // Send email alert for link discovery failure
    try {
      await emailService.sendDataError({
        type: 'link-discovery',
        error: error.message,
        stack: error.stack,
        date: format(new Date(), 'yyyy-MM-dd'),
        url: SUMMARY_URL,
        context: {
          division,
          summaryUrl: SUMMARY_URL
        }
      });
    } catch (emailError) {
      logger.error('Failed to send link discovery error email', {
        error: emailError.message
      });
    }

    throw error;
  }
}

/**
 * Fetch the summary publications page with retry logic
 * @returns {Promise<string>} HTML content
 */
async function fetchSummaryPage() {
  const retryDelays = [5000, 10000, 20000];
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      logger.info(`Fetching summary page (attempt ${attempt + 1})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.scraping.requestTimeout || 10000);

      try {
        const response = await fetch(SUMMARY_URL, {
          signal: controller.signal,
          headers: {
            'User-Agent': config.scraping.userAgent || 'CACD-Archive-Bot/1.0'
          }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const html = await response.text();
          logger.info('Successfully fetched summary page');
          return html;
        }

        if (response.status === 404) {
          throw new Error('Summary page not found (404)');
        }

        if (response.status >= 500 && attempt < retryDelays.length) {
          const delay = retryDelays[attempt];
          logger.warn(`Server error (${response.status}), retrying in ${delay}ms`, {
            attempt: attempt + 1
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
          logger.warn(`Request timeout, retrying in ${delay}ms`, { attempt: attempt + 1 });
          await sleep(delay);
          continue;
        }
        throw new Error('Request timeout after all retry attempts');
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  throw lastError;
}

/**
 * Find CACD links for today and tomorrow from HTML
 * @param {string} html - HTML document
 * @param {string} division - Division name
 * @returns {Array<Object>} Array of matched links
 */
function findCACDLinks(html, division) {
  const $ = cheerio.load(html);
  const allLinks = [];

  // Extract all anchor elements
  $('a').each((i, elem) => {
    const href = $(elem).attr('href');
    const text = $(elem).text().trim();

    if (href && text) {
      allLinks.push({ href, text });
    }
  });

  logger.debug(`Extracted ${allLinks.length} links from page`);

  // Get today and tomorrow in UK timezone
  const today = getCurrentDateUK();
  const tomorrow = addDays(today, 1);
  const targetDates = [today, tomorrow];

  const matchedLinks = [];

  for (const targetDate of targetDates) {
    const result = findLinkForDate(allLinks, targetDate, division);
    if (result) {
      matchedLinks.push(result);
    }
  }

  if (matchedLinks.length === 0) {
    logger.info('No links found for today or tomorrow', {
      today: format(today, 'yyyy-MM-dd'),
      tomorrow: format(tomorrow, 'yyyy-MM-dd'),
      division,
      linksSearched: allLinks.length
    });
  }

  return matchedLinks;
}

/**
 * Find link matching specific date
 * @param {Array<Object>} links - Array of link objects
 * @param {Date} targetDate - Target date
 * @param {string} division - Division name
 * @returns {Object|null} Matched link or null
 */
function findLinkForDate(links, targetDate, division) {
  const day = format(targetDate, 'd'); // e.g., "3"
  const dayPadded = format(targetDate, 'dd'); // e.g., "03"
  const monthFull = format(targetDate, 'MMMM'); // e.g., "December"
  const monthShort = format(targetDate, 'MMM'); // e.g., "Dec"
  const year = format(targetDate, 'yyyy'); // e.g., "2025"
  const dateString = format(targetDate, 'yyyy-MM-dd');

  logger.debug(`Searching for link matching date: ${dateString}`, {
    day,
    dayPadded,
    monthFull,
    monthShort,
    year,
    division
  });

  for (const link of links) {
    const text = link.text;

    // Check all required components (case-insensitive)
    // Day can be with or without leading zero (e.g., "3" or "03")
    if (
      containsCaseInsensitive(text, 'Court of Appeal') &&
      containsCaseInsensitive(text, division) &&
      (containsWord(text, day) || containsWord(text, dayPadded)) &&
      (containsWord(text, monthFull) || containsWord(text, monthShort)) &&
      containsWord(text, year)
    ) {
      // Found a match
      const fullUrl = resolveUrl(link.href);

      // Validate URL
      if (!isValidUrl(fullUrl)) {
        logger.warn('Found matching link but URL is invalid', {
          text,
          url: fullUrl
        });
        continue;
      }

      logger.info('Found matching link', {
        date: dateString,
        text: text.substring(0, 100),
        url: fullUrl
      });

      return {
        url: fullUrl,
        linkText: text,
        targetDate: dateString,
        division
      };
    }
  }

  logger.debug(`No matching link found for date: ${dateString}`);
  return null;
}

/**
 * Check if text contains phrase (case-insensitive)
 * @param {string} text - Text to search
 * @param {string} phrase - Phrase to find
 * @returns {boolean}
 */
function containsCaseInsensitive(text, phrase) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * Check if text contains word with word boundaries
 * @param {string} text - Text to search
 * @param {string} word - Word to find
 * @returns {boolean}
 */
function containsWord(text, word) {
  const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
  return pattern.test(text);
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve relative URL to absolute
 * @param {string} href - Href attribute value
 * @returns {string}
 */
function resolveUrl(href) {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }

  // Handle relative URLs
  const cleanHref = href.startsWith('/') ? href : `/${href}`;
  return BASE_URL + cleanHref;
}

/**
 * Validate URL format and domain
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Check expected domains
    const expectedDomains = [
      'www.court-tribunal-hearings.service.gov.uk',
      'publicaccess.courts.gov.uk'
    ];

    if (!expectedDomains.includes(parsed.hostname)) {
      logger.warn('URL hostname not in expected list', {
        hostname: parsed.hostname,
        expected: expectedDomains
      });
      // Don't reject, just warn
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get current date in UK timezone
 * @returns {Date}
 */
function getCurrentDateUK() {
  const now = new Date();
  // Convert to UK timezone
  const ukDate = toZonedTime(now, TIMEZONE);
  return ukDate;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  discoverLinks,
  findCACDLinks,
  findLinkForDate,
  containsCaseInsensitive,
  containsWord
};

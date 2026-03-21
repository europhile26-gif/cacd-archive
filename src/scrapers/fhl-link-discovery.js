const config = require('../config/config');
const logger = require('../utils/logger');
const emailService = require('../services/email-service');

/**
 * FHL Link Discovery Module
 * Uses the GOV.UK Content API to discover the Future Hearing List document
 * and retrieve its HTML body directly, avoiding fragile HTML scraping.
 *
 * API flow:
 *   1. GET /api/content/<publication-path> → details.attachments[0].url, public_updated_at
 *   2. GET /api/content/<attachment-path>  → details.body (the FHL table HTML)
 */

const GOVUK_API_BASE = 'https://www.gov.uk/api/content';

/**
 * Discover and fetch the FHL document via the GOV.UK Content API
 * @param {string} baseUrl - The FHL publication page URL (from data_sources table)
 * @returns {Promise<Object>} Result with body HTML, attachment URL, and public_updated_at
 */
async function discoverFHLLink(baseUrl) {
  const startTime = Date.now();
  logger.info('Starting FHL link discovery via Content API', { baseUrl });

  try {
    // Step 1: Fetch publication metadata
    const publicationApiUrl = toContentApiUrl(baseUrl);
    const publication = await fetchJson(publicationApiUrl);

    const publicUpdatedAt = publication.public_updated_at || null;

    // Extract attachment URL from structured metadata
    const attachments = publication.details?.attachments;
    if (!attachments || attachments.length === 0) {
      throw new Error('No attachments found in FHL publication metadata');
    }

    const attachment = attachments[0];
    const attachmentPath = attachment.url;
    if (!attachmentPath) {
      throw new Error('FHL attachment has no URL');
    }

    const attachmentUrl = attachmentPath.startsWith('http')
      ? attachmentPath
      : `https://www.gov.uk${attachmentPath}`;

    logger.info('FHL attachment discovered', {
      title: attachment.title,
      url: attachmentUrl,
      publicUpdatedAt
    });

    // Step 2: Fetch the attachment content (contains the table HTML in details.body)
    const attachmentApiUrl = toContentApiUrl(attachmentUrl);
    const attachmentContent = await fetchJson(attachmentApiUrl);

    const body = attachmentContent.details?.body;
    if (!body) {
      throw new Error('FHL attachment has no body content');
    }

    const duration = Date.now() - startTime;
    logger.info('FHL link discovery completed', {
      attachmentUrl,
      bodyLength: body.length,
      duration: `${duration}ms`
    });

    return {
      success: true,
      discoveryTimestamp: new Date().toISOString(),
      publicUpdatedAt,
      link: {
        url: attachmentUrl,
        linkText: attachment.title || 'FHL Document'
      },
      body
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
 * Convert a GOV.UK page URL to its Content API equivalent
 * e.g. https://www.gov.uk/government/publications/foo → https://www.gov.uk/api/content/government/publications/foo
 * @param {string} pageUrl - GOV.UK page URL
 * @returns {string} Content API URL
 */
function toContentApiUrl(pageUrl) {
  const url = new URL(pageUrl);
  const path = url.pathname.replace(/^\//, '');
  return `${GOVUK_API_BASE}/${path}`;
}

/**
 * Fetch JSON from a URL with retry logic
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Parsed JSON
 */
async function fetchJson(url) {
  const retryDelays = [5000, 10000, 20000];
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      logger.info(`Fetching FHL JSON (attempt ${attempt + 1})`, { url });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.scraping.requestTimeout || 10000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': config.scraping.userAgent || 'CACD-Archive-Bot/1.0',
            Accept: 'application/json'
          }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const json = await response.json();
          logger.info('Successfully fetched FHL JSON', { url });
          return json;
        }

        if (response.status === 404) {
          throw new Error(`FHL API resource not found (404): ${url}`);
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
  toContentApiUrl
};

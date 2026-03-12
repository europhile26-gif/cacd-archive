/**
 * Scheduler Module
 *
 * Manages automatic periodic scraping for all enabled data sources.
 * - Uses node-cron for scheduling (checks every minute)
 * - Each data source has its own interval and time window (from data_sources table)
 * - Only runs on PM2 instance 0 (when NODE_APP_INSTANCE=0)
 * - Supports scrape on startup configuration
 * - Graceful shutdown handling
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config/config');
const { scrapeAll } = require('../services/scraper-service');
const { shouldScrape } = require('../services/scrape-history-service');
const { getEnabledSources } = require('../services/data-source-service');

let scheduledTask = null;
let isShuttingDown = false;
let scrapingInProgress = false;

/**
 * Check if this instance should run scheduled tasks
 * Only instance 0 should run cron jobs in PM2 cluster mode
 */
function shouldRunScheduler() {
  return config.appInstance === 0;
}

/**
 * Check if current time is within a source's scraping window
 * @param {Object} dataSource - Data source row from data_sources table
 * @returns {boolean}
 */
function isWithinScrapingWindow(dataSource) {
  const startHour = dataSource.scrape_window_start_hour;
  const endHour = dataSource.scrape_window_end_hour;

  // 0-24 means no window restriction
  if (startHour === 0 && endHour === 24) {
    return true;
  }

  const currentHour = new Date().getHours();
  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Perform a scheduled scrape for all enabled data sources that are due
 */
async function performScheduledScrape() {
  if (isShuttingDown) {
    logger.info('Skipping scheduled scrape - shutdown in progress');
    return;
  }

  if (scrapingInProgress) {
    logger.warn('Skipping scheduled scrape - previous scrape still in progress');
    return;
  }

  let sources;
  try {
    sources = await getEnabledSources();
  } catch (error) {
    logger.error('Failed to load data sources', { error: error.message });
    return;
  }

  for (const source of sources) {
    if (isShuttingDown) break;

    // Check time window for this source
    if (!isWithinScrapingWindow(source)) {
      logger.debug('Skipping source - outside time window', {
        source: source.slug,
        currentHour: new Date().getHours(),
        windowStart: source.scrape_window_start_hour,
        windowEnd: source.scrape_window_end_hour
      });
      continue;
    }

    // Check interval for this source
    const intervalHours = source.scrape_interval_minutes / 60;
    const should = await shouldScrape(intervalHours, source.id);

    if (!should) {
      logger.debug('Skipping source - interval not elapsed', {
        source: source.slug,
        intervalMinutes: source.scrape_interval_minutes
      });
      continue;
    }

    // Only scrape sources that have an implemented scraper
    const implementedSources = ['daily_cause_list', 'future_hearing_list'];
    if (!implementedSources.includes(source.slug)) {
      logger.debug('Skipping source - no scraper implemented yet', {
        source: source.slug
      });
      continue;
    }

    try {
      scrapingInProgress = true;

      logger.info('Starting scheduled scrape', {
        source: source.slug,
        intervalMinutes: source.scrape_interval_minutes
      });

      const result = await scrapeAll('scheduled', source);

      logger.info('Scheduled scrape completed successfully', {
        source: source.slug,
        linksProcessed: result.linksProcessed,
        recordsAdded: result.recordsAdded,
        recordsUpdated: result.recordsUpdated,
        recordsDeleted: result.recordsDeleted,
        duration: `${result.duration}ms`
      });
    } catch (error) {
      logger.error('Scheduled scrape failed', {
        source: source.slug,
        error: error.message,
        stack: error.stack
      });
    } finally {
      scrapingInProgress = false;
    }
  }
}

/**
 * Perform startup scrape if enabled in configuration
 */
async function performStartupScrape() {
  if (!config.scraping.scrapeOnStartup) {
    logger.info('Startup scrape disabled');
    return;
  }

  if (!shouldRunScheduler()) {
    logger.info('Skipping startup scrape - not running on instance 0', {
      appInstance: config.appInstance
    });
    return;
  }

  let sources;
  try {
    sources = await getEnabledSources();
  } catch (error) {
    logger.error('Failed to load data sources for startup scrape', {
      error: error.message
    });
    return;
  }

  // Only scrape sources with implemented scrapers on startup
  const dclSource = sources.find((s) => s.slug === 'daily_cause_list');
  if (!dclSource) {
    logger.warn('Daily cause list source not found or disabled');
    return;
  }

  try {
    logger.info('Starting startup scrape');
    scrapingInProgress = true;

    const result = await scrapeAll('startup', dclSource);

    logger.info('Startup scrape completed successfully', {
      linksProcessed: result.linksProcessed,
      recordsAdded: result.recordsAdded,
      recordsUpdated: result.recordsUpdated,
      recordsDeleted: result.recordsDeleted,
      duration: `${result.duration}ms`
    });
  } catch (error) {
    logger.error('Startup scrape failed', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    scrapingInProgress = false;
  }
}

/**
 * Start the scheduler
 * Runs every minute and checks if scraping is needed for each source
 */
function startScheduler() {
  if (!shouldRunScheduler()) {
    logger.info('Scheduler not started - not running on instance 0', {
      appInstance: config.appInstance
    });
    return;
  }

  if (scheduledTask) {
    logger.warn('Scheduler already started');
    return;
  }

  // Run every minute and check if we should scrape
  // Each data source has its own interval checked via shouldScrape()
  scheduledTask = cron.schedule('* * * * *', async () => {
    await performScheduledScrape();
  });

  logger.info('Scheduler started', {
    checkInterval: 'Every 1 minute',
    appInstance: config.appInstance
  });
}

/**
 * Stop the scheduler gracefully
 * Waits for any in-progress scrape to complete
 */
async function stopScheduler() {
  isShuttingDown = true;

  if (scheduledTask) {
    logger.info('Stopping scheduler...');
    scheduledTask.stop();
    scheduledTask = null;
  }

  // Wait for any in-progress scrape to complete
  if (scrapingInProgress) {
    logger.info('Waiting for in-progress scrape to complete...');

    const maxWait = 60000; // 60 seconds max wait
    const startTime = Date.now();

    while (scrapingInProgress && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (scrapingInProgress) {
      logger.warn('Scrape did not complete within timeout, forcing shutdown');
    } else {
      logger.info('In-progress scrape completed');
    }
  }

  logger.info('Scheduler stopped');
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    shouldRun: shouldRunScheduler(),
    appInstance: config.appInstance,
    scrapingInProgress,
    isShuttingDown
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  performStartupScrape,
  performScheduledScrape,
  getSchedulerStatus
};

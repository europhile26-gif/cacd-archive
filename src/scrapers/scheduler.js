/**
 * Scheduler Module
 *
 * Manages automatic periodic scraping of CACD daily cause lists.
 * - Uses node-cron for scheduling
 * - Checks if scraping interval has elapsed before scraping
 * - Only runs on PM2 instance 0 (when NODE_APP_INSTANCE=0)
 * - Supports scrape on startup configuration
 * - Graceful shutdown handling
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config/config');
const { scrapeAll } = require('../services/scraper-service');
const { shouldScrape } = require('../services/scrape-history-service');

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
 * Check if current time is within the scraping window
 */
function isWithinScrapingWindow() {
  if (!config.scraping.timeWindow.enabled) {
    return true; // No window restriction
  }

  const now = new Date();
  const currentHour = now.getHours();
  const { startHour, endHour } = config.scraping.timeWindow;

  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Perform a scheduled scrape
 * Checks if interval has elapsed and if within time window before scraping
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

  // Check if within scraping window
  if (!isWithinScrapingWindow()) {
    logger.debug('Skipping scheduled scrape - outside time window', {
      currentHour: new Date().getHours(),
      windowStart: config.scraping.timeWindow.startHour,
      windowEnd: config.scraping.timeWindow.endHour
    });
    return;
  }

  try {
    scrapingInProgress = true;

    // Convert minutes to hours for shouldScrape function
    const intervalHours = config.scraping.intervalMinutes / 60;
    const should = await shouldScrape(intervalHours);

    if (!should) {
      logger.info('Skipping scheduled scrape - interval not elapsed', {
        intervalMinutes: config.scraping.intervalMinutes
      });
      return;
    }

    logger.info('Starting scheduled scrape', {
      intervalMinutes: config.scraping.intervalMinutes
    });

    const result = await scrapeAll('scheduled');

    logger.info('Scheduled scrape completed successfully', {
      linksProcessed: result.linksProcessed,
      recordsAdded: result.recordsAdded,
      recordsUpdated: result.recordsUpdated,
      recordsDeleted: result.recordsDeleted,
      duration: `${result.duration}ms`
    });
  } catch (error) {
    logger.error('Scheduled scrape failed', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    scrapingInProgress = false;
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

  try {
    logger.info('Starting startup scrape');
    scrapingInProgress = true;

    const result = await scrapeAll('startup');

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
 * Runs every minute and checks if scraping is needed
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
  // The shouldScrape() function will determine if the interval has elapsed
  scheduledTask = cron.schedule('* * * * *', async () => {
    await performScheduledScrape();
  });

  logger.info('Scheduler started', {
    checkInterval: 'Every 1 minute',
    scrapeInterval: `${config.scraping.intervalMinutes} minutes`,
    timeWindowEnabled: config.scraping.timeWindow.enabled,
    timeWindowStart: config.scraping.timeWindow.enabled
      ? `${String(config.scraping.timeWindow.startHour).padStart(2, '0')}:00`
      : 'N/A',
    timeWindowEnd: config.scraping.timeWindow.enabled
      ? `${String(config.scraping.timeWindow.endHour).padStart(2, '0')}:00`
      : 'N/A',
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
    intervalMinutes: config.scraping.intervalMinutes,
    timeWindowEnabled: config.scraping.timeWindow.enabled,
    timeWindowStart: config.scraping.timeWindow.startHour,
    timeWindowEnd: config.scraping.timeWindow.endHour,
    withinWindow: isWithinScrapingWindow(),
    scrapeOnStartup: config.scraping.scrapeOnStartup,
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

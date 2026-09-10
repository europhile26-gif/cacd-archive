const { runStartupSecurityChecks } = require('./utils/startup-security');

// Run security checks before loading any configuration
// This must be done before loading dotenv/config
try {
  runStartupSecurityChecks();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const config = require('./config/config');
const { runMigrations } = require('./db/migrator');
const { createServer } = require('./api/server');
const logger = require('./utils/logger');
const emailService = require('./services/email-service');
const { startScheduler, stopScheduler, performStartupScrape } = require('./scrapers/scheduler');
const analyticsService = require('./services/analytics-service');

async function start() {
  try {
    logger.info('Starting CACD Archive application...');
    logger.info(`Environment: ${config.env}`);
    logger.info(`Port: ${config.port}`);
    logger.info(`App Instance: ${config.appInstance}`);

    // Run migrations on startup (only on instance 0)
    if (config.appInstance === 0) {
      logger.info('Running database migrations...');
      await runMigrations();
      logger.info('Migrations completed successfully');

      // Initialize email service
      logger.info('Initializing email service...');
      await emailService.initialize();
      logger.info('Email service initialized');
    } else {
      logger.info('Skipping migrations and email service initialization (not instance 0)');
    }

    // Start API server
    logger.info('Starting API server...');
    const server = await createServer();
    await server.listen({ port: config.port, host: '0.0.0.0' });
    const displayUrl = config.baseUrl || `http://0.0.0.0:${config.port}`;
    logger.info(`API server listening on ${displayUrl}`);
    logger.info(`API documentation available at ${displayUrl}/api/docs`);

    // Signal readiness to PM2 (ecosystem.config.js `wait_ready: true`). We do
    // this as soon as the HTTP server is accepting connections — migrations and
    // email init have already finished above, and the scheduler/startup scrape
    // below run in the background and shouldn't delay the ready signal (or trip
    // PM2's listen_timeout). process.send only exists when launched with an IPC
    // channel (PM2, cluster), so direct `node`/nodemon runs are unaffected.
    if (process.send) {
      process.send('ready');
      logger.info('Sent ready signal to process manager');
    }

    // Start scraper scheduler (only on instance 0)
    if (config.appInstance === 0) {
      logger.info('Starting scraper scheduler...');
      startScheduler();

      // Perform startup scrape if enabled
      await performStartupScrape();
    } else {
      logger.info('Skipping scraper scheduler (not instance 0)');
    }

    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error);
    console.error('Full error details:');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown. The analytics buffer is per-instance, so it is flushed on
 * every instance rather than only the one running the scheduler.
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);

  await stopScheduler();
  await analyticsService.stop();
  await emailService.close();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

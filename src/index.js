const config = require('./config/config');
const { runMigrations } = require('./db/migrator');
const { createServer } = require('./api/server');
const logger = require('./utils/logger');
const emailService = require('./services/email-service');
const { startScheduler, stopScheduler, performStartupScrape } = require('./scrapers/scheduler');

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
    logger.info(`API server listening on http://0.0.0.0:${config.port}`);
    logger.info(`API documentation available at http://0.0.0.0:${config.port}/api/docs`);

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
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await stopScheduler();
  await emailService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await stopScheduler();
  await emailService.close();
  process.exit(0);
});

start();

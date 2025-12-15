#!/usr/bin/env node
/**
 * Database Migration CLI
 * Runs pending database migrations
 * 
 * Usage: node src/cli/migrate.js
 */

const { runMigrations } = require('../db/migrator');
const logger = require('../utils/logger');

async function main() {
  try {
    logger.info('Starting database migration...');
    await runMigrations();
    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();

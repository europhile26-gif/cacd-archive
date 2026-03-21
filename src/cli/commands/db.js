/**
 * Database CLI Commands
 * Summary and reset operations for the CACD Archive database.
 */

const chalk = require('chalk');
const { query } = require('../../config/database');
const {
  formatInfo,
  formatWarning,
  formatError,
  createTable,
  createSpinner
} = require('../utils/format');
const { confirm } = require('../utils/prompts');

/**
 * Show a summary of database contents
 */
async function summary() {
  const spinner = createSpinner('Querying database...').start();

  try {
    // Run all count queries in parallel
    const [
      hearingRows,
      hearingsBySource,
      scrapeRows,
      scrapesBySource,
      userRows,
      savedSearchRows,
      notificationRows
    ] = await Promise.all([
      query('SELECT COUNT(*) AS count FROM hearings'),
      query(`SELECT ds.display_name, COUNT(h.id) AS count
             FROM data_sources ds
             LEFT JOIN hearings h ON h.data_source_id = ds.id
             GROUP BY ds.id, ds.display_name
             ORDER BY ds.id`),
      query('SELECT COUNT(*) AS count FROM scrape_history'),
      query(`SELECT ds.display_name,
                    SUM(CASE WHEN sh.status = 'success' THEN 1 ELSE 0 END) AS success,
                    SUM(CASE WHEN sh.status = 'failed' THEN 1 ELSE 0 END) AS failed,
                    COUNT(sh.id) AS total
             FROM data_sources ds
             LEFT JOIN scrape_history sh ON sh.data_source_id = ds.id
             GROUP BY ds.id, ds.display_name
             ORDER BY ds.id`),
      query('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'),
      query('SELECT COUNT(*) AS count FROM saved_searches'),
      query('SELECT COUNT(*) AS count FROM search_notifications')
    ]);

    spinner.stop();
    console.log();
    formatInfo('Database Summary');
    console.log();

    // Hearings
    const hearingsTable = createTable(['Source', 'Records']);
    for (const row of hearingsBySource) {
      hearingsTable.push([row.display_name, row.count.toLocaleString()]);
    }
    hearingsTable.push([chalk.bold('Total'), chalk.bold(hearingRows[0].count.toLocaleString())]);
    console.log(chalk.cyan('  Hearings'));
    console.log(hearingsTable.toString());
    console.log();

    // Scrape history
    const scrapesTable = createTable(['Source', 'Success', 'Failed', 'Total']);
    for (const row of scrapesBySource) {
      scrapesTable.push([
        row.display_name,
        chalk.green(Number(row.success).toLocaleString()),
        Number(row.failed) > 0 ? chalk.red(Number(row.failed).toLocaleString()) : '0',
        Number(row.total).toLocaleString()
      ]);
    }
    scrapesTable.push([
      chalk.bold('Total'),
      '',
      '',
      chalk.bold(scrapeRows[0].count.toLocaleString())
    ]);
    console.log(chalk.cyan('  Scrape History'));
    console.log(scrapesTable.toString());
    console.log();

    // Users & searches
    const otherTable = createTable(['Category', 'Count']);
    otherTable.push(['Users', userRows[0].count.toLocaleString()]);
    otherTable.push(['Saved searches', savedSearchRows[0].count.toLocaleString()]);
    otherTable.push(['Notifications sent', notificationRows[0].count.toLocaleString()]);
    console.log(chalk.cyan('  Users & Searches'));
    console.log(otherTable.toString());

    process.exit(0);
  } catch (error) {
    spinner.fail('Failed to query database');
    formatError(error.message);
    process.exit(1);
  }
}

/**
 * Reset database data
 * Default: hearings + scrape_history only
 * --all: also resets user data (users, saved_searches, notifications, etc.)
 * Preserves: roles, capabilities, account_statuses, data_sources, schema_migrations
 */
async function reset(options) {
  const resetAll = options.all || false;
  const skipConfirm = options.yes || false;

  console.log();

  if (resetAll) {
    formatWarning('This will delete ALL data from the database:');
    console.log();
    console.log('  Data tables to be cleared:');
    console.log(chalk.red('    - hearings'));
    console.log(chalk.red('    - scrape_history'));
    console.log(chalk.red('    - search_notifications'));
    console.log(chalk.red('    - saved_searches'));
    console.log(chalk.red('    - password_reset_tokens'));
    console.log(chalk.red('    - user_status_history'));
    console.log(chalk.red('    - user_roles'));
    console.log(chalk.red('    - users'));
    console.log();
    console.log('  Preserved (seed/config data):');
    console.log(chalk.green('    - roles & capabilities'));
    console.log(chalk.green('    - account_statuses'));
    console.log(chalk.green('    - data_sources'));
    console.log(chalk.green('    - schema_migrations'));
  } else {
    formatWarning('This will delete hearing and scrape data:');
    console.log();
    console.log('  Data tables to be cleared:');
    console.log(chalk.red('    - hearings'));
    console.log(chalk.red('    - scrape_history'));
    console.log();
    console.log('  User data will be preserved.');
  }

  console.log();

  if (!skipConfirm) {
    const confirmed = await confirm('Are you sure you want to proceed?', false);
    if (!confirmed) {
      formatInfo('Reset cancelled.');
      process.exit(0);
    }
  }

  const spinner = createSpinner('Resetting database...').start();

  try {
    // Disable FK checks for clean truncation
    await query('SET FOREIGN_KEY_CHECKS = 0');

    try {
      // Always reset hearings and scrape history
      await query('TRUNCATE TABLE hearings');
      await query('TRUNCATE TABLE scrape_history');

      if (resetAll) {
        await query('TRUNCATE TABLE search_notifications');
        await query('TRUNCATE TABLE saved_searches');
        await query('TRUNCATE TABLE password_reset_tokens');
        await query('TRUNCATE TABLE user_status_history');
        await query('TRUNCATE TABLE user_roles');
        await query('TRUNCATE TABLE users');
      }
    } finally {
      await query('SET FOREIGN_KEY_CHECKS = 1');
    }

    spinner.succeed('Database reset complete');
    console.log();

    if (resetAll) {
      formatInfo(
        'All data tables cleared. Seed data (roles, capabilities, statuses, data sources) preserved.'
      );
      formatInfo('You will need to create a new admin user: ./bin/cacd users create');
    } else {
      formatInfo('Hearing and scrape data cleared. User data preserved.');
    }

    process.exit(0);
  } catch (error) {
    spinner.fail('Database reset failed');
    formatError(error.message);
    process.exit(1);
  }
}

module.exports = {
  summary,
  reset
};

/**
 * CACD Archive CLI
 * Main CLI entry point using Commander.js
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { formatHeader } = require('./utils/format');
const userCommands = require('./commands/users');
const dbCommands = require('./commands/db');

const program = new Command();

// CLI Header
formatHeader('CACD Archive CLI', 'Administrative command-line interface');

// Program configuration
program
  .name('cacd')
  .description('CACD Archive administrative command-line interface')
  .version('1.13.0');

// User Management Commands
const usersCommand = program.command('users').description('User management commands');

usersCommand
  .command('create')
  .description('Create a new user')
  .option('-e, --email <email>', 'User email')
  .option('-n, --name <name>', 'User full name')
  .option('-p, --password <password>', 'User password')
  .option('-r, --role <role>', 'User role (administrator|user)', 'user')
  .option('-s, --status <status>', 'Account status (active|pending)', 'active')
  .action(userCommands.createUser);

usersCommand
  .command('list')
  .description('List all users')
  .option('-s, --status <status>', 'Filter by status (pending|active|inactive)')
  .option('--search <query>', 'Search by name or email')
  .option('-l, --limit <limit>', 'Number of results', '100')
  .action(userCommands.listUsers);

usersCommand
  .command('show')
  .description('Show user details')
  .option('-i, --id <id>', 'User ID')
  .option('-e, --email <email>', 'User email')
  .option('-v, --verbose', 'Show all capabilities')
  .action(userCommands.showUser);

usersCommand
  .command('approve')
  .description('Approve a pending user')
  .option('-i, --id <id>', 'User ID')
  .option('-e, --email <email>', 'User email')
  .option('-n, --notes <notes>', 'Approval notes')
  .action(userCommands.approveUser);

usersCommand
  .command('deactivate')
  .description('Deactivate a user account')
  .option('-i, --id <id>', 'User ID')
  .option('-e, --email <email>', 'User email')
  .option('-n, --notes <notes>', 'Reason for deactivation')
  .action(userCommands.deactivateUser);

// Database Commands
const dbCommand = program.command('db').description('Database management commands');

dbCommand
  .command('migrate')
  .description('Run pending database migrations')
  .action(async () => {
    const { runMigrations } = require('../db/migrator');
    const { formatError, createSpinner } = require('./utils/format');

    try {
      const spinner = createSpinner('Running migrations...').start();
      await runMigrations();
      spinner.succeed('Migrations completed successfully');
      process.exit(0);
    } catch (error) {
      formatError(`Migration failed: ${error.message}`);
      process.exit(1);
    }
  });

dbCommand
  .command('summary')
  .description('Show a summary of database contents')
  .action(dbCommands.summary);

dbCommand
  .command('reset')
  .description('Reset database data (hearings + scrape history by default)')
  .option('-a, --all', 'Also reset user data (users, saved searches, notifications)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(dbCommands.reset);

// Scraper Commands
const scraperCommand = program.command('scraper').description('Scraper management commands');

scraperCommand
  .command('run')
  .description('Run scraper immediately (all enabled sources, or a specific source)')
  .option('-s, --source <slug>', 'Source to scrape: dcl, fhl, or full slug (e.g. daily_cause_list)')
  .action(async (options) => {
    const { scrapeAll } = require('../services/scraper-service');
    const { getEnabledSources, getSourceBySlug } = require('../services/data-source-service');
    const {
      formatError,
      formatInfo,
      formatSuccess,
      formatWarning,
      createSpinner
    } = require('./utils/format');

    // Shorthand aliases
    const slugAliases = {
      dcl: 'daily_cause_list',
      fhl: 'future_hearing_list'
    };

    try {
      let sources;

      if (options.source) {
        const slug = slugAliases[options.source.toLowerCase()] || options.source;
        const source = await getSourceBySlug(slug);
        if (!source) {
          formatError(`Data source '${options.source}' not found or disabled`);
          process.exit(1);
        }
        sources = [source];
      } else {
        sources = await getEnabledSources();
        if (sources.length === 0) {
          formatWarning('No enabled data sources found');
          process.exit(0);
        }
      }

      formatInfo(`Scraping ${sources.length} source(s)...`);
      console.log();

      let hasFailure = false;

      for (const source of sources) {
        const spinner = createSpinner(`Scraping ${source.display_name}...`).start();

        try {
          const result = await scrapeAll('manual', source);

          if (result.success) {
            const skipped = result.skippedReason === 'upstream_unchanged';
            if (skipped) {
              spinner.succeed(`${source.display_name}: skipped (upstream unchanged)`);
            } else {
              spinner.succeed(`${source.display_name}: done`);
              console.log(
                `    Added: ${result.recordsAdded}  Updated: ${result.recordsUpdated}  Deleted: ${result.recordsDeleted}  Duration: ${result.duration}ms`
              );
            }
          } else {
            spinner.fail(`${source.display_name}: completed with errors`);
            hasFailure = true;
          }
        } catch (error) {
          spinner.fail(`${source.display_name}: failed`);
          formatError(`  ${error.message}`);
          hasFailure = true;
        }
      }

      console.log();
      if (hasFailure) {
        formatWarning('Some sources failed — check logs for details');
        process.exit(1);
      } else {
        formatSuccess('All sources scraped successfully');
        process.exit(0);
      }
    } catch (error) {
      formatError(`Scraping failed: ${error.message}`);
      process.exit(1);
    }
  });

// Secret Commands
const secretCommand = program.command('secret').description('Secret and token management');

secretCommand
  .command('generate')
  .description('Generate a cryptographically secure random secret')
  .option(
    '-l, --length <bytes>',
    'Length in bytes (output is hex-encoded, so twice this length)',
    '32'
  )
  .action((options) => {
    const crypto = require('crypto');
    const { formatInfo } = require('./utils/format');
    const bytes = parseInt(options.length, 10) || 32;
    const secret = crypto.randomBytes(bytes).toString('hex');
    console.log();
    formatInfo('Generated secret:');
    console.log();
    console.log(`  ${secret}`);
    console.log();
    formatInfo('Add to your .env file as JWT_SECRET or COOKIE_SECRET');
  });

// System Commands
const systemCommand = program.command('system').description('System information commands');

systemCommand
  .command('info')
  .description('Show system information')
  .action(async () => {
    const db = require('../config/database');
    const { formatInfo, formatError, createTable } = require('./utils/format');

    try {
      // Test database connection
      await db.query('SELECT 1');

      console.log();
      formatInfo('System Information:');
      console.log();

      const table = createTable(['Component', 'Status']);
      table.push(['Database', chalk.green('✓ Connected')]);
      table.push(['Node.js', `v${process.version}`]);
      table.push(['Platform', `${process.platform} ${process.arch}`]);
      table.push(['Environment', process.env.NODE_ENV || 'development']);

      console.log(table.toString());

      process.exit(0);
    } catch (error) {
      formatError(`Failed to get system info: ${error.message}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

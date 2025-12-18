/**
 * CACD Archive CLI
 * Main CLI entry point using Commander.js
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { formatHeader } = require('./utils/format');
const userCommands = require('./commands/users');

const program = new Command();

// CLI Header
formatHeader('CACD Archive CLI', 'Administrative command-line interface');

// Program configuration
program
  .name('cacd')
  .description('CACD Archive administrative command-line interface')
  .version('2.0.0');

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

// Scraper Commands
const scraperCommand = program.command('scraper').description('Scraper management commands');

scraperCommand
  .command('run')
  .description('Run scraper immediately')
  .action(async () => {
    const scraperService = require('../services/scraper-service');
    const syncService = require('../services/sync-service');
    const { formatError, formatInfo, createSpinner } = require('./utils/format');

    try {
      const spinner = createSpinner('Discovering cause list links...').start();

      const links = await scraperService.discoverLinks();
      spinner.text = `Found ${links.length} links, parsing...`;

      const allHearings = [];
      for (const link of links) {
        const hearings = await scraperService.scrapeLink(link.url, link.date);
        allHearings.push(...hearings);
      }

      spinner.text = 'Syncing to database...';
      const changes = await syncService.syncHearings(allHearings);

      spinner.succeed('Scraping completed');
      console.log();
      formatInfo('Results:');
      console.log(`  Added: ${changes.added}`);
      console.log(`  Updated: ${changes.updated}`);
      console.log(`  Deleted: ${changes.deleted}`);

      process.exit(0);
    } catch (error) {
      formatError(`Scraping failed: ${error.message}`);
      process.exit(1);
    }
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

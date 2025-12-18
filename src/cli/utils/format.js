/**
 * CLI Utilities
 * Helper functions for pretty terminal output
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const boxen = require('boxen');

/**
 * Format success message
 */
function formatSuccess(message) {
  console.log(chalk.green('✓'), message);
}

/**
 * Format error message
 */
function formatError(message) {
  console.error(chalk.red('✗'), message);
}

/**
 * Format warning message
 */
function formatWarning(message) {
  console.warn(chalk.yellow('⚠'), message);
}

/**
 * Format info message
 */
function formatInfo(message) {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Format a header box
 */
function formatHeader(title, subtitle = '') {
  const content = subtitle ? `${title}\n${chalk.dim(subtitle)}` : title;
  console.log(
    boxen(content, {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan'
    })
  );
}

/**
 * Create a styled table
 */
function createTable(head, options = {}) {
  return new Table({
    head: head.map((h) => chalk.cyan.bold(h)),
    style: {
      head: [],
      border: ['gray']
    },
    ...options
  });
}

/**
 * Format a list of items
 */
function formatList(items, color = 'white') {
  items.forEach((item) => {
    console.log(chalk[color]('  •'), item);
  });
}

/**
 * Format key-value pairs
 */
function formatKeyValue(obj) {
  Object.entries(obj).forEach(([key, value]) => {
    console.log(chalk.cyan(`${key}:`), value);
  });
}

/**
 * Create a spinner (using ora)
 */
function createSpinner(text) {
  const ora = require('ora');
  return ora({
    text,
    color: 'cyan'
  });
}

module.exports = {
  formatSuccess,
  formatError,
  formatWarning,
  formatInfo,
  formatHeader,
  createTable,
  formatList,
  formatKeyValue,
  createSpinner
};

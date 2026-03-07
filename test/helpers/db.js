/**
 * Test database helpers.
 * Provides utilities for cleaning tables between tests.
 */
const { query, closePool } = require('../../src/config/database');

/**
 * Truncate specified tables (resets auto-increment)
 * @param {string[]} tables - Table names to truncate
 */
async function truncateTables(tables) {
  await query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    await query(`TRUNCATE TABLE ${table}`);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Truncate the hearings table
 */
async function clearHearings() {
  await truncateTables(['hearings']);
}

module.exports = {
  query,
  closePool,
  truncateTables,
  clearHearings
};

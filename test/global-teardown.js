/**
 * Jest global teardown — runs once after all test suites.
 * Closes the database connection pool.
 */
const { closePool } = require('../src/config/database');

module.exports = async function globalTeardown() {
  await closePool();
};

/**
 * Jest global setup — runs once before all test suites.
 * Ensures the test database exists and migrations are applied.
 */
const path = require('path');
const dotenv = require('dotenv');

module.exports = async function globalSetup() {
  dotenv.config({ path: path.join(__dirname, '../.env.test') });

  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must run with NODE_ENV=test. Check your .env.test file.');
  }

  if (!process.env.DB_NAME || !process.env.DB_NAME.includes('test')) {
    throw new Error(
      `Refusing to run tests: DB_NAME="${process.env.DB_NAME}" does not contain "test". ` +
        'This safety check prevents accidentally wiping a non-test database.'
    );
  }

  // Run migrations against test database
  const { runMigrations } = require('../src/db/migrator');
  await runMigrations();
};

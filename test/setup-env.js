/**
 * Jest setup file — runs before each test file.
 * Loads .env.test so all tests use the test database.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.test') });

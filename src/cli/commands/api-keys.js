/**
 * API Key Management Commands
 */

const User = require('../../models/User');
const ApiKey = require('../../models/ApiKey');
const ApiKeyService = require('../../services/api-key-service');
const config = require('../../config/config');
const {
  formatError,
  formatWarning,
  formatInfo,
  formatSuccess,
  createTable
} = require('../utils/format');

/**
 * Formats a UTC date as "YYYY-MM-DD HH:MM", or a dash when absent.
 */
function formatUtc(date) {
  return date ? date.toISOString().replace('T', ' ').slice(0, 16) : '—';
}

/**
 * Loads the user named by --id or --email, exiting when neither is given or none is found.
 */
async function findUserOrExit(options) {
  let user = null;

  if (options.id) {
    user = await User.findById(parseInt(options.id, 10));
  } else if (options.email) {
    user = await User.findByEmail(options.email);
  } else {
    formatError('Please specify --id or --email');
    process.exit(1);
  }

  if (!user) {
    formatError('User not found');
    process.exit(1);
  }

  return user;
}

/**
 * Parses --expires, exiting when it isn't a whole number of days in range.
 */
function parseExpiryOrExit(options) {
  let expiryDays = config.apiKeys.defaultExpiryDays;

  if (options.expires !== undefined) {
    expiryDays = Number(options.expires);
    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 3650) {
      formatError('--expires must be a whole number of days between 1 and 3650');
      process.exit(1);
    }
  }

  return expiryDays;
}

/**
 * Prints a newly issued key, which is shown only this once.
 */
function printIssuedKey({ key, apiKey }) {
  console.log();
  console.log(`  ${key}`);
  console.log();
  formatWarning('Copy the key now. Only its hash is stored, so it cannot be shown again.');
  formatInfo(
    `Key id ${apiKey.public_id} for ${apiKey.user_email}, expires ${formatUtc(apiKey.expires_at)} UTC`
  );
}

/**
 * Create an API key for a user
 */
async function createApiKey(options) {
  try {
    const user = await findUserOrExit(options);
    const expiryDays = parseExpiryOrExit(options);

    if (!options.label || !options.label.trim() || options.label.length > 100) {
      formatError('Please give the key a --label of up to 100 characters, e.g. "Claude agent"');
      process.exit(1);
    }

    const issued = await ApiKeyService.create(user, options.label.trim(), expiryDays);

    formatSuccess(`API key "${issued.apiKey.label}" created`);
    printIssuedKey(issued);
    process.exit(0);
  } catch (error) {
    formatError(`Failed to create API key: ${error.message}`);
    process.exit(1);
  }
}

/**
 * List API keys, optionally for one user
 */
async function listApiKeys(options) {
  try {
    const user = options.id || options.email ? await findUserOrExit(options) : null;
    const apiKeys = await ApiKey.list(user ? user.id : null);

    if (apiKeys.length === 0) {
      formatInfo('No API keys found');
      process.exit(0);
    }

    const table = createTable([
      'Key id',
      'Owner',
      'Label',
      'Created',
      'Last used',
      'Expires',
      'State'
    ]);

    for (const apiKey of apiKeys) {
      table.push([
        apiKey.public_id,
        apiKey.user_email,
        apiKey.label,
        formatUtc(apiKey.created_at),
        apiKey.last_used_at ? `${formatUtc(apiKey.last_used_at)}\n${apiKey.last_used_ip}` : 'never',
        formatUtc(apiKey.expires_at),
        apiKey.state
      ]);
    }

    console.log();
    console.log(table.toString());
    console.log();
    formatInfo(`${apiKeys.length} key(s); times are UTC`);
    process.exit(0);
  } catch (error) {
    formatError(`Failed to list API keys: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Replace an API key with a new one for the same owner and label
 */
async function rotateApiKey(options) {
  try {
    if (!options.key) {
      formatError('Please specify --key <key id>');
      process.exit(1);
    }

    const expiryDays = parseExpiryOrExit(options);
    const issued = await ApiKeyService.rotate(options.key, expiryDays);

    formatSuccess(`API key ${options.key} revoked and replaced`);
    printIssuedKey(issued);
    process.exit(0);
  } catch (error) {
    formatError(`Failed to rotate API key: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Revoke one API key
 */
async function revokeApiKey(options) {
  try {
    if (!options.key) {
      formatError('Please specify --key <key id>');
      process.exit(1);
    }

    const existing = await ApiKey.findByPublicId(options.key);

    if (!existing) {
      formatError(`No API key with id ${options.key}`);
      process.exit(1);
    }

    if (await ApiKey.revoke(options.key)) {
      formatSuccess(`API key ${options.key} ("${existing.label}") revoked`);
    } else {
      formatInfo(`API key ${options.key} was already revoked`);
    }
    process.exit(0);
  } catch (error) {
    formatError(`Failed to revoke API key: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Revoke every API key a user holds
 */
async function revokeAllApiKeys(options) {
  try {
    const user = await findUserOrExit(options);
    const revoked = await ApiKey.revokeAllForUser(user.id);

    formatSuccess(`${revoked} API key(s) revoked for ${user.email}`);
    process.exit(0);
  } catch (error) {
    formatError(`Failed to revoke API keys: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  createApiKey,
  listApiKeys,
  rotateApiKey,
  revokeApiKey,
  revokeAllApiKeys
};

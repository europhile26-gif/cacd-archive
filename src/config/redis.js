/**
 * Redis Client
 * Connection for state shared between PM2 instances
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Creates a Redis client that fails commands fast while disconnected and logs each outage once.
 */
function createRedisClient(url, purpose) {
  const client = new Redis(url, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    // Without this, commands queue while Redis is down and requests wait on them
    enableOfflineQueue: false,
    // Disconnecting starts this timer, cleared only by a socket close that a refused socket
    // has already had, so it holds shutdown open for its full length
    disconnectTimeout: 100
  });
  let connected = true;

  // ioredis emits 'error' on every reconnect attempt, so only the first of an outage is logged
  client.on('error', (error) => {
    if (connected) {
      connected = false;
      logger.error(`Redis unavailable; ${purpose} is failing open until it reconnects`, {
        error: error.message
      });
    }
  });

  client.on('ready', () => {
    if (!connected) {
      connected = true;
      logger.info(`Redis reconnected; ${purpose} restored`);
    }
  });

  return client;
}

/**
 * Resolves once the client's first connection attempt succeeds or fails.
 */
function waitForFirstConnection(client) {
  return new Promise((resolve) => {
    client.once('ready', resolve);
    client.once('error', resolve);
  });
}

module.exports = { createRedisClient, waitForFirstConnection };

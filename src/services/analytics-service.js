/**
 * Analytics Service
 * Buffers request records in memory and writes them in batches, so per-request
 * database writes never sit on the request path. Logging is best-effort by design:
 * a database problem loses analytics rows rather than failing user requests.
 */

const crypto = require('crypto');
const { query } = require('../config/database');
const config = require('../config/config');
const logger = require('../utils/logger');

const INSERT_COLUMNS = [
  'ip',
  'method',
  'route',
  'status_code',
  'duration_ms',
  'user_agent',
  'country_code',
  'asn',
  'asn_org',
  'fingerprint',
  'user_id',
  'created_at'
];

let buffer = [];
let flushTimer = null;
let droppedRecords = 0;

/**
 * Salted daily-rotating pseudo-session key.
 * The date component means a fingerprint cannot be correlated across days, and the
 * secret is what stops the hash being reversed — IPv4 plus a small set of user agents
 * is a brute-forceable input space on its own.
 */
function buildFingerprint(ipAddress, userAgent, now = new Date()) {
  const dateSalt = now.toISOString().slice(0, 10);

  return crypto
    .createHash('sha256')
    .update(
      `${config.analytics.fingerprintSecret}:${dateSalt}:${ipAddress || ''}:${userAgent || ''}`
    )
    .digest('hex');
}

/**
 * True when the route should not be logged at all.
 */
function isExcludedRoute(route) {
  return config.analytics.excludeRoutes.some((excluded) => route.startsWith(excluded));
}

/**
 * Writes the buffered records, replacing the buffer first so concurrent
 * logRequest() calls during the await land in the next batch rather than being lost.
 */
async function flush() {
  if (buffer.length === 0) {
    return;
  }

  const records = buffer;
  buffer = [];

  const placeholders = records
    .map(() => `(${INSERT_COLUMNS.map(() => '?').join(', ')})`)
    .join(', ');
  const values = records.flatMap((record) => INSERT_COLUMNS.map((column) => record[column]));

  try {
    await query(
      `INSERT INTO request_log (${INSERT_COLUMNS.join(', ')}) VALUES ${placeholders}`,
      values
    );
  } catch (error) {
    droppedRecords += records.length;
    logger.error('Failed to write analytics batch — records dropped', {
      records: records.length,
      droppedTotal: droppedRecords,
      error: error.message
    });
  }
}

/**
 * Queues one request record, flushing early once the batch threshold is reached.
 */
function logRequest(record) {
  buffer.push(record);

  if (buffer.length >= config.analytics.flushBatchSize) {
    // Deliberately not awaited: the caller is an onResponse hook.
    flush().catch((error) => {
      logger.error('Analytics flush failed', { error: error.message });
    });
  }
}

/**
 * Starts the periodic flush. Safe to call more than once.
 */
function start() {
  if (flushTimer) {
    return;
  }

  flushTimer = setInterval(() => {
    flush().catch((error) => {
      logger.error('Analytics flush failed', { error: error.message });
    });
  }, config.analytics.flushIntervalMs);

  // Do not hold the event loop open on shutdown.
  flushTimer.unref();
}

/**
 * Stops the timer and writes whatever is still buffered.
 */
async function stop() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  await flush();
}

/**
 * Deletes records older than the retention window. This is what enforces the
 * retention period promised in the privacy notice.
 */
async function purge(retentionDays = config.analytics.retentionDays) {
  const startedAt = Date.now();
  const result = await query('DELETE FROM request_log WHERE created_at < NOW() - INTERVAL ? DAY', [
    retentionDays
  ]);

  const deleted = result.affectedRows || 0;
  logger.info('Analytics purge complete', {
    retentionDays,
    deleted,
    durationMs: Date.now() - startedAt
  });

  return deleted;
}

/**
 * Buffer state, for tests and diagnostics.
 */
function getStatus() {
  return {
    buffered: buffer.length,
    droppedRecords,
    running: flushTimer !== null
  };
}

/**
 * Test hook — clears buffered state between cases.
 */
function reset() {
  buffer = [];
  droppedRecords = 0;
}

module.exports = {
  buildFingerprint,
  isExcludedRoute,
  logRequest,
  flush,
  start,
  stop,
  purge,
  getStatus,
  reset
};

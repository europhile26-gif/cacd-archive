/**
 * Analytics Query Service
 * Read-side aggregations over request_log for the /analytics page.
 * Every query is bounded by a date range so a growing table cannot turn the page
 * into a full scan; each aggregate is served by one of the (column, created_at)
 * indexes on the table.
 */

const { query } = require('../config/database');

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 365;
const TOP_N = 10;

/**
 * Clamps a requested window to something the indexes can serve.
 */
function resolveRangeDays(requestedDays) {
  const days = parseInt(requestedDays, 10);

  if (!Number.isInteger(days) || days < 1) {
    return DEFAULT_RANGE_DAYS;
  }

  return Math.min(days, MAX_RANGE_DAYS);
}

/**
 * Headline counters for the selected window.
 */
async function getTotals(rangeDays) {
  const [totals] = await query(
    `SELECT
       COUNT(*) AS requests,
       COUNT(DISTINCT fingerprint) AS visitors,
       COUNT(DISTINCT ip) AS addresses,
       SUM(status_code >= 400 AND status_code < 500) AS clientErrors,
       SUM(status_code >= 500) AS serverErrors,
       ROUND(AVG(duration_ms)) AS averageDurationMs
     FROM request_log
     WHERE created_at >= NOW() - INTERVAL ? DAY`,
    [rangeDays]
  );

  return {
    requests: Number(totals.requests) || 0,
    visitors: Number(totals.visitors) || 0,
    addresses: Number(totals.addresses) || 0,
    clientErrors: Number(totals.clientErrors) || 0,
    serverErrors: Number(totals.serverErrors) || 0,
    averageDurationMs: Number(totals.averageDurationMs) || 0
  };
}

/**
 * Requests and distinct visitors per day, oldest first, with empty days filled in
 * so the chart keeps an even time axis instead of collapsing gaps.
 */
async function getDailyCounts(rangeDays) {
  const rows = await query(
    `SELECT DATE(created_at) AS day,
            COUNT(*) AS requests,
            COUNT(DISTINCT fingerprint) AS visitors
     FROM request_log
     WHERE created_at >= NOW() - INTERVAL ? DAY
     GROUP BY DATE(created_at)
     ORDER BY day`,
    [rangeDays]
  );

  const countsByDay = new Map(
    rows.map((row) => [
      row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
      { requests: Number(row.requests), visitors: Number(row.visitors) }
    ])
  );

  const series = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - (rangeDays - 1));

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const day = cursor.toISOString().slice(0, 10);
    const counts = countsByDay.get(day) || { requests: 0, visitors: 0 };

    series.push({ day, ...counts });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

// Columns the "top N" aggregate may group by. The column name is interpolated into
// the SQL, so it is restricted to this list rather than taken from a caller.
const GROUPABLE_COLUMNS = {
  route: '',
  ip: ', MAX(country_code) AS country',
  asn: ', MAX(asn_org) AS organisation',
  country_code: ''
};

/**
 * Runs one "top N by request count" aggregate over an allowed column.
 * Companion values (a country for an address, an organisation for an ASN) come
 * through MAX() so they stay out of the GROUP BY.
 */
async function getTopBy(column, rangeDays) {
  const companionColumns = GROUPABLE_COLUMNS[column];

  if (companionColumns === undefined) {
    throw new Error(`Cannot group analytics by "${column}"`);
  }

  const rows = await query(
    `SELECT ${column} AS value${companionColumns},
            COUNT(*) AS requests,
            COUNT(DISTINCT fingerprint) AS visitors,
            ROUND(AVG(duration_ms)) AS averageDurationMs,
            MAX(created_at) AS lastSeen
     FROM request_log
     WHERE created_at >= NOW() - INTERVAL ? DAY AND ${column} IS NOT NULL
     GROUP BY ${column}
     ORDER BY requests DESC
     LIMIT ${TOP_N}`,
    [rangeDays]
  );

  return rows.map((row) => ({
    value: row.value,
    organisation: row.organisation ?? null,
    country: row.country ?? null,
    requests: Number(row.requests),
    visitors: Number(row.visitors),
    averageDurationMs: Number(row.averageDurationMs) || 0,
    lastSeen: row.lastSeen
  }));
}

/**
 * Status codes grouped into 2xx/3xx/4xx/5xx bands.
 */
async function getStatusBands(rangeDays) {
  const rows = await query(
    `SELECT CONCAT(FLOOR(status_code / 100), 'xx') AS band, COUNT(*) AS requests
     FROM request_log
     WHERE created_at >= NOW() - INTERVAL ? DAY
     GROUP BY band
     ORDER BY band`,
    [rangeDays]
  );

  return rows.map((row) => ({ band: row.band, requests: Number(row.requests) }));
}

/**
 * Everything the summary endpoint returns, in one round of queries.
 */
async function getSummary(requestedDays) {
  const rangeDays = resolveRangeDays(requestedDays);

  const [totals, daily, topRoutes, topAddresses, topAsns, topCountries, statusBands] =
    await Promise.all([
      getTotals(rangeDays),
      getDailyCounts(rangeDays),
      getTopBy('route', rangeDays),
      getTopBy('ip', rangeDays),
      getTopBy('asn', rangeDays),
      getTopBy('country_code', rangeDays),
      getStatusBands(rangeDays)
    ]);

  return {
    rangeDays,
    totals,
    daily,
    topRoutes,
    topAddresses,
    topAsns,
    topCountries,
    statusBands
  };
}

/**
 * Paginated raw log, newest first, with optional filters.
 */
async function getRequests(filters = {}) {
  const rangeDays = resolveRangeDays(filters.days);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);

  const conditions = ['created_at >= NOW() - INTERVAL ? DAY'];
  const params = [rangeDays];

  const equalityFilters = [
    ['ip', filters.ip],
    ['country_code', filters.country],
    ['asn', filters.asn],
    ['status_code', filters.status],
    ['fingerprint', filters.fingerprint],
    ['method', filters.method]
  ];

  for (const [column, value] of equalityFilters) {
    if (value !== undefined && value !== null && value !== '') {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }

  if (filters.route) {
    conditions.push('route LIKE ?');
    params.push(`%${filters.route}%`);
  }

  const whereClause = conditions.join(' AND ');

  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM request_log WHERE ${whereClause}`,
    params
  );

  const rows = await query(
    `SELECT id, ip, method, route, status_code, duration_ms, user_agent,
            country_code, asn, asn_org, fingerprint, user_id, created_at
     FROM request_log
     WHERE ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { total: Number(total), limit, offset, rangeDays, requests: rows };
}

/**
 * One pseudo-session: every request sharing a fingerprint, oldest first.
 */
async function getSession(fingerprint, rangeDays) {
  const rows = await query(
    `SELECT id, method, route, status_code, duration_ms, created_at
     FROM request_log
     WHERE fingerprint = ? AND created_at >= NOW() - INTERVAL ? DAY
     ORDER BY id`,
    [fingerprint, resolveRangeDays(rangeDays)]
  );

  return { fingerprint, requests: rows };
}

module.exports = {
  resolveRangeDays,
  getSummary,
  getRequests,
  getSession,
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS
};

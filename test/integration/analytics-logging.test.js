/**
 * Tests the request-logging hook end to end against the test database:
 * what gets written, what is deliberately left out, and that retention purges.
 */
process.env.ANALYTICS_ENABLED = 'true';
process.env.ANALYTICS_FINGERPRINT_SECRET = 'integration-test-secret';
process.env.TRUSTED_PROXIES = 'loopback';
process.env.BLOCKED_COUNTRIES = '';

const { createServer } = require('../../src/api/server');
const analyticsService = require('../../src/services/analytics-service');
const geoipService = require('../../src/services/geoip-service');
const { query, closePool } = require('../helpers/db');

// Google Public DNS - stable in GeoLite2 as US / AS15169.
const KNOWN_IP = '8.8.8.8';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64)';

async function get(server, url, extraHeaders = {}) {
  return server.inject({
    method: 'GET',
    url,
    headers: { 'x-forwarded-for': KNOWN_IP, 'user-agent': USER_AGENT, ...extraHeaders }
  });
}

describe('request analytics logging', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    await analyticsService.stop();
    geoipService.close();
  });

  beforeEach(async () => {
    analyticsService.reset();
    await query('DELETE FROM request_log');
  });

  test('records method, route, status and duration', async () => {
    await get(server, '/api/v1/config');
    await analyticsService.flush();

    const rows = await query('SELECT * FROM request_log');

    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('GET');
    expect(rows[0].route).toBe('/api/v1/config');
    expect(rows[0].status_code).toBe(200);
    expect(rows[0].duration_ms).not.toBeNull();
  });

  test('resolves country and ASN from the client address', async () => {
    await get(server, '/api/v1/config');
    await analyticsService.flush();

    const [row] = await query('SELECT * FROM request_log');

    expect(row.ip).toBe(KNOWN_IP);
    expect(row.country_code).toBe('US');
    expect(row.asn).toBe(15169);
    expect(row.asn_org).toMatch(/Google/);
  });

  test('never stores query parameters, only the route pattern', async () => {
    await get(server, '/api/v1/hearings?search=SENSITIVE+NAME&caseNumber=SECRET123&limit=5');
    await analyticsService.flush();

    const [row] = await query('SELECT * FROM request_log');

    expect(row.route).toBe('/api/v1/hearings');
    expect(row.route).not.toContain('SENSITIVE');
    expect(row.route).not.toContain('SECRET123');
    expect(row.route).not.toContain('?');
  });

  test('stores the route pattern rather than interpolated path values', async () => {
    await get(server, '/api/v1/hearings/dates');
    await analyticsService.flush();

    const [row] = await query('SELECT * FROM request_log');

    expect(row.route.startsWith('/api/v1/hearings')).toBe(true);
  });

  test('skips excluded routes', async () => {
    await get(server, '/api/v1/health');
    await analyticsService.flush();

    expect(await query('SELECT * FROM request_log')).toHaveLength(0);
  });

  test('skips requests sending DNT: 1', async () => {
    await get(server, '/api/v1/config', { dnt: '1' });
    await analyticsService.flush();

    expect(await query('SELECT * FROM request_log')).toHaveLength(0);
  });

  test('logs unmatched paths so probe attempts stay visible', async () => {
    await get(server, '/wp-admin/setup-config.php');
    await analyticsService.flush();

    const [row] = await query('SELECT * FROM request_log');

    expect(row.status_code).toBe(404);
    expect(row.route).toBe('/wp-admin/setup-config.php');
  });

  test('groups a client into one pseudo-session across requests', async () => {
    await get(server, '/api/v1/config');
    await get(server, '/api/v1/hearings');
    await analyticsService.flush();

    const rows = await query('SELECT DISTINCT fingerprint FROM request_log');

    expect(rows).toHaveLength(1);
    expect(rows[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('separates different clients into different pseudo-sessions', async () => {
    await get(server, '/api/v1/config');
    await server.inject({
      method: 'GET',
      url: '/api/v1/config',
      headers: { 'x-forwarded-for': '198.51.100.4', 'user-agent': USER_AGENT }
    });
    await analyticsService.flush();

    expect(await query('SELECT DISTINCT fingerprint FROM request_log')).toHaveLength(2);
  });

  test('leaves user_id null for unauthenticated requests', async () => {
    await get(server, '/api/v1/config');
    await analyticsService.flush();

    const [row] = await query('SELECT * FROM request_log');

    expect(row.user_id).toBeNull();
  });
});

describe('analytics retention purge', () => {
  beforeEach(async () => {
    await query('DELETE FROM request_log');
  });

  afterAll(async () => {
    await query('DELETE FROM request_log');
    await closePool();
  });

  test('deletes records older than the retention window and keeps newer ones', async () => {
    await query(
      `INSERT INTO request_log (method, route, status_code, created_at) VALUES
        ('GET', '/old', 200, NOW() - INTERVAL 31 DAY),
        ('GET', '/edge', 200, NOW() - INTERVAL 29 DAY),
        ('GET', '/new', 200, NOW())`
    );

    const deleted = await analyticsService.purge(30);
    const remaining = await query('SELECT route FROM request_log ORDER BY route');

    expect(deleted).toBe(1);
    expect(remaining.map((row) => row.route)).toEqual(['/edge', '/new']);
  });

  test('accepts an explicit retention override', async () => {
    await query(
      `INSERT INTO request_log (method, route, status_code, created_at)
       VALUES ('GET', '/old', 200, NOW() - INTERVAL 8 DAY)`
    );

    expect(await analyticsService.purge(7)).toBe(1);
  });
});

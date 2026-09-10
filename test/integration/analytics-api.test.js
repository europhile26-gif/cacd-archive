/**
 * Tests the analytics read endpoints and their capability gate.
 * The request log holds IP addresses and pseudo-session data, so the gating matters
 * as much as the aggregates being right.
 */
process.env.ANALYTICS_ENABLED = 'true';
process.env.ANALYTICS_FINGERPRINT_SECRET = 'analytics-api-test-secret';
process.env.TRUSTED_PROXIES = 'loopback';
process.env.BLOCKED_COUNTRIES = '';

const { createServer } = require('../../src/api/server');
const analyticsService = require('../../src/services/analytics-service');
const geoipService = require('../../src/services/geoip-service');
const AuthService = require('../../src/services/auth-service');
const PermissionService = require('../../src/services/permission-service');
const User = require('../../src/models/User');
const { query, closePool } = require('../helpers/db');

const FINGERPRINT_A = 'a'.repeat(64);
const FINGERPRINT_B = 'b'.repeat(64);
const TEST_ADMIN_EMAIL = 'analytics-test-admin@example.invalid';
const ACTIVE_STATUS_ID = 2;
const ADMINISTRATOR_ROLE_ID = 1;

/**
 * The test database has no seeded users, so the suite makes its own administrator.
 * requireAuth loads the user from the database and checks the account is active, so
 * a synthetic token is not enough.
 */
async function createTestAdmin() {
  await query('DELETE FROM users WHERE email = ?', [TEST_ADMIN_EMAIL]);

  // status_id 2 is 'active'; 1 is 'pending', which requireAuth rejects with a 403.
  const user = await User.create({
    email: TEST_ADMIN_EMAIL,
    password_hash: 'not-a-real-hash',
    name: 'Analytics Test Admin',
    status_id: ACTIVE_STATUS_ID
  });

  await query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
    user.id,
    ADMINISTRATOR_ROLE_ID
  ]);

  return User.findById(user.id);
}

async function seedRequests() {
  await query('DELETE FROM request_log');
  await query(
    `INSERT INTO request_log
       (ip, method, route, status_code, duration_ms, country_code, asn, asn_org, fingerprint, created_at)
     VALUES
       ('8.8.8.8', 'GET', '/api/v1/hearings', 200, 12, 'US', 15169, 'Google LLC', ?, NOW()),
       ('8.8.8.8', 'GET', '/api/v1/hearings', 200, 8,  'US', 15169, 'Google LLC', ?, NOW()),
       ('8.8.8.8', 'GET', '/login',           200, 4,  'US', 15169, 'Google LLC', ?, NOW()),
       ('1.2.3.4', 'GET', '/',                200, 6,  'GB', 12345, 'Example ISP', ?, NOW()),
       ('1.2.3.4', 'GET', '/nope',            404, 2,  'GB', 12345, 'Example ISP', ?, NOW()),
       ('1.2.3.4', 'GET', '/boom',            500, 3,  'GB', 12345, 'Example ISP', ?, NOW()),
       ('1.2.3.4', 'GET', '/old',             200, 5,  'GB', 12345, 'Example ISP', ?, NOW() - INTERVAL 20 DAY)`,
    [
      FINGERPRINT_A,
      FINGERPRINT_A,
      FINGERPRINT_A,
      FINGERPRINT_B,
      FINGERPRINT_B,
      FINGERPRINT_B,
      FINGERPRINT_B
    ]
  );
}

describe('analytics API', () => {
  let server;
  let cookies;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();

    const user = await createTestAdmin();
    cookies = { accessToken: AuthService.generateAccessToken(user) };

    await seedRequests();
  });

  afterAll(async () => {
    await query('DELETE FROM request_log');
    await query('DELETE FROM users WHERE email = ?', [TEST_ADMIN_EMAIL]);
    await server.close();
    await analyticsService.stop();
    geoipService.close();
    await closePool();
  });

  async function get(url) {
    return server.inject({ method: 'GET', url, cookies });
  }

  describe('access control', () => {
    test('summary requires authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/admin/analytics/summary'
      });

      expect(response.statusCode).toBe(401);
    });

    test.each([
      '/api/v1/admin/analytics/summary',
      '/api/v1/admin/analytics/requests',
      '/api/v1/admin/analytics/status'
    ])('%s requires the system:analytics capability', async (url) => {
      const original = PermissionService.hasCapability;
      PermissionService.hasCapability = async () => false;

      const response = await get(url);
      PermissionService.hasCapability = original;

      expect(response.statusCode).toBe(403);
    });
  });

  describe('summary', () => {
    test('counts requests and distinct visitors in the window', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);

      expect(body.success).toBe(true);
      expect(body.data.totals.requests).toBe(6);
      expect(body.data.totals.visitors).toBe(2);
      expect(body.data.totals.addresses).toBe(2);
    });

    test('separates client and server errors', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);

      expect(body.data.totals.clientErrors).toBe(1);
      expect(body.data.totals.serverErrors).toBe(1);
    });

    test('excludes records outside the window', async () => {
      const week = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);
      const month = JSON.parse((await get('/api/v1/admin/analytics/summary?days=30')).payload);

      expect(week.data.totals.requests).toBe(6);
      expect(month.data.totals.requests).toBe(7);
    });

    test('returns one daily point per day in the range, including empty days', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);

      expect(body.data.daily).toHaveLength(7);
      expect(body.data.daily.every((point) => typeof point.requests === 'number')).toBe(true);
      expect(body.data.daily[body.data.daily.length - 1].requests).toBe(6);
    });

    test('ranks routes by request count', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);

      expect(body.data.topRoutes[0].value).toBe('/api/v1/hearings');
      expect(body.data.topRoutes[0].requests).toBe(2);
    });

    test('reports ASN with its organisation', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);
      const google = body.data.topAsns.find((row) => row.value === 15169);

      expect(google.organisation).toBe('Google LLC');
      expect(google.requests).toBe(3);
    });

    test('bands status codes', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary?days=7')).payload);
      const bands = Object.fromEntries(body.data.statusBands.map((b) => [b.band, b.requests]));

      expect(bands).toEqual({ '2xx': 4, '4xx': 1, '5xx': 1 });
    });

    test('reports whether collection is currently on', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/summary')).payload);

      expect(body.collecting).toBe(true);
      expect(body.retentionDays).toBe(30);
    });
  });

  describe('request log', () => {
    test('returns newest first with a total', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/requests?limit=2')).payload);

      expect(body.total).toBe(6);
      expect(body.requests).toHaveLength(2);
    });

    test('filters by address', async () => {
      const body = JSON.parse((await get('/api/v1/admin/analytics/requests?ip=8.8.8.8')).payload);

      expect(body.total).toBe(3);
      expect(body.requests.every((row) => row.ip === '8.8.8.8')).toBe(true);
    });

    test('filters by status and by country', async () => {
      const errors = JSON.parse((await get('/api/v1/admin/analytics/requests?status=404')).payload);
      const british = JSON.parse(
        (await get('/api/v1/admin/analytics/requests?country=GB')).payload
      );

      expect(errors.total).toBe(1);
      expect(british.total).toBe(3);
    });

    test('filters by route substring', async () => {
      const body = JSON.parse(
        (await get('/api/v1/admin/analytics/requests?route=hearings')).payload
      );

      expect(body.total).toBe(2);
    });

    test('paginates with offset', async () => {
      const first = JSON.parse((await get('/api/v1/admin/analytics/requests?limit=2')).payload);
      const second = JSON.parse(
        (await get('/api/v1/admin/analytics/requests?limit=2&offset=2')).payload
      );

      expect(first.requests[0].id).not.toBe(second.requests[0].id);
    });
  });

  describe('pseudo-sessions', () => {
    test('returns every request sharing a fingerprint, oldest first', async () => {
      const body = JSON.parse(
        (await get(`/api/v1/admin/analytics/sessions/${FINGERPRINT_A}`)).payload
      );

      expect(body.requests).toHaveLength(3);
      expect(body.requests[0].id).toBeLessThan(body.requests[1].id);
    });

    test('rejects a malformed fingerprint', async () => {
      const response = await get('/api/v1/admin/analytics/sessions/not-a-fingerprint');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('status', () => {
    test('reports collection settings without exposing the fingerprint secret', async () => {
      const response = await get('/api/v1/admin/analytics/status');
      const body = JSON.parse(response.payload);

      expect(body.data.enabled).toBe(true);
      expect(body.data.retentionDays).toBe(30);
      expect(response.payload).not.toContain('analytics-api-test-secret');
    });
  });
});

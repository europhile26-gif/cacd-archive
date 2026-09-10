/**
 * Tests the pure parts of analytics-service: the pseudo-session fingerprint and
 * route exclusion. Both run on every request, so they are worth pinning without
 * a database in the way.
 */
process.env.ANALYTICS_ENABLED = 'true';
process.env.ANALYTICS_FINGERPRINT_SECRET = 'unit-test-secret';
process.env.ANALYTICS_EXCLUDE_ROUTES = '/api/v1/health,/api/docs';

const analyticsService = require('../../src/services/analytics-service');

const CLIENT_IP = '203.0.113.9';
const OTHER_IP = '198.51.100.4';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64)';

describe('analytics fingerprint', () => {
  test('is stable for the same client within a day', () => {
    const day = new Date('2026-09-10T09:00:00Z');
    const later = new Date('2026-09-10T23:59:00Z');

    expect(analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT, day)).toBe(
      analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT, later)
    );
  });

  test('rotates across a date boundary, capping linkability at 24h', () => {
    const today = new Date('2026-09-10T23:59:59Z');
    const tomorrow = new Date('2026-09-11T00:00:01Z');

    expect(analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT, today)).not.toBe(
      analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT, tomorrow)
    );
  });

  test('differs by IP and by user agent', () => {
    const day = new Date('2026-09-10T09:00:00Z');
    const base = analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT, day);

    expect(analyticsService.buildFingerprint(OTHER_IP, USER_AGENT, day)).not.toBe(base);
    expect(analyticsService.buildFingerprint(CLIENT_IP, 'curl/8.0', day)).not.toBe(base);
  });

  test('is a sha256 hex digest, not the raw inputs', () => {
    const fingerprint = analyticsService.buildFingerprint(CLIENT_IP, USER_AGENT);

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain(CLIENT_IP);
  });

  test('handles a missing IP or user agent without throwing', () => {
    expect(analyticsService.buildFingerprint(null, null)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('analytics route exclusion', () => {
  test.each([
    ['/api/v1/health', true],
    ['/api/docs', true],
    ['/api/docs/json', true],
    ['/api/v1/hearings', false],
    ['/api/v1/searches', false],
    ['/', false]
  ])('%s excluded: %s', (route, expected) => {
    expect(analyticsService.isExcludedRoute(route)).toBe(expected);
  });
});

describe('analytics buffer', () => {
  beforeEach(() => {
    analyticsService.reset();
  });

  test('queues records without writing immediately', () => {
    analyticsService.logRequest({ method: 'GET', route: '/api/v1/hearings' });

    expect(analyticsService.getStatus().buffered).toBe(1);
  });

  test('starts empty after reset', () => {
    expect(analyticsService.getStatus().buffered).toBe(0);
  });
});

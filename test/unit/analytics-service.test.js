/**
 * Tests the pure parts of analytics-service: the pseudo-session fingerprint and
 * route exclusion. Both run on every request, so they are worth pinning without
 * a database in the way.
 */
process.env.ANALYTICS_ENABLED = 'true';
process.env.ANALYTICS_FINGERPRINT_SECRET = 'unit-test-secret';
process.env.ANALYTICS_EXCLUDE_ROUTES = '/api/v1/health,/api/docs,/vendor';

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
    ['/vendor/bootstrap/x.css', true],
    ['/api/v1/hearings', false],
    ['/api/v1/searches', false],
    ['/', false]
  ])('%s excluded: %s', (route, expected) => {
    expect(analyticsService.isExcludedRoute(route)).toBe(expected);
  });
});

describe('analytics asset exclusion', () => {
  test.each([
    ['/css/styles.css', true],
    ['/js/app.min.js', true],
    ['/favicon.ico', true],
    ['/fonts/bootstrap-icons.woff2', true],
    ['/img/logo.svg', true],
    ['/js/app.js.map', true],
    ['/', false],
    ['/login', false],
    ['/api/v1/hearings', false],
    ['/wp-admin/setup-config.php', false]
  ])('%s is an asset: %s', (pathname, expected) => {
    expect(analyticsService.isAssetPath(pathname)).toBe(expected);
  });
});

describe('analytics route resolution', () => {
  test('keeps the pattern for matched routes so ids group together', () => {
    expect(analyticsService.resolveRoute('/api/v1/hearings/:id', '/api/v1/hearings/42')).toBe(
      '/api/v1/hearings/:id'
    );
  });

  test('uses the real path for wildcard static routes', () => {
    // '/*' would otherwise collapse the homepage, every page view and every probe
    // attempt into a single bucket.
    expect(analyticsService.resolveRoute('/*', '/')).toBe('/');
    expect(analyticsService.resolveRoute('/*', '/login')).toBe('/login');
    expect(analyticsService.resolveRoute('/vendor/bootstrap/*', '/vendor/bootstrap/x.css')).toBe(
      '/vendor/bootstrap/x.css'
    );
  });

  test('uses the real path when nothing matched', () => {
    expect(analyticsService.resolveRoute(undefined, '/wp-admin/setup-config.php')).toBe(
      '/wp-admin/setup-config.php'
    );
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

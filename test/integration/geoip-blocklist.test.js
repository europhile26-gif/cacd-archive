/**
 * Tests the country blocklist hook. It runs before auth and rate limiting, so a
 * blocked address must be refused on every route including public ones, while an
 * address outside the blocklist is unaffected.
 */
process.env.ANALYTICS_ENABLED = 'false';
process.env.TRUSTED_PROXIES = 'loopback';
// AS15169 / 8.8.8.8 resolves to US in GeoLite2; blocking US exercises a real lookup
// rather than relying on an address whose allocation might change.
process.env.BLOCKED_COUNTRIES = 'US';

const { createServer } = require('../../src/api/server');
const geoipService = require('../../src/services/geoip-service');
const { closePool } = require('../helpers/db');

const US_IP = '8.8.8.8';
const PRIVATE_IP = '10.1.2.3';

describe('country blocklist', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    geoipService.close();
    await closePool();
  });

  test.each(['/api/v1/config', '/api/v1/hearings', '/'])(
    'refuses a blocked country on %s',
    async (url) => {
      const response = await server.inject({
        method: 'GET',
        url,
        headers: { 'x-forwarded-for': US_IP }
      });

      expect(response.statusCode).toBe(403);
    }
  );

  test('allows an address that does not resolve to a blocked country', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/config',
      headers: { 'x-forwarded-for': PRIVATE_IP }
    });

    expect(response.statusCode).toBe(200);
  });

  test('allows requests with no forwarded address', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/v1/config' });

    expect(response.statusCode).toBe(200);
  });
});

describe('geoip lookups', () => {
  beforeAll(async () => {
    await geoipService.initialize();
  });

  afterAll(() => {
    geoipService.close();
  });

  test('resolves a known public address', () => {
    expect(geoipService.lookupCountry(US_IP)).toBe('US');
    expect(geoipService.lookupAsn(US_IP)).toEqual({
      asn: 15169,
      organisation: expect.stringMatching(/Google/)
    });
  });

  test('returns null for a private address rather than throwing', () => {
    expect(geoipService.lookupCountry(PRIVATE_IP)).toBeNull();
    expect(geoipService.lookupAsn(PRIVATE_IP)).toEqual({ asn: null, organisation: null });
  });

  test('returns null for a malformed address rather than throwing', () => {
    expect(geoipService.lookupCountry('not-an-ip')).toBeNull();
    expect(geoipService.lookupCountry(null)).toBeNull();
  });
});

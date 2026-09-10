/**
 * Verifies that a client cannot forge its own IP via X-Forwarded-For.
 * Reverse proxies append the real peer to whatever the client sent, so the header
 * arrives as "<client-supplied>, <real client>". request.ip must resolve to the
 * rightmost untrusted address, not the leftmost one the client controls.
 */
const fastify = require('fastify');
const config = require('../../src/config/config');

const REAL_CLIENT = '203.0.113.9';
const FORGED_CLIENT = '9.9.9.9';

function buildServer(trustProxy) {
  const server = fastify({ logger: false, trustProxy });
  server.get('/probe', async (request) => ({ ip: request.ip }));
  return server;
}

async function resolveIp(server, xForwardedFor) {
  const response = await server.inject({
    method: 'GET',
    url: '/probe',
    headers: xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {}
  });
  return JSON.parse(response.payload).ip;
}

describe('trust proxy configuration', () => {
  describe('with the configured trusted proxies', () => {
    let server;

    beforeAll(async () => {
      server = buildServer(config.api.trustedProxies);
      await server.ready();
    });

    afterAll(async () => {
      await server.close();
    });

    test('resolves the real client IP forwarded by the proxy', async () => {
      expect(await resolveIp(server, REAL_CLIENT)).toBe(REAL_CLIENT);
    });

    test('ignores a client-supplied X-Forwarded-For entry', async () => {
      const ip = await resolveIp(server, `${FORGED_CLIENT}, ${REAL_CLIENT}`);

      expect(ip).toBe(REAL_CLIENT);
      expect(ip).not.toBe(FORGED_CLIENT);
    });

    test('ignores a forged chain of several hops', async () => {
      const forgedChain = `1.1.1.1, ${FORGED_CLIENT}, 8.8.8.8, ${REAL_CLIENT}`;

      expect(await resolveIp(server, forgedChain)).toBe(REAL_CLIENT);
    });

    test('falls back to the socket address when no header is present', async () => {
      expect(await resolveIp(server, null)).toBe('127.0.0.1');
    });
  });

  test('the default configuration is not the insecure trust-everything setting', () => {
    expect(config.api.trustedProxies).not.toBe('true');
  });

  test('trustProxy: true would accept a forged IP (documents why it is not used)', async () => {
    const server = buildServer(true);
    await server.ready();

    expect(await resolveIp(server, `${FORGED_CLIENT}, ${REAL_CLIENT}`)).toBe(FORGED_CLIENT);

    await server.close();
  });
});

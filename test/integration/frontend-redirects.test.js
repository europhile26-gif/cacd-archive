/**
 * Tests the .html -> clean-URL redirects in src/api/routes/frontend.js.
 * Fastify 5 takes reply.redirect(url, code); the Fastify 4 order (code, url)
 * throws FST_ERR_BAD_STATUS_CODE and surfaces as a 500, so these assert on the
 * real response rather than on the route table.
 */
const { createServer } = require('../../src/api/server');

const REDIRECT_CASES = [
  { path: '/index.html', target: '/' },
  { path: '/login.html', target: '/login' },
  { path: '/register.html', target: '/register' },
  { path: '/reset-password.html', target: '/reset-password' },
  { path: '/dashboard.html', target: '/dashboard' },
  { path: '/admin.html', target: '/admin' }
];

describe('frontend .html redirects', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  test.each(REDIRECT_CASES)('$path redirects 301 to $target', async ({ path, target }) => {
    const response = await server.inject({ method: 'GET', url: path });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe(target);
  });
});

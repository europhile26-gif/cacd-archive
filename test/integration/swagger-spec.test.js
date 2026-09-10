/**
 * Guards the API version reported by the OpenAPI document.
 * It was hardcoded in src/api/server.js and went eight releases stale before
 * anyone noticed, so this asserts it stays derived from package.json.
 */
const { createServer } = require('../../src/api/server');
const { version } = require('../../package.json');

describe('swagger spec', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  test('reports the package.json version', () => {
    expect(server.swagger().info.version).toBe(version);
  });

  test('serves the spec at /api/docs/json with that version', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).info.version).toBe(version);
  });
});

/**
 * Tests the OpenAPI document: version, security schemes, and which operations accept API keys.
 */
const { createServer } = require('../../src/api/server');
const { closePool } = require('../helpers/db');

describe('OpenAPI document', () => {
  let server;
  let spec;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
    spec = (await server.inject({ method: 'GET', url: '/api/docs/json' })).json();
  });

  afterAll(async () => {
    await server.close();
    await closePool();
  });

  /**
   * Returns the security scheme names an operation lists.
   */
  function securityOf(path, method) {
    return (spec.paths[path][method].security || []).map((entry) => Object.keys(entry)[0]);
  }

  test('is OpenAPI 3.1 with the API key scheme', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.components.securitySchemes.apiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer'
    });
  });

  test('operations open to keys list the API key scheme and say so', () => {
    expect(securityOf('/api/v1/searches', 'post')).toEqual(['session', 'sessionCookie', 'apiKey']);
    expect(spec.paths['/api/v1/searches'].post.description).toContain('Accepts API keys.');
    expect(spec.paths['/api/v1/hearings'].get.description).toContain('Accepts API keys.');
  });

  test('operations closed to keys do not', () => {
    expect(securityOf('/api/v1/admin/users', 'get')).toEqual(['session', 'sessionCookie']);
    expect(spec.paths['/api/v1/admin/users'].get.description || '').not.toContain('API keys');
  });

  test('public operations need no credentials', () => {
    expect(securityOf('/api/v1/hearings', 'get')).toEqual([]);
  });
});

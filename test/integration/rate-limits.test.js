/**
 * Tests the general and credential-route rate limits, the signed-in exemption,
 * health endpoint disclosure and CORS resolution.
 */
process.env.API_RATE_LIMIT_MAX = '3';
process.env.AUTH_RATE_LIMIT_MAX = '2';

const { createServer, resolveCorsOptions } = require('../../src/api/server');
const config = require('../../src/config/config');
const AuthService = require('../../src/services/auth-service');
const User = require('../../src/models/User');
const logger = require('../../src/utils/logger');
const { query, closePool } = require('../helpers/db');

const TEST_USER_EMAIL = 'rate-limit-test@example.invalid';
const ACTIVE_STATUS_ID = 2;

// Every describe below uses the pool, so it is closed once, after all of them.
afterAll(async () => {
  await closePool();
});

describe('rate limits', () => {
  let server;
  let cookies;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();

    await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);
    const user = await User.create({
      email: TEST_USER_EMAIL,
      password_hash: 'not-a-real-hash',
      name: 'Rate Limit Test',
      status_id: ACTIVE_STATUS_ID
    });
    cookies = { accessToken: AuthService.generateAccessToken(user) };
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);
    await server.close();
  });

  /**
   * Sends the same request a number of times from one address and returns the status codes.
   */
  async function repeat(times, request) {
    const statusCodes = [];
    for (let attempt = 0; attempt < times; attempt++) {
      const response = await server.inject(request);
      statusCodes.push(response.statusCode);
    }
    return statusCodes;
  }

  test('anonymous API requests are limited at API_RATE_LIMIT_MAX', async () => {
    const statusCodes = await repeat(4, {
      method: 'GET',
      url: '/api/v1/dates',
      remoteAddress: '198.51.100.1'
    });

    expect(statusCodes).toEqual([200, 200, 200, 429]);
  });

  test('signed-in requests are exempt from the general limit', async () => {
    const statusCodes = await repeat(5, {
      method: 'GET',
      url: '/api/v1/dates',
      remoteAddress: '198.51.100.2',
      cookies
    });

    expect(statusCodes).toEqual([200, 200, 200, 200, 200]);
  });

  test('login is limited at AUTH_RATE_LIMIT_MAX', async () => {
    const statusCodes = await repeat(3, {
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: '198.51.100.3',
      payload: { email: 'nobody@example.invalid', password: 'wrong' }
    });

    expect(statusCodes).toEqual([401, 401, 429]);
  });

  test('a signed-in session is still limited on change-password', async () => {
    const statusCodes = await repeat(3, {
      method: 'POST',
      url: '/api/v1/auth/change-password',
      remoteAddress: '198.51.100.4',
      cookies,
      payload: { currentPassword: 'wrong', newPassword: 'Another-Password-123' }
    });

    expect(statusCodes[2]).toBe(429);
  });
});

describe('health endpoint', () => {
  let server;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  test('reports version and uptime to the host itself', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '127.0.0.1'
    });

    expect(response.json()).toHaveProperty('version');
    expect(response.json()).toHaveProperty('uptime');
  });

  test('withholds version and uptime from remote callers', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '203.0.113.9'
    });

    expect(response.json().status).toBeDefined();
    expect(response.json()).not.toHaveProperty('version');
    expect(response.json()).not.toHaveProperty('uptime');
  });
});

describe('CORS resolution', () => {
  const originalEnv = config.env;
  const originalCors = { ...config.api.cors };

  afterEach(() => {
    config.env = originalEnv;
    Object.assign(config.api.cors, originalCors);
    jest.restoreAllMocks();
  });

  test('production with no listed origins disables CORS and warns', () => {
    const warnLog = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    config.env = 'production';
    Object.assign(config.api.cors, { enabled: true, origins: [] });

    expect(resolveCorsOptions()).toBe(false);
    expect(warnLog).toHaveBeenCalled();
  });

  test('production allows only listed origins', () => {
    config.env = 'production';
    Object.assign(config.api.cors, { enabled: true, origins: ['https://app.example.com'] });

    expect(resolveCorsOptions()).toEqual({
      origin: ['https://app.example.com'],
      credentials: true
    });
  });

  test('development reflects any origin', () => {
    config.env = 'development';
    Object.assign(config.api.cors, { enabled: true, origins: [] });

    expect(resolveCorsOptions()).toEqual({ origin: true, credentials: true });
  });

  test('disabled stays disabled', () => {
    config.env = 'production';
    Object.assign(config.api.cors, { enabled: false, origins: ['https://app.example.com'] });

    expect(resolveCorsOptions()).toBe(false);
  });
});

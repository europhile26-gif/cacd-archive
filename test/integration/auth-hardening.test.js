/**
 * Regression tests for the v1.20.2 security fixes: password hash exposure, self-service
 * email changes, unlogged errors and raw error messages reaching clients.
 */
const { createServer } = require('../../src/api/server');
const AuthService = require('../../src/services/auth-service');
const User = require('../../src/models/User');
const database = require('../../src/config/database');
const logger = require('../../src/utils/logger');
const { query, closePool } = require('../helpers/db');

const TEST_USER_EMAIL = 'auth-hardening-test@example.invalid';

/**
 * Makes pool queries matching the pattern fail with the given message.
 */
function failQueriesMatching(pattern, message) {
  const pool = database.createPool();
  const originalQuery = pool.query.bind(pool);

  jest.spyOn(pool, 'query').mockImplementation((sql, params) => {
    if (pattern.test(sql)) {
      return Promise.reject(new Error(message));
    }
    return originalQuery(sql, params);
  });
}
const ACTIVE_STATUS_ID = 2;

/**
 * Creates an active user holding the default 'user' role.
 */
async function createTestUser() {
  await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);

  const user = await User.create({
    email: TEST_USER_EMAIL,
    password_hash: 'stored-password-hash',
    name: 'Auth Hardening Test',
    status_id: ACTIVE_STATUS_ID
  });

  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT ?, id FROM roles WHERE slug = 'user'`,
    [user.id]
  );

  return User.findById(user.id);
}

describe('auth hardening', () => {
  let server;
  let user;
  let cookies;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();

    user = await createTestUser();
    cookies = { accessToken: AuthService.generateAccessToken(user) };
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);
    await server.close();
    await closePool();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('password hash exposure', () => {
    test('GET /users/me never includes password_hash', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/v1/users/me', cookies });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('password_hash');
      expect(response.body).not.toContain('stored-password-hash');
    });

    test('a failed credential lookup does not leak hashes into later requests', async () => {
      jest.spyOn(User, 'findByEmail').mockRejectedValueOnce(new Error('database unavailable'));
      await expect(User.findForAuth(TEST_USER_EMAIL)).rejects.toThrow('database unavailable');

      const response = await server.inject({ method: 'GET', url: '/api/v1/users/me', cookies });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('stored-password-hash');
    });

    test('GET /users/me returns the profile fields', async () => {
      const response = await server.inject({ method: 'GET', url: '/api/v1/users/me', cookies });
      const body = response.json();

      expect(body.user).toMatchObject({
        id: user.id,
        email: TEST_USER_EMAIL,
        name: 'Auth Hardening Test',
        status: { slug: 'active', is_active: true }
      });
      expect(Array.isArray(body.navigation)).toBe(true);
    });
  });

  describe('PATCH /users/me', () => {
    test('updates the name and returns the updated profile', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        cookies,
        payload: { name: 'Renamed User' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ id: user.id, name: 'Renamed User' });
    });

    test('cannot change the account email', async () => {
      await server.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        cookies,
        payload: { name: 'Renamed User', email: 'attacker@example.invalid' }
      });

      const stored = await User.findById(user.id);
      expect(stored.email).toBe(TEST_USER_EMAIL);
    });
  });

  describe('error handling', () => {
    test('unhandled route errors are logged and return a generic 500', async () => {
      failQueriesMatching(/FROM hearings/, 'SQL syntax near SECRET');
      const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => {});

      const response = await server.inject({ method: 'GET', url: '/api/v1/hearings' });

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('SECRET');
      expect(errorLog).toHaveBeenCalled();
    });

    test('handled route errors are logged', async () => {
      jest.spyOn(User, 'getRoles').mockRejectedValueOnce(new Error('roles lookup failed'));
      const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => {});

      const response = await server.inject({ method: 'GET', url: '/api/v1/users/me', cookies });

      expect(response.statusCode).toBe(500);
      expect(errorLog).toHaveBeenCalled();
    });

    test('saved search failures do not return the underlying error text', async () => {
      failQueriesMatching(/saved_searches/, 'Table saved_searches is marked as crashed');
      jest.spyOn(logger, 'error').mockImplementation(() => {});

      const response = await server.inject({ method: 'GET', url: '/api/v1/searches', cookies });

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('crashed');
    });
  });

  describe('token verification', () => {
    test('rejects tokens signed with a different algorithm', async () => {
      const jwt = require('jsonwebtoken');
      const forged = jwt.sign({ id: user.id, type: 'access' }, process.env.JWT_SECRET, {
        algorithm: 'HS512'
      });

      expect(AuthService.verifyToken(forged)).toBeNull();
    });
  });
});

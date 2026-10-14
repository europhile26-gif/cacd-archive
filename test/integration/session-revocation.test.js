/**
 * Tests that tokens are revoked by password changes and revoke-sessions, and that the
 * session making a password change keeps working with the tokens it is reissued.
 */
const jwt = require('jsonwebtoken');
const { createServer } = require('../../src/api/server');
const AuthService = require('../../src/services/auth-service');
const User = require('../../src/models/User');
const { query, closePool } = require('../helpers/db');

const TEST_USER_EMAIL = 'session-revocation-test@example.invalid';
const ORIGINAL_PASSWORD = 'Original-Password-123';
const ACTIVE_STATUS_ID = 2;

describe('session revocation', () => {
  let server;
  let user;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  beforeEach(async () => {
    await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);
    const created = await User.create({
      email: TEST_USER_EMAIL,
      password_hash: await AuthService.hashPassword(ORIGINAL_PASSWORD),
      name: 'Session Revocation Test',
      status_id: ACTIVE_STATUS_ID
    });
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE slug = 'user'`,
      [created.id]
    );
    user = await User.findById(created.id);
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email = ?', [TEST_USER_EMAIL]);
    await server.close();
    await closePool();
  });

  /**
   * Requests the caller's profile with the given access token.
   */
  function getProfile(accessToken) {
    return server.inject({ method: 'GET', url: '/api/v1/users/me', cookies: { accessToken } });
  }

  test('login returns the profile without internal fields', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_USER_EMAIL, password: ORIGINAL_PASSWORD }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.user).toMatchObject({ id: user.id, email: TEST_USER_EMAIL });
    expect(body.user).not.toHaveProperty('password_hash');
    expect(body.user).not.toHaveProperty('token_version');
  });

  test('a current token is accepted', async () => {
    const response = await getProfile(AuthService.generateAccessToken(user));

    expect(response.statusCode).toBe(200);
  });

  test('a token issued without a version is rejected', async () => {
    const legacyToken = jwt.sign({ id: user.id, type: 'access' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m'
    });

    const response = await getProfile(legacyToken);

    expect(response.statusCode).toBe(401);
  });

  test('revoking sessions invalidates existing access and refresh tokens', async () => {
    const accessToken = AuthService.generateAccessToken(user);
    const refreshToken = AuthService.generateRefreshToken(user);

    await User.revokeSessions(user.id);

    const profile = await getProfile(accessToken);
    const refresh = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken }
    });

    expect(profile.statusCode).toBe(401);
    expect(refresh.statusCode).toBe(401);
  });

  test('changing password revokes old tokens but keeps the changing session signed in', async () => {
    const oldAccessToken = AuthService.generateAccessToken(user);

    const change = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      cookies: { accessToken: oldAccessToken },
      payload: { currentPassword: ORIGINAL_PASSWORD, newPassword: 'Replacement-Password-456' }
    });
    const reissued = change.cookies.find((cookie) => cookie.name === 'accessToken');

    expect(change.statusCode).toBe(200);
    expect((await getProfile(oldAccessToken)).statusCode).toBe(401);
    expect((await getProfile(reissued.value)).statusCode).toBe(200);
  });
});

/**
 * Tests saved search routes: capability gating, ownership, response shape and the
 * per-user cap holding under concurrent creates.
 */
process.env.SAVED_SEARCH_MAX_PER_USER = '3';

const { createServer } = require('../../src/api/server');
const AuthService = require('../../src/services/auth-service');
const PermissionService = require('../../src/services/permission-service');
const User = require('../../src/models/User');
const { query, closePool } = require('../helpers/db');

const OWNER_EMAIL = 'saved-search-owner@example.invalid';
const OTHER_EMAIL = 'saved-search-other@example.invalid';
const ACTIVE_STATUS_ID = 2;

/**
 * Creates an active user with the default 'user' role and returns session cookies for it.
 */
async function createUserSession(email) {
  await query('DELETE FROM users WHERE email = ?', [email]);
  const user = await User.create({
    email,
    password_hash: 'not-a-real-hash',
    name: email,
    status_id: ACTIVE_STATUS_ID
  });
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT ?, id FROM roles WHERE slug = 'user'`,
    [user.id]
  );

  return { user, cookies: { accessToken: AuthService.generateAccessToken(user) } };
}

describe('saved searches API', () => {
  let server;
  let owner;
  let other;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
    owner = await createUserSession(OWNER_EMAIL);
    other = await createUserSession(OTHER_EMAIL);
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email IN (?, ?)', [OWNER_EMAIL, OTHER_EMAIL]);
    await server.close();
    await closePool();
  });

  beforeEach(async () => {
    await query('DELETE FROM saved_searches WHERE user_id IN (?, ?)', [
      owner.user.id,
      other.user.id
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Creates a saved search as the given session.
   */
  function createSearch(session, searchText) {
    return server.inject({
      method: 'POST',
      url: '/api/v1/searches',
      cookies: session.cookies,
      payload: { search_text: searchText }
    });
  }

  test('returns flags as booleans', async () => {
    const response = await createSearch(owner, 'Smith');

    expect(response.statusCode).toBe(201);
    expect(response.json().search).toMatchObject({
      search_text: 'Smith',
      enabled: true,
      future_only: false
    });
    expect(response.json().search).not.toHaveProperty('user_id');
  });

  test("a user cannot read, change or delete another user's search", async () => {
    const created = (await createSearch(owner, 'Jones')).json().search;
    const url = `/api/v1/searches/${created.id}`;

    const read = await server.inject({ method: 'GET', url, cookies: other.cookies });
    const update = await server.inject({
      method: 'PATCH',
      url,
      cookies: other.cookies,
      payload: { enabled: false }
    });
    const remove = await server.inject({ method: 'DELETE', url, cookies: other.cookies });

    expect([read.statusCode, update.statusCode, remove.statusCode]).toEqual([404, 404, 404]);
  });

  test('creating requires the searches:create capability', async () => {
    jest
      .spyOn(PermissionService, 'hasCapability')
      .mockImplementation(async (_userId, capability) => capability !== 'searches:create');

    const response = await createSearch(owner, 'Brown');

    expect(response.statusCode).toBe(403);
  });

  test('listing requires the searches:view-own capability', async () => {
    jest
      .spyOn(PermissionService, 'hasCapability')
      .mockImplementation(async (_userId, capability) => capability !== 'searches:view-own');

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/searches',
      cookies: owner.cookies
    });

    expect(response.statusCode).toBe(403);
  });

  test('concurrent creates cannot exceed the per-user cap', async () => {
    const responses = await Promise.all(
      ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((text) =>
        createSearch(owner, text)
      )
    );
    const statusCodes = responses.map((response) => response.statusCode).sort();
    const stored = await query('SELECT COUNT(*) AS count FROM saved_searches WHERE user_id = ?', [
      owner.user.id
    ]);

    expect(statusCodes).toEqual([201, 201, 201, 400, 400, 400]);
    expect(stored[0].count).toBe(3);
  });
});

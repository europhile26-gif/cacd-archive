/**
 * Tests the admin safety rails: no self status changes or role changes, no removing the
 * last administrator, explicit user output, and one manual scrape at a time.
 */
const { createServer } = require('../../src/api/server');
const AuthService = require('../../src/services/auth-service');
const User = require('../../src/models/User');
const scheduler = require('../../src/scrapers/scheduler');
const { query, closePool } = require('../helpers/db');

const ADMIN_EMAIL = 'admin-safety-primary@example.invalid';
const SECOND_ADMIN_EMAIL = 'admin-safety-secondary@example.invalid';
const ACTIVE_STATUS_ID = 2;
const INACTIVE_STATUS_ID = 3;

/**
 * Creates an active administrator and returns the user.
 */
async function createAdministrator(email) {
  await query('DELETE FROM users WHERE email = ?', [email]);
  const user = await User.create({
    email,
    password_hash: 'not-a-real-hash',
    name: email,
    status_id: ACTIVE_STATUS_ID
  });
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT ?, id FROM roles WHERE slug = 'administrator'`,
    [user.id]
  );
  return User.findById(user.id);
}

describe('admin safety rails', () => {
  let server;
  let admin;
  let cookies;
  let administratorRoleId;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
    const roles = await query("SELECT id FROM roles WHERE slug = 'administrator'");
    administratorRoleId = roles[0].id;
  });

  beforeEach(async () => {
    await query('DELETE FROM users WHERE email = ?', [SECOND_ADMIN_EMAIL]);
    admin = await createAdministrator(ADMIN_EMAIL);
    cookies = { accessToken: AuthService.generateAccessToken(admin) };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email IN (?, ?)', [ADMIN_EMAIL, SECOND_ADMIN_EMAIL]);
    await server.close();
    await closePool();
  });

  test('an administrator cannot change their own status', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${admin.id}`,
      cookies,
      payload: { status_id: INACTIVE_STATUS_ID }
    });

    expect(response.statusCode).toBe(400);
    expect((await User.findById(admin.id)).status.id).toBe(ACTIVE_STATUS_ID);
  });

  test('an administrator cannot assign roles to themselves', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${admin.id}/roles`,
      cookies,
      payload: { roleId: administratorRoleId }
    });

    expect(response.statusCode).toBe(400);
  });

  test('the last active administrator cannot lose the role', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/v1/admin/users/${admin.id}/roles/${administratorRoleId}`,
      cookies
    });

    expect(response.statusCode).toBe(400);
  });

  test('the role can be removed while another administrator remains', async () => {
    const second = await createAdministrator(SECOND_ADMIN_EMAIL);

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/v1/admin/users/${second.id}/roles/${administratorRoleId}`,
      cookies
    });

    expect(response.statusCode).toBe(200);
  });

  test('user details list their fields and nothing internal', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${admin.id}`,
      cookies
    });
    const { user } = response.json();

    expect(user).toMatchObject({ id: admin.id, email: ADMIN_EMAIL, status: { id: 2 } });
    expect(user.roles.map((role) => role.slug)).toContain('administrator');
    expect(user).not.toHaveProperty('token_version');
    expect(user).not.toHaveProperty('password_hash');
  });

  test('a manual scrape is refused while one is running', async () => {
    jest.spyOn(scheduler, 'startManualScrape').mockReturnValue(false);
    const sources = await query("SELECT id FROM data_sources WHERE slug = 'daily_cause_list'");

    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/admin/data-sources/${sources[0].id}/scrape`,
      cookies
    });

    expect(response.statusCode).toBe(409);
  });
});

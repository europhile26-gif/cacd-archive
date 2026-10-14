/**
 * Tests API keys: authentication as the owner, the route allowlist, uniform rejection of
 * bad keys, the per-key rate limit, issuing rules and expiry warnings.
 */
process.env.API_KEY_RATE_LIMIT_MAX = '3';
process.env.API_RATE_LIMIT_MAX = '50';

const { createServer } = require('../../src/api/server');
const ApiKeyService = require('../../src/services/api-key-service');
const ApiKey = require('../../src/models/ApiKey');
const User = require('../../src/models/User');
const emailService = require('../../src/services/email-service');
const config = require('../../src/config/config');
const { query, closePool } = require('../helpers/db');

const OWNER_EMAIL = 'api-key-owner@example.invalid';
const ACTIVE_STATUS_ID = 2;
const INACTIVE_STATUS_ID = 3;

describe('API keys', () => {
  let server;
  let owner;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  beforeEach(async () => {
    await query('DELETE FROM users WHERE email = ?', [OWNER_EMAIL]);
    const created = await User.create({
      email: OWNER_EMAIL,
      password_hash: 'not-a-real-hash',
      name: 'API Key Owner',
      status_id: ACTIVE_STATUS_ID
    });
    // An administrator, so refusals come from the key allowlist and not missing capabilities
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE slug = 'administrator'`,
      [created.id]
    );
    owner = await User.findById(created.id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await query('DELETE FROM users WHERE email = ?', [OWNER_EMAIL]);
    await server.close();
    await closePool();
  });

  /**
   * Issues a key for the owner and returns the full key.
   */
  async function issueKey(label = 'Test agent') {
    const { key } = await ApiKeyService.create(owner, label);
    return key;
  }

  /**
   * Sends a request authenticated with the given key.
   */
  function requestWithKey(key, method, url, payload) {
    return server.inject({
      method,
      url,
      headers: { authorization: `Bearer ${key}` },
      payload
    });
  }

  describe('authentication', () => {
    test('a key acts as its owner', async () => {
      const key = await issueKey();

      const response = await requestWithKey(key, 'GET', '/api/v1/users/me');

      expect(response.statusCode).toBe(200);
      expect(response.json().user.email).toBe(OWNER_EMAIL);
    });

    test('a key can create and list saved searches', async () => {
      const key = await issueKey();

      const created = await requestWithKey(key, 'POST', '/api/v1/searches', {
        search_text: 'Smith'
      });
      const listed = await requestWithKey(key, 'GET', '/api/v1/searches');

      expect(created.statusCode).toBe(201);
      expect(listed.json().searches.map((search) => search.search_text)).toEqual(['Smith']);
    });

    test('use is recorded against the key', async () => {
      const key = await issueKey();
      const publicId = key.split('_')[1];

      await requestWithKey(key, 'GET', '/api/v1/users/me');

      let apiKey = await ApiKey.findByPublicId(publicId);
      for (let attempt = 0; attempt < 20 && !apiKey.last_used_at; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        apiKey = await ApiKey.findByPublicId(publicId);
      }

      expect(apiKey.last_used_at).not.toBeNull();
      expect(apiKey.last_used_ip).toBe('127.0.0.1');
    });

    test('bad keys are all rejected the same way', async () => {
      const key = await issueKey();
      const [, publicId, secret] = /^cacd_([0-9a-f]{8})_(.+)$/.exec(key);
      const wrongSecret = `cacd_${publicId}_${secret.startsWith('A') ? 'B' : 'A'}${secret.slice(1)}`;
      const unknownId = `cacd_00000000_${secret}`;

      const statusCodes = [];
      for (const badKey of [wrongSecret, unknownId, 'cacd_malformed']) {
        const response = await requestWithKey(badKey, 'GET', '/api/v1/users/me');
        statusCodes.push(response.statusCode);
      }

      expect(statusCodes).toEqual([401, 401, 401]);
    });

    test('a revoked key is rejected', async () => {
      const key = await issueKey();
      await ApiKey.revoke(key.split('_')[1]);

      const response = await requestWithKey(key, 'GET', '/api/v1/users/me');

      expect(response.statusCode).toBe(401);
    });

    test('an expired key is rejected', async () => {
      const key = await issueKey();
      await query(
        'UPDATE api_keys SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE public_id = ?',
        [key.split('_')[1]]
      );

      const response = await requestWithKey(key, 'GET', '/api/v1/users/me');

      expect(response.statusCode).toBe(401);
    });

    test("a deactivated owner's key is refused", async () => {
      const key = await issueKey();
      await query('UPDATE users SET status_id = ? WHERE id = ?', [INACTIVE_STATUS_ID, owner.id]);

      const response = await requestWithKey(key, 'GET', '/api/v1/users/me');

      expect(response.statusCode).toBe(403);
    });
  });

  describe('route allowlist', () => {
    test.each([
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/analytics/summary'],
      ['POST', '/api/v1/auth/change-password'],
      ['PATCH', '/api/v1/users/me'],
      ['GET', '/api/v1/users/1']
    ])('%s %s refuses keys even for an administrator', async (method, url) => {
      const key = await issueKey();

      const response = await requestWithKey(key, method, url);

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe('API keys cannot be used on this endpoint');
    });

    test('public routes on the allowlist accept keys', async () => {
      const key = await issueKey();

      const response = await requestWithKey(key, 'GET', '/api/v1/hearings?limit=1');

      expect(response.statusCode).toBe(200);
    });
  });

  describe('rate limit', () => {
    test('each key is limited at API_KEY_RATE_LIMIT_MAX, separately', async () => {
      const firstKey = await issueKey('First');
      const secondKey = await issueKey('Second');

      const statusCodes = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await requestWithKey(firstKey, 'GET', '/api/v1/dates');
        statusCodes.push(response.statusCode);
      }
      const otherKey = await requestWithKey(secondKey, 'GET', '/api/v1/dates');

      expect(statusCodes).toEqual([200, 200, 200, 429]);
      expect(otherKey.statusCode).toBe(200);
    });
  });

  describe('issuing', () => {
    test('a user can hold at most API_KEY_MAX_PER_USER active keys', async () => {
      await issueKey('One');
      await issueKey('Two');
      await issueKey('Three');

      await expect(issueKey('Four')).rejects.toThrow('Maximum 3 active API keys');
    });

    test('revoked keys do not count towards the cap', async () => {
      const revokedKey = await issueKey('One');
      await issueKey('Two');
      await issueKey('Three');
      await ApiKey.revoke(revokedKey.split('_')[1]);

      await expect(issueKey('Four')).resolves.toMatch(/^cacd_/);
    });

    test('rotating replaces the key, even at the cap', async () => {
      const oldKey = await issueKey('One');
      await issueKey('Two');
      await issueKey('Three');

      const { key: newKey, apiKey } = await ApiKeyService.rotate(oldKey.split('_')[1]);

      expect(apiKey.label).toBe('One');
      expect((await requestWithKey(oldKey, 'GET', '/api/v1/users/me')).statusCode).toBe(401);
      expect((await requestWithKey(newKey, 'GET', '/api/v1/users/me')).statusCode).toBe(200);
    });

    test('inactive users cannot be issued keys', async () => {
      await query('UPDATE users SET status_id = ? WHERE id = ?', [INACTIVE_STATUS_ID, owner.id]);
      owner = await User.findById(owner.id);

      await expect(issueKey()).rejects.toThrow('only be issued to active users');
    });

    test('only the hash of the key is stored', async () => {
      const key = await issueKey();
      const rows = await query('SELECT * FROM api_keys WHERE user_id = ?', [owner.id]);

      expect(JSON.stringify(rows)).not.toContain(key.split('_')[2]);
      expect(rows[0].secret_hash).toBe(ApiKeyService.hashKey(key));
    });
  });

  describe('expiry warnings', () => {
    /**
     * Moves a key's expiry the given number of days from now.
     */
    async function expireIn(key, days) {
      await query(
        'UPDATE api_keys SET expires_at = UTC_TIMESTAMP() + INTERVAL ? DAY WHERE public_id = ?',
        [days, key.split('_')[1]]
      );
    }

    /**
     * Returns the expiry warning timestamp for a key.
     */
    async function warningSentAt(key) {
      return (await ApiKey.findByPublicId(key.split('_')[1])).expiry_warning_sent_at;
    }

    test('a key inside the window is warned about once', async () => {
      const sendWarning = jest
        .spyOn(emailService, 'sendApiKeyExpiryWarning')
        .mockResolvedValue({ messageId: 'test' });
      const key = await issueKey();
      await expireIn(key, 3);

      await ApiKeyService.sendExpiryWarnings();
      await ApiKeyService.sendExpiryWarnings();

      expect(sendWarning).toHaveBeenCalledTimes(1);
      expect(sendWarning.mock.calls[0][0].public_id).toBe(key.split('_')[1]);
      expect(await warningSentAt(key)).not.toBeNull();
    });

    test('a failed send is retried on the next run', async () => {
      jest.spyOn(emailService, 'sendApiKeyExpiryWarning').mockRejectedValue(new Error('SMTP down'));
      const key = await issueKey();
      await expireIn(key, 3);

      await ApiKeyService.sendExpiryWarnings();

      expect(await warningSentAt(key)).toBeNull();
    });

    test('the warning email names the key and how to rotate it', async () => {
      const originalEmail = { ...config.email };
      const originalService = {
        initialized: emailService.initialized,
        transporter: emailService.transporter
      };
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
      await emailService.loadTemplates();
      Object.assign(emailService, { initialized: true, transporter: { sendMail } });
      Object.assign(config.email, { enabled: true, dataErrorRecipient: 'ops@example.invalid' });

      try {
        const { apiKey } = await ApiKeyService.create(owner, 'Agent <b>');
        await emailService.sendApiKeyExpiryWarning(apiKey);
      } finally {
        Object.assign(config.email, originalEmail);
        Object.assign(emailService, originalService);
      }

      const message = sendMail.mock.calls[0][0];
      const publicId = (await ApiKey.list(owner.id))[0].public_id;
      expect(message.to).toBe('ops@example.invalid');
      expect(message.html).toContain('Agent &lt;b&gt;');
      expect(message.html).toContain(`./bin/cacd users api-keys rotate --key ${publicId}`);
      expect(message.text).toContain(`./bin/cacd users api-keys rotate --key ${publicId}`);
    });

    test('keys outside the window and revoked keys are not warned about', async () => {
      const sendWarning = jest
        .spyOn(emailService, 'sendApiKeyExpiryWarning')
        .mockResolvedValue({ messageId: 'test' });
      const distantKey = await issueKey('Distant');
      const revokedKey = await issueKey('Revoked');
      await expireIn(distantKey, 30);
      await expireIn(revokedKey, 3);
      await ApiKey.revoke(revokedKey.split('_')[1]);

      await ApiKeyService.sendExpiryWarnings();

      expect(sendWarning).not.toHaveBeenCalled();
    });
  });
});

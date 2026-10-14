// Mock dotenv so config.js doesn't read .env file during tests
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

describe('config validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    // Re-apply the mock after resetModules
    jest.mock('dotenv', () => ({
      config: jest.fn()
    }));
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function requireConfig(envOverrides) {
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.JWT_SECRET;
    delete process.env.COOKIE_SECRET;
    Object.assign(process.env, envOverrides);
    return require('../../src/config/config');
  }

  test('throws when JWT_SECRET is missing', () => {
    expect(() =>
      requireConfig({
        DB_USER: 'test',
        DB_PASSWORD: 'test'
      })
    ).toThrow('auth.jwtSecret');
  });

  test('throws when DB_USER is missing', () => {
    expect(() =>
      requireConfig({
        DB_PASSWORD: 'test',
        JWT_SECRET: 'test-secret'
      })
    ).toThrow('database.user');
  });

  test('throws when DB_PASSWORD is missing', () => {
    expect(() =>
      requireConfig({
        DB_USER: 'test',
        JWT_SECRET: 'test-secret'
      })
    ).toThrow('database.password');
  });

  test('loads successfully with all required config', () => {
    const config = requireConfig({
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      JWT_SECRET: 'test-secret'
    });
    expect(config.auth.jwtSecret).toBe('test-secret');
    expect(config.database.user).toBe('test');
  });

  test('COOKIE_SECRET falls back to JWT_SECRET', () => {
    const config = requireConfig({
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      JWT_SECRET: 'my-jwt-secret'
    });
    expect(config.auth.cookieSecret).toBe('my-jwt-secret');
  });

  test('COOKIE_SECRET can be set independently', () => {
    const config = requireConfig({
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      JWT_SECRET: 'my-jwt-secret',
      COOKIE_SECRET: 'my-cookie-secret'
    });
    expect(config.auth.cookieSecret).toBe('my-cookie-secret');
  });

  describe('auth, saved search and notification options', () => {
    const REQUIRED = { DB_USER: 'test', DB_PASSWORD: 'test', JWT_SECRET: 'test-secret' };

    test('token expiries default to 15m and 7d', () => {
      delete process.env.JWT_ACCESS_EXPIRY;
      delete process.env.JWT_REFRESH_EXPIRY;
      const config = requireConfig(REQUIRED);

      expect(config.auth.accessTokenExpiry).toBe('15m');
      expect(config.auth.refreshTokenExpiry).toBe('7d');
    });

    test('rejects a malformed token expiry', () => {
      expect(() => requireConfig({ ...REQUIRED, JWT_ACCESS_EXPIRY: 'fifteen minutes' })).toThrow(
        'JWT_ACCESS_EXPIRY'
      );
    });

    test('rejects a saved search minimum above the maximum', () => {
      expect(() =>
        requireConfig({ ...REQUIRED, SAVED_SEARCH_MIN_LENGTH: '50', SAVED_SEARCH_MAX_LENGTH: '10' })
      ).toThrow('SAVED_SEARCH_MIN_LENGTH');
    });

    test('reports every problem at once', () => {
      let message = '';
      try {
        requireConfig({
          DB_USER: 'test',
          DB_PASSWORD: 'test',
          JWT_ACCESS_EXPIRY: 'soon',
          SAVED_SEARCH_MAX_PER_USER: '0'
        });
      } catch (error) {
        message = error.message;
      }

      expect(message).toContain('auth.jwtSecret');
      expect(message).toContain('JWT_ACCESS_EXPIRY');
      expect(message).toContain('SAVED_SEARCH_MAX_PER_USER');
    });

    test('notification limits load from the environment', () => {
      const config = requireConfig({
        ...REQUIRED,
        NOTIFICATION_MAX_PER_WINDOW: '5',
        NOTIFICATION_WINDOW_HOURS: '24'
      });

      expect(config.notifications).toEqual({ maxPerWindow: 5, windowHours: 24 });
    });
  });
});

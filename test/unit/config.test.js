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
});

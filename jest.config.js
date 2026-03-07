module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./test/setup-env.js'],
  globalSetup: './test/global-setup.js',
  globalTeardown: './test/global-teardown.js',
  testMatch: ['<rootDir>/test/unit/**/*.test.js', '<rootDir>/test/integration/**/*.test.js'],
  testTimeout: 15000
};

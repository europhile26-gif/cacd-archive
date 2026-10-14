module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./test/setup-env.js'],
  setupFilesAfterEnv: ['./test/restore-env.js'],
  globalSetup: './test/global-setup.js',
  globalTeardown: './test/global-teardown.js',
  testMatch: ['<rootDir>/test/unit/**/*.test.js', '<rootDir>/test/integration/**/*.test.js'],
  testTimeout: 15000,
  // Integration tests share one database and clear each other's tables if run in parallel
  maxWorkers: 1
};

/**
 * Restores process.env after each test file.
 * Test files run serially in one worker and set environment variables at load time;
 * without this, those values leak into every file that runs afterwards.
 */
const ENVIRONMENT_SNAPSHOT = { ...process.env };

afterAll(() => {
  for (const variableName of Object.keys(process.env)) {
    if (!(variableName in ENVIRONMENT_SNAPSHOT)) {
      delete process.env[variableName];
    }
  }
  Object.assign(process.env, ENVIRONMENT_SNAPSHOT);
});

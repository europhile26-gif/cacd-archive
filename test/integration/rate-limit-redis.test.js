/**
 * Tests the Redis rate-limit store: counters shared between server instances, and
 * requests failing open with a logged error while Redis is unreachable.
 */
process.env.API_RATE_LIMIT_MAX = '3';

const Redis = require('ioredis');
const { createServer, RATE_LIMIT_NAMESPACE } = require('../../src/api/server');
const config = require('../../src/config/config');
const logger = require('../../src/utils/logger');
const { closePool } = require('../helpers/db');

// Nothing listens on port 1, so connections are refused immediately
const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeWithRedis = TEST_REDIS_URL ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

afterEach(() => {
  config.redis.url = '';
  jest.restoreAllMocks();
});

/**
 * Waits until the spy has been called, or fails after the timeout.
 */
async function waitForCall(spy, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (spy.mock.calls.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(spy).toHaveBeenCalled();
}

describeWithRedis('rate limits shared through Redis', () => {
  let redis;
  let firstInstance;
  let secondInstance;

  beforeAll(async () => {
    redis = new Redis(TEST_REDIS_URL);
    const staleKeys = await redis.keys(`${RATE_LIMIT_NAMESPACE}*`);
    if (staleKeys.length > 0) {
      await redis.del(...staleKeys);
    }

    config.redis.url = TEST_REDIS_URL;
    firstInstance = await createServer();
    secondInstance = await createServer();
    await Promise.all([firstInstance.ready(), secondInstance.ready()]);
  });

  afterAll(async () => {
    await Promise.all([firstInstance.close(), secondInstance.close()]);
    await redis.quit();
  });

  test('two instances share one count', async () => {
    const statusCodes = [];
    for (const instance of [firstInstance, secondInstance, firstInstance, secondInstance]) {
      const response = await instance.inject({
        method: 'GET',
        url: '/api/v1/dates',
        remoteAddress: '198.51.100.20'
      });
      statusCodes.push(response.statusCode);
    }

    expect(statusCodes).toEqual([200, 200, 200, 429]);
  });
});

describe('rate limits with Redis unreachable', () => {
  let server;

  beforeAll(async () => {
    config.redis.url = UNREACHABLE_REDIS_URL;
  });

  afterAll(async () => {
    await server.close();
  });

  test('requests are served and the outage is logged once', async () => {
    const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => {});
    server = await createServer();
    await server.ready();

    const statusCodes = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/dates',
        remoteAddress: '198.51.100.21'
      });
      statusCodes.push(response.statusCode);
    }
    await waitForCall(errorLog);

    expect(statusCodes).toEqual([200, 200, 200, 200, 200]);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls[0][0]).toMatch(/Redis unavailable/);
  });
});

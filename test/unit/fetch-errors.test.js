const { isNetworkError, describeErrorCause } = require('../../src/utils/fetch-errors');

describe('fetch-errors', () => {
  describe('isNetworkError', () => {
    test('matches fetch failed and terminated TypeErrors', () => {
      expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
      expect(isNetworkError(new TypeError('terminated'))).toBe(true);
    });

    test('rejects other errors', () => {
      expect(isNetworkError(new Error('fetch failed'))).toBe(false);
      expect(isNetworkError(new TypeError('Failed to parse URL from nope'))).toBe(false);
      expect(isNetworkError(new Error('HTTP error 403: Forbidden'))).toBe(false);
    });
  });

  describe('describeErrorCause', () => {
    test('returns null when there is no cause', () => {
      expect(describeErrorCause(new Error('plain'))).toBeNull();
      expect(describeErrorCause(undefined)).toBeNull();
    });

    test('summarises a coded cause', () => {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.test'), {
        code: 'ENOTFOUND'
      });
      const error = new TypeError('fetch failed', { cause });

      expect(describeErrorCause(error)).toEqual({
        name: 'Error',
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND example.test'
      });
    });

    test('falls back to the first nested error of an AggregateError', () => {
      const nested = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), {
        code: 'ECONNREFUSED'
      });
      const error = new TypeError('fetch failed', { cause: new AggregateError([nested], '') });

      expect(describeErrorCause(error)).toEqual({
        name: 'AggregateError',
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 10.0.0.1:443'
      });
    });
  });
});

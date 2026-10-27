/**
 * Fetch error helpers
 *
 * Node's fetch rejects with a bare TypeError ('fetch failed', or 'terminated'
 * when the body stream drops) for network-level failures; the real reason
 * (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT, ...) is on error.cause.
 */

const NETWORK_ERROR_MESSAGES = ['fetch failed', 'terminated'];

/**
 * Whether an error is a fetch network failure worth retrying
 * @param {Error} error - Error thrown by fetch or a body read
 * @returns {boolean}
 */
function isNetworkError(error) {
  return error instanceof TypeError && NETWORK_ERROR_MESSAGES.includes(error.message);
}

/**
 * Summarise an error's cause as a plain object, or null when there is none
 * @param {Error} error - Error that may carry a cause
 * @returns {{name: string, code: string|undefined, message: string}|null}
 */
function describeErrorCause(error) {
  const cause = error && error.cause;
  if (!cause) {
    return null;
  }

  // Dual-stack connects reject with an AggregateError holding one error per address
  const firstNested = Array.isArray(cause.errors) && cause.errors.length ? cause.errors[0] : null;

  return {
    name: cause.name,
    code: cause.code || (firstNested && firstNested.code),
    message: cause.message || (firstNested && firstNested.message) || String(cause)
  };
}

module.exports = {
  isNetworkError,
  describeErrorCause
};

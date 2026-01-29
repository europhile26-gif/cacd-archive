/**
 * Authentication utility
 * Handles automatic token refresh for authenticated users
 */

let refreshPromise = null;

/**
 * Parse JWT payload without verification (client-side)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Get access token from cookie
 * @returns {string|null} Access token or null
 */
function getAccessToken() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'accessToken') {
      return value;
    }
  }
  return null;
}

/**
 * Check if token needs refresh (less than 5 minutes remaining)
 * @returns {boolean} True if token should be refreshed
 */
function shouldRefreshToken() {
  const token = getAccessToken();
  if (!token) return false;

  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;

  // Refresh if less than 5 minutes remaining
  return timeUntilExpiry < 300;
}

/**
 * Refresh the access token
 * Uses a singleton promise to prevent multiple simultaneous refresh requests
 * @returns {Promise<boolean>} True if refresh succeeded
 */
async function refreshAccessToken() {
  // If already refreshing, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        return true;
      }

      // Refresh failed - redirect to login
      if (response.status === 401) {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      }

      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    } finally {
      // Clear the promise after completion
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Ensure token is valid before making API calls
 * Automatically refreshes if needed
 * @returns {Promise<boolean>} True if token is valid
 */
async function ensureValidToken() {
  if (shouldRefreshToken()) {
    return await refreshAccessToken();
  }
  return true;
}

/**
 * Initialize automatic token refresh
 * Sets up periodic checks and refresh before API calls
 */
function initAutoRefresh() {
  // Check every minute if token needs refresh
  setInterval(async () => {
    if (shouldRefreshToken()) {
      await refreshAccessToken();
    }
  }, 60000); // 1 minute

  // Intercept fetch requests to ensure valid token
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];

    // Only auto-refresh for API calls
    if (typeof url === 'string' && url.startsWith('/api/')) {
      await ensureValidToken();
    }

    return originalFetch.apply(this, args);
  };
}

// Auto-initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoRefresh);
} else {
  initAutoRefresh();
}

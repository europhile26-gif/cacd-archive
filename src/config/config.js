const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');

// Tests load .env.test first (test/setup-env.js). dotenv only fills unset variables,
// so loading .env as well would leak the developer's settings into every test.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

/**
 * Parses an integer env var, falling back only when unset or unparseable.
 * `parseInt(x, 10) || fallback` would silently replace a deliberate 0.
 */
function parseIntOption(value, fallback) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = parseInt(value, 10);

  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Splits a comma-separated env var into a trimmed list, dropping empty entries.
 */
function splitList(value, fallback) {
  return (value === undefined ? fallback : value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  baseUrl: process.env.BASE_URL || null,
  appInstance: parseInt(process.env.NODE_APP_INSTANCE, 10) || 0,

  startup: {
    skipFilesystemCheck: process.env.SKIP_STARTUP_FILESYSTEM_CHECK === 'true'
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'cacd_archive',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    timezone: '+00:00' // Store in UTC
  },

  scraping: {
    intervalMinutes: parseInt(process.env.SCRAPE_INTERVAL_MINUTES, 10) || 120,
    scrapeOnStartup: process.env.SCRAPE_ON_STARTUP === 'true',
    timeWindow: {
      enabled: process.env.SCRAPE_WINDOW_ENABLED !== 'false', // Default true
      startHour: parseInt(process.env.SCRAPE_WINDOW_START_HOUR, 10) || 8, // 08:00
      endHour: parseInt(process.env.SCRAPE_WINDOW_END_HOUR, 10) || 18 // 18:00
    },
    summaryPageUrl:
      process.env.SUMMARY_PAGE_URL ||
      'https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109',
    userAgent: process.env.USER_AGENT || 'CACD-Archive-Bot/1.0 (Educational Project)',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000,
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3
  },

  email: {
    enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
    alertEmail: process.env.ALERT_EMAIL, // Deprecated - use dataErrorRecipient
    dataErrorRecipient: process.env.EMAIL_RECIPIENT_DATA_ERRORS,
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    },
    from: process.env.EMAIL_FROM || 'CACD Archive <alerts@example.com>'
  },

  api: {
    // Addresses/CIDRs of our own reverse proxies, or the literal 'true' to trust any
    // hop. Fastify resolves request.ip by walking X-Forwarded-For right-to-left and
    // stopping at the first address not in this list, so anything not listed here
    // cannot forge a client IP. Named presets ('loopback', 'uniquelocal') are accepted.
    trustedProxies: process.env.TRUSTED_PROXIES || 'loopback',
    rateLimit: {
      max: parseIntOption(process.env.API_RATE_LIMIT_MAX, 100),
      timeWindow: parseIntOption(process.env.API_RATE_LIMIT_WINDOW, 900000)
    },
    // Login, registration and password routes: per IP, never bypassed by a session
    authRateLimit: {
      max: parseIntOption(process.env.AUTH_RATE_LIMIT_MAX, 10),
      timeWindow: parseIntOption(process.env.AUTH_RATE_LIMIT_WINDOW, 900000)
    },
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false', // Default true for development
      origins: splitList(process.env.CORS_ALLOWED_ORIGINS, '')
    }
  },

  apiKeys: {
    // Active (unrevoked, unexpired) keys per user
    maxPerUser: parseIntOption(process.env.API_KEY_MAX_PER_USER, 3),
    defaultExpiryDays: parseIntOption(process.env.API_KEY_DEFAULT_EXPIRY_DAYS, 365),
    expiryWarningDays: parseIntOption(process.env.API_KEY_EXPIRY_WARNING_DAYS, 7),
    // When expiry warnings are checked (cron format). Instance 0 only.
    expiryCheckCron: process.env.API_KEY_EXPIRY_CHECK_CRON || '0 8 * * *',
    // Per key, shared across instances when REDIS_URL is set
    rateLimit: {
      max: parseIntOption(process.env.API_KEY_RATE_LIMIT_MAX, 600),
      timeWindow: parseIntOption(process.env.API_KEY_RATE_LIMIT_WINDOW, 60000)
    }
  },

  redis: {
    // Empty keeps rate-limit counters in process memory
    url: process.env.REDIS_URL || ''
  },

  analytics: {
    enabled: process.env.ANALYTICS_ENABLED === 'true',
    retentionDays: parseIntOption(process.env.ANALYTICS_RETENTION_DAYS, 30),
    excludeRoutes: splitList(
      process.env.ANALYTICS_EXCLUDE_ROUTES,
      '/api/v1/health,/api/docs,/vendor'
    ),
    fingerprintSecret: process.env.ANALYTICS_FINGERPRINT_SECRET,
    // Buffer thresholds: whichever is reached first triggers a flush.
    flushIntervalMs: parseIntOption(process.env.ANALYTICS_FLUSH_INTERVAL_MS, 5000),
    flushBatchSize: parseIntOption(process.env.ANALYTICS_FLUSH_BATCH_SIZE, 100),
    purgeCron: process.env.ANALYTICS_PURGE_CRON || '0 3 * * *',
    respectDoNotTrack: process.env.ANALYTICS_RESPECT_DNT !== 'false'
  },

  geoip: {
    countryDbPath: process.env.GEOIP_COUNTRY_DB_PATH || '/var/lib/GeoIP/GeoLite2-Country.mmdb',
    asnDbPath: process.env.GEOIP_ASN_DB_PATH || '/var/lib/GeoIP/GeoLite2-ASN.mmdb',
    blockedCountries: splitList(process.env.BLOCKED_COUNTRIES, '').map((code) => code.toUpperCase())
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    cookieSecret: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
    allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION !== 'false',
    requireAdminApproval: process.env.REQUIRE_ADMIN_APPROVAL !== 'false',
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH, 10) || 12
  },

  savedSearches: {
    minLength: parseIntOption(process.env.SAVED_SEARCH_MIN_LENGTH, 3),
    maxLength: parseIntOption(process.env.SAVED_SEARCH_MAX_LENGTH, 255),
    maxPerUser: parseIntOption(process.env.SAVED_SEARCH_MAX_PER_USER, 10)
  },

  notifications: {
    maxPerWindow: parseIntOption(process.env.NOTIFICATION_MAX_PER_WINDOW, 2),
    windowHours: parseIntOption(process.env.NOTIFICATION_WINDOW_HOURS, 12)
  },

  frontend: {
    recordsPerPage: parseInt(process.env.RECORDS_PER_PAGE, 10) || 50
  }
};

// Every problem is collected before throwing, so a misconfigured deployment sees the
// full list in one startup rather than fixing them one restart at a time.
const configProblems = [];

const required = ['database.user', 'database.password', 'auth.jwtSecret'];

for (const key of required) {
  const value = key.split('.').reduce((obj, k) => obj?.[k], config);
  if (!value) {
    configProblems.push(`Missing required configuration: ${key}`);
  }
}

// A bare hop count is rejected rather than passed through: Fastify 5 fails closed on
// numeric trustProxy (it cannot validate the immediate peer), so request.ip would
// silently resolve to the proxy's own address instead of the client's.
if (/^\d+$/.test(config.api.trustedProxies.trim())) {
  configProblems.push(
    'TRUSTED_PROXIES must be addresses, CIDR ranges, or a named preset ' +
      '(e.g. "loopback", "127.0.0.1,::1", "10.0.0.0/8") — not a hop count. ' +
      'Fastify ignores numeric values and request.ip would resolve to the proxy.'
  );
}

if (config.analytics.enabled) {
  // Without a secret the fingerprint is a plain hash of IP + user agent, which is
  // reversible by brute force and so would not be pseudonymous.
  if (!config.analytics.fingerprintSecret) {
    configProblems.push(
      'ANALYTICS_FINGERPRINT_SECRET is required when ANALYTICS_ENABLED=true. ' +
        'Generate one with: ./bin/cacd secret generate'
    );
  }

  if (!Number.isInteger(config.analytics.retentionDays) || config.analytics.retentionDays < 1) {
    configProblems.push('ANALYTICS_RETENTION_DAYS must be a positive whole number of days.');
  }

  if (config.analytics.flushIntervalMs < 100) {
    configProblems.push('ANALYTICS_FLUSH_INTERVAL_MS must be at least 100ms.');
  }

  if (config.analytics.flushBatchSize < 1) {
    configProblems.push('ANALYTICS_FLUSH_BATCH_SIZE must be at least 1.');
  }
}

for (const [variable, limit] of [
  ['API_RATE_LIMIT', config.api.rateLimit],
  ['AUTH_RATE_LIMIT', config.api.authRateLimit],
  ['API_KEY_RATE_LIMIT', config.apiKeys.rateLimit]
]) {
  if (limit.max < 1 || limit.timeWindow < 1000) {
    configProblems.push(
      `${variable}_MAX must be at least 1 and ${variable}_WINDOW at least 1000ms.`
    );
  }
}

const { maxPerUser: maxKeysPerUser, defaultExpiryDays, expiryWarningDays } = config.apiKeys;

if (maxKeysPerUser < 1) {
  configProblems.push('API_KEY_MAX_PER_USER must be at least 1.');
}

if (defaultExpiryDays < 1 || defaultExpiryDays > 3650) {
  configProblems.push('API_KEY_DEFAULT_EXPIRY_DAYS must be between 1 and 3650.');
}

if (expiryWarningDays < 1) {
  configProblems.push('API_KEY_EXPIRY_WARNING_DAYS must be at least 1.');
}

if (!cron.validate(config.apiKeys.expiryCheckCron)) {
  configProblems.push(
    `API_KEY_EXPIRY_CHECK_CRON must be a cron expression; got "${config.apiKeys.expiryCheckCron}".`
  );
}

if (config.redis.url && !/^rediss?:\/\//.test(config.redis.url)) {
  configProblems.push(
    'REDIS_URL must start with redis:// or rediss:// (e.g. "redis://127.0.0.1:6379").'
  );
}

// jsonwebtoken accepts a number of seconds or a number with a unit suffix
const TOKEN_EXPIRY_PATTERN = /^\d+[smhd]?$/;

for (const [variable, value] of [
  ['JWT_ACCESS_EXPIRY', config.auth.accessTokenExpiry],
  ['JWT_REFRESH_EXPIRY', config.auth.refreshTokenExpiry]
]) {
  if (!TOKEN_EXPIRY_PATTERN.test(value)) {
    configProblems.push(
      `${variable} must be seconds or a number with s/m/h/d (e.g. "15m"); got "${value}".`
    );
  }
}

const { minLength, maxLength, maxPerUser } = config.savedSearches;

if (minLength < 1 || maxLength < minLength || maxLength > 255) {
  configProblems.push(
    'SAVED_SEARCH_MIN_LENGTH and SAVED_SEARCH_MAX_LENGTH must satisfy 1 <= min <= max <= 255.'
  );
}

if (maxPerUser < 1) {
  configProblems.push('SAVED_SEARCH_MAX_PER_USER must be at least 1.');
}

if (config.notifications.maxPerWindow < 1 || config.notifications.windowHours < 1) {
  configProblems.push(
    'NOTIFICATION_MAX_PER_WINDOW and NOTIFICATION_WINDOW_HOURS must be at least 1.'
  );
}

const invalidCountryCodes = config.geoip.blockedCountries.filter(
  (code) => !/^[A-Z]{2}$/.test(code)
);

if (invalidCountryCodes.length > 0) {
  configProblems.push(
    `BLOCKED_COUNTRIES must be ISO 3166-1 alpha-2 codes; got: ${invalidCountryCodes.join(', ')}`
  );
}

if (configProblems.length > 0) {
  throw new Error(
    `Invalid configuration (${configProblems.length} problem(s)). See .env.example for details:\n` +
      configProblems.map((problem) => `  - ${problem}`).join('\n')
  );
}

module.exports = config;

const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',

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
    intervalHours: parseInt(process.env.SCRAPE_INTERVAL_HOURS, 10) || 2,
    summaryPageUrl:
      process.env.SUMMARY_PAGE_URL ||
      'https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109',
    userAgent: process.env.USER_AGENT || 'CACD-Archive-Bot/1.0 (Educational Project)',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000,
    maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3
  },

  email: {
    alertEmail: process.env.ALERT_EMAIL,
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
    rateLimit: {
      max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 100,
      timeWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW, 10) || 900000
    }
  },

  frontend: {
    recordsPerPage: parseInt(process.env.RECORDS_PER_PAGE, 10) || 50
  }
};

// Validate required config
const required = ['database.user', 'database.password'];

for (const key of required) {
  const value = key.split('.').reduce((obj, k) => obj?.[k], config);
  if (!value) {
    throw new Error(`Missing required configuration: ${key}`);
  }
}

module.exports = config;

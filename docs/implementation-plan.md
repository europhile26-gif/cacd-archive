# Implementation Plan

**Document:** CACD Archive Implementation Plan  
**Version:** 1.0  
**Date:** 11 December 2025

---

## 1. Overview

This document describes the technical implementation approach for the CACD Archive project, including technology stack, architecture, project structure, and development workflow.

---

## 2. Technology Stack

### 2.1 Core Technologies

- **Runtime:** Node.js (LTS version recommended)
- **Process Manager:** PM2 (fork mode)
- **Database:** MariaDB
- **API Framework:** Fastify (chosen for performance and built-in schema validation)
- **HTML Parser:** cheerio
- **Configuration:** dotenv
- **Development Server:** nodemon

### 2.2 Key Libraries

**Backend:**

- `fastify` - Fast web framework with built-in validation
- `@fastify/swagger` - API documentation
- `@fastify/swagger-ui` - Interactive API documentation
- `@fastify/rate-limit` - Rate limiting for public API
- `@fastify/static` - Serve static files
- `mysql2` - MariaDB client with promise support
- `cheerio` - HTML parsing
- `axios` - HTTP client for web scraping
- `date-fns` - Date/time manipulation
- `nodemailer` - Email notifications
- `dotenv` - Environment configuration
- `pino` - Fast JSON logger (included with Fastify)

**Database Migrations:**

- `node-pg-migrate` alternative: custom migration system or `umzug` with mysql2

**Development:**

- `nodemon` - Auto-restart on file changes
- `esbuild` or `vite` - Frontend asset bundling (lightweight)

**Frontend:**

- jQuery (slim build for minimal size)
- Vanilla JavaScript for table interactions
- HTML5 + CSS3

### 2.3 Rationale for Key Choices

**Fastify vs Express:**

- Fastify chosen for:
  - Better performance (2x faster than Express)
  - Built-in schema validation (JSON Schema)
  - Native async/await support
  - Excellent plugin ecosystem
  - Built-in logging with pino

**cheerio:**

- jQuery-like syntax (familiar, easy to use)
- Fast and lightweight
- Server-side HTML parsing
- No browser required

---

## 3. Application Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PM2 Process Manager                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         CACD Archive Application (Fork Mode)        │    │
│  │                                                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │    │
│  │  │   Scraper    │  │   REST API   │  │   CLI    │ │    │
│  │  │   Scheduler  │  │   (Fastify)  │  │   Tools  │ │    │
│  │  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │    │
│  │         │                 │                │       │    │
│  │         └─────────┬───────┴────────────────┘       │    │
│  │                   │                                 │    │
│  │         ┌─────────▼─────────┐                      │    │
│  │         │   Database Layer   │                      │    │
│  │         │   (mysql2 pool)    │                      │    │
│  │         └─────────┬──────────┘                      │    │
│  └───────────────────┼──────────────────────────────────┘    │
└────────────────────┼──────────────────────────────────────┘
                     │
             ┌───────▼────────┐
             │    MariaDB     │
             └────────────────┘

External:
  - Court Website (scraping target)
  - SMTP Server (email alerts)
  - Web Browser (API + Frontend)
```

### 3.2 Module Structure

```
src/
├── index.js                 # Application entry point
├── config/
│   ├── config.js           # Configuration loader (dotenv)
│   └── database.js         # Database connection pool
├── db/
│   ├── migrations/         # Database migration files
│   │   ├── 001_initial_schema.sql
│   │   └── 002_add_indexes.sql
│   └── migrator.js         # Migration runner
├── scrapers/
│   ├── link-discovery.js   # Find today's daily cause list links
│   ├── table-parser.js     # Parse HTML table to records
│   └── scheduler.js        # Cron-like scheduling
├── services/
│   ├── scraper-service.js  # Orchestrate scraping workflow
│   ├── sync-service.js     # Database synchronization
│   └── email-service.js    # Send alert emails
├── api/
│   ├── server.js           # Fastify server setup
│   ├── routes/
│   │   ├── hearings.js     # GET /api/hearings
│   │   └── health.js       # GET /api/health
│   └── schemas/
│       └── hearings.js     # JSON schemas for validation
├── cli/
│   ├── scrape-now.js       # Manual scrape trigger
│   ├── migrate.js          # Run migrations manually
│   └── query.js            # Query database from CLI
└── utils/
    ├── logger.js           # Logging configuration
    └── validators.js       # Data validation helpers

public/                     # Frontend source files
├── index.html
├── css/
│   └── styles.css
└── js/
    └── app.js

dist/                       # Built frontend files (generated)
└── (optimized assets)

test/                       # Test files
├── unit/
├── integration/
└── fixtures/
```

---

## 4. Configuration Management

### 4.1 Environment Variables (.env)

```bash
# Application
NODE_ENV=development          # development | production
PORT=3000                     # API server port
LOG_LEVEL=info               # trace | debug | info | warn | error | fatal

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=cacd_archive
DB_USER=cacd_user
DB_PASSWORD=secure_password_here
DB_CONNECTION_LIMIT=10

# Scraping
SCRAPE_INTERVAL_HOURS=2      # Re-scrape interval (default: 2)
SUMMARY_PAGE_URL=https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109
USER_AGENT=CACD-Archive-Bot/1.0 (Educational Project)
REQUEST_TIMEOUT=10000        # ms
MAX_RETRIES=3

# Email Alerts
ALERT_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false           # true for 465, false for other ports
SMTP_USER=alerts@example.com
SMTP_PASSWORD=smtp_password_here
EMAIL_FROM=CACD Archive <alerts@example.com>

# API
API_RATE_LIMIT_MAX=100      # Max requests per window
API_RATE_LIMIT_WINDOW=900000 # Window in ms (15 min)

# Frontend
RECORDS_PER_PAGE=50         # Default records to show
```

### 4.2 Configuration Loader

```javascript
// src/config/config.js
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
    timezone: '+00:00' // Store in UTC, convert for display
  },

  scraping: {
    intervalHours: parseInt(process.env.SCRAPE_INTERVAL_HOURS, 10) || 2,
    summaryPageUrl: process.env.SUMMARY_PAGE_URL,
    userAgent: process.env.USER_AGENT,
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
    from: process.env.EMAIL_FROM
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
const required = [
  'database.user',
  'database.password',
  'email.alertEmail',
  'email.smtp.host',
  'email.smtp.auth.user',
  'email.smtp.auth.pass'
];

for (const key of required) {
  const value = key.split('.').reduce((obj, k) => obj?.[k], config);
  if (!value) {
    throw new Error(`Missing required configuration: ${key}`);
  }
}

module.exports = config;
```

---

## 5. Database Schema Migrations

### 5.1 Migration System

**Approach:** Simple SQL-based migrations with tracking table

**Migration Table:**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

### 5.2 Migration Files

**Naming Convention:** `XXX_description.sql` where XXX is zero-padded number

**001_initial_schema.sql:**

```sql
-- Create hearings table
CREATE TABLE IF NOT EXISTS hearings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- Composite key components
    list_date DATE NOT NULL,
    case_number VARCHAR(50) NOT NULL,
    time VARCHAR(20) NOT NULL,

    -- Datetime for sorting/filtering
    hearing_datetime DATETIME NOT NULL,

    -- Case information
    venue VARCHAR(255),
    judge TEXT,
    case_details TEXT,
    hearing_type VARCHAR(255),
    additional_information TEXT,

    -- Metadata
    division ENUM('Criminal', 'Civil') NOT NULL,
    source_url VARCHAR(500) NOT NULL,
    scraped_at TIMESTAMP NOT NULL,
    scrape_version INT DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes
    UNIQUE KEY unique_hearing (list_date, case_number, time),
    INDEX idx_hearing_datetime (hearing_datetime),
    INDEX idx_case_number (case_number),
    INDEX idx_list_date (list_date),
    INDEX idx_division (division),
    FULLTEXT INDEX ft_search (case_details, hearing_type, additional_information, judge, venue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.3 Migration Runner

```javascript
// src/db/migrator.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/config');

async function runMigrations() {
  const connection = await mysql.createConnection(config.database);

  try {
    // Create migrations table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Get applied migrations
    const [rows] = await connection.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(rows.map((r) => r.version));

    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // Apply pending migrations
    for (const file of files) {
      const version = file.replace('.sql', '');

      if (appliedVersions.has(version)) {
        console.log(`Migration ${version} already applied, skipping`);
        continue;
      }

      console.log(`Applying migration ${version}...`);

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await connection.beginTransaction();

      try {
        // Execute migration SQL
        await connection.query(sql);

        // Record migration
        await connection.query(
          'INSERT INTO schema_migrations (version, description) VALUES (?, ?)',
          [version, file]
        );

        await connection.commit();
        console.log(`Migration ${version} applied successfully`);
      } catch (error) {
        await connection.rollback();
        throw new Error(`Migration ${version} failed: ${error.message}`);
      }
    }

    console.log('All migrations applied successfully');
  } finally {
    await connection.end();
  }
}

module.exports = { runMigrations };
```

### 5.4 Startup Integration

```javascript
// src/index.js (excerpt)
const { runMigrations } = require('./db/migrator');

async function start() {
  try {
    // Run migrations on startup (both dev and prod)
    console.log('Running database migrations...');
    await runMigrations();

    // Start API server
    await startAPIServer();

    // Start scraper scheduler
    startScraperScheduler();

    console.log('Application started successfully');
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
```

---

## 6. REST API Design

### 6.1 API Endpoints

**Base URL:** `/api/v1`

#### GET /api/v1/hearings

Get list of hearings with filtering, sorting, and pagination.

**Query Parameters:**

- `limit` (integer, default: 50, max: 100) - Number of records to return
- `offset` (integer, default: 0) - Pagination offset
- `date` (date, format: YYYY-MM-DD) - Filter by list date
- `dateFrom` (date) - Filter by date range start
- `dateTo` (date) - Filter by date range end
- `caseNumber` (string) - Filter by case number (exact match)
- `search` (string) - Full-text search across case details, hearing type, etc.
- `division` (enum: Criminal, Civil) - Filter by division
- `sortBy` (enum: hearing_datetime, case_number, created_at) - Sort field
- `sortOrder` (enum: asc, desc, default: desc) - Sort direction

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "listDate": "2025-12-11",
      "caseNumber": "202403891 A1",
      "time": "10:30am",
      "hearingDateTime": "2025-12-11T10:30:00",
      "venue": "RCJ - Court 5",
      "judge": "Lord Justice Males, Mr Justice Pepperall...",
      "caseDetails": "R v ZDX",
      "hearingType": "FC Application Sentence",
      "additionalInformation": "1992 Sexual Offences Act applies",
      "division": "Criminal",
      "sourceUrl": "https://...",
      "scrapedAt": "2025-12-11T14:23:45Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 235
  }
}
```

#### GET /api/v1/hearings/:id

Get single hearing by ID.

**Response:**

```json
{
  "success": true,
  "data": {
    /* hearing object */
  }
}
```

#### GET /api/v1/dates

Get list of available dates with hearing counts.

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-12-11",
      "count": 15,
      "division": "Criminal"
    }
  ]
}
```

#### GET /api/v1/health

Health check endpoint.

**Response:**

```json
{
  "success": true,
  "status": "healthy",
  "database": "connected",
  "uptime": 3600
}
```

### 6.2 Fastify Server Setup

```javascript
// src/api/server.js
const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUI = require('@fastify/swagger-ui');
const path = require('path');
const config = require('../config/config');

async function createServer() {
  const server = fastify({
    logger: {
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: config.api.rateLimit.max,
    timeWindow: config.api.rateLimit.timeWindow
  });

  // Swagger documentation
  await server.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'CACD Archive API',
        description: 'Court of Appeal Criminal Division Daily Cause List Archive',
        version: '1.0.0'
      },
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json']
    }
  });

  await server.register(fastifySwaggerUI, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // Serve static files
  const staticDir =
    config.env === 'production'
      ? path.join(__dirname, '../../dist')
      : path.join(__dirname, '../../public');

  await server.register(fastifyStatic, {
    root: staticDir,
    prefix: '/'
  });

  // Register routes
  await server.register(require('./routes/hearings'), { prefix: '/api/v1' });
  await server.register(require('./routes/health'), { prefix: '/api/v1' });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(error.statusCode || 500).send({
      success: false,
      error: error.message
    });
  });

  return server;
}

module.exports = { createServer };
```

### 6.3 Example Route

```javascript
// src/api/routes/hearings.js
const { getHearings, getHearingById } = require('../../services/sync-service');
const { hearingsQuerySchema, hearingResponseSchema } = require('../schemas/hearings');

async function hearingsRoutes(fastify, options) {
  // GET /api/v1/hearings
  fastify.get(
    '/hearings',
    {
      schema: {
        querystring: hearingsQuerySchema,
        response: {
          200: hearingResponseSchema
        }
      }
    },
    async (request, reply) => {
      const {
        limit = 50,
        offset = 0,
        date,
        dateFrom,
        dateTo,
        caseNumber,
        search,
        division,
        sortBy = 'hearing_datetime',
        sortOrder = 'desc'
      } = request.query;

      const result = await getHearings({
        limit: Math.min(limit, 100),
        offset,
        date,
        dateFrom,
        dateTo,
        caseNumber,
        search,
        division,
        sortBy,
        sortOrder
      });

      return {
        success: true,
        data: result.hearings,
        pagination: {
          limit,
          offset,
          total: result.total
        }
      };
    }
  );

  // GET /api/v1/hearings/:id
  fastify.get('/hearings/:id', async (request, reply) => {
    const hearing = await getHearingById(request.params.id);

    if (!hearing) {
      reply.code(404);
      return {
        success: false,
        error: 'Hearing not found'
      };
    }

    return {
      success: true,
      data: hearing
    };
  });
}

module.exports = hearingsRoutes;
```

---

## 7. Frontend Implementation

### 7.1 Technology Choices

- **HTML5** with semantic markup
- **CSS3** with modern features (Grid, Flexbox)
- **jQuery** (slim build) for DOM manipulation and AJAX
- **Vanilla JS** for table interactions and state management
- **No framework** - keeps it simple and fast

### 7.2 Frontend Structure

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CACD Archive - Daily Cause Lists</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header>
      <h1>Court of Appeal (Criminal Division) Archive</h1>
      <p>Daily Cause List Archive</p>
    </header>

    <main>
      <section class="controls">
        <div class="search-box">
          <input type="search" id="searchInput" placeholder="Search cases..." />
          <button id="searchBtn">Search</button>
        </div>

        <div class="date-filters">
          <button class="quick-date" data-offset="-1">Yesterday</button>
          <button class="quick-date" data-offset="0">Today</button>
          <button class="quick-date" data-offset="1">Tomorrow</button>
          <input type="date" id="dateFilter" />
        </div>

        <div class="sort-controls">
          <label
            >Sort by:
            <select id="sortBy">
              <option value="hearing_datetime">Date/Time</option>
              <option value="case_number">Case Number</option>
              <option value="created_at">Added to Archive</option>
            </select>
          </label>
          <label>
            <select id="sortOrder">
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </label>
        </div>
      </section>

      <section class="results">
        <div class="results-info">Showing <span id="resultCount">0</span> hearings</div>

        <div id="loadingIndicator" class="loading" style="display: none;">Loading...</div>

        <table id="hearingsTable">
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Venue</th>
              <th>Case Number</th>
              <th>Case Details</th>
              <th>Hearing Type</th>
              <th>Judge</th>
            </tr>
          </thead>
          <tbody id="hearingsBody">
            <!-- Populated by JavaScript -->
          </tbody>
        </table>

        <div class="pagination">
          <button id="prevPage" disabled>Previous</button>
          <span id="pageInfo">Page 1</span>
          <button id="nextPage">Next</button>
        </div>
      </section>
    </main>

    <script src="https://code.jquery.com/jquery-3.7.1.slim.min.js"></script>
    <script src="/js/app.js"></script>
  </body>
</html>
```

### 7.3 Frontend JavaScript

```javascript
// public/js/app.js
(function () {
  'use strict';

  const API_BASE = '/api/v1';
  let currentPage = 0;
  let currentFilters = {};

  // Initialize
  $(document).ready(function () {
    loadHearings();
    attachEventHandlers();
  });

  function attachEventHandlers() {
    $('#searchBtn').on('click', handleSearch);
    $('#searchInput').on('keypress', function (e) {
      if (e.which === 13) handleSearch();
    });

    $('.quick-date').on('click', handleQuickDate);
    $('#dateFilter').on('change', handleDateFilter);
    $('#sortBy, #sortOrder').on('change', loadHearings);
    $('#prevPage').on('click', () => changePage(-1));
    $('#nextPage').on('click', () => changePage(1));
  }

  function handleSearch() {
    currentFilters.search = $('#searchInput').val();
    currentPage = 0;
    loadHearings();
  }

  function handleQuickDate(e) {
    const offset = parseInt($(e.target).data('offset'));
    const date = new Date();
    date.setDate(date.getDate() + offset);
    currentFilters.date = date.toISOString().split('T')[0];
    currentPage = 0;
    loadHearings();
  }

  function handleDateFilter(e) {
    currentFilters.date = $(e.target).val();
    currentPage = 0;
    loadHearings();
  }

  function changePage(delta) {
    currentPage += delta;
    if (currentPage < 0) currentPage = 0;
    loadHearings();
  }

  async function loadHearings() {
    const limit = 50;
    const offset = currentPage * limit;

    const params = new URLSearchParams({
      limit,
      offset,
      sortBy: $('#sortBy').val(),
      sortOrder: $('#sortOrder').val(),
      ...currentFilters
    });

    $('#loadingIndicator').show();
    $('#hearingsTable').addClass('loading');

    try {
      const response = await fetch(`${API_BASE}/hearings?${params}`);
      const result = await response.json();

      if (result.success) {
        renderHearings(result.data);
        updatePagination(result.pagination);
      } else {
        showError('Failed to load hearings');
      }
    } catch (error) {
      showError('Network error: ' + error.message);
    } finally {
      $('#loadingIndicator').hide();
      $('#hearingsTable').removeClass('loading');
    }
  }

  function renderHearings(hearings) {
    const tbody = $('#hearingsBody');
    tbody.empty();

    if (hearings.length === 0) {
      tbody.append('<tr><td colspan="6" class="no-results">No hearings found</td></tr>');
      $('#resultCount').text('0');
      return;
    }

    hearings.forEach((hearing) => {
      const row = $('<tr>').append(
        $('<td>').text(formatDateTime(hearing.hearingDateTime)),
        $('<td>').text(hearing.venue || '-'),
        $('<td>').text(hearing.caseNumber),
        $('<td>').text(hearing.caseDetails),
        $('<td>').text(hearing.hearingType),
        $('<td>').text(truncate(hearing.judge, 50))
      );
      tbody.append(row);
    });

    $('#resultCount').text(hearings.length);
  }

  function updatePagination(pagination) {
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPageNum = Math.floor(pagination.offset / pagination.limit) + 1;

    $('#pageInfo').text(`Page ${currentPageNum} of ${totalPages}`);
    $('#prevPage').prop('disabled', currentPageNum === 1);
    $('#nextPage').prop('disabled', currentPageNum >= totalPages);
  }

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function truncate(str, length) {
    if (!str) return '-';
    return str.length > length ? str.substring(0, length) + '...' : str;
  }

  function showError(message) {
    alert(message); // Simple for now, can be improved
  }
})();
```

---

## 8. Build System

### 8.1 Development Mode

**Command:** `npm run dev`

Uses nodemon to watch for changes and restart server automatically. Serves unminified files from `public/`.

```json
{
  "scripts": {
    "dev": "NODE_ENV=development nodemon src/index.js",
    "start": "NODE_ENV=production node src/index.js"
  }
}
```

### 8.2 Production Build

**Command:** `npm run build`

Uses esbuild (or similar lightweight bundler) to:

- Minify CSS
- Bundle and minify JavaScript
- Copy and optimize HTML
- Output to `dist/`

```json
{
  "scripts": {
    "build": "node scripts/build.js",
    "prebuild": "rm -rf dist && mkdir dist"
  }
}
```

**scripts/build.js:**

```javascript
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  // Bundle and minify JavaScript
  await esbuild.build({
    entryPoints: ['public/js/app.js'],
    bundle: true,
    minify: true,
    outfile: 'dist/js/app.min.js'
  });

  // Minify CSS
  await esbuild.build({
    entryPoints: ['public/css/styles.css'],
    bundle: true,
    minify: true,
    outfile: 'dist/css/styles.min.css'
  });

  // Copy and update HTML
  let html = fs.readFileSync('public/index.html', 'utf8');
  html = html
    .replace('/js/app.js', '/js/app.min.js')
    .replace('/css/styles.css', '/css/styles.min.css');

  fs.writeFileSync('dist/index.html', html);

  console.log('Build complete!');
}

build().catch(console.error);
```

---

## 9. PM2 Configuration

### 9.1 PM2 Ecosystem File

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'cacd-archive',
      script: './src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
```

### 9.2 PM2 Commands

```bash
# Start application
pm2 start ecosystem.config.js

# View logs
pm2 logs cacd-archive

# Restart
pm2 restart cacd-archive

# Stop
pm2 stop cacd-archive

# Monitor
pm2 monit

# Save configuration for startup
pm2 save
pm2 startup
```

---

## 10. CLI Tools

### 10.1 Manual Scrape

```bash
node src/cli/scrape-now.js
```

```javascript
// src/cli/scrape-now.js
const { runScraper } = require('../services/scraper-service');
const config = require('../config/config');

async function main() {
  console.log('Starting manual scrape...');

  try {
    const result = await runScraper();
    console.log('Scrape complete:', result);
    process.exit(0);
  } catch (error) {
    console.error('Scrape failed:', error);
    process.exit(1);
  }
}

main();
```

### 10.2 Query Database

```bash
node src/cli/query.js --date 2025-12-11
node src/cli/query.js --case-number "202403891 A1"
```

### 10.3 Run Migrations

```bash
node src/cli/migrate.js
```

---

## 11. Dependencies

### 11.1 package.json

```json
{
  "name": "cacd-archive",
  "version": "1.0.0",
  "description": "Court of Appeal Criminal Division Daily Cause List Archive",
  "main": "src/index.js",
  "scripts": {
    "dev": "NODE_ENV=development nodemon src/index.js",
    "start": "NODE_ENV=production node src/index.js",
    "build": "node scripts/build.js",
    "prebuild": "rm -rf dist && mkdir -p dist",
    "migrate": "node src/cli/migrate.js",
    "scrape": "node src/cli/scrape-now.js",
    "test": "jest"
  },
  "keywords": ["court", "scraper", "archive"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/static": "^6.12.0",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/swagger": "^8.13.0",
    "@fastify/swagger-ui": "^2.1.0",
    "mysql2": "^3.6.5",
    "cheerio": "^1.0.0-rc.12",
    "axios": "^1.6.2",
    "date-fns": "^3.0.6",
    "nodemailer": "^6.9.7",
    "dotenv": "^16.3.1",
    "pino": "^8.17.2",
    "pino-pretty": "^10.3.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "esbuild": "^0.19.11",
    "jest": "^29.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 11.2 Dependency Rationale

**Kept Lean:**

- Total production dependencies: ~12
- No heavy frameworks or ORMs
- Direct SQL queries for performance
- Minimal build tooling

**Key Libraries:**

- `fastify` - Fast, well-maintained, excellent TypeScript support if needed
- `mysql2` - Most popular MariaDB/MySQL client, promises support
- `cheerio` - Battle-tested HTML parsing
- `axios` - Reliable HTTP client
- `nodemailer` - De facto standard for email
- `node-cron` - Simple cron-like scheduling

---

## 12. Development Workflow

### 12.1 Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd cacd-archive

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration

# Run migrations
npm run migrate

# Start development server
npm run dev
```

### 12.2 Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- scraper.test.js

# Coverage
npm test -- --coverage
```

### 12.3 Deployment

```bash
# Build frontend assets
npm run build

# Test production mode locally
NODE_ENV=production npm start

# Deploy to server
# (rsync, git pull, docker, etc.)

# Run migrations on server
npm run migrate

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

---

## 13. Monitoring and Logging

### 13.1 Logging Strategy

- **Development:** Pretty-printed console logs via pino-pretty
- **Production:** JSON logs to files (via PM2)
- **Levels:** trace, debug, info, warn, error, fatal

### 13.2 Key Metrics to Log

- Scrape operations (start, end, duration, records found)
- Database operations (queries, errors, connection issues)
- API requests (method, path, status, duration)
- Email alerts sent
- Errors and exceptions with stack traces

### 13.3 PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs cacd-archive --lines 100

# Flush logs
pm2 flush
```

---

## 14. Security Considerations

### 14.1 API Security

- **Rate Limiting:** 100 requests per 15 minutes per IP
- **Input Validation:** All inputs validated via JSON Schema
- **SQL Injection:** Use parameterized queries only
- **CORS:** Configure appropriately for production
- **No Authentication:** Public read-only API as specified

### 14.2 Scraping Ethics

- **User Agent:** Clearly identifies bot and purpose
- **Rate Limiting:** 2-hour intervals, respects robots.txt
- **Error Handling:** Backs off on errors, doesn't hammer server

### 14.3 Environment Variables

- Never commit `.env` to version control
- Use strong database passwords
- Rotate SMTP credentials periodically

---

## 15. Next Steps

### 15.1 Phase 1: Core Implementation (Week 1-2)

1. Set up project structure and dependencies
2. Implement database migrations
3. Implement link discovery scraper
4. Implement table parser
5. Implement database synchronization
6. Unit tests for core functionality

### 15.2 Phase 2: API and Frontend (Week 2-3)

1. Implement Fastify API server
2. Implement API routes and schemas
3. Build frontend HTML/CSS
4. Build frontend JavaScript
5. Integration tests

### 15.3 Phase 3: Operations (Week 3-4)

1. Implement scheduler
2. Implement email alerts
3. CLI tools
4. PM2 configuration
5. Documentation
6. Deployment

### 15.4 Future Enhancements

- Civil division support
- Advanced search capabilities
- Data export (CSV, JSON)
- Webhook notifications
- Admin dashboard
- Historical analytics

---

## Document History

| Version | Date             | Author  | Changes                     |
| ------- | ---------------- | ------- | --------------------------- |
| 1.0     | 11 December 2025 | Initial | Initial implementation plan |

# CACD Archive

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

> Court of Appeal, Criminal Division (CACD) Daily Cause List Archive - An automated web scraping and archival system for UK Court of Appeal hearings.

## Overview

CACD Archive automatically scrapes, parses, and archives daily cause lists from the Court of Appeal (Criminal Division) of the United Kingdom. The system provides a searchable historical database of court hearings that are otherwise only available on a daily basis.

### Features

- 🔄 **Automated Scraping** - Re-scrapes every 2 hours to capture updates throughout the day
- 📊 **Historical Archive** - Permanent storage of hearing records with full-text search
- 🔍 **REST API** - Public API for querying hearing data with filtering and pagination
- 🌐 **Web Interface** - Simple, responsive frontend for browsing and searching hearings
- 📧 **Email Alerts** - Notifications when table structure changes require attention
- ⚡ **High Performance** - Built with Fastify for fast API responses
- 📈 **Rate Limited** - Public API with sensible rate limits to prevent abuse

## Quick Start

### Prerequisites

- Node.js 18+
- MariaDB 10.5+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/europhile26-gif/cacd-archive.git
cd cacd-archive

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your database credentials and settings

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Production Deployment

```bash
# Build frontend assets
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

## Configuration

All configuration is managed through environment variables in `.env`:

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=cacd_archive
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Scraping
SCRAPE_INTERVAL_HOURS=2

# Email Alerts
ALERT_EMAIL=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_USER=alerts@example.com
SMTP_PASSWORD=your_smtp_password

# See .env.example for all options
```

## API Documentation

### Endpoints

**GET /api/v1/hearings**

- Query hearings with filtering, sorting, and pagination
- Parameters: `limit`, `offset`, `date`, `dateFrom`, `dateTo`, `caseNumber`, `search`, `division`, `sortBy`, `sortOrder`

**GET /api/v1/hearings/:id**

- Get single hearing by ID

**GET /api/v1/dates**

- Get list of available dates with hearing counts

**GET /api/v1/health**

- Health check endpoint

Interactive API documentation available at `/api/docs` when running.

### Example Request

```bash
curl "http://localhost:3000/api/v1/hearings?date=2025-12-11&limit=10"
```

## CLI Tools

```bash
# Run migrations
node src/cli/migrate.js

# Test email notifications
node src/cli/test-email.js

# Run scraper manually (coming soon)
node src/cli/scrape-now.js

# Query database (coming soon)
node src/cli/query.js --date 2025-12-11
```

## Architecture

```
├── src/
│   ├── index.js              # Application entry point
│   ├── config/               # Configuration management
│   ├── db/                   # Database migrations and connection
│   ├── scrapers/             # Link discovery and table parsing
│   ├── services/             # Business logic (scraper, sync, email)
│   ├── api/                  # Fastify REST API
│   │   ├── routes/           # API route handlers
│   │   └── schemas/          # JSON schemas for validation
│   ├── cli/                  # Command-line tools
│   └── utils/                # Utilities and helpers
├── public/                   # Frontend source files (development)
├── dist/                     # Built frontend files (production)
└── docs/                     # Documentation
```

## Development

### Project Structure

See [docs/implementation-plan.md](docs/implementation-plan.md) for detailed architecture and implementation details.

### Running Tests

```bash
npm test
```

### Code Style

- ES6+ JavaScript
- 2-space indentation
- Semicolons required
- Use async/await over callbacks

## Documentation

- [Requirements Specification](docs/requirements.md)
- [Link Discovery Algorithm](docs/algorithm-link-discovery.md)
- [Table Parsing Algorithm](docs/algorithm-table-parsing.md)
- [Implementation Plan](docs/implementation-plan.md)
- [Changelog](CHANGELOG.md)

## Technology Stack

- **Runtime:** Node.js
- **API Framework:** Fastify
- **Database:** MariaDB
- **HTML Parser:** cheerio
- **Process Manager:** PM2
- **Frontend:** Bootstrap 5 + Vanilla JavaScript
- **Build Tool:** esbuild

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Court of Appeal, Criminal Division for publishing daily cause lists
- UK Courts & Tribunals Judiciary

---

## Project Tracker

### Milestone 1: Foundation & Database ✅

**Goal:** Set up project structure, database, and migrations

- [x] Initialize project structure and directories
- [x] Create `package.json` with all dependencies
- [x] Create `.env.example` with all configuration options
- [x] Set up ESLint/Prettier configuration
- [x] Implement configuration loader (`src/config/config.js`)
- [x] Implement database connection pool (`src/config/database.js`)
- [x] Create initial schema migration (`001_initial_schema.sql`)
- [x] Implement migration runner (`src/db/migrator.js`)
- [x] Test migrations run successfully on startup
- [x] Create database connection health check
- [ ] Write unit tests for configuration loader
- [ ] Document database schema in README

**Estimated Duration:** 2-3 days

---

### Milestone 2: Core Scraping Logic ✅

**Goal:** Implement link discovery and table parsing

- [x] Implement link discovery module (`src/scrapers/link-discovery.js`)
  - [x] Fetch summary page
  - [x] Parse HTML and extract links
  - [x] Match links by date components
  - [x] Support today + tomorrow detection
  - [x] Handle retries and timeouts
- [x] Implement table parser module (`src/scrapers/table-parser.js`)
  - [x] Extract table from HTML
  - [x] Parse headers with flexible matching
  - [x] Implement cell inheritance logic
  - [x] Parse and validate time fields
  - [x] Construct datetime from date + time
  - [x] Handle edge cases (empty tables, malformed data)
- [x] Implement scraper service (`src/services/scraper-service.js`)
  - [x] Orchestrate link discovery → fetch → parse workflow
  - [x] Error handling and logging
- [ ] Write unit tests for link discovery
- [ ] Write unit tests for table parser
- [ ] Test with real HTML from court website
- [x] Create test fixtures with sample HTML

**Estimated Duration:** 4-5 days

---

### Milestone 3: Database Synchronization ✅

**Goal:** Implement record sync with add/update/delete logic

- [x] Implement sync service (`src/services/sync-service.js`)
  - [x] Compare new records with existing database records
  - [x] Detect additions (new records)
  - [x] Detect updates (changed records)
  - [x] Detect deletions (removed records)
  - [x] Use transactions for atomic operations
  - [x] Handle errors and rollback
- [x] Implement scrape history service (`src/services/scrape-history-service.js`)
  - [x] Record scrape start/complete/error
  - [x] Track links discovered and processed
  - [x] Track records added/updated/deleted
  - [x] Calculate duration and error counts
  - [x] Query last successful scrape
  - [x] Implement shouldScrape() logic
- [x] Integrate sync service into scraper workflow
- [x] Database query functions for insert/update/delete
- [x] Composite key helper functions
- [ ] Write unit tests for sync logic
- [ ] Write integration tests with test database
- [ ] Test re-scraping scenarios (additions, deletions, updates)
- [ ] Performance test with large datasets

**Estimated Duration:** 3-4 days

---

### Milestone 4: Email Notifications ✅

**Goal:** Implement email alerts for parsing errors

- [x] Implement email service (`src/services/email-service.js`)
  - [x] Configure nodemailer with SMTP settings
  - [x] Create HTML email templates with Handlebars
  - [x] Send alert when table structure changes
  - [x] Send alert on critical parsing errors
  - [x] Include error details, stack traces, and HTML samples
- [x] Integrate email alerts into link discovery
- [x] Integrate email alerts into table parser
- [x] Add EMAIL_RECIPIENT_DATA_ERRORS to .env configuration
- [x] Test email sending with real SMTP
- [x] Create test-email CLI tool for verification
- [ ] Write unit tests for email service
- [ ] Document email alert scenarios

**Estimated Duration:** 1-2 days

---

### Milestone 5: REST API ✅

**Goal:** Build public API with Swagger documentation

- [x] Set up Fastify server (`src/api/server.js`)
  - [x] Configure Fastify with logging
  - [x] Set up rate limiting
  - [x] Configure CORS
  - [x] Set up static file serving
  - [x] Configure Swagger/OpenAPI
  - [x] Set up error handling
- [x] Implement API routes (`src/api/routes/`)
  - [x] GET /api/v1/hearings (list with filters)
  - [x] GET /api/v1/hearings/:id (single hearing)
  - [x] GET /api/v1/dates (available dates)
  - [x] GET /api/v1/health (health check)
- [x] Create JSON schemas (`src/api/schemas/`)
  - [x] Query parameter schemas
  - [x] Response schemas
  - [x] Error schemas
- [x] Implement pagination logic
- [x] Implement sorting logic
- [x] Implement filtering logic
- [x] Implement full-text search
- [ ] Write API integration tests
- [ ] Test rate limiting
- [ ] Document all API endpoints in Swagger

**Estimated Duration:** 4-5 days

---

### Milestone 6: Frontend Interface ✅

**Goal:** Build web interface for browsing hearings

- [x] Create HTML structure (`public/index.html`)
  - [x] Header and navigation
  - [x] Search box
  - [x] Date filter controls (yesterday/today/tomorrow)
  - [x] Date picker with clear button
  - [x] Sort controls
  - [x] Results table (desktop)
  - [x] Card layout (mobile)
  - [x] Pagination controls
  - [x] Bootstrap 5 integration
  - [x] Responsive navbar toolbar
  - [x] Favicon display
- [x] Create CSS styling (`public/css/styles.css`)
  - [x] Responsive design (mobile-friendly)
  - [x] Custom navy blue theme
  - [x] Table styling with semantic classes
  - [x] Mobile card styling
  - [x] Loading indicators
  - [x] Button and form styles
  - [x] Navbar visual distinction
- [x] Implement JavaScript (`public/js/app.js`)
  - [x] Fetch hearings from API
  - [x] Render table rows (desktop)
  - [x] Render cards (mobile)
  - [x] Handle search
  - [x] Handle date filters
  - [x] Handle quick date buttons
  - [x] Handle clear date functionality
  - [x] Handle pagination
  - [x] Handle sorting
  - [x] Loading states
  - [x] Error handling
  - [x] Remove jQuery dependency
- [ ] Test frontend in multiple browsers
- [ ] Test responsive design on mobile devices
- [ ] Optimize performance (minimize API calls)

**Estimated Duration:** 3-4 days

---

### Milestone 7: Build System & Assets ✅

**Goal:** Set up build process and asset optimization

- [x] Create build script (`scripts/build.js`)
  - [x] Bundle and minify JavaScript with esbuild
  - [x] Minify CSS
  - [x] Update HTML references to minified files
  - [x] Copy assets to dist/
  - [x] Implement cache busting with version query strings
  - [x] Auto-inject version from package.json
- [x] Configure environment-based static file serving
  - [x] Serve from `public/` in development
  - [x] Serve from `dist/` in production
- [x] Add npm scripts
  - [x] `npm run dev` - Development with nodemon
  - [x] `npm run build` - Production build
  - [x] `npm start` - Production server
- [x] Test development mode
- [x] Test production mode
- [x] Optimize bundle sizes (4.63 KB JS, 0.29 KB CSS)
- [x] Add source maps for debugging

**Estimated Duration:** 1-2 days

---

### Milestone 8: Scheduler & Automation ✅

**Goal:** Implement automatic periodic scraping

- [x] Implement scheduler (`src/scrapers/scheduler.js`)
  - [x] Use node-cron for scheduling
  - [x] Configure scrape interval from .env
  - [x] Run initial scrape on startup
  - [x] Schedule periodic re-scrapes (default: 2 hours)
  - [x] Handle scheduler errors
  - [x] Log all scrape operations
- [x] Integrate scheduler into main application
- [x] Add graceful shutdown handling
- [x] Replace axios with native fetch (Node 18+)
- [x] Fix sync service for re-scraping existing records
- [x] Add EMAIL_NOTIFICATIONS_ENABLED config option
- [ ] Test scheduler timing over extended period
- [ ] Document scheduling configuration

**Estimated Duration:** 1-2 days

---

### Milestone 9: CLI Tools 🛠️

**Goal:** Create command-line utilities for admin tasks

- [ ] Create scrape-now CLI (`src/cli/scrape-now.js`)
  - [ ] Trigger manual scrape
  - [ ] Show progress and results
  - [ ] Handle errors gracefully
- [ ] Create migrate CLI (`src/cli/migrate.js`)
  - [ ] Run migrations manually
  - [ ] Show migration status
- [ ] Create query CLI (`src/cli/query.js`)
  - [ ] Query by date
  - [ ] Query by case number
  - [ ] Export results to JSON/CSV
- [ ] Add CLI help documentation
- [ ] Test all CLI tools
- [ ] Document CLI usage in README

**Estimated Duration:** 2 days

---

### Milestone 10: PM2 & Deployment ⏳

**Goal:** Production deployment with PM2

- [x] Create PM2 ecosystem file (`ecosystem.config.js`)
  - [x] Configure fork mode
  - [x] Set up logging
  - [x] Configure restart policies
  - [x] Set environment variables
- [ ] Create deployment documentation
  - [ ] Server requirements
  - [ ] Installation steps
  - [ ] Database setup
  - [ ] PM2 startup configuration
- [ ] Test PM2 deployment locally
- [ ] Set up log rotation
- [ ] Configure monitoring
- [ ] Document backup procedures
- [ ] Create deployment checklist

**Estimated Duration:** 2-3 days

---

### Milestone 11: Testing & Quality 🧪

**Goal:** Comprehensive test coverage and quality assurance

- [ ] Set up Jest testing framework
- [ ] Write unit tests
  - [ ] Configuration loader
  - [ ] Link discovery
  - [ ] Table parser
  - [ ] Sync service
  - [ ] Email service
  - [ ] Validators
- [ ] Write integration tests
  - [ ] API endpoints
  - [ ] Database operations
  - [ ] Scraper workflow
- [ ] Write end-to-end tests
  - [ ] Complete scrape-to-database flow
  - [ ] API to frontend flow
- [ ] Set up test database
- [ ] Create test fixtures
- [ ] Achieve >80% code coverage
- [ ] Set up CI/CD pipeline (optional)
- [ ] Document testing procedures

**Estimated Duration:** 4-5 days

---

### Milestone 12: Documentation & Polish ✨

**Goal:** Final documentation and refinements

- [ ] Update README with final instructions
- [ ] Complete API documentation in Swagger
- [ ] Document all configuration options
- [ ] Create troubleshooting guide
- [ ] Add code comments and JSDoc
- [ ] Create deployment guide
- [ ] Create user guide for web interface
- [ ] Add examples and screenshots
- [ ] Review and update CHANGELOG
- [ ] Security audit
- [ ] Performance optimization
- [ ] Final testing in production environment

**Estimated Duration:** 3-4 days

---

### Future Enhancements 🚧

**Features to consider after initial release:**

- [ ] Civil Division support
- [ ] Advanced search with filters for judge, venue, hearing type
- [ ] Data export functionality (CSV, JSON, PDF)
- [ ] Webhook notifications for new hearings
- [ ] Historical analytics and statistics
- [ ] GraphQL API option
- [ ] Admin dashboard
- [ ] Case tracking (follow specific cases across dates)
- [ ] Email subscription for case updates
- [ ] Docker containerization
- [ ] Kubernetes deployment manifests

---

**Total Estimated Duration:** 6-8 weeks for full implementation

**Current Status:** 🚀 Production Ready - Core Features Complete

**Completed Milestones:**
- ✅ Milestone 1: Foundation & Database
- ✅ Milestone 2: Core Scraping Logic
- ✅ Milestone 3: Database Synchronization
- ✅ Milestone 4: Email Notifications
- ✅ Milestone 5: REST API
- ✅ Milestone 6: Frontend Interface
- ✅ Milestone 7: Build System & Assets
- ✅ Milestone 8: Scheduler & Automation

**Remaining Milestones:**
- 🛠️ Milestone 9: CLI Tools (partial - migrate.js exists, need scrape-now.js and query.js)
- ⏳ Milestone 10: PM2 & Deployment (partial - ecosystem.config.js exists, need documentation)
- 🧪 Milestone 11: Testing & Quality (Jest configured, no tests written yet)
- ✨ Milestone 12: Documentation & Polish


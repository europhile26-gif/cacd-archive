# CACD Archive

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-in%20development-yellow.svg)]()
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
# Run scraper manually
node src/cli/scrape-now.js

# Run migrations
node src/cli/migrate.js

# Query database
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
- **Frontend:** jQuery + Vanilla JavaScript

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Court of Appeal, Criminal Division for publishing daily cause lists
- UK Courts & Tribunals Judiciary

---

## Project Tracker

### Milestone 1: Foundation & Database ⏳

**Goal:** Set up project structure, database, and migrations

- [ ] Initialize project structure and directories
- [ ] Create `package.json` with all dependencies
- [ ] Create `.env.example` with all configuration options
- [ ] Set up ESLint/Prettier configuration
- [ ] Implement configuration loader (`src/config/config.js`)
- [ ] Implement database connection pool (`src/config/database.js`)
- [ ] Create initial schema migration (`001_initial_schema.sql`)
- [ ] Implement migration runner (`src/db/migrator.js`)
- [ ] Test migrations run successfully on startup
- [ ] Create database connection health check
- [ ] Write unit tests for configuration loader
- [ ] Document database schema in README

**Estimated Duration:** 2-3 days

---

### Milestone 2: Core Scraping Logic 🔄

**Goal:** Implement link discovery and table parsing

- [ ] Implement link discovery module (`src/scrapers/link-discovery.js`)
  - [ ] Fetch summary page
  - [ ] Parse HTML and extract links
  - [ ] Match links by date components
  - [ ] Support today + tomorrow detection
  - [ ] Handle retries and timeouts
- [ ] Implement table parser module (`src/scrapers/table-parser.js`)
  - [ ] Extract table from HTML
  - [ ] Parse headers with flexible matching
  - [ ] Implement cell inheritance logic
  - [ ] Parse and validate time fields
  - [ ] Construct datetime from date + time
  - [ ] Handle edge cases (empty tables, malformed data)
- [ ] Implement scraper service (`src/services/scraper-service.js`)
  - [ ] Orchestrate link discovery → fetch → parse workflow
  - [ ] Error handling and logging
- [ ] Write unit tests for link discovery
- [ ] Write unit tests for table parser
- [ ] Test with real HTML from court website
- [ ] Create test fixtures with sample HTML

**Estimated Duration:** 4-5 days

---

### Milestone 3: Database Synchronization 🔄

**Goal:** Implement record sync with add/update/delete logic

- [ ] Implement sync service (`src/services/sync-service.js`)
  - [ ] Compare new records with existing database records
  - [ ] Detect additions (new records)
  - [ ] Detect updates (changed records)
  - [ ] Detect deletions (removed records)
  - [ ] Use transactions for atomic operations
  - [ ] Handle errors and rollback
- [ ] Implement database query functions
  - [ ] Insert new hearings
  - [ ] Update existing hearings
  - [ ] Hard delete removed hearings
  - [ ] Query hearings with filters
  - [ ] Query by date range
  - [ ] Full-text search
- [ ] Create composite key helper functions
- [ ] Write unit tests for sync logic
- [ ] Write integration tests with test database
- [ ] Test re-scraping scenarios (additions, deletions, updates)
- [ ] Performance test with large datasets

**Estimated Duration:** 3-4 days

---

### Milestone 4: Email Notifications 📧

**Goal:** Implement email alerts for parsing errors

- [ ] Implement email service (`src/services/email-service.js`)
  - [ ] Configure nodemailer with SMTP settings
  - [ ] Create email templates for alerts
  - [ ] Send alert when table structure changes
  - [ ] Send alert on critical parsing errors
  - [ ] Include error details and found headers
- [ ] Integrate email alerts into table parser
- [ ] Integrate email alerts into scraper service
- [ ] Add email configuration to .env
- [ ] Test email sending (use mailtrap or similar for dev)
- [ ] Write unit tests for email service
- [ ] Document email alert scenarios

**Estimated Duration:** 1-2 days

---

### Milestone 5: REST API 🌐

**Goal:** Build public API with Swagger documentation

- [ ] Set up Fastify server (`src/api/server.js`)
  - [ ] Configure Fastify with logging
  - [ ] Set up rate limiting
  - [ ] Configure CORS
  - [ ] Set up static file serving
  - [ ] Configure Swagger/OpenAPI
  - [ ] Set up error handling
- [ ] Implement API routes (`src/api/routes/`)
  - [ ] GET /api/v1/hearings (list with filters)
  - [ ] GET /api/v1/hearings/:id (single hearing)
  - [ ] GET /api/v1/dates (available dates)
  - [ ] GET /api/v1/health (health check)
- [ ] Create JSON schemas (`src/api/schemas/`)
  - [ ] Query parameter schemas
  - [ ] Response schemas
  - [ ] Error schemas
- [ ] Implement pagination logic
- [ ] Implement sorting logic
- [ ] Implement filtering logic
- [ ] Implement full-text search
- [ ] Write API integration tests
- [ ] Test rate limiting
- [ ] Document all API endpoints in Swagger

**Estimated Duration:** 4-5 days

---

### Milestone 6: Frontend Interface 🎨

**Goal:** Build web interface for browsing hearings

- [ ] Create HTML structure (`public/index.html`)
  - [ ] Header and navigation
  - [ ] Search box
  - [ ] Date filter controls (yesterday/today/tomorrow)
  - [ ] Date picker
  - [ ] Sort controls
  - [ ] Results table
  - [ ] Pagination controls
- [ ] Create CSS styling (`public/css/styles.css`)
  - [ ] Responsive design (mobile-friendly)
  - [ ] Table styling
  - [ ] Loading indicators
  - [ ] Button and form styles
- [ ] Implement JavaScript (`public/js/app.js`)
  - [ ] Fetch hearings from API
  - [ ] Render table rows
  - [ ] Handle search
  - [ ] Handle date filters
  - [ ] Handle quick date buttons
  - [ ] Handle pagination
  - [ ] Handle sorting
  - [ ] Loading states
  - [ ] Error handling
- [ ] Test frontend in multiple browsers
- [ ] Test responsive design on mobile
- [ ] Optimize performance (minimize API calls)

**Estimated Duration:** 3-4 days

---

### Milestone 7: Build System & Assets 📦

**Goal:** Set up build process and asset optimization

- [ ] Create build script (`scripts/build.js`)
  - [ ] Bundle and minify JavaScript with esbuild
  - [ ] Minify CSS
  - [ ] Update HTML references to minified files
  - [ ] Copy assets to dist/
- [ ] Configure environment-based static file serving
  - [ ] Serve from `public/` in development
  - [ ] Serve from `dist/` in production
- [ ] Add npm scripts
  - [ ] `npm run dev` - Development with nodemon
  - [ ] `npm run build` - Production build
  - [ ] `npm start` - Production server
- [ ] Test development mode
- [ ] Test production mode
- [ ] Optimize bundle sizes
- [ ] Add source maps for debugging

**Estimated Duration:** 1-2 days

---

### Milestone 8: Scheduler & Automation ⏰

**Goal:** Implement automatic periodic scraping

- [ ] Implement scheduler (`src/scrapers/scheduler.js`)
  - [ ] Use node-cron for scheduling
  - [ ] Configure scrape interval from .env
  - [ ] Run initial scrape on startup
  - [ ] Schedule periodic re-scrapes (default: 2 hours)
  - [ ] Handle scheduler errors
  - [ ] Log all scrape operations
- [ ] Integrate scheduler into main application
- [ ] Add graceful shutdown handling
- [ ] Test scheduler timing
- [ ] Test re-scrape synchronization
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

### Milestone 10: PM2 & Deployment 🚀

**Goal:** Production deployment with PM2

- [ ] Create PM2 ecosystem file (`ecosystem.config.js`)
  - [ ] Configure fork mode
  - [ ] Set up logging
  - [ ] Configure restart policies
  - [ ] Set environment variables
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

**Current Status:** 📋 Planning & Documentation Complete

**Next Milestone:** Milestone 1 - Foundation & Database

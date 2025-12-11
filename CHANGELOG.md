# Changelog

All notable changes to the CACD Archive project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.3.1] - 2025-12-11

### Fixed

- **Instance Management**
  - Database migrations now only run on instance 0 (prevents race conditions in PM2 cluster mode)
  - Email service initialization now only runs on instance 0
  - Scraper scheduler properly isolated to instance 0 (already implemented, now documented)
  - Non-zero instances only start API server for load balancing
  - Prevents duplicate migrations, scrapes, and email notifications in cluster deployments

### Improved

- **Build System**
  - Build script now minifies and copies favicon.svg to dist/
  - SVG minification removes whitespace, comments, and newlines
  - Added favicon.svg size reporting in build output (0.57 KB)
  - Both favicon.ico and favicon.svg now properly deployed to production

---

## [1.3.0] - 2025-12-11

### Added

- **Email Notification System**
  - Implemented comprehensive email service with nodemailer and Handlebars templates
  - Professional HTML email templates for data error alerts
  - Automatic email notifications when link discovery fails
  - Automatic email notifications when table parsing fails
  - Detailed error reports including stack traces, URLs, and HTML samples
  - Added EMAIL_RECIPIENT_DATA_ERRORS configuration for error alerts
  - Created test-email CLI tool for verification (`node src/cli/test-email.js`)
  - Plain text fallback for email clients without HTML support

### Changed

- Enhanced email configuration with dedicated recipient for data errors
  - `EMAIL_RECIPIENT_DATA_ERRORS` replaces generic `ALERT_EMAIL`
  - SMTP configuration now properly supports STARTTLS on port 587
- Email service initializes on application startup
- Graceful shutdown now closes email service connections

### Improved

- Proactive monitoring - receive alerts when .gov.uk site structure changes
- Better error visibility with formatted HTML emails including context
- Template system ready for future user notification features
- Error isolation - parsing failures don't crash the application

---

## [1.2.0] - 2025-12-11

### Added

- **Bootstrap 5 Integration**
  - Integrated Bootstrap 5.3.2 from CDN for modern responsive design
  - Implemented dual layout system: desktop table view and mobile card view
  - Added responsive navbar toolbar with visual distinction (pale gray background)
  - Created custom navy blue color theme (#1e3a5f) with CSS variables
  - Added favicon (scales of justice) to header with proper sizing and positioning
  - Implemented "Clear Date" button for better date filter UX
  - Added semantic CSS classes to table cells for better maintainability

- **Build System Enhancements**
  - Implemented cache busting with version query strings (?ver=1.2.0)
  - Build script now auto-injects version from package.json
  - CSS and JS references automatically updated with version on build

### Changed

- **Frontend Redesign**
  - Replaced 258 lines of custom CSS with Bootstrap + 86 lines of themed styles
  - Removed jQuery dependency, migrated to vanilla JavaScript
  - Reorganized toolbar with grouped date filters and improved layout
  - Changed to full-width layout using container-fluid
  - Wrapped toolbar controls in Bootstrap navbar component
  - Improved mobile responsiveness with Bootstrap utilities (d-none/d-md-block)
  - Increased JavaScript bundle to 4.63 KB (from 2.40 KB) for dual rendering
  - Reduced CSS bundle to 0.29 KB (from 2.87 KB) with Bootstrap

- **Code Quality**
  - Removed truncate() function limiting judge names to 60 characters
  - Moved inline styling (case number bold) to CSS for separation of concerns
  - Enhanced code maintainability with semantic CSS classes

### Improved

- Better visual hierarchy with navbar styling and section delineation
- Enhanced mobile user experience with card-based layout
- Improved date filtering with dedicated clear button
- Modern, professional appearance with custom color scheme
- Better browser caching strategy with versioned assets

---

## [1.1.0] - 2025-12-11

### Changed

- Replaced pino logger with simple console-based logging
- PM2 now handles all log file management in production
- Logger maintains same API (info, warn, error, debug) with ISO 8601 timestamps
- Disabled Fastify's built-in pino logger for cleaner output

### Removed

- Removed pino and pino-pretty packages (25 fewer dependencies)
- Removed pino transport configuration complexity

### Improved

- Cleaner, more straightforward logging approach
- Better stack trace visibility in all environments
- Reduced package bloat and installation time

---

## [1.0.0] - 2025-12-11

### Added

#### Core Functionality

- ✅ Automated daily cause list scraping with scheduler
- ✅ Link discovery for today and tomorrow using flexible date matching
- ✅ HTML table parsing with cell inheritance algorithm
- ✅ Database synchronization (add/update/delete) with deduplication
- ✅ Re-scraping every 2 hours (configurable interval)
- ✅ Scrape history tracking with status and timing information
- ✅ MySQL datetime format compatibility fixes
- ✅ Native fetch implementation (replaced axios)
- ✅ Graceful shutdown handling

#### API

- ✅ REST API with Fastify framework
- ✅ GET /api/v1/hearings (list with filters)
- ✅ GET /api/v1/hearings/:id (single hearing)
- ✅ GET /api/v1/dates (available dates)
- ✅ GET /api/v1/health (health check)
- ✅ Swagger/OpenAPI documentation at /api/docs
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ Pagination support
- ✅ Full-text search capability
- ✅ Sorting and filtering by date, court, venue
- ✅ CORS support for frontend integration

#### Frontend

- ✅ Web interface for browsing hearings
- ✅ Real-time search functionality
- ✅ Quick date filters (yesterday/today/tomorrow)
- ✅ Custom date picker
- ✅ Sort controls (time, court, case name)
- ✅ Pagination with configurable page size
- ✅ Responsive design
- ✅ Production build with asset minification (HTML/CSS/JS)
- ✅ Favicon with scales of justice icon
- ✅ Source maps for debugging

#### Operations

- ✅ Database migrations system with version tracking
- ✅ PM2 configuration with fork and cluster mode examples
- ✅ Comprehensive PM2 deployment guide (docs/pm2-deployment.md)
- ✅ Development mode with environment detection
- ✅ Production build system with esbuild
- ✅ Environment-based configuration (.env)
- ✅ Structured logging with pino
- ✅ Enhanced error logging with SQL details
- ✅ PM2 cluster mode support with NODE_APP_INSTANCE
- ✅ Startup scrape configuration option

#### Documentation

- ✅ Complete README with quick start guide
- ✅ API documentation with examples
- ✅ PM2 deployment guide with monitoring and backup strategies
- ✅ Changelog with version history
- ✅ Algorithm documentation (link discovery and table parsing)
- ✅ Implementation plan and requirements

### Fixed

- Fixed recordScrapeStart() double destructuring bug
- Fixed date-fns-tz import (changed to toZonedTime)
- Fixed createRecordKey() to handle Date objects from database
- Fixed MySQL DATETIME format compatibility (removed ISO 8601 'Z' suffix)
- Fixed duplicate hearing records within same scrape
- Fixed static file serving for production builds
- Fixed HTML asset references in build output
- Improved stack trace visibility in error logs

### Changed

- Replaced axios with native fetch (reduced 21 dependencies)
- Changed error logging to console.error for better stack trace visibility
- Updated build process to minify HTML, CSS, and JavaScript
- Enhanced error messages with detailed SQL information

### Planning Phase - 2025-12-11

#### Added

- Initial project requirements specification
- Link discovery algorithm documentation
- Table parsing algorithm documentation
- Implementation plan with full technical specifications
- Project README with tracker and milestones
- Comprehensive project structure definition

#### Documentation

- `docs/requirements.md` - Functional and non-functional requirements
- `docs/algorithm-link-discovery.md` - Link discovery algorithm specification
- `docs/algorithm-table-parsing.md` - HTML table parsing algorithm specification
- `docs/implementation-plan.md` - Complete implementation guide
- `README.md` - Project overview and tracker
- `CHANGELOG.md` - This file

#### Design Decisions

- Technology stack: Node.js, Fastify, MariaDB, cheerio
- Process manager: PM2 in fork mode
- Scraping frequency: Every 2 hours (configurable)
- Delete strategy: Hard delete for stale records
- No change history tracking (logs only)
- Header mapping: By text content with email alerts on changes
- Timezone: UK local time (Europe/London) for all dates/times
- Public API with rate limiting (100 req/15 min)
- Frontend: jQuery + Vanilla JS (lightweight)
- Language: English version only (covers both English and Welsh courts)
- Historical data: Out of scope for v1 (potential future enhancement via Google Cache/Wayback Machine)
- Copyright/robots.txt: Non-commercial educational project, will respond to takedown notices

---

## [0.1.0] - TBD

### Planned Features

#### Core Functionality

- [ ] Automated daily cause list scraping
- [ ] Link discovery for today and tomorrow
- [ ] HTML table parsing with cell inheritance
- [ ] Database synchronization (add/update/delete)
- [ ] Re-scraping every 2 hours
- [ ] Email alerts on parsing errors

#### API

- [ ] REST API with Fastify
- [ ] GET /api/v1/hearings (list with filters)
- [ ] GET /api/v1/hearings/:id (single hearing)
- [ ] GET /api/v1/dates (available dates)
- [ ] GET /api/v1/health (health check)
- [ ] Swagger/OpenAPI documentation
- [ ] Rate limiting (100 requests per 15 minutes)
- [ ] Pagination support
- [ ] Full-text search
- [ ] Sorting and filtering

#### Frontend

- [ ] Web interface for browsing hearings
- [ ] Search functionality
- [ ] Date filters (yesterday/today/tomorrow)
- [ ] Date picker
- [ ] Sort controls
- [ ] Pagination
- [ ] Responsive design

#### Operations

- [ ] Database migrations system
- [ ] PM2 configuration for production
- [ ] CLI tools (scrape-now, migrate, query)
- [ ] Development mode with nodemon
- [ ] Production build with asset optimization
- [ ] Environment-based configuration (.env)
- [ ] Structured logging with pino

#### Testing

- [ ] Unit tests for core modules
- [ ] Integration tests for API
- [ ] End-to-end tests for scraping workflow

---

## Version History

### Versioning Strategy

- **Major version (X.0.0)**: Breaking changes, major features
- **Minor version (0.X.0)**: New features, non-breaking changes
- **Patch version (0.0.X)**: Bug fixes, minor improvements

### Planned Releases

- **v0.1.0** - Initial release with core functionality
- **v0.2.0** - Civil Division support
- **v0.3.0** - Advanced search and export features
- **v1.0.0** - Stable production release

---

## Notes

### Breaking Changes

Breaking changes will be clearly marked with `⚠️ BREAKING` in future releases.

### Deprecations

Deprecated features will be marked with `⚠️ DEPRECATED` and maintained for at least one minor version before removal.

### Security

Security-related changes will be marked with `🔒 SECURITY` and released as soon as possible.

---

[Unreleased]: https://github.com/europhile26-gif/cacd-archive/compare/main...HEAD

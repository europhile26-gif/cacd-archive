# Changelog

All notable changes to the CACD Archive project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Timezone: UK local time (Europe/London)
- Public API with rate limiting (100 req/15 min)
- Frontend: jQuery + Vanilla JS (lightweight)

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

# Changelog

All notable changes to the CACD Archive project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.13.0] - 2026-03-21

### Changed

- **`scraper run` CLI now scrapes all enabled sources** — `./bin/cacd scraper run` iterates all enabled data sources (DCL and FHL) instead of only DCL. Shows per-source progress with spinners and result summaries
- **`--source` flag for targeted scraping** — `./bin/cacd scraper run --source fhl` or `--source dcl` to scrape a single source. Accepts shorthand aliases (`dcl`, `fhl`) or full slugs (`daily_cause_list`, `future_hearing_list`)
- **FHL freshness skip reported in CLI** — when FHL data is unchanged upstream, the CLI reports "skipped (upstream unchanged)" instead of showing zero counts

---

## [1.12.1] - 2026-03-21

### Fixed

- **FHL scrape fails on production** — GOV.UK Content API returns ISO 8601 timestamps with timezone offsets (e.g. `2026-03-20T16:30:02+00:00`) which MariaDB `DATETIME` columns reject. Now converts to MySQL-compatible `YYYY-MM-DD HH:MM:SS` format before inserting into `source_updated_at`

---

## [1.12.0] - 2026-03-21

### Added

- **FHL JSON API migration** — `fhl-link-discovery.js` now uses the GOV.UK Content API (`/api/content/...`) instead of scraping HTML. Fetches structured JSON with attachment URLs and document body directly, eliminating fragile text-matching heuristics on rendered HTML
- **FHL freshness checking** — scraper compares GOV.UK `public_updated_at` timestamp against the last successful scrape; skips sync when upstream data hasn't changed, reducing unnecessary database churn
- **`db summary` CLI command** — `./bin/cacd db summary` shows counts for hearings (by source), scrape history (success/failed per source), users, saved searches, and notifications
- **`db reset` CLI command** — `./bin/cacd db reset` clears hearings and scrape history with a confirmation prompt; `--all` also resets user data; `--yes` skips confirmation. Preserves seed data (roles, capabilities, account statuses, data sources)
- **Database migration** `011_scrape_history_source_updated_at.sql` — adds `source_updated_at` column to `scrape_history` for storing upstream last-modified timestamps
- **Unit tests** for FHL JSON API link discovery (10 tests covering API flow, error cases, and edge cases)

### Changed

- **FHL scraper pipeline** — discovery now returns the document body HTML directly from the Content API response; scraper service passes it straight to the table parser without a separate page fetch
- **Scrape history service** — `recordScrapeComplete()` now persists `source_updated_at`; new `getLastSourceUpdatedAt()` query supports freshness checks

### Removed

- **Cheerio dependency removed from `fhl-link-discovery.js`** — no longer needed since link discovery uses structured JSON instead of HTML parsing

---

## [1.11.1] - 2026-03-12

### Fixed

- **DCL sync fails when FHL records already exist** — DCL scraper now detects cross-source conflicts on the `unique_hearing` constraint, removes the conflicting FHL records, and carries forward the `crown_court` value from the FHL record into the new DCL record

---

## [1.11.0] - 2026-03-12

### Added

- **Future Hearing List (FHL) data source** — scrapes GOV.UK "Court of Appeal cases fixed for hearing (Criminal Division)" as a second data source alongside the existing Daily Cause List (DCL)
- **Multi-source architecture** — new `data_sources` table manages source configuration (interval, time window, enabled, show by default) extensibly; replaces hardcoded source identifiers
- **FHL scraper pipeline** — `fhl-link-discovery.js` discovers the FHL document URL; `fhl-table-parser.js` parses the FHL HTML table (Surname+Forenames, CAO Reference, Hearing Date, Court, Time, Crown Court, Reporting Restriction)
- **Full-replace sync for FHL** — each FHL scrape deletes all existing FHL records and re-inserts with `INSERT IGNORE`, so DCL records always take precedence at the unique constraint level
- **Source-aware scheduling** — scheduler iterates all enabled data sources, each with its own interval and time window from the database
- **Admin data source management** — Data Sources section on `/admin` with enable/disable toggle, "Visible by default" toggle, scrape status, interval/window display, and "Scrape Now" button per source
- **Frontend source filter pills** — pill-button toggles per data source replace the dropdown; initial state driven by `show_by_default` column; supports filtering by multiple sources simultaneously
- **Source provenance badges** — each hearing row/card displays a short badge (DCL/FHL) showing which data source it originated from
- **Crown Court column** — new column in the hearings table and frontend, populated from FHL data
- **Database migrations** — `009_data_sources.sql` (data sources table, FK columns, backfill, indexes), `010_data_source_show_by_default.sql` (show_by_default column)
- **Unit tests** for FHL table parser (date parsing, time validation, row mapping, edge cases)

### Changed

- **Hearings API** — `dataSource` query param now accepts comma-separated IDs (e.g. `1,2`) or `none`; response includes `crownCourt` and `dataSourceName` fields
- **Sync service** — all comparison, insert, and delete queries scoped by `data_source_id` to prevent cross-source interference
- **Scraper service** — refactored into `scrapeDCL()` and `scrapeFHL()` dispatched by source slug; email notifications gated to DCL only
- **Scrape history** — records `data_source_id`; `shouldScrape()` checks per-source interval
- **Public `/api/v1/data-sources` endpoint** — returns enabled sources with `show_by_default` for frontend filter initialisation
- **"Clear All" button** — resets source filter pills to their `show_by_default` states rather than activating all

---

## [1.10.1] - 2026-03-07

### Fixed

- **Dashboard crash after login** — Fastify response schema on `GET /users/me` was stripping all nested properties (user, roles, navigation) due to `type: 'object'` with no declared properties; switched to `additionalProperties: true`
- **Spurious 401 responses for guests** — `nav.js` was calling `/users/me` on every page load including for unauthenticated visitors; now uses a non-httpOnly `loggedIn` hint cookie set on login to skip the call for guests

---

## [1.10.0] - 2026-03-07

### Added

- **`PUBLIC_URL` / `BASE_URL` configuration** — `BASE_URL` env var now used in startup log messages and notification emails; useful when behind a reverse proxy
- **`./bin/cacd secret generate`** CLI command for generating JWT/cookie secrets
- **Composite database index** on `(division, list_date)` for faster date queries
- **Test suite** — Jest 30 with real MariaDB test database; unit tests for config, table-parser, link-discovery, hearings route; integration tests for sync-service
- **Documentation overhaul** — Lean README with links to `docs/`; new docs for configuration, API, CLI, architecture, developing, and scraper development

### Changed

- **Swagger/OpenAPI cleanup**
  - API version now tracks package.json (`1.10.0`)
  - Normalised all Swagger tags to title case (`Hearings`, `Saved Searches`, `Authentication`, `Users`, `Admin`, `System`)
  - Added missing `Saved Searches` tag declaration
  - Removed `division` enum restriction from hearings query (was limited to `Criminal`/`Civil`, now accepts any string for M2 multi-division support)
- **Removed duplicate `GET /auth/me` endpoint** — consolidated into `GET /users/me` which now also returns `roles`, `capabilities`, and `navigation`; frontend updated to use `/users/me`
- **`/api/config` moved to `/api/v1/config`** — consistent with all other API routes; frontend updated
- **Route files no longer read `process.env` directly** — registration settings, cookie secure flag, password reset URL, and saved search length limits now all read from centralised config
- **Health endpoint** now returns `version` field from `package.json`
- **`docs/api.md`** now lists all ~30 endpoints (previously only 12)

### Fixed

- **Cookie secret** now uses dedicated `COOKIE_SECRET` env var (falls back to `JWT_SECRET`); previously used a hardcoded fallback
- **JWT_SECRET required** — application now fails to start if `JWT_SECRET` is not set
- **SQL injection surface** — ORDER BY columns in hearings route now use a whitelist map
- **Bulk database operations** — sync-service uses bulk INSERT (batched at 500) and bulk DELETE instead of sequential single-row operations
- **Hardcoded scraper URL** — `link-discovery.js` now reads `SUMMARY_PAGE_URL` from config; `BASE_URL` derived dynamically
- **OGL compliance** — Crown Copyright / OGL v3.0 attribution added to frontend footers
- **Stale `APP_URL` env var** in forgot-password route replaced with `config.baseUrl`

### Security

- `.env` file permission check on startup (requires `0600` on Unix)
- Deprecated `ALERT_EMAIL` removed from `.env.example`
- All route handlers now read configuration through centralised config module instead of `process.env` directly

### Dependencies

- Updated nodemailer 7.x to 8.x
- Updated fastify, mysql2, dotenv, and other semver-compatible packages
- Fixed 5 npm audit vulnerabilities (ajv, bn.js, fastify, minimatch, brace-expansion)

---

## [1.9.0] - 2026-02-03

### Fixed

- **Link Discovery Date Matching**
  - Fixed link discovery to handle both padded and unpadded day numbers
  - Now correctly matches "03 February" as well as "3 February"
  - Prevents false negatives when Gov.uk site uses leading zeros in dates
  - Added word boundary checks to prevent "1" matching "31" or "21"

- **CLI Scraper Command**
  - Fixed `./bin/cacd scraper run` command error
  - Corrected function call to use `scrapeAll()` instead of non-existent `discoverLinks()`
  - Command now properly executes full scraping workflow
  - Improved result output formatting

### Changed

- **Dependencies**
  - Updated `@fastify/static` from 8.3.0 to 9.0.0
  - Updated `globals` from 16.5.0 to 17.3.0
  - All packages audited with 0 vulnerabilities

---

## [1.8.0] - 2026-01-29

### Added

- **Email Notification Throttling**
  - Data error emails now throttled to one per 30 minutes per error type
  - Prevents email flooding during prolonged site outages or maintenance
  - Independent throttling for Link Discovery and Table Parsing errors
  - In-memory tracking of last email sent time for each error type
  - Logs throttled email attempts for monitoring

### Changed

- **Email Service Behavior**
  - EmailService now tracks last sent time for each error type
  - 30-minute cooldown period between error emails of the same type
  - Throttling does not affect saved search notification emails

---

## [1.7.4] - 2025-12-22

### Added

- **Startup Security Checks**
  - Added `.env` file permission validation on startup
  - Verifies `.env` has secure 0600 permissions (owner read/write only)
  - Prevents application startup if `.env` file has insecure permissions
  - Displays helpful error messages with instructions to fix permissions
  - Automatically skips check on Windows systems (not applicable)
  - Added `SKIP_STARTUP_FILESYSTEM_CHECK` environment variable to bypass check
  - Security check runs before loading configuration in both main app and CLI
  - Helps prevent accidental exposure of sensitive environment variables

---

## [1.7.3] - 2025-12-18

### Fixed

- **Email Service Robustness**
  - Fixed config.server.port reference (should be config.port)
  - Validates SMTP configuration before initialization
  - Returns gracefully if SMTP credentials missing instead of throwing error
  - Added transporter existence check before sending emails
  - Improved logging for email service initialization failures
  - Prevents "Cannot read properties of undefined (reading 'port')" error

### Changed

- **Email Service Initialization**
  - No longer throws error if SMTP config incomplete
  - Logs warning and continues without email service if credentials missing
  - Checks for this.transporter existence in send methods
  - More detailed debug logging for troubleshooting

---

## [1.7.2] - 2025-12-18

### Fixed

- **Rate Limiting Scope**
  - Rate limiting now only applies to `/api/*` routes, not static assets
  - Static files (CSS, JS, Bootstrap, favicons) no longer trigger rate limits
  - Authenticated users bypass rate limiting for API requests
  - Fixes "Too Many Requests" errors when loading dashboard with multiple static assets
  - Prevents rate limit exhaustion from browser loading JS/CSS files

### Changed

- **Rate Limiter Configuration**
  - Moved rate limiter registration into API routes scope only
  - Frontend routes and static file serving excluded from rate limiting
  - Skip function checks JWT tokens (Authorization header or accessToken cookie)
  - Valid access tokens bypass rate limiting completely

---

## [1.7.1] - 2025-12-18

### Fixed

- **Time Format Parsing**
  - Time validation now supports hours without minutes (e.g., "10am", "2pm")
  - Previously required format "10:30am" with mandatory minutes portion
  - Minutes default to ":00" when not specified
  - Fixes "Invalid time format" errors on staging when court listings use simplified time format
  - Updated regex pattern in `validateTime()` and `combineDateTime()` functions

---

## [1.7.0] - 2025-12-18

### Added

- **Saved Searches Feature**
  - User-defined text search phrases (3-255 characters)
  - Maximum 10 saved searches per user (configurable)
  - Enable/disable individual searches without deletion
  - Email notifications when new matching hearings are found
  - Consolidated email with all matches grouped by search phrase
  - Rate limiting: maximum 2 emails per 12-hour window per user
  - Search against TODAY and TOMORROW hearings only
  - Full-text search using MATCH...AGAINST with case_number LIKE fallback
  - Database migration 007 with saved_searches and search_notifications tables

- **Saved Searches API**
  - `GET /api/v1/searches` - List user's saved searches
  - `GET /api/v1/searches/:id` - Get single saved search
  - `POST /api/v1/searches` - Create new saved search
  - `PATCH /api/v1/searches/:id` - Update search (text or enabled status)
  - `DELETE /api/v1/searches/:id` - Delete saved search
  - `PATCH /api/v1/users/me/notifications` - Toggle email notifications preference
  - All endpoints require authentication
  - Validation with configurable min/max length and per-user limits

- **Email Notification System**
  - Handlebars email template (slate blue theme)
  - HTML and plain text versions
  - Integrated into scraper workflow (runs after successful scrape)
  - Groups searches by user to avoid duplicate emails
  - Respects user notification preferences and rate limits
  - Single "Go to CACD Archive" link using BASE_URL
  - Formatted hearing details (case name, date, time, court, judge)

- **Dashboard Saved Searches UI**
  - Create/edit/delete saved searches in dashboard
  - Toggle individual searches on/off
  - Enable/disable email notifications globally
  - Simple form with search text and enabled checkbox
  - Real-time validation and error handling
  - Right-aligned action buttons for better UX

- **Build System Improvements**
  - Minify ALL JavaScript files (app.js, auth.js, nav.js, dashboard.js, admin.js, login.js)
  - Process ALL HTML files (index, login, register, reset-password, dashboard, admin)
  - Update asset references to .min.js and .min.css with version cache-busting
  - Production build in dist/ directory (24.73 KB total minified JS)
  - Sourcemaps for debugging
  - Detailed build output with file sizes

- **Authentication Improvements**
  - Automatic JWT token refresh on client-side
  - Refreshes when <5 minutes remaining before expiry
  - Intercepts all /api/\* fetch calls to ensure valid tokens
  - Background check every 60 seconds
  - Eliminates aggressive logout issues

- **Navigation Enhancements**
  - Added "Home" button to navigation
  - Filter out current page from nav menu for cleaner UX
  - Removed redundant admin section from dashboard

- **Configuration**
  - `SAVED_SEARCH_MIN_LENGTH` - Minimum search text length (default: 3)
  - `SAVED_SEARCH_MAX_LENGTH` - Maximum search text length (default: 255)
  - `SAVED_SEARCH_MAX_PER_USER` - Maximum searches per user (default: 10)
  - `NOTIFICATION_MAX_PER_WINDOW` - Email rate limit count (default: 2)
  - `NOTIFICATION_WINDOW_HOURS` - Email rate limit window (default: 12)
  - `BASE_URL` - Application base URL for email links

### Changed

- **Static Assets**
  - Self-host Bootstrap Icons (v1.13.1) instead of CDN for CSP compliance
  - All assets served from local node_modules or dist/ directory
  - No external CDN dependencies

- **Email Service**
  - Updated to use single BASE_URL for all email links
  - Removed separate dashboard and unsubscribe URLs from templates
  - Cleaner email footer with single call-to-action

### Fixed

- CSP violation loading Bootstrap Icons from external CDN
- Authentication middleware not properly attached to saved searches routes
- MySQL boolean field conversion (enabled field requires explicit 0/1 values)
- Toggle button data attribute comparison (string vs boolean)
- Search query column name mismatch (standardized on actual table columns)
- MIME type mismatch for JavaScript files in production build

---

## [1.6.0] - 2025-12-18

### Added

- **User Authentication System**
  - JWT-based authentication with access and refresh tokens
  - httpOnly cookies for secure token storage
  - Password hashing with bcrypt (12 rounds)
  - Password validation (12+ chars, uppercase, lowercase, number, special char)
  - Account status management (pending, active, inactive, suspended, deleted)
  - User status history tracking for audit trail

- **Role-Based Access Control (RBAC)**
  - Database-driven roles and capabilities system
  - Two default roles: Administrator (full access), User (limited access)
  - 32 capabilities across 9 categories (users, roles, scraper, searches, profile, notifications, hearings, audit, system)
  - Flexible permission checking middleware
  - Role assignment tracking with assigned_by field

- **Authentication API**
  - `/api/v1/auth/login` - User login with remember me option
  - `/api/v1/auth/logout` - Session termination
  - `/api/v1/auth/me` - Current user profile with roles and capabilities
  - `/api/v1/auth/change-password` - Password change endpoint
  - `/api/v1/auth/refresh` - Token refresh endpoint
  - Password reset endpoints (forgot-password, reset-password) - backend ready

- **User Management API**
  - `/api/v1/users/me` - Get/update own profile
  - `/api/v1/admin/users` - List all users with pagination and filters
  - `/api/v1/admin/users/:id` - Get/update/delete user
  - `/api/v1/admin/users/:id/approve` - Approve pending users
  - `/api/v1/admin/users/:id/activate|deactivate` - Manage account status
  - `/api/v1/admin/users/:id/roles` - Assign/remove roles

- **CLI Administration Tools**
  - `./bin/cacd users create` - Interactive user creation with prompts
  - `./bin/cacd users list` - View all users with roles and status
  - `./bin/cacd users show` - View user details and status history
  - `./bin/cacd users approve` - Approve pending accounts
  - `./bin/cacd users deactivate` - Deactivate user accounts
  - Pretty CLI output with colors, tables, spinners, and boxes
  - Non-interactive mode with flags for automation

- **Frontend Authentication Pages**
  - `/login` - Clean URL login page with validation
  - `/dashboard` - User dashboard with password change and saved searches cards
  - `/admin` - Admin user management with paginated table and edit modal
  - `/register` - Registration page (placeholder)
  - `/reset-password` - Password reset page (placeholder)
  - Dynamic navigation menu based on user roles
  - Automatic `.html` to clean URL redirects

- **Frontend Route Protection**
  - Server-side route authentication via middleware
  - `/dashboard` requires any authenticated user
  - `/admin` requires administrator role
  - 401/403 redirects to login with return path
  - Frontend auth checks for seamless UX

### Changed

- **URL Structure**
  - All frontend routes now use clean URLs without `.html` extension
  - Legacy `.html` URLs redirect permanently (301) to clean URLs
  - Frontend routes registered before static files for proper precedence
  - Root `/` continues to serve index.html

- **Navigation System**
  - Dynamic navigation based on user authentication state
  - Guest users see: Login, Register
  - Regular users see: Dashboard, Logout
  - Administrators see: Admin, Dashboard, Logout
  - Navigation structure returned by `/api/v1/auth/me` endpoint

- **Server Configuration**
  - New `JWT_SECRET` environment variable required
  - JWT token expiry configuration (access: 15min, refresh: 7 days)
  - Password requirements configurable via environment
  - Public registration and admin approval toggles
  - Cookie support added via @fastify/cookie plugin

### Fixed

- **Content Security Policy**
  - Removed inline `onclick` handlers that violated CSP
  - Replaced with proper event listeners using data attributes
  - All navigation actions now use `data-nav-action` pattern
  - Admin user row clicks use `data-user-id` attributes

- **Error Handling**
  - Improved error logging in server startup
  - Full stack traces now displayed on server errors
  - Better error messages for authentication failures
  - Graceful handling of missing saved searches API (404)

### Security

- **Authentication Hardening**
  - Passwords never returned in API responses
  - Account status checked on every authenticated request
  - Refresh tokens separate from access tokens
  - Password reset tokens expire after use
  - Status change audit trail with changed_by tracking

- **Authorization**
  - Middleware prevents users from modifying their own account status
  - Middleware prevents users from deleting themselves
  - Capability-based access control for all admin endpoints
  - Role checks prevent privilege escalation

### Developer Experience

- **Documentation**
  - New `docs/url-restructure.md` documenting clean URL implementation
  - Updated project roadmap showing Phase 2 and 3 completion
  - API endpoints documented in Swagger (v2.0.0)
  - CLI commands self-documented with --help

- **Code Quality**
  - All code formatted with Prettier
  - ESLint passing with no errors
  - CSP-compliant JavaScript (no inline handlers)
  - Proper error handling throughout

### Dependencies

- **Added**
  - bcrypt - Password hashing
  - jsonwebtoken - JWT token generation/verification
  - @fastify/jwt - Fastify JWT plugin
  - @fastify/cookie - Cookie parsing and setting
  - commander - CLI framework
  - chalk@4 - Terminal colors (CommonJS)
  - cli-table3 - Formatted tables
  - inquirer@8 - Interactive prompts (CommonJS)
  - ora@5 - Spinners (CommonJS)
  - boxen@5 - Terminal boxes (CommonJS)

---

## [1.5.0] - 2025-12-17

### Added

- **Pagination Configuration**
  - Configurable records per page via `RECORDS_PER_PAGE` environment variable
  - New `/api/config` endpoint exposes client-side configuration
  - Frontend dynamically loads pagination settings from API
  - Proper pagination controls with page X of Y display

- **Self-Hosted Dependencies**
  - Bootstrap 5 now served from node_modules instead of CDN
  - `/vendor/bootstrap/` route serves Bootstrap directly from npm package
  - No manual copying required - always uses installed version
  - Better performance and offline capability

- **UI Enhancements**
  - GitHub repository link in footer with icon
  - Improved result count display: "Showing X of Y hearings" or "Showing all X hearings"
  - Contextual messaging when no results match search criteria
  - Inline loading spinner (1.2em, no layout shift)
  - Smooth fade-out animation for loading spinner (300ms)

- **Security Improvements**
  - XSS protection: HTML escaping for all user-facing data
  - `escapeHtml()` helper function prevents script injection
  - Comprehensive security audit documented in `docs/security-audit.md`
  - Removed CDN references from Content Security Policy
  - Stricter CSP with only self-hosted resources

- **CSS Variables**
  - Centralized color scheme with CSS custom properties
  - All site colors defined in `:root` (--site-primary, --site-secondary, etc.)
  - Easy theming and consistent styling throughout application
  - Loading spinner matches header color automatically

### Changed

- **Bootstrap Integration**
  - Migrated from CDN to npm package (bootstrap@5.3.3)
  - Updated HTML to reference `/vendor/bootstrap/` paths
  - Simplified CSP without external CDN domains
  - Automatic updates when Bootstrap npm package is updated

- **UI Refinements**
  - Result count display adapts based on context (all results vs paginated)
  - Loading indicator moved from block element to inline spinner
  - Smoother page transitions without layout shifts

### Fixed

- **Performance**
  - Eliminated duplicate API calls when clearing all filters
  - "Clear All" button now triggers single API request instead of two

- **Security**
  - All data rendered with HTML escaping to prevent XSS attacks
  - Sanitized output in both desktop table and mobile card views

### Security

- Complete security audit performed and documented
- XSS vulnerability identified and fixed
- SQL injection protection verified (parameterized queries throughout)
- HTTP security headers confirmed (Helmet with CSP, HSTS, etc.)
- Rate limiting verified and active
- Input validation via Fastify schemas confirmed

---

## [1.4.0] - 2025-12-15

### Added

- **Search Enhancement**
  - Search now includes case numbers in addition to fulltext search
  - Users can search for partial or complete case numbers (e.g., "202404094")
  - Combines fulltext search (case details, hearing type, judge, venue) with case number LIKE query

### Changed

- **UI Improvements**
  - Removed default "Today" filter selection on page load
  - Page now loads with no filters applied by default
  - Users must explicitly select date filters for clearer UX

### Fixed

- **Code Quality**
  - Fixed ESLint warning for unused parameter in placeholder function
  - All lint checks now passing

---

## [1.3.3] - 2025-12-15

### Fixed

- **Database Schema**
  - Extended `hearing_type` column from VARCHAR(255) to TEXT
  - Prevents data truncation errors when gov.uk site changes structure
  - Handles cases where additional_information content appears in hearing_type field

### Added

- **CLI Tools**
  - Created `migrate.js` CLI tool for running database migrations manually
  - Allows migrations without full application restart
  - Usage: `npm run migrate` or `node src/cli/migrate.js`

---

## [1.3.2] - 2025-12-11

### Added

- **Security Hardening**
  - Integrated @fastify/helmet for comprehensive HTTP security headers
  - Content Security Policy (CSP) with Bootstrap CDN allowlist
  - HSTS with 1-year max-age, subdomain inclusion, and preload support
  - X-Frame-Options, X-Content-Type-Options, and other security headers
  - Configurable CORS with environment-based origin restrictions
  - Trust proxy configuration for proper IP detection behind reverse proxies
  - Comprehensive security documentation in docs/security.md

### Changed

- **CORS Configuration**
  - Added CORS_ENABLED environment variable (default: true)
  - Added CORS_ALLOWED_ORIGINS for production origin whitelisting
  - Development allows all origins, production requires explicit configuration
  - Can be completely disabled for same-origin-only deployments

### Security

- HTTP security headers now active on all endpoints
- Production-ready security posture for public deployment
- Protection against clickjacking, MIME-sniffing, and XSS attacks
- Rate limiting headers visible in responses

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

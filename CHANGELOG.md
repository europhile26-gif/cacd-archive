# Changelog

All notable changes to the CACD Archive project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.20.0] - 2026-09-10

### Added

- **Analytics page at `/analytics` (M2.2d)** — admin-gated view of the request analytics collected since v1.19.0. Completes M2.2 alongside the privacy notice below.
  - **Summary tiles** — requests, visitors (distinct fingerprints), distinct addresses, error rate split into 4xx/5xx, and average response time, over a selectable 24-hour, 7-day or 30-day window.
  - **Two bar charts** — requests per day and visitors per day, as **hand-rolled inline SVG with no charting dependency**. Given separate scales rather than a dual axis, because visitor counts are an order of magnitude below request counts and would be invisible on a shared one. Empty days are filled so the time axis stays even, and each bar carries a native `<title>` tooltip.
  - **Breakdown tables** — top routes with average duration, status-code bands with percentage share, networks by ASN with organisation, countries, and top addresses with a one-click filter through to the log.
  - **Request log** — paginated, filterable by address, route substring, country, status and ASN, with a click-through from any fingerprint to its pseudo-session: every request that fingerprint made, in order.
  - **`system:analytics` capability** (migration `014_analytics_capability.sql`), granted to the administrator role. Gating the page and its endpoints on a dedicated capability rather than the administrator role means access to IP addresses and pseudo-session data can be granted separately from the wider admin surface.
  - Four endpoints under `/api/v1/admin/analytics/`: `summary`, `requests`, `sessions/:fingerprint` and `status`. Every aggregate is bounded by a date window and served by one of the `(column, created_at)` indexes.
- **Privacy notice at `/privacy` (M2.2e)** — public page, linked from the footer of every page that has one. Covers what is collected and why, what is deliberately not collected, how the pseudonymous identifier works, the lawful basis, retention, and how to exercise data subject rights including the right to object. Written to be read by a visitor, not a lawyer.
- **`docs/legitimate-interests-assessment.md`** — the LIA supporting Article 6(1)(f) as the lawful basis: purpose, necessity and balancing tests, with each design decision recorded against the more intrusive alternative it replaced. Names the changes that would invalidate it and require it to be redone.
- **37 further tests** covering the aggregates, the date-window boundary, filters and pagination, pseudo-session grouping, and that every endpoint refuses both unauthenticated callers and callers without the capability.

### Security

- **Analytics output is escaped before rendering.** Unmatched request paths are recorded as sent, so a probe for `/<script>…` puts an attacker-chosen string in the request log. Every value rendered on the analytics page passes through HTML escaping, so a probe cannot become stored XSS in the admin interface.
- The analytics `status` endpoint reports collection settings but never the fingerprint secret; a test asserts the secret does not appear in the response.

---

## [1.19.1] - 2026-09-10

### Fixed

- **Static assets were being logged, and the homepage was indistinguishable from a stylesheet.** `@fastify/static` serves everything through wildcard routes, so the analytics hook recorded the matched pattern `/*` for the homepage, every frontend page view and every probe attempt alike — while also writing a row for every CSS file, script, icon and font. Measured against real traffic on the dev server, **57% of rows were static assets**, and a real browser page load would push that far higher. M2.2 always specified that static assets are excluded; this makes it so.
  - Asset requests are now skipped by file extension (`.css`, `.js`, `.map`, `.ico`, images, fonts, `.webmanifest` and friends), and `/vendor` joins the default `ANALYTICS_EXCLUDE_ROUTES`.
  - Wildcard and unmatched routes now record the real path instead of the pattern, so the homepage logs as `/`, page views log as `/login` and `/dashboard`, and probes still log as requested. Matched API routes keep their pattern, so `/api/v1/hearings/42` still groups under `/api/v1/hearings/:id`.
  - Verified end to end: ten requests including six assets now produce four rows — `/`, `/login`, `/api/v1/hearings`, `/api/v1/config` — and no wildcard rows at all.

### Added

- **17 further tests** covering asset classification, route resolution for matched, wildcard and unmatched routes, and integration coverage asserting that assets produce no rows while the homepage and page views record distinctly.

---

## [1.19.0] - 2026-09-10

### Added

- **Request analytics collection pipeline (M2.2a–c)** — server-side request logging with GeoIP, a pseudo-session fingerprint, a country blocklist and enforced retention. **Nothing is stored in the browser**: no cookies, no localStorage, no client-side script. Disabled by default via `ANALYTICS_ENABLED`; the `/analytics` page that reads this data follows in the next release.
  - **What is recorded** — IP, method, route pattern, status code, duration, user agent, country, ASN and organisation, a pseudo-session fingerprint, and user ID when authenticated. Backed by migration `013_request_log.sql`.
  - **What is deliberately not recorded** — query parameters, city, region and referrer. Only the route _pattern_ is stored for matched routes, so `/api/v1/hearings` is logged and `?search=…&caseNumber=…` never is: tying a search term to a client address would record that a given person looked up a given name in criminal court records. Unmatched paths are stored as requested (minus the query string) so probe attempts stay visible.
  - **Salted, daily-rotating fingerprint** — `sha256(secret + date + ip + user agent)` groups requests into sessions without a cookie. The date component caps linkability at 24 hours; the secret is what makes it pseudonymous, since IP plus user agent is a brute-forceable input space on its own. `ANALYTICS_FINGERPRINT_SECRET` is required when analytics is enabled and startup fails without it.
  - **Batched writes** — records buffer in memory and flush every 5s or every 100 records, whichever comes first, so no database write sits on the request path. Writes are best-effort by design: a database failure drops analytics rows and logs the count rather than failing user requests. The buffer is per-instance and flushed on shutdown.
  - **GeoIP via local MaxMind GeoLite2 files** — country and ASN read from `.mmdb` files through the `maxmind` package. Each database loads independently, so a missing or corrupt file degrades that lookup to `null` rather than failing startup. City is not collected.
  - **Country blocklist** — `BLOCKED_COUNTRIES` returns `403` from an early hook, before auth and rate limiting. Empty by default, which skips the hook entirely.
  - **Retention purge** — a nightly cron on PM2 instance 0 deletes records older than `ANALYTICS_RETENTION_DAYS` (default 30). This is what enforces the retention period a privacy notice will state.
- **`./bin/cacd db purge-analytics`** — runs the same purge on demand, with `--days <n>` to override the retention window.
- **`test/unit/analytics-service.test.js` and `test/integration/analytics-logging.test.js`, `test/integration/geoip-blocklist.test.js`** — 33 tests covering fingerprint stability and daily rotation, route exclusion, DNT, real country/ASN resolution, the retention boundary, blocklist enforcement across public routes, and graceful handling of private and malformed addresses. Two tests specifically assert that search terms and case numbers never reach the log.

### Changed

- **Configuration now reports every problem at once** rather than throwing on the first. A misconfigured deployment sees the full list in one startup instead of fixing them one restart at a time.
- **Integer config options no longer swallow a deliberate `0`.** `parseInt(value, 10) || fallback` silently replaced `ANALYTICS_RETENTION_DAYS=0` with the default, which would have made the retention validation unreachable; the new parser falls back only when a value is absent or unparseable.

### Security

- Analytics defaults to off, and enabling it requires a fingerprint secret. **Do not enable in production until a privacy notice is published** — IP addresses are personal data and the fingerprint is pseudonymous rather than anonymous, so UK GDPR applies even though no cookie banner is required. The notice and the legitimate interests assessment ship with the `/analytics` page in the next release.

---

## [1.18.3] - 2026-09-10

### Security

- **Clients could forge their own IP address via `X-Forwarded-For`.** `src/api/server.js` hardcoded `trustProxy: true`, which trusts every hop in the header and takes the leftmost entry — the part the client controls. Both Apache `mod_proxy` and nginx `proxy_add_x_forwarded_for` _append_ the real peer to whatever the client sent, so a request arriving as `X-Forwarded-For: 9.9.9.9, 203.0.113.9` resolved `request.ip` to `9.9.9.9`. Because `@fastify/rate-limit` keys its buckets on `request.ip`, per-IP rate limiting could be evaded by rotating the header. Trust is now expressed as a list of proxy addresses, so an address that is not ours cannot forge a client IP.

### Added

- **`TRUSTED_PROXIES` config option** (default `loopback`) — addresses, CIDR ranges, or a named preset identifying our own reverse proxies. `loopback` is correct when Apache or nginx runs on the same host; use the proxy's address or range when it does not. Documented in `.env.example` with the deployment cases spelled out.
- **`test/integration/trust-proxy.test.js`** — asserts the real client IP is resolved from a proxy-forwarded header, that a client-supplied entry (and a multi-hop forged chain) is ignored, and that the socket address is used when no header is present. One test pins the old `trustProxy: true` behaviour explicitly, documenting why it is not used.

### Changed

- **A numeric `TRUSTED_PROXIES` is rejected at startup** with an explanatory error. Fastify 5 fails closed on numeric `trustProxy` — a hop count cannot validate the immediate peer — so `request.ip` would silently resolve to the proxy's own address instead of the client's. Setting `TRUSTED_PROXIES=true` is still permitted but logs a warning naming the risk.
- **`docs/security.md` reverse-proxy section rewritten** — explains how `X-Forwarded-For` is resolved and why the trusted list matters, with a table of deployment cases and a worked Apache `mod_proxy` example alongside the existing nginx one. Previously it instructed setting `trustProxy: true`, which was the vulnerable configuration.

---

## [1.18.2] - 2026-09-10

### Fixed

- **The API docs reported a stale version.** `src/api/server.js` hardcoded the Swagger `info.version` as `'1.10.1'`, so `/api/docs` and `/api/docs/json` had been advertising a version eight releases behind since v1.11.0. It now reads `version` from `package.json`, matching how `src/api/routes/health.js` and `src/api/routes/admin.js` already source it, and so tracks future releases without a fifth place to remember to bump.

### Added

- **`test/integration/swagger-spec.test.js`** — asserts the generated OpenAPI document and the `/api/docs/json` response both report the `package.json` version, so the value cannot silently go stale again.

---

## [1.18.1] - 2026-09-10

### Fixed

- **`.html` URLs returned a 500 instead of redirecting.** `src/api/routes/frontend.js` called `reply.redirect(301, target)` — the Fastify 4 argument order. Fastify 5 takes `reply.redirect(url, code)`, so the status code was being handed the path and every request threw `FST_ERR_BAD_STATUS_CODE`, surfacing as a 500. All six legacy paths were affected (`/index.html`, `/login.html`, `/register.html`, `/reset-password.html`, `/dashboard.html`, `/admin.html`); they now issue the intended `301` to their clean URL. The call site is unchanged since v1.6.0, so this has been broken since the Fastify 5 upgrade — bookmarks and any external links to the old `.html` URLs have been erroring rather than forwarding.

### Added

- **`test/integration/frontend-redirects.test.js`** — boots the real Fastify app and asserts the status code and `Location` header for each redirect, since a route-table assertion would not have caught an argument-order bug. Verified to fail (500) against the pre-fix code.

### Changed

- **Test scripts now run under `NODE_OPTIONS=--experimental-vm-modules`.** `@fastify/cookie` 11.1.2 (picked up in v1.18.0) loads part of itself via dynamic `import()`, which Jest's VM rejects without the flag. This only affects tests that boot the server — the running app is unaffected — but the flag is needed for any integration test that calls `createServer()`.

---

## [1.18.0] - 2026-09-10

### Security

- **All known dependency advisories cleared — `npm audit` now reports 0 vulnerabilities.** Three major upgrades were needed, each verified against how we actually use the package:
  - **`@fastify/static` 9 → 10** (two highs: [GHSA-8pvw-jcv7-9cmj](https://github.com/advisories/GHSA-8pvw-jcv7-9cmj) authorization bypass via non-canonical URL paths, [GHSA-83w8-p2f5-377r](https://github.com/advisories/GHSA-83w8-p2f5-377r) route-guard bypass via path traversal). Directly relevant — we register three static roots in `src/api/server.js`, including one serving `dist/`/`public/` at `/` behind the frontend and API routes. The v10 breaking change is the `setHeaders` callback receiving a `FastifyReply` instead of a Node response; we don't use `setHeaders`, so no code change was required.
  - **`@fastify/swagger-ui` 5 → 6** — carried the same vulnerable `@fastify/static`. The v6 major only removes the deprecated `useUnsafeMarkdown` option, which we don't set.
  - **`nodemailer` 8 → 10** (five highs, including `raw`/`resolveContent()` bypasses of `disableFileAccess`/`disableUrlAccess`, IDN/punycode and RFC 5322 comment allow-list bypasses, and quadratic-time `addressparser` DoS). This clears the advisory that had been deferred since the 2026-06-25 refresh. v10 is a TypeScript rewrite shipping both CJS and ESM builds; `require('nodemailer').createTransport` is unchanged, and our plain-SMTP setup in `src/services/email-service.js` was verified against the live SMTP server via `transporter.verify()`.
- **`esbuild` 0.27 → 0.28** — [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), arbitrary file read via the dev server on Windows. Dev-only, and not reachable on Linux or from `scripts/build.js` (which never starts the dev server), but the fix was out of our declared range so the bump was taken rather than pinning to the older 0.27.2.
- **In-range refresh + `npm audit fix`** — cleared the remaining transitive advisories without any declared-range changes: `js-yaml` (the `jest` → `babel-plugin-istanbul` → `@istanbuljs/load-nyc-config` chain that had no fix in June now does), plus `brace-expansion`, `browserslist`, `baseline-browser-mapping`, `fast-uri`, `find-my-way`, and `undici`. Notable in-range bumps: `fastify` 5.8.5 → 5.12.3 (fixes schema-validation bypass via root primitive coercion and `X-Forwarded-*` spoofing under `trustProxy` hop-count — we run with `trustProxy: true` behind nginx), `mysql2` 3.22.5 → 3.24.4 (decompression-bomb DoS in the compressed-protocol handler), `@fastify/cookie` 11.1.2, `@fastify/cors` 11.3.0, `@fastify/helmet` 13.1.1, `@fastify/swagger` 9.8.1, `node-cron` 4.6.0, and dev tooling (`jest` 30.5.1, `prettier` 3.9.6, `eslint` 9.39.5, `globals` 17.12.0).

### Changed

- **Minimum Node.js version raised from 18 to 22.** Forced by `nodemailer` 10, which requires Node ≥20; 22 was chosen over 20 because Node 18 reached end-of-life in April 2025 and Node 20 in April 2026, so 22 is the oldest release still receiving security patches. Updated in `package.json` `engines`, `README.md`, `docs/developing.md`, and `docs/pm2-deployment.md`. **Deployment note:** check the Node version on the production host before deploying this release.

### Notes

- `chalk`, `ora`, `boxen`, and `inquirer` remain pinned to their last CommonJS majors — the newer versions are ESM-only and adopting them is an ESM migration, not a version bump. `@fastify/rate-limit` 11, `commander` 15, and `eslint` 10 are available and non-ESM but carry no advisories; they're deferred to a separate major-bump pass to keep this release scoped to security.

---

## [1.17.0] - 2026-06-25

### Added

- **"Future hearings only" option for saved searches** — each saved search now has an optional _Only match hearings that are still in the future_ flag (off by default). When enabled, the notification matcher drops any hearing whose start time has already passed, so a user is no longer alerted at, say, 5pm about a 10:30am hearing that morning. `hearing_datetime` is stored as a UTC instant, so the matcher compares it against `UTC_TIMESTAMP()` — correct relative to the current Europe/London moment regardless of the database server's timezone. Surfaced as a checkbox in the dashboard saved-search modal (with a "Future only" badge in the list), accepted as `future_only` on the `POST`/`PATCH /api/v1/searches` endpoints, and reflected in the `search saved` CLI preview. Backed by migration `012_saved_search_future_only.sql` (`future_only BOOLEAN NOT NULL DEFAULT FALSE`); existing searches keep their current behaviour.

---

## [1.16.0] - 2026-06-04

### Added

- **Admin System Info panel** — the `/admin` page now shows a System Info card with deployment diagnostics: app version, environment, Node.js version, uptime, database connectivity, and migration state (applied/total, latest migration, and any pending migrations). Backed by a new `GET /api/v1/admin/system-info` endpoint restricted to the **administrator role** (`requireAuth` + `requireAdmin`); it degrades gracefully to a `disconnected` database status rather than failing the panel if the migration query errors. Migration state is derived from a new reusable `getMigrationStatus()` helper in `src/db/migrator.js` that compares the `schema_migrations` table against the migration files on disk.

---

## [1.15.0] - 2026-06-04

### Added

- **`search` CLI command group** — tooling to test saved-search matching and notifications from the command line, reusing the same production code paths (`buildHearingSearchFilter`, the notification matcher, and the email templates) so results mirror what users receive:
  - **`search run <phrase>`** — run the matcher for a phrase and print the matching hearings. Defaults to the today + tomorrow notification window; `--all`, `--from`, and `--to` adjust the date range, `--verbose` shows the `LIKE` pattern and which column matched each row, and `--json` emits machine-readable output (info logs are suppressed so stdout stays pipeable).
  - **`search saved [--user <email>]`** — list saved searches with their owners and preview what each matches now, flagging searches that wouldn't actually notify (disabled, notifications off, or inactive user).
  - **`search preview-email <phrase>`** — render the saved-search notification email (plain text, `--html`, or `--out <file>`) without sending it.
  - **`search notify`** — exercise the notification pipeline; dry-run by default (reports who would be emailed and why), `--send` runs the real pipeline after confirmation.
- **PM2 graceful-reload readiness signal** — the app now emits `process.send('ready')` once the HTTP server is accepting connections, so `wait_ready: true` makes `pm2 reload` a true zero-downtime reload (PM2 holds the old instance until the new one is ready). `ecosystem.config.js.example` enables `wait_ready` with a 10s `listen_timeout` fallback, and `docs/pm2-deployment.md` documents it. The signal is guarded by `process.send`, so direct `node`/nodemon runs are unaffected.

---

## [1.14.1] - 2026-06-03

### Fixed

- **Saved-search alerts (and on-site search) returned false matches** — a search for a phrase such as `Criminal Cases Review Commission` was run with `MATCH ... AGAINST(... IN NATURAL LANGUAGE MODE)`, which treats the term as a bag of individual words and matched any hearing containing merely `Criminal` (e.g. a case whose hearing type cites the _Criminal_ Justice Act 1988). Searching is now an exact, case-insensitive phrase match (`LOWER(col) LIKE`) across the same columns (`case_details`, `hearing_type`, `additional_information`, `judge`, `venue`, `case_number`). LIKE wildcards (`%`, `_`) in the term are escaped and matched literally, and a single pair of surrounding quotes is trimmed so a quoted phrase still matches. Logic is shared between the search API and the notification matcher via `src/utils/search-filter.js` so the two cannot drift apart

### Added

- **Case Number in saved-search match emails** — each matched case in the notification email (HTML and plain-text) now shows its case number, previously omitted

---

## [1.14.0] - 2026-05-28

### Added

- **`users reset-password` CLI command** — admin-driven password reset for when a user is locked out (the self-service "forgot password" front-end isn't built yet). `./bin/cacd users reset-password --email <email>` looks up the account, shows it for confirmation, then prompts for a new password (masked, entered twice) validated against the standard strength rules. Supports `--id` as an alternative lookup and `--password` for non-interactive use

### Removed

- **`@fastify/jwt` dependency** — declared but never imported (auth uses `jsonwebtoken` directly + `@fastify/cookie` for transport). Removing it also dropped transitive `fast-jwt`, which was the other critical advisory

### Security

- **npm audit fix** — resolved 11 advisories (1 critical, 6 high, 4 moderate) across `@fastify/static`, `fastify`, `handlebars`, `nodemailer`, and transitive deps (`brace-expansion`, `fast-uri`, `flatted`, `lodash`, `picomatch`, `undici`, `yaml`). All within-major bumps; 0 vulnerabilities remain

---

## [1.13.1] - 2026-05-21

### Fixed

- **Hearing times off by one hour during BST** — `hearing_datetime` was built from the source page's local time (e.g. `10:30am`) as a naive datetime string and stored in MariaDB without timezone conversion. With the pool configured `timezone: '+00:00'`, mysql2 then read the value back as UTC, so a 10:30 BST hearing rendered as 11:30 in the browser. Times now go through `fromZonedTime('Europe/London')` in both DCL and FHL parsers so storage is true UTC and matches the source page year-round. Existing buggy rows self-heal on the next scrape (DCL via `hasChanged`/update, FHL via full-replace); rows that no longer appear in either source page stay 1 hour ahead during May–Oct only

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

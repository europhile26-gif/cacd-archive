# Project Tracker

**Version:** 1.19.0
**Last Updated:** 2026-09-10
**Current Phase:** M2.1 complete (v1.13.0) — next: M3 (Multi-Division Support)

---

## Overview

CACD Archive is a scraping and notification system for UK court hearing data. It has two core functions:

1. **Archiving** — Scrape, parse, and permanently store public court hearing data (daily cause lists, cases fixed for hearing) into a searchable historical database.
2. **Notifications** — Alert users via email when newly archived hearings match their saved search expressions.

All other functionality (multiple scrapers, additional sources/divisions, API, frontend) exists to support these two core functions. The client wants to expand source coverage throughout 2026.

The system pulls Criminal Division data from two sources — the Daily Cause List (`court-tribunal-hearings.service.gov.uk`) and the Future Hearing List (`gov.uk`) — on configurable cron schedules, stores it in MariaDB, and exposes it via a Fastify API with a Bootstrap frontend.

### Licensing & Compliance

All scraped data is UK Crown Copyright, published under the **Open Government Licence v3.0** (OGL). The OGL permits copying, publishing, distributing, adapting, and commercial exploitation provided:

1. **Attribution** — Acknowledge the source (HMCTS / HM Courts & Tribunals Service) and link to the OGL.
2. **No official endorsement** — Do not imply HMCTS endorses or is affiliated with this project.

The archival function (free access to public data) is straightforwardly covered. The notification service (paid alerting on top of freely available data) is the added value and should be permissible under OGL, but **the client should seek legal advice before commercialising**, particularly around any "except where otherwise stated" carve-outs on specific pages.

**Required action:** Ensure the site footer contains a clear OGL attribution statement, e.g.: "Contains public sector information licensed under the Open Government Licence v3.0" with a link to the licence and credit to HMCTS as the data publisher.

---

## Active TODO Items

- [x] Complete M1 codebase audit (security & performance)
- [x] Remaining M1 items: hardcoded SUMMARY_URL, composite index, ESLint 10, OGL footer
- [ ] CSP: remove `unsafe-inline` (LOW — deferred)
- [ ] Investigate non-standard case number formats in Criminal Division cause lists (e.g. `CVO0D6O7NY` — likely transferred cases from County Court/Family Court). Current behaviour is correct (warn + accept), but the client should review whether these need special handling or display. See M2 — will become more relevant when scraping multiple divisions. (LOW — defer to M2+)

---

## Milestones

### M1: Code Audit & Hardening

Audit the codebase for security and performance issues. Update dependencies.

- [x] npm security audit — fixed 5 vulnerabilities (ajv, bn.js, fastify, minimatch, brace-expansion)
- [x] Update semver-compatible packages (fastify 5.8.2, mysql2 3.19, dotenv 17.3, etc.)
- [x] Upgrade nodemailer 7.x → 8.x (only breaking change: error code `NoAuth` → `ENOAUTH`, not used)
- [x] Codebase security audit (input validation, auth flows, SQL injection surface, CSP review)
- [x] Codebase performance audit (query efficiency, connection pool sizing, scraper timing)
- [x] FIX (HIGH): Separate cookie secret from JWT secret; fail startup if `JWT_SECRET` missing
- [x] FIX (MEDIUM): Whitelist ORDER BY columns in hearings route to prevent SQL injection
- [x] FIX (HIGH): Replace sequential single-row INSERTs with bulk INSERT in sync-service
- [x] FIX (HIGH): Replace sequential DELETEs with bulk DELETE in sync-service
- [x] Add `./bin/cacd secret generate` CLI command for generating secrets
- [x] Clean up deprecated `ALERT_EMAIL` from `.env.example`
- [x] Fix `SUMMARY_URL` hardcoded in `link-discovery.js` — now uses `config.scraping.summaryPageUrl`, `BASE_URL` derived dynamically
- [x] Add composite index on `(division, list_date)` for dates endpoint — migration `008_add_composite_index_division_list_date.sql`
- [x] Review ESLint 10.x upgrade — BLOCKED: requires Node.js >=20.19, project targets >=18. Revisit when minimum Node version is raised.
- [x] OGL compliance: added Crown Copyright / OGL v3.0 attribution to `index.html` and `dashboard.html` footers
- [x] Swagger/OpenAPI audit: version sync, tag normalisation, missing tag, division enum, duplicate `/auth/me` removal
- [x] Centralise all `process.env` reads in route files into `config` module
- [x] Health endpoint returns app version
- [x] Move `/api/config` to `/api/v1/config` for consistency
- [x] Documentation: complete `docs/` suite (api, cli, architecture, developing, scraper-development, configuration)
- [ ] CSP: remove `unsafe-inline` from script-src and style-src (LOW — requires moving inline styles/scripts to files)
- [ ] CORS: configure allowed origins from `BASE_URL` in production; currently wide-open in dev and empty-list in production

### M2: Future Hearing List Integration

Add a second data source to the archiving pipeline. GOV.UK publishes "Court of Appeal cases fixed for hearing (Criminal Division)" at `gov.uk/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division/`. This is a forward-looking schedule listing hearings further into the future than the Daily Cause List (DCL), but subject to change. We call this the **Future Hearing List (FHL)**.

**Source terminology:**

- **Daily Cause List (DCL)** — the existing source at `court-tribunal-hearings.service.gov.uk`. Near-future hearings (today/tomorrow). Authoritative.
- **Future Hearing List (FHL)** — the new GOV.UK source. Longer-range schedule, volatile, lower precedence.

**FHL table columns:** Surname, Forenames, CAO Reference, Hearing Date, Court, Time, Reporting Restriction, Crown Court

**Data mapping (FHL → hearings table):**

| FHL Column            | Maps to                                 | Notes                             |
| --------------------- | --------------------------------------- | --------------------------------- |
| Surname + Forenames   | `case_details`                          | Concatenated into case details    |
| CAO Reference         | `case_number`                           | Same format as DCL case numbers   |
| Hearing Date + Time   | `list_date`, `time`, `hearing_datetime` | Parsed as per DCL                 |
| Court                 | `venue`                                 | Hearing venue                     |
| Crown Court           | `crown_court` (NEW)                     | Origin court — new VARCHAR column |
| Reporting Restriction | `reporting_restriction` (NEW)           | Free-text — new TEXT column       |

**Design decisions:**

- **One row per hearing** — the unique constraint `(list_date, case_number, time)` is unchanged. DCL records take precedence: FHL inserts skip any row that already exists from DCL (`INSERT IGNORE`).
- **Full-replace sync for FHL** — each successful FHL scrape deletes all existing FHL-sourced rows, then inserts fresh data. Avoids complex upsert logic given the volatile nature of the data.
- **Data source table** — a new `data_sources` table replaces hardcoded source identifiers. `hearings.data_source_id` (FK) replaces any source enum. Extensible for future sources.
- **Scoped sync operations** — all sync-service queries (comparison, insert, update, delete) are scoped by `data_source_id` to prevent cross-source interference. Critical: without this, DCL's delete phase would wipe FHL records for the same `list_date`.
- **Notifications from DCL only** — email alerts are only triggered by DCL scrapes. FHL's full-replace strategy would cause duplicate notifications on every scrape cycle otherwise.
- **Separate scrape interval** — FHL defaults to every 12 hours (configurable via `SCRAPE_INTERVAL_FHL_MINUTES` in `.env`). DCL retains its existing interval.

#### M2a: Schema & Data Model

- [x] Migration: create `data_sources` table (`id`, `slug` UNIQUE, `display_name`, `base_url`, `scrape_interval_minutes`, `scrape_window_start_hour`, `scrape_window_end_hour`, `enabled` BOOLEAN, `created_at`, `updated_at`) — migration `009_data_sources.sql`
- [x] Migration: seed `data_sources` with DCL and FHL rows
- [x] Migration: add `data_source_id` (FK) column to `hearings` table, backfill existing rows to DCL source ID
- [x] Migration: add `data_source_id` (FK) column to `scrape_history` table
- [x] Migration: add `crown_court` (VARCHAR 255) and `reporting_restriction` (TEXT) columns to `hearings` table
- [x] Add indexes on `data_source_id` and `(data_source_id, list_date DESC)` and `(data_source_id, status, started_at DESC)`

#### M2b: Config & Source-Aware Scheduling

- [x] Create `data-source-service.js` — cached lookups from `data_sources` table (replaces env-var-based config for per-source settings)
- [x] Refactor `scheduler.js` to iterate enabled data sources, each with its own interval and window from DB
- [x] `shouldScrape()` checks per-source last-scrape time (query `scrape_history` filtered by `data_source_id`)
- [x] `scrape-history-service.js` records `data_source_id` on each scrape

#### M2c: Refactor Sync Service

- [x] Scope all sync-service comparison queries by `data_source_id` — existing records fetched with `WHERE data_source_id = ?`
- [x] Scope delete phase by `data_source_id` — DCL deletes only remove DCL-sourced rows for a given `list_date`
- [x] Add new full-replace sync method for FHL: `DELETE WHERE data_source_id = ?` then bulk `INSERT IGNORE` (skips rows where DCL record already holds the unique key)
- [x] Bulk insert includes `data_source_id`, `crown_court`, `reporting_restriction` in all INSERT statements
- [x] Notifications gated to DCL only in `scraper-service.js`

#### M2c.1: Admin — Data Source Management UI

Add a "Data Sources" section to the existing `/admin` page, below User Management. Allows administrators to view source status, toggle enabled/disabled, and see the most recent scrape result per source.

- [x] API: `GET /api/v1/admin/data-sources` — list all sources with last scrape info (joined from `scrape_history`), requires `scraper:configure` capability
- [x] API: `PATCH /api/v1/admin/data-sources/:id` — update `enabled`, `scrape_interval_minutes`, `scrape_window_start_hour`, `scrape_window_end_hour`; requires `scraper:configure` capability; clears `data-source-service` cache
- [x] Frontend: add Data Sources section to `admin.html` — card per source showing: display name, enabled/disabled badge + toggle, last scrape time, last scrape status badge, interval, scrape window
- [x] Frontend: add data source JS to `admin.js` — fetch sources on page load, render cards, handle enable/disable toggle via PATCH

#### M2d: FHL Scraper

- [x] Implement `fhl-link-discovery.js` — scrape the FHL publication page, find the linked document URL
- [x] Implement `fhl-table-parser.js` — parse the FHL HTML table, map columns to hearing schema (Surname+Forenames → `case_details`, CAO Reference → `case_number`, Crown Court → `crown_court`, Reporting Restriction → `reporting_restriction`)
- [x] Refactor `scraper-service.js` — split into `scrapeDCL()` and `scrapeFHL()`, dispatched by source slug via `scrapeAll()`
- [x] FHL uses `fullReplaceSynchronize()` — delete all FHL records, `INSERT IGNORE` new ones (skips DCL conflicts)
- [x] Validate case number format from FHL matches expected regex (log warnings for unexpected formats, as per DCL behaviour)
- [x] Retry/error handling consistent with DCL scraper (exponential backoff, email alerts on failure)
- [x] Unit tests for FHL table parser (date parsing, row mapping, edge cases)
- [x] Scheduler and admin route updated to allow FHL scraping

#### M2e: Notification Scoping & API Updates

- [x] Gate notification-service to only trigger on DCL scrapes (check `data_source_id` before sending alerts)
- [x] Update hearings API routes to accept optional `data_source` filter param (comma-separated IDs, `none` sentinel)
- [x] Update API responses to include source metadata (`dataSourceName`, `crownCourt`)
- [x] Update frontend to display source indicator on hearing records (provenance badges: DCL/FHL)
- [x] Update frontend with source filter pills (toggle per source, `show_by_default` driven)
- [x] Swagger/OpenAPI docs auto-updated via Fastify response schema additions

#### M2 — Potential Enhancements (deferred)

- [ ] FHL diff-before-replace: compare incoming FHL data against existing FHL records before the full replace, to identify genuinely new future hearings. This would allow FHL-specific notifications without the duplicate alert problem. Deferred because it adds complexity and depends on the FHL data being consistent enough to diff reliably.
- [x] Admin UI for managing data sources (enable/disable, adjust intervals, show by default) — implemented in M2c.1

### M2.1: FHL JSON API Migration

Replace HTML scraping in `fhl-link-discovery.js` with the GOV.UK Content API (`/api/content/...`). The JSON API returns structured attachment metadata and the full document body, eliminating fragile text-matching heuristics on rendered HTML.

**API endpoint:** `https://www.gov.uk/api/content/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division`

**Key fields:**

- `details.attachments[0].url` — path to the FHL document (replaces Cheerio link search)
- `public_updated_at` — last-modified timestamp (enables freshness checks without fetching the document)
- Fetching the attachment URL via the same API returns `details.body` containing the full HTML table directly

**Tasks:**

- [x] Refactor `fhl-link-discovery.js` to fetch the JSON API instead of the HTML publication page
- [x] Extract attachment URL from `details.attachments[0].url` instead of Cheerio text matching
- [x] Use `public_updated_at` for freshness check — skip scrape if unchanged since last run
- [x] Pass `details.body` from the attachment API response directly to `fhl-table-parser.js` (no second HTML page fetch needed)
- [x] Update error handling and alerting for JSON API failure modes (schema changes, missing fields)
- [x] Update unit tests for new discovery logic
- [x] Remove Cheerio dependency from `fhl-link-discovery.js`

### M2.2: Request Analytics & GeoIP Blocklist

Lightweight request logging for API traffic analysis, vulnerability probe detection, and country-level IP blocking, plus a server-side pseudo-session fingerprint for visitor metrics. All functionality gated behind `ANALYTICS_ENABLED=true` in `.env` (disabled by default). Logs API route requests only — static assets, health checks, and Swagger docs are excluded.

**Nothing is stored in the browser** — no cookies, no localStorage, no client-side script. All measurement happens server-side in a Fastify hook.

**Design decisions:**

- **Batched inserts** — requests buffered in memory (flush every 5 seconds or every 100 records, whichever comes first) to avoid per-request DB writes becoming a bottleneck during bot floods
- **GeoIP via MaxMind `.mmdb` files** — up-to-date GeoLite2 data at `/var/lib/GeoIP/` (`GeoLite2-Country.mmdb`, `GeoLite2-ASN.mmdb`). Use the `maxmind` npm package for in-memory lookups. Country and ASN resolved at log time and stored with each record. Configurable via `GEOIP_COUNTRY_DB_PATH` and `GEOIP_ASN_DB_PATH`
- **ASN over city** — ASN separates datacentre/VPN/crawler traffic from real visitors, which is the main signal worth having on a public archive. City is deliberately **not** captured: it is the most identifying geo field and adds little for a UK-focused site
- **No query parameters, ever** — only the route _pattern_ is stored. The `/api/v1/hearings` querystring carries `search` and `caseNumber`; recording those against an IP would log that a given person looked up a given name in criminal court records. Method + route answers the traffic questions without that exposure
- **Salted, daily-rotating fingerprint** — `sha256(daily_salt + ip + user_agent)` for pseudo-session grouping. The salt is a server-side secret (`ANALYTICS_FINGERPRINT_SECRET`) combined with the current date; an unsalted hash of IP+UA is trivially reversible (IPv4 is 2³², the realistic UA set is small), so the salt is what makes this pseudonymous rather than decorative. Daily rotation caps linkability at 24h, which is the intended session granularity
- **Country blocklist** — `BLOCKED_COUNTRIES` env var (comma-separated ISO 3166-1 alpha-2 codes, e.g. `RU,BY,IR,IQ,CN`). Blocked requests receive `403 Forbidden` before reaching route handlers. Runs as an early Fastify hook, after GeoIP resolution but before auth/rate-limiting
- **Purge via cron** — scheduled job (respects PM2 instance 0 pattern) deletes records older than `ANALYTICS_RETENTION_DAYS` (default: 30). Runs daily. Flat retention: every column, raw IP included, is deleted at the same 30-day boundary
- **Dedicated analytics page** — `/analytics` route, restricted to administrator role. Separate from the existing admin page to keep concerns clean; all charts and tables live here, with nothing added to `/admin`
- **Lawful basis is legitimate interests, not consent** — no cookie banner is required (PECR governs storage on the device, and we store nothing there), but UK GDPR still applies because IP addresses are personal data and a salted fingerprint is pseudonymised, not anonymised. This requires a documented LIA, a published privacy notice, and an honoured right to object — see M2.2e

**Captured fields per request:**

| Field          | Source                          | Notes                                                                               |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `ip`           | `request.ip`                    | Requires the `trustProxy` fix below, or this is client-spoofable                    |
| `method`       | `request.method`                | GET, POST, PATCH, DELETE                                                            |
| `route`        | `request.routeOptions.url`      | Route pattern, not raw URL (e.g. `/api/v1/hearings/:id` not `/api/v1/hearings/42`)  |
| `status_code`  | `reply.statusCode`              | Captured in onResponse hook                                                         |
| `duration_ms`  | `reply.elapsedTime`             | Fastify's built-in request timer                                                    |
| `user_agent`   | `request.headers['user-agent']` | Truncated to 500 chars                                                              |
| `country_code` | GeoIP lookup                    | 2-letter ISO code or NULL if lookup fails                                           |
| `asn`          | GeoIP ASN lookup                | Integer AS number, NULL if lookup fails                                             |
| `asn_org`      | GeoIP ASN lookup                | Organisation name, truncated to 255 chars                                           |
| `fingerprint`  | Derived                         | `sha256(daily_salt + ip + user_agent)`, 64 chars. Pseudo-session key; rotates daily |
| `user_id`      | `request.user?.id`              | NULL for unauthenticated requests                                                   |
| `created_at`   | `NOW()`                         | Insertion timestamp                                                                 |

**Explicitly not captured:** query parameters (see design decisions), city, region, referrer, and anything client-side.

#### M2.2 — Prerequisite: trust the proxy correctly

**Done in v1.18.3, ahead of the rest of M2.2** — it was a security fix in its own right.

`src/api/server.js` set `trustProxy: true`, which trusted the **entire** `X-Forwarded-For` chain, while both Apache `mod_proxy` and nginx `proxy_add_x_forwarded_for` append the real peer to whatever the client sent. A client could therefore send `X-Forwarded-For: 1.2.3.4` and have it become `request.ip` — which also meant per-IP rate limiting could be evaded by rotating the header. Once M2.2 lands the same flaw would poison every analytics row and let anyone bypass the country blocklist.

- [x] `TRUSTED_PROXIES` env var (default `loopback`) replaces the hardcoded `trustProxy: true`
- [x] Integration tests asserting a client-supplied `X-Forwarded-For` does **not** override `request.ip`
- [x] Apache and nginx reverse-proxy guidance in `docs/security.md`

**Note for M2.2:** a hop count (`trustProxy: 1`) is _not_ a valid alternative. Fastify 5 fails closed on numeric values — `getTrustProxyFn` returns `() => false` — so `request.ip` silently resolves to the proxy's own address. Config rejects numeric `TRUSTED_PROXIES` at startup for this reason. Trust must be expressed as addresses, CIDR ranges, or a named preset.

#### M2.2a: Schema, Config & Request Logging Middleware — done in v1.19.0

- [x] Migration: create `request_log` table with fields above, indexed on `(created_at)`, `(ip, created_at)`, `(country_code, created_at)`, `(route, created_at)`, `(fingerprint, created_at)`, `(asn, created_at)`
- [x] Config: add `ANALYTICS_ENABLED` (boolean, default false), `ANALYTICS_RETENTION_DAYS` (integer, default 30), `ANALYTICS_EXCLUDE_ROUTES` (comma-separated patterns to skip, default `/api/v1/health,/api/docs`), `ANALYTICS_FINGERPRINT_SECRET` (string, required when analytics enabled — fail loud at startup if missing)
- [x] Implement `analytics-service.js` — in-memory buffer with `logRequest(data)`, periodic flush via `setInterval`, graceful flush on shutdown
- [x] Fingerprint helper — `sha256(<secret> + <YYYY-MM-DD> + ip + user_agent)`. Salt derived per-request from the current date so rotation needs no scheduled job; note that a request spanning midnight simply lands in the next day's bucket
- [x] Fastify `onResponse` hook in `server.js` — captures all fields, skips excluded routes and static assets, calls `analytics-service.logRequest()`. Only registered when `ANALYTICS_ENABLED=true`
- [x] Confirm buffered writes never block or fail a request — a DB outage must lose analytics rows, not return 500s
- [x] Unit tests for buffer flush logic, route exclusion filtering, and fingerprint stability within a day / change across a date boundary

#### M2.2b: GeoIP Lookup, ASN & Country Blocklist — done in v1.19.0

- [x] Config: add `GEOIP_COUNTRY_DB_PATH` (default `/var/lib/GeoIP/GeoLite2-Country.mmdb`), `GEOIP_ASN_DB_PATH` (default `/var/lib/GeoIP/GeoLite2-ASN.mmdb`), `BLOCKED_COUNTRIES` (comma-separated country codes, default empty)
- [x] Implement `geoip-service.js` — loads both MaxMind DBs on startup, exposes `lookupCountry(ip)` and `lookupAsn(ip)`. Handles missing/corrupt DB gracefully (log warning, continue without GeoIP); each DB degrades independently
- [x] Add `maxmind` to dependencies (**not** `@maxmind/geoip2-node`, which is ESM-only from v4 — see Technical Debt)
- [x] Fastify `onRequest` hook — if `BLOCKED_COUNTRIES` is non-empty, resolve country from IP and return `403` for blocked countries. Runs early, before auth. Log blocked requests to analytics if enabled
- [x] Feed country code, ASN and ASN org into analytics logging from M2.2a
- [x] Note the `.mmdb` files are refreshed externally (they are root-owned in `/var/lib/GeoIP/`); document the reload story — simplest is that a restart picks up new data
- [x] Unit tests for blocklist matching, private/localhost IP handling, missing DB fallback

#### M2.2c: Purge Cron Job — done in v1.19.0

- [x] Add purge function to `analytics-service.js` — `DELETE FROM request_log WHERE created_at < NOW() - INTERVAL ? DAY`
- [x] Register daily cron in `scheduler.js` (instance 0 only) — runs at a quiet hour (e.g. 03:00), respects `ANALYTICS_RETENTION_DAYS` (30). The purge is what enforces the retention promise made in the privacy notice, so it must be verified working before analytics is enabled in production
- [x] CLI command `./bin/cacd db purge-analytics` for manual purge with optional `--days <n>` override
- [x] Log purge results (rows deleted, duration)

#### M2.2d: Analytics Admin Page

- [ ] API: `GET /api/v1/admin/analytics/summary` — returns aggregated stats for a date range: total requests, unique visitors (distinct `fingerprint`), unique IPs, requests by country, top routes, top ASNs, top IPs, status code distribution, blocked request count. Requires `system:analytics` capability
- [ ] API: `GET /api/v1/admin/analytics/requests` — paginated raw request log with filters (date range, IP, country, ASN, route, status code, fingerprint). Requires `system:analytics` capability
- [ ] Migration: add `system:analytics` capability, assign to administrator role
- [ ] Frontend: `/analytics` page (administrator only) with:
  - Summary cards: total requests, unique visitors, unique IPs, blocked requests (today / 7-day / 30-day)
  - Requests by day bar chart — hand-rolled inline SVG, no charting dependency (bar and line charts over a single series are little work; Chart.js is ~200KB and would be the largest frontend dependency in the project)
  - Top 10 IPs table with request count, country, ASN, last seen
  - Top routes table with request count and average duration
  - Country breakdown table
  - ASN breakdown table — the practical bot/VPN/datacentre split
  - Status code distribution (2xx/3xx/4xx/5xx)
  - Pseudo-session view: requests grouped by `fingerprint` for a chosen day, showing page sequence and duration
  - Filter controls: date range picker, IP search, country filter, ASN filter, route filter
- [ ] Navigation: add Analytics link for administrators (after Admin). `/admin` itself is left untouched
- [ ] Swagger/OpenAPI docs for new endpoints

#### M2.2e: Privacy Policy & Legitimate Interests Assessment

No consent banner is required — PECR/ePrivacy governs storage on the user's device and we store nothing there. UK GDPR still applies, because IP addresses are personal data (_Breyer_, C-582/14; ICO guidance follows it) and a salted fingerprint is pseudonymised, not anonymised (Recital 26). Legitimate interests (Art 6(1)(f)) is the lawful basis, which carries its own obligations.

- [ ] Frontend: `/privacy` page — public, no auth. Must state: controller identity and contact, what is collected (the field table above), the lawful basis and the interest pursued, the 30-day retention period, that no cookies or browser storage are used, data subject rights including the right to object (Art 21), and how to exercise them
- [ ] Frontend: Privacy Policy link in the site footer on all pages (footer markup already exists in each `public/*.html`, currently carrying the OGL attribution)
- [ ] `docs/legitimate-interests-assessment.md` — the LIA itself: purpose test (why the analytics are needed), necessity test (why less data would not do — this is where "no query params, no city, ASN not raw geolocation" is the argument), and balancing test against visitor expectations. Being a court-records archive raises the bar; record that reasoning
- [ ] Decide and document the objection route — with only an IP and a rotating hash there is no way to identify a person to erase, so the notice should explain what a requester needs to supply (address plus timeframe) and that data self-deletes at 30 days
- [ ] Confirm the analytics hook honours a `DNT: 1` request header by skipping the log (cheap to implement, easy to point at in the LIA)

#### M2.2 — Potential Enhancements (deferred)

- [ ] Fail2ban integration: write blocked/suspicious requests to a structured log file that fail2ban can parse (e.g. `/var/log/cacd-archive/blocked.log` with `ip`, `timestamp`, `reason`)
- [ ] Rate limit event logging: capture rate-limiter trips as distinct events in `request_log` (status 429) for correlation with IP/country data
- [ ] Automated alerting: email admin when probe patterns detected (e.g. >N 404s from a single IP in M minutes)
- [ ] Real-time dashboard: WebSocket push for live request stream on the analytics page

### M3: Multi-Division Support (Existing Source)

Expand the archiving pipeline to capture more divisions from the existing DCL source at `court-tribunal-hearings.service.gov.uk`. The summary page already lists daily cause lists for 9 divisions beyond Criminal.

**Available divisions on the existing source:**

1. Court of Appeal (Civil Division)
2. County Court at Central London Civil
3. Family Court
4. Family Division of the High Court
5. King's Bench Division
6. King's Bench Masters
7. London Administrative Court
8. Mayor & City Civil
9. Senior Courts Costs Office

**Key tasks:**

- [ ] Research: confirm table structure is consistent across divisions (same `govuk-table` class, same column patterns)
- [ ] Config: make target divisions configurable (env var or DB-driven)
- [ ] Update `link-discovery.js` to discover links for multiple divisions per scrape
- [ ] Update `scraper-service.js` to iterate over configured divisions
- [ ] Update `table-parser.js` if column headers vary by division
- [ ] Update frontend filters and API query params for division filtering
- [ ] Update saved search notifications to respect division

### M4+ (Future — not yet scoped)

- Additional GOV.UK sources from the courts/sentencing/tribunals topic page
- Historical data backfill
- API v2 considerations as data model expands
- FHL-specific notifications via diff-before-replace (see M2 deferred enhancements)
- Fail2ban integration for automated IP blocking (see M2.2 deferred enhancements)

---

## Technical Debt

- `boxen`, `chalk`, `inquirer`, `ora` pinned to old CJS-compatible majors (newer versions are ESM-only; upgrade blocked until project migrates to ESM)
- ESLint 10.x upgrade **no longer blocked** — the Node baseline moved to >=22 in v1.18.0, which satisfies ESLint 10's `^20.19 || ^22.13 || >=24`. Deferred by choice (no advisory against 9.x) along with `@fastify/rate-limit` 11 and `commander` 15; `commander` 15 needs Node >=22.12, so check the runtime before taking it
- Test suite created but coverage is minimal — expand unit and integration tests
- CSP allows `unsafe-inline` for scripts and styles — would need to extract inline styles/scripts to external files
- **ESM migration** — the project is CJS throughout. Migration is a big-bang change (every `require`/`module.exports`, `__dirname`/`__filename` replacements, `package.json` `"type": "module"`, Jest config rework). Not worth doing proactively — trigger points would be: a critical dependency dropping CJS support, or bumping minimum Node.js to 22+ where ESM is the clear default. **The second trigger was reached in v1.18.0** (Node >=22), but there is still no forcing dependency, so this stays deferred rather than becoming urgent — revisit if a package we actually need goes ESM-only. Until then, pin CJS-compatible versions of affected packages
- **M2.2b GeoIP package selection** — use the `maxmind` npm package (CJS-compatible, reads `.mmdb` files directly) rather than `@maxmind/geoip2-node` which is ESM-only from v4+. Same CJS constraint as boxen/chalk/etc.

---

## Notes for Development

- **CJS only:** The project uses CommonJS throughout. Several dependencies (boxen, chalk, inquirer, ora) are pinned to CJS-compatible versions. An ESM migration would unblock those but is a significant undertaking. When adding new dependencies, always check CJS compatibility first — several popular packages (chalk 5+, boxen 6+, ora 6+, inquirer 9+, `@maxmind/geoip2-node` 4+) are ESM-only.
- **PM2 clustering:** Only instance 0 runs migrations, email init, and the scraper scheduler. Any new scheduled work must respect `config.appInstance === 0`.
- **Scraper architecture:** The current pipeline is `scheduler → scraper-service → link-discovery → table-parser → sync-service`. M2 makes this source-aware via `data_sources` table and per-source scheduling. Each source has its own link-discovery and table-parser implementation, but shares sync-service (scoped by `data_source_id`).
- **Two distinct source types:** The Daily Cause List (DCL, `court-tribunal-hearings.service.gov.uk`) publishes near-future hearings that change daily. The Future Hearing List (FHL, `gov.uk`) publishes a longer-range schedule that updates less frequently and is volatile. DCL takes precedence. FHL uses full-replace sync; DCL uses incremental sync. Only DCL triggers email notifications.
- **FHL uses GOV.UK Content API:** As of v1.12.0, FHL link discovery uses the JSON Content API (`/api/content/...`) rather than HTML scraping. The API returns `public_updated_at` for freshness checks and `details.body` containing the table HTML directly. MariaDB `DATETIME` columns require MySQL format (`YYYY-MM-DD HH:MM:SS`), not ISO 8601 — always convert timestamps from external APIs before inserting.

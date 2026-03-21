# Project Tracker

**Version:** 1.13.0
**Last Updated:** 2026-03-21
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

---

## Technical Debt

- `boxen`, `chalk`, `inquirer`, `ora` pinned to old CJS-compatible majors (newer versions are ESM-only; upgrade blocked until project migrates to ESM)
- ESLint 10.x upgrade blocked by Node.js >=18 engine requirement (ESLint 10 needs >=20.19)
- Test suite created but coverage is minimal — expand unit and integration tests
- CSP allows `unsafe-inline` for scripts and styles — would need to extract inline styles/scripts to external files

---

## Notes for Development

- **CJS only:** The project uses CommonJS throughout. Several dependencies (boxen, chalk, inquirer, ora) are pinned to CJS-compatible versions. An ESM migration would unblock those but is a significant undertaking.
- **PM2 clustering:** Only instance 0 runs migrations, email init, and the scraper scheduler. Any new scheduled work must respect `config.appInstance === 0`.
- **Scraper architecture:** The current pipeline is `scheduler → scraper-service → link-discovery → table-parser → sync-service`. M2 makes this source-aware via `data_sources` table and per-source scheduling. Each source has its own link-discovery and table-parser implementation, but shares sync-service (scoped by `data_source_id`).
- **Two distinct source types:** The Daily Cause List (DCL, `court-tribunal-hearings.service.gov.uk`) publishes near-future hearings that change daily. The Future Hearing List (FHL, `gov.uk`) publishes a longer-range schedule that updates less frequently and is volatile. DCL takes precedence. FHL uses full-replace sync; DCL uses incremental sync. Only DCL triggers email notifications.

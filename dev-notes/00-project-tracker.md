# Project Tracker

**Version:** 1.10.0
**Last Updated:** 2026-03-07
**Current Phase:** M1 complete (v1.10.0) — next: M2 (Multi-Division Support)

---

## Overview

CACD Archive is a scraping and notification system for UK court hearing data. It has two core functions:

1. **Archiving** — Scrape, parse, and permanently store public court hearing data (daily cause lists, cases fixed for hearing) into a searchable historical database.
2. **Notifications** — Alert users via email when newly archived hearings match their saved search expressions.

All other functionality (multiple scrapers, additional sources/divisions, API, frontend) exists to support these two core functions. The client wants to expand source coverage throughout 2026.

Currently the system pulls Criminal Division data from a single source (`court-tribunal-hearings.service.gov.uk`) on a cron schedule, stores it in MariaDB, and exposes it via a Fastify API with a Bootstrap frontend.

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

### M2: Multi-Division Support (Existing Source)

Expand the archiving pipeline to capture more divisions, feeding more data into both core functions (archive + notifications). The current source at `court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109` already lists daily cause lists for 9 divisions — we only scrape Criminal.

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

- [ ] Schema: add `source_url` (VARCHAR) and `source_scraped_at` (DATETIME) columns to hearings table — record where and when each record was found, for provenance/attribution display
- [ ] Research: confirm table structure is consistent across divisions (same `govuk-table` class, same column patterns)
- [ ] Schema: add `division` or `source_division` to hearings table if not already present
- [ ] Config: make target divisions configurable (env var or DB-driven)
- [ ] Update `link-discovery.js` to discover links for multiple divisions per scrape
- [ ] Update `scraper-service.js` to iterate over configured divisions
- [ ] Update `table-parser.js` if column headers vary by division
- [ ] Update frontend filters and API query params for division filtering
- [ ] Update saved search notifications to respect division

### M3: GOV.UK Source Integration

Add a second data source to the archiving pipeline. GOV.UK publishes a "Cases Fixed for Hearing" page for Criminal Division at `gov.uk/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division/`. This is a forward-looking schedule (not a daily cause list) with a different structure, providing richer data (named individuals, Crown Court of origin, reporting restrictions) that enhances both the archive and notification value.

**GOV.UK table columns:** Surname, Forenames, CAO Reference, Hearing Date, Court, Time, Reporting Restriction, Crown Court

**This differs from the existing source:** different domain, different HTML structure, different data shape (named individuals vs case-level records), and different update cadence.

**Key tasks:**

- [ ] Research: compare GOV.UK data fields to existing schema — determine what maps, what's new
- [ ] Research: check the parent page (`gov.uk/crime-justice-and-law/courts-sentencing-tribunals`) for additional scrapeable sources (Court of Protection lists, civil restraint orders, etc.)
- [ ] Design: source abstraction — each source needs its own discovery + parsing workflow
- [ ] Schema: extend or create tables for GOV.UK-sourced data (may need separate table or unified schema with source tracking)
- [ ] Implement GOV.UK scraper (new link discovery pattern, new table parser)
- [ ] Deduplicate or cross-reference records that appear in both sources
- [ ] Update API and frontend to surface source metadata

### M4+ (Future — not yet scoped)

- Additional GOV.UK sources from the courts/sentencing/tribunals topic page
- Historical data backfill
- API v2 considerations as data model expands

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
- **Scraper architecture:** The current pipeline is `scheduler → scraper-service → link-discovery → table-parser → sync-service`. M2/M3 will likely need to make this pipeline division-aware and source-aware.
- **Two distinct source types:** Source 1 (court-tribunal-hearings) publishes daily cause lists that change day-to-day. Source 2 (GOV.UK) publishes a forward-looking schedule that updates less frequently. These have different scraping cadences and dedup strategies.

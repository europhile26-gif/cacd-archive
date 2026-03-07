# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CACD Archive is a Node.js application that scrapes, parses, and archives UK Court of Appeal (Criminal Division) daily cause lists. It provides a REST API, web frontend, and CLI tools for searching and managing hearing data.

## Common Commands

- `npm run dev` — Start dev server with nodemon (port 3000)
- `npm run start` — Start production server
- `npm run build` — Build frontend assets with esbuild
- `npm test` — Run Jest test suite
- `npm test -- --testPathPattern=<pattern>` — Run a single test file
- `npm run lint` — ESLint check
- `npm run lint:fix` — ESLint auto-fix
- `npm run format:check` — Prettier check
- `npm run format` — Prettier auto-fix
- `npm run migrate` — Run database migrations
- `npm run scrape` — Trigger a manual scrape
- `./bin/cacd users create` — Create user (interactive CLI)
- `node src/cli/test-email.js` — Test email configuration

## Tech Stack

- **Runtime:** Node.js 18+ (native JS, CommonJS modules — no TypeScript, no framework abstractions)
- **API:** Fastify 5
- **Database:** MariaDB 10.5+ via `mysql2/promise` (raw SQL, no ORM)
- **Scraping:** Cheerio (HTML parsing), node-cron (scheduling)
- **Auth:** jsonwebtoken + bcrypt, JWT in HTTP-only cookies
- **Email:** Nodemailer + Handlebars templates
- **Frontend:** Vanilla JS + Bootstrap 5 (no React/Vue/etc.)
- **Build:** esbuild (frontend assets only)
- **CLI:** Commander + Inquirer
- **Process manager:** PM2 (production)

## Architecture

### Entrypoint & Startup

`src/index.js` orchestrates startup: security checks → config loading → DB migrations → email service init → Fastify server → scraper scheduler. Only PM2 instance 0 runs migrations, email init, and the scheduler (checked via `NODE_APP_INSTANCE`).

### Key Layers

- **API** (`src/api/`) — Route plugins under `src/api/routes/`. Auth middleware in `src/api/middleware/auth.js`. Rate limiting skips authenticated users. Routes prefixed under `/api/v1/`.
- **Services** (`src/services/`) — Business logic: `scraper-service.js` (orchestrates scraping), `auth-service.js` (authentication), `email-service.js` (notifications), `notification-service.js` (saved search alerts), `sync-service.js` (data persistence), `permission-service.js` (RBAC).
- **Scrapers** (`src/scrapers/`) — `link-discovery.js` finds cause list URLs from the summary page, `table-parser.js` extracts hearing data from HTML, `scheduler.js` manages cron-based periodic scraping.
- **Models** (`src/models/`) — Domain objects: `User.js`, `Role.js`, `Capability.js`, `AccountStatus.js`, `SavedSearch.js`.
- **Database** (`src/config/database.js`) — Connection pool. Migrations are sequential SQL files in `src/db/migrations/` tracked in a `schema_migrations` table.
- **Config** (`src/config/config.js`) — Loads `.env` via dotenv. All config centralized here.
- **Frontend** (`public/`) — Static files served by Fastify. Production uses `dist/` built by `scripts/build.js`. Frontend routes served via `src/api/routes/frontend.js`.
- **CLI** (`bin/cacd`, `src/cli/`) — User management, DB migration, and scraping commands.
- **Templates** (`src/templates/`) — Handlebars email templates.

### Database

The `query()` helper in `src/config/database.js` is the main interface for raw SQL queries. Migrations are numbered SQL files (`001_initial_schema.sql`, etc.).

### Auth & Security

JWT access + refresh tokens stored in HTTP-only cookies. RBAC via roles and capabilities. `.env` file permission check on startup (`src/utils/startup-security.js`) — requires `0600` on Unix. Bypass with `SKIP_STARTUP_FILESYSTEM_CHECK=true`.

## Code Style

- CommonJS (`require`/`module.exports`), not ES modules
- 2-space indent, single quotes, semicolons, no trailing commas
- Unix line endings (LF)
- Unused function args prefixed with `_` (eslint `argsIgnorePattern: '^_'`)
- Prettier with 100 char print width

## Testing

Jest 30 with real MariaDB test database (requires `.env.test`; DB name must contain "test"). Unit tests in `test/unit/`, integration tests in `test/integration/`, HTML fixtures in `test/fixtures/`. Run `npm test` or `npx jest test/unit/config.test.js` for a single file.

## Requirements

- Node.js 18+
- MariaDB 10.5+
- `.env` file configured from `.env.example` (must be `chmod 600` on Linux)

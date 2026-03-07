# Architecture

## Overview

CACD Archive is a Node.js application that scrapes UK court hearing data and serves it through a web interface and REST API. It runs as a single process that combines an HTTP server with a background scraper on a cron schedule.

## Component Diagram

```
┌──────────────────────────────────────────────────────┐
│  src/index.js  (entry point)                         │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐                  │
│  │  Fastify     │   │  Scheduler   │                  │
│  │  HTTP Server │   │  (node-cron) │                  │
│  └──────┬──────┘   └──────┬───────┘                  │
│         │                  │                          │
│  ┌──────┴──────┐   ┌──────┴───────────────────────┐  │
│  │  API Routes  │   │  Scraper Pipeline            │  │
│  │  /hearings   │   │                              │  │
│  │  /dates      │   │  link-discovery              │  │
│  │  /auth       │   │    → table-parser            │  │
│  │  /users      │   │      → sync-service          │  │
│  │  /saved-     │   │        → notification-service│  │
│  │   searches   │   │                              │  │
│  │  /admin      │   └──────────────────────────────┘  │
│  └──────┬──────┘                                     │
│         │                                            │
│  ┌──────┴──────┐                                     │
│  │  MariaDB     │                                    │
│  │  (mysql2)    │                                    │
│  └─────────────┘                                     │
└──────────────────────────────────────────────────────┘
```

## Scraper Pipeline

The scraper runs on a configurable cron schedule (default: every 2 hours during 08:00-18:00).

1. **Scheduler** (`src/scrapers/scheduler.js`) — triggers scrapes via node-cron within the configured window
2. **Scraper Service** (`src/services/scraper-service.js`) — orchestrates a full scrape run
3. **Link Discovery** (`src/scrapers/link-discovery.js`) — fetches the court tribunal summary page and extracts links to individual daily cause list pages
4. **Table Parser** (`src/scrapers/table-parser.js`) — parses HTML tables from each cause list page into structured records using Cheerio
5. **Sync Service** (`src/services/sync-service.js`) — compares scraped records against existing database rows for each date, then inserts/updates/deletes as needed (full-replacement sync per date)
6. **Notification Service** (`src/services/notification-service.js`) — after sync, checks new records against users' saved searches and sends email alerts

## Database

- MariaDB with raw SQL via `mysql2/promise` (no ORM)
- Connection pool managed in `src/config/database.js`
- Schema migrations in `src/db/migrations/` (numbered SQL files), run by `src/db/migrator.js`
- Key tables: `hearings`, `users`, `saved_searches`, `scrape_history`, `migrations`

## Authentication & Authorization

- JWT access tokens (short-lived) + refresh tokens (long-lived)
- Tokens sent as HTTP-only cookies (set automatically on login)
- Role-based access: `administrator` and `user` roles with capability checks
- Models: `Role`, `Capability`, `AccountStatus` in `src/models/`
- Auth middleware in `src/api/middleware/auth.js`
- Authenticated users bypass API rate limiting

## Frontend

- Static HTML served by Fastify (`@fastify/static`)
- Bootstrap 5 for styling
- Vanilla JavaScript (no framework)
- Pages: `public/index.html` (search/browse), `public/dashboard.html` (authenticated user dashboard)
- Production build via esbuild (`npm run build`)

## PM2 Clustering

In production, the app runs under PM2 with multiple instances. Only instance 0 runs:

- Database migrations on startup
- The scraper scheduler
- Email notification processing

This prevents duplicate scrapes and migration races. See [PM2 Deployment Guide](pm2-deployment.md).

## Data Licensing

All hearing data is UK Crown Copyright, used under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

# Configuration Reference

All configuration is via environment variables in `.env`. See `.env.example` for the full list with defaults.

## Required Variables

| Variable      | Description                                                               |
| ------------- | ------------------------------------------------------------------------- |
| `DB_USER`     | MariaDB username                                                          |
| `DB_PASSWORD` | MariaDB password                                                          |
| `JWT_SECRET`  | Secret for signing JWT tokens. Generate with `./bin/cacd secret generate` |

## Application

| Variable    | Default       | Description                                                                                                                    |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development` or `production`                                                                                                  |
| `PORT`      | `3000`        | HTTP server port                                                                                                               |
| `BASE_URL`  | —             | Public-facing URL when behind a reverse proxy (e.g. `https://cacd-archive.example.com`). Used in startup logs and email links. |
| `LOG_LEVEL` | `info`        | Logging level                                                                                                                  |

## Database

| Variable              | Default        | Description          |
| --------------------- | -------------- | -------------------- |
| `DB_HOST`             | `localhost`    | MariaDB host         |
| `DB_PORT`             | `3306`         | MariaDB port         |
| `DB_NAME`             | `cacd_archive` | Database name        |
| `DB_CONNECTION_LIMIT` | `10`           | Connection pool size |

## Authentication

| Variable                    | Default                    | Description                         |
| --------------------------- | -------------------------- | ----------------------------------- |
| `JWT_SECRET`                | _(required)_               | JWT signing secret                  |
| `COOKIE_SECRET`             | Falls back to `JWT_SECRET` | Separate cookie signing secret      |
| `JWT_ACCESS_EXPIRY`         | `15m`                      | Access token expiry                 |
| `JWT_REFRESH_EXPIRY`        | `7d`                       | Refresh token expiry                |
| `PASSWORD_MIN_LENGTH`       | `12`                       | Minimum password length             |
| `ALLOW_PUBLIC_REGISTRATION` | `true`                     | Allow self-registration             |
| `REQUIRE_ADMIN_APPROVAL`    | `true`                     | New accounts require admin approval |

## Scraping

| Variable                   | Default                     | Description                       |
| -------------------------- | --------------------------- | --------------------------------- |
| `SCRAPE_INTERVAL_MINUTES`  | `120`                       | Minutes between scrapes           |
| `SCRAPE_WINDOW_ENABLED`    | `true`                      | Only scrape during window hours   |
| `SCRAPE_WINDOW_START_HOUR` | `8`                         | Scraping window start (24h)       |
| `SCRAPE_WINDOW_END_HOUR`   | `18`                        | Scraping window end (24h)         |
| `SCRAPE_ON_STARTUP`        | `false`                     | Run a scrape on application start |
| `SUMMARY_PAGE_URL`         | Court tribunal hearings URL | Source URL for link discovery     |

## Email

| Variable                      | Default                             | Description                    |
| ----------------------------- | ----------------------------------- | ------------------------------ |
| `EMAIL_NOTIFICATIONS_ENABLED` | `false`                             | Enable email features          |
| `EMAIL_RECIPIENT_DATA_ERRORS` | —                                   | Email for scraper error alerts |
| `SMTP_HOST`                   | —                                   | SMTP server hostname           |
| `SMTP_PORT`                   | `587`                               | SMTP port                      |
| `SMTP_SECURE`                 | `false`                             | Use TLS                        |
| `SMTP_USER`                   | —                                   | SMTP username                  |
| `SMTP_PASSWORD`               | —                                   | SMTP password                  |
| `EMAIL_FROM`                  | `CACD Archive <alerts@example.com>` | From address                   |

## Security

| Variable                        | Default    | Description                                          |
| ------------------------------- | ---------- | ---------------------------------------------------- |
| `SKIP_STARTUP_FILESYSTEM_CHECK` | `false`    | Skip `.env` permission check (useful on Windows)     |
| `API_RATE_LIMIT_MAX`            | `100`      | Max requests per rate limit window (unauthenticated) |
| `API_RATE_LIMIT_WINDOW`         | `900000`   | Rate limit window in ms (15 min)                     |
| `TRUSTED_PROXIES`               | `loopback` | Reverse proxies allowed to set `X-Forwarded-For`     |

## Request Analytics

Server-side request logging. Nothing is stored in the browser — no cookies, no
localStorage, no client-side script. Disabled by default.

| Variable                       | Default                    | Description                                      |
| ------------------------------ | -------------------------- | ------------------------------------------------ |
| `ANALYTICS_ENABLED`            | `false`                    | Master switch for request logging                |
| `ANALYTICS_RETENTION_DAYS`     | `30`                       | Days to keep records; enforced by the purge cron |
| `ANALYTICS_EXCLUDE_ROUTES`     | `/api/v1/health,/api/docs` | Route prefixes never logged                      |
| `ANALYTICS_FINGERPRINT_SECRET` | —                          | **Required** when enabled; salts the fingerprint |
| `ANALYTICS_FLUSH_INTERVAL_MS`  | `5000`                     | Buffer flush interval                            |
| `ANALYTICS_FLUSH_BATCH_SIZE`   | `100`                      | Flush early once this many records are buffered  |
| `ANALYTICS_PURGE_CRON`         | `0 3 * * *`                | When the retention purge runs (instance 0 only)  |
| `ANALYTICS_RESPECT_DNT`        | `true`                     | Skip requests sending `DNT: 1`                   |

**What is recorded:** IP, method, route pattern, status code, duration, user agent,
country, ASN, a pseudo-session fingerprint, and user ID when authenticated.

**What is deliberately not recorded:** query parameters (the hearings endpoint carries
search terms and case numbers), city, region, and referrer. Only the route _pattern_ is
stored for matched routes — `/api/v1/hearings`, never `/api/v1/hearings?search=...`.
Unmatched paths are stored as requested, minus the query string, so probe attempts stay
visible.

**The fingerprint** is `sha256(secret + date + ip + user agent)`. The date component
rotates it daily, capping how long a client stays linkable; the secret is what stops the
hash being reversed, since IP plus user agent is a brute-forceable input space on its own.
Generate a secret with `./bin/cacd secret generate`.

**Before enabling in production:** IP addresses are personal data and the fingerprint is
pseudonymous rather than anonymous, so UK GDPR applies even though no cookie banner is
needed. Publish a privacy notice covering what is collected, the lawful basis, the
retention period and how to object.

## GeoIP & Country Blocklist

Lookups run against local MaxMind GeoLite2 `.mmdb` files. Each database loads
independently — a missing file degrades that lookup to `null` rather than failing startup.

| Variable                | Default                                | Description                          |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| `GEOIP_COUNTRY_DB_PATH` | `/var/lib/GeoIP/GeoLite2-Country.mmdb` | Country database                     |
| `GEOIP_ASN_DB_PATH`     | `/var/lib/GeoIP/GeoLite2-ASN.mmdb`     | ASN database                         |
| `BLOCKED_COUNTRIES`     | _(empty)_                              | ISO alpha-2 codes refused with `403` |

`BLOCKED_COUNTRIES` runs as an early hook, before auth and rate limiting, so blocked
traffic costs as little as possible. Leaving it empty disables the hook entirely. City is
not collected: it is the most identifying geo field and adds little for a UK-focused site,
so only the Country and ASN databases are needed.

The `.mmdb` files are refreshed externally (typically by `geoipupdate`); the app reads them
at startup, so a restart picks up new data.

## File Permissions

The application checks `.env` file permissions on startup — it must be `0600` (owner read/write only) on Unix/Linux. Fix with `chmod 600 .env`. This check is skipped automatically on Windows, or when `SKIP_STARTUP_FILESYSTEM_CHECK=true`.

## Production Deployment

```bash
# Build optimized frontend assets
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
```

See [PM2 Deployment Guide](pm2-deployment.md) for detailed production setup.

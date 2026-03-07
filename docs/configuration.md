# Configuration Reference

All configuration is via environment variables in `.env`. See `.env.example` for the full list with defaults.

## Required Variables

| Variable      | Description                                                               |
| ------------- | ------------------------------------------------------------------------- |
| `DB_USER`     | MariaDB username                                                          |
| `DB_PASSWORD` | MariaDB password                                                          |
| `JWT_SECRET`  | Secret for signing JWT tokens. Generate with `./bin/cacd secret generate` |

## Application

| Variable    | Default       | Description                                                                                                                   |
| ----------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`  | `development` | `development` or `production`                                                                                                 |
| `PORT`      | `3000`        | HTTP server port                                                                                                              |
| `BASE_URL`  | —             | Public-facing URL when behind a reverse proxy (e.g. `https://daily-cause-archive.net`). Used in startup logs and email links. |
| `LOG_LEVEL` | `info`        | Logging level                                                                                                                 |

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

| Variable                        | Default  | Description                                          |
| ------------------------------- | -------- | ---------------------------------------------------- |
| `SKIP_STARTUP_FILESYSTEM_CHECK` | `false`  | Skip `.env` permission check (useful on Windows)     |
| `API_RATE_LIMIT_MAX`            | `100`    | Max requests per rate limit window (unauthenticated) |
| `API_RATE_LIMIT_WINDOW`         | `900000` | Rate limit window in ms (15 min)                     |

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

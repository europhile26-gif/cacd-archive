# Developer Guide

## Prerequisites

- Node.js 18+
- MariaDB 10.5+

## Setup

```bash
git clone <repo-url>
cd cacd-archive
npm install

# Configure environment
cp .env.example .env
chmod 600 .env
# Edit .env with your database credentials

# Generate a JWT secret
./bin/cacd secret generate

# Run migrations
npm run migrate

# Start dev server (with auto-reload)
npm run dev
```

## Project Structure

```
src/
  index.js              Entry point
  config/               Config loading, database connection
  api/
    server.js           Fastify setup and plugin registration
    routes/             Route handlers
    middleware/          Auth middleware
  scrapers/             Link discovery, HTML table parsing, scheduler
  services/             Business logic (sync, auth, notifications, email)
  models/               Role, Capability, AccountStatus, User, SavedSearch
  db/
    migrator.js         Migration runner
    migrations/         Numbered .sql files
  cli/                  CLI commands (users, db, scraper, secret)
  utils/                Logger, startup checks
public/                 Static frontend (HTML, JS, CSS)
test/
  unit/                 Unit tests
  integration/          Integration tests (require MariaDB)
  helpers/              Test utilities
```

## Common Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Start dev server with nodemon        |
| `npm start`             | Start production server              |
| `npm test`              | Run all tests                        |
| `npm run test:watch`    | Run tests in watch mode              |
| `npm run test:coverage` | Run tests with coverage report       |
| `npm run lint`          | Run ESLint                           |
| `npm run lint:fix`      | Auto-fix lint issues                 |
| `npm run format`        | Format code with Prettier            |
| `npm run migrate`       | Run database migrations              |
| `npm run build`         | Build frontend assets for production |

## Testing

Tests use Jest 30 with a real MariaDB test database (no SQLite mocks).

### Test Database Setup

```bash
# Create a test database in MariaDB
# The database name MUST contain "test" (safety check)

cp .env.test.example .env.test
# Edit .env.test with test database credentials
```

### Running Tests

```bash
npm test                           # All tests
npx jest test/unit/                # Unit tests only
npx jest test/integration/         # Integration tests only
npx jest test/unit/config.test.js  # Single file
npm run test:watch                 # Watch mode
```

### Writing Tests

- Unit tests go in `test/unit/`, integration tests in `test/integration/`
- Integration tests that use the database should call `closePool()` in `afterAll`
- Use `test/helpers/db.js` for database utilities (e.g., `clearHearings()`)
- Global setup runs migrations automatically; global teardown closes the pool

## Code Style

- CommonJS modules (`require`/`module.exports`), no ESM or TypeScript
- Single quotes, 2-space indentation, trailing commas
- Prettier + ESLint for formatting and linting
- Raw SQL with parameterized queries (no ORM)

## Database Migrations

Add new migrations as numbered SQL files in `src/db/migrations/`:

```
src/db/migrations/
  001_create_hearings.sql
  002_create_users.sql
  ...
  009_your_new_migration.sql
```

Migrations run automatically on startup (instance 0 only in PM2) and during test setup.

## API Documentation

Interactive Swagger docs are available at `/api/docs` when the server is running. See also [API Guide](api.md).

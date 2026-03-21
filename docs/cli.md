# CLI Reference

The CACD Archive CLI provides administrative commands for managing the application.

```bash
./bin/cacd <command> [options]
```

## Commands

### `users create`

Create a new user account interactively, or pass options directly.

```bash
./bin/cacd users create
./bin/cacd users create -e admin@example.com -n "Admin" -r administrator -s active
```

| Option                      | Description                                 |
| --------------------------- | ------------------------------------------- |
| `-e, --email <email>`       | User email                                  |
| `-n, --name <name>`         | Full name                                   |
| `-p, --password <password>` | Password (prompted if omitted)              |
| `-r, --role <role>`         | `administrator` or `user` (default: `user`) |
| `-s, --status <status>`     | `active` or `pending` (default: `active`)   |

### `users list`

List all users.

```bash
./bin/cacd users list
./bin/cacd users list -s pending
./bin/cacd users list --search "john"
```

| Option                  | Description                             |
| ----------------------- | --------------------------------------- |
| `-s, --status <status>` | Filter: `pending`, `active`, `inactive` |
| `--search <query>`      | Search by name or email                 |
| `-l, --limit <n>`       | Max results (default: 100)              |

### `users show`

Show details for a specific user.

```bash
./bin/cacd users show -e admin@example.com
./bin/cacd users show -i 1 -v
```

### `users approve`

Approve a pending user account.

```bash
./bin/cacd users approve -e user@example.com -n "Approved by admin"
```

### `users deactivate`

Deactivate a user account.

```bash
./bin/cacd users deactivate -i 5 -n "No longer needed"
```

### `db summary`

Show a summary of database contents: hearing counts by source, scrape history with success/failure counts, users, saved searches, and notifications.

```bash
./bin/cacd db summary
```

### `db reset`

Reset database data. By default clears hearings and scrape history only. With `--all`, also clears user data. Seed data (roles, capabilities, account statuses, data sources) is always preserved.

```bash
./bin/cacd db reset              # hearings + scrape history only
./bin/cacd db reset --all        # also reset users, saved searches, notifications
./bin/cacd db reset --all --yes  # skip confirmation prompt
```

| Option      | Description                                        |
| ----------- | -------------------------------------------------- |
| `-a, --all` | Also reset user data (users, saved searches, etc.) |
| `-y, --yes` | Skip confirmation prompt                           |

### `db migrate`

Run pending database migrations.

```bash
./bin/cacd db migrate
```

### `scraper run`

Run the scraper immediately (outside the normal schedule). Scrapes all enabled data sources by default, or a specific source with `--source`.

```bash
./bin/cacd scraper run                # scrape all enabled sources
./bin/cacd scraper run --source dcl   # scrape Daily Cause List only
./bin/cacd scraper run --source fhl   # scrape Future Hearing List only
```

| Option                | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `-s, --source <slug>` | Source to scrape: `dcl`, `fhl`, or full slug (e.g. `daily_cause_list`) |

### `secret generate`

Generate a cryptographically secure random secret for use as `JWT_SECRET` or `COOKIE_SECRET`.

```bash
./bin/cacd secret generate
./bin/cacd secret generate -l 64   # 64 bytes (128 hex chars)
```

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `-l, --length <bytes>` | Length in bytes (default: 32, output is hex-encoded) |

### `system info`

Show system information and database connectivity status.

```bash
./bin/cacd system info
```

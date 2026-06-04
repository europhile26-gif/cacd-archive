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

### `users reset-password`

Reset a user's password. Useful when a user is locked out and the self-service "forgot password" flow is unavailable. Identify the account with `-e/--email` or `-i/--id`; the command shows the matched account, then prompts for a new password (entered twice, masked) validated against the standard strength rules.

```bash
./bin/cacd users reset-password -e user@example.com
./bin/cacd users reset-password -i 5
```

| Option                      | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| `-i, --id <id>`             | User ID                                                                      |
| `-e, --email <email>`       | User email                                                                   |
| `-p, --password <password>` | New password (omit for interactive prompt; note it leaks into shell history) |

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

### `search run`

Run the saved-search matcher for a phrase and print the matching hearings. Uses the same exact, case-insensitive phrase matching as the on-site search and the notification alerts, so it's the quickest way to see exactly what a given saved search would match. Defaults to the today + tomorrow notification window.

```bash
./bin/cacd search run "Criminal Cases Review Commission"        # today + tomorrow
./bin/cacd search run "Criminal Justice Act" --all --verbose    # all dates, show matched columns
./bin/cacd search run "R v Smith" --all --json | jq             # machine-readable
```

| Option            | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `-a, --all`       | Search all dates (default: today + tomorrow)              |
| `--from <date>`   | Earliest `list_date` to include (`YYYY-MM-DD`)            |
| `--to <date>`     | Latest `list_date` to include (`YYYY-MM-DD`)              |
| `-l, --limit <n>` | Max results (default: 100)                                |
| `-j, --json`      | Output results as JSON (info logs suppressed)             |
| `-v, --verbose`   | Show the `LIKE` pattern and which column matched each row |

### `search saved`

List saved searches with their owners and preview what each one matches in the notification window (today + tomorrow). Searches that wouldn't actually trigger a notification — disabled, notifications off, or an inactive user — are flagged.

```bash
./bin/cacd search saved
./bin/cacd search saved --user user@example.com -v
```

| Option               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `-u, --user <email>` | Only show searches owned by this user              |
| `-v, --verbose`      | List the matching hearings under each saved search |

### `search preview-email`

Render the saved-search notification email for a phrase without sending it. Prints the plain-text version by default; use `--html` to print the HTML or `--out` to write the HTML to a file.

```bash
./bin/cacd search preview-email "Criminal Justice Act"
./bin/cacd search preview-email "Criminal Justice Act" --out /tmp/preview.html
```

| Option              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `--html`            | Output the HTML email instead of plain text        |
| `-o, --out <file>`  | Write the HTML email to a file                     |
| `-n, --name <name>` | Recipient name to render (default: `Preview User`) |

### `search notify`

Exercise the saved-search notification pipeline. Dry-run by default: reports which users would be emailed and why (matches found, rate limits) without sending anything. Use `--send` to run the real pipeline.

```bash
./bin/cacd search notify              # dry-run, no emails sent
./bin/cacd search notify --send       # send for real (prompts to confirm)
./bin/cacd search notify --send --yes # send for real, skip confirmation
```

| Option      | Description                                            |
| ----------- | ------------------------------------------------------ |
| `--send`    | Actually send notification emails (prompts to confirm) |
| `-y, --yes` | Skip the confirmation prompt when using `--send`       |

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

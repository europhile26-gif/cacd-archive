# Upgrading a Running Instance

How to update a running CACD Archive deployment to a new version.

## Standard Upgrade

```bash
# 1. Pull the latest code
cd /path/to/cacd-archive
git pull

# 2. Install any new/updated dependencies
npm install --production

# 3. Run database migrations
npm run migrate

# 4. Rebuild frontend assets
npm run build

# 5. Restart the application
pm2 restart cacd-archive
# or, without PM2:
# npm run start
```

Migrations are safe to re-run — already-applied migrations are skipped automatically. The application logs which migrations are applied and which are skipped on each run.

## Zero-Downtime Upgrade (PM2)

If you're running PM2 in cluster mode, use `reload` instead of `restart` for a rolling restart with no downtime:

```bash
pm2 reload cacd-archive
```

In fork mode (single instance), there will be a brief interruption during restart. This is typically a few seconds.

## Checking the Current Version

```bash
# From package.json
node -p "require('./package.json').version"

# From the health endpoint
curl -s http://localhost:3000/api/v1/health | jq .version

# From PM2
pm2 info cacd-archive
```

## When to Check for New Environment Variables

If a release introduces new **required** environment variables, the application will fail to start and the error message will indicate what's missing. Optional variables are documented in `.env.example` and the [Configuration Reference](configuration.md).

Compare your `.env` against `.env.example` after pulling:

```bash
# Show variables in .env.example that are missing from your .env
diff <(grep -oP '^[A-Z_]+' .env.example | sort) <(grep -oP '^[A-Z_]+' .env | sort) | grep '<'
```

## Rollback

If something goes wrong after upgrading:

```bash
# 1. Check the previous version
git log --oneline -5

# 2. Roll back to the previous commit
git checkout <commit-hash>

# 3. Reinstall dependencies for that version
npm install --production

# 4. Rebuild frontend assets
npm run build

# 5. Restart
pm2 restart cacd-archive
```

Database migrations are forward-only — there is no automatic rollback. If a migration introduced a breaking schema change, you would need to reverse it manually. In practice, migrations are additive (new tables, new columns, new indexes) and backward-compatible, so rolling back the code without reversing the migration is usually safe.

## Upgrade Checklist

A quick reference for each upgrade:

1. `git pull`
2. `npm install --production`
3. `npm run migrate`
4. `npm run build`
5. `pm2 restart cacd-archive` (or `pm2 reload` for zero-downtime)
6. Verify: `curl http://localhost:3000/api/v1/health`

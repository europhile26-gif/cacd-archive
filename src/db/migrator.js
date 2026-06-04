const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/config');
const { query } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Return the .sql migration filenames on disk (version = filename without .sql),
 * sorted. Shared by runMigrations() and getMigrationStatus().
 */
function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Summarise migration state for reporting (e.g. the admin system-info panel).
 * Compares the schema_migrations table against the files on disk.
 * @returns {Promise<{applied:number,total:number,pending:number,
 *   pendingVersions:string[],latest:{version:string,applied_at:Date}|null}>}
 */
async function getMigrationStatus() {
  const appliedRows = await query(
    'SELECT version, applied_at FROM schema_migrations ORDER BY version'
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  const versions = listMigrationFiles().map((f) => f.replace('.sql', ''));
  const pendingVersions = versions.filter((v) => !appliedVersions.has(v));
  const latest = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1] : null;

  return {
    applied: appliedRows.length,
    total: versions.length,
    pending: pendingVersions.length,
    pendingVersions,
    latest: latest ? { version: latest.version, applied_at: latest.applied_at } : null
  };
}

async function runMigrations() {
  const connection = await mysql.createConnection(config.database);

  try {
    console.log('Running database migrations...');

    // Create migrations table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // Get applied migrations
    const [rows] = await connection.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(rows.map((r) => r.version));

    // Get migration files
    const migrationsDir = MIGRATIONS_DIR;
    const files = listMigrationFiles();

    if (files.length === 0) {
      console.log('No migration files found');
      return;
    }

    // Apply pending migrations
    let appliedCount = 0;
    for (const file of files) {
      const version = file.replace('.sql', '');

      if (appliedVersions.has(version)) {
        console.log(`Migration ${version} already applied, skipping`);
        continue;
      }

      console.log(`Applying migration ${version}...`);

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await connection.beginTransaction();

      try {
        // Remove comments first
        const cleanedSql = sql
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n');

        // Split by semicolons at the end of lines (more reliable)
        const statements = cleanedSql
          .split(/;\s*\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Execute each statement
        for (const statement of statements) {
          if (statement.trim().length > 0) {
            console.log(`Executing statement: ${statement.substring(0, 50)}...`);
            await connection.query(statement);
          }
        }

        // Record migration
        await connection.query(
          'INSERT INTO schema_migrations (version, description) VALUES (?, ?)',
          [version, file]
        );

        await connection.commit();
        console.log(`Migration ${version} applied successfully`);
        appliedCount++;
      } catch (error) {
        await connection.rollback();
        console.error(`Migration ${version} failed:`, error.message);
        console.error('SQL Error:', error.sqlMessage);
        throw new Error(`Migration ${version} failed: ${error.message}`);
      }
    }

    if (appliedCount === 0) {
      console.log('All migrations already applied');
    } else {
      console.log(`Successfully applied ${appliedCount} migration(s)`);
    }
  } finally {
    await connection.end();
  }
}

module.exports = { runMigrations, getMigrationStatus };

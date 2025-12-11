const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/config');

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
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

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

module.exports = { runMigrations };

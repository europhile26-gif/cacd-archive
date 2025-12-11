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
    const [rows] = await connection.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(rows.map(r => r.version));
    
    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
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
      
      const sql = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf8'
      );
      
      await connection.beginTransaction();
      
      try {
        // Execute migration SQL
        await connection.query(sql);
        
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

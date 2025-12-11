const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

function createPool() {
  if (!pool) {
    pool = mysql.createPool(config.database);
  }
  return pool;
}

async function getConnection() {
  const dbPool = createPool();
  return await dbPool.getConnection();
}

async function query(sql, params) {
  const dbPool = createPool();
  const [rows] = await dbPool.query(sql, params);
  return rows;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  createPool,
  getConnection,
  query,
  closePool,
};

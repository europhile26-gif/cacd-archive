/**
 * AccountStatus Model
 * Handles database operations for account statuses
 */

const db = require('../config/database');

class AccountStatus {
  /**
   * Find status by ID
   * @param {number} id - Status ID
   * @returns {Promise<Object|null>} Status object or null if not found
   */
  static async findById(id) {
    const sql = 'SELECT * FROM account_statuses WHERE id = ?';
    const rows = await db.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find status by slug
   * @param {string} slug - Status slug
   * @returns {Promise<Object|null>} Status object or null if not found
   */
  static async findBySlug(slug) {
    const sql = 'SELECT * FROM account_statuses WHERE slug = ?';
    const rows = await db.query(sql, [slug]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all statuses
   * @returns {Promise<Array>} Array of status objects
   */
  static async findAll() {
    const sql = 'SELECT * FROM account_statuses ORDER BY id';
    return await db.query(sql);
  }

  /**
   * Get user's status history
   * @param {number} userId - User ID
   * @param {number} [limit=10] - Number of records to return
   * @returns {Promise<Array>} Array of status history records
   */
  static async getUserHistory(userId, limit = 10) {
    const sql = `
      SELECT 
        h.*,
        s.name as status_name,
        s.slug as status_slug,
        u.name as changed_by_name
      FROM user_status_history h
      LEFT JOIN account_statuses s ON h.status_id = s.id
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.user_id = ?
      ORDER BY h.changed_at DESC
      LIMIT ?
    `;
    return await db.query(sql, [userId, limit]);
  }
}

module.exports = AccountStatus;

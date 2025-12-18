/**
 * User Model
 * Handles database operations for user accounts
 */

const db = require('../config/database');

class User {
  /**
   * Find user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findById(id) {
    const sql = `
      SELECT 
        u.*,
        s.name as status_name,
        s.slug as status_slug,
        s.is_active as status_is_active
      FROM users u
      LEFT JOIN account_statuses s ON u.status_id = s.id
      WHERE u.id = ? AND u.deleted_at IS NULL
    `;
    const rows = await db.query(sql, [id]);
    return rows.length > 0 ? this._formatUser(rows[0]) : null;
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findByEmail(email) {
    const sql = `
      SELECT 
        u.*,
        s.name as status_name,
        s.slug as status_slug,
        s.is_active as status_is_active
      FROM users u
      LEFT JOIN account_statuses s ON u.status_id = s.id
      WHERE u.email = ? AND u.deleted_at IS NULL
    `;
    const rows = await db.query(sql, [email]);
    return rows.length > 0 ? this._formatUser(rows[0]) : null;
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.email - User email
   * @param {string} userData.password_hash - Hashed password
   * @param {string} userData.name - User name
   * @param {number} [userData.status_id=1] - Account status ID (default: pending)
   * @returns {Promise<Object>} Created user object
   */
  static async create(userData) {
    const { email, password_hash, name, status_id = 1 } = userData;

    const sql = `
      INSERT INTO users (email, password_hash, name, status_id)
      VALUES (?, ?, ?, ?)
    `;

    const result = await db.query(sql, [email, password_hash, name, status_id]);

    // Record initial status in history
    await this._recordStatusChange(result.insertId, status_id, null, 'Account created');

    return await this.findById(result.insertId);
  }

  /**
   * Update user profile
   * @param {number} id - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user object
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'email'];
    const fields = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    const sql = `UPDATE users SET ${setClause} WHERE id = ?`;
    await db.query(sql, values);

    return await this.findById(id);
  }

  /**
   * Update user password
   * @param {number} id - User ID
   * @param {string} password_hash - New hashed password
   * @returns {Promise<boolean>} Success status
   */
  static async updatePassword(id, password_hash) {
    const sql = 'UPDATE users SET password_hash = ? WHERE id = ?';
    await db.query(sql, [password_hash, id]);
    return true;
  }

  /**
   * Change user account status
   * @param {number} id - User ID
   * @param {number} status_id - New status ID
   * @param {number|null} changed_by - ID of user making the change
   * @param {string} [notes=''] - Reason for change
   * @returns {Promise<Object>} Updated user object
   */
  static async changeStatus(id, status_id, changed_by = null, notes = '') {
    const sql = 'UPDATE users SET status_id = ? WHERE id = ?';
    await db.query(sql, [status_id, id]);

    await this._recordStatusChange(id, status_id, changed_by, notes);

    return await this.findById(id);
  }

  /**
   * Soft delete a user
   * @param {number} id - User ID
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(id) {
    const sql = 'UPDATE users SET deleted_at = NOW() WHERE id = ?';
    await db.query(sql, [id]);
    return true;
  }

  /**
   * List all users with pagination and filters
   * @param {Object} options - Query options
   * @param {number} [options.limit=20] - Results per page
   * @param {number} [options.offset=0] - Result offset
   * @param {string} [options.status] - Filter by status slug
   * @param {string} [options.search] - Search by name or email
   * @returns {Promise<Array>} Array of user objects
   */
  static async list(options = {}) {
    const { limit = 20, offset = 0, status, search } = options;

    let sql = `
      SELECT 
        u.*,
        s.name as status_name,
        s.slug as status_slug,
        s.is_active as status_is_active
      FROM users u
      LEFT JOIN account_statuses s ON u.status_id = s.id
      WHERE u.deleted_at IS NULL
    `;

    const params = [];

    if (status) {
      sql += ' AND s.slug = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await db.query(sql, params);
    return rows.map((row) => this._formatUser(row));
  }

  /**
   * Count total users
   * @param {Object} options - Query options
   * @returns {Promise<number>} Total count
   */
  static async count(options = {}) {
    const { status, search } = options;

    let sql = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN account_statuses s ON u.status_id = s.id
      WHERE u.deleted_at IS NULL
    `;

    const params = [];

    if (status) {
      sql += ' AND s.slug = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    const rows = await db.query(sql, params);
    return rows[0].total;
  }

  /**
   * Get user's roles
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of role objects
   */
  static async getRoles(userId) {
    const sql = `
      SELECT r.*
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `;
    return await db.query(sql, [userId]);
  }

  /**
   * Get user's capabilities (through roles)
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of capability slugs
   */
  static async getCapabilities(userId) {
    const sql = `
      SELECT DISTINCT c.slug
      FROM capabilities c
      JOIN role_capabilities rc ON c.id = rc.capability_id
      JOIN user_roles ur ON rc.role_id = ur.role_id
      WHERE ur.user_id = ?
    `;
    const rows = await db.query(sql, [userId]);
    return rows.map((row) => row.slug);
  }

  /**
   * Assign role to user
   * @param {number} userId - User ID
   * @param {number} roleId - Role ID
   * @param {number|null} assignedBy - ID of admin assigning the role
   * @returns {Promise<boolean>} Success status
   */
  static async assignRole(userId, roleId, assignedBy = null) {
    const sql = `
      INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
      VALUES (?, ?, ?)
    `;
    await db.query(sql, [userId, roleId, assignedBy]);
    return true;
  }

  /**
   * Remove role from user
   * @param {number} userId - User ID
   * @param {number} roleId - Role ID
   * @returns {Promise<boolean>} Success status
   */
  static async removeRole(userId, roleId) {
    const sql = 'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?';
    await db.query(sql, [userId, roleId]);
    return true;
  }

  /**
   * Record status change in history
   * @private
   */
  static async _recordStatusChange(userId, statusId, changedBy, notes) {
    const sql = `
      INSERT INTO user_status_history (user_id, status_id, changed_by, notes)
      VALUES (?, ?, ?, ?)
    `;
    await db.query(sql, [userId, statusId, changedBy, notes]);
  }

  /**
   * Format user object (remove sensitive data, format timestamps)
   * @private
   */
  static _formatUser(row) {
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      status: {
        id: row.status_id,
        name: row.status_name,
        slug: row.status_slug,
        is_active: Boolean(row.status_is_active)
      },
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    // Include password_hash only when explicitly needed (not in default formatting)
    if (row.password_hash && this._includePasswordHash) {
      user.password_hash = row.password_hash;
    }

    return user;
  }

  /**
   * Get user with password hash (for authentication)
   * @param {number|string} identifier - User ID or email
   * @returns {Promise<Object|null>} User object with password_hash
   */
  static async findForAuth(identifier) {
    this._includePasswordHash = true;
    let user;

    if (typeof identifier === 'number') {
      user = await this.findById(identifier);
    } else {
      user = await this.findByEmail(identifier);
    }

    this._includePasswordHash = false;

    if (user) {
      const sql = 'SELECT password_hash FROM users WHERE id = ?';
      const rows = await db.query(sql, [user.id]);
      if (rows.length > 0) {
        user.password_hash = rows[0].password_hash;
      }
    }

    return user;
  }
}

module.exports = User;

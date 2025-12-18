/**
 * Role Model
 * Handles database operations for roles
 */

const db = require('../config/database');

class Role {
  /**
   * Find role by ID
   * @param {number} id - Role ID
   * @returns {Promise<Object|null>} Role object or null if not found
   */
  static async findById(id) {
    const sql = 'SELECT * FROM roles WHERE id = ?';
    const rows = await db.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find role by slug
   * @param {string} slug - Role slug
   * @returns {Promise<Object|null>} Role object or null if not found
   */
  static async findBySlug(slug) {
    const sql = 'SELECT * FROM roles WHERE slug = ?';
    const rows = await db.query(sql, [slug]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all roles
   * @returns {Promise<Array>} Array of role objects
   */
  static async findAll() {
    const sql = 'SELECT * FROM roles ORDER BY name';
    return await db.query(sql);
  }

  /**
   * Create a new role
   * @param {Object} roleData - Role data
   * @param {string} roleData.name - Role name
   * @param {string} roleData.slug - Role slug
   * @param {string} [roleData.description] - Role description
   * @returns {Promise<Object>} Created role object
   */
  static async create(roleData) {
    const { name, slug, description = '' } = roleData;

    const sql = `
      INSERT INTO roles (name, slug, description)
      VALUES (?, ?, ?)
    `;

    const result = await db.query(sql, [name, slug, description]);
    return await this.findById(result.insertId);
  }

  /**
   * Update role
   * @param {number} id - Role ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated role object
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'description'];
    const fields = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    const sql = `UPDATE roles SET ${setClause} WHERE id = ?`;
    await db.query(sql, values);

    return await this.findById(id);
  }

  /**
   * Delete role
   * @param {number} id - Role ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    // First remove all user-role associations
    await db.query('DELETE FROM user_roles WHERE role_id = ?', [id]);

    // Then remove all role-capability associations
    await db.query('DELETE FROM role_capabilities WHERE role_id = ?', [id]);

    // Finally delete the role
    await db.query('DELETE FROM roles WHERE id = ?', [id]);
    return true;
  }

  /**
   * Get capabilities for a role
   * @param {number} roleId - Role ID
   * @returns {Promise<Array>} Array of capability objects
   */
  static async getCapabilities(roleId) {
    const sql = `
      SELECT c.*
      FROM capabilities c
      JOIN role_capabilities rc ON c.id = rc.capability_id
      WHERE rc.role_id = ?
      ORDER BY c.category, c.name
    `;
    return await db.query(sql, [roleId]);
  }

  /**
   * Assign capability to role
   * @param {number} roleId - Role ID
   * @param {number} capabilityId - Capability ID
   * @returns {Promise<boolean>} Success status
   */
  static async assignCapability(roleId, capabilityId) {
    const sql = `
      INSERT IGNORE INTO role_capabilities (role_id, capability_id)
      VALUES (?, ?)
    `;
    await db.query(sql, [roleId, capabilityId]);
    return true;
  }

  /**
   * Remove capability from role
   * @param {number} roleId - Role ID
   * @param {number} capabilityId - Capability ID
   * @returns {Promise<boolean>} Success status
   */
  static async removeCapability(roleId, capabilityId) {
    const sql = 'DELETE FROM role_capabilities WHERE role_id = ? AND capability_id = ?';
    await db.query(sql, [roleId, capabilityId]);
    return true;
  }

  /**
   * Get users with this role
   * @param {number} roleId - Role ID
   * @returns {Promise<Array>} Array of user IDs
   */
  static async getUsers(roleId) {
    const sql = 'SELECT user_id FROM user_roles WHERE role_id = ?';
    const rows = await db.query(sql, [roleId]);
    return rows.map((row) => row.user_id);
  }
}

module.exports = Role;

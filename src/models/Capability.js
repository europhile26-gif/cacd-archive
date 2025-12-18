/**
 * Capability Model
 * Handles database operations for capabilities
 */

const db = require('../config/database');

class Capability {
  /**
   * Find capability by ID
   * @param {number} id - Capability ID
   * @returns {Promise<Object|null>} Capability object or null if not found
   */
  static async findById(id) {
    const sql = 'SELECT * FROM capabilities WHERE id = ?';
    const rows = await db.query(sql, [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find capability by slug
   * @param {string} slug - Capability slug
   * @returns {Promise<Object|null>} Capability object or null if not found
   */
  static async findBySlug(slug) {
    const sql = 'SELECT * FROM capabilities WHERE slug = ?';
    const rows = await db.query(sql, [slug]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all capabilities
   * @param {string} [category] - Filter by category
   * @returns {Promise<Array>} Array of capability objects
   */
  static async findAll(category = null) {
    let sql = 'SELECT * FROM capabilities';
    const params = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, name';
    return await db.query(sql, params);
  }

  /**
   * Get all capability categories
   * @returns {Promise<Array>} Array of category names
   */
  static async getCategories() {
    const sql = 'SELECT DISTINCT category FROM capabilities ORDER BY category';
    const rows = await db.query(sql);
    return rows.map((row) => row.category);
  }

  /**
   * Create a new capability
   * @param {Object} capData - Capability data
   * @param {string} capData.name - Capability name
   * @param {string} capData.slug - Capability slug
   * @param {string} [capData.description] - Capability description
   * @param {string} [capData.category] - Capability category
   * @returns {Promise<Object>} Created capability object
   */
  static async create(capData) {
    const { name, slug, description = '', category = 'other' } = capData;

    const sql = `
      INSERT INTO capabilities (name, slug, description, category)
      VALUES (?, ?, ?, ?)
    `;

    const result = await db.query(sql, [name, slug, description, category]);
    return await this.findById(result.insertId);
  }

  /**
   * Update capability
   * @param {number} id - Capability ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated capability object
   */
  static async update(id, updates) {
    const allowedFields = ['name', 'description', 'category'];
    const fields = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id);

    const sql = `UPDATE capabilities SET ${setClause} WHERE id = ?`;
    await db.query(sql, values);

    return await this.findById(id);
  }

  /**
   * Delete capability
   * @param {number} id - Capability ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    // First remove all role-capability associations
    await db.query('DELETE FROM role_capabilities WHERE capability_id = ?', [id]);

    // Then delete the capability
    await db.query('DELETE FROM capabilities WHERE id = ?', [id]);
    return true;
  }

  /**
   * Get roles that have this capability
   * @param {number} capabilityId - Capability ID
   * @returns {Promise<Array>} Array of role IDs
   */
  static async getRoles(capabilityId) {
    const sql = 'SELECT role_id FROM role_capabilities WHERE capability_id = ?';
    const rows = await db.query(sql, [capabilityId]);
    return rows.map((row) => row.role_id);
  }
}

module.exports = Capability;

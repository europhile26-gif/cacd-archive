/**
 * SavedSearch Model
 * Handles database operations for saved search functionality
 */

const db = require('../config/database');

class SavedSearch {
  /**
   * Configuration from environment
   */
  static get MIN_LENGTH() {
    return parseInt(process.env.SAVED_SEARCH_MIN_LENGTH || '3', 10);
  }

  static get MAX_LENGTH() {
    return parseInt(process.env.SAVED_SEARCH_MAX_LENGTH || '255', 10);
  }

  static get MAX_PER_USER() {
    return parseInt(process.env.SAVED_SEARCH_MAX_PER_USER || '10', 10);
  }

  /**
   * Validate search text
   * @param {string} searchText - Search text to validate
   * @throws {Error} If validation fails
   */
  static validateSearchText(searchText) {
    if (!searchText || typeof searchText !== 'string') {
      throw new Error('Search text is required');
    }

    const trimmed = searchText.trim();

    if (trimmed.length < this.MIN_LENGTH) {
      throw new Error(`Search text must be at least ${this.MIN_LENGTH} characters`);
    }

    if (trimmed.length > this.MAX_LENGTH) {
      throw new Error(`Search text must not exceed ${this.MAX_LENGTH} characters`);
    }

    return trimmed;
  }

  /**
   * Find saved search by ID
   * @param {number} id - Search ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<Object|null>} Search object or null
   */
  static async findById(id, userId) {
    const sql = `
      SELECT * FROM saved_searches
      WHERE id = ? AND user_id = ?
    `;
    const rows = await db.query(sql, [id, userId]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * List all saved searches for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of search objects
   */
  static async listByUser(userId) {
    const sql = `
      SELECT * FROM saved_searches
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    return await db.query(sql, [userId]);
  }

  /**
   * Get count of saved searches for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Count of saved searches
   */
  static async countByUser(userId) {
    const sql = 'SELECT COUNT(*) as count FROM saved_searches WHERE user_id = ?';
    const rows = await db.query(sql, [userId]);
    return rows[0].count;
  }

  /**
   * Create a new saved search
   * @param {number} userId - User ID
   * @param {string} searchText - Search text
   * @param {boolean} [enabled=true] - Is search enabled
   * @returns {Promise<Object>} Created search object
   * @throws {Error} If validation fails or limit exceeded
   */
  static async create(userId, searchText, enabled = true) {
    // Validate search text
    const validatedText = this.validateSearchText(searchText);

    // Check user hasn't exceeded limit
    const count = await this.countByUser(userId);
    if (count >= this.MAX_PER_USER) {
      throw new Error(`Maximum ${this.MAX_PER_USER} saved searches allowed`);
    }

    const sql = `
      INSERT INTO saved_searches (user_id, search_text, enabled)
      VALUES (?, ?, ?)
    `;

    const result = await db.query(sql, [userId, validatedText, enabled ? 1 : 0]);

    return await this.findById(result.insertId, userId);
  }

  /**
   * Update a saved search
   * @param {number} id - Search ID
   * @param {number} userId - User ID (for authorization)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated search object
   * @throws {Error} If search not found or validation fails
   */
  static async update(id, userId, updates) {
    // Check search exists and belongs to user
    const existing = await this.findById(id, userId);
    if (!existing) {
      throw new Error('Saved search not found');
    }

    const allowedFields = ['search_text', 'enabled'];
    const fields = Object.keys(updates).filter((key) => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Validate search_text if provided
    if (updates.search_text !== undefined) {
      updates.search_text = this.validateSearchText(updates.search_text);
    }

    // Convert boolean to 1/0 for MySQL
    if (updates.enabled !== undefined) {
      updates.enabled = updates.enabled ? 1 : 0;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => updates[field]);
    values.push(id, userId);

    const sql = `UPDATE saved_searches SET ${setClause} WHERE id = ? AND user_id = ?`;
    await db.query(sql, values);

    return await this.findById(id, userId);
  }

  /**
   * Delete a saved search
   * @param {number} id - Search ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If search not found
   */
  static async delete(id, userId) {
    // Check search exists and belongs to user
    const existing = await this.findById(id, userId);
    if (!existing) {
      throw new Error('Saved search not found');
    }

    const sql = 'DELETE FROM saved_searches WHERE id = ? AND user_id = ?';
    await db.query(sql, [id, userId]);
    return true;
  }

  /**
   * Get all enabled searches for users with notifications enabled
   * @returns {Promise<Array>} Array of {user_id, email, search_text, search_id}
   */
  static async getActiveSearchesForNotifications() {
    const sql = `
      SELECT 
        ss.id as search_id,
        ss.user_id,
        ss.search_text,
        u.email,
        u.name
      FROM saved_searches ss
      JOIN users u ON ss.user_id = u.id
      WHERE ss.enabled = 1
        AND u.email_notifications_enabled = 1
        AND u.status_id = 2
        AND u.deleted_at IS NULL
      ORDER BY ss.user_id, ss.created_at
    `;
    return await db.query(sql);
  }

  /**
   * Check if user can receive notifications (rate limiting)
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if user can receive notification
   */
  static async canReceiveNotification(userId) {
    const maxPerWindow = parseInt(process.env.NOTIFICATION_MAX_PER_WINDOW || '2', 10);
    const windowHours = parseInt(process.env.NOTIFICATION_WINDOW_HOURS || '12', 10);

    const sql = `
      SELECT COUNT(*) as count
      FROM search_notifications
      WHERE user_id = ?
        AND sent_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
    `;

    const rows = await db.query(sql, [userId, windowHours]);
    return rows[0].count < maxPerWindow;
  }

  /**
   * Record that a notification was sent to a user
   * @param {number} userId - User ID
   * @param {number} matchCount - Number of case matches
   * @param {number} searchesMatched - Number of different searches matched
   * @returns {Promise<Object>} Notification record
   */
  static async recordNotification(userId, matchCount, searchesMatched) {
    const sql = `
      INSERT INTO search_notifications (user_id, match_count, searches_matched)
      VALUES (?, ?, ?)
    `;

    const result = await db.query(sql, [userId, matchCount, searchesMatched]);

    return {
      id: result.insertId,
      user_id: userId,
      match_count: matchCount,
      searches_matched: searchesMatched,
      sent_at: new Date()
    };
  }
}

module.exports = SavedSearch;

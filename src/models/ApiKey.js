/**
 * API Key Model
 * Database operations for API keys. Times are UTC; "active" means unrevoked and unexpired.
 */

const db = require('../config/database');

const ACTIVE_CONDITION = 'k.revoked_at IS NULL AND k.expires_at > UTC_TIMESTAMP()';

const KEY_COLUMNS = `
  k.id, k.user_id, k.public_id, k.secret_hash, k.label, k.expires_at,
  k.expiry_warning_sent_at, k.last_used_at, k.last_used_ip, k.revoked_at, k.created_at,
  k.expires_at <= UTC_TIMESTAMP() AS expired,
  u.email AS user_email, u.name AS user_name
`;

class ApiKey {
  /**
   * Inserts a key, optionally revoking the key it replaces, while holding the per-user cap.
   */
  static async create({ userId, publicId, secretHash, label, expiryDays, maxPerUser, replacesId }) {
    // Locking the user row serialises concurrent creates, so the count can't go stale.
    const connection = await db.getConnection();
    let insertId;

    try {
      await connection.beginTransaction();
      await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);

      if (replacesId) {
        await connection.query(
          'UPDATE api_keys SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL',
          [replacesId]
        );
      }

      const [countRows] = await connection.query(
        `SELECT COUNT(*) AS count FROM api_keys k WHERE k.user_id = ? AND ${ACTIVE_CONDITION}`,
        [userId]
      );
      if (countRows[0].count >= maxPerUser) {
        throw new Error(`Maximum ${maxPerUser} active API keys allowed per user`);
      }

      const [result] = await connection.query(
        `INSERT INTO api_keys (user_id, public_id, secret_hash, label, expires_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? DAY)`,
        [userId, publicId, secretHash, label, expiryDays]
      );
      insertId = result.insertId;

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.findById(insertId);
  }

  /**
   * Finds a key by its row id.
   */
  static async findById(id) {
    const rows = await db.query(
      `SELECT ${KEY_COLUMNS} FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.id = ?`,
      [id]
    );
    return rows.length > 0 ? this._format(rows[0]) : null;
  }

  /**
   * Finds a key by the public id embedded in it.
   */
  static async findByPublicId(publicId) {
    const rows = await db.query(
      `SELECT ${KEY_COLUMNS} FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.public_id = ?`,
      [publicId]
    );
    return rows.length > 0 ? this._format(rows[0]) : null;
  }

  /**
   * Lists keys, newest first, optionally for one user.
   */
  static async list(userId = null) {
    const rows = await db.query(
      `SELECT ${KEY_COLUMNS} FROM api_keys k JOIN users u ON u.id = k.user_id
       ${userId ? 'WHERE k.user_id = ?' : ''}
       ORDER BY k.created_at DESC, k.id DESC`,
      userId ? [userId] : []
    );
    return rows.map((row) => this._format(row));
  }

  /**
   * Revokes a key; returns false when it was already revoked or doesn't exist.
   */
  static async revoke(publicId) {
    const result = await db.query(
      'UPDATE api_keys SET revoked_at = UTC_TIMESTAMP() WHERE public_id = ? AND revoked_at IS NULL',
      [publicId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Revokes every unrevoked key a user holds; returns how many were revoked.
   */
  static async revokeAllForUser(userId) {
    const result = await db.query(
      'UPDATE api_keys SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );
    return result.affectedRows;
  }

  /**
   * Records when and from where a key was last used.
   */
  static async recordUse(id, ipAddress) {
    await db.query(
      'UPDATE api_keys SET last_used_at = UTC_TIMESTAMP(), last_used_ip = ? WHERE id = ?',
      [ipAddress, id]
    );
  }

  /**
   * Lists active keys expiring within the warning window that haven't been warned about.
   */
  static async findDueExpiryWarning(warningDays) {
    const rows = await db.query(
      `SELECT ${KEY_COLUMNS} FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE ${ACTIVE_CONDITION}
         AND k.expires_at <= UTC_TIMESTAMP() + INTERVAL ? DAY
         AND k.expiry_warning_sent_at IS NULL
       ORDER BY k.expires_at`,
      [warningDays]
    );
    return rows.map((row) => this._format(row));
  }

  /**
   * Marks a key's expiry warning as sent.
   */
  static async markExpiryWarningSent(id) {
    await db.query('UPDATE api_keys SET expiry_warning_sent_at = UTC_TIMESTAMP() WHERE id = ?', [
      id
    ]);
  }

  /**
   * Converts a row into a key object with a derived state.
   */
  static _format(row) {
    let state = 'active';

    if (row.revoked_at) {
      state = 'revoked';
    } else if (row.expired) {
      state = 'expired';
    }

    return {
      id: row.id,
      user_id: row.user_id,
      user_email: row.user_email,
      user_name: row.user_name,
      public_id: row.public_id,
      secret_hash: row.secret_hash,
      label: row.label,
      expires_at: row.expires_at,
      expiry_warning_sent_at: row.expiry_warning_sent_at,
      last_used_at: row.last_used_at,
      last_used_ip: row.last_used_ip,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      state
    };
  }
}

module.exports = ApiKey;

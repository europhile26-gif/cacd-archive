/**
 * API Key Service
 * Issues, authenticates, rotates and warns about expiry of API keys
 */

const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const config = require('../config/config');
const emailService = require('./email-service');
const logger = require('../utils/logger');

const API_KEY_PREFIX = 'cacd_';
// cacd_<8 hex public id>_<43 base64url characters of secret>
const API_KEY_PATTERN = /^cacd_([0-9a-f]{8})_[A-Za-z0-9_-]{43}$/;
const LAST_USED_WRITE_INTERVAL_MS = 60000;

// Per-process time of the last last_used_at write for each key id
const lastUsedWrites = new Map();

class ApiKeyService {
  /**
   * Whether a bearer token is shaped like an API key rather than a JWT.
   */
  static isApiKey(token) {
    return typeof token === 'string' && token.startsWith(API_KEY_PREFIX);
  }

  /**
   * Hashes a full key for storage and comparison.
   */
  static hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Generates a new key and its public id.
   */
  static generateKey() {
    const publicId = crypto.randomBytes(4).toString('hex');
    const secret = crypto.randomBytes(32).toString('base64url');
    return { publicId, key: `${API_KEY_PREFIX}${publicId}_${secret}` };
  }

  /**
   * Creates a key for a user and returns { key, apiKey }; the key is not recoverable later.
   */
  static async create(user, label, expiryDays = config.apiKeys.defaultExpiryDays) {
    if (!user.status.is_active) {
      throw new Error(
        `Account is ${user.status.slug}; API keys can only be issued to active users`
      );
    }

    return this._issue({ userId: user.id, label, expiryDays });
  }

  /**
   * Replaces a key with a new one for the same owner and label, revoking the old one.
   */
  static async rotate(publicId, expiryDays = config.apiKeys.defaultExpiryDays) {
    const existing = await ApiKey.findByPublicId(publicId);

    if (!existing) {
      throw new Error(`No API key with id ${publicId}`);
    }
    if (existing.state === 'revoked') {
      throw new Error(`API key ${publicId} is revoked; create a new key instead`);
    }

    const owner = await User.findById(existing.user_id);
    if (!owner || !owner.status.is_active) {
      throw new Error('The key owner is not an active user');
    }

    return this._issue({
      userId: existing.user_id,
      label: existing.label,
      expiryDays,
      replacesId: existing.id
    });
  }

  /**
   * Generates and stores a key, retrying once on the rare public id collision.
   */
  static async _issue({ userId, label, expiryDays, replacesId = null }) {
    let issued = null;
    let attempts = 0;

    while (!issued) {
      attempts++;
      const { publicId, key } = this.generateKey();

      try {
        const apiKey = await ApiKey.create({
          userId,
          publicId,
          secretHash: this.hashKey(key),
          label,
          expiryDays,
          maxPerUser: config.apiKeys.maxPerUser,
          replacesId
        });
        issued = { key, apiKey };
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || attempts >= 2) {
          throw error;
        }
        logger.warn('API key public id collided; generating another', { publicId });
      }
    }

    return issued;
  }

  /**
   * Resolves a key to { user, apiKey }, or null when it is malformed, unknown, revoked,
   * expired or doesn't match.
   */
  static async authenticate(key) {
    const match = API_KEY_PATTERN.exec(key);
    const apiKey = match ? await ApiKey.findByPublicId(match[1]) : null;
    let authenticated = null;

    if (apiKey && apiKey.state === 'active' && this._hashMatches(key, apiKey.secret_hash)) {
      const user = await User.findById(apiKey.user_id);
      authenticated = user ? { user, apiKey } : null;
    }

    return authenticated;
  }

  /**
   * Compares a key against a stored hash in constant time.
   */
  static _hashMatches(key, storedHash) {
    const presented = Buffer.from(this.hashKey(key), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
  }

  /**
   * Records a key's use, writing at most once a minute per key per process.
   */
  static recordUse(apiKey, ipAddress) {
    const now = Date.now();

    if (now - (lastUsedWrites.get(apiKey.id) || 0) >= LAST_USED_WRITE_INTERVAL_MS) {
      lastUsedWrites.set(apiKey.id, now);
      ApiKey.recordUse(apiKey.id, ipAddress).catch((error) => {
        lastUsedWrites.delete(apiKey.id);
        logger.warn('Failed to record API key use', {
          publicId: apiKey.public_id,
          error: error.message
        });
      });
    }
  }

  /**
   * Emails a warning for each key entering the expiry window; returns how many were sent.
   */
  static async sendExpiryWarnings() {
    const dueKeys = await ApiKey.findDueExpiryWarning(config.apiKeys.expiryWarningDays);
    let sent = 0;

    for (const apiKey of dueKeys) {
      try {
        const delivered = await emailService.sendApiKeyExpiryWarning(apiKey);
        if (delivered) {
          await ApiKey.markExpiryWarningSent(apiKey.id);
          sent++;
        }
      } catch (error) {
        // Left unmarked, so the next daily run tries again
        logger.error('API key expiry warning failed', {
          publicId: apiKey.public_id,
          error: error.message
        });
      }
    }

    if (dueKeys.length > 0) {
      logger.info('API key expiry warnings processed', { due: dueKeys.length, sent });
    }

    return sent;
  }
}

ApiKeyService.API_KEY_PREFIX = API_KEY_PREFIX;

module.exports = ApiKeyService;

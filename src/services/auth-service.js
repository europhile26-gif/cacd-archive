/**
 * Authentication Service
 * Handles password hashing, verification, and JWT token generation
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const db = require('../config/database');

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour in milliseconds

class AuthService {
  /**
   * Hash a plain text password
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  static async hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a hash
   * @param {string} password - Plain text password
   * @param {string} hash - Password hash
   * @returns {Promise<boolean>} True if password matches
   */
  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  static validatePassword(password) {
    const errors = [];

    if (!password || password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate JWT access token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  static generateAccessToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      type: 'access'
    };

    return jwt.sign(payload, this._getJwtSecret(), {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || ACCESS_TOKEN_EXPIRY
    });
  }

  /**
   * Generate JWT refresh token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  static generateRefreshToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      type: 'refresh'
    };

    return jwt.sign(payload, this._getJwtSecret(), {
      expiresIn: process.env.JWT_REFRESH_EXPIRY || REFRESH_TOKEN_EXPIRY
    });
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded payload or null if invalid
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, this._getJwtSecret());
    } catch {
      return null;
    }
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - Plain text password
   * @param {string} userData.name - User name
   * @returns {Promise<Object>} Created user object
   */
  static async register(userData) {
    const { email, password, name } = userData;

    // Validate password strength
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // Check if email already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const password_hash = await this.hashPassword(password);

    // Create user with "pending" status (status_id = 1)
    const user = await User.create({
      email,
      password_hash,
      name,
      status_id: 1 // Pending approval
    });

    return user;
  }

  /**
   * Authenticate user and generate tokens
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Promise<Object>} { user, accessToken, refreshToken }
   */
  static async login(email, password) {
    // Find user with password hash
    const user = await User.findForAuth(email);

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Check if account is active
    if (!user.status.is_active) {
      if (user.status.slug === 'pending') {
        throw new Error('Account is pending approval. Please wait for administrator approval.');
      }
      throw new Error(`Account is ${user.status.slug}. Please contact support.`);
    }

    // Remove password hash from user object before returning
    delete user.password_hash;

    // Load user's roles and capabilities
    const roles = await User.getRoles(user.id);
    const capabilities = await User.getCapabilities(user.id);

    user.roles = roles;
    user.capabilities = capabilities;

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      user,
      accessToken,
      refreshToken
    };
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} { user, accessToken, refreshToken }
   */
  static async refreshAccessToken(refreshToken) {
    const payload = this.verifyToken(refreshToken);

    if (!payload || payload.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    // Get user from database
    const user = await User.findById(payload.id);

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.status.is_active) {
      throw new Error('Account is not active');
    }

    // Load user's roles and capabilities
    const roles = await User.getRoles(user.id);
    const capabilities = await User.getCapabilities(user.id);

    user.roles = roles;
    user.capabilities = capabilities;

    // Generate new tokens
    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken(user);

    return {
      user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  /**
   * Request password reset (generate token and store it)
   * @param {string} email - User email
   * @returns {Promise<string>} Reset token
   */
  static async requestPasswordReset(email) {
    const user = await User.findByEmail(email);

    if (!user) {
      // Don't reveal that email doesn't exist (security best practice)
      return null;
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY);

    // Store token in database
    const sql = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `;
    await db.query(sql, [user.id, token, expiresAt]);

    return { token, user };
  }

  /**
   * Reset password using token
   * @param {string} token - Reset token
   * @param {string} newPassword - New plain text password
   * @returns {Promise<boolean>} Success status
   */
  static async resetPassword(token, newPassword) {
    // Validate new password
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // Find valid token
    const sql = `
      SELECT * FROM password_reset_tokens
      WHERE token = ? AND expires_at > NOW() AND used_at IS NULL
    `;
    const rows = await db.query(sql, [token]);

    if (rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const resetToken = rows[0];

    // Hash new password
    const password_hash = await this.hashPassword(newPassword);

    // Update user password
    await User.updatePassword(resetToken.user_id, password_hash);

    // Mark token as used
    const updateSql = 'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?';
    await db.query(updateSql, [resetToken.id]);

    return true;
  }

  /**
   * Change user password (when logged in)
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success status
   */
  static async changePassword(userId, currentPassword, newPassword) {
    // Get user with password hash
    const user = await User.findForAuth(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await this.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    // Hash new password
    const password_hash = await this.hashPassword(newPassword);

    // Update password
    await User.updatePassword(userId, password_hash);

    return true;
  }

  /**
   * Get JWT secret from environment
   * @private
   */
  static _getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET environment variable not set');
    }

    return secret;
  }
}

module.exports = AuthService;

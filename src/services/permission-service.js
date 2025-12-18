/**
 * Permission Service
 * Handles authorization checks for roles and capabilities
 */

const User = require('../models/User');
// const Role = require('../models/Role'); // Future use

class PermissionService {
  /**
   * Check if user has a specific role
   * @param {number} userId - User ID
   * @param {string} roleSlug - Role slug
   * @returns {Promise<boolean>} True if user has role
   */
  static async hasRole(userId, roleSlug) {
    const roles = await User.getRoles(userId);
    return roles.some((role) => role.slug === roleSlug);
  }

  /**
   * Check if user has any of the specified roles
   * @param {number} userId - User ID
   * @param {string[]} roleSlugs - Array of role slugs
   * @returns {Promise<boolean>} True if user has any role
   */
  static async hasAnyRole(userId, roleSlugs) {
    const roles = await User.getRoles(userId);
    const userRoleSlugs = roles.map((role) => role.slug);
    return roleSlugs.some((slug) => userRoleSlugs.includes(slug));
  }

  /**
   * Check if user has a specific capability
   * @param {number} userId - User ID
   * @param {string} capabilitySlug - Capability slug
   * @returns {Promise<boolean>} True if user has capability
   */
  static async hasCapability(userId, capabilitySlug) {
    const capabilities = await User.getCapabilities(userId);
    return capabilities.includes(capabilitySlug);
  }

  /**
   * Check if user has any of the specified capabilities
   * @param {number} userId - User ID
   * @param {string[]} capabilitySlugs - Array of capability slugs
   * @returns {Promise<boolean>} True if user has any capability
   */
  static async hasAnyCapability(userId, capabilitySlugs) {
    const capabilities = await User.getCapabilities(userId);
    return capabilitySlugs.some((slug) => capabilities.includes(slug));
  }

  /**
   * Check if user has all specified capabilities
   * @param {number} userId - User ID
   * @param {string[]} capabilitySlugs - Array of capability slugs
   * @returns {Promise<boolean>} True if user has all capabilities
   */
  static async hasAllCapabilities(userId, capabilitySlugs) {
    const capabilities = await User.getCapabilities(userId);
    return capabilitySlugs.every((slug) => capabilities.includes(slug));
  }

  /**
   * Check if user is administrator
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if user is admin
   */
  static async isAdmin(userId) {
    return await this.hasRole(userId, 'administrator');
  }

  /**
   * Get user's full permission set (roles + capabilities)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} { roles: [], capabilities: [] }
   */
  static async getUserPermissions(userId) {
    const roles = await User.getRoles(userId);
    const capabilities = await User.getCapabilities(userId);

    return {
      roles: roles.map((role) => role.slug),
      capabilities
    };
  }

  /**
   * Check if user can access resource
   * Considers ownership and admin privileges
   * @param {number} userId - User ID
   * @param {string} resourceType - Type of resource (user, search, etc.)
   * @param {number} resourceOwnerId - ID of resource owner
   * @returns {Promise<boolean>} True if user can access
   */
  static async canAccessResource(userId, resourceType, resourceOwnerId) {
    // User can always access their own resources
    if (userId === resourceOwnerId) {
      return true;
    }

    // Admin can access all resources
    if (await this.isAdmin(userId)) {
      return true;
    }

    // Check for specific view-all capability
    const viewAllCapability = `${resourceType}:view-all`;
    if (await this.hasCapability(userId, viewAllCapability)) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can modify resource
   * Considers ownership and admin privileges
   * @param {number} userId - User ID
   * @param {string} resourceType - Type of resource
   * @param {number} resourceOwnerId - ID of resource owner
   * @returns {Promise<boolean>} True if user can modify
   */
  static async canModifyResource(userId, resourceType, resourceOwnerId) {
    // User can modify their own resources (if they have edit-own capability)
    if (userId === resourceOwnerId) {
      const editOwnCapability = `${resourceType}:edit-own`;
      return await this.hasCapability(userId, editOwnCapability);
    }

    // Admin can modify all resources
    if (await this.isAdmin(userId)) {
      return true;
    }

    // Check for specific manage-all capability
    const manageAllCapability = `${resourceType}:manage-all`;
    if (await this.hasCapability(userId, manageAllCapability)) {
      return true;
    }

    return false;
  }
}

module.exports = PermissionService;

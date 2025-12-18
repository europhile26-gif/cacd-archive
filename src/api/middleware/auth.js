/**
 * Authentication Middleware
 * Fastify middleware for JWT authentication and authorization
 */

const AuthService = require('../../services/auth-service');
const PermissionService = require('../../services/permission-service');
const User = require('../../models/User');

/**
 * Require authentication - Verify user is logged in
 * Extracts JWT from Authorization header or cookies
 * Attaches user object to request
 */
async function requireAuth(request, reply) {
  try {
    let token = null;

    // Try to get token from Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fallback to cookie
    if (!token && request.cookies && request.cookies.accessToken) {
      token = request.cookies.accessToken;
    }

    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No authentication token provided'
      });
    }

    // Verify token
    const payload = AuthService.verifyToken(token);

    if (!payload || payload.type !== 'access') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    // Get user from database
    const user = await User.findById(payload.id);

    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    // Check if account is active
    if (!user.status.is_active) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Account is ${user.status.slug}. Please contact support.`
      });
    }

    // Attach user to request
    request.user = user;
  } catch (error) {
    request.log.error({ error }, 'Authentication error');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed'
    });
  }
}

/**
 * Require specific role
 * Must be used after requireAuth
 * @param {string} roleSlug - Required role slug
 */
function requireRole(roleSlug) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const hasRole = await PermissionService.hasRole(request.user.id, roleSlug);

    if (!hasRole) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires ${roleSlug} role`
      });
    }
  };
}

/**
 * Require any of the specified roles
 * Must be used after requireAuth
 * @param {string[]} roleSlugs - Array of acceptable role slugs
 */
function requireAnyRole(roleSlugs) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const hasRole = await PermissionService.hasAnyRole(request.user.id, roleSlugs);

    if (!hasRole) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires one of: ${roleSlugs.join(', ')}`
      });
    }
  };
}

/**
 * Require specific capability
 * Must be used after requireAuth
 * @param {string} capabilitySlug - Required capability slug
 */
function requireCapability(capabilitySlug) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const hasCapability = await PermissionService.hasCapability(request.user.id, capabilitySlug);

    if (!hasCapability) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires ${capabilitySlug} capability`
      });
    }
  };
}

/**
 * Require any of the specified capabilities
 * Must be used after requireAuth
 * @param {string[]} capabilitySlugs - Array of acceptable capability slugs
 */
function requireAnyCapability(capabilitySlugs) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const hasCapability = await PermissionService.hasAnyCapability(
      request.user.id,
      capabilitySlugs
    );

    if (!hasCapability) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Requires one of: ${capabilitySlugs.join(', ')}`
      });
    }
  };
}

/**
 * Require administrator role
 * Shortcut for requireRole('administrator')
 */
function requireAdmin(request, reply) {
  return requireRole('administrator')(request, reply);
}

/**
 * Require account to be active
 * Used to double-check active status beyond JWT validation
 */
async function requireAccountActive(request, reply) {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'User not authenticated'
    });
  }

  // Refresh user data from database
  const user = await User.findById(request.user.id);

  if (!user || !user.status.is_active) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Account is not active'
    });
  }

  // Update request.user with fresh data
  request.user = user;
}

/**
 * Optional authentication
 * Extracts user if token present, but doesn't fail if not
 * Useful for endpoints that behave differently based on auth state
 */
async function optionalAuth(request, _reply) {
  try {
    let token = null;

    // Try to get token from Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fallback to cookie
    if (!token && request.cookies && request.cookies.accessToken) {
      token = request.cookies.accessToken;
    }

    if (!token) {
      // No token, continue without user
      return;
    }

    // Verify token
    const payload = AuthService.verifyToken(token);

    if (!payload || payload.type !== 'access') {
      // Invalid token, continue without user
      return;
    }

    // Get user from database
    const user = await User.findById(payload.id);

    if (user && user.status.is_active) {
      // Attach user to request
      request.user = user;
    }
  } catch (error) {
    // Ignore errors, just continue without user
    request.log.debug({ error }, 'Optional auth failed');
  }
}

module.exports = {
  requireAuth,
  requireRole,
  requireAnyRole,
  requireCapability,
  requireAnyCapability,
  requireAdmin,
  requireAccountActive,
  optionalAuth
};

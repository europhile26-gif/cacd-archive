/**
 * Authentication Middleware
 * Fastify middleware for authentication and authorization
 */

const AuthService = require('../../services/auth-service');
const PermissionService = require('../../services/permission-service');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// Outcomes of resolving a request's credentials
const CREDENTIALS_MISSING = 'missing';
const CREDENTIALS_INVALID = 'invalid';
const CREDENTIALS_INACTIVE = 'inactive';
const CREDENTIALS_VALID = 'valid';

// One resolution per request, shared by the rate limiter and the auth pre-handlers
const resolvedCredentials = new WeakMap();

/**
 * Reads the access token from the Authorization header, falling back to the cookie.
 */
function extractToken(request) {
  const authHeader = request.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (request.cookies && request.cookies.accessToken) {
    token = request.cookies.accessToken;
  }

  return token;
}

/**
 * Verifies the request's access token and loads its user.
 */
async function lookUpCredentials(request) {
  const token = extractToken(request);
  const credentials = { outcome: CREDENTIALS_MISSING, user: null, authMethod: null };

  if (token) {
    const payload = AuthService.verifyToken(token);
    const user = payload && payload.type === 'access' ? await User.findById(payload.id) : null;

    if (!user || !AuthService.isTokenCurrent(payload, user)) {
      credentials.outcome = CREDENTIALS_INVALID;
    } else {
      credentials.outcome = user.status.is_active ? CREDENTIALS_VALID : CREDENTIALS_INACTIVE;
      credentials.user = user;
      credentials.authMethod = 'jwt';
    }
  }

  return credentials;
}

/**
 * Resolves the request's credentials to { outcome, user, authMethod }, once per request.
 */
function resolveCredentials(request) {
  if (!resolvedCredentials.has(request)) {
    resolvedCredentials.set(request, lookUpCredentials(request));
  }

  return resolvedCredentials.get(request);
}

/**
 * Rejects the request unless it carries valid credentials for an active account.
 */
async function requireAuth(request, reply) {
  try {
    const { outcome, user } = await resolveCredentials(request);

    if (outcome === CREDENTIALS_MISSING) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No authentication token provided'
      });
    }

    if (outcome === CREDENTIALS_INVALID) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

    if (outcome === CREDENTIALS_INACTIVE) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Account is ${user.status.slug}. Please contact support.`
      });
    }

    request.user = user;
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
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
 * Attaches the user when the request carries valid credentials, and continues as a guest otherwise.
 */
async function optionalAuth(request, _reply) {
  try {
    const { outcome, user } = await resolveCredentials(request);

    if (outcome === CREDENTIALS_VALID) {
      request.user = user;
    }
  } catch (error) {
    // Continue as a guest, but an unexpected failure here is a fault worth seeing
    logger.warn('Optional auth failed', { error: error.message });
  }
}

module.exports = {
  CREDENTIALS_VALID,
  resolveCredentials,
  requireAuth,
  requireRole,
  requireAnyRole,
  requireCapability,
  requireAnyCapability,
  requireAdmin,
  requireAccountActive,
  optionalAuth
};

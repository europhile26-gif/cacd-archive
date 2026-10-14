/**
 * Authentication Routes
 * Handles user registration, login, logout, password reset
 */

const AuthService = require('../../services/auth-service');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const User = require('../../models/User');
const { requireAuth, requireCapability } = require('../middleware/auth');

/**
 * Sends a client-safe service error as-is; logs anything else and sends a generic 500.
 */
function sendServiceError(reply, error, context) {
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      error: error.statusCode === 401 ? 'Unauthorized' : 'Bad Request',
      message: error.message
    });
  }

  logger.error(context, { error: error.message, stack: error.stack });
  return reply.code(500).send({
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.'
  });
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production', // HTTPS only in production
  sameSite: 'strict',
  path: '/'
};

// Cookie lifetimes in seconds for a normal session and for "remember me"
const SESSION_LIFETIMES = {
  standard: { access: 15 * 60, refresh: 7 * 24 * 60 * 60 },
  remembered: { access: 7 * 24 * 60 * 60, refresh: 30 * 24 * 60 * 60 }
};

/**
 * Sets the access and refresh token cookies for a session.
 */
function setSessionCookies(reply, accessToken, refreshToken, lifetimes) {
  reply.setCookie('accessToken', accessToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: lifetimes.access
  });
  reply.setCookie('refreshToken', refreshToken, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: lifetimes.refresh
  });
}

// Route-level config gives these routes their own counter and excludes them from the
// signed-in exemption (see isRateLimitExempt in server.js).
const credentialRateLimit = {
  rateLimit: {
    max: config.api.authRateLimit.max,
    timeWindow: config.api.authRateLimit.timeWindow
  }
};

async function authRoutes(fastify, _options) {
  /**
   * POST /api/v1/auth/register
   * Register a new user account
   */
  fastify.post(
    '/register',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['Authentication'],
        description: 'Register a new user account',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password', 'name'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 12 },
            name: { type: 'string', minLength: 1 }
          }
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { email, password, name } = request.body;

        // Check if public registration is allowed
        if (!config.auth.allowPublicRegistration) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Public registration is currently disabled'
          });
        }

        // Register user
        const user = await AuthService.register({ email, password, name });

        logger.info('User registered', {
          userId: user.id,
          pendingApproval: config.auth.requireAdminApproval
        });

        return reply.code(201).send({
          success: true,
          message: config.auth.requireAdminApproval
            ? 'Account created. Please wait for administrator approval.'
            : 'Account created successfully.',
          user
        });
      } catch (error) {
        return sendServiceError(reply, error, 'Registration error');
      }
    }
  );

  /**
   * POST /api/v1/auth/login
   * Authenticate user and get tokens
   */
  fastify.post(
    '/login',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['Authentication'],
        description: 'Login with email and password',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            rememberMe: { type: 'boolean', default: false }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: { type: 'object' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { email, password, rememberMe } = request.body;

        // Authenticate user
        const { user, accessToken, refreshToken } = await AuthService.login(email, password);

        const lifetimes = rememberMe ? SESSION_LIFETIMES.remembered : SESSION_LIFETIMES.standard;
        setSessionCookies(reply, accessToken, refreshToken, lifetimes);

        // Non-httpOnly hint so client JS can skip /users/me for guests
        reply.setCookie('loggedIn', '1', {
          ...SESSION_COOKIE_OPTIONS,
          httpOnly: false,
          maxAge: lifetimes.refresh
        });

        logger.info('User logged in', { userId: user.id });

        return reply.send({
          success: true,
          user,
          accessToken,
          refreshToken
        });
      } catch (error) {
        return sendServiceError(reply, error, 'Login error');
      }
    }
  );

  /**
   * POST /api/v1/auth/logout
   * Logout user (clear cookies)
   */
  fastify.post(
    '/logout',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Logout current user',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      // Clear cookies
      reply.clearCookie('accessToken', { path: '/' });
      reply.clearCookie('refreshToken', { path: '/' });
      reply.clearCookie('loggedIn', { path: '/' });

      return reply.send({
        success: true,
        message: 'Logged out successfully'
      });
    }
  );

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using refresh token
   */
  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Refresh access token',
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            refreshToken: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // Get refresh token from body or cookie
        let refreshToken = request.body.refreshToken;

        if (!refreshToken && request.cookies && request.cookies.refreshToken) {
          refreshToken = request.cookies.refreshToken;
        }

        if (!refreshToken) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'No refresh token provided'
          });
        }

        // Refresh tokens
        const { accessToken, refreshToken: newRefreshToken } =
          await AuthService.refreshAccessToken(refreshToken);

        setSessionCookies(reply, accessToken, newRefreshToken, SESSION_LIFETIMES.standard);

        return reply.send({
          success: true,
          accessToken,
          refreshToken: newRefreshToken
        });
      } catch (error) {
        logger.debug('Token refresh rejected', { error: error.message });
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token'
        });
      }
    }
  );

  /**
   * POST /api/v1/auth/forgot-password
   * Request password reset
   */
  fastify.post(
    '/forgot-password',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['Authentication'],
        description: 'Request password reset email',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { email } = request.body;

        const result = await AuthService.requestPasswordReset(email);

        // The reset token must never be logged: it grants control of the account.
        if (result) {
          logger.warn('Password reset requested, but reset emails are not implemented', {
            userId: result.user.id
          });
        }

        // Always return success (don't reveal if email exists)
        return reply.send({
          success: true,
          message: 'If an account exists with that email, a password reset link has been sent.'
        });
      } catch (error) {
        logger.error('Forgot password error', { error: error.message });
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to process password reset request'
        });
      }
    }
  );

  /**
   * POST /api/v1/auth/reset-password
   * Reset password using token
   */
  fastify.post(
    '/reset-password',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['Authentication'],
        description: 'Reset password with token',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'password'],
          properties: {
            token: { type: 'string' },
            password: { type: 'string', minLength: 12 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { token, password } = request.body;

        await AuthService.resetPassword(token, password);

        return reply.send({
          success: true,
          message: 'Password reset successfully. You can now log in with your new password.'
        });
      } catch (error) {
        return sendServiceError(reply, error, 'Password reset error');
      }
    }
  );

  /**
   * POST /api/v1/auth/change-password
   * Change password (requires authentication)
   */
  fastify.post(
    '/change-password',
    {
      config: credentialRateLimit,
      preHandler: [requireAuth, requireCapability('profile:change-password')],
      schema: {
        tags: ['Authentication'],
        description: 'Change password (requires authentication)',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 12 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { currentPassword, newPassword } = request.body;

        await AuthService.changePassword(request.user.id, currentPassword, newPassword);

        // The change revoked every session, including this one; issue it fresh tokens
        const user = await User.findById(request.user.id);
        setSessionCookies(
          reply,
          AuthService.generateAccessToken(user),
          AuthService.generateRefreshToken(user),
          SESSION_LIFETIMES.standard
        );

        return reply.send({
          success: true,
          message: 'Password changed successfully'
        });
      } catch (error) {
        return sendServiceError(reply, error, 'Change password error');
      }
    }
  );
}

module.exports = authRoutes;

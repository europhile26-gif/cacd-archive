/**
 * Authentication Routes
 * Handles user registration, login, logout, password reset
 */

const AuthService = require('../../services/auth-service');
const User = require('../../models/User');
// const emailService = require('../../services/email-service'); // TODO: Enable when email implemented
const { requireAuth } = require('../middleware/auth');

async function authRoutes(fastify, _options) {
  /**
   * POST /api/v1/auth/register
   * Register a new user account
   */
  fastify.post(
    '/register',
    {
      schema: {
        tags: ['Authentication'],
        description: 'Register a new user account',
        body: {
          type: 'object',
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
        const allowPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION !== 'false';
        if (!allowPublicRegistration) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'Public registration is currently disabled'
          });
        }

        // Register user
        const user = await AuthService.register({ email, password, name });

        // Send welcome email (account pending approval)
        const requiresApproval = process.env.REQUIRE_ADMIN_APPROVAL !== 'false';
        if (requiresApproval) {
          try {
            // TODO: Implement welcome email template
            fastify.log.info({ email: user.email }, 'User registered, pending approval');
          } catch (emailError) {
            fastify.log.error({ error: emailError }, 'Failed to send welcome email');
          }
        }

        return reply.code(201).send({
          success: true,
          message: requiresApproval
            ? 'Account created. Please wait for administrator approval.'
            : 'Account created successfully.',
          user
        });
      } catch (error) {
        fastify.log.error({ error }, 'Registration error');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
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
      schema: {
        tags: ['Authentication'],
        description: 'Login with email and password',
        body: {
          type: 'object',
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

        // Set httpOnly cookies
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production', // HTTPS only in production
          sameSite: 'strict',
          path: '/'
        };

        reply.setCookie('accessToken', accessToken, {
          ...cookieOptions,
          maxAge: rememberMe ? 7 * 24 * 60 * 60 : 15 * 60 // 7 days or 15 min
        });

        reply.setCookie('refreshToken', refreshToken, {
          ...cookieOptions,
          maxAge: rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60 // 30 days or 7 days
        });

        fastify.log.info({ userId: user.id, email: user.email }, 'User logged in');

        return reply.send({
          success: true,
          user,
          accessToken,
          refreshToken
        });
      } catch (error) {
        fastify.log.error({ error }, 'Login error');
        return reply.code(401).send({
          error: 'Unauthorized',
          message: error.message
        });
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

      fastify.log.info('User logged out');

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

        // Update cookies
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/'
        };

        reply.setCookie('accessToken', accessToken, {
          ...cookieOptions,
          maxAge: 15 * 60 // 15 minutes
        });

        reply.setCookie('refreshToken', newRefreshToken, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 // 7 days
        });

        return reply.send({
          success: true,
          accessToken,
          refreshToken: newRefreshToken
        });
      } catch (error) {
        fastify.log.error({ error }, 'Token refresh error');
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
      schema: {
        tags: ['Authentication'],
        description: 'Request password reset email',
        body: {
          type: 'object',
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

        if (result) {
          const { token } = result;

          // Send password reset email
          const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

          try {
            // TODO: Implement password reset email template
            fastify.log.info({ email, resetUrl }, 'Password reset requested');
          } catch (emailError) {
            fastify.log.error({ error: emailError }, 'Failed to send password reset email');
          }
        }

        // Always return success (don't reveal if email exists)
        return reply.send({
          success: true,
          message: 'If an account exists with that email, a password reset link has been sent.'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Forgot password error');
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
      schema: {
        tags: ['Authentication'],
        description: 'Reset password with token',
        body: {
          type: 'object',
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
        fastify.log.error({ error }, 'Password reset error');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
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
      preHandler: requireAuth,
      schema: {
        tags: ['Authentication'],
        description: 'Change password (requires authentication)',
        body: {
          type: 'object',
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

        return reply.send({
          success: true,
          message: 'Password changed successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Change password error');
        return reply.code(400).send({
          error: 'Bad Request',
          message: error.message
        });
      }
    }
  );

  /**
   * GET /api/v1/auth/me
   * Get current user profile
   */
  fastify.get(
    '/me',
    {
      preHandler: requireAuth,
      schema: {
        tags: ['Authentication'],
        description: 'Get current user profile'
      }
    },
    async (request, reply) => {
      try {
        const roles = await User.getRoles(request.user.id);
        const capabilities = await User.getCapabilities(request.user.id);

        // Build navigation based on roles
        const navigation = [];
        const isAdmin = roles.some((role) => role.slug === 'administrator');

        navigation.push({ label: 'Home', url: '/', icon: 'house' });

        if (isAdmin) {
          navigation.push({ label: 'Admin', url: '/admin', icon: 'shield' });
        }

        navigation.push({ label: 'Dashboard', url: '/dashboard', icon: 'speedometer2' });
        navigation.push({ label: 'Logout', url: '#', action: 'logout', icon: 'box-arrow-right' });

        return reply.send({
          user: request.user,
          roles,
          capabilities,
          navigation
        });
      } catch (error) {
        fastify.log.error({ error }, 'Get current user error');
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user profile'
        });
      }
    }
  );
}

module.exports = authRoutes;

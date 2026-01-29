const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUI = require('@fastify/swagger-ui');
const fastifyCors = require('@fastify/cors');
const fastifyHelmet = require('@fastify/helmet');
const fastifyCookie = require('@fastify/cookie');
const path = require('path');
const config = require('../config/config');
const AuthService = require('../services/auth-service');

async function createServer() {
  const server = fastify({
    logger: false, // Disable Fastify's built-in logger
    disableRequestLogging: true,
    trustProxy: true // Enable if behind nginx/proxy
  });

  // Cookie support (required for JWT in cookies)
  await server.register(fastifyCookie, {
    secret: process.env.JWT_SECRET || 'your-cookie-secret-here',
    parseOptions: {}
  });

  // Security headers with Helmet
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:'],
        fontSrc: ['\'self\''],
        connectSrc: ['\'self\'']
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  // CORS - configure based on environment
  const corsOptions = config.api.cors.enabled
    ? {
      origin:
          config.env === 'production' && config.api.cors.origins.length > 0
            ? config.api.cors.origins
            : true,
      credentials: true
    }
    : false;

  if (corsOptions !== false) {
    await server.register(fastifyCors, corsOptions);
  }

  // Swagger documentation
  await server.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'CACD Archive API',
        description: 'Court of Appeal Criminal Division Daily Cause List Archive',
        version: '2.0.0'
      },
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'hearings', description: 'Hearing-related endpoints' },
        { name: 'system', description: 'System and health endpoints' },
        { name: 'Config', description: 'Configuration endpoints' },
        { name: 'Authentication', description: 'User authentication and registration' },
        { name: 'Users', description: 'User profile management' },
        { name: 'Admin', description: 'Administrative user management' }
      ]
    }
  });

  await server.register(fastifySwaggerUI, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    },
    staticCSP: true
  });

  // Register API routes FIRST (most specific)
  // Apply rate limiting only to API routes
  await server.register(
    async (apiServer) => {
      // Rate limiting for API routes - skip for authenticated users
      await apiServer.register(fastifyRateLimit, {
        max: config.api.rateLimit.max,
        timeWindow: config.api.rateLimit.timeWindow,
        skip: (request) => {
          // Skip rate limiting for authenticated users
          try {
            let token = null;

            // Try Authorization header
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              token = authHeader.substring(7);
            }

            // Fallback to cookie
            if (!token && request.cookies?.accessToken) {
              token = request.cookies.accessToken;
            }

            if (!token) {
              return false; // No token, apply rate limiting
            }

            // Verify token
            const payload = AuthService.verifyToken(token);

            // Valid access token - skip rate limiting
            return payload && payload.type === 'access';
          } catch {
            // Token invalid/expired - apply rate limiting
            return false;
          }
        }
      });

      // Register API routes
      await apiServer.register(require('./routes/health'), { prefix: '/api/v1' });
      await apiServer.register(require('./routes/hearings'), { prefix: '/api/v1' });
      await apiServer.register(require('./routes/config'));
      await apiServer.register(require('./routes/auth'), { prefix: '/api/v1/auth' });
      await apiServer.register(require('./routes/users'), { prefix: '/api/v1/users' });
      await apiServer.register(require('./routes/admin'), { prefix: '/api/v1/admin' });
      await apiServer.register(require('./routes/searches'), { prefix: '/api/v1' });
    },
    { prefix: '' }
  );

  // Register frontend routes (clean URLs) BEFORE static files - NO rate limiting
  await server.register(require('./routes/frontend'));

  // Serve Bootstrap from node_modules
  await server.register(fastifyStatic, {
    root: path.join(__dirname, '../../node_modules/bootstrap/dist'),
    prefix: '/vendor/bootstrap/',
    decorateReply: false
  });

  // Serve Bootstrap Icons from node_modules
  await server.register(fastifyStatic, {
    root: path.join(__dirname, '../../node_modules/bootstrap-icons/font'),
    prefix: '/vendor/bootstrap-icons/',
    decorateReply: false
  });

  // Serve static files LAST (fallback for everything else)
  const staticDir =
    config.env === 'production'
      ? path.join(__dirname, '../../dist')
      : path.join(__dirname, '../../public');

  await server.register(fastifyStatic, {
    root: staticDir,
    prefix: '/'
  });

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    console.error('API Error:', {
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack
    });

    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;

    reply.status(statusCode).send({
      success: false,
      error: message
    });
  });

  return server;
}

module.exports = { createServer };

const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUI = require('@fastify/swagger-ui');
const fastifyCors = require('@fastify/cors');
const fastifyHelmet = require('@fastify/helmet');
const path = require('path');
const config = require('../config/config');

async function createServer() {
  const server = fastify({
    logger: false, // Disable Fastify's built-in logger
    disableRequestLogging: true,
    trustProxy: true // Enable if behind nginx/proxy
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

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: config.api.rateLimit.max,
    timeWindow: config.api.rateLimit.timeWindow
  });

  // Swagger documentation
  await server.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'CACD Archive API',
        description: 'Court of Appeal Criminal Division Daily Cause List Archive',
        version: '1.5.0'
      },
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'hearings', description: 'Hearing-related endpoints' },
        { name: 'system', description: 'System and health endpoints' },
        { name: 'Config', description: 'Configuration endpoints' }
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

  // Serve static files
  const staticDir =
    config.env === 'production'
      ? path.join(__dirname, '../../dist')
      : path.join(__dirname, '../../public');

  await server.register(fastifyStatic, {
    root: staticDir,
    prefix: '/'
  });

  // Serve Bootstrap from node_modules
  await server.register(fastifyStatic, {
    root: path.join(__dirname, '../../node_modules/bootstrap/dist'),
    prefix: '/vendor/bootstrap/',
    decorateReply: false
  });

  // Register routes
  await server.register(require('./routes/health'), { prefix: '/api/v1' });
  await server.register(require('./routes/hearings'), { prefix: '/api/v1' });
  await server.register(require('./routes/config'));

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

  // 404 handler for API routes
  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.status(404).send({
        success: false,
        error: 'Not Found'
      });
    } else {
      // Let static file handler deal with it
      reply.callNotFound();
    }
  });

  return server;
}

module.exports = { createServer };

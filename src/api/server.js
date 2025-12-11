const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUI = require('@fastify/swagger-ui');
const fastifyCors = require('@fastify/cors');
const path = require('path');
const config = require('../config/config');

async function createServer() {
  const server = fastify({
    logger: false, // Disable Fastify's built-in logger
    disableRequestLogging: true
  });

  // CORS
  await server.register(fastifyCors, {
    origin: true
  });

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
        version: '1.0.0'
      },
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'hearings', description: 'Hearing-related endpoints' },
        { name: 'system', description: 'System and health endpoints' }
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

  // Register routes
  await server.register(require('./routes/health'), { prefix: '/api/v1' });
  await server.register(require('./routes/hearings'), { prefix: '/api/v1' });

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

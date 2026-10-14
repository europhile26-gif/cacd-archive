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
const logger = require('../utils/logger');
const { resolveCredentials, CREDENTIALS_VALID } = require('./middleware/auth');
const analyticsService = require('../services/analytics-service');
const geoipService = require('../services/geoip-service');
const { createRedisClient, waitForFirstConnection } = require('../config/redis');
const { version } = require('../../package.json');

// Prefix for rate-limit counters in Redis
const RATE_LIMIT_NAMESPACE = 'cacd-archive:rate-limit:';

/**
 * Resolves the trustProxy value passed to Fastify, warning on the insecure setting.
 */
function resolveTrustProxy() {
  const trustedProxies = config.api.trustedProxies.trim();

  if (trustedProxies === 'true') {
    logger.warn(
      'TRUSTED_PROXIES=true trusts every hop in X-Forwarded-For, so any client can forge ' +
        'its own IP address. Set it to your reverse proxy address instead (e.g. "loopback").'
    );
    return true;
  }

  return trustedProxies;
}

/**
 * Registers the country blocklist and request-logging hooks.
 * Both are no-ops unless analytics or a blocklist is configured, so the hooks are
 * only attached when they have work to do.
 */
async function registerAnalytics(server) {
  const blocklistActive = geoipService.hasBlocklist();

  if (!config.analytics.enabled && !blocklistActive) {
    return;
  }

  await geoipService.initialize();

  if (blocklistActive) {
    // Runs before auth and rate limiting so blocked traffic costs as little as possible.
    server.addHook('onRequest', async (request, reply) => {
      const countryCode = geoipService.lookupCountry(request.ip);

      if (geoipService.isBlockedCountry(countryCode)) {
        request.blockedByCountry = countryCode;
        await reply.status(403).send({ success: false, error: 'Forbidden' });
      }
    });
  }

  if (config.analytics.enabled) {
    analyticsService.start();

    server.addHook('onResponse', async (request, reply) => {
      const pathname = request.url.split('?')[0];
      const route = analyticsService.resolveRoute(request.routeOptions?.url, pathname);

      // Honouring DNT is cheap and worth being able to point at.
      const doNotTrack = config.analytics.respectDoNotTrack && request.headers.dnt === '1';

      if (
        doNotTrack ||
        analyticsService.isExcludedRoute(route) ||
        analyticsService.isAssetPath(pathname)
      ) {
        return;
      }

      const userAgent = request.headers['user-agent'] || null;
      const { asn, organisation } = geoipService.lookupAsn(request.ip);

      analyticsService.logRequest({
        ip: request.ip || null,
        method: request.method,
        route: route.slice(0, 255),
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime || 0),
        user_agent: userAgent ? userAgent.slice(0, 500) : null,
        country_code: request.blockedByCountry || geoipService.lookupCountry(request.ip),
        asn,
        asn_org: organisation ? organisation.slice(0, 255) : null,
        fingerprint: analyticsService.buildFingerprint(request.ip, userAgent),
        user_id: request.user?.id || null,
        created_at: new Date()
      });
    });
  }
}

/**
 * Resolves CORS options; production only ever allows explicitly listed origins.
 */
function resolveCorsOptions() {
  const { enabled, origins } = config.api.cors;
  let corsOptions = false;

  if (enabled && origins.length > 0) {
    corsOptions = { origin: origins, credentials: true };
  } else if (enabled && config.env !== 'production') {
    // Reflects any origin, which is only acceptable for local development.
    corsOptions = { origin: true, credentials: true };
  } else if (enabled) {
    logger.warn(
      'CORS_ENABLED=true but CORS_ALLOWED_ORIGINS is empty; cross-origin requests are disabled. ' +
        'The site itself is same-origin and needs no CORS.'
    );
  }

  return corsOptions;
}

/**
 * Exempts signed-in sessions from the general API rate limit, except on credential routes.
 */
async function isRateLimitExempt(request) {
  let exempt = false;

  if (!request.routeOptions.config?.rateLimit) {
    try {
      const { outcome } = await resolveCredentials(request);
      exempt = outcome === CREDENTIALS_VALID;
    } catch (error) {
      logger.error('Rate limit credentials check failed', { error: error.message });
    }
  }

  return exempt;
}

/**
 * Builds the general rate-limit options, counting in Redis when REDIS_URL is set.
 */
async function resolveRateLimitOptions(server) {
  const options = {
    max: config.api.rateLimit.max,
    timeWindow: config.api.rateLimit.timeWindow,
    allowList: isRateLimitExempt
  };

  if (config.redis.url) {
    const redis = createRedisClient(config.redis.url, 'rate limiting');
    server.addHook('onClose', async () => redis.disconnect());
    // Commands sent before the connection is up are not queued, so their requests go uncounted
    await waitForFirstConnection(redis);
    // skipOnError lets requests through while Redis is down; the client logs the outage
    Object.assign(options, { redis, nameSpace: RATE_LIMIT_NAMESPACE, skipOnError: true });
  } else if (config.env === 'production') {
    logger.warn(
      'REDIS_URL is not set; rate limits are counted per process, so under PM2 cluster mode ' +
        'each instance allows the full limit.'
    );
  }

  return options;
}

/**
 * Logs server errors and replies without exposing their messages to the client.
 */
function handleError(error, request, reply) {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  // Query strings can carry search terms, so only the path is logged.
  const details = {
    method: request.method,
    path: request.url.split('?')[0],
    statusCode,
    error: error.message
  };

  if (statusCode >= 500) {
    logger.error('Unhandled API error', { ...details, stack: error.stack });
  } else {
    logger.debug('API request rejected', details);
  }

  reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal Server Error' : error.message
  });
}

async function createServer() {
  const server = fastify({
    logger: false, // Disable Fastify's built-in logger
    disableRequestLogging: true,
    trustProxy: resolveTrustProxy()
  });

  // Must be set before any plugin registers: child contexts copy the handler when created.
  server.setErrorHandler(handleError);

  await registerAnalytics(server);

  // Cookie support (required for JWT in cookies)
  await server.register(fastifyCookie, {
    secret: config.auth.cookieSecret,
    parseOptions: {}
  });

  // Security headers with Helmet
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  });

  const corsOptions = resolveCorsOptions();

  if (corsOptions !== false) {
    await server.register(fastifyCors, corsOptions);
  }

  // Swagger documentation
  await server.register(fastifySwagger, {
    swagger: {
      info: {
        title: 'CACD Archive API',
        description: 'Court of Appeal Criminal Division Daily Cause List Archive',
        version
      },
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Hearings', description: 'Hearing data and dates' },
        { name: 'Saved Searches', description: 'User saved search management' },
        { name: 'Authentication', description: 'User authentication and registration' },
        { name: 'Users', description: 'User profile management' },
        { name: 'Admin', description: 'Administrative user management' },
        { name: 'Analytics', description: 'Request analytics (system:analytics capability)' },
        { name: 'System', description: 'Health check and configuration' }
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
      // allowList is the plugin's exemption hook; it has no 'skip' option.
      await apiServer.register(fastifyRateLimit, await resolveRateLimitOptions(apiServer));

      // Register API routes
      await apiServer.register(require('./routes/health'), { prefix: '/api/v1' });
      await apiServer.register(require('./routes/hearings'), { prefix: '/api/v1' });
      await apiServer.register(require('./routes/config'), { prefix: '/api/v1' });
      await apiServer.register(require('./routes/auth'), { prefix: '/api/v1/auth' });
      await apiServer.register(require('./routes/users'), { prefix: '/api/v1/users' });
      await apiServer.register(require('./routes/admin'), { prefix: '/api/v1/admin' });
      await apiServer.register(require('./routes/analytics'), {
        prefix: '/api/v1/admin/analytics'
      });
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

  return server;
}

module.exports = { createServer, resolveCorsOptions, RATE_LIMIT_NAMESPACE };

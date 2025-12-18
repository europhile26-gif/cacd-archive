const path = require('path');
const fs = require('fs').promises;
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * Frontend routes with clean URLs and authentication
 */
async function frontendRoutes(fastify, _options) {
  const publicDir =
    process.env.NODE_ENV === 'production'
      ? path.join(__dirname, '../../../dist')
      : path.join(__dirname, '../../../public');

  // Helper to serve HTML files
  const serveHTML = async (filename) => {
    try {
      const filePath = path.join(publicDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read ${filename}: ${error.message}`);
    }
  };

  // Redirect .html extensions to clean URLs
  const redirects = ['index', 'login', 'register', 'reset-password', 'dashboard', 'admin'];
  redirects.forEach((page) => {
    fastify.get(`/${page}.html`, async (request, reply) => {
      const target = page === 'index' ? '/' : `/${page}`;
      return reply.redirect(301, target);
    });
  });

  // Public routes
  fastify.get('/login', async (request, reply) => {
    const html = await serveHTML('login.html');
    reply.type('text/html').send(html);
  });

  fastify.get('/register', async (request, reply) => {
    const html = await serveHTML('register.html');
    reply.type('text/html').send(html);
  });

  fastify.get('/reset-password', async (request, reply) => {
    const html = await serveHTML('reset-password.html');
    reply.type('text/html').send(html);
  });

  // Protected route - requires authentication
  fastify.get(
    '/dashboard',
    {
      preHandler: requireAuth
    },
    async (request, reply) => {
      const html = await serveHTML('dashboard.html');
      reply.type('text/html').send(html);
    }
  );

  // Protected route - requires admin role
  fastify.get(
    '/admin',
    {
      preHandler: [requireAuth, requireRole('administrator')]
    },
    async (request, reply) => {
      const html = await serveHTML('admin.html');
      reply.type('text/html').send(html);
    }
  );
}

module.exports = frontendRoutes;

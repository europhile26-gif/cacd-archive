/**
 * Shared response schemas for user objects.
 * Fastify serialises only the listed properties, so these double as an output allowlist.
 */

const roleSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: ['string', 'null'] }
  }
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    email: { type: 'string' },
    name: { type: 'string' },
    status: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        slug: { type: 'string' },
        is_active: { type: 'boolean' }
      }
    },
    email_notifications_enabled: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    roles: { type: 'array', items: roleSchema },
    capabilities: { type: 'array', items: { type: 'string' } }
  }
};

module.exports = {
  roleSchema,
  userSchema
};

-- Migration 014: Analytics capability
-- Gates the /analytics page and its endpoints. Granted to the administrator role
-- only; the request log contains IP addresses and pseudo-session fingerprints, so
-- access is deliberately narrower than the general admin surface.

INSERT INTO capabilities (name, slug, description, category)
SELECT 'View Analytics', 'system:analytics', 'View request analytics and traffic data', 'system'
WHERE NOT EXISTS (SELECT 1 FROM capabilities WHERE slug = 'system:analytics');

INSERT INTO role_capabilities (role_id, capability_id)
SELECT 1, c.id
FROM capabilities c
WHERE c.slug = 'system:analytics'
  AND NOT EXISTS (
    SELECT 1 FROM role_capabilities rc WHERE rc.role_id = 1 AND rc.capability_id = c.id
  );

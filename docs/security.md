# Security Hardening

## Overview

CACD Archive implements multiple layers of security to protect against common web vulnerabilities and attacks.

## Security Features

### 1. HTTP Security Headers (Helmet)

The application uses `@fastify/helmet` to set secure HTTP headers:

- **Content Security Policy (CSP)**: Restricts resource loading to trusted sources
  - Default: self-hosted only
  - Bootstrap 5 CDN: Allowed for styles, scripts, and fonts
  - Inline styles: Allowed for Bootstrap compatibility
- **Strict-Transport-Security (HSTS)**: Forces HTTPS connections
  - Max-age: 1 year
  - Includes subdomains
  - Preload-ready

- **X-Frame-Options**: Prevents clickjacking (SAMEORIGIN)
- **X-Content-Type-Options**: Prevents MIME-sniffing (nosniff)
- **X-XSS-Protection**: Legacy XSS protection header
- **Referrer-Policy**: No referrer information sent
- **Cross-Origin Policies**: Strict cross-origin isolation

### 2. Rate Limiting

API endpoints are protected with rate limiting:

- **Default**: 100 requests per 15 minutes per IP
- **Configurable** via `API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW`
- Prevents brute force attacks and API abuse

### 3. CORS Configuration

Cross-Origin Resource Sharing is configurable per environment:

- **Development**: CORS enabled for all origins
- **Production**: Configure specific allowed origins via `CORS_ALLOWED_ORIGINS`
- **Disable**: Set `CORS_ENABLED=false` for same-origin only

### 4. Database Security

- **Parameterized Queries**: All database queries use parameter binding
- **Connection Pooling**: Limited connections (default: 10)
- **Timezone**: UTC storage prevents timezone-based attacks

### 5. Email Security

- **STARTTLS**: Encrypted SMTP connections on port 587
- **Authentication**: Required for email sending
- **Template Sanitization**: Handlebars escapes output by default

### 6. Input Validation

- **JSON Schema Validation**: All API inputs validated via Fastify schemas
- **Type Coercion**: Strict type checking on query parameters
- **SQL Injection Prevention**: Parameterized queries throughout

## Configuration

### Environment Variables

```bash
# Rate Limiting
API_RATE_LIMIT_MAX=100              # Max requests per window
API_RATE_LIMIT_WINDOW=900000        # Window in milliseconds (15 min)

# CORS
CORS_ENABLED=true                   # Enable/disable CORS
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

### Production Recommendations

1. **Enable HTTPS**: Run behind nginx/caddy with TLS certificates
2. **Configure CORS**: Set specific allowed origins, don't use wildcards
3. **Restrict Rate Limits**: Lower limits for public APIs (50-100 req/15min)
4. **Database**: Use strong passwords, restrict network access
5. **Firewall**: Only expose ports 80/443, block direct database access
6. **Updates**: Keep dependencies updated (`npm audit`, `npm update`)

### Reverse Proxy Configuration

When running behind Apache/nginx/Caddy:

1. Set `TRUSTED_PROXIES` in `.env` to the address of your reverse proxy — **not** `true`
2. Ensure the proxy passes the correct headers:
   - `X-Forwarded-For`
   - `X-Forwarded-Proto`
   - `X-Forwarded-Host`

### Why `TRUSTED_PROXIES` matters

`request.ip` is resolved from `X-Forwarded-For`, and both Apache and nginx **append** the real
peer address to whatever the client already sent. A request from a client that supplies its own
header therefore arrives as:

```
X-Forwarded-For: 9.9.9.9, 203.0.113.9
                 ^ forged  ^ real client, added by the proxy
```

Fastify walks that list right-to-left and stops at the first address not in `TRUSTED_PROXIES`,
which yields the real client. Setting it to `true` instead trusts every hop and returns the
leftmost — the value the client controls — letting anyone forge their IP and so evade
per-IP rate limiting. Set it to your proxy's address:

| Deployment                | Value                    |
| ------------------------- | ------------------------ |
| Proxy on the same host    | `loopback` (the default) |
| Proxy on another host     | `10.0.0.0/8` or its IP   |
| Proxy plus a CDN in front | `loopback,<cdn ranges>`  |

A hop count (`TRUSTED_PROXIES=1`) is rejected at startup. Fastify 5 fails closed on numeric
values because a hop count cannot validate the immediate peer, so `request.ip` would silently
resolve to the proxy's own address rather than the client's.

Example Apache config (`mod_proxy`, which sets `X-Forwarded-For` automatically):

```apache
<VirtualHost *:443>
    ServerName cacd-archive.example.com

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # Belt and braces: drop any client-supplied value so the header contains only
    # what Apache itself adds. TRUSTED_PROXIES already handles this, but stripping
    # at the edge means a misconfigured app never sees a forged value at all.
    RequestHeader unset X-Forwarded-For
</VirtualHost>
```

Example nginx config:

```nginx
location / {
    proxy_pass http://localhost:3008;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Security Checklist

- [x] HTTP security headers (Helmet)
- [x] Rate limiting on API endpoints
- [x] CORS configuration
- [x] Parameterized database queries
- [x] Input validation with JSON schemas
- [x] Email encryption (STARTTLS)
- [x] Trust proxy configuration
- [x] Error message sanitization (no stack traces to clients)
- [ ] Regular dependency updates
- [ ] Security audit logging
- [ ] Intrusion detection
- [ ] DDoS protection (use Cloudflare/AWS Shield)

## Vulnerability Reporting

If you discover a security vulnerability, please email security issues to the maintainer privately rather than using public issue tracker.

## Regular Maintenance

1. **Weekly**: Check `npm audit` for vulnerabilities
2. **Monthly**: Update dependencies (`npm update`)
3. **Quarterly**: Review access logs for suspicious activity
4. **Annual**: Full security audit

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Fastify Security Best Practices](https://www.fastify.io/docs/latest/Guides/Recommendations/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

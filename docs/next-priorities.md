# Next Priorities

## Todo Next - Priority

### 1. Custom 404/Error Pages
**Priority:** Medium  
**Effort:** 5 minutes  
**Description:** Add custom error pages for better UX when users hit invalid routes or encounter errors. Currently shows default Fastify error responses.

**Tasks:**
- Create `public/404.html` and `public/500.html`
- Update error handler in `src/api/server.js` to serve custom pages
- Style consistently with existing UI

### 2. Enhanced Health Check Endpoint
**Priority:** Medium  
**Effort:** 10 minutes  
**Description:** Expand `/api/v1/health` endpoint to include more comprehensive checks for production monitoring.

**Current:** Basic "API is running" response  
**Enhance with:**
- Database connectivity check (connection pool status)
- Email service status (SMTP reachable)
- Last successful scrape timestamp
- Disk space/memory usage (optional)

### 3. Email Templates for Authentication
**Priority:** Medium  
**Effort:** 30 minutes  
**Description:** Complete the TODO items for authentication email templates.

**Missing templates:**
- Welcome email (when user registers)
- Account approval email (when admin approves account)
- Password reset email (with secure token link)

**Files to update:**
- `src/api/routes/auth.js` (lines 71, 327)
- `src/api/routes/admin.js` (line 110)
- `src/cli/commands/users.js` (line 241)
- Create Handlebars templates in `src/templates/emails/`

### 4. Process Management Configuration
**Priority:** High (for production)  
**Effort:** 15 minutes  
**Description:** Add PM2 configuration for production process management with clustering and auto-restart.

**Tasks:**
- Create `ecosystem.config.js` with PM2 settings
- Configure multiple instances (cluster mode)
- Set up auto-restart on crashes
- Add memory limits and log rotation
- Document PM2 commands in README

**Note:** `docs/pm2-deployment.md` exists - may need updating for current architecture

### 5. Nginx Reverse Proxy Configuration
**Priority:** High (for staging/production)  
**Effort:** 10 minutes  
**Description:** Create nginx configuration template for reverse proxy deployment.

**Tasks:**
- Create `nginx.conf.example` with:
  - SSL/TLS configuration
  - Proxy headers (X-Forwarded-For, etc.)
  - Static asset caching rules
  - Rate limiting (complement Fastify rate limiting)
  - Gzip compression
- Document setup in deployment guide

### 6. Verify .gitignore Coverage
**Priority:** Low  
**Effort:** 2 minutes  
**Description:** Ensure sensitive files are properly excluded from version control.

**Check includes:**
- `.env` (likely already included)
- `dist/` (build artifacts)
- `*.log` files
- Database dumps
- PM2 logs

### 7. Database Indexes Review
**Priority:** Low (optimization)  
**Effort:** 20 minutes  
**Description:** Review database indexes for saved searches queries and notification lookups.

**Tables to review:**
- `saved_searches` - may benefit from composite index on (user_id, enabled)
- `search_notifications` - composite index on (user_id, sent_at)
- `hearings` - verify FULLTEXT index performance for MATCH...AGAINST queries

### 8. API Response Compression
**Priority:** Low  
**Effort:** 5 minutes  
**Description:** Add `@fastify/compress` middleware to reduce API response sizes.

**Benefits:**
- Faster response times for large result sets
- Reduced bandwidth usage
- Especially helpful for hearings list endpoint

### 9. Security Headers Audit
**Priority:** Medium  
**Effort:** 10 minutes  
**Description:** Review and strengthen CSP and other security headers.

**Current:** Basic Helmet configuration  
**Review:**
- Tighten CSP directives (remove `unsafe-inline` if possible)
- Add Referrer-Policy
- Add Permissions-Policy
- Document security posture in `docs/security.md`

### 10. Logging Strategy
**Priority:** Medium (for production debugging)  
**Effort:** 15 minutes  
**Description:** Implement structured logging with different levels for dev/staging/production.

**Current:** Mix of console.log and logger calls  
**Improve:**
- Standardize on winston or pino logger
- Add request ID tracking
- JSON logs for production (easier parsing)
- Log rotation configuration
- Centralized error tracking (Sentry integration?)

## Completed
- ✅ Saved Searches feature with email notifications
- ✅ Build process with minification for all assets
- ✅ Bootstrap Icons self-hosted (CSP compliant)
- ✅ JWT auto-refresh for better UX
- ✅ Email template cleanup (single BASE_URL link)

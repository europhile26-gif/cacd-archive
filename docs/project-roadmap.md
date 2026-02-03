# CACD Archive - Project Roadmap

**Document:** Project Roadmap & Milestones  
**Version:** 2.2  
**Date:** 3 February 2026  
**Status:** Active Development

---

## Project Status Overview

### ✅ Completed (v1.0 - v1.7.0)

- Core scraping engine (link discovery + table parsing)
- Database schema and migrations
- REST API with filtering and pagination
- Web UI (responsive, mobile-friendly)
- Email notifications for scraping errors
- Security hardening (Helmet, XSS protection, rate limiting)
- Self-hosted Bootstrap, CSS variables
- PM2 deployment configuration
- User authentication system (v1.6.0)
- Admin CLI tools (v1.6.0)
- Saved searches with email notifications (v1.7.0)
- Production build system with minification (v1.7.0)
- JWT auto-refresh (v1.7.0)

### 🚧 In Progress

- Staging deployment and testing
- Additional email templates (welcome, approval, password reset)

### 📋 Planned

- Custom error pages (404, 500)
- Enhanced health check endpoint
- Process management (PM2/systemd)
- Nginx reverse proxy configuration
- Advanced user management features
- Audit logging

---

## Phase 0: Scraper Refinements ✅ COMPLETE

**Target:** v1.8.0  
**Completed:** 3 February 2026  
**Duration:** 1 day  
**Priority:** HIGH

### Milestone: Scraper Configuration Improvements ✅ COMPLETE

**Status:** Shipped  
**Objective:** Improve scraper scheduling flexibility and efficiency

#### Completed Tasks:

- ✅ Changed scraping interval from hours to minutes
  - Updated `SCRAPE_INTERVAL_HOURS` to `SCRAPE_INTERVAL_MINUTES`
  - Default interval: 120 minutes (2 hours)
  - Supports intervals as low as 1 minute (e.g., 15 minutes)
  - Backward-compatible conversion in scheduler

- ✅ Implemented scraping time window
  - Added `SCRAPE_WINDOW_ENABLED` configuration (default: true)
  - Added `SCRAPE_WINDOW_START_HOUR` (default: 8 = 08:00)
  - Added `SCRAPE_WINDOW_END_HOUR` (default: 18 = 18:00)
  - Prevents unnecessary scraping during off-hours (e.g., nighttime)
  - Window check runs every minute alongside interval check
  - Configurable via environment variables

- ✅ Updated configuration files
  - Modified `src/config/config.js` to include new settings
  - Updated `src/scrapers/scheduler.js` with window logic
  - Updated `.env.example` with new variables
  - Updated `README.md` documentation
  - Updated `docs/implementation-plan.md`

- ✅ Enhanced scheduler logging
  - Added time window status to startup logs
  - Added debug logging when outside window
  - Improved scheduler status endpoint with window info

**Deliverables:**

- Minute-based scraping intervals (enables 15-minute scrapes)
- Time-window-based scraping (08:00-18:00 default)
- Reduced unnecessary load on origin website during off-hours
- More flexible scheduling configuration

**Benefits:**

- More responsive data collection (15-minute intervals vs 2-hour)
- Reduced nighttime traffic to court website
- Better resource utilization
- Easier testing with shorter intervals

---

## Current Milestone Structure

## Phase 1: Foundation ✅ COMPLETE

**Status:** Shipped (v1.0 - v1.5.0)  
**Deliverables:** Working scraper, API, web UI, security baseline

---

## Phase 2: User Authentication & Authorization ✅ COMPLETE

**Target:** v1.6.0  
**Shipped:** 18 December 2025  
**Duration:** 2 weeks  
**Priority:** HIGH

### Milestone 1: Database Schema & Models ✅ COMPLETE

**Status:** Shipped (v1.6.0)

#### Tasks:

- ✅ Design authentication database schema
  - ✅ `users` table (id, email, password_hash, name, created_at, updated_at, deleted_at)
  - ✅ `roles` table (id, name, slug, description)
  - ✅ `user_roles` junction table (user_id, role_id)
  - ✅ `capabilities` table (id, name, slug, description, category)
  - ✅ `role_capabilities` junction table (role_id, capability_id)
  - ✅ `account_statuses` table (id, name, slug, description, is_active)
  - ✅ `user_status_history` table (id, user_id, status_id, changed_by, changed_at, notes)
  - ✅ `password_reset_tokens` table (id, user_id, token, expires_at, used_at)
  - ✅ Add indexes (email unique, foreign keys, status lookups)

- ✅ Create migration files
  - ✅ `004_authentication_schema.sql` - Core auth tables
  - ✅ `005_roles_and_capabilities.sql` - RBAC tables
  - ✅ `006_seed_default_roles.sql` - Seed admin/user roles with capabilities

- ✅ Create database models/services
  - ✅ `src/models/User.js` - User CRUD operations
  - ✅ `src/models/Role.js` - Role management
  - ✅ `src/models/Capability.js` - Capability management
  - ✅ `src/models/AccountStatus.js` - Status management
  - ✅ `src/services/auth-service.js` - Authentication logic
  - ✅ `src/services/permission-service.js` - Authorization checks

**Deliverables:**

- Complete database schema for authentication ✅
- Migration files ✅
- Tested models with CRUD operations ✅

---

### Milestone 2: Authentication Core ✅ COMPLETE

**Status:** Shipped (v1.6.0)  
**Dependencies:** Milestone 1

#### Tasks:

- ✅ Install authentication dependencies
  - ✅ `bcrypt` for password hashing
  - ✅ `jsonwebtoken` for JWT tokens
  - ✅ `@fastify/jwt` for Fastify JWT plugin
  - ✅ `@fastify/cookie` for secure cookie handling
  - ✅ `@fastify/session` (optional - for session-based auth)

- ✅ Implement password hashing
  - ✅ Hash password on user creation (bcrypt rounds: 12)
  - ✅ Validate password on login
  - ✅ Password strength validation (min 12 chars, complexity rules)

- ✅ Implement JWT token system
  - ✅ Generate access tokens (15min expiry)
  - ✅ Generate refresh tokens (7 days expiry)
  - ✅ Token verification middleware
  - ✅ Token refresh endpoint
  - ✅ Secure token storage (httpOnly cookies)

- ✅ Create authentication middleware
  - ✅ `requireAuth` - Verify user is logged in
  - ✅ `requireRole` - Check user has specific role
  - ✅ `requireCapability` - Check user has specific capability
  - ✅ `requireAccountActive` - Verify account not suspended/deleted

- ✅ Build password reset flow
  - ✅ Generate secure reset tokens (crypto.randomBytes)
  - ✅ Email reset link to user
  - ✅ Token expiry (1 hour)
  - ✅ One-time use enforcement
  - ✅ Password reset completion

**Deliverables:**

- Secure authentication system ✅
- JWT token management ✅
- Authorization middleware ✅
- Password reset functionality ✅

---

### Milestone 3: Authentication API Endpoints ✅ COMPLETE

**Status:** Shipped (v1.6.0)  
**Dependencies:** Milestone 2

#### Tasks:

- ✅ User registration endpoint
  - ✅ `POST /api/v1/auth/register` - Create new user account
  - ✅ Email validation (unique, valid format)
  - ✅ Password validation (strength requirements)
  - ✅ Set status to "pending_approval"
  - ✅ Send welcome email (account pending message)
  - ✅ Rate limiting (max 5 registrations per hour per IP)

- ✅ Login endpoint
  - ✅ `POST /api/v1/auth/login` - Authenticate user
  - ✅ Verify email + password
  - ✅ Check account status (must be "active")
  - ✅ Generate JWT tokens
  - ✅ Set httpOnly cookies
  - ✅ Log login attempt
  - ✅ Rate limiting (max 10 attempts per hour)

- ✅ Logout endpoint
  - ✅ `POST /api/v1/auth/logout` - Clear tokens
  - ✅ Invalidate refresh token
  - ✅ Clear cookies
  - ✅ Log logout

- ✅ Token refresh endpoint
  - ✅ `POST /api/v1/auth/refresh` - Get new access token
  - ✅ Verify refresh token
  - ✅ Generate new access token
  - ✅ Rotate refresh token (optional)

- ✅ Password reset endpoints
  - ✅ `POST /api/v1/auth/forgot-password` - Request reset
  - ✅ `POST /api/v1/auth/reset-password` - Complete reset
  - ✅ Email reset link with token
  - ✅ Validate token and update password

- ✅ User profile endpoints
  - ✅ `GET /api/v1/users/me` - Get current user profile
  - ✅ `PATCH /api/v1/users/me` - Update own profile
  - ✅ `GET /api/v1/users/:id` - Get user by ID (admin only)
  - ✅ `PATCH /api/v1/users/:id` - Update user (admin only)

- ✅ Admin user management endpoints
  - ✅ `GET /api/v1/admin/users` - List all users
  - ✅ `POST /api/v1/admin/users/:id/approve` - Approve pending user
  - ✅ `POST /api/v1/admin/users/:id/deactivate` - Deactivate user
  - ✅ `POST /api/v1/admin/users/:id/activate` - Reactivate user
  - ✅ `DELETE /api/v1/admin/users/:id` - Soft delete user
  - ✅ `POST /api/v1/admin/users/:id/roles` - Assign role
  - ✅ `DELETE /api/v1/admin/users/:id/roles/:roleId` - Remove role

**Deliverables:**

- Complete authentication API ✅
- User management API for admins ✅
- Proper error handling and validation ✅
- API documentation updated ✅

---

### Milestone 4: Authentication UI ✅ COMPLETE

**Status:** Shipped (v1.6.0)  
**Dependencies:** Milestone 3

#### Tasks:

- ✅ Create login page
  - ✅ `public/login.html` - Login form
  - ✅ Email + password inputs
  - ✅ "Remember me" checkbox
  - ✅ "Forgot password?" link
  - ✅ "Register" link
  - ✅ Client-side validation
  - ✅ Error message display
  - ✅ Success redirect to dashboard/home

- ✅ Create registration page
  - ✅ `public/register.html` - Sign-up form
  - ✅ Email, password, confirm password, name fields
  - ✅ Password strength indicator
  - ✅ Terms of service checkbox
  - ✅ Client-side validation
  - ✅ Success message (pending approval)

- ✅ Create forgot password page
  - ✅ `public/forgot-password.html` - Request reset form
  - ✅ Email input
  - ✅ Success message (check email)

- ✅ Create reset password page
  - ✅ `public/reset-password.html` - New password form
  - ✅ Token from URL parameter
  - ✅ New password + confirm fields
  - ✅ Password strength indicator
  - ✅ Success redirect to login

- ✅ Create user dashboard
  - ✅ `public/dashboard.html` - Logged-in user home
  - ✅ Welcome message with user name
  - ✅ Navigation to saved searches
  - ✅ Profile edit link
  - ✅ Logout button

- ✅ Update main page with authentication
  - ✅ Add login/register buttons (if not logged in)
  - ✅ Add user menu (if logged in)
  - ✅ Show/hide features based on auth state
  - ✅ Logout functionality

- ✅ Create admin panel UI
  - ✅ `public/admin.html` - User management page
  - ✅ List pending users
  - ✅ Approve/reject buttons
  - ✅ User search and filters
  - ✅ User detail view/edit modal
  - ✅ Role assignment interface

**Deliverables:**

- Complete authentication UI ✅
- User registration and login flows ✅
- Password reset flow ✅
- Admin user management interface ✅

---

## Phase 3: Saved Searches & Notifications ✅ COMPLETE

**Target:** v1.7.0  
**Shipped:** 18 December 2025  
**Duration:** 1 week  
**Priority:** HIGH

### Milestone: Saved Searches Implementation ✅ COMPLETE

**Status:** Shipped

#### Completed Tasks:

- ✅ Database schema (migration 007)
  - `saved_searches` table (user_id, search_text, enabled)
  - `search_notifications` table (tracking sent emails)
  - `email_notifications_enabled` field on users table

- ✅ SavedSearch model
  - CRUD operations (create, read, update, delete)
  - Validation (3-255 chars, max 10 per user)
  - Rate limiting checks (2 emails per 12 hours)
  - Notification tracking

- ✅ REST API endpoints
  - `GET /api/v1/searches` - List saved searches
  - `GET /api/v1/searches/:id` - Get single search
  - `POST /api/v1/searches` - Create search
  - `PATCH /api/v1/searches/:id` - Update search
  - `DELETE /api/v1/searches/:id` - Delete search
  - `PATCH /api/v1/users/me/notifications` - Toggle notifications

- ✅ Email notification system
  - Handlebars email templates (HTML + plain text)
  - Integration with scraper workflow
  - Consolidated emails per user
  - Full-text search with MATCH...AGAINST
  - Rate limiting enforcement

- ✅ Dashboard UI
  - Create/edit/delete saved searches
  - Toggle searches on/off
  - Toggle email notifications
  - Form validation and error handling

- ✅ Build system improvements
  - Minify all JS files (6 files)
  - Process all HTML files (6 files)
  - Version-based cache busting
  - Production dist/ directory

- ✅ Authentication enhancements
  - Automatic JWT token refresh
  - Background token checks
  - Fetch interceptor for API calls

**Deliverables:**

- Complete saved searches feature with email notifications
- Production-ready build system
- Improved authentication UX

---

## Phase 4: CLI Administration Tools ✅ COMPLETE (was Phase 3)

**Target:** v1.6.0  
**Shipped:** 18 December 2025  
**Duration:** 1 week  
**Priority:** HIGH

### Milestone 5: CLI Framework ✅ COMPLETE

**Status:** Shipped (v1.6.0)

#### Tasks:

- ✅ Install CLI dependencies
  - ✅ `commander` - CLI framework
  - ✅ `chalk` - Terminal colors
  - ✅ `cli-table3` - Pretty tables
  - ✅ `inquirer` - Interactive prompts
  - ✅ `ora` - Spinners
  - ✅ `boxen` - Boxes around text

- ✅ Create CLI structure
  - ✅ `bin/cacd` - Main executable (chmod +x)
  - ✅ `src/cli/index.js` - CLI router
  - ✅ `src/cli/commands/` - Command directory
  - ✅ `src/cli/utils/` - CLI helpers (formatting, colors)

- ✅ Implement base CLI
  - ✅ Help text and usage
  - ✅ Version display
  - ✅ Error handling
  - ✅ Colored output
  - ✅ Command routing

- ✅ Create CLI utilities
  - ✅ `formatTable()` - Format data as table
  - ✅ `formatSuccess()` - Success messages
  - ✅ `formatError()` - Error messages
  - ✅ `formatWarning()` - Warning messages
  - ✅ `confirm()` - Yes/no prompts
  - ✅ `spinner()` - Loading indicators

**Deliverables:**

- Working CLI framework ✅
- Pretty terminal output ✅
- Command structure ✅

---

### Milestone 6: User Management CLI Commands ✅ COMPLETE

**Status:** Shipped (v1.6.0)  
**Dependencies:** Milestone 5

#### Tasks:

- ✅ List users command
  - ✅ `./bin/cacd users:list` - Show all users in table
  - ✅ `./bin/cacd users:list --status=pending` - Filter by status
  - ✅ `./bin/cacd users:list --role=admin` - Filter by role
  - ✅ Display: ID, Email, Name, Status, Roles, Created

- ✅ Create user command
  - ✅ `./bin/cacd users:create` - Interactive user creation
  - ✅ Prompt for email, name, password, role
  - ✅ Validate inputs
  - ✅ Hash password
  - ✅ Create user with "active" status
  - ✅ Display success with user ID

- ✅ Approve user command
  - ✅ `./bin/cacd users:approve --email=user@example.com`
  - ✅ `./bin/cacd users:approve --id=123`
  - ✅ Change status from "pending" to "active"
  - ✅ Send approval email to user
  - ✅ Display confirmation

- ✅ Deactivate user command
  - ✅ `./bin/cacd users:deactivate --email=user@example.com`
  - ✅ `./bin/cacd users:deactivate --id=123`
  - ✅ Prompt for reason (optional note)
  - ✅ Change status to "inactive"
  - ✅ Display confirmation

- ✅ Show user details command
  - ✅ `./bin/cacd users:show --email=user@example.com`
  - ✅ `./bin/cacd users:show --id=123`
  - ✅ Display full user information
  - ✅ Show roles and capabilities

- [ ] Delete user command
  - [ ] `./bin/cacd users:delete --email=user@example.com`
  - [ ] `./bin/cacd users:delete --id=123`
  - [ ] Confirmation prompt (dangerous operation)
  - [ ] Soft delete (set deleted_at timestamp)
  - [ ] Display confirmation

- [ ] Reset password command
  - [ ] `./bin/cacd users:reset-password --email=user@example.com`
  - [ ] Generate random temporary password OR
  - [ ] Send password reset email
  - [ ] Display temporary password (if generated)

- [ ] Assign role command
  - [ ] `./bin/cacd users:assign-role --email=user@example.com --role=admin`
  - [ ] Validate role exists
  - [ ] Add role to user
  - [ ] Display confirmation

- [ ] Remove role command
  - [ ] `./bin/cacd users:remove-role --email=user@example.com --role=admin`
  - [ ] Remove role from user
  - [ ] Display confirmation

**Deliverables:**

- User management CLI (mostly complete) ⚠️
- Interactive and non-interactive modes ✅
- Clear success/error messages ✅

---

### Milestone 7: Admin CLI Commands ✅ COMPLETE

**Status:** Shipped (v1.6.0)  
**Dependencies:** Milestone 5

#### Tasks:

- ✅ Database migration commands
  - ✅ `./bin/cacd db:migrate` - Run pending migrations
  - [ ] `./bin/cacd db:migrate:status` - Show migration status
  - [ ] `./bin/cacd db:migrate:create <name>` - Create new migration
  - [ ] `./bin/cacd db:rollback` - Rollback last migration

- ✅ Scraping commands
  - ✅ `./bin/cacd scraper:run` - Trigger immediate scrape
  - ✅ `./bin/cacd scraper:status` - Show last scrape info
  - [ ] `./bin/cacd scraper:history` - Show scrape history
  - [ ] `./bin/cacd scraper:stats` - Statistics (total hearings, dates covered)

- [ ] System commands
  - [ ] `./bin/cacd system:info` - System status (DB, API, scraper)
  - [ ] `./bin/cacd system:health` - Health check
  - [ ] `./bin/cacd cache:clear` - Clear any caches

**Deliverables:**

- Database management CLI (basic migrate) ✅
- Scraping control CLI (basic run) ✅
- System monitoring CLI (planned) 📋

---

## Phase 5: Advanced Features & Polish 📋 FUTURE

**Target:** v2.3.0+  
**Duration:** TBD  
**Priority:** LOW

### Milestone 11: Audit Logging

**Tasks:**

- [ ] Create audit log table
- [ ] Log user actions (login, logout, profile changes, search creation)
- [ ] Log admin actions (user approval, deactivation, role changes)
- [ ] Audit log viewer UI (admin only)
- [ ] Export audit logs

### Milestone 12: Advanced User Management

**Tasks:**

- [ ] Email verification on registration
- [ ] Two-factor authentication (TOTP)
- [ ] Account lockout after failed login attempts
- [ ] Session management (view active sessions, logout all)
- [ ] User activity tracking

### Milestone 13: Testing & Quality

**Tasks:**

- [ ] Unit tests for authentication
- [ ] Integration tests for auth API
- [ ] E2E tests for login/register flows
- [ ] Security testing (password hashing, JWT validation)
- [ ] Performance testing (search matching at scale)

### Milestone 14: Documentation

**Tasks:**

- [ ] User guide (how to register, save searches)
- [ ] Admin guide (user management, system admin)
- [ ] API documentation (authentication endpoints)
- [ ] CLI documentation (all commands with examples)
- [ ] Deployment guide updates (new environment variables)

---

## Environment Variables Needed

### New Authentication Variables

```bash
# JWT Configuration
JWT_SECRET=<random-256-bit-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Password Requirements
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL=true

# Registration
ALLOW_PUBLIC_REGISTRATION=true
REQUIRE_ADMIN_APPROVAL=true

# Email Templates
EMAIL_FROM_AUTH='CACD Archive <noreply@cacd-archive.example.com>'
```

---

## Database Capabilities Seed

### Administrator Role Capabilities:

- `users:list` - View all users
- `users:create` - Create new users
- `users:edit` - Edit any user profile
- `users:delete` - Delete users
- `users:approve` - Approve pending users
- `users:deactivate` - Deactivate user accounts
- `roles:assign` - Assign roles to users
- `scraper:trigger` - Manually trigger scraping
- `scraper:view-logs` - View scraping logs
- `searches:view-all` - View all users' saved searches
- `audit:view` - View audit logs
- `system:admin` - Full system administration

### User Role Capabilities:

- `profile:edit-own` - Edit own profile
- `profile:view-own` - View own profile
- `searches:create` - Create saved searches
- `searches:edit-own` - Edit own saved searches
- `searches:delete-own` - Delete own saved searches
- `searches:view-own` - View own saved searches
- `notifications:view-own` - View own notifications
- `hearings:view` - View hearing data (public)

---

## Implementation Priority Order

### Phase 2 (Authentication) - PRIORITY 1

1. Milestone 1: Database Schema ⚡
2. Milestone 2: Authentication Core ⚡
3. Milestone 3: API Endpoints ⚡
4. Milestone 4: UI ⚡

### Phase 3 (CLI Tools) - PRIORITY 2

5. Milestone 5: CLI Framework 🔧
6. Milestone 6: User Management CLI 🔧
7. Milestone 7: Admin CLI 🔧

### Phase 4 (Saved Searches) - PRIORITY 3

8. Milestone 8: Database & Models 💾
9. Milestone 9: API 💾
10. Milestone 10: UI 💾

### Phase 5 (Polish) - PRIORITY 4

11. Milestone 11-14: Audit, Advanced Features, Testing, Documentation 📚

---

## Success Criteria

### Phase 2 Complete When:

- ✅ Users can register and login
- ✅ Admins can approve/reject users
- ✅ Role-based access control working
- ✅ Password reset functional
- ✅ All auth endpoints secured
- ✅ Admin panel functional

### Phase 3 Complete When:

- ✅ CLI tool executable from `bin/cacd`
- ✅ All user management commands working
- ✅ Pretty terminal output with colors/tables
- ✅ Database migrations via CLI
- ✅ Scraping control via CLI

### Phase 4 Complete When:

- ✅ Users can create/edit/delete saved searches
- ✅ New hearings matched against active searches
- ✅ Email notifications sent for matches
- ✅ Users can view notification history
- ✅ Notifications properly batched

---

## Risk & Dependencies

### Technical Risks:

- **JWT Security:** Must ensure tokens properly secured (httpOnly cookies, secure flag in production)
- **Password Reset Security:** Tokens must be cryptographically secure and time-limited
- **Email Deliverability:** Notification emails must not end up in spam
- **Search Matching Performance:** Need to optimize matching algorithm for scale

### Dependencies:

- Email service must be reliable (nodemailer already configured)
- Database performance for user/search lookups
- JWT library security (use well-maintained @fastify/jwt)

---

## Notes

This roadmap tracks the evolution of CACD Archive from v1.0 through v2.0+. Major authentication, CLI tooling, and saved searches features are now complete. The scraper has been refined to support minute-based intervals and time windows for more efficient operation.

**Recent Updates:**

- v1.9.0 (3 Feb 2026): Bug fixes for link discovery and CLI commands, dependency updates
- v1.8.0 (3 Feb 2026): Scraper refinements - minute-based intervals and time windows
- v1.7.0 (18 Dec 2025): Saved searches with email notifications
- v1.6.0 (18 Dec 2025): User authentication and CLI tools

**Focus Areas:**

- Continued polish and optimization
- Additional CLI commands
- Advanced user management features
- System monitoring and observability

---

**Last Updated:** 3 February 2026  
**Roadmap Version:** 2.2

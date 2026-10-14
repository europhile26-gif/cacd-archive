# Security Audit

**Date:** 2026-10-14
**Version reviewed:** v1.20.1
**Scope:** every route under `src/api/routes/`, the auth middleware, `auth-service.js`, the
`User` and `SavedSearch` models, and server setup (error handling, CORS, rate limiting,
response serialisation).

Reviewed ahead of adding API keys for agent access: a long-lived credential held by a
non-browser client loses the protection the browser context gives today (`SameSite=strict`
cookies, 15-minute access tokens), so the API it reaches needed checking first.

The previous audit (2025-12-17) is in git history.

## Method

Each route was checked for:

| Check           | Question                                                                    |
| --------------- | --------------------------------------------------------------------------- |
| Authentication  | Correct pre-handler? Are public routes meant to be public?                  |
| Authorisation   | Role, capability or ownership — and is it the right one?                    |
| Input           | Is there a body/query/params schema, and does it reject unlisted fields?    |
| Mass assignment | Do update routes accept only the fields they intend to?                     |
| Output          | Is there a response schema? (Fastify only serialises the properties listed) |
| Errors          | Is internal detail kept out of responses, and are failures logged?          |
| Enumeration     | Do registration, login and password reset leak which accounts exist?        |
| Abuse           | Are unauthenticated and credential routes rate limited?                     |

## What held up

- **SQL injection:** every query is parameterised. Sort columns and orders are mapped through
  allowlists, `IN (...)` lists are built from placeholders, and `LIKE` wildcards in search
  terms are escaped.
- **Ownership:** saved searches are scoped by `user_id` on every read, update and delete.
  Another user's search returns 404, indistinguishable from one that doesn't exist.
- **Admin routes:** all gated on a specific capability.
- **Cookies:** `httpOnly`, `SameSite=strict`, and `secure` in production.
- **Frontend routes:** serve fixed filenames only; no path is built from request input.
- **Output escaping:** values rendered by the frontend go through `escapeHtml`, and email
  templates use Handlebars' escaping.

## Findings

Severity reflects impact on this deployment. "Fixed in" is the release carrying the fix.

### High

| #   | Finding                                                                                                                                                                                                                               | Fixed in |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F1  | `GET /users/me` could return password hashes. A class-wide flag used during credential lookups leaked into concurrent requests, and stayed on permanently if a lookup failed; the route's response schema let any property through.   | v1.20.2  |
| F2  | Route error logging was a no-op (`logger: false` silences Fastify's logger), and the global error handler was registered too late to apply to API routes — so unhandled errors were unlogged and returned raw messages, SQL included. | v1.20.2  |
| F3  | The forgot-password handler passed the reset link to a logger. Harmless only because logging was broken (F2).                                                                                                                         | v1.20.2  |
| F4  | `PATCH /users/me` accepted `email`, letting a user change their address with no verification.                                                                                                                                         | v1.20.2  |
| F5  | Registration, profile and saved-search routes returned internal error messages to clients.                                                                                                                                            | v1.20.2  |
| F6  | `verifyToken` swallowed every error, and JWT verification didn't pin the signing algorithm.                                                                                                                                           | v1.20.2  |

### Medium

| #   | Finding                                                                                                                                                     | Fixed in |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F7  | CORS reflected any origin with credentials when no allowed origins were configured, including in production.                                                | v1.21.0  |
| F8  | Credential routes shared the general rate limit. Separately, the documented exemption for signed-in users was never applied (`skip` isn't a plugin option). | v1.21.0  |
| F9  | No session revocation: password changes left other sessions, and any stolen refresh token, valid for up to 30 days.                                         | v1.21.0  |
| F10 | Password reset tokens are stored in plaintext, and issuing one doesn't invalidate earlier ones.                                                             | Open     |
| F11 | Seeded `searches:*`, `profile:*` and `notifications:*` capabilities were never checked.                                                                     | v1.21.0  |
| F12 | Response schemas without properties serialised user objects as `{}`; several routes had no response schema.                                                 | v1.21.0  |
| F13 | Thirteen `process.env` reads outside `config.js` bypassed startup validation.                                                                               | v1.21.0  |

### Low

| #   | Finding                                                                                                               | Fixed in |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| F14 | An administrator could change their own status via the edit route, assign themselves roles, or remove the last admin. | v1.21.0  |
| F15 | Unbounded search and filter lengths on the public hearings endpoint.                                                  | v1.21.0  |
| F16 | Login response time distinguishes registered from unregistered addresses.                                             | Accepted |
| F17 | Concurrent saved-search creates could exceed the per-user cap.                                                        | v1.21.0  |
| F18 | Repeated "scrape now" requests started overlapping scrapes.                                                           | v1.21.0  |
| F19 | `/health` disclosed exact version and uptime publicly; Swagger UI is public.                                          | v1.21.0  |
| F20 | Passwords over 72 bytes were silently truncated by bcrypt.                                                            | v1.21.0  |

## Accepted risks

- **F16 — login timing.** Registration already answers "Email already registered", so closing
  the timing difference alone would hide nothing. Revisit if public registration is turned off
  and enumeration through it closes.
- **F19 — public API documentation.** Swagger UI at `/api/docs` documents a public API and is
  useful to agents and integrators. The version number is no longer in `/health`, but the
  Swagger spec still carries it.
- **The scrape guard is per process.** Under PM2 cluster mode each instance keeps its own
  in-progress flag; only instance 0 runs the scheduler, so overlap needs a manual scrape on
  the other instance. Rate limit counters are shared through Redis when `REDIS_URL` is set
  (since v1.22.0).

## Open

- **F10 — password reset.** Reset emails have never been sent: the endpoint creates a token and
  stops. Hashing tokens at rest and invalidating earlier ones belongs with implementing the
  email. Since v1.23.1 the login page no longer links to the reset page; users ask the operator,
  who resets passwords with `./bin/cacd users reset-password`.

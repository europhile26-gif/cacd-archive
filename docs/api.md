# API Guide

Interactive Swagger documentation is available at `/api/docs` when the server is running.

## Base URL

All API endpoints are prefixed with `/api/v1/`.

## Authentication

Most endpoints are public. Authenticated endpoints require a JWT access token, sent either as:

- `Authorization: Bearer <token>` header
- `accessToken` HTTP-only cookie (set automatically on login)

Authenticated users bypass API rate limiting.

## Example Requests

```bash
# Get hearings for a specific date
curl "http://localhost:3000/api/v1/hearings?date=2025-12-18&limit=20"

# Search by case number
curl "http://localhost:3000/api/v1/hearings?search=202404094"

# Filter by division and date range
curl "http://localhost:3000/api/v1/hearings?division=Criminal&dateFrom=2025-12-01&dateTo=2025-12-31"

# Get available dates with hearing counts
curl "http://localhost:3000/api/v1/dates"
```

## Endpoints

### Hearings

| Method | Path            | Description                               | Auth |
| ------ | --------------- | ----------------------------------------- | ---- |
| `GET`  | `/hearings`     | List hearings with filters and pagination | No   |
| `GET`  | `/hearings/:id` | Get single hearing by ID                  | No   |
| `GET`  | `/dates`        | Available dates with hearing counts       | No   |

### Authentication

| Method | Path                    | Description                   | Auth |
| ------ | ----------------------- | ----------------------------- | ---- |
| `POST` | `/auth/register`        | Register a new account        | No   |
| `POST` | `/auth/login`           | Login with email and password | No   |
| `POST` | `/auth/logout`          | Logout (clear cookies)        | No   |
| `POST` | `/auth/refresh`         | Refresh access token          | No   |
| `POST` | `/auth/forgot-password` | Request password reset email  | No   |
| `POST` | `/auth/reset-password`  | Reset password with token     | No   |
| `POST` | `/auth/change-password` | Change password               | Yes  |

### Users

| Method  | Path                      | Description                                 | Auth               |
| ------- | ------------------------- | ------------------------------------------- | ------------------ |
| `GET`   | `/users/me`               | Current user profile, roles, and navigation | Yes                |
| `PATCH` | `/users/me`               | Update own profile                          | Yes                |
| `PATCH` | `/users/me/notifications` | Toggle email notification preferences       | Yes                |
| `GET`   | `/users/:id`              | Get user by ID                              | Yes (`users:view`) |

### Saved Searches

| Method   | Path            | Description            | Auth |
| -------- | --------------- | ---------------------- | ---- |
| `GET`    | `/searches`     | List saved searches    | Yes  |
| `GET`    | `/searches/:id` | Get saved search by ID | Yes  |
| `POST`   | `/searches`     | Create saved search    | Yes  |
| `PATCH`  | `/searches/:id` | Update saved search    | Yes  |
| `DELETE` | `/searches/:id` | Delete saved search    | Yes  |

### Admin

| Method   | Path                             | Description           | Auth                       |
| -------- | -------------------------------- | --------------------- | -------------------------- |
| `GET`    | `/admin/users`                   | List all users        | Admin (`users:list`)       |
| `GET`    | `/admin/users/:id`               | Get user details      | Admin (`users:view`)       |
| `PATCH`  | `/admin/users/:id`               | Update user details   | Admin (`users:edit`)       |
| `DELETE` | `/admin/users/:id`               | Soft delete user      | Admin (`users:delete`)     |
| `POST`   | `/admin/users/:id/approve`       | Approve pending user  | Admin (`users:approve`)    |
| `POST`   | `/admin/users/:id/activate`      | Reactivate user       | Admin (`users:deactivate`) |
| `POST`   | `/admin/users/:id/deactivate`    | Deactivate user       | Admin (`users:deactivate`) |
| `POST`   | `/admin/users/:id/roles`         | Assign role to user   | Admin (`roles:assign`)     |
| `DELETE` | `/admin/users/:id/roles/:roleId` | Remove role from user | Admin (`roles:remove`)     |

### Analytics

Request analytics, gated on the `system:analytics` capability. See
[Request Analytics](configuration.md#request-analytics) for what is collected and
[the LIA](legitimate-interests-assessment.md) for why.

| Method | Path                                     | Description                                | Auth                       |
| ------ | ---------------------------------------- | ------------------------------------------ | -------------------------- |
| `GET`  | `/admin/analytics/summary`               | Totals, daily series and top-N breakdowns  | Admin (`system:analytics`) |
| `GET`  | `/admin/analytics/requests`              | Paginated request log with filters         | Admin (`system:analytics`) |
| `GET`  | `/admin/analytics/sessions/:fingerprint` | Requests grouped into one pseudo-session   | Admin (`system:analytics`) |
| `GET`  | `/admin/analytics/status`                | Whether collection is on, and buffer state | Admin (`system:analytics`) |

`summary` and `requests` accept `days` (1-365, default 7). `requests` also accepts
`limit`, `offset`, `ip`, `country`, `asn`, `status`, `method`, `route` and `fingerprint`.

### System

| Method | Path      | Description              | Auth |
| ------ | --------- | ------------------------ | ---- |
| `GET`  | `/health` | Health check             | No   |
| `GET`  | `/config` | Public app configuration | No   |

See `/api/docs` for the full schema and response formats.

# Using the CACD Archive API from an Agent

This guide is for an AI agent (or whoever is configuring one) acting on a user's behalf through the CACD Archive REST API. It covers authentication, the endpoints a key can reach, and how the data behaves. Each task has its own walkthrough:

| The user says…                                                        | Guide                                          |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| "Email me when Mr Smith is listed in an upcoming session"             | [Create an alert](create-alert.md)             |
| "Show me the email reminders I've set up" / "Stop the Smith reminder" | [List and manage alerts](list-alerts.md)       |
| "What's coming up this Friday?"                                       | [Upcoming hearings](upcoming-hearings.md)      |
| "Search historic cases for FOOBAR"                                    | [Search historic hearings](search-historic.md) |

## What the archive holds

The archive scrapes the Court of Appeal (Criminal Division) cause lists published on GOV.UK, from two sources:

| Data source         | `dataSource` id | What it is                                                                                   | Typical `caseDetails` |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| Daily Cause List    | `1`             | The list for one sitting day, published shortly before it. Judges and hearing types are set. | `John Example`        |
| Future Hearing List | `2`             | Cases fixed for hearing, weeks ahead. No judge or hearing type yet.                          | `Example, John`       |

A case fixed for hearing usually appears twice: first on the Future Hearing List, then on the Daily Cause List for its day. The two sources write names in a different order, so search on a **surname**, not a full name.

Hearings are held in London. Only the Criminal Division is archived.

## Connecting

```bash
export CACD_BASE_URL="https://daily-cause-archive.net/api/v1"   # or your own instance
export CACD_API_KEY="cacd_1a2b3c4d_…"                             # issued by the operator
```

Every request sends the key as a bearer token:

```bash
curl -s -H "Authorization: Bearer ${CACD_API_KEY}" "${CACD_BASE_URL}/users/me"
```

Keys are issued, rotated and revoked by the site operator with `./bin/cacd users api-keys` ([CLI reference](../cli.md#users-api-keys-create)). There is no API for managing keys. A key acts as the user it was issued to: their saved searches, their alert settings, their email address.

Start a session with `GET /users/me` to learn who the key belongs to and whether their alert emails are on:

```json
{
  "user": {
    "id": 1,
    "email": "owner@example.com",
    "name": "Owner Name",
    "status": { "id": 2, "name": "Active", "slug": "active", "is_active": true },
    "email_notifications_enabled": true,
    "created_at": "2025-12-18T10:03:01.000Z",
    "updated_at": "2025-12-18T10:03:01.000Z",
    "roles": [{ "id": 2, "name": "User", "slug": "user", "description": "…" }],
    "capabilities": ["searches:view-own", "searches:create", "…"]
  },
  "roles": ["…"],
  "capabilities": ["…"],
  "navigation": ["…"]
}
```

## Endpoints a key can use

| Method   | Path                      | Purpose                                                |
| -------- | ------------------------- | ------------------------------------------------------ |
| `GET`    | `/hearings`               | Search and filter hearings (paginated)                 |
| `GET`    | `/hearings/:id`           | One hearing                                            |
| `GET`    | `/dates`                  | Recent list dates with hearing counts                  |
| `GET`    | `/data-sources`           | The data sources and their ids                         |
| `GET`    | `/config`, `/health`      | Page size; service status                              |
| `GET`    | `/users/me`               | Who the key acts as, and whether alert emails are on   |
| `PATCH`  | `/users/me/notifications` | Turn alert emails on or off                            |
| `GET`    | `/searches`               | List saved searches (alerts)                           |
| `POST`   | `/searches`               | Create one                                             |
| `GET`    | `/searches/:id`           | Get one                                                |
| `PATCH`  | `/searches/:id`           | Change its text, pause/resume it, or set `future_only` |
| `DELETE` | `/searches/:id`           | Delete it                                              |

Anything else — logging in, passwords, profile changes, administration — answers **403** `API keys cannot be used on this endpoint`, whatever the owner's role. Don't retry those; tell the user it has to be done on the website.

The full machine-readable spec is OpenAPI 3.1 at `/api/docs/json` on the same host (for example `https://daily-cause-archive.net/api/docs/json`), with a browsable version at `/api/docs`. Operations a key can call say "Accepts API keys" in their description.

## Hearing records

`GET /hearings` and `GET /hearings/:id` return hearings in this shape:

```json
{
  "id": 388,
  "listDate": "2026-09-10T00:00:00.000Z",
  "caseNumber": "202600123 A1",
  "time": "10:30am",
  "hearingDateTime": "2026-09-10T09:30:00.000Z",
  "venue": "RCJ - Court 7",
  "judge": "Lord Justice Example, Mr Justice Sample and Mrs Justice Specimen",
  "caseDetails": "John Example",
  "hearingType": "FC Appeal Sentence",
  "additionalInformation": "1992 Sexual Offences Act applies. Pre-con in Booth 1 at 9:45am.",
  "crownCourt": null,
  "reportingRestriction": null,
  "division": "Criminal",
  "dataSourceName": "Daily Cause List",
  "sourceUrl": "https://www.court-tribunal-hearings.service.gov.uk/…",
  "scrapedAt": "2026-09-10T10:38:11.000Z"
}
```

- **`listDate`** is the list's date. Use the first ten characters (`2026-09-10`); the time part is always midnight UTC and carries no meaning.
- **`time`** is the start time exactly as listed, in London time (`10:30am`).
- **`hearingDateTime`** is the same moment as a UTC instant. In summer (BST) it is an hour behind `time`. Convert to Europe/London before showing it.
- Fields not given by the source are `null`. Future Hearing List entries have no `judge` or `hearingType`.
- **Reporting restrictions matter.** `reportingRestriction` (Future Hearing List) and `additionalInformation` (Daily Cause List, e.g. "1992 Sexual Offences Act applies") can say the case is subject to a statutory restriction on identifying people involved. Always pass these on when summarising a case, and never suggest publishing details of a restricted case.
- **`sourceUrl`** links to the published list the hearing was taken from. Cite it.

## Searching

The `search` parameter matches a **phrase, case-insensitively, anywhere** in the case details, hearing type, additional information, judge, venue or case number. It is not a word search:

- `search=smith` matches `John Smith`, `Smith, John` and `Smithson` — and a judge called Smith.
- `search=john smith` matches `John Smith` only, not `Smith, John`. Prefer the surname.
- Surrounding quotes are ignored: `"Smith"` is the same as `Smith`.
- `%` and `_` are matched literally.

For an exact case reference use `caseNumber`, which must match in full, including the suffix: `caseNumber=202600123 A1`. To find a case by its reference number alone, use `search=202600123`.

## Responses and errors

Successful list responses carry `success: true`, the records in `data`, and `pagination: { limit, offset, total }`.

| Status | Meaning                                       | Example body                                                                            |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `400`  | The request didn't validate                   | `{"success": false, "error": "body/search_text must NOT have fewer than 3 characters"}` |
| `401`  | Key missing, malformed, revoked or expired    | `{"error": "Unauthorized", "message": "Invalid or expired token"}`                      |
| `403`  | Endpoint closed to keys, or owner deactivated | `{"error": "Forbidden", "message": "API keys cannot be used on this endpoint"}`         |
| `404`  | No such record (or not this user's)           | `{"error": "Saved search not found"}`                                                   |
| `429`  | Rate limit reached                            | `{"success": false, "error": "Rate limit exceeded, retry in 1 minute"}`                 |

A `401` means the key itself has stopped working: tell the user to ask the operator for a new one rather than retrying.

## Rate limits

Each key may make **600 requests a minute** by default. Every response carries the current state:

```
x-ratelimit-limit: 600
x-ratelimit-remaining: 597
x-ratelimit-reset: 60
```

On `429`, wait the number of seconds in the `retry-after` header before trying again. Page through results with `limit=100` rather than many small requests.

## Dates and times

- Dates in query parameters are `YYYY-MM-DD` and refer to the list date in London.
- Work out "today", "tomorrow" and "this Friday" in the **Europe/London** timezone, not UTC: just after midnight in summer, UTC is still on the previous day.
- Courts sit on working days. A weekend or bank holiday date returns no hearings, which is not an error.

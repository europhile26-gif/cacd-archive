# Create an Alert

> "Send me an email when Mr Smith is referenced in an upcoming session."

An alert is a **saved search**. The archive runs it against newly published lists and emails the user when it matches. See [the agent guide](README.md) for authentication and searching.

## How alerts behave

Know this before promising the user anything:

- **Alerts look at today and tomorrow only.** After every scrape that adds new hearings, each enabled saved search is matched against hearings listed for **today or tomorrow**. A case fixed for hearing six weeks from now is matched when its date comes round, not when it is first published.
- **One email per user, covering all their alerts.** It goes to the account's own email address. The recipient can't be changed through the API.
- **At most 2 emails per user every 12 hours** by default (the operator can change this). A hearing can appear in more than one email.
- **Alert emails must be switched on** for the account (`email_notifications_enabled`). If they are off, saved searches still exist but nothing is sent.
- **`future_only: true`** leaves out hearings whose start time has already passed, so a scrape late in the day doesn't email about this morning's hearings.
- Matching is the same phrase match as `GET /hearings?search=` (see [Searching](README.md#searching)): use a surname, not "Mr Smith" or "John Smith".
- A user can hold up to 10 saved searches by default, each 3–255 characters.

## Steps

### 1. Check that alert emails are on

```bash
curl -s -H "Authorization: Bearer ${CACD_API_KEY}" "${CACD_BASE_URL}/users/me"
```

Look at `user.email_notifications_enabled`. If it is `false`, ask the user whether to turn alert emails on, then:

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email_notifications_enabled": true}' \
  "${CACD_BASE_URL}/users/me/notifications"
```

```json
{ "success": true, "email_notifications_enabled": true }
```

### 2. Choose the search text

Reduce what the user said to the most specific phrase that will appear in the list:

| The user says            | Search text                        | Why                                                                         |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------------------- |
| "Mr Smith"               | `Smith`                            | Lists carry names without titles                                            |
| "John Smith"             | `Smith`                            | Lists write "John Smith" or "Smith, John"; check results for the first name |
| "case 202600123"         | `202600123`                        | Matches the reference whatever its suffix                                   |
| "anything from the CCRC" | `Criminal Cases Review Commission` | Matched as a whole phrase                                                   |

A common surname will match other people, and judges with that name. Say so when it applies.

### 3. Check for hearings already listed (optional)

The alert won't mention a hearing until the day before it. Tell the user about anything already fixed:

```bash
curl -s -G -H "Authorization: Bearer ${CACD_API_KEY}" \
  --data-urlencode "search=Smith" \
  --data-urlencode "dateFrom=$(TZ=Europe/London date +%F)" \
  --data-urlencode "sortBy=hearing_datetime" \
  --data-urlencode "sortOrder=asc" \
  "${CACD_BASE_URL}/hearings"
```

### 4. Create the saved search

```bash
curl -s -X POST \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"search_text": "Smith", "future_only": true}' \
  "${CACD_BASE_URL}/searches"
```

`201 Created`:

```json
{
  "search": {
    "id": 12,
    "search_text": "Smith",
    "enabled": true,
    "future_only": true,
    "created_at": "2026-10-14T18:20:00.000Z",
    "updated_at": "2026-10-14T18:20:00.000Z"
  }
}
```

Before creating, `GET /searches` to see whether an equivalent alert already exists; duplicates are allowed but mean nothing extra.

### 5. Tell the user what will happen

For example: "Done. You'll get an email at your account address when a hearing mentioning 'Smith' is listed for today or tomorrow. One hearing is already fixed: 20 October at 10:30am, Court 7."

## Errors

| Status | Body                                                                                    | What to do                                                |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `400`  | `{"error": "Maximum 10 saved searches allowed"}`                                        | List the user's searches and offer to delete or reuse one |
| `400`  | `{"success": false, "error": "body/search_text must NOT have fewer than 3 characters"}` | Use a longer phrase                                       |
| `403`  | `{"error": "Forbidden", "message": "Requires searches:create capability"}`              | The account isn't allowed to create alerts; tell the user |

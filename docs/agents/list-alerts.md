# List and Manage Alerts

> "Show me the current email reminders I've got set up."
> "Pause the Smith one." / "Delete the CCRC alert."

Alerts are saved searches. See [Create an alert](create-alert.md) for how they match, and [the agent guide](README.md) for authentication.

## List them

```bash
curl -s -H "Authorization: Bearer ${CACD_API_KEY}" "${CACD_BASE_URL}/searches"
```

```json
{
  "searches": [
    {
      "id": 4,
      "search_text": "Criminal Cases Review Commission",
      "enabled": true,
      "future_only": true,
      "created_at": "2026-06-03T12:46:57.000Z",
      "updated_at": "2026-06-25T13:03:58.000Z"
    }
  ]
}
```

| Field         | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `id`          | Use it to change or delete the alert                          |
| `search_text` | The phrase matched                                            |
| `enabled`     | `false` means paused: kept, but never matched                 |
| `future_only` | `true` leaves out hearings that have already started that day |

Also check `GET /users/me` → `user.email_notifications_enabled`. When it is `false`, no alert sends anything, enabled or not — say so when listing them.

An empty list is `{"searches": []}`.

## Pause or resume one

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  "${CACD_BASE_URL}/searches/4"
```

Returns the updated search as `{"search": {…}}`. Send `{"enabled": true}` to resume.

## Change the phrase

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"search_text": "CCRC"}' \
  "${CACD_BASE_URL}/searches/4"
```

`search_text`, `enabled` and `future_only` can be sent in any combination. Other fields are ignored; a body with none of the three is rejected with `400`.

## Delete one

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  "${CACD_BASE_URL}/searches/4"
```

`204` with no body. Deleting can't be undone; when the user only wants a break, pause instead.

## Turn all alert emails off or on

This is an account setting, not per alert:

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer ${CACD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email_notifications_enabled": false}' \
  "${CACD_BASE_URL}/users/me/notifications"
```

## Errors

| Status | Body                                     | Meaning                                                 |
| ------ | ---------------------------------------- | ------------------------------------------------------- |
| `404`  | `{"error": "Saved search not found"}`    | No alert with that id belongs to this user. List again. |
| `400`  | `{"error": "No valid fields to update"}` | The `PATCH` body had none of the three fields           |

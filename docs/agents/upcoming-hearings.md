# Upcoming Hearings

> "List what's coming up this Friday."
> "Is anything listed for next week?"

See [the agent guide](README.md) for authentication and the hearing record.

## 1. Work out the date in London

Resolve "this Friday", "tomorrow" or "next week" to `YYYY-MM-DD` dates in the **Europe/London** timezone. For example, on Wednesday 14 October 2026, "this Friday" is `2026-10-16`.

```bash
TZ=Europe/London date -d "friday" +%F      # GNU date
```

## 2. Fetch the day's hearings

```bash
curl -s -G -H "Authorization: Bearer ${CACD_API_KEY}" \
  --data-urlencode "date=2026-10-16" \
  --data-urlencode "sortBy=hearing_datetime" \
  --data-urlencode "sortOrder=asc" \
  --data-urlencode "limit=100" \
  "${CACD_BASE_URL}/hearings"
```

- `date` matches one list date. For a range use `dateFrom` and `dateTo` (both inclusive) instead.
- **Pass `sortOrder=asc`.** The default is newest first, which reads backwards for a day's schedule.
- `limit` is at most 100. If `pagination.total` is larger, fetch the rest with `offset=100`, `offset=200`, and so on.

```json
{
  "success": true,
  "data": [
    {
      "id": 420,
      "listDate": "2026-10-16T00:00:00.000Z",
      "caseNumber": "202500456 B5",
      "time": "10:30am",
      "hearingDateTime": "2026-10-16T09:30:00.000Z",
      "venue": "RCJ - Court 7",
      "judge": null,
      "caseDetails": "Example, Jane",
      "hearingType": null,
      "additionalInformation": null,
      "crownCourt": "Southwark",
      "reportingRestriction": null,
      "division": "Criminal",
      "dataSourceName": "Future Hearing List",
      "sourceUrl": "https://www.gov.uk/government/publications/…",
      "scrapedAt": "2026-10-01T10:04:00.000Z"
    }
  ],
  "pagination": { "limit": 100, "offset": 0, "total": 1 }
}
```

## 3. Make sense of what came back

- **How much is known depends on how close the date is.** Weeks ahead, only the Future Hearing List has entries: case, court, time and Crown Court, but no judges or hearing type. The Daily Cause List for a day is published shortly before it and adds the constitution of the court, the hearing type and notes.
- **The same case can appear twice** for one date, once from each source. Group by `caseNumber`; prefer the `Daily Cause List` record, which has more detail, and keep the `reportingRestriction` from the other if it has one.
- **Show London times.** Use `time` as listed, or convert `hearingDateTime` to Europe/London.
- **Carry reporting restrictions through** (`reportingRestriction`, and restrictions mentioned in `additionalInformation`).
- **No results** means either the court isn't sitting that day or nothing has been published yet. Say which is likely (weekend, bank holiday, or a date further ahead than anything listed) rather than "there are no hearings".

## Variations

| The user asks…                     | Parameters                                                |
| ---------------------------------- | --------------------------------------------------------- |
| "What's on tomorrow?"              | `date=<tomorrow>`                                         |
| "Anything next week?"              | `dateFrom=<Monday>&dateTo=<Friday>`                       |
| "When is the Smith appeal?"        | `search=Smith&dateFrom=<today>&sortOrder=asc`             |
| "What's fixed for hearing so far?" | `dateFrom=<today>&dataSource=2&sortOrder=asc`             |
| "Which days have lists?"           | `GET /dates` — the 100 most recent list dates with counts |

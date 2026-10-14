# Search Historic Hearings

> "Search historic cases for FOOBAR."
> "Has case 202600123 been heard before?"

See [the agent guide](README.md) for authentication, the hearing record and [how matching works](README.md#searching).

## Free-text search

```bash
curl -s -G -H "Authorization: Bearer ${CACD_API_KEY}" \
  --data-urlencode "search=FOOBAR" \
  --data-urlencode "dateTo=$(TZ=Europe/London date +%F)" \
  --data-urlencode "sortBy=hearing_datetime" \
  --data-urlencode "sortOrder=desc" \
  --data-urlencode "limit=100" \
  "${CACD_BASE_URL}/hearings"
```

- `search` is a case-insensitive phrase matched anywhere in the case details, hearing type, additional information, judge, venue and case number.
- `dateTo=<today>` keeps it to past and present hearings; leave it out to include anything already fixed for the future.
- `sortOrder=desc` puts the most recent first.
- Results are capped at 100 per request. Read `pagination.total` and page with `offset` when the user wants everything; otherwise report the total and summarise the first page.

## By case reference

Case references look like `202600123 A1`: a nine-digit number, then a letter and digit that can change between hearings.

| Goal                                 | Parameter                 |
| ------------------------------------ | ------------------------- |
| Every hearing for a case number      | `search=202600123`        |
| One exact reference, suffix included | `caseNumber=202600123 A1` |

`caseNumber` must match the whole reference exactly, so prefer `search` unless the user gave the suffix.

## Narrowing down

| Parameter            | Effect                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| `dateFrom`, `dateTo` | Inclusive list date range, `YYYY-MM-DD`                                 |
| `dataSource`         | `1` Daily Cause List, `2` Future Hearing List; comma-separated for both |
| `sortBy`             | `hearing_datetime` (default), `case_number` or `created_at`             |
| `sortOrder`          | `desc` (default) or `asc`                                               |

## Reading the results

- A case usually has several records: an entry on the Future Hearing List, then one on each Daily Cause List it appeared in (adjourned and relisted hearings appear again). Group by case number and present a timeline rather than a flat list.
- The archive starts when scraping began on this instance. To find the earliest record, request `sortOrder=asc&limit=1`. "No results" means nothing matched in the archive, not that the case was never heard.
- Quote `sourceUrl` so the user can check the published list.
- Pass on reporting restrictions, and never suggest publishing details from a restricted case.

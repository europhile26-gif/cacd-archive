# Scraper Development

> This guide will be expanded once the second scraper is built. For now it documents the existing architecture and conventions.

## Current Scraper

The existing scraper targets daily cause lists from the Court of Appeal (Criminal Division), published at `court-tribunal-hearings.service.gov.uk`. It covers 9 divisions.

### Pipeline

1. **Link Discovery** (`src/scrapers/link-discovery.js`) — fetches the summary page and finds links to individual daily cause list pages
2. **Table Parser** (`src/scrapers/table-parser.js`) — parses HTML tables from each page into structured records
3. **Sync Service** (`src/services/sync-service.js`) — persists records to the database using full-replacement sync per date

### Key Algorithms

- [Link Discovery Algorithm](algorithm-link-discovery.md) — how links are identified and filtered
- [Table Parsing Algorithm](algorithm-table-parsing.md) — how HTML tables are mapped to hearing records

## Adding a New Scraper

When building a scraper for an additional data source, follow these conventions:

1. **Link discovery module** — responsible for fetching and extracting links from the source's index/summary page
2. **Parser module** — responsible for extracting structured records from individual pages
3. **Use the existing sync service** — records should be normalised into the same schema used by `synchronizeRecords()`
4. **Source attribution** — each record must include `sourceUrl` and `scrapedAt` so data provenance is traceable
5. **Error handling** — scrapers should handle partial failures gracefully (e.g., one page failing shouldn't abort the entire run)

## Planned Sources

- **GOV.UK Publications** (`gov.uk/government/publications`) — forward-looking "cases fixed for hearing" schedule, different format and cadence from daily cause lists

-- Migration 011: Add source_updated_at to scrape_history
-- Stores the upstream source's last-modified timestamp (e.g. GOV.UK public_updated_at)
-- Used for freshness checks to skip scrapes when upstream data hasn't changed.

ALTER TABLE scrape_history
  ADD COLUMN source_updated_at DATETIME NULL DEFAULT NULL
  AFTER duration_ms;

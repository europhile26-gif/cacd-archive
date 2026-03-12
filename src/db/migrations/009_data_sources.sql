-- Migration: Add data_sources table and link hearings/scrape_history to it
-- Version: 1.11.0
-- Date: 2026-03-12
--
-- Creates a data_sources lookup table to support multiple scraping sources.
-- Adds data_source_id FK to hearings and scrape_history tables.
-- Adds crown_court and reporting_restriction columns to hearings for FHL data.
-- Backfills existing records to the 'daily_cause_list' source.

-- 1. Create data_sources table
CREATE TABLE IF NOT EXISTS data_sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    scrape_interval_minutes INT NOT NULL DEFAULT 120,
    scrape_window_start_hour INT NOT NULL DEFAULT 8,
    scrape_window_end_hour INT NOT NULL DEFAULT 18,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_data_source_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Seed default data sources
INSERT INTO data_sources (slug, display_name, base_url, scrape_interval_minutes, scrape_window_start_hour, scrape_window_end_hour, enabled)
VALUES
    ('daily_cause_list', 'Daily Cause List', 'https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109', 120, 8, 18, 1),
    ('future_hearing_list', 'Future Hearing List', 'https://www.gov.uk/government/publications/court-of-appeal-cases-fixed-for-hearing-criminal-division', 720, 0, 24, 1);

-- 3. Add data_source_id to hearings (nullable initially for backfill)
ALTER TABLE hearings
    ADD COLUMN data_source_id INT NULL AFTER division;

-- 4. Backfill existing hearings to 'daily_cause_list'
UPDATE hearings SET data_source_id = (SELECT id FROM data_sources WHERE slug = 'daily_cause_list');

-- 5. Make data_source_id NOT NULL and add FK
ALTER TABLE hearings
    MODIFY COLUMN data_source_id INT NOT NULL,
    ADD CONSTRAINT fk_hearings_data_source FOREIGN KEY (data_source_id) REFERENCES data_sources(id);

-- 6. Add index on data_source_id (replaces idx_division for source-scoped queries)
CREATE INDEX idx_data_source_id ON hearings(data_source_id);
CREATE INDEX idx_data_source_list_date ON hearings(data_source_id, list_date DESC);

-- 7. Add FHL-specific columns to hearings
ALTER TABLE hearings
    ADD COLUMN crown_court VARCHAR(255) NULL AFTER additional_information,
    ADD COLUMN reporting_restriction TEXT NULL AFTER crown_court;

-- 8. Add data_source_id to scrape_history (nullable initially for backfill)
ALTER TABLE scrape_history
    ADD COLUMN data_source_id INT NULL AFTER scrape_type;

-- 9. Backfill existing scrape_history to 'daily_cause_list'
UPDATE scrape_history SET data_source_id = (SELECT id FROM data_sources WHERE slug = 'daily_cause_list');

-- 10. Make scrape_history.data_source_id NOT NULL and add FK
ALTER TABLE scrape_history
    MODIFY COLUMN data_source_id INT NOT NULL,
    ADD CONSTRAINT fk_scrape_history_data_source FOREIGN KEY (data_source_id) REFERENCES data_sources(id);

-- 11. Add index for per-source scrape history queries (used by shouldScrape)
CREATE INDEX idx_scrape_history_source_status ON scrape_history(data_source_id, status, started_at DESC);

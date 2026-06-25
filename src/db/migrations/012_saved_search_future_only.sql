-- Migration 012: Add future_only flag to saved_searches
-- When set, a saved search only matches hearings whose start time is still in
-- the future relative to the current moment (Europe/London). hearing_datetime
-- is stored as a UTC instant, so the matcher compares it against UTC_TIMESTAMP().
-- Defaults to FALSE to preserve existing behaviour (match today + tomorrow).

ALTER TABLE saved_searches
  ADD COLUMN future_only BOOLEAN NOT NULL DEFAULT FALSE
  COMMENT 'Only match hearings whose start time is still in the future (Europe/London)'
  AFTER enabled;

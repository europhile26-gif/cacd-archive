-- Add composite index for the /api/v1/dates endpoint
-- which GROUP BY list_date, division ORDER BY list_date DESC
CREATE INDEX idx_division_list_date ON hearings(division, list_date DESC);

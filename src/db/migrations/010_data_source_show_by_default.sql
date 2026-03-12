-- Add show_by_default column to data_sources
ALTER TABLE data_sources
  ADD COLUMN show_by_default TINYINT(1) NOT NULL DEFAULT 1 AFTER enabled;

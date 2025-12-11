-- Migration: Add scrape history tracking table
-- Version: 0.2.0
-- Date: 2025-12-11

CREATE TABLE IF NOT EXISTS scrape_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Scrape details
    scrape_type ENUM('scheduled', 'startup', 'manual') NOT NULL,
    status ENUM('success', 'partial', 'failed') NOT NULL,
    
    -- Links discovered and processed
    links_discovered INT DEFAULT 0,
    links_processed INT DEFAULT 0,
    
    -- Records stats
    records_added INT DEFAULT 0,
    records_updated INT DEFAULT 0,
    records_deleted INT DEFAULT 0,
    
    -- Request details
    summary_page_url VARCHAR(500),
    summary_page_status INT,
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    duration_ms INT,
    
    -- Error tracking
    error_message TEXT,
    error_details JSON,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_started_at (started_at),
    INDEX idx_status (status),
    INDEX idx_scrape_type (scrape_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add index to hearings for faster sync queries
ALTER TABLE hearings 
ADD INDEX idx_list_date_scraped (list_date, scraped_at);

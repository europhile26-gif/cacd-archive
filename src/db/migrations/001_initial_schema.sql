-- Create hearings table
CREATE TABLE IF NOT EXISTS hearings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Composite key components
    list_date DATE NOT NULL,
    case_number VARCHAR(50) NOT NULL,
    time VARCHAR(20) NOT NULL,
    
    -- Datetime for sorting/filtering
    hearing_datetime DATETIME NOT NULL,
    
    -- Case information
    venue VARCHAR(255),
    judge TEXT,
    case_details TEXT,
    hearing_type VARCHAR(255),
    additional_information TEXT,
    
    -- Metadata
    division ENUM('Criminal', 'Civil') NOT NULL,
    source_url VARCHAR(500) NOT NULL,
    scraped_at TIMESTAMP NOT NULL,
    scrape_version INT DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    UNIQUE KEY unique_hearing (list_date, case_number, time),
    INDEX idx_hearing_datetime (hearing_datetime),
    INDEX idx_case_number (case_number),
    INDEX idx_list_date (list_date),
    INDEX idx_division (division),
    FULLTEXT INDEX ft_search (case_details, hearing_type, additional_information, judge, venue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

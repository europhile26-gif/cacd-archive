-- Saved Searches and Notifications Migration
-- Adds saved search functionality with email notification tracking
-- Migration 007

-- Saved searches table
CREATE TABLE IF NOT EXISTS saved_searches (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    search_text VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE COMMENT 'Is this search active?',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user (user_id),
    INDEX idx_enabled (enabled),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Search match notifications tracking
-- Records when users were notified about search matches
CREATE TABLE IF NOT EXISTS search_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    match_count INT NOT NULL DEFAULT 0 COMMENT 'Number of matches included in this notification',
    searches_matched INT NOT NULL DEFAULT 0 COMMENT 'Number of different saved searches that had matches',
    
    INDEX idx_user (user_id),
    INDEX idx_sent_at (sent_at),
    INDEX idx_user_sent (user_id, sent_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add notification preferences to users table
ALTER TABLE users 
ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT TRUE COMMENT 'User wants to receive email notifications for saved searches';

-- Add index for notification queries
CREATE INDEX idx_users_notifications ON users(email_notifications_enabled);

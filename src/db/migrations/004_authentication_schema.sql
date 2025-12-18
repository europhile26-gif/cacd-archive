-- Authentication Schema Migration
-- Creates core authentication tables for user management
-- Migration 004

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Account status (references account_statuses table)
    status_id INT NOT NULL DEFAULT 1,
    
    -- Soft delete support
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_email (email),
    INDEX idx_status (status_id),
    INDEX idx_deleted (deleted_at),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account statuses table (no enums per user preference)
CREATE TABLE IF NOT EXISTS account_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT FALSE COMMENT 'Can this user log in?',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User status history for audit trail
CREATE TABLE IF NOT EXISTS user_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    status_id INT NOT NULL,
    changed_by BIGINT NULL COMMENT 'User ID of admin who made the change',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT COMMENT 'Reason for status change',
    
    INDEX idx_user (user_id),
    INDEX idx_status (status_id),
    INDEX idx_changed_at (changed_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (status_id) REFERENCES account_statuses(id),
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL DEFAULT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_token (token),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key constraint after account_statuses table exists
ALTER TABLE users 
ADD CONSTRAINT fk_user_status 
FOREIGN KEY (status_id) REFERENCES account_statuses(id);

-- Insert default account statuses
INSERT INTO account_statuses (id, name, slug, description, is_active) VALUES
(1, 'Pending Approval', 'pending', 'Account created but awaiting administrator approval', FALSE),
(2, 'Active', 'active', 'Account is active and can log in', TRUE),
(3, 'Inactive', 'inactive', 'Account temporarily deactivated', FALSE),
(4, 'Suspended', 'suspended', 'Account suspended due to policy violation', FALSE),
(5, 'Deleted', 'deleted', 'Account marked for deletion', FALSE);

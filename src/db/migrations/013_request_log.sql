-- Migration 013: Request analytics log
-- Server-side request logging for traffic analysis and probe detection. Rows are
-- written in batches by analytics-service and purged after ANALYTICS_RETENTION_DAYS.
-- Only the route pattern is stored, never the query string: the hearings endpoint
-- carries search and caseNumber values that must not be linked to a client address.
-- fingerprint is a salted daily-rotating hash of IP + user agent, used to group
-- requests into pseudo-sessions without a cookie.

CREATE TABLE IF NOT EXISTS request_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    ip VARCHAR(45) NULL COMMENT 'Client address; IPv6 needs 45 chars',
    method VARCHAR(10) NOT NULL,
    route VARCHAR(255) NOT NULL COMMENT 'Route pattern, not the raw URL',
    status_code SMALLINT UNSIGNED NOT NULL,
    duration_ms INT UNSIGNED NULL,
    user_agent VARCHAR(500) NULL,

    country_code CHAR(2) NULL COMMENT 'ISO 3166-1 alpha-2, NULL if lookup fails',
    asn INT UNSIGNED NULL,
    asn_org VARCHAR(255) NULL,

    fingerprint CHAR(64) NULL COMMENT 'sha256(secret + date + ip + user agent)',
    user_id BIGINT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_created (created_at),
    INDEX idx_ip_created (ip, created_at),
    INDEX idx_country_created (country_code, created_at),
    INDEX idx_route_created (route, created_at),
    INDEX idx_fingerprint_created (fingerprint, created_at),
    INDEX idx_asn_created (asn, created_at),

    -- Clearing user_id on account deletion keeps a removed account from staying
    -- linkable through the retention window.
    CONSTRAINT fk_request_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration 016: API keys
-- Long-lived credentials for agents acting on a user's behalf. The key is shown once at
-- creation; only its sha256 hash is stored. Times are UTC DATETIMEs: a TIMESTAMP NOT NULL
-- column can be given ON UPDATE CURRENT_TIMESTAMP, which would move expires_at on every use.

CREATE TABLE IF NOT EXISTS api_keys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    public_id CHAR(8) NOT NULL,
    secret_hash CHAR(64) NOT NULL COMMENT 'sha256 hex of the full key',
    label VARCHAR(100) NOT NULL,
    expires_at DATETIME NOT NULL,
    expiry_warning_sent_at DATETIME NULL,
    last_used_at DATETIME NULL,
    last_used_ip VARCHAR(45) NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
    UNIQUE KEY uq_api_keys_public_id (public_id),
    INDEX idx_api_keys_user (user_id),
    INDEX idx_api_keys_expiry (expires_at, expiry_warning_sent_at),
    CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

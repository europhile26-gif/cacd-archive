-- Migration 015: Session revocation
-- Every access and refresh token carries the user's token_version; a token whose
-- version no longer matches is rejected. Bumping the column logs the user out of
-- every session (password change/reset, ./bin/cacd users revoke-sessions).

ALTER TABLE users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Incremented to invalidate all issued tokens for this user'
  AFTER password_hash;

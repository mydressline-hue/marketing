-- ============================================================================
-- 010_password_reset_tokens.sql
-- Password Reset Flow - Token storage and users table update
-- ============================================================================

-- ============================================================================
-- 1. PASSWORD RESET TOKENS
-- Stores hashed password-reset tokens with expiry.  The raw token is sent to
-- the user (e.g. via email) while only the SHA-256 hash is persisted so that
-- a database leak cannot be used to reset arbitrary accounts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
    ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens (user_id);

-- ============================================================================
-- 2. ADD password_updated_at TO USERS
-- Tracks the last time a user changed or reset their password.
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 008_login_attempts.sql
-- Account Lockout & Brute Force Protection - Login attempts tracking
-- ============================================================================

-- ============================================================================
-- 1. LOGIN ATTEMPTS
-- Tracks failed login attempts per user/IP for brute force protection.
-- When attempt_count exceeds the configured threshold the account is locked
-- until `locked_until`.  Exponential lockout durations are applied for
-- repeated lockout events.
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address      TEXT NOT NULL,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_login_attempts_user_ip UNIQUE (user_id, ip_address)
);

CREATE INDEX idx_login_attempts_user_id ON login_attempts (user_id);
CREATE INDEX idx_login_attempts_ip_address ON login_attempts (ip_address);
CREATE INDEX idx_login_attempts_locked_until ON login_attempts (locked_until);

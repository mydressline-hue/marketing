-- ============================================================================
-- 008_mfa.sql
-- Multi-Factor Authentication (TOTP) support
-- ============================================================================

-- ============================================================================
-- 1. MFA CREDENTIALS
-- Stores TOTP secrets (encrypted) and recovery codes per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS mfa_credentials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret          TEXT NOT NULL,
    recovery_codes  TEXT NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mfa_credentials_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_mfa_credentials_user_id ON mfa_credentials (user_id);

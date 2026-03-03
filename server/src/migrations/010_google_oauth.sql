-- ============================================================================
-- 010_google_oauth.sql
-- Add OAuth provider columns to the users table for Google OAuth support.
--
-- All statements use IF NOT EXISTS / IF NOT NULL guards for idempotency.
-- ============================================================================

-- ── OAuth provider and external ID ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── Unique composite index for provider lookups ─────────────────────────────
-- Ensures a given OAuth provider + id pair maps to exactly one user.
-- Partial index (WHERE oauth_provider IS NOT NULL) avoids indexing rows
-- that were created via email/password registration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
    ON users(oauth_provider, oauth_id)
    WHERE oauth_provider IS NOT NULL;

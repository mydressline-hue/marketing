-- ============================================================================
-- 011_feature_flags.sql
-- Feature Flags - DB-backed feature flag system with gradual rollout support
-- ============================================================================

-- ============================================================================
-- 1. FEATURE_FLAGS TABLE
-- Stores feature flags with toggle state, rollout percentage, and metadata.
-- The rollout_percentage column (0-100) enables gradual rollouts where a
-- deterministic hash of (userId + flagName) decides whether a specific user
-- sees the feature, ensuring consistency across requests.
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    description         TEXT,
    is_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percentage  INTEGER NOT NULL DEFAULT 100
                        CONSTRAINT feature_flags_rollout_range CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags (name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_is_enabled ON feature_flags (is_enabled);

-- ============================================================================
-- 011_bandit_models.sql
-- Tier 3 Contextual Bandits -- multi-armed bandit model persistence layer
-- ============================================================================

-- ============================================================================
-- 1. BANDIT ARMS
-- Stores per-arm parameters for both Beta-Binomial (binary outcomes) and
-- Normal-Inverse Gamma (continuous outcomes) models.
-- ============================================================================
CREATE TABLE IF NOT EXISTS bandit_arms (
    id                TEXT PRIMARY KEY,
    context_type      TEXT NOT NULL,                -- e.g. 'campaign_variant', 'channel', 'send_time'
    arm_name          TEXT NOT NULL,
    -- Beta-Binomial parameters (binary outcomes: click/no-click)
    alpha             DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    beta              DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    -- Normal-Inverse Gamma parameters (continuous outcomes: revenue)
    mu                DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    lambda            DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    a                 DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    b                 DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    -- Metadata
    observation_count INTEGER NOT NULL DEFAULT 0,
    last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (context_type, arm_name)
);

CREATE INDEX IF NOT EXISTS idx_bandit_arms_context_type
    ON bandit_arms (context_type);

CREATE INDEX IF NOT EXISTS idx_bandit_arms_context_type_obs
    ON bandit_arms (context_type, observation_count DESC);

-- ============================================================================
-- 2. BANDIT OBSERVATIONS
-- Raw observation log with time-decayable weights.
-- ============================================================================
CREATE TABLE IF NOT EXISTS bandit_observations (
    id              TEXT PRIMARY KEY,
    arm_id          TEXT NOT NULL REFERENCES bandit_arms(id) ON DELETE CASCADE,
    context_vector  JSONB,
    reward          DOUBLE PRECISION NOT NULL,
    reward_type     TEXT NOT NULL CHECK (reward_type IN ('binary', 'continuous')),
    decayed_weight  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bandit_observations_arm_id
    ON bandit_observations (arm_id);

CREATE INDEX IF NOT EXISTS idx_bandit_observations_observed_at
    ON bandit_observations (observed_at);

CREATE INDEX IF NOT EXISTS idx_bandit_observations_arm_observed
    ON bandit_observations (arm_id, observed_at DESC);

-- ============================================================================
-- 3. BANDIT CONTEXT WEIGHTS
-- Per-feature linear weights for the contextual layer (LinUCB-inspired).
-- ============================================================================
CREATE TABLE IF NOT EXISTS bandit_context_weights (
    id              TEXT PRIMARY KEY,
    arm_id          TEXT NOT NULL REFERENCES bandit_arms(id) ON DELETE CASCADE,
    feature_name    TEXT NOT NULL,
    weight          DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (arm_id, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_bandit_context_weights_arm_id
    ON bandit_context_weights (arm_id);

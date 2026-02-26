-- ==========================================================================
-- Migration 006: Final Outputs Tables
--
-- Phase 10 schema additions for storing generated final output deliverables,
-- validation results, and recommendation tracking.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Final output snapshots
--    Stores point-in-time snapshots of each deliverable for historical
--    tracking and audit purposes.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS final_output_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable     VARCHAR(50) NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    data            JSONB NOT NULL,
    confidence      NUMERIC(5,2),
    countries_count INTEGER DEFAULT 0,
    generated_by    VARCHAR(100),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_output_snapshots_deliverable
    ON final_output_snapshots (deliverable, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_final_output_snapshots_generated_at
    ON final_output_snapshots (generated_at DESC);

-- --------------------------------------------------------------------------
-- 2. Validation results
--    Records each validation run across all deliverables.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS final_output_validations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_type     VARCHAR(50) NOT NULL,
    deliverable         VARCHAR(50),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_checks        INTEGER NOT NULL DEFAULT 0,
    passed_checks       INTEGER NOT NULL DEFAULT 0,
    failed_checks       INTEGER NOT NULL DEFAULT 0,
    warnings            INTEGER NOT NULL DEFAULT 0,
    details             JSONB,
    overall_confidence  NUMERIC(5,2),
    validated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_output_validations_type
    ON final_output_validations (validation_type, validated_at DESC);

CREATE INDEX IF NOT EXISTS idx_final_output_validations_deliverable
    ON final_output_validations (deliverable, validated_at DESC);

-- --------------------------------------------------------------------------
-- 3. Perfection recommendations
--    Tracks improvement recommendations with status tracking.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS final_output_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(50) NOT NULL,
    agent_type      VARCHAR(50),
    action          TEXT NOT NULL,
    priority        VARCHAR(10) NOT NULL DEFAULT 'medium',
    effort          VARCHAR(10) NOT NULL DEFAULT 'medium',
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
    assigned_to     VARCHAR(100),
    notes           TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_output_recommendations_category
    ON final_output_recommendations (category, status);

CREATE INDEX IF NOT EXISTS idx_final_output_recommendations_status
    ON final_output_recommendations (status, priority);

-- --------------------------------------------------------------------------
-- 4. Weakness tracking
--    Stores identified weaknesses for monitoring and resolution.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS final_output_weaknesses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type          VARCHAR(50) NOT NULL,
    country_code        VARCHAR(5),
    category            VARCHAR(50) NOT NULL,
    severity            VARCHAR(10) NOT NULL DEFAULT 'medium',
    description         TEXT NOT NULL,
    confidence_score    NUMERIC(5,2),
    decision_id         UUID,
    status              VARCHAR(20) NOT NULL DEFAULT 'open',
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_output_weaknesses_agent
    ON final_output_weaknesses (agent_type, status);

CREATE INDEX IF NOT EXISTS idx_final_output_weaknesses_category
    ON final_output_weaknesses (category, severity);

CREATE INDEX IF NOT EXISTS idx_final_output_weaknesses_country
    ON final_output_weaknesses (country_code)
    WHERE country_code IS NOT NULL;

-- --------------------------------------------------------------------------
-- 5. Maturity scores
--    Tracks maturity level progression over time per agent.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS final_output_maturity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type          VARCHAR(50) NOT NULL,
    maturity_score      NUMERIC(5,1) NOT NULL,
    maturity_level      VARCHAR(20) NOT NULL,
    avg_confidence      NUMERIC(5,2),
    coverage_pct        NUMERIC(5,1),
    countries_covered   INTEGER DEFAULT 0,
    total_decisions     INTEGER DEFAULT 0,
    assessed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_output_maturity_agent
    ON final_output_maturity (agent_type, assessed_at DESC);

-- --------------------------------------------------------------------------
-- 6. Deploy readiness log
--    Records deployment readiness check results.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deployment_readiness_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_type      VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    details         JSONB,
    checked_by      VARCHAR(100),
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_readiness_log_type
    ON deployment_readiness_log (check_type, checked_at DESC);

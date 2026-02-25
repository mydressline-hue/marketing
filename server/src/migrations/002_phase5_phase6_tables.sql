-- Phase 5: Kill Switch & Governance

-- Trigger configurations (for automated triggers)
CREATE TABLE IF NOT EXISTS trigger_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_type VARCHAR(100) NOT NULL UNIQUE,
    threshold NUMERIC(10,4) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    kill_switch_level INTEGER NOT NULL DEFAULT 2,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger events (audit of trigger evaluations)
CREATE TABLE IF NOT EXISTS trigger_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_type VARCHAR(100) NOT NULL,
    fired BOOLEAN NOT NULL DEFAULT FALSE,
    current_value NUMERIC(15,4) NOT NULL,
    threshold NUMERIC(10,4) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Governance: Risk assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
    agent_type VARCHAR(100) NOT NULL,
    risk_score NUMERIC(5,2) NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    factors JSONB NOT NULL DEFAULT '[]',
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Governance: Approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
    agent_type VARCHAR(100) NOT NULL,
    risk_assessment_id UUID REFERENCES risk_assessments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    CONSTRAINT approval_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

-- Governance: Rollback plans
CREATE TABLE IF NOT EXISTS rollback_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
    steps JSONB NOT NULL DEFAULT '[]',
    estimated_impact TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Governance: Policy configuration
CREATE TABLE IF NOT EXISTS governance_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_key VARCHAR(100) NOT NULL UNIQUE,
    policy_value JSONB NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 6: Enterprise Infrastructure

-- Alert configurations
CREATE TABLE IF NOT EXISTS alert_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    metric VARCHAR(100) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    threshold NUMERIC(15,4) NOT NULL,
    channels JSONB NOT NULL DEFAULT '[]',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID REFERENCES alert_configurations(id) ON DELETE SET NULL,
    metric VARCHAR(100) NOT NULL,
    current_value NUMERIC(15,4) NOT NULL,
    threshold NUMERIC(15,4) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    channels_notified JSONB DEFAULT '[]',
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Escalation rules
CREATE TABLE IF NOT EXISTS escalation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    condition VARCHAR(100) NOT NULL,
    alert_count INTEGER NOT NULL DEFAULT 3,
    time_window_minutes INTEGER NOT NULL DEFAULT 30,
    escalation_action TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IP Whitelist
CREATE TABLE IF NOT EXISTS ip_whitelist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address INET NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Agent access scopes
CREATE TABLE IF NOT EXISTS agent_access_scopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type VARCHAR(100) NOT NULL UNIQUE,
    allowed_tables JSONB NOT NULL DEFAULT '[]',
    allowed_operations JSONB NOT NULL DEFAULT '[]',
    max_query_rate INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Secrets vault
CREATE TABLE IF NOT EXISTS secrets_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL UNIQUE,
    encrypted_value TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributed traces
CREATE TABLE IF NOT EXISTS traces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    root_operation VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ok',
    total_duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trace_spans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id UUID NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    parent_span_id UUID REFERENCES trace_spans(id) ON DELETE SET NULL,
    operation VARCHAR(200) NOT NULL,
    service VARCHAR(100) NOT NULL,
    agent_type VARCHAR(100),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_ms INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'ok',
    metadata JSONB DEFAULT '{}'
);

-- Log retention policies
CREATE TABLE IF NOT EXISTS log_retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_type VARCHAR(100) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL DEFAULT 365,
    archive_after_days INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup history
CREATE TABLE IF NOT EXISTS backup_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    size_mb NUMERIC(10,2),
    tables_backed_up JSONB DEFAULT '[]',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Circuit breaker state
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    service VARCHAR(100) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed',
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    threshold INTEGER NOT NULL DEFAULT 5,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data quality scores
CREATE TABLE IF NOT EXISTS data_quality_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    completeness NUMERIC(5,2) NOT NULL DEFAULT 0,
    accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
    consistency NUMERIC(5,2) NOT NULL DEFAULT 0,
    timeliness NUMERIC(5,2) NOT NULL DEFAULT 0,
    overall NUMERIC(5,2) NOT NULL DEFAULT 0,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data lineage
CREATE TABLE IF NOT EXISTS data_lineage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL UNIQUE,
    upstream_sources JSONB NOT NULL DEFAULT '[]',
    downstream_consumers JSONB NOT NULL DEFAULT '[]',
    transformations JSONB NOT NULL DEFAULT '[]',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PII registry
CREATE TABLE IF NOT EXISTS pii_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    pii_type VARCHAR(50) NOT NULL,
    is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
    anonymization_method VARCHAR(50),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(table_name, column_name)
);

-- Consent records
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    regulation VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create all necessary indexes
CREATE INDEX IF NOT EXISTS idx_trigger_events_type ON trigger_events (trigger_type);
CREATE INDEX IF NOT EXISTS idx_trigger_events_created ON trigger_events (created_at);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_decision ON risk_assessments (decision_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_decision ON approval_requests (decision_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts (acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts (severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_trace_spans_trace ON trace_spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_spans_service ON trace_spans (service);
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON consent_records (user_id);
CREATE INDEX IF NOT EXISTS idx_data_quality_table ON data_quality_scores (table_name);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history (status);

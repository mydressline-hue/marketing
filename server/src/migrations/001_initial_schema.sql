-- ============================================================================
-- 001_initial_schema.sql
-- AI Growth Engine - Initial Database Schema
-- PostgreSQL migration with UUID primary keys, foreign keys, indexes
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ROLES
-- ============================================================================
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT roles_name_check CHECK (name IN ('admin', 'analyst', 'campaign_manager', 'viewer'))
);

-- ============================================================================
-- 2. USERS
-- ============================================================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    role          VARCHAR(50) NOT NULL DEFAULT 'viewer',
    mfa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret    VARCHAR(255),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_is_active ON users (is_active);
CREATE INDEX idx_users_created_at ON users (created_at);

-- ============================================================================
-- 3. API KEYS
-- ============================================================================
CREATE TABLE api_keys (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash      VARCHAR(255) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    scopes        JSONB NOT NULL DEFAULT '[]',
    encrypted_key TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at    TIMESTAMPTZ,
    last_used_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys (is_active);
CREATE INDEX idx_api_keys_created_at ON api_keys (created_at);

-- ============================================================================
-- 4. SESSIONS
-- ============================================================================
CREATE TABLE sessions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_sessions_created_at ON sessions (created_at);

-- ============================================================================
-- 5. AUDIT LOGS (immutable - no updated_at)
-- ============================================================================
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action        VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255),
    resource_id   UUID,
    details       JSONB DEFAULT '{}',
    ip_address    INET,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs (resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs (resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);

-- ============================================================================
-- 6. COUNTRIES
-- ============================================================================
CREATE TABLE countries (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  VARCHAR(255) NOT NULL,
    code                  VARCHAR(2) NOT NULL UNIQUE,
    region                VARCHAR(100),
    language              VARCHAR(50),
    currency              VARCHAR(10),
    timezone              VARCHAR(50),
    gdp                   NUMERIC(15, 2),
    internet_penetration  NUMERIC(5, 2),
    ecommerce_adoption    NUMERIC(5, 2),
    social_platforms      JSONB DEFAULT '{}',
    ad_costs              JSONB DEFAULT '{}',
    cultural_behavior     JSONB DEFAULT '{}',
    opportunity_score     NUMERIC(5, 2),
    entry_strategy        TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_countries_code ON countries (code);
CREATE INDEX idx_countries_region ON countries (region);
CREATE INDEX idx_countries_is_active ON countries (is_active);
CREATE INDEX idx_countries_opportunity_score ON countries (opportunity_score);
CREATE INDEX idx_countries_created_at ON countries (created_at);

-- ============================================================================
-- 7. CAMPAIGNS
-- ============================================================================
CREATE TABLE campaigns (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
    platform   VARCHAR(100) NOT NULL,
    type       VARCHAR(100) NOT NULL,
    status     VARCHAR(50) NOT NULL DEFAULT 'draft',
    budget     NUMERIC(15, 2),
    spent      NUMERIC(15, 2) DEFAULT 0,
    start_date DATE,
    end_date   DATE,
    targeting  JSONB DEFAULT '{}',
    metrics    JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT campaigns_status_check CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))
);

CREATE INDEX idx_campaigns_country_id ON campaigns (country_id);
CREATE INDEX idx_campaigns_platform ON campaigns (platform);
CREATE INDEX idx_campaigns_status ON campaigns (status);
CREATE INDEX idx_campaigns_created_by ON campaigns (created_by);
CREATE INDEX idx_campaigns_created_at ON campaigns (created_at);
CREATE INDEX idx_campaigns_start_date ON campaigns (start_date);
CREATE INDEX idx_campaigns_end_date ON campaigns (end_date);

-- ============================================================================
-- 8. CREATIVES
-- ============================================================================
CREATE TABLE creatives (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255) NOT NULL,
    type          VARCHAR(100) NOT NULL,
    campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    content       TEXT,
    media_urls    JSONB DEFAULT '[]',
    performance   JSONB DEFAULT '{}',
    fatigue_score NUMERIC(5, 2) DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creatives_campaign_id ON creatives (campaign_id);
CREATE INDEX idx_creatives_type ON creatives (type);
CREATE INDEX idx_creatives_is_active ON creatives (is_active);
CREATE INDEX idx_creatives_created_at ON creatives (created_at);

-- ============================================================================
-- 9. CONTENT
-- ============================================================================
CREATE TABLE content (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title        VARCHAR(500) NOT NULL,
    body         TEXT,
    status       VARCHAR(50) NOT NULL DEFAULT 'draft',
    seo_data     JSONB DEFAULT '{}',
    country_id   UUID REFERENCES countries(id) ON DELETE SET NULL,
    language     VARCHAR(50),
    shopify_id   VARCHAR(255),
    published_at TIMESTAMPTZ,
    created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT content_status_check CHECK (status IN ('draft', 'review', 'published'))
);

CREATE INDEX idx_content_status ON content (status);
CREATE INDEX idx_content_country_id ON content (country_id);
CREATE INDEX idx_content_language ON content (language);
CREATE INDEX idx_content_created_by ON content (created_by);
CREATE INDEX idx_content_created_at ON content (created_at);
CREATE INDEX idx_content_published_at ON content (published_at);

-- ============================================================================
-- 10. PRODUCTS
-- ============================================================================
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    shopify_id      VARCHAR(255) UNIQUE,
    images          JSONB DEFAULT '[]',
    variants        JSONB DEFAULT '[]',
    inventory_level INTEGER DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    synced_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_shopify_id ON products (shopify_id);
CREATE INDEX idx_products_is_active ON products (is_active);
CREATE INDEX idx_products_created_at ON products (created_at);

-- ============================================================================
-- 11. TRANSLATIONS
-- ============================================================================
CREATE TABLE translations (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_content_id     UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    language              VARCHAR(50) NOT NULL,
    translated_text       TEXT NOT NULL,
    cultural_adaptations  JSONB DEFAULT '{}',
    currency_pair         VARCHAR(20),
    status                VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_translations_source_content_id ON translations (source_content_id);
CREATE INDEX idx_translations_language ON translations (language);
CREATE INDEX idx_translations_status ON translations (status);
CREATE INDEX idx_translations_created_at ON translations (created_at);

-- ============================================================================
-- 12. COMPLIANCE RULES
-- ============================================================================
CREATE TABLE compliance_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    regulation      VARCHAR(100) NOT NULL,
    country_id      UUID REFERENCES countries(id) ON DELETE SET NULL,
    rule_definition JSONB NOT NULL DEFAULT '{}',
    severity        VARCHAR(50) NOT NULL DEFAULT 'medium',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_rules_regulation ON compliance_rules (regulation);
CREATE INDEX idx_compliance_rules_country_id ON compliance_rules (country_id);
CREATE INDEX idx_compliance_rules_severity ON compliance_rules (severity);
CREATE INDEX idx_compliance_rules_is_active ON compliance_rules (is_active);
CREATE INDEX idx_compliance_rules_created_at ON compliance_rules (created_at);

-- ============================================================================
-- 13. COMPETITORS
-- ============================================================================
CREATE TABLE competitors (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(255) NOT NULL,
    website          VARCHAR(500),
    platforms        JSONB DEFAULT '[]',
    metrics          JSONB DEFAULT '{}',
    last_analyzed_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competitors_name ON competitors (name);
CREATE INDEX idx_competitors_created_at ON competitors (created_at);

-- ============================================================================
-- 14. FRAUD ALERTS
-- ============================================================================
CREATE TABLE fraud_alerts (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type             VARCHAR(100) NOT NULL,
    campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    severity         VARCHAR(50) NOT NULL,
    confidence_score NUMERIC(5, 4),
    details          JSONB DEFAULT '{}',
    status           VARCHAR(50) NOT NULL DEFAULT 'open',
    resolved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fraud_alerts_status_check CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed'))
);

CREATE INDEX idx_fraud_alerts_campaign_id ON fraud_alerts (campaign_id);
CREATE INDEX idx_fraud_alerts_type ON fraud_alerts (type);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts (severity);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts (status);
CREATE INDEX idx_fraud_alerts_resolved_by ON fraud_alerts (resolved_by);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts (created_at);

-- ============================================================================
-- 15. A/B TESTS
-- ============================================================================
CREATE TABLE ab_tests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    type                VARCHAR(100) NOT NULL,
    campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    variants            JSONB NOT NULL DEFAULT '[]',
    status              VARCHAR(50) NOT NULL DEFAULT 'draft',
    statistical_results JSONB DEFAULT '{}',
    confidence_level    NUMERIC(5, 4),
    winner_variant      VARCHAR(255),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ab_tests_status_check CHECK (status IN ('draft', 'running', 'paused', 'completed'))
);

CREATE INDEX idx_ab_tests_campaign_id ON ab_tests (campaign_id);
CREATE INDEX idx_ab_tests_status ON ab_tests (status);
CREATE INDEX idx_ab_tests_created_by ON ab_tests (created_by);
CREATE INDEX idx_ab_tests_created_at ON ab_tests (created_at);

-- ============================================================================
-- 16. BUDGET ALLOCATIONS
-- ============================================================================
CREATE TABLE budget_allocations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id          UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
    channel_allocations JSONB NOT NULL DEFAULT '{}',
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    total_budget        NUMERIC(15, 2) NOT NULL,
    total_spent         NUMERIC(15, 2) DEFAULT 0,
    risk_guardrails     JSONB DEFAULT '{}',
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_allocations_country_id ON budget_allocations (country_id);
CREATE INDEX idx_budget_allocations_period_start ON budget_allocations (period_start);
CREATE INDEX idx_budget_allocations_period_end ON budget_allocations (period_end);
CREATE INDEX idx_budget_allocations_created_by ON budget_allocations (created_by);
CREATE INDEX idx_budget_allocations_created_at ON budget_allocations (created_at);

-- ============================================================================
-- 17. AGENT STATES
-- ============================================================================
CREATE TABLE agent_states (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type  VARCHAR(100) NOT NULL,
    status      VARCHAR(50) NOT NULL DEFAULT 'idle',
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    config      JSONB DEFAULT '{}',
    metrics     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT agent_states_status_check CHECK (status IN ('idle', 'running', 'paused', 'error'))
);

CREATE INDEX idx_agent_states_agent_type ON agent_states (agent_type);
CREATE INDEX idx_agent_states_status ON agent_states (status);
CREATE INDEX idx_agent_states_created_at ON agent_states (created_at);

-- ============================================================================
-- 18. AGENT DECISIONS
-- ============================================================================
CREATE TABLE agent_decisions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type        VARCHAR(100) NOT NULL,
    decision_type     VARCHAR(100) NOT NULL,
    input_data        JSONB NOT NULL DEFAULT '{}',
    output_data       JSONB NOT NULL DEFAULT '{}',
    confidence_score  NUMERIC(5, 4),
    reasoning         TEXT,
    challenged_by     JSONB DEFAULT '[]',
    challenge_results JSONB DEFAULT '{}',
    is_approved       BOOLEAN DEFAULT FALSE,
    approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_agent_type ON agent_decisions (agent_type);
CREATE INDEX idx_agent_decisions_decision_type ON agent_decisions (decision_type);
CREATE INDEX idx_agent_decisions_is_approved ON agent_decisions (is_approved);
CREATE INDEX idx_agent_decisions_approved_by ON agent_decisions (approved_by);
CREATE INDEX idx_agent_decisions_created_at ON agent_decisions (created_at);

-- ============================================================================
-- 19. KILL SWITCH STATE
-- ============================================================================
CREATE TABLE kill_switch_state (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level               INTEGER NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    activated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    trigger_type        VARCHAR(100),
    trigger_details     JSONB DEFAULT '{}',
    affected_countries  JSONB DEFAULT '[]',
    affected_campaigns  JSONB DEFAULT '[]',
    activated_at        TIMESTAMPTZ,
    deactivated_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT kill_switch_level_check CHECK (level >= 0 AND level <= 4)
);

CREATE INDEX idx_kill_switch_state_level ON kill_switch_state (level);
CREATE INDEX idx_kill_switch_state_is_active ON kill_switch_state (is_active);
CREATE INDEX idx_kill_switch_state_activated_by ON kill_switch_state (activated_by);
CREATE INDEX idx_kill_switch_state_created_at ON kill_switch_state (created_at);

-- ============================================================================
-- Updated_at trigger function (reusable)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables that have an updated_at column
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_countries
    BEFORE UPDATE ON countries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_campaigns
    BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_creatives
    BEFORE UPDATE ON creatives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_content
    BEFORE UPDATE ON content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_products
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_translations
    BEFORE UPDATE ON translations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_compliance_rules
    BEFORE UPDATE ON compliance_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_competitors
    BEFORE UPDATE ON competitors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_ab_tests
    BEFORE UPDATE ON ab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_budget_allocations
    BEFORE UPDATE ON budget_allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_agent_states
    BEFORE UPDATE ON agent_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed default roles
-- ============================================================================
INSERT INTO roles (name, permissions) VALUES
    ('admin', '{"all": true}'),
    ('analyst', '{"read": true, "analytics": true, "export": true}'),
    ('campaign_manager', '{"read": true, "campaigns": true, "creatives": true, "budgets": true}'),
    ('viewer', '{"read": true}')
ON CONFLICT (name) DO NOTHING;

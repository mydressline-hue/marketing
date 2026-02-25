-- ============================================================================
-- 003_phase7_tables.sql
-- AI Growth Engine - Phase 7: Advanced AI Capabilities
-- Simulation Engine, Continuous Learning, Marketing Models,
-- Strategic Commander, Campaign Health Monitor
-- ============================================================================

-- ============================================================================
-- 7A. SIMULATION ENGINE
-- ============================================================================

-- Stores all simulation runs (campaign, scaling, competitor reaction, etc.)
CREATE TABLE IF NOT EXISTS simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    params JSONB NOT NULL,
    result JSONB,
    confidence_score NUMERIC(5,2),
    risk_score NUMERIC(5,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT simulations_type_check CHECK (type IN (
        'campaign', 'scaling', 'competitor_reaction', 'cpc_inflation',
        'audience_saturation', 'sandbox', 'pre_launch_risk'
    )),
    CONSTRAINT simulations_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- ============================================================================
-- 7B. CONTINUOUS LEARNING
-- ============================================================================

-- Records strategy execution outcomes for learning
CREATE TABLE IF NOT EXISTS strategy_outcomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL,
    country VARCHAR(2),
    channel VARCHAR(50),
    outcome_metrics JSONB NOT NULL,
    success_score NUMERIC(5,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What worked per country/channel - accumulated strategy memory
CREATE TABLE IF NOT EXISTS strategy_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(2) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    strategy_type VARCHAR(100),
    description TEXT,
    performance_data JSONB,
    success_rating NUMERIC(5,2),
    learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Country-level performance metrics over time
CREATE TABLE IF NOT EXISTS country_performance_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(2) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metrics JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Creative fatigue detection and tracking data
CREATE TABLE IF NOT EXISTS creative_fatigue_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creative_id UUID NOT NULL,
    campaign_id UUID,
    fatigue_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    metrics JSONB,
    rotation_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seasonal adjustment patterns per country/channel
CREATE TABLE IF NOT EXISTS seasonal_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(2) NOT NULL,
    channel VARCHAR(50),
    pattern_type VARCHAR(50),
    pattern_data JSONB NOT NULL,
    confidence NUMERIC(5,2),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Market signal tracking for external factors
CREATE TABLE IF NOT EXISTS market_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country VARCHAR(2),
    channel VARCHAR(50),
    signal_type VARCHAR(50) NOT NULL,
    signal_data JSONB NOT NULL,
    strength NUMERIC(5,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7C. MARKETING MODELS
-- ============================================================================

-- All marketing model runs (MMM, Bayesian attribution, econometric, etc.)
CREATE TABLE IF NOT EXISTS marketing_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_type VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    params JSONB NOT NULL,
    result JSONB,
    confidence_score NUMERIC(5,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT marketing_models_type_check CHECK (model_type IN (
        'mmm', 'bayesian_attribution', 'econometric', 'geo_lift',
        'brand_lift', 'saturation', 'diminishing_returns'
    ))
);

-- Geo lift test experiments for causal measurement
CREATE TABLE IF NOT EXISTS geo_lift_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    test_regions JSONB NOT NULL,
    control_regions JSONB NOT NULL,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    result JSONB,
    incremental_lift NUMERIC(10,2),
    confidence NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Brand lift survey data and analysis
CREATE TABLE IF NOT EXISTS brand_lift_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    campaign_id UUID,
    survey_config JSONB NOT NULL,
    responses JSONB,
    analysis JSONB,
    lift_percentage NUMERIC(5,2),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Offline conversion tracking for cross-channel attribution
CREATE TABLE IF NOT EXISTS offline_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversion_type VARCHAR(50) NOT NULL,
    customer_id VARCHAR(255),
    online_touchpoints JSONB,
    conversion_data JSONB NOT NULL,
    attribution JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7D. STRATEGIC COMMANDER
-- ============================================================================

-- 30/60/90 day strategic projections
CREATE TABLE IF NOT EXISTS strategic_projections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    horizon_days INTEGER NOT NULL,
    country VARCHAR(2),
    params JSONB NOT NULL,
    projection_data JSONB NOT NULL,
    confidence_score NUMERIC(5,2),
    actual_data JSONB,
    accuracy_score NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk-weighted scenario generation and comparison
CREATE TABLE IF NOT EXISTS risk_weighted_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    scenario_type VARCHAR(50) NOT NULL,
    params JSONB NOT NULL,
    result JSONB,
    risk_score NUMERIC(5,2),
    probability NUMERIC(5,4),
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT scenarios_type_check CHECK (scenario_type IN (
        'conservative', 'base', 'aggressive', 'custom'
    ))
);

-- AI self-challenge records for decision validation
CREATE TABLE IF NOT EXISTS internal_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL,
    challenge_type VARCHAR(50),
    original_reasoning TEXT,
    counter_arguments JSONB,
    resolution TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT challenges_status_check CHECK (status IN ('open', 'resolved', 'dismissed'))
);

-- Downside exposure evaluations for risk management
CREATE TABLE IF NOT EXISTS downside_exposures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope VARCHAR(50) NOT NULL,
    scope_id VARCHAR(255),
    max_loss NUMERIC(12,2),
    probability_of_loss NUMERIC(5,4),
    risk_factors JSONB,
    mitigation_steps JSONB,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT exposures_scope_check CHECK (scope IN ('campaign', 'country', 'portfolio'))
);

-- Pre-allocation budget simulations and optimization
CREATE TABLE IF NOT EXISTS pre_budget_simulations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_budget NUMERIC(12,2) NOT NULL,
    constraints JSONB,
    proposed_allocation JSONB NOT NULL,
    projected_outcomes JSONB,
    optimized_allocation JSONB,
    confidence_score NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7E. CAMPAIGN HEALTH MONITOR
-- ============================================================================

-- Overall campaign health scores with sub-component breakdowns
CREATE TABLE IF NOT EXISTS campaign_health_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL,
    overall_score NUMERIC(5,2) NOT NULL,
    cpa_volatility_score NUMERIC(5,2),
    spend_velocity_score NUMERIC(5,2),
    creative_fatigue_score NUMERIC(5,2),
    ctr_health_score NUMERIC(5,2),
    pixel_signal_score NUMERIC(5,2),
    details JSONB,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaign health alerts with severity and acknowledgment tracking
CREATE TABLE IF NOT EXISTS health_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID,
    creative_id UUID,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT health_alerts_type_check CHECK (alert_type IN (
        'cpa_volatility', 'spend_velocity', 'creative_fatigue',
        'ctr_collapse', 'pixel_signal_loss'
    )),
    CONSTRAINT health_alerts_severity_check CHECK (severity IN (
        'low', 'medium', 'high', 'critical'
    ))
);

-- Configurable health thresholds per campaign/metric
CREATE TABLE IF NOT EXISTS health_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID,
    metric_type VARCHAR(50) NOT NULL,
    threshold_value NUMERIC(10,4) NOT NULL,
    comparison VARCHAR(10) NOT NULL DEFAULT 'gt',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT thresholds_comparison_check CHECK (comparison IN ('gt', 'lt', 'gte', 'lte', 'eq'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- 7A: Simulation Engine indexes
CREATE INDEX IF NOT EXISTS idx_simulations_type ON simulations (type);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations (status);
CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON simulations (created_at);

-- 7B: Continuous Learning indexes
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_strategy ON strategy_outcomes (strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_country ON strategy_outcomes (country);
CREATE INDEX IF NOT EXISTS idx_strategy_outcomes_recorded ON strategy_outcomes (recorded_at);

CREATE INDEX IF NOT EXISTS idx_strategy_memory_country ON strategy_memory (country);
CREATE INDEX IF NOT EXISTS idx_strategy_memory_channel ON strategy_memory (channel);
CREATE INDEX IF NOT EXISTS idx_strategy_memory_country_channel ON strategy_memory (country, channel);

CREATE INDEX IF NOT EXISTS idx_country_perf_history_country ON country_performance_history (country);
CREATE INDEX IF NOT EXISTS idx_country_perf_history_period ON country_performance_history (period_start);
CREATE INDEX IF NOT EXISTS idx_country_perf_history_country_period ON country_performance_history (country, period_start);

CREATE INDEX IF NOT EXISTS idx_creative_fatigue_creative ON creative_fatigue_tracking (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_fatigue_campaign ON creative_fatigue_tracking (campaign_id);
CREATE INDEX IF NOT EXISTS idx_creative_fatigue_creative_campaign ON creative_fatigue_tracking (creative_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_country ON seasonal_patterns (country);
CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_channel ON seasonal_patterns (channel);
CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_country_channel ON seasonal_patterns (country, channel);

CREATE INDEX IF NOT EXISTS idx_market_signals_country ON market_signals (country);
CREATE INDEX IF NOT EXISTS idx_market_signals_type ON market_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_market_signals_country_type ON market_signals (country, signal_type);

-- 7C: Marketing Models indexes
CREATE INDEX IF NOT EXISTS idx_marketing_models_type ON marketing_models (model_type);
CREATE INDEX IF NOT EXISTS idx_marketing_models_status ON marketing_models (status);
CREATE INDEX IF NOT EXISTS idx_marketing_models_type_status ON marketing_models (model_type, status);

CREATE INDEX IF NOT EXISTS idx_geo_lift_tests_status ON geo_lift_tests (status);
CREATE INDEX IF NOT EXISTS idx_geo_lift_tests_created ON geo_lift_tests (created_at);

CREATE INDEX IF NOT EXISTS idx_brand_lift_surveys_campaign ON brand_lift_surveys (campaign_id);
CREATE INDEX IF NOT EXISTS idx_brand_lift_surveys_status ON brand_lift_surveys (status);

CREATE INDEX IF NOT EXISTS idx_offline_conversions_type ON offline_conversions (conversion_type);
CREATE INDEX IF NOT EXISTS idx_offline_conversions_customer ON offline_conversions (customer_id);
CREATE INDEX IF NOT EXISTS idx_offline_conversions_type_customer ON offline_conversions (conversion_type, customer_id);

-- 7D: Strategic Commander indexes
CREATE INDEX IF NOT EXISTS idx_strategic_projections_horizon ON strategic_projections (horizon_days);
CREATE INDEX IF NOT EXISTS idx_strategic_projections_country ON strategic_projections (country);
CREATE INDEX IF NOT EXISTS idx_strategic_projections_horizon_country ON strategic_projections (horizon_days, country);

CREATE INDEX IF NOT EXISTS idx_risk_weighted_scenarios_type ON risk_weighted_scenarios (scenario_type);
CREATE INDEX IF NOT EXISTS idx_risk_weighted_scenarios_selected ON risk_weighted_scenarios (selected);

CREATE INDEX IF NOT EXISTS idx_internal_challenges_decision ON internal_challenges (decision_id);
CREATE INDEX IF NOT EXISTS idx_internal_challenges_status ON internal_challenges (status);

CREATE INDEX IF NOT EXISTS idx_downside_exposures_scope ON downside_exposures (scope);
CREATE INDEX IF NOT EXISTS idx_downside_exposures_scope_id ON downside_exposures (scope_id);

CREATE INDEX IF NOT EXISTS idx_pre_budget_simulations_created ON pre_budget_simulations (created_at);

-- 7E: Campaign Health Monitor indexes
CREATE INDEX IF NOT EXISTS idx_campaign_health_scores_campaign ON campaign_health_scores (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_health_scores_assessed ON campaign_health_scores (assessed_at);
CREATE INDEX IF NOT EXISTS idx_campaign_health_scores_campaign_assessed ON campaign_health_scores (campaign_id, assessed_at);

CREATE INDEX IF NOT EXISTS idx_health_alerts_type ON health_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_health_alerts_severity ON health_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_health_alerts_acknowledged ON health_alerts (acknowledged);
CREATE INDEX IF NOT EXISTS idx_health_alerts_type_severity_ack ON health_alerts (alert_type, severity, acknowledged);
CREATE INDEX IF NOT EXISTS idx_health_alerts_campaign ON health_alerts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_health_alerts_created ON health_alerts (created_at);

CREATE INDEX IF NOT EXISTS idx_health_thresholds_campaign ON health_thresholds (campaign_id);
CREATE INDEX IF NOT EXISTS idx_health_thresholds_metric ON health_thresholds (metric_type);

-- ============================================================================
-- TRIGGERS: updated_at auto-update for tables with updated_at column
-- ============================================================================

CREATE TRIGGER set_updated_at_health_thresholds
    BEFORE UPDATE ON health_thresholds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

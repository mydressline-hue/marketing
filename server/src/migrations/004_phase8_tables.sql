-- ============================================================================
-- 004_phase8_tables.sql
-- AI Growth Engine - Phase 8: External Integrations
-- Ad Platform Integrations, Shopify Integration,
-- CRM & Email Integrations, Analytics/BI Integrations
-- ============================================================================

-- ============================================================================
-- 8A. AD PLATFORM INTEGRATIONS (Google, Meta, TikTok, Bing, Snapchat)
-- ============================================================================

-- Stores connection credentials/tokens for each ad platform
CREATE TABLE IF NOT EXISTS platform_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_connections_platform_type_check CHECK (platform_type IN (
        'google', 'meta', 'tiktok', 'bing', 'snapchat'
    ))
);

-- Synced campaign data from external ad platforms
CREATE TABLE IF NOT EXISTS platform_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    external_campaign_id VARCHAR(255) NOT NULL,
    internal_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    sync_data JSONB,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_campaigns_platform_type_check CHECK (platform_type IN (
        'google', 'meta', 'tiktok', 'bing', 'snapchat'
    )),
    CONSTRAINT platform_campaigns_sync_status_check CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed'
    ))
);

-- Performance reports fetched from ad platforms
CREATE TABLE IF NOT EXISTS platform_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL,
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    metrics JSONB,
    raw_data JSONB,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_reports_platform_type_check CHECK (platform_type IN (
        'google', 'meta', 'tiktok', 'bing', 'snapchat'
    )),
    CONSTRAINT platform_reports_report_type_check CHECK (report_type IN (
        'daily', 'weekly', 'monthly', 'custom', 'campaign_summary', 'ad_group', 'keyword'
    ))
);

-- Bidding strategy configurations per platform
CREATE TABLE IF NOT EXISTS bidding_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    strategy_type VARCHAR(50) NOT NULL,
    params JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bidding_configurations_platform_type_check CHECK (platform_type IN (
        'google', 'meta', 'tiktok', 'bing', 'snapchat'
    )),
    CONSTRAINT bidding_configurations_strategy_type_check CHECK (strategy_type IN (
        'manual_cpc', 'target_cpa', 'target_roas', 'maximize_conversions',
        'maximize_clicks', 'lowest_cost', 'cost_cap', 'bid_cap'
    ))
);

-- Audience segments synced from ad platforms
CREATE TABLE IF NOT EXISTS platform_audiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    external_audience_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    size INTEGER,
    config JSONB,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_audiences_platform_type_check CHECK (platform_type IN (
        'google', 'meta', 'tiktok', 'bing', 'snapchat'
    )),
    CONSTRAINT platform_audiences_sync_status_check CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed'
    ))
);

-- ============================================================================
-- 8B. SHOPIFY INTEGRATION
-- ============================================================================

-- Logs of product/blog/inventory syncs with Shopify
CREATE TABLE IF NOT EXISTS shopify_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    external_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    details JSONB,
    synced_by UUID REFERENCES users(id) ON DELETE SET NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shopify_sync_logs_sync_type_check CHECK (sync_type IN (
        'full', 'incremental', 'manual', 'webhook_triggered'
    )),
    CONSTRAINT shopify_sync_logs_entity_type_check CHECK (entity_type IN (
        'product', 'blog', 'inventory', 'collection', 'order', 'customer'
    )),
    CONSTRAINT shopify_sync_logs_status_check CHECK (status IN (
        'pending', 'syncing', 'synced', 'failed'
    ))
);

-- Registered Shopify webhooks
CREATE TABLE IF NOT EXISTS shopify_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    external_webhook_id VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shopify pixel tracking event logs
CREATE TABLE IF NOT EXISTS shopify_pixel_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    page_url TEXT,
    session_id VARCHAR(255),
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shopify_pixel_events_event_type_check CHECK (event_type IN (
        'page_view', 'add_to_cart', 'begin_checkout', 'purchase',
        'view_item', 'search', 'remove_from_cart', 'custom'
    ))
);

-- ============================================================================
-- 8C. CRM & EMAIL INTEGRATIONS (Salesforce, HubSpot, Klaviyo, Mailchimp, Iterable)
-- ============================================================================

-- CRM platform connection configurations
CREATE TABLE IF NOT EXISTS crm_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    instance_url TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB,
    connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crm_connections_platform_type_check CHECK (platform_type IN (
        'salesforce', 'hubspot', 'klaviyo', 'mailchimp', 'iterable'
    ))
);

-- Sync logs for contact/lead/deal syncing with CRM platforms
CREATE TABLE IF NOT EXISTS crm_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    sync_type VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    records_synced INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    details JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT crm_sync_logs_platform_type_check CHECK (platform_type IN (
        'salesforce', 'hubspot', 'klaviyo', 'mailchimp', 'iterable'
    )),
    CONSTRAINT crm_sync_logs_sync_type_check CHECK (sync_type IN (
        'contacts', 'leads', 'deals', 'companies', 'lists', 'full'
    )),
    CONSTRAINT crm_sync_logs_direction_check CHECK (direction IN (
        'inbound', 'outbound', 'bidirectional'
    )),
    CONSTRAINT crm_sync_logs_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'partial'
    ))
);

-- Maps internal contacts to CRM platform contacts
CREATE TABLE IF NOT EXISTS crm_contact_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    internal_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crm_contact_mappings_platform_type_check CHECK (platform_type IN (
        'salesforce', 'hubspot', 'klaviyo', 'mailchimp', 'iterable'
    )),
    CONSTRAINT crm_contact_mappings_entity_type_check CHECK (entity_type IN (
        'contact', 'lead', 'deal', 'company', 'subscriber'
    ))
);

-- Email campaign sync tracking across platforms
CREATE TABLE IF NOT EXISTS email_campaign_syncs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    internal_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    external_campaign_id VARCHAR(255) NOT NULL,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    metrics JSONB,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_campaign_syncs_platform_type_check CHECK (platform_type IN (
        'salesforce', 'hubspot', 'klaviyo', 'mailchimp', 'iterable'
    )),
    CONSTRAINT email_campaign_syncs_sync_status_check CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed'
    ))
);

-- ============================================================================
-- 8D. ANALYTICS/BI INTEGRATIONS (Looker, Tableau, Power BI)
-- ============================================================================

-- BI platform connection configurations
CREATE TABLE IF NOT EXISTS analytics_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    connection_config JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT analytics_connections_platform_type_check CHECK (platform_type IN (
        'looker', 'tableau', 'power_bi'
    ))
);

-- Data export jobs to BI platforms
CREATE TABLE IF NOT EXISTS analytics_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    export_type VARCHAR(50) NOT NULL,
    query_config JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    records_exported INTEGER NOT NULL DEFAULT 0,
    file_url TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT analytics_exports_platform_type_check CHECK (platform_type IN (
        'looker', 'tableau', 'power_bi'
    )),
    CONSTRAINT analytics_exports_export_type_check CHECK (export_type IN (
        'campaign_performance', 'audience_insights', 'revenue_data',
        'attribution', 'custom_query', 'full_export'
    )),
    CONSTRAINT analytics_exports_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed'
    ))
);

-- Dashboard metadata synced from BI platforms
CREATE TABLE IF NOT EXISTS analytics_dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_type VARCHAR(50) NOT NULL,
    external_dashboard_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    config JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_refreshed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT analytics_dashboards_platform_type_check CHECK (platform_type IN (
        'looker', 'tableau', 'power_bi'
    ))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- 8A: Ad Platform Integrations indexes
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform_type ON platform_connections (platform_type);
CREATE INDEX IF NOT EXISTS idx_platform_connections_account_id ON platform_connections (account_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_is_active ON platform_connections (is_active);
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform_active ON platform_connections (platform_type, is_active);

CREATE INDEX IF NOT EXISTS idx_platform_campaigns_platform_type ON platform_campaigns (platform_type);
CREATE INDEX IF NOT EXISTS idx_platform_campaigns_external_id ON platform_campaigns (external_campaign_id);
CREATE INDEX IF NOT EXISTS idx_platform_campaigns_internal_id ON platform_campaigns (internal_campaign_id);
CREATE INDEX IF NOT EXISTS idx_platform_campaigns_sync_status ON platform_campaigns (sync_status);
CREATE INDEX IF NOT EXISTS idx_platform_campaigns_platform_status ON platform_campaigns (platform_type, sync_status);

CREATE INDEX IF NOT EXISTS idx_platform_reports_platform_type ON platform_reports (platform_type);
CREATE INDEX IF NOT EXISTS idx_platform_reports_campaign_id ON platform_reports (campaign_id);
CREATE INDEX IF NOT EXISTS idx_platform_reports_report_type ON platform_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_platform_reports_date_range ON platform_reports (date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS idx_platform_reports_platform_campaign ON platform_reports (platform_type, campaign_id);
CREATE INDEX IF NOT EXISTS idx_platform_reports_fetched_at ON platform_reports (fetched_at);

CREATE INDEX IF NOT EXISTS idx_bidding_configurations_platform_type ON bidding_configurations (platform_type);
CREATE INDEX IF NOT EXISTS idx_bidding_configurations_campaign_id ON bidding_configurations (campaign_id);
CREATE INDEX IF NOT EXISTS idx_bidding_configurations_strategy_type ON bidding_configurations (strategy_type);
CREATE INDEX IF NOT EXISTS idx_bidding_configurations_is_active ON bidding_configurations (is_active);
CREATE INDEX IF NOT EXISTS idx_bidding_configurations_platform_campaign ON bidding_configurations (platform_type, campaign_id);

CREATE INDEX IF NOT EXISTS idx_platform_audiences_platform_type ON platform_audiences (platform_type);
CREATE INDEX IF NOT EXISTS idx_platform_audiences_external_id ON platform_audiences (external_audience_id);
CREATE INDEX IF NOT EXISTS idx_platform_audiences_sync_status ON platform_audiences (sync_status);
CREATE INDEX IF NOT EXISTS idx_platform_audiences_platform_status ON platform_audiences (platform_type, sync_status);

-- 8B: Shopify Integration indexes
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_sync_type ON shopify_sync_logs (sync_type);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_entity_type ON shopify_sync_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_entity_id ON shopify_sync_logs (entity_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_external_id ON shopify_sync_logs (external_id);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_status ON shopify_sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_logs_synced_at ON shopify_sync_logs (synced_at);

CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_topic ON shopify_webhooks (topic);
CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_external_id ON shopify_webhooks (external_webhook_id);
CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_is_active ON shopify_webhooks (is_active);

CREATE INDEX IF NOT EXISTS idx_shopify_pixel_events_event_type ON shopify_pixel_events (event_type);
CREATE INDEX IF NOT EXISTS idx_shopify_pixel_events_session_id ON shopify_pixel_events (session_id);
CREATE INDEX IF NOT EXISTS idx_shopify_pixel_events_recorded_at ON shopify_pixel_events (recorded_at);
CREATE INDEX IF NOT EXISTS idx_shopify_pixel_events_type_session ON shopify_pixel_events (event_type, session_id);

-- 8C: CRM & Email Integrations indexes
CREATE INDEX IF NOT EXISTS idx_crm_connections_platform_type ON crm_connections (platform_type);
CREATE INDEX IF NOT EXISTS idx_crm_connections_is_active ON crm_connections (is_active);
CREATE INDEX IF NOT EXISTS idx_crm_connections_platform_active ON crm_connections (platform_type, is_active);

CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_platform_type ON crm_sync_logs (platform_type);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_sync_type ON crm_sync_logs (sync_type);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_direction ON crm_sync_logs (direction);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_status ON crm_sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_platform_status ON crm_sync_logs (platform_type, status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_started_at ON crm_sync_logs (started_at);

CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_platform_type ON crm_contact_mappings (platform_type);
CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_internal_id ON crm_contact_mappings (internal_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_external_id ON crm_contact_mappings (external_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_entity_type ON crm_contact_mappings (entity_type);
CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_platform_internal ON crm_contact_mappings (platform_type, internal_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_mappings_platform_external ON crm_contact_mappings (platform_type, external_id);

CREATE INDEX IF NOT EXISTS idx_email_campaign_syncs_platform_type ON email_campaign_syncs (platform_type);
CREATE INDEX IF NOT EXISTS idx_email_campaign_syncs_internal_id ON email_campaign_syncs (internal_campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_syncs_external_id ON email_campaign_syncs (external_campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_syncs_sync_status ON email_campaign_syncs (sync_status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_syncs_platform_status ON email_campaign_syncs (platform_type, sync_status);

-- 8D: Analytics/BI Integrations indexes
CREATE INDEX IF NOT EXISTS idx_analytics_connections_platform_type ON analytics_connections (platform_type);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_is_active ON analytics_connections (is_active);
CREATE INDEX IF NOT EXISTS idx_analytics_connections_platform_active ON analytics_connections (platform_type, is_active);

CREATE INDEX IF NOT EXISTS idx_analytics_exports_platform_type ON analytics_exports (platform_type);
CREATE INDEX IF NOT EXISTS idx_analytics_exports_export_type ON analytics_exports (export_type);
CREATE INDEX IF NOT EXISTS idx_analytics_exports_status ON analytics_exports (status);
CREATE INDEX IF NOT EXISTS idx_analytics_exports_platform_status ON analytics_exports (platform_type, status);
CREATE INDEX IF NOT EXISTS idx_analytics_exports_started_at ON analytics_exports (started_at);

CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_platform_type ON analytics_dashboards (platform_type);
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_external_id ON analytics_dashboards (external_dashboard_id);
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_is_active ON analytics_dashboards (is_active);
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_platform_active ON analytics_dashboards (platform_type, is_active);

-- ============================================================================
-- TRIGGERS: updated_at auto-update for tables with updated_at column
-- ============================================================================

-- 8A: Ad Platform Integrations triggers
CREATE TRIGGER set_updated_at_platform_connections
    BEFORE UPDATE ON platform_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_platform_campaigns
    BEFORE UPDATE ON platform_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_bidding_configurations
    BEFORE UPDATE ON bidding_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_platform_audiences
    BEFORE UPDATE ON platform_audiences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8B: Shopify Integration triggers
CREATE TRIGGER set_updated_at_shopify_webhooks
    BEFORE UPDATE ON shopify_webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8C: CRM & Email Integrations triggers
CREATE TRIGGER set_updated_at_crm_connections
    BEFORE UPDATE ON crm_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_email_campaign_syncs
    BEFORE UPDATE ON email_campaign_syncs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8D: Analytics/BI Integrations triggers
CREATE TRIGGER set_updated_at_analytics_connections
    BEFORE UPDATE ON analytics_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_analytics_dashboards
    BEFORE UPDATE ON analytics_dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

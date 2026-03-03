-- ============================================================================
-- 009_performance_indexes.sql
-- Composite indexes for common multi-column query patterns
--
-- All indexes use IF NOT EXISTS for idempotency and CONCURRENTLY where
-- possible for non-blocking creation on live databases.
-- ============================================================================

-- ============================================================================
-- 1. CAMPAIGNS
-- Queries frequently filter by created_by + status, created_by + platform,
-- and status + platform + created_at for listing and dashboards.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_created_by_status
    ON campaigns (created_by, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_created_by_platform
    ON campaigns (created_by, platform);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_status_platform_created_at
    ON campaigns (status, platform, created_at);

-- ============================================================================
-- 2. CONTENT
-- Content lookups commonly filter by country_id + language, country_id +
-- status, and the three-column combination for localized content listings.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_country_id_language
    ON content (country_id, language);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_country_id_status
    ON content (country_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_country_id_language_status
    ON content (country_id, language, status);

-- ============================================================================
-- 3. BUDGET ALLOCATIONS
-- Budget queries look up allocations by country + period range.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budget_allocations_country_id_period
    ON budget_allocations (country_id, period_start, period_end);

-- ============================================================================
-- 4. API KEYS
-- Active key lookups for a user are the most common access pattern.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_user_id_is_active
    ON api_keys (user_id, is_active);

-- ============================================================================
-- 5. SESSIONS
-- Session validation checks user_id + expires_at to find active sessions.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_id_expires_at
    ON sessions (user_id, expires_at);

-- ============================================================================
-- 6. AUDIT LOGS
-- Audit log queries filter by user + action, user + created_at, and the
-- three-column combination for filtered audit trails.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id_action
    ON audit_logs (user_id, action);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id_created_at
    ON audit_logs (user_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id_action_created_at
    ON audit_logs (user_id, action, created_at);

-- ============================================================================
-- 7. CRM CONNECTIONS
-- CRM connection lookups almost always filter by connected_by (the user FK)
-- and platform_type together, often with is_active.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_connections_connected_by_platform_type
    ON crm_connections (connected_by, platform_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_connections_connected_by_platform_type_active
    ON crm_connections (connected_by, platform_type)
    WHERE is_active = true;

-- ============================================================================
-- 8. CRM SYNC LOGS
-- Sync log queries filter by platform_type + status + started_at for
-- monitoring sync health and history.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_sync_logs_platform_status_started_at
    ON crm_sync_logs (platform_type, status, started_at);

-- ============================================================================
-- 9. ALERTS (Phase 6 enterprise alerts table)
-- Dashboard and monitoring queries filter by severity + resolved status,
-- and severity + resolved + created_at for time-range scans.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_severity_resolved
    ON alerts (severity, resolved);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_severity_resolved_created_at
    ON alerts (severity, resolved, created_at);

-- ============================================================================
-- 10. FRAUD ALERTS
-- Fraud monitoring queries filter by severity + status, and severity +
-- status + created_at for time-based dashboards.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_alerts_severity_status_created_at
    ON fraud_alerts (severity, status, created_at);

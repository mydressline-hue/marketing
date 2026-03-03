/**
 * Dashboard Service.
 *
 * Provides a unified, read-only API that aggregates data from campaigns,
 * integrations (ad-platform, CRM, analytics/BI), agents, alerts, the kill
 * switch, and audit logs into a single dashboard payload. Heavy queries are
 * executed in parallel via `Promise.all` and results are cached in Redis
 * with a short TTL to keep the dashboard snappy.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpendByPlatform {
  platform: string;
  spend: number;
  currency: string;
}

export interface SpendTrend {
  date: string;
  amount: number;
}

export interface SpendOverview {
  total_spend: number;
  spend_by_platform: SpendByPlatform[];
  spend_trend: SpendTrend[];
}

export interface CampaignsByPlatform {
  platform: string;
  count: number;
}

export interface CampaignsOverview {
  total: number;
  active: number;
  paused: number;
  draft: number;
  by_platform: CampaignsByPlatform[];
}

export interface IntegrationPlatform {
  platform: string;
  status: string;
  last_sync: string | null;
  health: string;
}

export interface SyncHealth {
  healthy: number;
  degraded: number;
  error: number;
}

export interface IntegrationsOverview {
  total_connected: number;
  total_available: number;
  platforms: IntegrationPlatform[];
  sync_health: SyncHealth;
}

export interface CrmContactsByPlatform {
  platform: string;
  count: number;
}

export interface CrmRecentSync {
  platform: string;
  synced_at: string;
  records: number;
}

export interface CrmOverview {
  total_contacts: number;
  contacts_by_platform: CrmContactsByPlatform[];
  recent_syncs: CrmRecentSync[];
}

export interface AgentsOverview {
  total: number;
  active: number;
  paused: number;
  idle: number;
}

export interface AlertsOverview {
  total_active: number;
  critical: number;
  warning: number;
  info: number;
  unacknowledged: number;
}

export interface SystemOverview {
  kill_switch_level: number | null;
  kill_switch_active: boolean;
  countries_active: number;
  market_readiness_avg: number;
}

export interface DashboardOverview {
  spend: SpendOverview;
  campaigns: CampaignsOverview;
  integrations: IntegrationsOverview;
  crm: CrmOverview;
  agents: AgentsOverview;
  alerts: AlertsOverview;
  system: SystemOverview;
}

export interface SpendBreakdown {
  total_spend: number;
  by_platform: { platform: string; spend: number }[];
  by_country: { country: string; spend: number }[];
  daily_spend: { date: string; amount: number }[];
}

export interface CampaignPerformanceRow {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface IntegrationHealthDetail {
  platform: string;
  type: string;
  is_active: boolean;
  last_sync: string | null;
  health: string;
  recent_syncs: { status: string; records: number; started_at: string; completed_at: string | null }[];
}

export interface ActivityEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'dashboard';
const OVERVIEW_TTL = 60; // seconds

// ---------------------------------------------------------------------------
// Known platform counts (total available regardless of connection state)
// ---------------------------------------------------------------------------

const TOTAL_AD_PLATFORMS = 5;   // google, meta, tiktok, bing, snapchat
const TOTAL_CRM_PLATFORMS = 5;  // salesforce, hubspot, klaviyo, mailchimp, iterable
const TOTAL_BI_PLATFORMS = 3;   // looker, tableau, power_bi
const TOTAL_AVAILABLE_PLATFORMS = TOTAL_AD_PLATFORMS + TOTAL_CRM_PLATFORMS + TOTAL_BI_PLATFORMS;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DashboardService {
  /**
   * Return the full dashboard overview for the authenticated user.
   *
   * All independent database queries are executed in parallel with
   * `Promise.all`. The assembled result is cached for 60 seconds.
   */
  static async getOverview(userId: string): Promise<DashboardOverview> {
    const cacheKey = `${CACHE_PREFIX}:overview:${userId}`;
    const cached = await cacheGet<DashboardOverview>(cacheKey);

    if (cached) {
      logger.debug('Dashboard overview cache hit', { userId, cacheKey });
      return cached;
    }

    // -----------------------------------------------------------------------
    // Fire all independent queries in parallel
    // -----------------------------------------------------------------------

    const [
      spendResult,
      spendByPlatformResult,
      spendTrendResult,
      campaignStatusResult,
      campaignByPlatformResult,
      adPlatformsResult,
      crmPlatformsResult,
      analyticsPlatformsResult,
      crmContactsResult,
      crmRecentSyncsResult,
      agentsResult,
      alertsResult,
      killSwitchResult,
      countriesResult,
    ] = await Promise.all([
      // -- Spend: total --
      pool.query<{ total_spend: string }>(
        `SELECT COALESCE(SUM(spent), 0) AS total_spend FROM campaigns`,
      ),

      // -- Spend: by platform --
      pool.query<{ platform: string; spend: string; currency: string }>(
        `SELECT platform, COALESCE(SUM(spent), 0) AS spend, COALESCE(MAX(currency), 'USD') AS currency
         FROM campaigns
         GROUP BY platform
         ORDER BY spend DESC`,
      ),

      // -- Spend: trend (last 30 days) --
      pool.query<{ date: string; amount: string }>(
        `SELECT d::date::text AS date,
                COALESCE(SUM(c.spent), 0) AS amount
         FROM generate_series(
                CURRENT_DATE - INTERVAL '29 days',
                CURRENT_DATE,
                '1 day'
              ) AS d
         LEFT JOIN campaigns c
           ON c.created_at::date <= d::date
          AND (c.end_date IS NULL OR c.end_date >= d::date)
          AND c.status IN ('active', 'completed')
         GROUP BY d
         ORDER BY d`,
      ),

      // -- Campaigns: status counts --
      pool.query<{ total: string; active: string; paused: string; draft: string }>(
        `SELECT
           COUNT(*)::text                                    AS total,
           COUNT(*) FILTER (WHERE status = 'active')::text   AS active,
           COUNT(*) FILTER (WHERE status = 'paused')::text   AS paused,
           COUNT(*) FILTER (WHERE status = 'draft')::text    AS draft
         FROM campaigns`,
      ),

      // -- Campaigns: by platform --
      pool.query<{ platform: string; count: string }>(
        `SELECT platform, COUNT(*)::text AS count
         FROM campaigns
         GROUP BY platform
         ORDER BY count DESC`,
      ),

      // -- Integrations: ad platforms --
      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM platform_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      // -- Integrations: CRM platforms --
      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM crm_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      // -- Integrations: analytics/BI platforms --
      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM analytics_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      // -- CRM: contact counts by platform --
      pool.query<{ platform_type: string; count: string }>(
        `SELECT platform_type, COUNT(*)::text AS count
         FROM crm_contact_mappings
         GROUP BY platform_type
         ORDER BY count DESC`,
      ),

      // -- CRM: recent syncs (last 10) --
      pool.query<{ platform_type: string; started_at: string; records_synced: string }>(
        `SELECT platform_type, started_at, records_synced::text
         FROM crm_sync_logs
         WHERE status = 'completed'
         ORDER BY started_at DESC
         LIMIT 10`,
      ),

      // -- Agents: status counts --
      pool.query<{ total: string; active: string; paused: string; idle: string }>(
        `SELECT
           COUNT(*)::text                                     AS total,
           COUNT(*) FILTER (WHERE status = 'running')::text   AS active,
           COUNT(*) FILTER (WHERE status = 'paused')::text    AS paused,
           COUNT(*) FILTER (WHERE status = 'idle')::text      AS idle
         FROM agent_states`,
      ),

      // -- Alerts: counts by severity/acknowledged --
      pool.query<{
        total_active: string;
        critical: string;
        warning: string;
        info: string;
        unacknowledged: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE resolved = FALSE)::text                              AS total_active,
           COUNT(*) FILTER (WHERE severity = 'critical' AND resolved = FALSE)::text    AS critical,
           COUNT(*) FILTER (WHERE severity = 'warning' AND resolved = FALSE)::text     AS warning,
           COUNT(*) FILTER (WHERE severity = 'info' AND resolved = FALSE)::text        AS info,
           COUNT(*) FILTER (WHERE acknowledged = FALSE AND resolved = FALSE)::text     AS unacknowledged
         FROM alerts`,
      ),

      // -- System: kill switch --
      pool.query<{ level: number; is_active: boolean }>(
        `SELECT level, is_active
         FROM kill_switch_state
         WHERE is_active = TRUE
         ORDER BY created_at DESC
         LIMIT 1`,
      ),

      // -- System: active countries & avg opportunity_score --
      pool.query<{ countries_active: string; market_readiness_avg: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE is_active = TRUE)::text AS countries_active,
           COALESCE(AVG(opportunity_score) FILTER (WHERE is_active = TRUE), 0)::text AS market_readiness_avg
         FROM countries`,
      ),
    ]);

    // -----------------------------------------------------------------------
    // Assemble spend section
    // -----------------------------------------------------------------------

    const spend: SpendOverview = {
      total_spend: parseFloat(spendResult.rows[0].total_spend),
      spend_by_platform: spendByPlatformResult.rows.map((r) => ({
        platform: r.platform,
        spend: parseFloat(r.spend),
        currency: r.currency || 'USD',
      })),
      spend_trend: spendTrendResult.rows.map((r) => ({
        date: r.date,
        amount: parseFloat(r.amount),
      })),
    };

    // -----------------------------------------------------------------------
    // Assemble campaigns section
    // -----------------------------------------------------------------------

    const campaignRow = campaignStatusResult.rows[0];
    const campaigns: CampaignsOverview = {
      total: parseInt(campaignRow.total, 10),
      active: parseInt(campaignRow.active, 10),
      paused: parseInt(campaignRow.paused, 10),
      draft: parseInt(campaignRow.draft, 10),
      by_platform: campaignByPlatformResult.rows.map((r) => ({
        platform: r.platform,
        count: parseInt(r.count, 10),
      })),
    };

    // -----------------------------------------------------------------------
    // Assemble integrations section
    // -----------------------------------------------------------------------

    const allConnections = [
      ...adPlatformsResult.rows.map((r) => ({ ...r, type: 'ad' })),
      ...crmPlatformsResult.rows.map((r) => ({ ...r, type: 'crm' })),
      ...analyticsPlatformsResult.rows.map((r) => ({ ...r, type: 'analytics' })),
    ];

    const totalConnected = allConnections.filter((c) => c.is_active).length;

    const syncHealth: SyncHealth = { healthy: 0, degraded: 0, error: 0 };

    const platforms: IntegrationPlatform[] = allConnections.map((c) => {
      const lastSync = c.updated_at || null;
      let health = 'healthy';

      if (!c.is_active) {
        health = 'error';
      } else if (lastSync) {
        const hoursSinceSync =
          (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync > 24) {
          health = 'degraded';
        }
      }

      if (health === 'healthy') syncHealth.healthy++;
      else if (health === 'degraded') syncHealth.degraded++;
      else syncHealth.error++;

      return {
        platform: c.platform_type,
        status: c.is_active ? 'connected' : 'disconnected',
        last_sync: lastSync,
        health,
      };
    });

    const integrations: IntegrationsOverview = {
      total_connected: totalConnected,
      total_available: TOTAL_AVAILABLE_PLATFORMS,
      platforms,
      sync_health: syncHealth,
    };

    // -----------------------------------------------------------------------
    // Assemble CRM section
    // -----------------------------------------------------------------------

    const totalContacts = crmContactsResult.rows.reduce(
      (sum, r) => sum + parseInt(r.count, 10),
      0,
    );

    const crm: CrmOverview = {
      total_contacts: totalContacts,
      contacts_by_platform: crmContactsResult.rows.map((r) => ({
        platform: r.platform_type,
        count: parseInt(r.count, 10),
      })),
      recent_syncs: crmRecentSyncsResult.rows.map((r) => ({
        platform: r.platform_type,
        synced_at: r.started_at,
        records: parseInt(r.records_synced, 10),
      })),
    };

    // -----------------------------------------------------------------------
    // Assemble agents section
    // -----------------------------------------------------------------------

    const agentRow = agentsResult.rows[0];
    const agents: AgentsOverview = {
      total: parseInt(agentRow.total, 10),
      active: parseInt(agentRow.active, 10),
      paused: parseInt(agentRow.paused, 10),
      idle: parseInt(agentRow.idle, 10),
    };

    // -----------------------------------------------------------------------
    // Assemble alerts section
    // -----------------------------------------------------------------------

    const alertRow = alertsResult.rows[0];
    const alerts: AlertsOverview = {
      total_active: parseInt(alertRow.total_active, 10),
      critical: parseInt(alertRow.critical, 10),
      warning: parseInt(alertRow.warning, 10),
      info: parseInt(alertRow.info, 10),
      unacknowledged: parseInt(alertRow.unacknowledged, 10),
    };

    // -----------------------------------------------------------------------
    // Assemble system section
    // -----------------------------------------------------------------------

    const ksRow = killSwitchResult.rows[0] ?? null;
    const countryRow = countriesResult.rows[0];

    const system: SystemOverview = {
      kill_switch_level: ksRow ? ksRow.level : null,
      kill_switch_active: ksRow ? ksRow.is_active : false,
      countries_active: parseInt(countryRow.countries_active, 10),
      market_readiness_avg: parseFloat(
        parseFloat(countryRow.market_readiness_avg).toFixed(2),
      ),
    };

    // -----------------------------------------------------------------------
    // Final assembly & cache
    // -----------------------------------------------------------------------

    const overview: DashboardOverview = {
      spend,
      campaigns,
      integrations,
      crm,
      agents,
      alerts,
      system,
    };

    await cacheSet(cacheKey, overview, OVERVIEW_TTL);
    logger.debug('Dashboard overview cached', { userId, cacheKey });

    return overview;
  }

  // =========================================================================
  // Spend Breakdown
  // =========================================================================

  /**
   * Detailed spend analysis broken down by platform, country, and daily
   * amounts. Optionally filtered by a date range (`startDate`, `endDate`).
   */
  static async getSpendBreakdown(
    userId: string,
    dateRange?: { startDate?: string; endDate?: string },
  ): Promise<SpendBreakdown> {
    const cacheKey = `${CACHE_PREFIX}:spend:${userId}:${JSON.stringify(dateRange ?? {})}`;
    const cached = await cacheGet<SpendBreakdown>(cacheKey);

    if (cached) {
      logger.debug('Spend breakdown cache hit', { userId });
      return cached;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dateRange?.startDate) {
      conditions.push(`c.start_date >= $${paramIndex++}`);
      params.push(dateRange.startDate);
    }

    if (dateRange?.endDate) {
      conditions.push(`c.end_date <= $${paramIndex++}`);
      params.push(dateRange.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [totalResult, byPlatformResult, byCountryResult, dailyResult] =
      await Promise.all([
        pool.query<{ total_spend: string }>(
          `SELECT COALESCE(SUM(spent), 0) AS total_spend
           FROM campaigns c ${whereClause}`,
          params,
        ),

        pool.query<{ platform: string; spend: string }>(
          `SELECT platform, COALESCE(SUM(spent), 0) AS spend
           FROM campaigns c ${whereClause}
           GROUP BY platform
           ORDER BY spend DESC`,
          params,
        ),

        pool.query<{ country: string; spend: string }>(
          `SELECT co.name AS country, COALESCE(SUM(c.spent), 0) AS spend
           FROM campaigns c
           LEFT JOIN countries co ON co.id = c.country_id
           ${whereClause}
           GROUP BY co.name
           ORDER BY spend DESC`,
          params,
        ),

        pool.query<{ date: string; amount: string }>(
          `SELECT c.created_at::date::text AS date,
                  COALESCE(SUM(c.spent), 0) AS amount
           FROM campaigns c ${whereClause}
           GROUP BY c.created_at::date
           ORDER BY date DESC
           LIMIT 90`,
          params,
        ),
      ]);

    const breakdown: SpendBreakdown = {
      total_spend: parseFloat(totalResult.rows[0].total_spend),
      by_platform: byPlatformResult.rows.map((r) => ({
        platform: r.platform,
        spend: parseFloat(r.spend),
      })),
      by_country: byCountryResult.rows.map((r) => ({
        country: r.country,
        spend: parseFloat(r.spend),
      })),
      daily_spend: dailyResult.rows.map((r) => ({
        date: r.date,
        amount: parseFloat(r.amount),
      })),
    };

    await cacheSet(cacheKey, breakdown, OVERVIEW_TTL);
    return breakdown;
  }

  // =========================================================================
  // Campaign Performance
  // =========================================================================

  /**
   * Return campaign-level performance metrics including derived KPIs
   * (CTR, CPC, CPA, ROAS). Supports optional filters by platform, status,
   * and country.
   */
  static async getCampaignPerformance(
    userId: string,
    filters?: { platform?: string; status?: string; countryId?: string },
  ): Promise<CampaignPerformanceRow[]> {
    const cacheKey = `${CACHE_PREFIX}:campaigns:${userId}:${JSON.stringify(filters ?? {})}`;
    const cached = await cacheGet<CampaignPerformanceRow[]>(cacheKey);

    if (cached) {
      logger.debug('Campaign performance cache hit', { userId });
      return cached;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.platform) {
      conditions.push(`c.platform = $${paramIndex++}`);
      params.push(filters.platform);
    }

    if (filters?.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.countryId) {
      conditions.push(`c.country_id = $${paramIndex++}`);
      params.push(filters.countryId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query<{
      id: string;
      name: string;
      platform: string;
      status: string;
      budget: string;
      spent: string;
      impressions: string;
      clicks: string;
      conversions: string;
      revenue: string;
    }>(
      `SELECT c.id, c.name, c.platform, c.status,
              c.budget::text, c.spent::text,
              COALESCE((c.metrics->>'impressions')::bigint, 0)::text AS impressions,
              COALESCE((c.metrics->>'clicks')::bigint, 0)::text AS clicks,
              COALESCE((c.metrics->>'conversions')::bigint, 0)::text AS conversions,
              COALESCE((c.metrics->>'revenue')::numeric, 0)::text AS revenue
       FROM campaigns c
       ${whereClause}
       ORDER BY c.spent DESC NULLS LAST
       LIMIT 100`,
      params,
    );

    const rows: CampaignPerformanceRow[] = result.rows.map((r) => {
      const impressions = parseInt(r.impressions, 10) || 0;
      const clicks = parseInt(r.clicks, 10) || 0;
      const conversions = parseInt(r.conversions, 10) || 0;
      const spent = parseFloat(r.spent) || 0;
      const revenue = parseFloat(r.revenue) || 0;

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spent / clicks : 0;
      const cpa = conversions > 0 ? spent / conversions : 0;
      const roas = spent > 0 ? revenue / spent : 0;

      return {
        id: r.id,
        name: r.name,
        platform: r.platform,
        status: r.status,
        budget: parseFloat(r.budget) || 0,
        spent,
        impressions,
        clicks,
        conversions,
        revenue,
        ctr: Math.round(ctr * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      };
    });

    await cacheSet(cacheKey, rows, OVERVIEW_TTL);
    return rows;
  }

  // =========================================================================
  // Integration Health
  // =========================================================================

  /**
   * Detailed health status for every connected integration, together with
   * the last few sync log entries per platform.
   */
  static async getIntegrationHealth(
    userId: string,
  ): Promise<IntegrationHealthDetail[]> {
    const cacheKey = `${CACHE_PREFIX}:integrations:${userId}`;
    const cached = await cacheGet<IntegrationHealthDetail[]>(cacheKey);

    if (cached) {
      logger.debug('Integration health cache hit', { userId });
      return cached;
    }

    // Fetch all connection types in parallel
    const [adConns, crmConns, analyticsConns, crmSyncLogs] = await Promise.all([
      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM platform_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM crm_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      pool.query<{ platform_type: string; is_active: boolean; updated_at: string }>(
        `SELECT platform_type, is_active, updated_at
         FROM analytics_connections
         WHERE connected_by = $1
         ORDER BY platform_type`,
        [userId],
      ),

      pool.query<{
        platform_type: string;
        status: string;
        records_synced: number;
        started_at: string;
        completed_at: string | null;
      }>(
        `SELECT platform_type, status, records_synced, started_at, completed_at
         FROM crm_sync_logs
         ORDER BY started_at DESC
         LIMIT 50`,
      ),
    ]);

    // Index CRM sync logs by platform
    const syncLogsByPlatform = new Map<
      string,
      { status: string; records: number; started_at: string; completed_at: string | null }[]
    >();
    for (const log of crmSyncLogs.rows) {
      const key = log.platform_type;
      if (!syncLogsByPlatform.has(key)) {
        syncLogsByPlatform.set(key, []);
      }
      syncLogsByPlatform.get(key)!.push({
        status: log.status,
        records: log.records_synced,
        started_at: log.started_at,
        completed_at: log.completed_at,
      });
    }

    const details: IntegrationHealthDetail[] = [];

    const processConnection = (
      row: { platform_type: string; is_active: boolean; updated_at: string },
      type: string,
    ): IntegrationHealthDetail => {
      const lastSync = row.updated_at || null;
      let health = 'healthy';

      if (!row.is_active) {
        health = 'error';
      } else if (lastSync) {
        const hoursSinceSync =
          (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync > 24) {
          health = 'degraded';
        }
      }

      const recentSyncs = syncLogsByPlatform.get(row.platform_type) ?? [];

      return {
        platform: row.platform_type,
        type,
        is_active: row.is_active,
        last_sync: lastSync,
        health,
        recent_syncs: recentSyncs.slice(0, 5),
      };
    };

    for (const row of adConns.rows) {
      details.push(processConnection(row, 'ad'));
    }
    for (const row of crmConns.rows) {
      details.push(processConnection(row, 'crm'));
    }
    for (const row of analyticsConns.rows) {
      details.push(processConnection(row, 'analytics'));
    }

    await cacheSet(cacheKey, details, OVERVIEW_TTL);
    return details;
  }

  // =========================================================================
  // Recent Activity
  // =========================================================================

  /**
   * Return the most recent activity events from the audit_logs table.
   * Defaults to the last 50 entries.
   */
  static async getRecentActivity(
    userId: string,
    limit: number = 50,
  ): Promise<ActivityEntry[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));

    const cacheKey = `${CACHE_PREFIX}:activity:${userId}:${safeLimit}`;
    const cached = await cacheGet<ActivityEntry[]>(cacheKey);

    if (cached) {
      logger.debug('Recent activity cache hit', { userId });
      return cached;
    }

    const result = await pool.query<{
      id: string;
      user_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      details: Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT id, user_id, action, resource_type, resource_id, details, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    );

    const entries: ActivityEntry[] = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      details:
        typeof row.details === 'string'
          ? JSON.parse(row.details)
          : row.details,
      created_at: row.created_at,
    }));

    await cacheSet(cacheKey, entries, OVERVIEW_TTL);
    return entries;
  }
}

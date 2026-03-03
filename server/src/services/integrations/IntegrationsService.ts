/**
 * Integrations Service Facade.
 *
 * Provides a unified interface for managing platform integrations across
 * ad platforms, Shopify, CRM systems, and analytics tools. All methods are
 * static and delegate to platform-specific services where appropriate.
 *
 * Supported platform categories:
 *   - Ad platforms:  google_ads, meta_ads, tiktok_ads, bing_ads, snapchat_ads
 *   - Shopify:       shopify
 *   - CRM:           salesforce, hubspot, klaviyo, mailchimp, iterable
 *   - Analytics:     looker, tableau, powerbi
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId, encrypt } from '../../utils/helpers';
import { withTransaction } from '../../utils/transaction';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import { env } from '../../config/env';

/** Encrypt a credentials object for storage in the database. */
function encryptCredentials(credentials: Record<string, unknown>): string {
  return encrypt(JSON.stringify(credentials), env.ENCRYPTION_KEY as string);
}

import { GoogleAdsService } from './ads/GoogleAdsService';
import { MetaAdsService } from './ads/MetaAdsService';
import { TikTokAdsService } from './ads/TikTokAdsService';
import { BingAdsService } from './ads/BingAdsService';
import { SnapchatAdsService } from './ads/SnapchatAdsService';
import { ShopifyAdminService } from './shopify/ShopifyAdminService';
import { SalesforceService } from './crm/SalesforceService';
import { HubSpotService } from './crm/HubSpotService';
import { KlaviyoService } from './crm/KlaviyoService';
import { MailchimpService } from './crm/MailchimpService';
import { IterableService } from './crm/IterableService';
import { LookerService } from './analytics/LookerService';
import { TableauService } from './analytics/TableauService';
import { PowerBIService } from './analytics/PowerBIService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdPlatform = 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'bing_ads' | 'snapchat_ads';
export type CrmPlatform = 'salesforce' | 'hubspot' | 'klaviyo' | 'mailchimp' | 'iterable';
export type AnalyticsPlatform = 'looker' | 'tableau' | 'powerbi';
export type PlatformType = AdPlatform | 'shopify' | CrmPlatform | AnalyticsPlatform;

export interface ConnectPlatformInput {
  platform_type: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
  user_id: string;
}

export interface PaginatedMeta { total: number; page: number; totalPages: number; limit: number }

export interface ReportFilters { start_date?: string; end_date?: string; page?: number; limit?: number }
export interface CrmContactFilters { page?: number; limit?: number; search?: string }
export interface DashboardFilters { page?: number; limit?: number }
export interface AnalyticsExportConfig {
  format?: string;
  date_range?: { start: string; end: string };
  metrics?: string[];
  dimensions?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AD_PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads', 'bing_ads', 'snapchat_ads'];
const CRM_PLATFORMS = ['salesforce', 'hubspot', 'klaviyo', 'mailchimp', 'iterable'];
const ANALYTICS_PLATFORMS = ['looker', 'tableau', 'powerbi'];
const ALL_PLATFORMS = [...AD_PLATFORMS, 'shopify', ...CRM_PLATFORMS, ...ANALYTICS_PLATFORMS];

const CACHE_PREFIX = 'integrations';
const CACHE_TTL = 120; // seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdPlatform(pt: string): pt is AdPlatform { return AD_PLATFORMS.includes(pt); }
function isCrmPlatform(pt: string): pt is CrmPlatform { return CRM_PLATFORMS.includes(pt); }
function isAnalyticsPlatform(pt: string): pt is AnalyticsPlatform { return ANALYTICS_PLATFORMS.includes(pt); }

function validatePlatformType(pt: string): void {
  if (!ALL_PLATFORMS.includes(pt)) {
    throw new ValidationError(`Unsupported platform type: ${pt}`);
  }
}

/** Return the connection table name based on the platform category. */
function getConnectionTable(pt: string): string {
  if (isAdPlatform(pt) || pt === 'shopify') return 'platform_connections';
  if (isCrmPlatform(pt)) return 'crm_connections';
  if (isAnalyticsPlatform(pt)) return 'analytics_connections';
  return 'platform_connections';
}

function getAdService(pt: AdPlatform) {
  const map = { google_ads: GoogleAdsService, meta_ads: MetaAdsService, tiktok_ads: TikTokAdsService, bing_ads: BingAdsService, snapchat_ads: SnapchatAdsService };
  return map[pt];
}

function getAnalyticsService(pt: AnalyticsPlatform) {
  const map = { looker: LookerService, tableau: TableauService, powerbi: PowerBIService };
  return map[pt];
}

/** Delegate CRM sync to the correct service method (each has a different name). */
async function syncCrmByPlatform(pt: CrmPlatform, userId: string): Promise<Record<string, unknown>> {
  switch (pt) {
    case 'salesforce': { const r = await SalesforceService.syncContacts(userId); return r as unknown as Record<string, unknown>; }
    case 'hubspot': { const r = await HubSpotService.syncContacts(userId); return r as unknown as Record<string, unknown>; }
    case 'klaviyo': { const r = await KlaviyoService.syncProfiles(userId); return r as unknown as Record<string, unknown>; }
    case 'mailchimp': { const r = await MailchimpService.syncAudiences(userId); return r as unknown as Record<string, unknown>; }
    case 'iterable': { const r = await IterableService.syncUsers(userId); return r as unknown as Record<string, unknown>; }
    default: throw new ValidationError(`Unsupported CRM platform: ${pt}`);
  }
}

/** Delegate CRM contact listing to the correct service method. */
async function listCrmContactsByPlatform(pt: CrmPlatform, filters: CrmContactFilters): Promise<{ data: unknown[]; total: number }> {
  const pf = { page: filters.page, limit: filters.limit, search: filters.search };
  switch (pt) {
    case 'salesforce': return await SalesforceService.listContacts(pf) as unknown as { data: unknown[]; total: number };
    case 'hubspot': return await HubSpotService.listContacts(pf) as unknown as { data: unknown[]; total: number };
    case 'klaviyo': return await KlaviyoService.listProfiles(pf) as unknown as { data: unknown[]; total: number };
    case 'mailchimp': return await MailchimpService.listMembers('all', pf) as unknown as { data: unknown[]; total: number };
    case 'iterable': return await IterableService.listUsers(pf) as unknown as { data: unknown[]; total: number };
    default: throw new ValidationError(`Unsupported CRM platform: ${pt}`);
  }
}

/** Convert a sync frequency label to milliseconds. */
function getFrequencyMs(frequency: string): number {
  const map: Record<string, number> = {
    every_15_minutes: 15 * 60_000, every_30_minutes: 30 * 60_000,
    hourly: 3_600_000, every_6_hours: 21_600_000, every_12_hours: 43_200_000,
    daily: 86_400_000, weekly: 604_800_000,
  };
  return map[frequency] || 0;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IntegrationsService {
  /**
   * Connect a platform by inserting (or re-activating) a record in the
   * appropriate connection table. Audits the action.
   */
  static async connectPlatform(input: ConnectPlatformInput) {
    const { platform_type, credentials, config, user_id } = input;
    validatePlatformType(platform_type);

    const table = getConnectionTable(platform_type);
    const now = new Date().toISOString();

    logger.info('Connecting platform', { userId: user_id, platformType: platform_type });

    // Check for existing active connection
    const existing = await pool.query(
      `SELECT id FROM ${table} WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [user_id, platform_type],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE ${table} SET credentials = $1, config = $2, status = 'active', connected_at = $3, updated_at = $3
         WHERE user_id = $4 AND platform_type = $5 AND is_active = true`,
        [encryptCredentials(credentials), config ? JSON.stringify(config) : null, now, user_id, platform_type],
      );
      const updatedId = existing.rows[0].id;
      await cacheDel(`${CACHE_PREFIX}:status:${user_id}`);
      await cacheDel(`${CACHE_PREFIX}:status:${user_id}:${platform_type}`);
      await AuditService.log({ userId: user_id, action: 'integration.reconnected', resourceType: 'integration', resourceId: updatedId, details: { platform_type } });
      logger.info('Platform reconnected', { userId: user_id, platformType: platform_type, connectionId: updatedId });
      return { id: updatedId, platform_type, status: 'active', connected_at: now, user_id };
    }

    const id = generateId();
    await pool.query(
      `INSERT INTO ${table} (id, user_id, platform_type, credentials, config, status, is_active, connected_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', true, $6, $6, $6)`,
      [id, user_id, platform_type, encryptCredentials(credentials), config ? JSON.stringify(config) : null, now],
    );

    await cacheDel(`${CACHE_PREFIX}:status:${user_id}`);
    await cacheDel(`${CACHE_PREFIX}:status:${user_id}:${platform_type}`);
    await AuditService.log({ userId: user_id, action: 'integration.connected', resourceType: 'integration', resourceId: id, details: { platform_type } });
    logger.info('Platform connected', { userId: user_id, platformType: platform_type, connectionId: id });

    return { id, platform_type, status: 'active', connected_at: now, user_id };
  }

  /**
   * Disconnect a platform by marking its connection as inactive.
   * Throws NotFoundError if the platform is not currently connected.
   */
  static async disconnectPlatform(platformType: string, userId: string) {
    validatePlatformType(platformType);
    const table = getConnectionTable(platformType);
    const now = new Date().toISOString();

    logger.info('Disconnecting platform', { userId, platformType });

    const result = await pool.query(
      `UPDATE ${table} SET is_active = false, status = 'disconnected', disconnected_at = $1, updated_at = $1
       WHERE user_id = $2 AND platform_type = $3 AND is_active = true RETURNING id`,
      [now, userId, platformType],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Platform ${platformType} is not connected`);
    }

    const connectionId = result.rows[0].id;
    await cacheDel(`${CACHE_PREFIX}:status:${userId}`);
    await cacheDel(`${CACHE_PREFIX}:status:${userId}:${platformType}`);
    await cacheFlush(`${CACHE_PREFIX}:reports:${userId}:${platformType}:*`);
    await AuditService.log({ userId, action: 'integration.disconnected', resourceType: 'integration', resourceId: connectionId, details: { platform_type: platformType } });
    logger.info('Platform disconnected', { userId, platformType, connectionId });

    return { platform_type: platformType, status: 'disconnected', disconnected_at: now };
  }

  /**
   * Get the connection status of all supported platforms for a user.
   * Results are cached in Redis with a short TTL.
   */
  static async getAllStatuses(userId: string) {
    const cacheKey = `${CACHE_PREFIX}:status:${userId}`;
    const cached = await cacheGet<Record<string, unknown>[]>(cacheKey);
    if (cached) { logger.debug('Integration statuses cache hit', { userId }); return cached; }

    const [adRows, crmRows, analyticsRows] = await Promise.all([
      pool.query(`SELECT platform_type, status, last_synced_at FROM platform_connections WHERE user_id = $1 AND is_active = true`, [userId]),
      pool.query(`SELECT platform_type, status, last_synced_at FROM crm_connections WHERE user_id = $1 AND is_active = true`, [userId]),
      pool.query(`SELECT platform_type, status, last_synced_at FROM analytics_connections WHERE user_id = $1 AND is_active = true`, [userId]),
    ]);

    const connMap = new Map<string, { status: string; last_synced_at: string | null }>();
    for (const row of [...adRows.rows, ...crmRows.rows, ...analyticsRows.rows]) {
      connMap.set(row.platform_type, { status: row.status || 'connected', last_synced_at: row.last_synced_at || null });
    }

    const statuses = ALL_PLATFORMS.map((pt) => {
      const conn = connMap.get(pt);
      if (conn) {
        return { platform_type: pt, status: conn.status === 'active' ? 'connected' : conn.status, last_sync: conn.last_synced_at, health: conn.status === 'error' ? 'degraded' : 'healthy' };
      }
      return { platform_type: pt, status: 'disconnected', last_sync: null, health: 'n/a' };
    });

    await cacheSet(cacheKey, statuses, CACHE_TTL);
    logger.debug('Integration statuses cached', { userId, count: statuses.length });
    return statuses;
  }

  /**
   * Get detailed connection status and health metrics for a specific platform.
   */
  static async getPlatformStatus(platformType: string, userId: string) {
    validatePlatformType(platformType);
    const cacheKey = `${CACHE_PREFIX}:status:${userId}:${platformType}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) { logger.debug('Platform status cache hit', { userId, platformType }); return cached; }

    const table = getConnectionTable(platformType);
    const result = await pool.query(
      `SELECT id, platform_type, status, connected_at, last_synced_at, sync_frequency, config
       FROM ${table} WHERE user_id = $1 AND platform_type = $2 AND is_active = true
       ORDER BY connected_at DESC LIMIT 1`,
      [userId, platformType],
    );

    if (result.rows.length === 0) {
      const status = { platform_type: platformType, status: 'disconnected', connected_at: null, last_sync: null, sync_frequency: null, health: 'n/a', metrics: null };
      await cacheSet(cacheKey, status, CACHE_TTL);
      return status;
    }

    const row = result.rows[0];
    const metricsResult = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE entity_type = 'campaign') AS total_campaigns_synced,
              COUNT(*) AS total_records,
              COUNT(*) FILTER (WHERE status = 'error' AND created_at > NOW() - INTERVAL '24 hours') AS error_count_24h
       FROM sync_records WHERE connection_id = $1`,
      [row.id],
    );
    const mr = metricsResult.rows[0];

    const status = {
      platform_type: platformType,
      status: row.status === 'active' ? 'connected' : row.status,
      connected_at: row.connected_at,
      last_sync: row.last_synced_at || null,
      sync_frequency: row.sync_frequency || null,
      health: row.status === 'error' ? 'degraded' : 'healthy',
      metrics: {
        total_campaigns_synced: parseInt(mr?.total_campaigns_synced || '0', 10),
        total_records: parseInt(mr?.total_records || '0', 10),
        error_count_24h: parseInt(mr?.error_count_24h || '0', 10),
      },
    };

    await cacheSet(cacheKey, status, CACHE_TTL);
    logger.debug('Platform status cached', { userId, platformType });
    return status;
  }

  /**
   * Trigger a data sync for the specified platform. Delegates to the
   * platform-specific service. NotFoundError if not connected.
   */
  static async triggerSync(platformType: string, userId: string, _options?: Record<string, unknown>) {
    validatePlatformType(platformType);
    const table = getConnectionTable(platformType);

    const conn = await pool.query(
      `SELECT id, credentials, config FROM ${table} WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );
    if (conn.rows.length === 0) throw new NotFoundError(`Platform ${platformType} is not connected`);

    const connectionId = conn.rows[0].id;
    const syncId = generateId();
    const startedAt = new Date().toISOString();

    logger.info('Triggering sync', { userId, platformType, syncId });

    await pool.query(
      `INSERT INTO sync_logs (id, connection_id, platform_type, user_id, status, started_at, created_at)
       VALUES ($1, $2, $3, $4, 'in_progress', $5, $5)`,
      [syncId, connectionId, platformType, userId, startedAt],
    );

    try {
      let result: Record<string, unknown> = {};
      if (isAdPlatform(platformType)) {
        const syncResult = await getAdService(platformType).syncCampaigns(userId) as Record<string, unknown>;
        result = { records_synced: syncResult.synced || 0, records_failed: syncResult.failed || 0 };
      } else if (platformType === 'shopify') {
        const syncResult = await ShopifyAdminService.syncProducts(userId) as unknown as Record<string, unknown>;
        result = { records_synced: syncResult.synced || 0, records_failed: syncResult.failed || 0 };
      } else if (isCrmPlatform(platformType)) {
        const syncResult = await syncCrmByPlatform(platformType, userId);
        result = { records_synced: syncResult.synced || 0, records_failed: syncResult.failed || 0 };
      } else if (isAnalyticsPlatform(platformType)) {
        const service = getAnalyticsService(platformType);
        const syncResult = await (service as typeof LookerService).refreshData(userId, connectionId) as unknown as Record<string, unknown>;
        result = { records_synced: syncResult.records_exported || 0 };
      }

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE sync_logs SET status = 'completed', completed_at = $1, records_synced = $2,
               records_created = $3, records_updated = $4, records_failed = $5, duration_ms = $6
           WHERE id = $7`,
          [completedAt, result.records_synced || 0, result.records_created || 0, result.records_updated || 0, result.records_failed || 0, durationMs, syncId],
        );

        await client.query(`UPDATE ${table} SET last_synced_at = $1, updated_at = $1 WHERE id = $2`, [completedAt, connectionId]);
      });
      await cacheDel(`${CACHE_PREFIX}:status:${userId}`);
      await cacheDel(`${CACHE_PREFIX}:status:${userId}:${platformType}`);

      const syncResult = {
        sync_id: syncId, platform_type: platformType, status: 'completed',
        started_at: startedAt, completed_at: completedAt,
        records_synced: Number(result.records_synced) || 0, records_created: Number(result.records_created) || 0,
        records_updated: Number(result.records_updated) || 0, records_failed: Number(result.records_failed) || 0,
        duration_ms: durationMs,
      };

      await AuditService.log({ userId, action: 'integration.sync_completed', resourceType: 'sync', resourceId: syncId, details: { platform_type: platformType, records_synced: syncResult.records_synced, records_failed: syncResult.records_failed } });
      logger.info('Sync completed', { syncId, platformType, userId, recordsSynced: syncResult.records_synced });
      return syncResult;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      await pool.query(
        `UPDATE sync_logs SET status = 'failed', completed_at = $1, duration_ms = $2, error_message = $3 WHERE id = $4`,
        [completedAt, durationMs, error instanceof Error ? error.message : String(error), syncId],
      );
      logger.error('Sync failed', { syncId, platformType, userId, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Retrieve the latest sync status for a platform, including whether a
   * sync is in progress and the next scheduled sync time.
   */
  static async getSyncStatus(platformType: string, userId: string) {
    validatePlatformType(platformType);
    const table = getConnectionTable(platformType);

    const connResult = await pool.query(
      `SELECT id, sync_frequency FROM ${table} WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );

    if (connResult.rows.length === 0) {
      return { platform_type: platformType, last_sync: null, next_scheduled_sync: null, sync_frequency: null, is_syncing: false };
    }

    const connectionId = connResult.rows[0].id;
    const syncFrequency = connResult.rows[0].sync_frequency || null;

    const logResult = await pool.query(
      `SELECT id, status, started_at, completed_at, records_synced, error_message
       FROM sync_logs WHERE connection_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [connectionId],
    );

    let lastSync = null;
    let isSyncing = false;

    if (logResult.rows.length > 0) {
      const row = logResult.rows[0];
      isSyncing = row.status === 'in_progress';
      const errors: unknown[] = [];
      if (row.error_message) errors.push({ message: row.error_message });
      lastSync = { sync_id: row.id, status: row.status, started_at: row.started_at, completed_at: row.completed_at || null, records_synced: parseInt(row.records_synced || '0', 10), errors };
    }

    let nextScheduledSync: string | null = null;
    if (lastSync?.completed_at && syncFrequency) {
      const ms = getFrequencyMs(syncFrequency);
      if (ms > 0) nextScheduledSync = new Date(new Date(lastSync.completed_at).getTime() + ms).toISOString();
    }

    return { platform_type: platformType, last_sync: lastSync, next_scheduled_sync: nextScheduledSync, sync_frequency: syncFrequency, is_syncing: isSyncing };
  }

  /**
   * Retrieve paginated performance reports for a specific platform.
   * Supports filtering by date range.
   */
  static async getPlatformReports(platformType: string, userId: string, filters: ReportFilters) {
    validatePlatformType(platformType);
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const cacheKey = `${CACHE_PREFIX}:reports:${userId}:${platformType}:${JSON.stringify(filters)}`;
    const cached = await cacheGet<{ data: unknown[]; meta: PaginatedMeta }>(cacheKey);
    if (cached) { logger.debug('Platform reports cache hit', { userId, platformType }); return cached; }

    const conditions: string[] = ['pr.user_id = $1', 'pr.platform_type = $2'];
    const params: unknown[] = [userId, platformType];
    let pi = 3;
    if (filters.start_date) { conditions.push(`pr.date >= $${pi++}`); params.push(filters.start_date); }
    if (filters.end_date) { conditions.push(`pr.date <= $${pi++}`); params.push(filters.end_date); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM platform_reports pr ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT pr.id, pr.campaign_name, pr.impressions, pr.clicks, pr.conversions, pr.spend, pr.ctr, pr.cpc, pr.date
       FROM platform_reports pr ${where} ORDER BY pr.date DESC, pr.campaign_name ASC LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset],
    );

    const result = { data: dataResult.rows, meta: { total, page, totalPages, limit } };
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Platform reports cached', { userId, platformType, total });
    return result;
  }

  /**
   * Sync contacts from a CRM platform. Delegates to the platform-specific
   * CRM service. Returns counts of created, updated, skipped, and failed.
   */
  static async syncCrmContacts(platformType: string, userId: string, _options?: Record<string, unknown>) {
    validatePlatformType(platformType);
    if (!isCrmPlatform(platformType)) throw new ValidationError(`Platform ${platformType} is not a CRM platform`);

    const conn = await pool.query(
      `SELECT id, credentials, config FROM crm_connections WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );
    if (conn.rows.length === 0) throw new NotFoundError(`CRM platform ${platformType} is not connected`);

    const syncId = generateId();
    const startedAt = new Date();

    logger.info('Syncing CRM contacts', { userId, platformType, syncId });

    const result = await syncCrmByPlatform(platformType, userId);

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - startedAt.getTime();

    const recordsSynced = Number(result.synced || result.contacts_created || 0);
    const recordsFailed = Number(result.failed || result.contacts_failed || 0);

    await pool.query(
      `INSERT INTO crm_sync_logs (id, platform_type, sync_type, direction, records_synced, records_failed, status, details, started_at, completed_at)
       VALUES ($1, $2, 'contacts', 'inbound', $3, $4, 'completed', $5, $6, $7)`,
      [syncId, platformType, recordsSynced, recordsFailed, JSON.stringify({ duration_ms: durationMs }), startedAt.toISOString(), completedAt],
    );

    await cacheDel(`${CACHE_PREFIX}:status:${userId}`);
    await cacheDel(`${CACHE_PREFIX}:status:${userId}:${platformType}`);
    await cacheFlush(`${CACHE_PREFIX}:crm:contacts:${userId}:${platformType}:*`);
    await AuditService.log({ userId, action: 'integration.crm_sync_completed', resourceType: 'crm_sync', resourceId: syncId, details: { platform_type: platformType, contacts_created: result.contacts_created, contacts_updated: result.contacts_updated, contacts_failed: result.contacts_failed } });
    logger.info('CRM contacts sync completed', { syncId, platformType, userId });

    return {
      sync_id: syncId, platform_type: platformType,
      contacts_created: Number(result.contacts_created) || 0, contacts_updated: Number(result.contacts_updated) || 0,
      contacts_skipped: Number(result.contacts_skipped) || 0, contacts_failed: Number(result.contacts_failed) || 0,
      total_processed: Number(result.total_processed) || 0, duration_ms: durationMs, completed_at: completedAt,
    };
  }

  /**
   * List contacts from a CRM platform with pagination and optional search.
   */
  static async listCrmContacts(platformType: string, userId: string, filters: CrmContactFilters) {
    validatePlatformType(platformType);
    if (!isCrmPlatform(platformType)) throw new ValidationError(`Platform ${platformType} is not a CRM platform`);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));

    const cacheKey = `${CACHE_PREFIX}:crm:contacts:${userId}:${platformType}:${JSON.stringify(filters)}`;
    const cached = await cacheGet<{ data: unknown[]; meta: PaginatedMeta }>(cacheKey);
    if (cached) { logger.debug('CRM contacts cache hit', { userId, platformType }); return cached; }

    const conn = await pool.query(
      `SELECT id FROM crm_connections WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );
    if (conn.rows.length === 0) throw new NotFoundError(`CRM platform ${platformType} is not connected`);

    const result = await listCrmContactsByPlatform(platformType, { page, limit, search: filters.search });

    const contacts = {
      data: result.data || [],
      meta: { total: Number(result.total) || 0, page, totalPages: Math.ceil((Number(result.total) || 0) / limit), limit },
    };

    await cacheSet(cacheKey, contacts, CACHE_TTL);
    logger.debug('CRM contacts cached', { userId, platformType, total: contacts.meta.total });
    return contacts;
  }

  /**
   * Export analytics data from the specified analytics platform. Returns an
   * export record with status 'processing'.
   */
  static async exportAnalyticsData(platformType: string, userId: string, queryConfig: AnalyticsExportConfig) {
    validatePlatformType(platformType);
    if (!isAnalyticsPlatform(platformType)) throw new ValidationError(`Platform ${platformType} is not an analytics platform`);

    const conn = await pool.query(
      `SELECT id, credentials, config FROM analytics_connections WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );
    if (conn.rows.length === 0) throw new NotFoundError(`Analytics platform ${platformType} is not connected`);

    const exportId = generateId();
    const requestedAt = new Date().toISOString();

    logger.info('Exporting analytics data', { userId, platformType, exportId });

    const service = getAnalyticsService(platformType);
    const result = await service.exportData(userId, queryConfig as unknown as Parameters<typeof service.exportData>[1]) as unknown as Record<string, unknown>;

    await pool.query(
      `INSERT INTO analytics_exports (id, platform_type, export_type, query_config, status, records_exported, started_at, completed_at)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6, $6)`,
      [exportId, platformType, queryConfig.format || 'csv', JSON.stringify(queryConfig), result.records_exported || 0, requestedAt],
    );

    await AuditService.log({ userId, action: 'integration.analytics_export_requested', resourceType: 'analytics_export', resourceId: exportId, details: { platform_type: platformType, format: queryConfig.format, metrics: queryConfig.metrics } });
    logger.info('Analytics export initiated', { exportId, platformType, userId });

    return { export_id: exportId, platform_type: platformType, status: 'processing', format: queryConfig.format || 'csv', requested_at: requestedAt, download_url: null };
  }

  /**
   * List dashboards from an analytics platform with pagination.
   */
  static async listDashboards(platformType: string, userId: string, filters: DashboardFilters) {
    validatePlatformType(platformType);
    if (!isAnalyticsPlatform(platformType)) throw new ValidationError(`Platform ${platformType} is not an analytics platform`);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));

    const cacheKey = `${CACHE_PREFIX}:analytics:dashboards:${userId}:${platformType}:${page}:${limit}`;
    const cached = await cacheGet<{ data: unknown[]; meta: PaginatedMeta }>(cacheKey);
    if (cached) { logger.debug('Dashboards cache hit', { userId, platformType }); return cached; }

    const conn = await pool.query(
      `SELECT id FROM analytics_connections WHERE user_id = $1 AND platform_type = $2 AND is_active = true`,
      [userId, platformType],
    );
    if (conn.rows.length === 0) throw new NotFoundError(`Analytics platform ${platformType} is not connected`);

    const service = getAnalyticsService(platformType);
    const result = await (service as unknown as { listDashboards: (filters: { page: number; limit: number }) => Promise<Record<string, unknown>> }).listDashboards({ page, limit }) as { data: unknown[]; total: number; page: number; totalPages: number };

    const dashboards = {
      data: result.data || [],
      meta: { total: Number(result.total) || 0, page, totalPages: Math.ceil((Number(result.total) || 0) / limit), limit },
    };

    await cacheSet(cacheKey, dashboards, CACHE_TTL);
    logger.debug('Dashboards cached', { userId, platformType, total: dashboards.meta.total });
    return dashboards;
  }
}

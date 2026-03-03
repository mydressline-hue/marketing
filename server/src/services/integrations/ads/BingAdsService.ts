/**
 * Bing Ads Integration Service.
 *
 * Provides static methods for managing Bing Ads (Microsoft Advertising)
 * campaigns through the AI Growth Engine platform. Handles campaign CRUD,
 * bidding configuration, performance reporting, and campaign synchronisation
 * with the Bing Ads API. All mutations are audited and cached results are
 * invalidated on write operations.
 *
 * Platform type: `bing_ads`
 */

import { pool } from '../../../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../config/redis';
import { logger } from '../../../utils/logger';
import { generateId } from '../../../utils/helpers';
import { NotFoundError, ValidationError } from '../../../utils/errors';
import { AuditService } from '../../audit.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_TYPE = 'bing_ads';
const CACHE_PREFIX = 'bing_ads';
const CACHE_TTL = 300; // 5 minutes

/**
 * Supported bidding strategy types for Bing Ads campaigns.
 */
const VALID_BIDDING_STRATEGIES = [
  'manual_cpc',
  'enhanced_cpc',
  'target_cpa',
  'target_roas',
  'maximize_conversions',
  'maximize_clicks',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BingAdsCampaign {
  id: string;
  user_id: string;
  platform_type: string;
  account_id: string;
  external_campaign_id: string;
  name: string;
  status: string;
  budget: number;
  daily_budget: number;
  bid_strategy: string;
  start_date: string;
  end_date: string;
  targeting: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BingAdsReport {
  campaign_id: string;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  ctr: number;
  cpc: number;
  cpa: number;
}

export interface CampaignListResult {
  data: BingAdsCampaign[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

export interface ConnectionStatus {
  connected: boolean;
  account_id?: string;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

function campaignCacheKey(campaignId: string): string {
  return `${CACHE_PREFIX}:campaign:${campaignId}`;
}

function listCacheKey(userId: string, filters: Record<string, unknown>): string {
  return `${CACHE_PREFIX}:campaigns:${userId}:${JSON.stringify(filters)}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BingAdsService {
  // -----------------------------------------------------------------------
  // Campaign CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new Bing Ads campaign.
   *
   * Validates that an active Bing Ads connection exists for the user
   * before inserting into `platform_campaigns`. Campaign fields are
   * stored directly as columns on the record.
   *
   * @param userId - The ID of the user creating the campaign.
   * @param data   - Campaign configuration data.
   * @returns The newly created campaign record.
   *
   * @throws {NotFoundError} When no active Bing Ads connection is found.
   * @throws {ValidationError} When required campaign fields are missing.
   */
  static async createCampaign(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<BingAdsCampaign> {
    // Verify an active Bing Ads connection exists
    const connectionResult = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE platform_type = $1 AND is_active = TRUE
       LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (connectionResult.rows.length === 0) {
      throw new NotFoundError(
        'No active Bing Ads connection found. Please connect your Bing Ads account first.',
      );
    }

    // Validate required fields
    if (!data.name) {
      throw new ValidationError('Campaign name is required');
    }

    const id = generateId();
    const connection = connectionResult.rows[0];

    const result = await pool.query<BingAdsCampaign>(
      `INSERT INTO platform_campaigns
         (id, user_id, platform_type, account_id, external_campaign_id,
          name, status, budget, daily_budget, bid_strategy,
          start_date, end_date, targeting, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING *`,
      [
        id,
        userId,
        PLATFORM_TYPE,
        connection.account_id,
        `bing-ext-${id}`,
        data.name,
        data.status || 'active',
        data.budget || 0,
        data.daily_budget || 0,
        data.bid_strategy || 'manual_cpc',
        data.start_date || null,
        data.end_date || null,
        JSON.stringify(data.targeting || {}),
      ],
    );

    // Flush campaign list caches
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.create_campaign',
      resourceType: 'platform_campaign',
      resourceId: id,
      details: { platform: PLATFORM_TYPE, campaignName: data.name },
    });

    logger.info('Bing Ads campaign created', {
      campaignId: id,
      userId,
      name: data.name,
    });

    return result.rows[0];
  }

  /**
   * Update an existing Bing Ads campaign.
   *
   * Dynamically builds the SET clause from the provided data fields
   * and updates only the specified columns.
   *
   * @param userId     - The ID of the user performing the update.
   * @param campaignId - The ID of the campaign to update.
   * @param data       - Fields to update.
   * @returns The updated campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   */
  static async updateCampaign(
    userId: string,
    campaignId: string,
    data: Record<string, unknown>,
  ): Promise<BingAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Bing Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Build dynamic SET clause
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (data.budget !== undefined) {
      fields.push(`budget = $${paramIndex++}`);
      params.push(data.budget);
    }
    if (data.daily_budget !== undefined) {
      fields.push(`daily_budget = $${paramIndex++}`);
      params.push(data.daily_budget);
    }
    if (data.bid_strategy !== undefined) {
      fields.push(`bid_strategy = $${paramIndex++}`);
      params.push(data.bid_strategy);
    }
    if (data.start_date !== undefined) {
      fields.push(`start_date = $${paramIndex++}`);
      params.push(data.start_date);
    }
    if (data.end_date !== undefined) {
      fields.push(`end_date = $${paramIndex++}`);
      params.push(data.end_date);
    }
    if (data.targeting !== undefined) {
      fields.push(`targeting = $${paramIndex++}`);
      params.push(JSON.stringify(data.targeting));
    }

    // Always update the timestamp
    fields.push(`updated_at = NOW()`);

    params.push(campaignId);

    const result = await pool.query<BingAdsCampaign>(
      `UPDATE platform_campaigns
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params,
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.update_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { updatedFields: Object.keys(data) },
    });

    logger.info('Bing Ads campaign updated', { campaignId, userId });

    return result.rows[0];
  }

  /**
   * Pause a Bing Ads campaign.
   *
   * Sets the campaign status to `"paused"`. Throws an error if the
   * campaign is already paused to prevent redundant operations.
   *
   * @param userId     - The ID of the user pausing the campaign.
   * @param campaignId - The ID of the campaign to pause.
   * @returns The updated campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   * @throws {ValidationError} When the campaign is already paused.
   */
  static async pauseCampaign(
    userId: string,
    campaignId: string,
  ): Promise<BingAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Bing Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Check if already paused
    const campaign = existing.rows[0];
    if (campaign.status === 'paused') {
      throw new ValidationError(
        `Campaign "${campaignId}" is already paused`,
      );
    }

    // Set status to paused
    const result = await pool.query<BingAdsCampaign>(
      `UPDATE platform_campaigns
       SET status = 'paused',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.pause_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { previousStatus: campaign.status, newStatus: 'paused' },
    });

    logger.info('Bing Ads campaign paused', { campaignId, userId });

    return result.rows[0];
  }

  /**
   * Retrieve a single Bing Ads campaign by ID.
   *
   * Checks the Redis cache first. On a cache miss the campaign is fetched
   * from the database and stored in cache with a 5-minute TTL.
   *
   * @param campaignId - The ID of the campaign to retrieve.
   * @returns The campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   */
  static async getCampaign(campaignId: string): Promise<BingAdsCampaign> {
    const cacheKey = campaignCacheKey(campaignId);

    // Check cache first
    const cached = await cacheGet<BingAdsCampaign>(cacheKey);
    if (cached) {
      logger.debug('Bing Ads campaign cache hit', { campaignId });
      return cached;
    }

    // Fetch from database
    const result = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns
       WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(
        `Bing Ads campaign with id "${campaignId}" not found`,
      );
    }

    const campaign = result.rows[0];

    // Populate cache
    await cacheSet(cacheKey, campaign, CACHE_TTL);
    logger.debug('Bing Ads campaign cached', { campaignId });

    return campaign;
  }

  /**
   * List Bing Ads campaigns with optional filtering and pagination.
   *
   * Results are scoped to `platform_type = 'bing_ads'` and support
   * optional status filtering. Returns a paginated result set with total
   * counts for client-side pagination.
   *
   * @param userId  - The ID of the user requesting the list.
   * @param filters - Optional filters: status, page, limit.
   * @returns Paginated campaign list.
   */
  static async listCampaigns(
    userId: string,
    filters: { status?: string; page?: number; limit?: number } = {},
  ): Promise<CampaignListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    // Check cache
    const cacheKey = listCacheKey(userId, filters);
    const cached = await cacheGet<CampaignListResult>(cacheKey);
    if (cached) {
      logger.debug('Bing Ads campaign list cache hit', { userId });
      return cached;
    }

    // Build WHERE clause -- platform_type is inlined so the SQL text
    // clearly identifies the platform (required for query auditing).
    const conditions: string[] = [`platform_type = 'bing_ads'`];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total matching rows
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM platform_campaigns ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch the page of data
    const dataResult = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const result: CampaignListResult = {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    // Populate cache
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Bing Ads campaign list cached', { userId });

    return result;
  }

  /**
   * Delete a Bing Ads campaign.
   *
   * Permanently removes the campaign record from `platform_campaigns`.
   *
   * @param userId     - The ID of the user performing the deletion.
   * @param campaignId - The ID of the campaign to delete.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   */
  static async deleteCampaign(
    userId: string,
    campaignId: string,
  ): Promise<void> {
    // Verify campaign exists
    const existing = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Bing Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Delete the campaign
    await pool.query(
      `DELETE FROM platform_campaigns WHERE id = $1`,
      [campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.delete_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { platform: PLATFORM_TYPE },
    });

    logger.info('Bing Ads campaign deleted', { campaignId, userId });
  }

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  /**
   * Retrieve performance reports for a Bing Ads campaign within a date
   * range.
   *
   * Queries the `platform_reports` table filtered by campaign ID, platform
   * type, and the specified date range. Returns rows with performance
   * metrics including impressions, clicks, conversions, cost, CTR, CPC,
   * and CPA.
   *
   * @param campaignId - The campaign to pull reports for.
   * @param dateRange  - Start and end dates for the report window.
   * @returns Array of report rows with metrics.
   */
  static async getReport(
    campaignId: string,
    dateRange: { start_date: string; end_date: string },
  ): Promise<BingAdsReport[]> {
    const result = await pool.query<BingAdsReport>(
      `SELECT id, user_id, platform_type, campaign_id, report_type, metrics, period_start, period_end, created_at FROM platform_reports
       WHERE campaign_id = $1
         AND platform_type = $2
         AND date_range_start >= $3
         AND date_range_end <= $4
       ORDER BY date_range_start ASC`,
      [campaignId, PLATFORM_TYPE, dateRange.start_date, dateRange.end_date],
    );

    logger.debug('Bing Ads report fetched', {
      campaignId,
      rowCount: result.rows.length,
      dateRange,
    });

    return result.rows;
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  /**
   * Synchronise campaigns from Bing Ads.
   *
   * Verifies that an active Bing Ads connection exists, then simulates
   * pulling campaign data from the external API and upserting records into
   * `platform_campaigns`. Returns counts of synced, failed, and skipped
   * campaigns.
   *
   * @param userId - The ID of the user triggering the sync.
   * @returns Sync result counts.
   *
   * @throws {NotFoundError} When no active Bing Ads connection is found.
   */
  static async syncCampaigns(userId: string): Promise<SyncResult> {
    // Verify an active Bing Ads connection exists
    const connectionResult = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE platform_type = $1 AND is_active = TRUE
       LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (connectionResult.rows.length === 0) {
      throw new NotFoundError(
        'No active Bing Ads connection found. Please connect your Bing Ads account first.',
      );
    }

    const connection = connectionResult.rows[0];

    // Simulate fetching campaigns from Bing Ads API and upserting
    const syncResult = await pool.query<BingAdsCampaign>(
      `INSERT INTO platform_campaigns
         (id, user_id, platform_type, account_id, external_campaign_id,
          name, status, budget, daily_budget, bid_strategy,
          start_date, end_date, targeting, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       ON CONFLICT (platform_type, external_campaign_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         budget = EXCLUDED.budget,
         daily_budget = EXCLUDED.daily_budget,
         updated_at = NOW()
       RETURNING *`,
      [
        generateId(),
        userId,
        PLATFORM_TYPE,
        connection.account_id,
        `bing-sync-${Date.now()}`,
        'Synced Campaign',
        'active',
        0,
        0,
        'manual_cpc',
        null,
        null,
        JSON.stringify({}),
      ],
    );

    const synced = syncResult.rowCount ?? 0;
    const result: SyncResult = {
      synced,
      failed: 0,
      skipped: 0,
    };

    // Flush all campaign caches after sync
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.sync_campaigns',
      resourceType: 'platform_campaign',
      resourceId: connection.id,
      details: { synced, failed: 0, skipped: 0 },
    });

    logger.info('Bing Ads campaigns synced', {
      userId,
      synced,
      connectionId: connection.id,
    });

    return result;
  }

  // -----------------------------------------------------------------------
  // Bidding
  // -----------------------------------------------------------------------

  /**
   * Update the bidding configuration for a Bing Ads campaign.
   *
   * Validates that the bidding strategy is one of the supported types
   * and then updates the campaign's bidding columns. Supports strategies:
   * `manual_cpc`, `enhanced_cpc`, `target_cpa`, `target_roas`,
   * `maximize_conversions`, `maximize_clicks`.
   *
   * @param userId        - The ID of the user updating the bidding.
   * @param campaignId    - The campaign to update bidding for.
   * @param biddingConfig - The new bidding configuration.
   * @returns The updated campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   * @throws {ValidationError} When the bidding strategy is not supported.
   */
  static async updateBidding(
    userId: string,
    campaignId: string,
    biddingConfig: Record<string, unknown>,
  ): Promise<BingAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<BingAdsCampaign>(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Bing Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Validate bidding strategy
    const strategy = biddingConfig.strategy as string;
    if (!VALID_BIDDING_STRATEGIES.includes(strategy as typeof VALID_BIDDING_STRATEGIES[number])) {
      throw new ValidationError(
        `Invalid bidding strategy "${strategy}". Supported strategies: ${VALID_BIDDING_STRATEGIES.join(', ')}`,
      );
    }

    // Update campaign bidding configuration
    const result = await pool.query<BingAdsCampaign>(
      `UPDATE platform_campaigns
       SET bid_strategy = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [strategy, campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.bing_ads.update_bidding',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { strategy, config: biddingConfig },
    });

    logger.info('Bing Ads bidding updated', {
      campaignId,
      userId,
      strategy,
    });

    return result.rows[0];
  }

  // -----------------------------------------------------------------------
  // Connection Status
  // -----------------------------------------------------------------------

  /**
   * Check the current Bing Ads connection status for a user.
   *
   * Queries the `platform_connections` table for an active Bing Ads
   * connection and returns whether the account is connected along with
   * account details.
   *
   * @param userId - The ID of the user to check connection for.
   * @returns Connection status with account details if connected.
   */
  static async getConnectionStatus(userId: string): Promise<ConnectionStatus> {
    const result = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE platform_type = 'bing_ads' AND connected_by = $1
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { connected: false };
    }

    const connection = result.rows[0];

    // Check if the connection is active
    if (connection.status !== 'active') {
      return { connected: false };
    }

    return {
      connected: true,
      account_id: connection.account_id,
      config: connection.config ?? {},
    };
  }
}

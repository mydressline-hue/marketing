/**
 * Google Ads Integration Service.
 *
 * Provides static methods for managing Google Ads campaigns through the
 * AI Growth Engine platform. Handles campaign CRUD, bidding configuration,
 * performance reporting, and campaign synchronisation with the Google Ads
 * API. All mutations are audited and cached results are invalidated on
 * write operations.
 *
 * Platform type: `google_ads`
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

const PLATFORM_TYPE = 'google_ads';
const CACHE_PREFIX = 'google_ads';
const CACHE_TTL = 300; // 5 minutes

/**
 * Supported bidding strategy types for Google Ads campaigns.
 */
const VALID_BIDDING_STRATEGIES = [
  'manual_cpc',
  'target_cpa',
  'target_roas',
  'maximize_conversions',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleAdsCampaign {
  id: string;
  platform_type: string;
  external_campaign_id: string;
  internal_campaign_id: string;
  sync_data: Record<string, unknown>;
  sync_status: string;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface GoogleAdsReport {
  id: string;
  platform_type: string;
  campaign_id: string;
  report_type: string;
  date_range_start: string;
  date_range_end: string;
  metrics: Record<string, unknown>;
  fetched_at: string;
}

export interface CampaignListResult {
  data: GoogleAdsCampaign[];
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

export class GoogleAdsService {
  // -----------------------------------------------------------------------
  // Campaign CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new Google Ads campaign.
   *
   * Validates that an active Google Ads connection exists for the user
   * before inserting into `platform_campaigns`. The campaign data is
   * stored in the `sync_data` JSONB column.
   *
   * @param userId - The ID of the user creating the campaign.
   * @param data   - Campaign configuration data.
   * @returns The newly created campaign record.
   *
   * @throws {NotFoundError} When no active Google Ads connection is found.
   * @throws {ValidationError} When required campaign fields are missing.
   */
  static async createCampaign(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<GoogleAdsCampaign> {
    // Verify an active Google Ads connection exists
    const connectionResult = await pool.query(
      `SELECT * FROM platform_connections
       WHERE platform_type = $1 AND is_active = TRUE
       LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (connectionResult.rows.length === 0) {
      throw new NotFoundError(
        'No active Google Ads connection found. Please connect your Google Ads account first.',
      );
    }

    // Validate required fields
    if (!data.name) {
      throw new ValidationError('Campaign name is required');
    }

    const id = generateId();
    const connection = connectionResult.rows[0];

    const result = await pool.query<GoogleAdsCampaign>(
      `INSERT INTO platform_campaigns
         (id, platform_type, external_campaign_id, internal_campaign_id,
          sync_data, sync_status, last_synced_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        id,
        PLATFORM_TYPE,
        `gads-ext-${id}`,
        connection.id,
        JSON.stringify(data),
        'pending',
      ],
    );

    // Flush campaign list caches
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.google_ads.create_campaign',
      resourceType: 'platform_campaign',
      resourceId: id,
      details: { platform: PLATFORM_TYPE, campaignName: data.name },
    });

    logger.info('Google Ads campaign created', {
      campaignId: id,
      userId,
      name: data.name,
    });

    return result.rows[0];
  }

  /**
   * Update an existing Google Ads campaign.
   *
   * Merges the provided data into the campaign's `sync_data` column and
   * updates the `updated_at` timestamp.
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
  ): Promise<GoogleAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Google Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Merge new data into existing sync_data
    const result = await pool.query<GoogleAdsCampaign>(
      `UPDATE platform_campaigns
       SET sync_data = sync_data || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(data), campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.google_ads.update_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { updatedFields: Object.keys(data) },
    });

    logger.info('Google Ads campaign updated', { campaignId, userId });

    return result.rows[0];
  }

  /**
   * Pause a Google Ads campaign.
   *
   * Sets the `status` field within `sync_data` to `"PAUSED"`.
   *
   * @param userId     - The ID of the user pausing the campaign.
   * @param campaignId - The ID of the campaign to pause.
   * @returns The updated campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   */
  static async pauseCampaign(
    userId: string,
    campaignId: string,
  ): Promise<GoogleAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Google Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Set status to PAUSED within sync_data
    const result = await pool.query<GoogleAdsCampaign>(
      `UPDATE platform_campaigns
       SET sync_data = jsonb_set(sync_data, '{status}', '"PAUSED"'),
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
      action: 'integration.google_ads.pause_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { previousStatus: 'ENABLED', newStatus: 'PAUSED' },
    });

    logger.info('Google Ads campaign paused', { campaignId, userId });

    return result.rows[0];
  }

  /**
   * Retrieve a single Google Ads campaign by ID.
   *
   * Checks the Redis cache first. On a cache miss the campaign is fetched
   * from the database and stored in cache with a 5-minute TTL.
   *
   * @param campaignId - The ID of the campaign to retrieve.
   * @returns The campaign record.
   *
   * @throws {NotFoundError} When the campaign does not exist.
   */
  static async getCampaign(campaignId: string): Promise<GoogleAdsCampaign> {
    const cacheKey = campaignCacheKey(campaignId);

    // Check cache first
    const cached = await cacheGet<GoogleAdsCampaign>(cacheKey);
    if (cached) {
      logger.debug('Google Ads campaign cache hit', { campaignId });
      return cached;
    }

    // Fetch from database
    const result = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns
       WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(
        `Google Ads campaign with id "${campaignId}" not found`,
      );
    }

    const campaign = result.rows[0];

    // Populate cache
    await cacheSet(cacheKey, campaign, CACHE_TTL);
    logger.debug('Google Ads campaign cached', { campaignId });

    return campaign;
  }

  /**
   * List Google Ads campaigns with optional filtering and pagination.
   *
   * Results are scoped to `platform_type = 'google_ads'` and support
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
      logger.debug('Google Ads campaign list cache hit', { userId });
      return cached;
    }

    // Build WHERE clause -- platform_type is inlined so the SQL text
    // clearly identifies the platform (required for query auditing).
    const conditions: string[] = [`platform_type = 'google_ads'`];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`sync_data->>'status' = $${paramIndex++}`);
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
    const dataResult = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns ${whereClause}
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
    logger.debug('Google Ads campaign list cached', { userId });

    return result;
  }

  /**
   * Delete a Google Ads campaign.
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
    const existing = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Google Ads campaign with id "${campaignId}" not found`,
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
      action: 'integration.google_ads.delete_campaign',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { platform: PLATFORM_TYPE },
    });

    logger.info('Google Ads campaign deleted', { campaignId, userId });
  }

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  /**
   * Retrieve performance reports for a Google Ads campaign within a date
   * range.
   *
   * Queries the `platform_reports` table filtered by campaign ID, platform
   * type, and the specified date range.
   *
   * @param campaignId - The campaign to pull reports for.
   * @param dateRange  - Start and end dates for the report window.
   * @returns Array of report rows with metrics.
   */
  static async getReport(
    campaignId: string,
    dateRange: { start_date: string; end_date: string },
  ): Promise<GoogleAdsReport[]> {
    const result = await pool.query<GoogleAdsReport>(
      `SELECT * FROM platform_reports
       WHERE campaign_id = $1
         AND platform_type = 'google_ads'
         AND date_range_start >= $2
         AND date_range_end <= $3
       ORDER BY date_range_start ASC`,
      [campaignId, dateRange.start_date, dateRange.end_date],
    );

    logger.debug('Google Ads report fetched', {
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
   * Synchronise campaigns from Google Ads.
   *
   * Verifies that an active Google Ads connection exists, then simulates
   * pulling campaign data from the external API and upserting records into
   * `platform_campaigns`. Returns counts of synced, failed, and skipped
   * campaigns.
   *
   * @param userId - The ID of the user triggering the sync.
   * @returns Sync result counts.
   *
   * @throws {NotFoundError} When no active Google Ads connection is found.
   */
  static async syncCampaigns(userId: string): Promise<SyncResult> {
    // Verify an active Google Ads connection exists
    const connectionResult = await pool.query(
      `SELECT * FROM platform_connections
       WHERE platform_type = $1 AND is_active = TRUE
       LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (connectionResult.rows.length === 0) {
      throw new NotFoundError(
        'No active Google Ads connection found. Please connect your Google Ads account first.',
      );
    }

    const connection = connectionResult.rows[0];

    // Simulate fetching campaigns from Google Ads API and upserting
    const syncResult = await pool.query<GoogleAdsCampaign>(
      `INSERT INTO platform_campaigns
         (id, platform_type, external_campaign_id, internal_campaign_id,
          sync_data, sync_status, last_synced_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'synced', NOW(), NOW(), NOW())
       ON CONFLICT (platform_type, external_campaign_id)
       DO UPDATE SET
         sync_data = EXCLUDED.sync_data,
         sync_status = 'synced',
         last_synced_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        generateId(),
        PLATFORM_TYPE,
        `gads-sync-${Date.now()}`,
        connection.id,
        JSON.stringify({ source: 'sync', synced_at: new Date().toISOString() }),
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
      action: 'integration.google_ads.sync_campaigns',
      resourceType: 'platform_campaign',
      resourceId: connection.id,
      details: { synced, failed: 0, skipped: 0 },
    });

    logger.info('Google Ads campaigns synced', {
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
   * Update the bidding configuration for a Google Ads campaign.
   *
   * Validates that the bidding strategy is one of the supported types
   * (`manual_cpc`, `target_cpa`, `target_roas`, `maximize_conversions`)
   * and then updates the campaign's bidding data.
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
  ): Promise<GoogleAdsCampaign> {
    // Verify campaign exists
    const existing = await pool.query<GoogleAdsCampaign>(
      `SELECT * FROM platform_campaigns WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(
        `Google Ads campaign with id "${campaignId}" not found`,
      );
    }

    // Validate bidding strategy
    const strategy = biddingConfig.strategy as string;
    if (!VALID_BIDDING_STRATEGIES.includes(strategy as typeof VALID_BIDDING_STRATEGIES[number])) {
      throw new ValidationError(
        `Invalid bidding strategy "${strategy}". Supported strategies: ${VALID_BIDDING_STRATEGIES.join(', ')}`,
      );
    }

    // Update campaign with new bidding configuration
    const result = await pool.query<GoogleAdsCampaign>(
      `UPDATE platform_campaigns
       SET sync_data = jsonb_set(sync_data, '{bidding_strategy}', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(strategy), campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush(`${CACHE_PREFIX}:campaigns:*`);

    // Audit log
    await AuditService.log({
      userId,
      action: 'integration.google_ads.update_bidding',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { strategy, config: biddingConfig },
    });

    logger.info('Google Ads bidding updated', {
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
   * Check the current Google Ads connection status for a user.
   *
   * Queries the `platform_connections` table for an active Google Ads
   * connection and returns whether the account is connected along with
   * account details.
   *
   * @param userId - The ID of the user to check connection for.
   * @returns Connection status with account details if connected.
   */
  static async getConnectionStatus(userId: string): Promise<ConnectionStatus> {
    const result = await pool.query(
      `SELECT * FROM platform_connections
       WHERE platform_type = 'google_ads' AND connected_by = $1
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { connected: false };
    }

    const connection = result.rows[0];

    // Check if the connection is active
    if (!connection.is_active) {
      return { connected: false };
    }

    return {
      connected: true,
      account_id: connection.account_id,
      config: connection.config ?? {},
    };
  }
}

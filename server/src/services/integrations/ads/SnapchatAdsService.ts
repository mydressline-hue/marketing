/**
 * Snapchat Ads Integration Service.
 *
 * Provides static methods for managing Snapchat ad campaigns, retrieving
 * performance reports with Snapchat-specific metrics (swipe-ups), syncing
 * remote campaign data, and checking connection status. All operations are
 * scoped to the `snapchat_ads` platform type. Mutations are audited and
 * cached data is invalidated on every write to ensure consistency.
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

const CACHE_TTL = 120; // seconds

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

function campaignCacheKey(id: string): string {
  return `snapchat_ads:campaign:${id}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SnapchatAdsService {
  // -----------------------------------------------------------------------
  // Campaigns
  // -----------------------------------------------------------------------

  /**
   * Create a new Snapchat Ads campaign.
   *
   * Validates that the user has an active `snapchat_ads` platform connection
   * before inserting into `platform_campaigns`. The ad_account_id is pulled
   * from the connection record automatically.
   */
  static async createCampaign(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Verify active Snapchat Ads connection
    const connectionResult = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE user_id = $1 AND platform_type = 'snapchat_ads' AND status = 'active'
       LIMIT 1`,
      [userId],
    );

    if (connectionResult.rows.length === 0) {
      throw new ValidationError(
        'No active Snapchat Ads connection found. Please connect your Snapchat Ads account first.',
      );
    }

    const account = connectionResult.rows[0];
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO platform_campaigns
         (id, user_id, platform_type, organization_id, name, objective, status, budget, daily_budget, start_date, end_date, targeting, created_at, updated_at)
       VALUES ($1, $2, 'snapchat_ads', $3, $4, $5, 'active', $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        id,
        userId,
        account.organization_id,
        data.name,
        data.objective,
        data.budget,
        data.daily_budget,
        data.start_date,
        data.end_date,
        JSON.stringify(data.targeting),
      ],
    );

    // Invalidate list caches
    await cacheFlush('snapchat_ads:campaigns:*');

    // Audit log
    await AuditService.log({
      userId,
      action: 'snapchat_ads.campaign.create',
      resourceType: 'platform_campaign',
      resourceId: id,
      details: { name: data.name, objective: data.objective },
    });

    logger.info('Snapchat Ads campaign created', { campaignId: id, userId, name: data.name });

    return result.rows[0];
  }

  /**
   * Update an existing Snapchat Ads campaign.
   *
   * Supports partial updates. Throws if the campaign does not exist.
   */
  static async updateCampaign(
    userId: string,
    campaignId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Ensure the campaign exists
    const existing = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND user_id = $2 AND platform_type = 'snapchat_ads'`,
      [campaignId, userId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(`Snapchat Ads campaign with id "${campaignId}" not found`);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) {
      return existing.rows[0];
    }

    fields.push('updated_at = NOW()');
    params.push(campaignId);

    const result = await pool.query(
      `UPDATE platform_campaigns SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND platform_type = 'snapchat_ads'
       RETURNING *`,
      params,
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush('snapchat_ads:campaigns:*');

    // Audit log
    await AuditService.log({
      userId,
      action: 'snapchat_ads.campaign.update',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { updatedFields: Object.keys(data).filter((k) => data[k] !== undefined) },
    });

    logger.info('Snapchat Ads campaign updated', { campaignId, userId });

    return result.rows[0];
  }

  /**
   * Pause a Snapchat Ads campaign.
   *
   * Sets the status to 'paused'. Throws if the campaign does
   * not exist or is already paused.
   */
  static async pauseCampaign(
    userId: string,
    campaignId: string,
  ): Promise<Record<string, unknown>> {
    const existing = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND user_id = $2 AND platform_type = 'snapchat_ads'`,
      [campaignId, userId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(`Snapchat Ads campaign with id "${campaignId}" not found`);
    }

    const campaign = existing.rows[0];

    if (campaign.status === 'paused') {
      throw new ValidationError('Campaign is already paused');
    }

    const result = await pool.query(
      `UPDATE platform_campaigns
       SET status = 'paused', updated_at = NOW()
       WHERE id = $1 AND platform_type = 'snapchat_ads'
       RETURNING *`,
      [campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush('snapchat_ads:campaigns:*');

    // Audit log
    await AuditService.log({
      userId,
      action: 'snapchat_ads.campaign.pause',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: { previousStatus: campaign.status },
    });

    logger.info('Snapchat Ads campaign paused', { campaignId, userId, previousStatus: campaign.status });

    return result.rows[0];
  }

  /**
   * Get a single Snapchat Ads campaign by ID.
   *
   * Checks Redis cache first; on miss fetches from the database and
   * populates the cache with a TTL. Throws when the campaign
   * does not exist.
   */
  static async getCampaign(campaignId: string): Promise<Record<string, unknown>> {
    // Check cache
    const cacheKey = campaignCacheKey(campaignId);
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);

    if (cached) {
      logger.debug('Snapchat Ads campaign cache hit', { campaignId });
      return cached;
    }

    // Fetch from database
    const result = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND platform_type = 'snapchat_ads'`,
      [campaignId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Snapchat Ads campaign with id "${campaignId}" not found`);
    }

    const campaign = result.rows[0];

    // Populate cache
    await cacheSet(cacheKey, campaign, CACHE_TTL);
    logger.debug('Snapchat Ads campaign cached', { campaignId });

    return campaign;
  }

  /**
   * List Snapchat Ads campaigns with pagination and optional status filter.
   *
   * All results are scoped to platform_type = 'snapchat_ads' and the given user.
   */
  static async listCampaigns(
    userId: string,
    filters: { status?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Record<string, unknown>[]; total: number; page: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`user_id = $1`, `platform_type = 'snapchat_ads'`];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM platform_campaigns ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data
    const dataResult = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
    };
  }

  /**
   * Delete a Snapchat Ads campaign.
   *
   * Verifies the campaign exists first, then deletes. Throws
   * if the campaign does not exist.
   */
  static async deleteCampaign(
    userId: string,
    campaignId: string,
  ): Promise<void> {
    // Verify campaign exists
    const existing = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, status, budget, spend, impressions, clicks, conversions, config, created_at, updated_at FROM platform_campaigns WHERE id = $1 AND user_id = $2 AND platform_type = 'snapchat_ads'`,
      [campaignId, userId],
    );

    if (existing.rows.length === 0) {
      throw new NotFoundError(`Snapchat Ads campaign with id "${campaignId}" not found`);
    }

    await pool.query(
      `DELETE FROM platform_campaigns WHERE id = $1 AND platform_type = 'snapchat_ads'`,
      [campaignId],
    );

    // Invalidate caches
    await cacheDel(campaignCacheKey(campaignId));
    await cacheFlush('snapchat_ads:campaigns:*');

    // Audit log
    await AuditService.log({
      userId,
      action: 'snapchat_ads.campaign.delete',
      resourceType: 'platform_campaign',
      resourceId: campaignId,
      details: {},
    });

    logger.info('Snapchat Ads campaign deleted', { campaignId, userId });
  }

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  /**
   * Retrieve performance reports for a Snapchat Ads campaign within a date
   * range. Includes Snapchat-specific metrics such as swipe_ups alongside
   * standard engagement metrics.
   */
  static async getReport(
    campaignId: string,
    dateRange: { start_date: string; end_date: string },
  ): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT id, user_id, platform_type, campaign_id, report_type, metrics, period_start, period_end, created_at FROM platform_reports
       WHERE campaign_id = $1
         AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [campaignId, dateRange.start_date, dateRange.end_date],
    );

    return result.rows;
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  /**
   * Synchronise campaigns from the Snapchat Ads platform.
   *
   * Validates that the user has an active connection, retrieves the
   * ad_account_id, and upserts campaign records into the local database.
   */
  static async syncCampaigns(userId: string): Promise<Record<string, unknown>> {
    // Verify connection
    const connectionResult = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE user_id = $1 AND platform_type = 'snapchat_ads' AND status = 'active'
       LIMIT 1`,
      [userId],
    );

    if (connectionResult.rows.length === 0) {
      throw new ValidationError(
        'No active Snapchat Ads connection found. Please connect your Snapchat Ads account first.',
      );
    }

    const account = connectionResult.rows[0];

    // Upsert synced campaigns
    const result = await pool.query(
      `INSERT INTO platform_campaigns (user_id, platform_type, ad_account_id, status, created_at, updated_at)
       VALUES ($1, 'snapchat_ads', $2, 'active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [userId, account.ad_account_id],
    );

    // Flush all campaign caches after sync
    await cacheFlush('snapchat_ads:campaigns:*');

    // Audit log
    await AuditService.log({
      userId,
      action: 'snapchat_ads.campaigns.sync',
      resourceType: 'platform_campaign',
      details: { adAccountId: account.ad_account_id },
    });

    logger.info('Snapchat Ads campaigns synced', { userId, adAccountId: account.ad_account_id });

    return { synced: result.rowCount, campaigns: result.rows };
  }

  // -----------------------------------------------------------------------
  // Connection Status
  // -----------------------------------------------------------------------

  /**
   * Check the connection status for a user's Snapchat Ads integration.
   *
   * Returns an object indicating whether the user has an active connection
   * and the associated account details.
   */
  static async getConnectionStatus(userId: string): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `SELECT id, user_id, platform_type, status, credentials, access_token, refresh_token, expires_at, created_at, updated_at FROM platform_connections
       WHERE user_id = $1 AND platform_type = 'snapchat_ads'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { connected: false };
    }

    const row = result.rows[0];
    const isConnected = row.status === 'active';

    if (!isConnected) {
      return { connected: false };
    }

    return {
      connected: true,
      organization_id: row.organization_id,
      ad_account_id: row.ad_account_id,
      platform_type: row.platform_type,
      status: row.status,
    };
  }
}

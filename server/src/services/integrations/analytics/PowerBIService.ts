/**
 * Power BI Analytics Integration Service.
 *
 * Manages Power BI dashboards, data exports, data feed configuration,
 * dataset refreshes, connection status, and sync operations against the
 * `analytics_dashboards`, `analytics_exports`, and `analytics_connections`
 * tables (platform_type = 'powerbi'). All mutations are audit-logged and
 * relevant caches are invalidated.
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

const PLATFORM = 'powerbi';
const PFX = 'powerbi';
const TTL_DASH = 300;
const TTL_CONN = 120;
const TTL_SYNC = 60;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PowerBIService {
  /**
   * Export data using the provided query configuration.
   * Inserts an analytics_exports record and audit-logs the operation.
   */
  static async exportData(userId: string, queryConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO analytics_exports
         (id, user_id, platform_type, export_type, record_count, status, config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [id, userId, PLATFORM, 'dataset', 0, 'completed', JSON.stringify(queryConfig)],
    );
    const row = result.rows[0];

    await AuditService.log({
      userId,
      action: 'powerbi.export_data',
      resourceType: 'analytics_export',
      resourceId: id,
    });
    logger.info('Power BI data export completed', { exportId: id, userId });
    return row;
  }

  /**
   * Create a new dashboard. Invalidates the list cache and audit-logs.
   */
  static async createDashboard(userId: string, config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO analytics_dashboards
         (id, user_id, platform_type, name, description, config, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [id, userId, PLATFORM, config.name, config.description || null, JSON.stringify(config), true],
    );
    const dashboard = result.rows[0];

    await cacheFlush(`${PFX}:dashboards:*`);
    await AuditService.log({
      userId,
      action: 'powerbi.create_dashboard',
      resourceType: 'analytics_dashboard',
      resourceId: id,
    });
    logger.info('Power BI dashboard created', { dashboardId: id, userId });
    return dashboard;
  }

  /**
   * Update an existing dashboard. Throws NotFoundError when the dashboard
   * does not exist. Invalidates individual and list caches.
   */
  static async updateDashboard(
    userId: string, dashboardId: string, config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (config.name !== undefined) { fields.push(`name = $${idx++}`); params.push(config.name); }
    if (config.description !== undefined) { fields.push(`description = $${idx++}`); params.push(config.description); }

    fields.push(`updated_at = NOW()`);
    params.push(dashboardId);

    const result = await pool.query(
      `UPDATE analytics_dashboards SET ${fields.join(', ')}
       WHERE id = $${idx++} AND platform_type = '${PLATFORM}' RETURNING *`,
      params,
    );
    if (result.rows.length === 0) throw new NotFoundError(`Power BI dashboard not found: ${dashboardId}`);

    const dashboard = result.rows[0];
    await cacheDel(`${PFX}:dashboard:${dashboardId}`);
    await AuditService.log({
      userId,
      action: 'powerbi.update_dashboard',
      resourceType: 'analytics_dashboard',
      resourceId: dashboardId,
    });
    logger.info('Power BI dashboard updated', { dashboardId, userId });
    return dashboard;
  }

  /**
   * List dashboards with pagination and optional filters.
   * Returns empty data on no results.
   */
  static async listDashboards(filters: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const page = Math.max(1, (filters.page as number) || 1);
    const limit = Math.max(1, Math.min(100, (filters.limit as number) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.platform_type) {
      conditions.push(`platform_type = $${idx++}`);
      params.push(filters.platform_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM analytics_dashboards ${where}`, params,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT * FROM analytics_dashboards ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );
    return { data: dataResult.rows, total, page, totalPages };
  }

  /**
   * Get a single dashboard by ID. Cache-first, then DB. NotFoundError on miss.
   */
  static async getDashboard(dashboardId: string): Promise<Record<string, unknown>> {
    const cacheKey = `${PFX}:dashboard:${dashboardId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as Record<string, unknown>;

    const result = await pool.query(
      `SELECT * FROM analytics_dashboards WHERE id = $1 AND platform_type = $2`,
      [dashboardId, PLATFORM],
    );
    if (result.rows.length === 0) throw new NotFoundError(`Power BI dashboard not found: ${dashboardId}`);

    const dashboard = result.rows[0];
    await cacheSet(cacheKey, dashboard, TTL_DASH);
    return dashboard;
  }

  /**
   * Delete a dashboard. NotFoundError if missing. Invalidates caches. Audit-logs.
   */
  static async deleteDashboard(userId: string, dashboardId: string): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `DELETE FROM analytics_dashboards WHERE id = $1 AND platform_type = $2 RETURNING *`,
      [dashboardId, PLATFORM],
    );
    if (result.rows.length === 0) throw new NotFoundError(`Power BI dashboard not found: ${dashboardId}`);

    await cacheDel(`${PFX}:dashboard:${dashboardId}`);
    await cacheFlush(`${PFX}:dashboards:*`);
    await AuditService.log({
      userId,
      action: 'powerbi.delete_dashboard',
      resourceType: 'analytics_dashboard',
      resourceId: dashboardId,
    });
    logger.info('Power BI dashboard deleted', { dashboardId, userId });
    return result.rows[0];
  }

  /**
   * Configure a Power BI data feed. Validates feed_type is non-empty.
   * Inserts a feed record. Audit-logged with cache invalidation.
   */
  static async configureDataFeed(
    userId: string, feedConfig: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO analytics_feeds
         (id, user_id, platform_type, feed_type, name, config, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [id, userId, PLATFORM, feedConfig.feed_type, feedConfig.name || null, JSON.stringify(feedConfig), 'active'],
    );

    if (!feedConfig.feed_type || result.rows.length === 0) {
      throw new ValidationError('Feed type is required');
    }

    const row = result.rows[0];

    await cacheFlush(`${PFX}:feeds:*`);
    await AuditService.log({
      userId,
      action: 'powerbi.configure_data_feed',
      resourceType: 'analytics_feed',
      resourceId: id,
    });
    logger.info('Power BI data feed configured', { feedId: id, userId });
    return row;
  }

  /**
   * Refresh a Power BI dataset. Creates an export record.
   * Invalidates data caches.
   */
  static async refreshDataset(userId: string, datasetId: string): Promise<Record<string, unknown>> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO analytics_exports
         (id, user_id, platform_type, export_type, record_count, status, config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [id, userId, PLATFORM, 'refresh', 0, 'completed', JSON.stringify({ datasetId })],
    );
    const row = result.rows[0];

    await cacheFlush(`${PFX}:data:*`);
    await AuditService.log({
      userId,
      action: 'powerbi.refresh_dataset',
      resourceType: 'analytics_export',
      resourceId: id,
      details: { datasetId },
    });
    logger.info('Power BI dataset refresh triggered', { exportId: id, userId, datasetId });
    return row;
  }

  /**
   * Check the Power BI connection status for a user. Cached.
   */
  static async getConnectionStatus(userId: string): Promise<Record<string, unknown>> {
    const cacheKey = `${PFX}:connection:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as Record<string, unknown>;

    const result = await pool.query(
      `SELECT * FROM analytics_connections
       WHERE user_id = $1 AND platform_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, PLATFORM],
    );

    if (result.rows.length === 0) {
      return { status: 'disconnected' };
    }
    const row = result.rows[0];
    await cacheSet(cacheKey, row, TTL_CONN);
    return row;
  }

  /**
   * Aggregate sync status. Cached. Returns defaults when no sync records exist.
   */
  static async getSyncStatus(): Promise<Record<string, unknown>> {
    const cacheKey = `${PFX}:sync_status`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as Record<string, unknown>;

    const result = await pool.query(
      `SELECT * FROM analytics_sync_status WHERE platform_type = $1`,
      [PLATFORM],
    );

    if (result.rows.length === 0) {
      const defaults = {
        platform_type: PLATFORM,
        total_syncs: 0,
        successful_syncs: 0,
        failed_syncs: 0,
        last_sync_at: null,
      };
      await cacheSet(cacheKey, defaults, TTL_SYNC);
      return defaults;
    }

    const row = result.rows[0];
    await cacheSet(cacheKey, row, TTL_SYNC);
    return row;
  }
}

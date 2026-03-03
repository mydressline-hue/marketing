/**
 * Campaigns Service.
 *
 * Provides static methods for managing marketing campaigns across platforms
 * and countries. Supports CRUD operations, status transitions with audit
 * logging, spend summaries, and computed performance metrics. List results
 * are cached in Redis with a short TTL to reduce database load.
 */

import { pool } from '../config/database';
import { cacheGet, cacheSet, cacheFlush } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateId } from '../utils/helpers';
import { withTransaction } from '../utils/transaction';
import { encodeCursor, buildCursorQuery } from '../utils/cursor-pagination';
import { eventBus } from '../websocket/EventBus';
import { AuditService } from './audit.service';
import type { CreateCampaignInput, UpdateCampaignInput } from '../validators/schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  name: string;
  country_id: string;
  country_name?: string;
  platform: string;
  type: string;
  status: string;
  budget: number;
  spent: number;
  start_date: string;
  end_date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignFilters {
  countryId?: string;
  platform?: string;
  status?: string;
  createdBy?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface PaginatedResult {
  data: Campaign[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CursorPaginationOptions {
  cursor?: string;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CursorPaginatedResult {
  data: Campaign[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

export interface SpendSummary {
  totalSpend: number;
  byPlatform: Record<string, number>;
  byCountry: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'campaigns';
const CACHE_TTL = 60; // seconds

function listCacheKey(
  filters: Record<string, unknown>,
  pagination: Record<string, unknown>,
): string {
  return `${CACHE_PREFIX}:list:${JSON.stringify(filters)}:${JSON.stringify(pagination)}`;
}

// ---------------------------------------------------------------------------
// Allowed sort columns (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'c.name',
  platform: 'c.platform',
  status: 'c.status',
  budget: 'c.budget',
  spent: 'c.spent',
  start_date: 'c.start_date',
  end_date: 'c.end_date',
  created_at: 'c.created_at',
  updated_at: 'c.updated_at',
};

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  archived: [],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CampaignsService {
  /**
   * List campaigns with optional filtering, sorting, and pagination.
   * JOINs the countries table to include the country name.
   * Results are cached in Redis with a 60-second TTL.
   */
  static async list(
    filters?: CampaignFilters,
    pagination?: Pagination,
  ): Promise<PaginatedResult> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const sortBy = pagination?.sortBy ?? 'created_at';
    const sortOrder =
      pagination?.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    // Attempt cache hit
    const cacheKey = listCacheKey((filters ?? {}) as Record<string, unknown>, { page, limit, sortBy, sortOrder });
    const cached = await cacheGet<PaginatedResult>(cacheKey);

    if (cached) {
      logger.debug('Campaigns list cache hit', { cacheKey });
      return cached;
    }

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.countryId) {
      conditions.push(`c.country_id = $${paramIndex++}`);
      params.push(filters.countryId);
    }

    if (filters?.platform) {
      conditions.push(`c.platform = $${paramIndex++}`);
      params.push(filters.platform);
    }

    if (filters?.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.createdBy) {
      conditions.push(`c.created_by = $${paramIndex++}`);
      params.push(filters.createdBy);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Resolve sort column (default to c.created_at if invalid)
    const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] ?? 'c.created_at';

    // Count total matching rows
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM campaigns c ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch the page with country name JOIN
    const dataResult = await pool.query<Campaign>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const result: PaginatedResult = {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    // Store in cache
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Campaigns list cached', { cacheKey });

    return result;
  }

  /**
   * List campaigns using cursor-based (keyset) pagination.
   *
   * Returns a page of campaigns along with opaque `nextCursor` and
   * `previousCursor` tokens and a `hasMore` flag. The existing offset-based
   * `list()` method is left unchanged; this is an opt-in alternative
   * activated by passing a `paginationMode=cursor` query parameter.
   *
   * Supports the same filter set as the offset-based `list()` method.
   */
  static async listWithCursor(
    filters?: CampaignFilters,
    options?: CursorPaginationOptions,
  ): Promise<CursorPaginatedResult> {
    const sortBy = options?.sortBy ?? 'created_at';
    const sortOrder = options?.sortOrder ?? 'asc';
    const requestedLimit = options?.limit ?? 20;

    // Attempt cache hit
    const cacheKey = listCacheKey(
      (filters ?? {}) as Record<string, unknown>,
      { cursor: options?.cursor ?? 'first', sortBy, sortOrder, limit: requestedLimit },
    );
    const cached = await cacheGet<CursorPaginatedResult>(cacheKey);

    if (cached) {
      logger.debug('Campaigns cursor list cache hit', { cacheKey });
      return cached;
    }

    // Build dynamic WHERE conditions from filters
    const conditions: string[] = [];
    const filterParams: unknown[] = [];
    let paramIndex = 1;

    if (filters?.countryId) {
      conditions.push(`c.country_id = $${paramIndex++}`);
      filterParams.push(filters.countryId);
    }

    if (filters?.platform) {
      conditions.push(`c.platform = $${paramIndex++}`);
      filterParams.push(filters.platform);
    }

    if (filters?.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      filterParams.push(filters.status);
    }

    if (filters?.createdBy) {
      conditions.push(`c.created_by = $${paramIndex++}`);
      filterParams.push(filters.createdBy);
    }

    // Build cursor clause (WHERE + ORDER BY + LIMIT)
    const cursorQuery = buildCursorQuery(
      sortBy,
      options?.cursor,
      requestedLimit,
      sortOrder,
      paramIndex,
    );

    // Merge cursor conditions into the existing WHERE conditions
    // cursorQuery.sql might start with a keyset condition followed by ORDER BY + LIMIT
    const cursorParts = cursorQuery.sql.split(/\s+ORDER BY\s+/i);
    const cursorCondition = cursorParts[0].trim();
    const orderAndLimit = `ORDER BY ${cursorParts[1]}`;

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allParams = [...filterParams, ...cursorQuery.params];

    const dataResult = await pool.query<Campaign>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       ${whereClause}
       ${orderAndLimit}`,
      allParams,
    );

    // We fetched limit + 1 rows. If we got more than `requestedLimit`, there
    // are additional pages.
    const hasMore = dataResult.rows.length > requestedLimit;
    const rows = hasMore
      ? dataResult.rows.slice(0, requestedLimit)
      : dataResult.rows;

    // Resolve the sort column name used for cursor values
    const sortColumnKey = sortBy as keyof Campaign;

    // Build cursors
    let nextCursor: string | null = null;
    let previousCursor: string | null = null;

    if (rows.length > 0) {
      // Previous cursor: the first item in the returned page
      if (options?.cursor) {
        // Only provide a previousCursor when we are past the first page
        const firstRow = rows[0];
        previousCursor = encodeCursor(
          firstRow.id,
          String(firstRow[sortColumnKey] ?? firstRow.created_at),
        );
      }

      if (hasMore) {
        const lastRow = rows[rows.length - 1];
        nextCursor = encodeCursor(
          lastRow.id,
          String(lastRow[sortColumnKey] ?? lastRow.created_at),
        );
      }
    }

    const result: CursorPaginatedResult = {
      data: rows,
      nextCursor,
      previousCursor,
      hasMore,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Campaigns cursor list cached', { cacheKey });

    return result;
  }

  /**
   * Retrieve a single campaign by its UUID, including computed metrics.
   */
  static async getById(id: string): Promise<Campaign> {
    const result = await pool.query<Campaign>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Campaign with id "${id}" not found`);
    }

    return result.rows[0];
  }

  /**
   * Create a new campaign with status 'draft'. Validates that the
   * referenced country exists before inserting.
   */
  static async create(
    data: CreateCampaignInput,
    userId: string,
  ): Promise<Campaign> {
    // Validate country exists
    const countryResult = await pool.query(
      'SELECT id FROM countries WHERE id = $1',
      [data.countryId],
    );

    if (countryResult.rows.length === 0) {
      throw new NotFoundError(`Country with id "${data.countryId}" not found`);
    }

    const id = generateId();

    const result = await pool.query<Campaign>(
      `INSERT INTO campaigns (id, name, country_id, platform, type, status, budget, spent, start_date, end_date, impressions, clicks, conversions, revenue, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, 0, $7, $8, 0, 0, 0, 0, $9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.name,
        data.countryId,
        data.platform,
        data.type,
        data.budget,
        data.startDate,
        data.endDate,
        userId,
      ],
    );

    // Invalidate list caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Campaign created', { campaignId: id, userId, name: data.name });

    const campaign = result.rows[0];

    await AuditService.log({
      userId,
      action: 'campaign.create',
      resourceType: 'campaign',
      resourceId: id,
      details: { name: data.name, platform: data.platform, countryId: data.countryId, budget: data.budget },
    });

    eventBus.broadcast('campaigns', {
      action: 'created',
      campaignId: id,
      name: data.name,
      platform: data.platform,
      userId,
    });

    return campaign;
  }

  /**
   * Update fields on an existing campaign. Invalidates caches afterward.
   */
  static async update(
    id: string,
    data: Partial<UpdateCampaignInput>,
  ): Promise<Campaign> {
    // Ensure the campaign exists first
    await CampaignsService.getById(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.countryId !== undefined) {
      // Validate country exists
      const countryResult = await pool.query(
        'SELECT id FROM countries WHERE id = $1',
        [data.countryId],
      );
      if (countryResult.rows.length === 0) {
        throw new NotFoundError(`Country with id "${data.countryId}" not found`);
      }
      fields.push(`country_id = $${paramIndex++}`);
      params.push(data.countryId);
    }
    if (data.platform !== undefined) {
      fields.push(`platform = $${paramIndex++}`);
      params.push(data.platform);
    }
    if (data.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      params.push(data.type);
    }
    if (data.budget !== undefined) {
      fields.push(`budget = $${paramIndex++}`);
      params.push(data.budget);
    }
    if (data.startDate !== undefined) {
      fields.push(`start_date = $${paramIndex++}`);
      params.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      fields.push(`end_date = $${paramIndex++}`);
      params.push(data.endDate);
    }

    if (fields.length === 0) {
      return CampaignsService.getById(id);
    }

    fields.push('updated_at = NOW()');
    params.push(id);

    const result = await pool.query<Campaign>(
      `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Campaign updated', { campaignId: id });

    const campaign = result.rows[0];

    await AuditService.log({
      action: 'campaign.update',
      resourceType: 'campaign',
      resourceId: id,
      details: { updatedFields: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined) },
    });

    eventBus.broadcast('campaigns', {
      action: 'updated',
      campaignId: id,
      updatedFields: Object.keys(data).filter(
        (k) => (data as Record<string, unknown>)[k] !== undefined,
      ),
    });

    return campaign;
  }

  /**
   * Change the status of a campaign with validation of allowed transitions.
   *
   * Valid transitions:
   *   draft -> active | archived
   *   active -> paused | completed
   *   paused -> active | completed
   *
   * Logs the status change to the campaign_status_audit table.
   */
  static async updateStatus(
    id: string,
    status: string,
    userId: string,
  ): Promise<Campaign> {
    const campaign = await CampaignsService.getById(id);
    const currentStatus = campaign.status;

    // Validate the transition
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions) {
      throw new ValidationError(
        `Cannot transition from status "${currentStatus}"`,
      );
    }

    if (!allowedTransitions.includes(status)) {
      throw new ValidationError(
        `Invalid status transition: "${currentStatus}" -> "${status}". Allowed: ${allowedTransitions.join(', ')}`,
      );
    }

    const result = await withTransaction(async (client) => {
      const updateResult = await client.query<Campaign>(
        `UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, id],
      );

      // Log status change in audit table
      await client.query(
        `INSERT INTO campaign_status_audit (id, campaign_id, previous_status, new_status, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [generateId(), id, currentStatus, status, userId],
      );

      return updateResult.rows[0];
    });

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Campaign status updated', {
      campaignId: id,
      previousStatus: currentStatus,
      newStatus: status,
      userId,
    });

    await AuditService.log({
      userId,
      action: 'campaign.updateStatus',
      resourceType: 'campaign',
      resourceId: id,
      details: { previousStatus: currentStatus, newStatus: status },
    });

    eventBus.broadcast('campaigns', {
      action: 'status_changed',
      campaignId: id,
      previousStatus: currentStatus,
      newStatus: status,
      userId,
    });

    return result;
  }

  /**
   * Soft-delete a campaign by setting its status to 'archived'.
   */
  static async delete(id: string): Promise<void> {
    const result = await pool.query(
      `UPDATE campaigns SET status = 'archived', updated_at = NOW() WHERE id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Campaign with id "${id}" not found`);
    }

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Campaign soft-deleted (archived)', { campaignId: id });

    await AuditService.log({
      action: 'campaign.delete',
      resourceType: 'campaign',
      resourceId: id,
      details: { status: 'archived' },
    });

    eventBus.broadcast('campaigns', {
      action: 'deleted',
      campaignId: id,
    });
  }

  /**
   * Get / compute campaign performance metrics including derived KPIs:
   * CTR (click-through rate), CPC (cost per click), CPA (cost per
   * acquisition), and ROAS (return on ad spend).
   */
  static async getMetrics(id: string): Promise<CampaignMetrics> {
    const campaign = await CampaignsService.getById(id);

    const impressions = Number(campaign.impressions) || 0;
    const clicks = Number(campaign.clicks) || 0;
    const conversions = Number(campaign.conversions) || 0;
    const spend = Number(campaign.spent) || 0;
    const revenue = Number(campaign.revenue) || 0;

    // Derived metrics
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    return {
      impressions,
      clicks,
      conversions,
      spend,
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 100) / 100,
    };
  }

  /**
   * Retrieve all campaigns associated with a given country.
   */
  static async getByCampaignCountry(countryId: string): Promise<Campaign[]> {
    const result = await pool.query<Campaign>(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.country_id = $1
       ORDER BY c.created_at DESC`,
      [countryId],
    );

    return result.rows;
  }

  /**
   * Compute total spend aggregated by platform and by country, optionally
   * filtered to a date range.
   */
  static async getSpendSummary(
    filters?: { startDate?: string; endDate?: string },
  ): Promise<SpendSummary> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.startDate) {
      conditions.push(`c.start_date >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push(`c.end_date <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total spend
    const totalResult = await pool.query<{ total_spend: string }>(
      `SELECT COALESCE(SUM(spent), 0) AS total_spend FROM campaigns c ${whereClause}`,
      params,
    );
    const totalSpend = parseFloat(totalResult.rows[0].total_spend);

    // Spend by platform
    const platformResult = await pool.query<{ platform: string; total: string }>(
      `SELECT platform, COALESCE(SUM(spent), 0) AS total
       FROM campaigns c ${whereClause}
       GROUP BY platform
       ORDER BY total DESC`,
      params,
    );
    const byPlatform: Record<string, number> = {};
    for (const row of platformResult.rows) {
      byPlatform[row.platform] = parseFloat(row.total);
    }

    // Spend by country
    const countryResult = await pool.query<{ country_name: string; total: string }>(
      `SELECT co.name AS country_name, COALESCE(SUM(c.spent), 0) AS total
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       ${whereClause}
       GROUP BY co.name
       ORDER BY total DESC`,
      params,
    );
    const byCountry: Record<string, number> = {};
    for (const row of countryResult.rows) {
      byCountry[row.country_name] = parseFloat(row.total);
    }

    return {
      totalSpend,
      byPlatform,
      byCountry,
    };
  }
}

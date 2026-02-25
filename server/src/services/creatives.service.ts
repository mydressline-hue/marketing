/**
 * Creatives Service.
 *
 * Provides static methods for managing creative assets (ad copy, video
 * scripts, UGC scripts, images, thumbnails) linked to campaigns. Supports
 * CRUD operations, performance metric updates, and fatigue-score queries.
 */

import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Creative {
  id: string;
  name: string;
  type: string;
  campaignId: string;
  content: string;
  performance: Record<string, unknown> | null;
  fatigueScore: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeFilters {
  type?: string;
  campaignId?: string;
  isActive?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T = Creative> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): Creative {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as string,
    campaignId: row.campaign_id as string,
    content: row.content as string,
    performance: (row.performance as Record<string, unknown>) ?? null,
    fatigueScore: Number(row.fatigue_score ?? 0),
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CreativesService {
  /**
   * List creatives with optional filters and pagination.
   */
  static async list(
    filters: CreativeFilters = {},
    pagination: Pagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters.campaignId) {
      conditions.push(`campaign_id = $${paramIndex++}`);
      params.push(filters.campaignId);
    }

    if (filters.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.isActive);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sortBy = pagination.sortBy ?? 'created_at';
    const sortOrder = pagination.sortOrder ?? 'desc';
    const offset = (pagination.page - 1) * pagination.limit;

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM creatives ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data query
    const dataResult = await pool.query(
      `SELECT * FROM creatives ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pagination.limit, offset],
    );

    return {
      data: dataResult.rows.map(mapRow),
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Retrieve a single creative by ID.
   */
  static async getById(id: string): Promise<Creative> {
    const result = await pool.query(
      'SELECT * FROM creatives WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Creative with id '${id}' not found`);
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Create a new creative. Validates that the associated campaign exists
   * before inserting.
   */
  static async create(
    data: {
      name: string;
      type: string;
      campaignId: string;
      content: string;
    },
    userId: string,
  ): Promise<Creative> {
    // Validate campaign exists
    const campaignResult = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1',
      [data.campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign with id '${data.campaignId}' not found`);
    }

    const id = generateId();

    const result = await pool.query(
      `INSERT INTO creatives (id, name, type, campaign_id, content, performance, fatigue_score, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, '{}', 0, true, $6, NOW(), NOW())
       RETURNING *`,
      [id, data.name, data.type, data.campaignId, data.content, userId],
    );

    logger.info('Creative created', { creativeId: id, userId, type: data.type });

    return mapRow(result.rows[0]);
  }

  /**
   * Update an existing creative.
   */
  static async update(
    id: string,
    data: Partial<{
      name: string;
      type: string;
      content: string;
      campaignId: string;
    }>,
  ): Promise<Creative> {
    // Ensure the creative exists
    await CreativesService.getById(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      params.push(data.type);
    }
    if (data.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      params.push(data.content);
    }
    if (data.campaignId !== undefined) {
      fields.push(`campaign_id = $${paramIndex++}`);
      params.push(data.campaignId);
    }

    if (fields.length === 0) {
      return CreativesService.getById(id);
    }

    fields.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE creatives SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...params, id],
    );

    logger.info('Creative updated', { creativeId: id });

    return mapRow(result.rows[0]);
  }

  /**
   * Soft-delete a creative by setting is_active to false.
   */
  static async delete(id: string): Promise<void> {
    const result = await pool.query(
      'UPDATE creatives SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Creative with id '${id}' not found`);
    }

    logger.info('Creative soft-deleted', { creativeId: id });
  }

  /**
   * Update the performance JSONB column for a creative.
   */
  static async updatePerformance(
    id: string,
    metrics: Record<string, unknown>,
  ): Promise<Creative> {
    // Ensure the creative exists
    await CreativesService.getById(id);

    const result = await pool.query(
      `UPDATE creatives
       SET performance = performance || $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metrics), id],
    );

    logger.info('Creative performance updated', { creativeId: id, metrics });

    return mapRow(result.rows[0]);
  }

  /**
   * Retrieve all creatives whose fatigue score is at or above the given
   * threshold.
   */
  static async getByFatigueScore(threshold: number): Promise<Creative[]> {
    const result = await pool.query(
      'SELECT * FROM creatives WHERE fatigue_score >= $1 AND is_active = true ORDER BY fatigue_score DESC',
      [threshold],
    );

    return result.rows.map(mapRow);
  }
}

/**
 * Content Service.
 *
 * Provides static methods for managing marketing content (articles, landing
 * pages, blog posts, etc.) with full lifecycle support including drafting,
 * publishing, unpublishing, and full-text search. Content is associated with
 * a country and language for localisation purposes.
 */

import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Content {
  id: string;
  title: string;
  body: string;
  status: string;
  seoKeywords: string[];
  countryId: string;
  language: string;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentFilters {
  status?: string;
  countryId?: string;
  language?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T = Content> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): Content {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    status: row.status as string,
    seoKeywords: (row.seo_keywords as string[]) ?? [],
    countryId: row.country_id as string,
    language: row.language as string,
    publishedAt: (row.published_at as string) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Allowed sort columns (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  title: 'title',
  status: 'status',
  language: 'language',
  published_at: 'published_at',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContentService {
  /**
   * List content with optional filters and pagination.
   */
  static async list(
    filters: ContentFilters = {},
    pagination: Pagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.countryId) {
      conditions.push(`country_id = $${paramIndex++}`);
      params.push(filters.countryId);
    }

    if (filters.language) {
      conditions.push(`language = $${paramIndex++}`);
      params.push(filters.language);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sortBy = ALLOWED_SORT_COLUMNS[pagination.sortBy ?? 'created_at'] ?? 'created_at';
    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM content ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data query
    const dataResult = await pool.query(
      `SELECT * FROM content ${whereClause}
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
   * Retrieve a single content item by ID.
   */
  static async getById(id: string): Promise<Content> {
    const result = await pool.query(
      'SELECT * FROM content WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Content with id '${id}' not found`);
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Create a new content item. Defaults to 'draft' status.
   */
  static async create(
    data: {
      title: string;
      body: string;
      seoKeywords: string[];
      countryId: string;
      language: string;
    },
    userId: string,
  ): Promise<Content> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO content (id, title, body, status, seo_keywords, country_id, language, published_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, NULL, $7, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.title,
        data.body,
        JSON.stringify(data.seoKeywords),
        data.countryId,
        data.language,
        userId,
      ],
    );

    logger.info('Content created', { contentId: id, userId, title: data.title });

    return mapRow(result.rows[0]);
  }

  /**
   * Update an existing content item.
   */
  static async update(
    id: string,
    data: Partial<{
      title: string;
      body: string;
      seoKeywords: string[];
      countryId: string;
      language: string;
    }>,
  ): Promise<Content> {
    // Ensure the content exists
    await ContentService.getById(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.body !== undefined) {
      fields.push(`body = $${paramIndex++}`);
      params.push(data.body);
    }
    if (data.seoKeywords !== undefined) {
      fields.push(`seo_keywords = $${paramIndex++}`);
      params.push(JSON.stringify(data.seoKeywords));
    }
    if (data.countryId !== undefined) {
      fields.push(`country_id = $${paramIndex++}`);
      params.push(data.countryId);
    }
    if (data.language !== undefined) {
      fields.push(`language = $${paramIndex++}`);
      params.push(data.language);
    }

    if (fields.length === 0) {
      return ContentService.getById(id);
    }

    fields.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE content SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      [...params, id],
    );

    logger.info('Content updated', { contentId: id });

    return mapRow(result.rows[0]);
  }

  /**
   * Soft-delete a content item by setting status to 'archived'.
   */
  static async delete(id: string): Promise<void> {
    const result = await pool.query(
      "UPDATE content SET status = 'archived', updated_at = NOW() WHERE id = $1",
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Content with id '${id}' not found`);
    }

    logger.info('Content deleted (archived)', { contentId: id });
  }

  /**
   * Publish a content item. Sets status to 'published' and records the
   * publish timestamp. Also inserts an audit log entry.
   */
  static async publish(id: string, userId: string): Promise<Content> {
    const content = await ContentService.getById(id);

    if (content.status === 'published') {
      throw new ValidationError('Content is already published');
    }

    const result = await pool.query(
      `UPDATE content
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    // Log in audit table
    const auditId = generateId();
    await pool.query(
      `INSERT INTO audit_logs (id, entity_type, entity_id, action, user_id, created_at)
       VALUES ($1, 'content', $2, 'publish', $3, NOW())`,
      [auditId, id, userId],
    );

    logger.info('Content published', { contentId: id, userId });

    return mapRow(result.rows[0]);
  }

  /**
   * Unpublish a content item. Sets status back to 'draft' and clears the
   * published_at timestamp.
   */
  static async unpublish(id: string): Promise<Content> {
    const content = await ContentService.getById(id);

    if (content.status !== 'published') {
      throw new ValidationError('Content is not currently published');
    }

    const result = await pool.query(
      `UPDATE content
       SET status = 'draft', published_at = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    logger.info('Content unpublished', { contentId: id });

    return mapRow(result.rows[0]);
  }

  /**
   * Retrieve all content items matching a given status.
   */
  static async getByStatus(status: string): Promise<Content[]> {
    const result = await pool.query(
      'SELECT * FROM content WHERE status = $1 ORDER BY updated_at DESC',
      [status],
    );

    return result.rows.map(mapRow);
  }

  /**
   * Full-text search across title and body fields. Uses PostgreSQL
   * `to_tsvector` / `to_tsquery` for ranked full-text search with an
   * ILIKE fallback for simple substring matching.
   */
  static async searchContent(
    queryStr: string,
    pagination: Pagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const offset = (pagination.page - 1) * pagination.limit;
    const searchTerm = `%${queryStr}%`;

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM content
       WHERE title ILIKE $1 OR body ILIKE $1`,
      [searchTerm],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data query with relevance ordering
    const dataResult = await pool.query(
      `SELECT *,
         ts_rank(
           to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')),
           plainto_tsquery('english', $1)
         ) AS relevance
       FROM content
       WHERE title ILIKE $2 OR body ILIKE $2
       ORDER BY relevance DESC, updated_at DESC
       LIMIT $3 OFFSET $4`,
      [queryStr, searchTerm, pagination.limit, offset],
    );

    return {
      data: dataResult.rows.map(mapRow),
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }
}

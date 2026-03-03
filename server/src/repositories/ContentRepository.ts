/**
 * ContentRepository – Data-access layer for the `content` table.
 *
 * Extends BaseRepository with content-specific query methods such as
 * filtering by status, country, language, and full-text search.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Content {
  id: string;
  title: string;
  body: string | null;
  status: string;
  seoData: Record<string, unknown>;
  countryId: string | null;
  language: string | null;
  shopifyId: string | null;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ContentRepository extends BaseRepository<Content> {
  constructor() {
    super('content');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all content items with a given status.
   */
  async findByStatus(status: string, client?: PoolClient): Promise<Content[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM content WHERE status = $1 ORDER BY updated_at DESC`,
      [status],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all content for a specific country.
   */
  async findByCountryId(countryId: string, client?: PoolClient): Promise<Content[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM content WHERE country_id = $1 ORDER BY created_at DESC`,
      [countryId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all content in a specific language.
   */
  async findByLanguage(language: string, client?: PoolClient): Promise<Content[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM content WHERE language = $1 ORDER BY created_at DESC`,
      [language],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all content items created by a specific user.
   */
  async findByCreatedBy(userId: string, client?: PoolClient): Promise<Content[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM content WHERE created_by = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Full-text search across title and body using ILIKE.
   */
  async search(
    query: string,
    options?: { limit?: number; offset?: number },
    client?: PoolClient,
  ): Promise<Content[]> {
    const db = client || pool;
    const searchTerm = `%${query}%`;
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const result = await db.query(
      `SELECT *,
         ts_rank(
           to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(body, '')),
           plainto_tsquery('english', $1)
         ) AS relevance
       FROM content
       WHERE title ILIKE $2 OR body ILIKE $2
       ORDER BY relevance DESC, updated_at DESC
       LIMIT $3 OFFSET $4`,
      [query, searchTerm, limit, offset],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Content {
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      body: (row.body as string) ?? null,
      status: (row.status as string) ?? 'draft',
      seoData: (row.seo_data as Record<string, unknown>) ?? {},
      countryId: (row.country_id as string) ?? null,
      language: (row.language as string) ?? null,
      shopifyId: (row.shopify_id as string) ?? null,
      publishedAt: (row.published_at as string) ?? null,
      createdBy: (row.created_by as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}

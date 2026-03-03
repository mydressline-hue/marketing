/**
 * BaseRepository – Generic data-access layer for PostgreSQL tables.
 *
 * Provides common CRUD operations (findById, findByIds, findAll, count,
 * create, update, delete) that concrete repositories inherit. Every method
 * accepts an optional `PoolClient` parameter so that callers can pass an
 * existing transactional client when atomicity across multiple operations is
 * required.
 *
 * Subclasses must implement the abstract `mapRow` method which converts a
 * raw database row into the typed entity, handling null/undefined columns
 * gracefully.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anything that exposes a `.query()` method compatible with pg's Pool/Client. */
type Queryable = Pick<Pool | PoolClient, 'query'>;

export interface FindAllOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  direction?: 'ASC' | 'DESC';
}

// ---------------------------------------------------------------------------
// Base Repository
// ---------------------------------------------------------------------------

export abstract class BaseRepository<T> {
  constructor(protected readonly tableName: string) {}

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Find a single row by its primary key.
   *
   * Returns `null` when no matching row exists.
   */
  async findById(id: string, client?: PoolClient): Promise<T | null> {
    const db: Queryable = client || pool;
    const result: QueryResult<QueryResultRow> = await db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find multiple rows whose `id` is contained in the given array.
   *
   * Returns an empty array when `ids` is empty or no matches are found.
   */
  async findByIds(ids: string[], client?: PoolClient): Promise<T[]> {
    if (ids.length === 0) return [];
    const db: Queryable = client || pool;
    const result: QueryResult<QueryResultRow> = await db.query(
      `SELECT * FROM ${this.tableName} WHERE id = ANY($1)`,
      [ids],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Retrieve all rows with optional pagination and ordering.
   *
   * The `orderBy` value is **not** interpolated from user input by default —
   * concrete repositories should validate/whitelist sort columns before
   * passing them here.
   */
  async findAll(
    options?: FindAllOptions,
    client?: PoolClient,
  ): Promise<T[]> {
    const db: Queryable = client || pool;

    const orderBy = options?.orderBy ?? 'created_at';
    const direction = options?.direction ?? 'DESC';
    const limit = options?.limit;
    const offset = options?.offset;

    let sql = `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${direction}`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (limit !== undefined) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    if (offset !== undefined) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(offset);
    }

    const result: QueryResult<QueryResultRow> = await db.query(sql, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Count
  // -----------------------------------------------------------------------

  /**
   * Count rows, optionally filtered by simple equality conditions.
   *
   * Each key in `where` is treated as a column name and matched with `=`.
   * Pass an empty object (or omit) to count all rows.
   */
  async count(
    where?: Record<string, unknown>,
    client?: PoolClient,
  ): Promise<number> {
    const db: Queryable = client || pool;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (where) {
      for (const [column, value] of Object.entries(where)) {
        if (value === undefined) continue;
        conditions.push(`${column} = $${paramIndex++}`);
        params.push(value);
      }
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT COUNT(*) AS count FROM ${this.tableName} ${whereClause}`,
      params,
    );

    return parseInt(result.rows[0].count, 10);
  }

  // -----------------------------------------------------------------------
  // Create
  // -----------------------------------------------------------------------

  /**
   * Insert a new row and return the mapped entity.
   *
   * Keys of `data` are used as column names; values become parameterised
   * query arguments. Callers are responsible for providing an `id` if the
   * table does not auto-generate one.
   */
  async create(data: Partial<T>, client?: PoolClient): Promise<T> {
    const db: Queryable = client || pool;

    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    );

    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const placeholders = entries.map((_, i) => `$${i + 1}`);

    const result: QueryResult<QueryResultRow> = await db.query(
      `INSERT INTO ${this.tableName} (${columns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values,
    );

    return this.mapRow(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  /**
   * Update a row by its primary key and return the updated entity.
   *
   * Only columns present (and not `undefined`) in `data` are updated.
   * Returns `null` when no row with the given `id` exists.
   */
  async update(
    id: string,
    data: Partial<T>,
    client?: PoolClient,
  ): Promise<T | null> {
    const db: Queryable = client || pool;

    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    );

    if (entries.length === 0) {
      return this.findById(id, client ?? undefined);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of entries) {
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }

    params.push(id);

    const result: QueryResult<QueryResultRow> = await db.query(
      `UPDATE ${this.tableName}
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  /**
   * Delete a row by its primary key.
   *
   * Returns `true` when a row was actually deleted, `false` otherwise.
   */
  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const db: Queryable = client || pool;
    const result = await db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // -----------------------------------------------------------------------
  // Abstract mapping
  // -----------------------------------------------------------------------

  /**
   * Convert a raw database row into the typed entity `T`.
   *
   * Implementations must handle null/undefined column values gracefully
   * (e.g. by coalescing to sensible defaults).
   */
  protected abstract mapRow(row: Record<string, unknown>): T;
}

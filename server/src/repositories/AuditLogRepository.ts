/**
 * AuditLogRepository – Data-access layer for the `audit_logs` table.
 *
 * Extends BaseRepository with audit-specific query methods such as
 * filtering by user, action, resource type, and date range. The audit_logs
 * table is append-only (immutable), so the inherited `update` and `delete`
 * methods exist for completeness but should generally not be used.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor() {
    super('audit_logs');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all audit log entries for a specific user, newest first.
   */
  async findByUserId(userId: string, client?: PoolClient): Promise<AuditLog[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all audit log entries for a specific action.
   */
  async findByAction(action: string, client?: PoolClient): Promise<AuditLog[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at DESC`,
      [action],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all audit log entries for a specific resource.
   */
  async findByResource(
    resourceType: string,
    resourceId: string,
    client?: PoolClient,
  ): Promise<AuditLog[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM audit_logs
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY created_at DESC`,
      [resourceType, resourceId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all audit log entries of a specific resource type.
   */
  async findByResourceType(
    resourceType: string,
    client?: PoolClient,
  ): Promise<AuditLog[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM audit_logs
       WHERE resource_type = $1
       ORDER BY created_at DESC`,
      [resourceType],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find audit log entries within a date range, newest first.
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    client?: PoolClient,
  ): Promise<AuditLog[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM audit_logs
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC`,
      [startDate, endDate],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find audit log entries matching multiple filter criteria.
   */
  async findByFilters(
    filters: {
      userId?: string;
      action?: string;
      resourceType?: string;
      startDate?: string;
      endDate?: string;
    },
    options?: { limit?: number; offset?: number },
    client?: PoolClient,
  ): Promise<AuditLog[]> {
    const db = client || pool;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }
    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let sql = `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC`;

    if (options?.limit !== undefined) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }
    if (options?.offset !== undefined) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await db.query(sql, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): AuditLog {
    let details: Record<string, unknown> | null = null;
    if (row.details != null) {
      details =
        typeof row.details === 'string'
          ? JSON.parse(row.details as string)
          : (row.details as Record<string, unknown>);
    }

    return {
      id: row.id as string,
      userId: (row.user_id as string) ?? null,
      action: (row.action as string) ?? '',
      resourceType: (row.resource_type as string) ?? null,
      resourceId: (row.resource_id as string) ?? null,
      details,
      ipAddress: (row.ip_address as string) ?? null,
      createdAt: (row.created_at as string) ?? '',
    };
  }
}

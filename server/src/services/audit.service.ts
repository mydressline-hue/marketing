/**
 * Audit Logging Service.
 *
 * Provides an immutable audit trail by inserting records into the
 * `audit_logs` table. Entries are append-only -- they are never updated
 * or deleted -- ensuring a tamper-resistant history of user actions and
 * system events.
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface PaginatedResult {
  data: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuditQueryFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AuditService {
  /**
   * Log an audit event.
   *
   * Inserts an immutable record into the `audit_logs` table. This method
   * never updates or deletes existing entries, preserving the integrity of
   * the audit trail.
   *
   * Failures are caught and logged rather than propagated so that audit
   * logging never disrupts the primary request flow.
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      const id = generateId();

      await pool.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          id,
          entry.userId || null,
          entry.action,
          entry.resourceType,
          entry.resourceId || null,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ipAddress || null,
        ],
      );

      logger.debug('Audit log recorded', {
        auditId: id,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
      });
    } catch (error) {
      // Audit logging should never break the caller's flow
      logger.error('Failed to write audit log', {
        error: error instanceof Error ? error.message : String(error),
        entry,
      });
    }
  }

  /**
   * Query audit logs with filtering and pagination.
   *
   * Supports filtering by user, action, resource type, and date range.
   * Results are returned newest-first with pagination metadata.
   */
  static async query(filters: AuditQueryFilters): Promise<PaginatedResult> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

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

    // Count total matching rows
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    // Fetch the page of results
    const dataResult = await pool.query(
      `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data: AuditLog[] = dataResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details:
        typeof row.details === 'string'
          ? JSON.parse(row.details)
          : row.details,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));

    return { data, total, page, totalPages };
  }

  /**
   * Get all audit log entries for a specific resource.
   *
   * Returns every audit event associated with the given resource type and
   * ID, ordered newest-first.
   */
  static async getForResource(
    resourceType: string,
    resourceId: string,
  ): Promise<AuditLog[]> {
    const result = await pool.query(
      `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, created_at
       FROM audit_logs
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY created_at DESC`,
      [resourceType, resourceId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details:
        typeof row.details === 'string'
          ? JSON.parse(row.details)
          : row.details,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));
  }
}

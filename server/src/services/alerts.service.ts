/**
 * Fraud Alert Management Service.
 *
 * Provides static methods for creating, listing, acknowledging, resolving,
 * and dismissing fraud alerts. Alert lifecycle transitions are persisted in
 * the `fraud_alerts` table and significant state changes are recorded in the
 * `audit_logs` table for traceability.
 */

import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { withTransaction } from '../utils/transaction';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FraudAlert {
  id: string;
  type: string;
  campaignId: string | null;
  severity: string;
  confidenceScore: number;
  status: string;
  details: object;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface AlertFilters {
  type?: string;
  severity?: string;
  status?: string;
}

export interface Pagination {
  page?: number;
  limit?: number;
}

export interface PaginatedResult {
  data: FraudAlert[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AlertStats {
  total: number;
  open: number;
  investigating: number;
  resolved: number;
  bySeverity: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToAlert(row: Record<string, unknown>): FraudAlert {
  return {
    id: row.id as string,
    type: row.type as string,
    campaignId: (row.campaign_id as string) ?? null,
    severity: row.severity as string,
    confidenceScore: Number(row.confidence_score),
    status: row.status as string,
    details: (row.details as object) ?? {},
    createdAt: row.created_at as string,
    acknowledgedBy: (row.acknowledged_by as string) ?? null,
    acknowledgedAt: (row.acknowledged_at as string) ?? null,
    resolvedBy: (row.resolved_by as string) ?? null,
    resolvedAt: (row.resolved_at as string) ?? null,
    resolution: (row.resolution as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AlertsService {
  /**
   * List fraud alerts with optional filtering and pagination.
   */
  static async list(
    filters?: AlertFilters,
    pagination?: Pagination,
  ): Promise<PaginatedResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters?.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching rows
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM fraud_alerts ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Pagination defaults
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT id, type, campaign_id, severity, confidence_score, status, details, created_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution FROM fraud_alerts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(rowToAlert),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Retrieve a single fraud alert by its ID.
   *
   * @throws NotFoundError if the alert does not exist.
   */
  static async getById(id: string): Promise<FraudAlert> {
    const result = await pool.query(
      `SELECT id, type, campaign_id, severity, confidence_score, status, details, created_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution FROM fraud_alerts WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Fraud alert with id '${id}' not found`);
    }

    return rowToAlert(result.rows[0]);
  }

  /**
   * Create a new fraud alert.
   *
   * The alert is created with an initial status of `open`.
   */
  static async create(data: {
    type: string;
    campaignId?: string;
    severity: string;
    confidenceScore: number;
    details: object;
  }): Promise<FraudAlert> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO fraud_alerts
         (id, type, campaign_id, severity, confidence_score, status, details, created_at)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, NOW())
       RETURNING *`,
      [
        id,
        data.type,
        data.campaignId ?? null,
        data.severity,
        data.confidenceScore,
        JSON.stringify(data.details),
      ],
    );

    logger.info('Fraud alert created', { alertId: id, type: data.type, severity: data.severity });

    return rowToAlert(result.rows[0]);
  }

  /**
   * Acknowledge an alert, transitioning its status to `investigating`.
   *
   * Records the acknowledgement in the audit log.
   */
  static async acknowledge(id: string, userId: string): Promise<FraudAlert> {
    const row = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE fraud_alerts
         SET status = 'investigating',
             acknowledged_by = $2,
             acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, userId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Fraud alert with id '${id}' not found`);
      }

      // Record in audit log
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, $2, 'alert_acknowledged', 'fraud_alert', $3, $4, NOW())`,
        [generateId(), userId, id, JSON.stringify({ status: 'investigating' })],
      );

      return result.rows[0];
    });

    logger.info('Fraud alert acknowledged', { alertId: id, userId });

    return rowToAlert(row);
  }

  /**
   * Resolve an alert with an optional resolution note.
   *
   * Sets the status to `resolved` and records the resolving user and
   * timestamp. Also logs the action in the audit trail.
   */
  static async resolve(
    id: string,
    userId: string,
    resolution?: string,
  ): Promise<FraudAlert> {
    const row = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE fraud_alerts
         SET status = 'resolved',
             resolved_by = $2,
             resolved_at = NOW(),
             resolution = $3
         WHERE id = $1
         RETURNING *`,
        [id, userId, resolution ?? null],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Fraud alert with id '${id}' not found`);
      }

      // Record in audit log
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, $2, 'alert_resolved', 'fraud_alert', $3, $4, NOW())`,
        [generateId(), userId, id, JSON.stringify({ status: 'resolved', resolution: resolution ?? null })],
      );

      return result.rows[0];
    });

    logger.info('Fraud alert resolved', { alertId: id, userId, resolution });

    return rowToAlert(row);
  }

  /**
   * Dismiss an alert, setting its status to `dismissed`.
   */
  static async dismiss(id: string, userId: string): Promise<FraudAlert> {
    const row = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE fraud_alerts
         SET status = 'dismissed'
         WHERE id = $1
         RETURNING *`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Fraud alert with id '${id}' not found`);
      }

      // Record in audit log
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, $2, 'alert_dismissed', 'fraud_alert', $3, $4, NOW())`,
        [generateId(), userId, id, JSON.stringify({ status: 'dismissed' })],
      );

      return result.rows[0];
    });

    logger.info('Fraud alert dismissed', { alertId: id, userId });

    return rowToAlert(row);
  }

  /**
   * Retrieve all non-resolved alerts ordered by severity.
   *
   * Severity ordering: critical > high > medium > low.
   */
  static async getActiveAlerts(): Promise<FraudAlert[]> {
    const result = await pool.query(
      `SELECT id, type, campaign_id, severity, confidence_score, status, details, created_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution FROM fraud_alerts
       WHERE status NOT IN ('resolved', 'dismissed')
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'medium'   THEN 3
           WHEN 'low'      THEN 4
           ELSE 5
         END,
         created_at DESC`,
    );

    return result.rows.map(rowToAlert);
  }

  /**
   * Compute aggregate statistics for all fraud alerts.
   */
  static async getAlertStats(): Promise<AlertStats> {
    const statusResult = await pool.query(
      `SELECT
         COUNT(*)::int                                       AS total,
         COUNT(*) FILTER (WHERE status = 'open')::int        AS open,
         COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating,
         COUNT(*) FILTER (WHERE status = 'resolved')::int    AS resolved
       FROM fraud_alerts`,
    );

    const severityResult = await pool.query(
      `SELECT severity, COUNT(*)::int AS count
       FROM fraud_alerts
       GROUP BY severity`,
    );

    const bySeverity: Record<string, number> = {};
    for (const row of severityResult.rows) {
      bySeverity[row.severity] = row.count;
    }

    const stats = statusResult.rows[0];

    return {
      total: stats.total,
      open: stats.open,
      investigating: stats.investigating,
      resolved: stats.resolved,
      bySeverity,
    };
  }
}

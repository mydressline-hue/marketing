/**
 * Audit Log Controller -- Express request handlers.
 *
 * Each handler delegates to `AuditService` or runs direct SQL queries against
 * the `audit_logs` table, returning structured JSON envelopes:
 * `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuditService } from '../services/audit.service';
import { pool } from '../config/database';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /audit
 * Query audit logs with optional filtering and pagination.
 *
 * Query params: userId, action, resourceType, startDate, endDate, page, limit.
 */
export const queryAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { userId, action, resourceType, startDate, endDate, page, limit } = req.query;

  const result = await AuditService.query({
    userId: userId as string | undefined,
    action: action as string | undefined,
    resourceType: resourceType as string | undefined,
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  });

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /audit/:resourceType/:resourceId
 * Get the full audit trail for a specific resource.
 */
export const getResourceAuditTrail = asyncHandler(async (req: Request, res: Response) => {
  const { resourceType, resourceId } = req.params;

  const logs = await AuditService.getForResource(resourceType, resourceId);

  res.json({
    success: true,
    data: logs,
  });
});

/**
 * GET /audit/stats
 * Return aggregate audit statistics.
 *
 * Runs several queries against the `audit_logs` table to produce:
 * - Total event count
 * - Top 10 actions by frequency
 * - Event counts by resource type
 * - Top 10 users by event count
 * - Event counts for the last 24 h, 7 d, and 30 d
 */
export const getAuditStats = asyncHandler(async (_req: Request, res: Response) => {
  const [
    totalResult,
    byActionResult,
    byResourceTypeResult,
    byUserResult,
    last24hResult,
    last7dResult,
    last30dResult,
  ] = await Promise.all([
    // Total events
    pool.query('SELECT COUNT(*) AS total FROM audit_logs'),

    // Top 10 actions
    pool.query(
      `SELECT action, COUNT(*) AS count
       FROM audit_logs
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`,
    ),

    // Events by resource type
    pool.query(
      `SELECT resource_type, COUNT(*) AS count
       FROM audit_logs
       GROUP BY resource_type
       ORDER BY count DESC`,
    ),

    // Top 10 users
    pool.query(
      `SELECT user_id, COUNT(*) AS count
       FROM audit_logs
       WHERE user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY count DESC
       LIMIT 10`,
    ),

    // Last 24 hours
    pool.query(
      `SELECT COUNT(*) AS count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    ),

    // Last 7 days
    pool.query(
      `SELECT COUNT(*) AS count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'`,
    ),

    // Last 30 days
    pool.query(
      `SELECT COUNT(*) AS count
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '30 days'`,
    ),
  ]);

  res.json({
    success: true,
    data: {
      totalEvents: parseInt(totalResult.rows[0].total, 10),
      byAction: byActionResult.rows.map((r) => ({
        action: r.action,
        count: parseInt(r.count, 10),
      })),
      byResourceType: byResourceTypeResult.rows.map((r) => ({
        resourceType: r.resource_type,
        count: parseInt(r.count, 10),
      })),
      byUser: byUserResult.rows.map((r) => ({
        userId: r.user_id,
        count: parseInt(r.count, 10),
      })),
      recentActivity: {
        last24h: parseInt(last24hResult.rows[0].count, 10),
        last7d: parseInt(last7dResult.rows[0].count, 10),
        last30d: parseInt(last30dResult.rows[0].count, 10),
      },
    },
  });
});

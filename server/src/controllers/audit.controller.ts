/**
 * Audit Log Controller -- Express request handlers.
 *
 * Each handler delegates to `AuditService`, returning structured JSON
 * envelopes: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuditService } from '../services/audit.service';

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
 */
export const getAuditStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await AuditService.getStats();

  res.json({
    success: true,
    data: stats,
  });
});

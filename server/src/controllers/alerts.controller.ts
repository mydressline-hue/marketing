/**
 * Alerts Controller – Express request handlers.
 *
 * Each handler delegates to `AlertsService` and returns a structured JSON
 * envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AlertsService } from '../services/alerts.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /alerts
 * List fraud alerts with optional filtering and pagination.
 */
export const listAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { type, severity, status, page, limit } = req.query;

  const filters = {
    type: type as string | undefined,
    severity: severity as string | undefined,
    status: status as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  };

  const result = await AlertsService.list(filters, pagination);

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
 * GET /alerts/active
 * Retrieve all non-resolved alerts ordered by severity.
 */
export const getActiveAlerts = asyncHandler(async (_req: Request, res: Response) => {
  const alerts = await AlertsService.getActiveAlerts();

  res.json({
    success: true,
    data: alerts,
    total: alerts.length,
  });
});

/**
 * GET /alerts/stats
 * Compute aggregate alert statistics.
 */
export const getAlertStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await AlertsService.getAlertStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /alerts/:id
 * Retrieve a single fraud alert by ID.
 */
export const getAlertById = asyncHandler(async (req: Request, res: Response) => {
  const alert = await AlertsService.getById(req.params.id);

  res.json({
    success: true,
    data: alert,
  });
});

/**
 * POST /alerts
 * Create a new fraud alert.
 */
export const createAlert = asyncHandler(async (req: Request, res: Response) => {
  const { type, campaignId, severity, confidenceScore, details } = req.body;

  const alert = await AlertsService.create({
    type,
    campaignId,
    severity,
    confidenceScore,
    details,
  });

  res.status(201).json({
    success: true,
    data: alert,
  });
});

/**
 * PATCH /alerts/:id/acknowledge
 * Acknowledge a fraud alert, setting status to 'investigating'.
 */
export const acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
  const alert = await AlertsService.acknowledge(req.params.id, req.user!.id);

  res.json({
    success: true,
    data: alert,
  });
});

/**
 * PATCH /alerts/:id/resolve
 * Resolve a fraud alert with an optional resolution note.
 */
export const resolveAlert = asyncHandler(async (req: Request, res: Response) => {
  const { resolution } = req.body;
  const alert = await AlertsService.resolve(req.params.id, req.user!.id, resolution);

  res.json({
    success: true,
    data: alert,
  });
});

/**
 * PATCH /alerts/:id/dismiss
 * Dismiss a fraud alert.
 */
export const dismissAlert = asyncHandler(async (req: Request, res: Response) => {
  const alert = await AlertsService.dismiss(req.params.id, req.user!.id);

  res.json({
    success: true,
    data: alert,
  });
});

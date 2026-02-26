/**
 * Integrations controllers -- Express request handlers.
 *
 * Handlers delegate to IntegrationsService, returning structured JSON
 * envelopes: `{ success, data }` or `{ success, data, meta }` for
 * paginated responses.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { IntegrationsService } from '../services/integrations/IntegrationsService';

// ===========================================================================
// Platform Connection Handlers
// ===========================================================================

/**
 * POST /integrations/connect
 * Connect a new platform integration.
 */
export const connectPlatform = asyncHandler(async (req: Request, res: Response) => {
  const { platform_type, credentials, config } = req.body;
  const userId = req.user!.id;

  const result = await IntegrationsService.connectPlatform({
    platform_type,
    credentials,
    config,
    user_id: userId,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
});

/**
 * DELETE /integrations/:platformType/disconnect
 * Disconnect a platform integration.
 */
export const disconnectPlatform = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.disconnectPlatform(platformType, userId);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Status Handlers
// ===========================================================================

/**
 * GET /integrations/status
 * Get all platform connection statuses.
 */
export const getAllStatuses = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const result = await IntegrationsService.getAllStatuses(userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /integrations/:platformType/status
 * Get connection status for a specific platform.
 */
export const getPlatformStatus = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.getPlatformStatus(platformType, userId);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Sync Handlers
// ===========================================================================

/**
 * POST /integrations/:platformType/sync
 * Trigger a data sync for a specific platform.
 */
export const triggerSync = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.triggerSync(platformType, userId, req.body);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /integrations/:platformType/sync/status
 * Get the current sync status for a specific platform.
 */
export const getSyncStatus = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.getSyncStatus(platformType, userId);

  res.json({
    success: true,
    data: result,
  });
});

// ===========================================================================
// Reports Handlers
// ===========================================================================

/**
 * GET /integrations/:platformType/reports
 * Get reports for a specific platform with optional date range and pagination.
 */
export const getPlatformReports = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;
  const { start_date, end_date, page, limit } = req.query;

  const result = await IntegrationsService.getPlatformReports(
    platformType,
    userId,
    {
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    },
  );

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
});

// ===========================================================================
// CRM Handlers
// ===========================================================================

/**
 * POST /integrations/crm/:platformType/sync-contacts
 * Trigger a CRM contact sync for a specific platform.
 */
export const syncCrmContacts = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.syncCrmContacts(platformType, userId, req.body);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /integrations/crm/:platformType/contacts
 * List CRM contacts for a specific platform with pagination and search.
 */
export const listCrmContacts = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;
  const { page, limit, search } = req.query;

  const result = await IntegrationsService.listCrmContacts(
    platformType,
    userId,
    {
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
      search: search as string | undefined,
    },
  );

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
});

// ===========================================================================
// Analytics Handlers
// ===========================================================================

/**
 * POST /integrations/analytics/:platformType/export
 * Export analytics data for a specific platform. Returns 202 Accepted.
 */
export const exportAnalyticsData = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;

  const result = await IntegrationsService.exportAnalyticsData(platformType, userId, req.body);

  res.status(202).json({
    success: true,
    data: result,
  });
});

/**
 * GET /integrations/analytics/:platformType/dashboards
 * List analytics dashboards for a specific platform.
 */
export const listAnalyticsDashboards = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user!.id;
  const { page, limit } = req.query;

  const result = await IntegrationsService.listDashboards(
    platformType,
    userId,
    {
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    },
  );

  res.json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
});

/**
 * Dashboard controller -- Express request handlers.
 *
 * Each handler delegates to `DashboardService` and returns a structured JSON
 * envelope: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DashboardService } from '../services/dashboard/DashboardService';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /dashboard/overview
 * Return the full dashboard overview aggregating spend, campaigns,
 * integrations, CRM, agents, alerts, and system health.
 */
export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const overview = await DashboardService.getOverview(userId);

  res.json({
    success: true,
    data: overview,
  });
});

/**
 * GET /dashboard/spend
 * Return a detailed spend breakdown by platform, country, and day.
 * Accepts optional `startDate` and `endDate` query parameters.
 */
export const getSpendBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { startDate, endDate } = req.query;

  const dateRange = {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };

  const breakdown = await DashboardService.getSpendBreakdown(userId, dateRange);

  res.json({
    success: true,
    data: breakdown,
  });
});

/**
 * GET /dashboard/campaigns
 * Return campaign-level performance metrics with optional filters.
 * Accepts optional `platform`, `status`, and `countryId` query parameters.
 */
export const getCampaignPerformance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { platform, status, countryId } = req.query;

  const filters = {
    platform: platform as string | undefined,
    status: status as string | undefined,
    countryId: countryId as string | undefined,
  };

  const performance = await DashboardService.getCampaignPerformance(userId, filters);

  res.json({
    success: true,
    data: performance,
  });
});

/**
 * GET /dashboard/integrations
 * Return detailed integration health status and recent sync history.
 */
export const getIntegrationHealth = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const health = await DashboardService.getIntegrationHealth(userId);

  res.json({
    success: true,
    data: health,
  });
});

/**
 * GET /dashboard/activity
 * Return the most recent activity events from the audit log.
 * Accepts an optional `limit` query parameter (default 50, max 100).
 */
export const getRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { limit } = req.query;
  const parsedLimit = limit ? parseInt(limit as string, 10) : 50;

  const activity = await DashboardService.getRecentActivity(userId, parsedLimit);

  res.json({
    success: true,
    data: activity,
  });
});

/**
 * Dashboard router.
 *
 * Mounts all dashboard-related endpoints with authentication and permission
 * checks. Every route requires a valid JWT and the appropriate read
 * permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateQuery } from '../middleware/validation';
import { dynamicCacheHeaders } from '../middleware/cacheHeaders';
import { z } from 'zod';
import {
  getOverview,
  getSpendBreakdown,
  getCampaignPerformance,
  getIntegrationHealth,
  getRecentActivity,
} from '../controllers/dashboard.controller';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Must be a valid ISO date string (YYYY-MM-DD)');

const spendBreakdownQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

const campaignPerformanceQuerySchema = z.object({
  platform: z.string().optional(),
  status: z.string().optional(),
  countryId: z.string().optional(),
});

const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit must not exceed 100').optional(),
});

const router = Router();

// ---------------------------------------------------------------------------
// Read-only routes (authentication + read permission required)
// ---------------------------------------------------------------------------

// GET /dashboard/overview -- full aggregated dashboard
router.get(
  '/overview',
  authenticate,
  requirePermission('read:campaigns'),
  dynamicCacheHeaders,
  getOverview,
);

// GET /dashboard/spend -- spend breakdown by platform, country, day
router.get(
  '/spend',
  authenticate,
  requirePermission('read:campaigns'),
  dynamicCacheHeaders,
  validateQuery(spendBreakdownQuerySchema),
  getSpendBreakdown,
);

// GET /dashboard/campaigns -- campaign performance metrics
router.get(
  '/campaigns',
  authenticate,
  requirePermission('read:campaigns'),
  dynamicCacheHeaders,
  validateQuery(campaignPerformanceQuerySchema),
  getCampaignPerformance,
);

// GET /dashboard/integrations -- integration health and sync history
router.get(
  '/integrations',
  authenticate,
  requirePermission('read:integrations'),
  dynamicCacheHeaders,
  getIntegrationHealth,
);

// GET /dashboard/activity -- recent activity feed
router.get(
  '/activity',
  authenticate,
  requirePermission('read:campaigns'),
  dynamicCacheHeaders,
  validateQuery(recentActivityQuerySchema),
  getRecentActivity,
);

export default router;

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
import {
  getOverview,
  getSpendBreakdown,
  getCampaignPerformance,
  getIntegrationHealth,
  getRecentActivity,
} from '../controllers/dashboard.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Read-only routes (authentication + read permission required)
// ---------------------------------------------------------------------------

// GET /dashboard/overview -- full aggregated dashboard
router.get(
  '/overview',
  authenticate,
  requirePermission('read:campaigns'),
  getOverview,
);

// GET /dashboard/spend -- spend breakdown by platform, country, day
router.get(
  '/spend',
  authenticate,
  requirePermission('read:campaigns'),
  getSpendBreakdown,
);

// GET /dashboard/campaigns -- campaign performance metrics
router.get(
  '/campaigns',
  authenticate,
  requirePermission('read:campaigns'),
  getCampaignPerformance,
);

// GET /dashboard/integrations -- integration health and sync history
router.get(
  '/integrations',
  authenticate,
  requirePermission('read:integrations'),
  getIntegrationHealth,
);

// GET /dashboard/activity -- recent activity feed
router.get(
  '/activity',
  authenticate,
  requirePermission('read:campaigns'),
  getRecentActivity,
);

export default router;

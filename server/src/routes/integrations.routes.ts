/**
 * Integrations routes.
 *
 * Mounts all integration endpoints with authentication and permission
 * middleware. Read endpoints require viewer-level access (read:integrations),
 * while write/mutate endpoints require admin privileges (write:integrations).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody } from '../middleware/validation';
import { connectPlatformSchema } from '../validators/schemas';
import {
  connectPlatform,
  disconnectPlatform,
  getAllStatuses,
  getPlatformStatus,
  triggerSync,
  getSyncStatus,
  getPlatformReports,
  syncCrmContacts,
  listCrmContacts,
  exportAnalyticsData,
  listAnalyticsDashboards,
} from '../controllers/integrations.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Platform Connection routes
// ---------------------------------------------------------------------------

// POST /integrations/connect -- connect a new platform (write)
router.post(
  '/connect',
  requirePermission('write:integrations'),
  validateBody(connectPlatformSchema),
  connectPlatform,
);

// DELETE /integrations/:platformType/disconnect -- disconnect platform (write)
router.delete(
  '/:platformType/disconnect',
  requirePermission('write:integrations'),
  disconnectPlatform,
);

// ---------------------------------------------------------------------------
// Status routes
// ---------------------------------------------------------------------------

// GET /integrations/status -- get all platform statuses (read)
router.get(
  '/status',
  requirePermission('read:integrations'),
  getAllStatuses,
);

// GET /integrations/:platformType/status -- get specific platform status (read)
router.get(
  '/:platformType/status',
  requirePermission('read:integrations'),
  getPlatformStatus,
);

// ---------------------------------------------------------------------------
// Sync routes
// ---------------------------------------------------------------------------

// POST /integrations/:platformType/sync -- trigger sync (write)
router.post(
  '/:platformType/sync',
  requirePermission('write:integrations'),
  triggerSync,
);

// GET /integrations/:platformType/sync/status -- get sync status (read)
router.get(
  '/:platformType/sync/status',
  requirePermission('read:integrations'),
  getSyncStatus,
);

// ---------------------------------------------------------------------------
// Reports routes
// ---------------------------------------------------------------------------

// GET /integrations/:platformType/reports -- get platform reports (read)
router.get(
  '/:platformType/reports',
  requirePermission('read:integrations'),
  getPlatformReports,
);

// ---------------------------------------------------------------------------
// CRM routes
// ---------------------------------------------------------------------------

// POST /integrations/crm/:platformType/sync-contacts -- sync CRM contacts (write)
router.post(
  '/crm/:platformType/sync-contacts',
  requirePermission('write:integrations'),
  syncCrmContacts,
);

// GET /integrations/crm/:platformType/contacts -- list CRM contacts (read)
router.get(
  '/crm/:platformType/contacts',
  requirePermission('read:integrations'),
  listCrmContacts,
);

// ---------------------------------------------------------------------------
// Analytics routes
// ---------------------------------------------------------------------------

// POST /integrations/analytics/:platformType/export -- export analytics data (write)
router.post(
  '/analytics/:platformType/export',
  requirePermission('write:integrations'),
  exportAnalyticsData,
);

// GET /integrations/analytics/:platformType/dashboards -- list dashboards (read)
router.get(
  '/analytics/:platformType/dashboards',
  requirePermission('read:integrations'),
  listAnalyticsDashboards,
);

export default router;

/**
 * Audit Log routes.
 *
 * Exposes query, statistics, and per-resource audit trail endpoints.
 * All routes require authentication and admin-level privileges
 * (write:infrastructure -- admin has `*` wildcard so this is satisfied).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  queryAuditLogs,
  getAuditStats,
  getResourceAuditTrail,
} from '../controllers/audit.controller';

const router = Router();

// All audit routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Audit Log routes
// ---------------------------------------------------------------------------

// GET /audit -- query audit logs with filters (admin)
router.get(
  '/',
  requirePermission('write:infrastructure'),
  queryAuditLogs,
);

// GET /audit/stats -- get audit statistics (admin)
router.get(
  '/stats',
  requirePermission('write:infrastructure'),
  getAuditStats,
);

// GET /audit/:resourceType/:resourceId -- get audit trail for a resource (admin)
router.get(
  '/:resourceType/:resourceId',
  requirePermission('write:infrastructure'),
  getResourceAuditTrail,
);

export default router;

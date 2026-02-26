/**
 * Alerts Routes – Express router for fraud alert endpoints.
 *
 * All routes require authentication. The create endpoint additionally
 * requires the `write:campaigns` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody } from '../middleware/validation';
import { createAlertSchema } from '../validators/schemas';
import {
  listAlerts,
  getActiveAlerts,
  getAlertStats,
  getAlertById,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  dismissAlert,
} from '../controllers/alerts.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /alerts – list alerts with optional filters and pagination
router.get('/', authenticate, listAlerts);

// GET /alerts/active – retrieve all non-resolved alerts ordered by severity
router.get('/active', authenticate, getActiveAlerts);

// GET /alerts/stats – aggregate alert statistics
router.get('/stats', authenticate, getAlertStats);

// GET /alerts/:id – retrieve a single alert by ID
router.get('/:id', authenticate, getAlertById);

// POST /alerts – create a new fraud alert (requires write:campaigns)
router.post('/', authenticate, requirePermission('write:campaigns'), validateBody(createAlertSchema), createAlert);

// PATCH /alerts/:id/acknowledge – acknowledge an alert
router.patch('/:id/acknowledge', authenticate, acknowledgeAlert);

// PATCH /alerts/:id/resolve – resolve an alert
router.patch('/:id/resolve', authenticate, resolveAlert);

// PATCH /alerts/:id/dismiss – dismiss an alert
router.patch('/:id/dismiss', authenticate, dismissAlert);

export default router;

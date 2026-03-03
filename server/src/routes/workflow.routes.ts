/**
 * Workflow Routes – Express router for the sequential workflow engine.
 *
 * All routes require authentication. Write operations additionally
 * require the `write:infrastructure` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createWorkflow,
  executeWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
} from '../controllers/workflow.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /workflows – create a new workflow with steps
router.post(
  '/',
  authenticate,
  requirePermission('write:infrastructure'),
  createWorkflow,
);

// POST /workflows/:id/execute – execute a pending workflow
router.post(
  '/:id/execute',
  authenticate,
  requirePermission('write:infrastructure'),
  executeWorkflow,
);

// GET /workflows/:id – get workflow status with all steps
router.get(
  '/:id',
  authenticate,
  requirePermission('read:infrastructure'),
  getWorkflowStatus,
);

// DELETE /workflows/:id – cancel a running/pending workflow
router.delete(
  '/:id',
  authenticate,
  requirePermission('write:infrastructure'),
  cancelWorkflow,
);

export default router;

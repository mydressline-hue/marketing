/**
 * Workflow Routes – Express router for the sequential workflow engine.
 *
 * All routes require authentication. Write operations additionally
 * require the `write:infrastructure` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import { createWorkflowSchema, idParamSchema } from '../validators/schemas';
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
  validateBody(createWorkflowSchema),
  createWorkflow,
);

// POST /workflows/:id/execute – execute a pending workflow
router.post(
  '/:id/execute',
  authenticate,
  requirePermission('write:infrastructure'),
  validateParams(idParamSchema),
  executeWorkflow,
);

// GET /workflows/:id – get workflow status with all steps
router.get(
  '/:id',
  authenticate,
  requirePermission('read:infrastructure'),
  validateParams(idParamSchema),
  getWorkflowStatus,
);

// DELETE /workflows/:id – cancel a running/pending workflow
router.delete(
  '/:id',
  authenticate,
  requirePermission('write:infrastructure'),
  validateParams(idParamSchema),
  cancelWorkflow,
);

export default router;

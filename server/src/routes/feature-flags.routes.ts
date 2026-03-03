/**
 * Feature Flags Routes -- Express router for feature flag management.
 *
 * Public (authenticated) routes for reading flags and checking enablement.
 * Admin-only routes for creating, updating, and deleting flags.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import {
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  flagNameParamSchema,
} from '../validators/schemas';
import {
  getAllFlags,
  getFlag,
  createFlag,
  updateFlag,
  deleteFlag,
  checkFlag,
} from '../controllers/feature-flags.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /feature-flags -- list all flags (any authenticated user)
router.get('/', authenticate, getAllFlags);

// GET /feature-flags/:name/check -- check if flag is enabled for current user
// (must be registered before /:name to avoid "check" being captured as :name)
router.get('/:name/check', authenticate, validateParams(flagNameParamSchema), checkFlag);

// GET /feature-flags/:name -- get a single flag (any authenticated user)
router.get('/:name', authenticate, validateParams(flagNameParamSchema), getFlag);

// POST /feature-flags -- create a new flag (admin only)
router.post('/', authenticate, requireRole('admin'), validateBody(createFeatureFlagSchema), createFlag);

// PUT /feature-flags/:name -- update a flag (admin only)
router.put('/:name', authenticate, requireRole('admin'), validateParams(flagNameParamSchema), validateBody(updateFeatureFlagSchema), updateFlag);

// DELETE /feature-flags/:name -- delete a flag (admin only)
router.delete('/:name', authenticate, requireRole('admin'), validateParams(flagNameParamSchema), deleteFlag);

export default router;

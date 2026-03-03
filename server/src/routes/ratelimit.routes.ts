/**
 * Rate Limit routes.
 *
 * Mounts platform rate limit management endpoints with authentication and
 * role-based access control.
 *
 * Read endpoints require viewer-level access (read:infrastructure), while
 * write/mutate endpoints require admin privileges (write:infrastructure).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody } from '../middleware/validation';
import { updateRateLimitsSchema } from '../validators/schemas';
import {
  getRateLimitStatus,
  getAllRateLimits,
  updateLimits,
  resetCounter,
} from '../controllers/ratelimit.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /ratelimits/status -- get all platform rate limit statuses (viewer+)
router.get(
  '/status',
  requirePermission('read:infrastructure'),
  getAllRateLimits,
);

// GET /ratelimits/status/:platformType -- get rate limit status for a platform (viewer+)
router.get(
  '/status/:platformType',
  requirePermission('read:infrastructure'),
  getRateLimitStatus,
);

// PUT /ratelimits/:platformType -- update platform rate limits (admin only)
router.put(
  '/:platformType',
  requirePermission('write:infrastructure'),
  validateBody(updateRateLimitsSchema),
  updateLimits,
);

// POST /ratelimits/:platformType/reset -- reset platform counters (admin only)
router.post(
  '/:platformType/reset',
  requirePermission('write:infrastructure'),
  resetCounter,
);

export default router;

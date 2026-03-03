/**
 * Learning Routes -- Tier 3 Contextual Bandits API.
 *
 * Mounts bandit observation, recommendation, statistics, and convergence
 * endpoints under /learning with authentication and role-based access control.
 *
 * Read endpoints require at least viewer-level access (read:agents).
 * Write/mutate endpoints require elevated privileges (write:agents).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  recordBanditObservation,
  recommendArm,
  getArmsStats,
  checkConvergence,
  triggerDecay,
} from '../controllers/learning.controller';

const router = Router();

// ---------------------------------------------------------------------------
// All routes require authentication
// ---------------------------------------------------------------------------

router.use(authenticate);

// ---------------------------------------------------------------------------
// Bandit Observation & Recommendation
// ---------------------------------------------------------------------------

// POST /learning/observe -- record a bandit observation (write)
router.post(
  '/observe',
  requirePermission('write:agents'),
  recordBanditObservation,
);

// GET /learning/recommend/:contextType -- get recommended arm via Thompson Sampling (read)
router.get(
  '/recommend/:contextType',
  requirePermission('read:agents'),
  recommendArm,
);

// GET /learning/arms/:contextType -- get all arms with stats (read)
router.get(
  '/arms/:contextType',
  requirePermission('read:agents'),
  getArmsStats,
);

// GET /learning/convergence/:contextType -- check convergence status (read)
router.get(
  '/convergence/:contextType',
  requirePermission('read:agents'),
  checkConvergence,
);

// POST /learning/decay -- trigger observation time decay (write)
router.post(
  '/decay',
  requirePermission('write:agents'),
  triggerDecay,
);

export default router;

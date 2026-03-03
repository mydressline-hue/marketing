/**
 * Final Outputs - Execution Roadmap Routes.
 *
 * Defines Express routes for the 90-Day Execution Roadmap endpoints.
 * Applies authentication middleware before delegating to controller handlers.
 *
 * Phase 10 Final Output Deliverable #7.
 *
 * Routes:
 *   GET /execution-roadmap             - Full 90-day roadmap
 *   GET /execution-roadmap/milestones  - Milestone tracking
 *   GET /execution-roadmap/:phase      - Specific phase (1, 2, or 3)
 */

import { Router } from 'express';
import {
  getExecutionRoadmap,
  getExecutionRoadmapPhase,
  getMilestoneStatus,
} from '../controllers/final-outputs-roadmap.controller';
import { authenticate } from '../middleware/auth';
import { validateParams } from '../middleware/validation';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

/** Params schema for the :phase route – must be "1", "2", or "3". */
const phaseParamsSchema = z.object({
  phase: z
    .string()
    .regex(/^[1-3]$/, 'Phase must be 1, 2, or 3.'),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/execution-roadmap - full 90-day roadmap
router.get(
  '/execution-roadmap',
  authenticate,
  getExecutionRoadmap,
);

// GET /final-outputs/execution-roadmap/milestones - milestone tracking
// Must be defined BEFORE the :phase param route to avoid matching "milestones" as a phase
router.get(
  '/execution-roadmap/milestones',
  authenticate,
  getMilestoneStatus,
);

// GET /final-outputs/execution-roadmap/:phase - specific phase (1, 2, or 3)
router.get(
  '/execution-roadmap/:phase',
  authenticate,
  validateParams(phaseParamsSchema),
  getExecutionRoadmapPhase,
);

export default router;

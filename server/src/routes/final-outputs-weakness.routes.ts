/**
 * Final Outputs - Weakness & Improvement Report Routes.
 *
 * Defines Express routes for weakness and improvement report endpoints.
 * Phase 10 Final Output Deliverable #9.
 *
 *   GET /weakness-report               - Full weakness & improvement report
 *   GET /weakness-report/priorities     - Prioritised improvement actions
 *   GET /weakness-report/:category      - Weaknesses filtered by category
 */

import { Router } from 'express';
import {
  getWeaknessReport,
  getImprovementPriorities,
  getWeaknessByCategory,
} from '../controllers/final-outputs-weakness.controller';
import { authenticate } from '../middleware/auth';
import { validateParams } from '../middleware/validation';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

/** Params schema for the :category route – non-empty lowercase kebab-case string. */
const categoryParamsSchema = z.object({
  category: z
    .string()
    .min(1, 'category is required.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'category must be a lowercase kebab-case string.'),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All weakness report routes require authentication
router.use(authenticate);

// GET /weakness-report - full report
router.get('/', getWeaknessReport);

// GET /weakness-report/priorities - sorted improvement actions
// Must be registered before /:category to avoid route conflicts
router.get('/priorities', getImprovementPriorities);

// GET /weakness-report/:category - weaknesses by category
router.get('/:category', validateParams(categoryParamsSchema), getWeaknessByCategory);

export default router;

/**
 * Final Outputs Validation Routes.
 *
 * Defines Express routes for the non-negotiable rules validation summary.
 * Applies authentication middleware before delegating to controller handlers.
 *
 * GET /validation-summary - Full validation status for all 12 non-negotiable rules
 */

import { Router } from 'express';
import { getValidationSummary } from '../controllers/final-outputs-validation.controller';
import { authenticate } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

/** Optional query schema - allows filtering by rule ID or status. */
const validationQuerySchema = z.object({
  ruleId: z.string().optional(),
  status: z.enum(['pass', 'fail', 'warning']).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/validation-summary - full validation status
router.get(
  '/validation-summary',
  authenticate,
  validateQuery(validationQuerySchema),
  getValidationSummary,
);

export default router;

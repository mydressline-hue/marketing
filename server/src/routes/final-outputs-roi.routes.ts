/**
 * Final Outputs ROI Projection Routes.
 *
 * Defines Express routes for ROI Projection deliverable endpoints.
 * Applies authentication middleware before delegating to controller handlers.
 *
 * Deliverable 6: ROI Projection
 *   GET /roi-projection          - Full ROI projection
 *   GET /roi-projection/trend    - Historical ROI trend
 *   GET /roi-projection/:countryCode - Country-specific ROI
 */

import { Router } from 'express';
import {
  getROIProjection,
  getROITrend,
  getROIByCountry,
} from '../controllers/final-outputs-roi.controller';
import { authenticate } from '../middleware/auth';
import { validateParams } from '../middleware/validation';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

/** Params schema for the :countryCode route – 2-letter uppercase ISO code. */
const countryCodeParamsSchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'countryCode must be a 2-letter uppercase ISO country code.'),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/roi-projection - full ROI projection
router.get(
  '/roi-projection',
  authenticate,
  getROIProjection,
);

// GET /final-outputs/roi-projection/trend - historical ROI trend
// NOTE: This must be registered before the :countryCode param route
router.get(
  '/roi-projection/trend',
  authenticate,
  getROITrend,
);

// GET /final-outputs/roi-projection/:countryCode - country-specific ROI
router.get(
  '/roi-projection/:countryCode',
  authenticate,
  validateParams(countryCodeParamsSchema),
  getROIByCountry,
);

export default router;

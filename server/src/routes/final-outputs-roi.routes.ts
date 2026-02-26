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
  getROIByCountry,
);

export default router;

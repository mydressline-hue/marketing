/**
 * Final Outputs Routes.
 *
 * Defines Express routes for final output deliverable endpoints.
 * Applies authentication middleware before delegating to controller handlers.
 *
 * Deliverable 1: Country Ranking & Opportunity Table
 *   GET /country-ranking            - Full ranking table
 *   GET /country-ranking/methodology - Scoring methodology
 */

import { Router } from 'express';
import {
  getCountryRanking,
  getMethodology,
} from '../controllers/final-outputs.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/country-ranking - full ranking table
router.get(
  '/country-ranking',
  authenticate,
  getCountryRanking,
);

// GET /final-outputs/country-ranking/methodology - scoring methodology
router.get(
  '/country-ranking/methodology',
  authenticate,
  getMethodology,
);

export default router;

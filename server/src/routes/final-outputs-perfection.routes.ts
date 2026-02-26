/**
 * Perfection Recommendations Routes.
 *
 * Defines Express routes for Final Output Deliverable #10:
 * Recommendations to Reach Enterprise Perfection.
 *
 * Applies authentication middleware before delegating to controller handlers.
 *
 * Deliverable 10: Recommendations to Reach Enterprise Perfection
 *   GET /perfection-recommendations          - Full recommendations report
 *   GET /perfection-recommendations/maturity  - Maturity assessment breakdown
 *   GET /perfection-recommendations/:category - Recommendations by category
 */

import { Router } from 'express';
import {
  getPerfectionRecommendations,
  getMaturityAssessment,
  getRecommendationsByCategory,
} from '../controllers/final-outputs-perfection.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/perfection-recommendations - full recommendations
router.get(
  '/perfection-recommendations',
  authenticate,
  getPerfectionRecommendations,
);

// GET /final-outputs/perfection-recommendations/maturity - maturity assessment
// NOTE: This must be registered BEFORE the :category parameterised route
router.get(
  '/perfection-recommendations/maturity',
  authenticate,
  getMaturityAssessment,
);

// GET /final-outputs/perfection-recommendations/:category - by category
router.get(
  '/perfection-recommendations/:category',
  authenticate,
  getRecommendationsByCategory,
);

export default router;

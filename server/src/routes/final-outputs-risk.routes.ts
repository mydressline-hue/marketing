/**
 * Final Outputs - Risk Assessment Routes.
 *
 * Defines Express routes for the Risk Assessment Report deliverable.
 * All endpoints require authentication.
 *
 * Deliverable 5: Risk Assessment Report
 *   GET /risk-assessment                - Full risk assessment report
 *   GET /risk-assessment/mitigation-plan - Prioritised mitigation plan
 *   GET /risk-assessment/:category      - Risks filtered by category
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getRiskAssessmentReport,
  getMitigationPlan,
  getRisksByCategory,
} from '../controllers/final-outputs-risk.controller';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/risk-assessment - full report
router.get(
  '/risk-assessment',
  authenticate,
  getRiskAssessmentReport,
);

// GET /final-outputs/risk-assessment/mitigation-plan - mitigation plan
// NOTE: Must be registered before the :category param route to avoid
// "mitigation-plan" being captured as a category.
router.get(
  '/risk-assessment/mitigation-plan',
  authenticate,
  getMitigationPlan,
);

// GET /final-outputs/risk-assessment/:category - by category
router.get(
  '/risk-assessment/:category',
  authenticate,
  getRisksByCategory,
);

export default router;

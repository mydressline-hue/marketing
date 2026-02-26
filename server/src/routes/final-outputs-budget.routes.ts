/**
 * Final Outputs - Budget Allocation Model Routes.
 *
 * Defines Express routes for Budget Allocation Model endpoints.
 * Phase 10 Final Output Deliverable #4.
 *
 *   GET /budget-model              - Full budget allocation model
 *   GET /budget-model/velocity     - Spending velocity metrics
 *   GET /budget-model/utilization  - Budget utilization breakdown
 */

import { Router } from 'express';
import {
  getBudgetAllocationModel,
  getSpendingVelocity,
  getBudgetUtilization,
} from '../controllers/final-outputs-budget.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All budget model routes require authentication
router.use(authenticate);

// GET /budget-model - full allocation model
router.get('/', getBudgetAllocationModel);

// GET /budget-model/velocity - spending velocity
router.get('/velocity', getSpendingVelocity);

// GET /budget-model/utilization - budget utilization
router.get('/utilization', getBudgetUtilization);

export default router;

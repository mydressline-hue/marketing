/**
 * Final Outputs - Budget Allocation Controller.
 *
 * Express request handlers for the Budget Allocation Model endpoints.
 * Phase 10 Final Output Deliverable #4.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { BudgetAllocationOutputService } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/budget-model
 * Returns the full budget allocation model including allocations,
 * country budgets, guardrails, and reallocation recommendations.
 */
export const getBudgetAllocationModel = asyncHandler(
  async (_req: Request, res: Response) => {
    const model =
      await BudgetAllocationOutputService.generateBudgetAllocationModel();

    res.json({
      success: true,
      data: model,
    });
  },
);

/**
 * GET /final-outputs/budget-model/velocity
 * Returns spending velocity metrics -- how fast budget is being consumed.
 */
export const getSpendingVelocity = asyncHandler(
  async (_req: Request, res: Response) => {
    const velocity =
      await BudgetAllocationOutputService.getSpendingVelocity();

    res.json({
      success: true,
      data: velocity,
    });
  },
);

/**
 * GET /final-outputs/budget-model/utilization
 * Returns budget utilization metrics -- how much has been consumed,
 * broken down by channel and country.
 */
export const getBudgetUtilization = asyncHandler(
  async (_req: Request, res: Response) => {
    const utilization =
      await BudgetAllocationOutputService.getBudgetUtilization();

    res.json({
      success: true,
      data: utilization,
    });
  },
);

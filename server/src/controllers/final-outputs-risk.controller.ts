/**
 * Final Outputs - Risk Assessment Controller.
 *
 * Express request handlers for the Risk Assessment Report
 * final output endpoints. Delegates to RiskAssessmentOutputService.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { RiskAssessmentOutputService } from '../services/final-outputs/RiskAssessmentOutputService';
import { ValidationError } from '../utils/errors';
import type { RiskCategory } from '../services/final-outputs/RiskAssessmentOutputService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: RiskCategory[] = [
  'compliance',
  'fraud',
  'security',
  'financial',
  'operational',
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/risk-assessment
 * Returns the full risk assessment report.
 */
export const getRiskAssessmentReport = asyncHandler(
  async (_req: Request, res: Response) => {
    const report =
      await RiskAssessmentOutputService.generateRiskAssessmentReport();

    res.json({
      success: true,
      data: report,
    });
  },
);

/**
 * GET /final-outputs/risk-assessment/mitigation-plan
 * Returns the prioritised risk mitigation plan.
 */
export const getMitigationPlan = asyncHandler(
  async (_req: Request, res: Response) => {
    const plan = await RiskAssessmentOutputService.getRiskMitigationPlan();

    res.json({
      success: true,
      data: plan,
      meta: {
        total: plan.length,
      },
    });
  },
);

/**
 * GET /final-outputs/risk-assessment/:category
 * Returns risks filtered by category.
 */
export const getRisksByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { category } = req.params;

    if (!VALID_CATEGORIES.includes(category as RiskCategory)) {
      throw new ValidationError(
        `Invalid risk category: "${category}". Valid categories: ${VALID_CATEGORIES.join(', ')}`,
      );
    }

    const risks = await RiskAssessmentOutputService.getRisksByCategory(
      category as RiskCategory,
    );

    res.json({
      success: true,
      data: risks,
      meta: {
        category,
        total: risks.length,
      },
    });
  },
);

/**
 * Final Outputs Validation Controller.
 *
 * Express request handlers for the non-negotiable rules validation
 * summary endpoint.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationSummaryService } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/validation-summary
 * Returns the full non-negotiable rules validation summary.
 */
export const getValidationSummary = asyncHandler(
  async (_req: Request, res: Response) => {
    const summary = await ValidationSummaryService.generateValidationSummary();

    res.json({
      success: true,
      data: summary,
    });
  },
);

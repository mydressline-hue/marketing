/**
 * Perfection Recommendations Controller.
 *
 * Express request handlers for Final Output Deliverable #10:
 * Recommendations to Reach Enterprise Perfection.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { PerfectionRecommendationsOutputService } from '../services/final-outputs';
import type { RecommendationCategory } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Valid categories for parameter validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: ReadonlySet<string> = new Set<string>([
  'strategy',
  'technology',
  'operations',
  'data',
  'compliance',
  'scaling',
]);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/perfection-recommendations
 * Returns the full perfection recommendations report.
 */
export const getPerfectionRecommendations = asyncHandler(
  async (_req: Request, res: Response) => {
    const recommendations =
      await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

    res.json({
      success: true,
      data: recommendations,
    });
  },
);

/**
 * GET /final-outputs/perfection-recommendations/maturity
 * Returns the detailed maturity assessment breakdown.
 */
export const getMaturityAssessment = asyncHandler(
  async (_req: Request, res: Response) => {
    const maturity =
      await PerfectionRecommendationsOutputService.getMaturityAssessment();

    res.json({
      success: true,
      data: maturity,
    });
  },
);

/**
 * GET /final-outputs/perfection-recommendations/:category
 * Returns recommendations filtered by the given category.
 */
export const getRecommendationsByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { category } = req.params;

    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CATEGORY',
          message: `Invalid category "${category}". Valid categories: ${Array.from(VALID_CATEGORIES).join(', ')}`,
          statusCode: 400,
        },
      });
      return;
    }

    const recommendations =
      await PerfectionRecommendationsOutputService.getRecommendationsByCategory(
        category as RecommendationCategory,
      );

    res.json({
      success: true,
      data: recommendations,
    });
  },
);

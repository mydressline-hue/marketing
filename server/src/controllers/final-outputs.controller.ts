/**
 * Final Outputs Controller.
 *
 * Express request handlers for Final Output deliverables.
 * Deliverable 1: Country Ranking & Opportunity Table.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CountryRankingService } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/country-ranking
 * Returns the full country ranking and opportunity table.
 */
export const getCountryRanking = asyncHandler(
  async (_req: Request, res: Response) => {
    const ranking = await CountryRankingService.generateCountryRanking();

    res.json({
      success: true,
      data: ranking,
    });
  },
);

/**
 * GET /final-outputs/country-ranking/methodology
 * Returns the scoring methodology explanation.
 */
export const getMethodology = asyncHandler(
  async (_req: Request, res: Response) => {
    const methodology = CountryRankingService.getMethodology();

    res.json({
      success: true,
      data: methodology,
    });
  },
);

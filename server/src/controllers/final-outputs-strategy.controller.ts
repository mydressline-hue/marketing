/**
 * Final Outputs - Country Strategy Controller.
 *
 * Express request handlers for the marketing strategy per country
 * final output endpoints. Delegates to CountryStrategyOutputService.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CountryStrategyOutputService } from '../services/final-outputs/CountryStrategyOutputService';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/strategies
 * Returns marketing strategies for all active countries.
 */
export const getAllStrategies = asyncHandler(
  async (_req: Request, res: Response) => {
    const strategies =
      await CountryStrategyOutputService.generateStrategyPerCountry();

    res.json({
      success: true,
      data: strategies,
      meta: {
        total: strategies.length,
      },
    });
  },
);

/**
 * GET /final-outputs/strategies/summary
 * Returns an aggregated summary across all country strategies.
 */
export const getStrategySummary = asyncHandler(
  async (_req: Request, res: Response) => {
    const summary = await CountryStrategyOutputService.getStrategySummary();

    res.json({
      success: true,
      data: summary,
    });
  },
);

/**
 * GET /final-outputs/strategies/:countryCode
 * Returns the marketing strategy for a specific country by ISO code.
 */
export const getStrategyByCountryCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { countryCode } = req.params;

    const strategies =
      await CountryStrategyOutputService.generateStrategyPerCountry(
        countryCode,
      );

    res.json({
      success: true,
      data: strategies.length === 1 ? strategies[0] : strategies,
    });
  },
);

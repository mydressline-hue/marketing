/**
 * Final Outputs - Weakness & Improvement Report Controller.
 *
 * Express request handlers for the Weakness & Improvement Report endpoints.
 * Phase 10 Final Output Deliverable #9.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { WeaknessReportOutputService } from '../services/final-outputs';

const service = new WeaknessReportOutputService();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/weakness-report
 * Returns the full weakness and improvement report.
 */
export const getWeaknessReport = asyncHandler(
  async (_req: Request, res: Response) => {
    const report = await service.generateWeaknessReport();

    res.json({
      success: true,
      data: report,
    });
  },
);

/**
 * GET /final-outputs/weakness-report/priorities
 * Returns prioritised improvement actions sorted by priority.
 */
export const getImprovementPriorities = asyncHandler(
  async (_req: Request, res: Response) => {
    const priorities = await service.getImprovementPriorities();

    res.json({
      success: true,
      data: priorities,
      meta: {
        total: priorities.length,
      },
    });
  },
);

/**
 * GET /final-outputs/weakness-report/:category
 * Returns weaknesses filtered by category.
 */
export const getWeaknessByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { category } = req.params;

    const weaknesses = await service.getWeaknessByCategory(category);

    res.json({
      success: true,
      data: weaknesses,
      meta: {
        total: weaknesses.length,
      },
    });
  },
);

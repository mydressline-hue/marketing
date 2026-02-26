/**
 * Final Outputs - System-Wide Confidence Score Controller.
 *
 * Express request handlers for the confidence score final output
 * endpoints. Delegates to ConfidenceScoreOutputService.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ConfidenceScoreOutputService } from '../services/final-outputs/ConfidenceScoreOutputService';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/confidence-score
 * Returns the system-wide confidence score (0-100) with full breakdown.
 */
export const getSystemConfidenceScore = asyncHandler(
  async (_req: Request, res: Response) => {
    const result =
      await ConfidenceScoreOutputService.generateSystemConfidenceScore();

    res.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /final-outputs/confidence-score/trend
 * Returns historical confidence trend over a configurable number of days.
 */
export const getConfidenceTrend = asyncHandler(
  async (req: Request, res: Response) => {
    const days = req.query.days
      ? parseInt(req.query.days as string, 10)
      : 30;

    const result = await ConfidenceScoreOutputService.getConfidenceTrend(days);

    res.json({
      success: true,
      data: result,
    });
  },
);

/**
 * GET /final-outputs/confidence-score/:agentId
 * Returns a detailed confidence breakdown for a specific agent.
 */
export const getAgentConfidenceScore = asyncHandler(
  async (req: Request, res: Response) => {
    const { agentId } = req.params;

    const result =
      await ConfidenceScoreOutputService.getAgentConfidence(agentId);

    res.json({
      success: true,
      data: result,
    });
  },
);

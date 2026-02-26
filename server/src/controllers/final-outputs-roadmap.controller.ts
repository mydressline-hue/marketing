/**
 * Final Outputs - Execution Roadmap Controller.
 *
 * Express request handlers for the 90-Day Execution Roadmap deliverable.
 * Phase 10 Final Output Deliverable #7.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ExecutionRoadmapOutputService } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/execution-roadmap
 * Returns the full 90-day execution roadmap.
 */
export const getExecutionRoadmap = asyncHandler(
  async (_req: Request, res: Response) => {
    const roadmap = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

    res.json({
      success: true,
      data: roadmap,
    });
  },
);

/**
 * GET /final-outputs/execution-roadmap/:phase
 * Returns a specific phase of the execution roadmap.
 * Phase must be 1, 2, or 3.
 */
export const getExecutionRoadmapPhase = asyncHandler(
  async (req: Request, res: Response) => {
    const phaseParam = parseInt(req.params.phase, 10);

    if (isNaN(phaseParam) || phaseParam < 1 || phaseParam > 3) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHASE',
          message: 'Phase must be 1, 2, or 3.',
          statusCode: 400,
        },
      });
      return;
    }

    const phase = await ExecutionRoadmapOutputService.getRoadmapByPhase(phaseParam);

    res.json({
      success: true,
      data: phase,
    });
  },
);

/**
 * GET /final-outputs/execution-roadmap/milestones
 * Returns milestone tracking information.
 */
export const getMilestoneStatus = asyncHandler(
  async (_req: Request, res: Response) => {
    const status = await ExecutionRoadmapOutputService.getMilestoneStatus();

    res.json({
      success: true,
      data: status,
    });
  },
);

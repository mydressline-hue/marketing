/**
 * Final Outputs - Channel Allocation Controller.
 *
 * Express request handlers for Channel Allocation Matrix endpoints.
 * Phase 10 Final Output Deliverable #3.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ChannelAllocationOutputService } from '../services/final-outputs';
import { NotFoundError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/channel-allocation
 * Returns the full channel allocation matrix.
 */
export const getChannelAllocationMatrix = asyncHandler(
  async (_req: Request, res: Response) => {
    const matrix =
      await ChannelAllocationOutputService.generateChannelAllocationMatrix();

    res.json({
      success: true,
      data: matrix,
    });
  },
);

/**
 * GET /final-outputs/channel-allocation/:countryCode
 * Returns the channel allocation breakdown for a specific country.
 */
export const getCountryChannelAllocation = asyncHandler(
  async (req: Request, res: Response) => {
    const { countryCode } = req.params;

    const countryData =
      await ChannelAllocationOutputService.getCountryAllocation(countryCode);

    if (!countryData) {
      throw new NotFoundError(
        `Channel allocation data not found for country: ${countryCode}`,
      );
    }

    res.json({
      success: true,
      data: countryData,
    });
  },
);

/**
 * GET /final-outputs/channel-allocation/history
 * Returns historical channel performance data.
 */
export const getChannelPerformanceHistory = asyncHandler(
  async (_req: Request, res: Response) => {
    const history =
      await ChannelAllocationOutputService.getChannelPerformanceHistory();

    res.json({
      success: true,
      data: history,
      meta: {
        count: history.length,
      },
    });
  },
);

/**
 * Final Outputs ROI Projection Controller.
 *
 * Express request handlers for Final Output Deliverable #6: ROI Projection.
 * Each handler delegates to ROIProjectionOutputService and returns a
 * structured JSON envelope: { success, data }.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ROIProjectionOutputService } from '../services/final-outputs';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /final-outputs/roi-projection
 * Returns the full ROI projection including scenario projections, ROI summary,
 * LTV/CAC analysis, channel ROI, and monthly forecast.
 */
export const getROIProjection = asyncHandler(
  async (_req: Request, res: Response) => {
    const projection = await ROIProjectionOutputService.generateROIProjection();

    res.json({
      success: true,
      data: projection,
    });
  },
);

/**
 * GET /final-outputs/roi-projection/trend
 * Returns the historical ROI trend over time.
 */
export const getROITrend = asyncHandler(
  async (_req: Request, res: Response) => {
    const trend = await ROIProjectionOutputService.getROITrend();

    res.json({
      success: true,
      data: trend,
    });
  },
);

/**
 * GET /final-outputs/roi-projection/:countryCode
 * Returns the ROI projection for a specific country.
 */
export const getROIByCountry = asyncHandler(
  async (req: Request, res: Response) => {
    const { countryCode } = req.params;
    const countryROI = await ROIProjectionOutputService.getROIByCountry(countryCode);

    res.json({
      success: true,
      data: countryROI,
    });
  },
);

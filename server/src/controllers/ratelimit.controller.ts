/**
 * Rate Limit controllers -- Express request handlers.
 *
 * Handlers delegate to PlatformRateLimitService, returning structured JSON
 * envelopes: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import {
  PlatformRateLimitService,
} from '../services/ratelimit/PlatformRateLimitService';

// ===========================================================================
// Rate Limit Handlers
// ===========================================================================

/**
 * GET /ratelimits/status/:platformType
 * Get rate limit status for a specific platform.
 */
export const getRateLimitStatus = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user?.id;

  const result = await PlatformRateLimitService.getRateLimitStatus(platformType, userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /ratelimits/status
 * Get rate limit status for all platforms.
 */
export const getAllRateLimits = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;

  const result = await PlatformRateLimitService.getAllLimitsStatus(userId);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * PUT /ratelimits/:platformType
 * Update rate limit overrides for a platform (admin only).
 */
export const updateLimits = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const limits = req.body;

  const result = await PlatformRateLimitService.updatePlatformLimits(platformType, limits);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /ratelimits/:platformType/reset
 * Reset rate limit counters for a platform (admin only).
 */
export const resetCounter = asyncHandler(async (req: Request, res: Response) => {
  const { platformType } = req.params;
  const userId = req.user?.id;

  await PlatformRateLimitService.resetPlatformCounter(platformType, userId);

  res.json({
    success: true,
    data: { message: `Rate limit counters for ${platformType} have been reset` },
  });
});

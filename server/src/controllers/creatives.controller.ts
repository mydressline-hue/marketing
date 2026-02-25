/**
 * Creatives Controller.
 *
 * Express request handlers for creative asset management. Each handler
 * delegates to the CreativesService and returns structured JSON responses.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CreativesService } from '../services/creatives.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /creatives
 * List creatives with optional filters and pagination.
 */
export const listCreatives = asyncHandler(async (req: Request, res: Response) => {
  const { type, campaignId, isActive, page, limit, sortBy, sortOrder } = req.query;

  const filters = {
    type: type as string | undefined,
    campaignId: campaignId as string | undefined,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await CreativesService.list(filters, pagination);

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /creatives/fatigued
 * Get creatives above a fatigue score threshold.
 */
export const getFatiguedCreatives = asyncHandler(async (req: Request, res: Response) => {
  const threshold = parseFloat(req.query.threshold as string) || 0.7;

  const creatives = await CreativesService.getByFatigueScore(threshold);

  res.json({
    success: true,
    data: creatives,
    meta: {
      total: creatives.length,
    },
  });
});

/**
 * GET /creatives/:id
 * Retrieve a single creative by ID.
 */
export const getCreativeById = asyncHandler(async (req: Request, res: Response) => {
  const creative = await CreativesService.getById(req.params.id);

  res.json({
    success: true,
    data: creative,
  });
});

/**
 * POST /creatives
 * Create a new creative.
 */
export const createCreative = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const creative = await CreativesService.create(req.body, userId);

  res.status(201).json({
    success: true,
    data: creative,
  });
});

/**
 * PUT /creatives/:id
 * Update an existing creative.
 */
export const updateCreative = asyncHandler(async (req: Request, res: Response) => {
  const creative = await CreativesService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: creative,
  });
});

/**
 * DELETE /creatives/:id
 * Soft-delete a creative (set is_active=false).
 */
export const deleteCreative = asyncHandler(async (req: Request, res: Response) => {
  await CreativesService.delete(req.params.id);

  res.json({
    success: true,
    data: { message: 'Creative deleted successfully' },
  });
});

/**
 * PATCH /creatives/:id/performance
 * Update performance metrics for a creative.
 */
export const updateCreativePerformance = asyncHandler(async (req: Request, res: Response) => {
  const creative = await CreativesService.updatePerformance(req.params.id, req.body);

  res.json({
    success: true,
    data: creative,
  });
});

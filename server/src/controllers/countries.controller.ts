/**
 * Countries Controller.
 *
 * Express request handlers for country management. Each handler delegates to
 * the CountriesService and returns structured JSON responses.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CountriesService } from '../services/countries.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /countries
 * List countries with optional filters and pagination.
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { region, isActive, minScore, page, limit, sortBy, sortOrder } = req.query;

  const filters = {
    region: region as string | undefined,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    minScore: minScore !== undefined ? parseFloat(minScore as string) : undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as string | undefined,
  };

  const result = await CountriesService.list(filters, pagination);

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
 * GET /countries/top
 * Get top N countries by opportunity score.
 */
export const getTopCountries = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

  const countries = await CountriesService.getTopCountries(limit);

  res.json({
    success: true,
    data: countries,
  });
});

/**
 * GET /countries/:id
 * Retrieve a single country by ID.
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const country = await CountriesService.getById(req.params.id);

  res.json({
    success: true,
    data: country,
  });
});

/**
 * POST /countries
 * Create a new country.
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const country = await CountriesService.create(req.body);

  res.status(201).json({
    success: true,
    data: country,
  });
});

/**
 * PUT /countries/:id
 * Update an existing country.
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const country = await CountriesService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: country,
  });
});

/**
 * DELETE /countries/:id
 * Soft-delete a country (set is_active=false).
 */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  await CountriesService.delete(req.params.id);

  res.json({
    success: true,
    data: { message: 'Country deleted successfully' },
  });
});

/**
 * POST /countries/:id/score
 * Calculate the opportunity score for a country.
 */
export const calculateScore = asyncHandler(async (req: Request, res: Response) => {
  const result = await CountriesService.calculateOpportunityScore(req.params.id);

  res.json({
    success: true,
    data: result,
  });
});

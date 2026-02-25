/**
 * Campaigns controller -- Express request handlers.
 *
 * Each handler delegates to `CampaignsService` and returns a structured JSON
 * envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { CampaignsService } from '../services/campaigns.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /campaigns
 * List campaigns with optional filtering and pagination.
 */
export const listCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const { countryId, platform, status, createdBy, page, limit, sortBy, sortOrder } =
    req.query;

  const filters = {
    countryId: countryId as string | undefined,
    platform: platform as string | undefined,
    status: status as string | undefined,
    createdBy: createdBy as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as string | undefined,
  };

  const result = await CampaignsService.list(filters, pagination);

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
 * GET /campaigns/:id
 * Retrieve a single campaign by ID.
 */
export const getCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await CampaignsService.getById(req.params.id);

  res.json({
    success: true,
    data: campaign,
  });
});

/**
 * GET /campaigns/:id/metrics
 * Retrieve computed performance metrics for a campaign.
 */
export const getCampaignMetrics = asyncHandler(async (req: Request, res: Response) => {
  const metrics = await CampaignsService.getMetrics(req.params.id);

  res.json({
    success: true,
    data: metrics,
  });
});

/**
 * GET /campaigns/country/:countryId
 * Retrieve all campaigns for a given country.
 */
export const getCampaignsByCountry = asyncHandler(async (req: Request, res: Response) => {
  const campaigns = await CampaignsService.getByCampaignCountry(req.params.countryId);

  res.json({
    success: true,
    data: campaigns,
  });
});

/**
 * GET /campaigns/spend/summary
 * Retrieve total spend summary broken down by platform and country.
 */
export const getSpendSummary = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;

  const filters = {
    startDate: startDate as string | undefined,
    endDate: endDate as string | undefined,
  };

  const summary = await CampaignsService.getSpendSummary(filters);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * POST /campaigns
 * Create a new campaign.
 */
export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const campaign = await CampaignsService.create(req.body, userId);

  res.status(201).json({
    success: true,
    data: campaign,
  });
});

/**
 * PUT /campaigns/:id
 * Update an existing campaign.
 */
export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await CampaignsService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: campaign,
  });
});

/**
 * PATCH /campaigns/:id/status
 * Update the status of a campaign with transition validation.
 */
export const updateCampaignStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { status } = req.body;
  const campaign = await CampaignsService.updateStatus(req.params.id, status, userId);

  res.json({
    success: true,
    data: campaign,
  });
});

/**
 * DELETE /campaigns/:id
 * Soft-delete a campaign (set status to 'archived').
 */
export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  await CampaignsService.delete(req.params.id);

  res.json({
    success: true,
    data: { message: 'Campaign deleted successfully' },
  });
});

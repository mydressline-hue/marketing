/**
 * Campaigns router.
 *
 * Mounts all campaign-related endpoints with authentication, permission
 * checks, and request validation middleware.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  createCampaignSchema,
  updateCampaignSchema,
  updateCampaignStatusSchema,
  paginationSchema,
  idParamSchema,
} from '../validators/schemas';
import {
  listCampaigns,
  getCampaign,
  getCampaignMetrics,
  getCampaignsByCountry,
  getSpendSummary,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from '../controllers/campaigns.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Read routes (authentication required)
// ---------------------------------------------------------------------------

// GET /campaigns -- list with pagination and filter query validation
router.get(
  '/',
  authenticate,
  validateQuery(paginationSchema),
  listCampaigns,
);

// GET /campaigns/spend/summary -- spend summary (must be before /:id)
router.get(
  '/spend/summary',
  authenticate,
  getSpendSummary,
);

// GET /campaigns/country/:countryId -- campaigns for a country
router.get(
  '/country/:countryId',
  authenticate,
  getCampaignsByCountry,
);

// GET /campaigns/:id -- single campaign
router.get(
  '/:id',
  authenticate,
  validateParams(idParamSchema),
  getCampaign,
);

// GET /campaigns/:id/metrics -- campaign performance metrics
router.get(
  '/:id/metrics',
  authenticate,
  validateParams(idParamSchema),
  getCampaignMetrics,
);

// ---------------------------------------------------------------------------
// Write routes (authentication + write:campaigns permission)
// ---------------------------------------------------------------------------

// POST /campaigns -- create a new campaign
router.post(
  '/',
  authenticate,
  requirePermission('write:campaigns'),
  validateBody(createCampaignSchema),
  createCampaign,
);

// PUT /campaigns/:id -- update an existing campaign
router.put(
  '/:id',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  validateBody(updateCampaignSchema),
  updateCampaign,
);

// PATCH /campaigns/:id/status -- change campaign status
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  validateBody(updateCampaignStatusSchema),
  updateCampaignStatus,
);

// DELETE /campaigns/:id -- soft-delete (archive) a campaign
router.delete(
  '/:id',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  deleteCampaign,
);

export default router;

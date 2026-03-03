/**
 * Countries Routes.
 *
 * Defines Express routes for country management endpoints. Applies
 * authentication, permission checks, and request validation middleware
 * before delegating to controller handlers.
 */

import { Router } from 'express';
import {
  list,
  getById,
  create,
  update,
  remove,
  calculateScore,
  getTopCountries,
} from '../controllers/countries.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import { staticCacheHeaders } from '../middleware/cacheHeaders';
import {
  createCountrySchema,
  updateCountrySchema,
  paginationSchema,
  idParamSchema,
} from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /countries - list with optional query validation for pagination/filters
router.get(
  '/',
  authenticate,
  staticCacheHeaders,
  validateQuery(paginationSchema),
  list,
);

// GET /countries/top - get top countries by opportunity score
router.get(
  '/top',
  authenticate,
  staticCacheHeaders,
  getTopCountries,
);

// GET /countries/:id - get single country by ID
router.get(
  '/:id',
  authenticate,
  staticCacheHeaders,
  validateParams(idParamSchema),
  getById,
);

// POST /countries - create a new country
router.post(
  '/',
  authenticate,
  requirePermission('write:campaigns'),
  validateBody(createCountrySchema),
  create,
);

// PUT /countries/:id - update an existing country
router.put(
  '/:id',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  validateBody(updateCountrySchema),
  update,
);

// DELETE /countries/:id - soft-delete a country
router.delete(
  '/:id',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  remove,
);

// POST /countries/:id/score - calculate opportunity score (requires write:campaigns)
router.post(
  '/:id/score',
  authenticate,
  requirePermission('write:campaigns'),
  validateParams(idParamSchema),
  calculateScore,
);

export default router;

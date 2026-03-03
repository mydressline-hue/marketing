/**
 * Creatives Routes.
 *
 * Defines the Express router for creative asset management endpoints.
 * All routes require authentication. Write operations (POST, PUT, DELETE,
 * PATCH) additionally require the `write:creatives` permission.
 */

import { Router } from 'express';
import {
  listCreatives,
  getFatiguedCreatives,
  getCreativeById,
  createCreative,
  updateCreative,
  deleteCreative,
  updateCreativePerformance,
} from '../controllers/creatives.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  createCreativeSchema,
  updateCreativeSchema,
  updateCreativePerformanceSchema,
  listCreativesQuerySchema,
  idParamSchema,
} from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Read routes ───────────────────────────────────────────────────────────
router.get('/', validateQuery(listCreativesQuerySchema), listCreatives);
router.get('/fatigued', validateQuery(listCreativesQuerySchema), getFatiguedCreatives);
router.get('/:id', validateParams(idParamSchema), getCreativeById);

// ── Write routes ──────────────────────────────────────────────────────────
router.post('/', requirePermission('write:creatives'), validateBody(createCreativeSchema), createCreative);
router.put('/:id', requirePermission('write:creatives'), validateParams(idParamSchema), validateBody(updateCreativeSchema), updateCreative);
router.delete('/:id', requirePermission('write:creatives'), validateParams(idParamSchema), deleteCreative);
router.patch('/:id/performance', requirePermission('write:creatives'), validateParams(idParamSchema), validateBody(updateCreativePerformanceSchema), updateCreativePerformance);

export default router;

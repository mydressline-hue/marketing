/**
 * Content Routes.
 *
 * Defines the Express router for marketing content management endpoints.
 * All routes require authentication. Write operations (POST, PUT, DELETE)
 * additionally require the `write:content` permission.
 */

import { Router } from 'express';
import {
  listContent,
  searchContent,
  getContentById,
  createContent,
  updateContent,
  deleteContent,
  publishContent,
  unpublishContent,
} from '../controllers/content.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import { createContentSchema, idParamSchema } from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Read routes ───────────────────────────────────────────────────────────
router.get('/', listContent);
router.get('/search', searchContent);
router.get('/:id', validateParams(idParamSchema), getContentById);

// ── Write routes ──────────────────────────────────────────────────────────
router.post('/', requirePermission('write:content'), validateBody(createContentSchema), createContent);
router.put('/:id', requirePermission('write:content'), validateParams(idParamSchema), updateContent);
router.delete('/:id', requirePermission('write:content'), validateParams(idParamSchema), deleteContent);
router.post('/:id/publish', requirePermission('write:content'), validateParams(idParamSchema), publishContent);
router.post('/:id/unpublish', requirePermission('write:content'), validateParams(idParamSchema), unpublishContent);

export default router;

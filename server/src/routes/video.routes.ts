/**
 * Video Pipeline Routes.
 *
 * Defines the Express router for the Kling AI video generation pipeline.
 * All routes require authentication. Write operations additionally require
 * the `write:video` permission.
 */

import { Router } from 'express';
import {
  generateVideo,
  runPipeline,
  listTasks,
  getTask,
  checkTaskStatus,
  cancelTask,
  listPipelineRuns,
  getPipelineRun,
  generateEnhancements,
  getEnhancements,
  updateEnhancement,
  publishVideo,
  getPublishRecords,
  listPublishRecords,
  updateEngagement,
} from '../controllers/video.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateParams } from '../middleware/validation';
import {
  generateVideoSchema,
  runPipelineSchema,
  generateEnhancementsSchema,
  publishVideoSchema,
  idParamSchema,
} from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Video generation ─────────────────────────────────────────────────────
router.post('/generate', requirePermission('write:video'), validateBody(generateVideoSchema), generateVideo);

// ── Full pipeline ────────────────────────────────────────────────────────
router.post('/pipeline', requirePermission('write:video'), validateBody(runPipelineSchema), runPipeline);

// ── Video tasks ──────────────────────────────────────────────────────────
router.get('/tasks', listTasks);
router.get('/tasks/:id', validateParams(idParamSchema), getTask);
router.get('/tasks/:id/status', validateParams(idParamSchema), checkTaskStatus);
router.post('/tasks/:id/cancel', requirePermission('write:video'), validateParams(idParamSchema), cancelTask);

// ── Text enhancements ────────────────────────────────────────────────────
router.post('/tasks/:id/enhance', requirePermission('write:video'), validateParams(idParamSchema), validateBody(generateEnhancementsSchema), generateEnhancements);
router.get('/tasks/:id/enhancements', validateParams(idParamSchema), getEnhancements);
router.put('/enhancements/:id', requirePermission('write:video'), validateParams(idParamSchema), updateEnhancement);

// ── Social publish ───────────────────────────────────────────────────────
router.post('/tasks/:id/publish', requirePermission('write:video'), validateParams(idParamSchema), validateBody(publishVideoSchema), publishVideo);
router.get('/tasks/:id/publishes', validateParams(idParamSchema), getPublishRecords);
router.get('/publishes', listPublishRecords);
router.patch('/publishes/:id/engagement', requirePermission('write:video'), validateParams(idParamSchema), updateEngagement);

// ── Pipeline runs ────────────────────────────────────────────────────────
router.get('/pipelines', listPipelineRuns);
router.get('/pipelines/:id', validateParams(idParamSchema), getPipelineRun);

export default router;

/**
 * Queue Routes – Express router for job queue and worker endpoints.
 *
 * All routes require authentication. Write operations additionally
 * require the `write:infrastructure` permission.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody } from '../middleware/validation';
import { enqueueJobSchema } from '../validators/schemas';
import {
  enqueueJob,
  getJob,
  listJobs,
  retryJob,
  getQueueStats,
  getWorkerStatus,
  cleanupJobs,
} from '../controllers/queue.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /queue/jobs – enqueue a new job (requires write:infrastructure)
router.post('/jobs', authenticate, requirePermission('write:infrastructure'), validateBody(enqueueJobSchema), enqueueJob);

// GET /queue/jobs – list jobs with optional filters and pagination
router.get('/jobs', authenticate, requirePermission('read:infrastructure'), listJobs);

// GET /queue/stats – aggregate queue statistics
router.get('/stats', authenticate, requirePermission('read:infrastructure'), getQueueStats);

// GET /queue/workers – worker status
router.get('/workers', authenticate, requirePermission('read:infrastructure'), getWorkerStatus);

// GET /queue/jobs/:jobId – get a single job by ID
router.get('/jobs/:jobId', authenticate, requirePermission('read:infrastructure'), getJob);

// POST /queue/jobs/:jobId/retry – retry a failed job (requires write:infrastructure)
router.post('/jobs/:jobId/retry', authenticate, requirePermission('write:infrastructure'), retryJob);

// POST /queue/cleanup – cleanup old jobs (requires write:infrastructure)
router.post('/cleanup', authenticate, requirePermission('write:infrastructure'), cleanupJobs);

export default router;

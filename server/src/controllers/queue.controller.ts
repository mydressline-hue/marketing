/**
 * Queue Controller – Express request handlers for the Job Queue system.
 *
 * Each handler delegates to `QueueService` or `WorkerService` and returns
 * a structured JSON envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { QueueService, JobStatus } from '../services/queue/QueueService';
import { WorkerService } from '../services/queue/WorkerService';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /queue/jobs
 * Enqueue a new background job.
 */
export const enqueueJob = asyncHandler(async (req: Request, res: Response) => {
  const { queue_name, job_type, payload, priority, delay_ms, max_retries } = req.body;

  const jobId = await QueueService.enqueue(
    queue_name,
    job_type,
    payload ?? {},
    { priority, delay_ms, max_retries },
  );

  const job = await QueueService.getJobStatus(jobId);

  res.status(201).json({
    success: true,
    data: job,
  });
});

/**
 * GET /queue/jobs/:jobId
 * Retrieve a single job by ID.
 */
export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await QueueService.getJobStatus(req.params.jobId);

  res.json({
    success: true,
    data: job,
  });
});

/**
 * GET /queue/jobs
 * List jobs with optional filters and pagination.
 */
export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const { status, queue_name, job_type, page, limit } = req.query;

  const filters = {
    status: status as JobStatus | undefined,
    queue_name: queue_name as string | undefined,
    job_type: job_type as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  };

  const result = await QueueService.listJobs(filters, pagination);

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
 * POST /queue/jobs/:jobId/retry
 * Retry a failed job.
 */
export const retryJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await QueueService.retryJob(req.params.jobId);

  res.json({
    success: true,
    data: job,
  });
});

/**
 * GET /queue/stats
 * Retrieve aggregate queue statistics.
 */
export const getQueueStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await QueueService.getQueueStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /queue/workers
 * Retrieve the status of all registered workers.
 */
export const getWorkerStatus = asyncHandler(async (_req: Request, res: Response) => {
  const workers = WorkerService.getWorkerStatus();

  res.json({
    success: true,
    data: workers,
  });
});

/**
 * POST /queue/cleanup
 * Delete completed and failed jobs older than N days.
 */
export const cleanupJobs = asyncHandler(async (req: Request, res: Response) => {
  const { older_than_days } = req.body;
  const days = older_than_days ? parseInt(older_than_days, 10) : 30;

  const deletedCount = await QueueService.cleanupOldJobs(days);

  res.json({
    success: true,
    data: {
      deletedCount,
      olderThanDays: days,
    },
  });
});

// ---------------------------------------------------------------------------
// Dead Letter Queue Handlers
// ---------------------------------------------------------------------------

/**
 * GET /queue/dead-letter
 * List dead letter jobs with pagination.
 */
export const listDeadLetterJobs = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  };

  const result = await QueueService.listDeadLetterJobs(pagination);

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
 * POST /queue/dead-letter/:id/retry
 * Retry a dead letter job by re-enqueuing it.
 */
export const retryDeadLetterJob = asyncHandler(async (req: Request, res: Response) => {
  const newJobId = await QueueService.retryDeadLetterJob(req.params.id);
  const job = await QueueService.getJobStatus(newJobId);

  res.json({
    success: true,
    data: job,
  });
});

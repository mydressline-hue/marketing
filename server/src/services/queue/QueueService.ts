/**
 * Queue Service – Lightweight Redis-based Job Queue.
 *
 * Provides static methods for enqueuing, dequeuing, processing, retrying,
 * and managing background jobs. Jobs are persisted in the `job_queue`
 * PostgreSQL table and dispatched via Redis lists (LPUSH / RPOP pattern).
 *
 * Redis key patterns:
 *   - `queue:{queueName}` – list holding pending job IDs
 *   - `job:{jobId}`       – hash storing job metadata for fast access
 */

import { pool } from '../../config/database';
import { redis, cacheDel } from '../../config/redis';
import { env } from '../../config/env';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface Job {
  id: string;
  queueName: string;
  jobType: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxRetries: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueOptions {
  priority?: number;
  delay_ms?: number;
  max_retries?: number;
}

export interface JobFilters {
  status?: JobStatus;
  queue_name?: string;
  job_type?: string;
}

export interface JobPagination {
  page?: number;
  limit?: number;
}

export interface PaginatedJobs {
  data: Job[];
  total: number;
  page: number;
  totalPages: number;
}

export interface QueueStats {
  queues: Record<string, {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  }>;
  totals: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  };
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  type: string;
  payload: Record<string, unknown>;
  error: string | null;
  attempts: number;
  failedAt: string;
  createdAt: string;
}

export interface PaginatedDeadLetterJobs {
  data: DeadLetterJob[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    queueName: row.queue_name as string,
    jobType: row.job_type as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as JobStatus,
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxRetries: Number(row.max_retries),
    result: (row.result as Record<string, unknown>) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    scheduledAt: (row.scheduled_at as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToDeadLetterJob(row: Record<string, unknown>): DeadLetterJob {
  return {
    id: row.id as string,
    originalJobId: row.original_job_id as string,
    type: row.type as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    error: (row.error as string) ?? null,
    attempts: Number(row.attempts),
    failedAt: row.failed_at as string,
    createdAt: row.created_at as string,
  };
}

function redisQueueKey(queueName: string): string {
  return `queue:${queueName}`;
}

function redisJobKey(jobId: string): string {
  return `job:${jobId}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class QueueService {
  /**
   * Push a job onto a Redis queue and persist its metadata in the database.
   *
   * @param queueName - Logical queue name (e.g. "platform_sync").
   * @param jobType   - Specific job type (e.g. "ad_sync").
   * @param payload   - Arbitrary JSON payload for the processor.
   * @param options   - Optional priority (1-10), delay_ms, max_retries.
   * @returns The newly created job ID.
   */
  static async enqueue(
    queueName: string,
    jobType: string,
    payload: Record<string, unknown>,
    options?: EnqueueOptions,
  ): Promise<string> {
    if (!queueName || !jobType) {
      throw new ValidationError('Queue name and job type are required');
    }

    const priority = options?.priority ?? 5;
    if (priority < 1 || priority > 10) {
      throw new ValidationError('Priority must be between 1 and 10');
    }

    const maxRetries = options?.max_retries ?? 3;
    const delayMs = options?.delay_ms ?? 0;
    const id = generateId();

    const scheduledAt = delayMs > 0
      ? new Date(Date.now() + delayMs).toISOString()
      : null;

    // Persist the job to PostgreSQL
    await pool.query(
      `INSERT INTO job_queue
         (id, queue_name, job_type, payload, status, priority, attempts, max_retries, scheduled_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, 0, $6, $7, NOW(), NOW())`,
      [id, queueName, jobType, JSON.stringify(payload), priority, maxRetries, scheduledAt],
    );

    // Store lightweight metadata in Redis for fast access
    const jobMeta: Record<string, string> = {
      id,
      queueName,
      jobType,
      status: 'pending',
      priority: String(priority),
      createdAt: new Date().toISOString(),
    };

    await redis.hset(redisJobKey(id), jobMeta);
    await redis.expire(redisJobKey(id), 86400); // 24-hour TTL

    // Push to the queue list (delayed jobs are pushed immediately; the
    // worker's dequeue logic checks scheduled_at before processing)
    if (delayMs <= 0) {
      await redis.lpush(redisQueueKey(queueName), id);
    } else {
      // For delayed jobs, use a sorted set scored by scheduled time
      await redis.zadd(
        `delayed:${queueName}`,
        Date.now() + delayMs,
        id,
      );
    }

    logger.info('Job enqueued', { jobId: id, queueName, jobType, priority });

    return id;
  }

  /**
   * Pop the next job from a Redis queue (RPOP from LPUSH/RPOP FIFO).
   *
   * Before returning a job, any delayed jobs whose scheduled time has elapsed
   * are promoted into the main queue.
   *
   * @returns The next job, or null if the queue is empty.
   */
  static async dequeue(queueName: string): Promise<Job | null> {
    // Promote delayed jobs that are now due
    const now = Date.now();
    const delayedKey = `delayed:${queueName}`;
    const dueJobIds = await redis.zrangebyscore(delayedKey, 0, now);

    for (const jobId of dueJobIds) {
      await redis.lpush(redisQueueKey(queueName), jobId);
      await redis.zrem(delayedKey, jobId);
    }

    // Pop the next job ID from the queue
    const jobId = await redis.rpop(redisQueueKey(queueName));
    if (!jobId) {
      return null;
    }

    // Fetch the full job from PostgreSQL
    const result = await pool.query(
      `SELECT id, queue_name, job_type, payload, status, priority, attempts, max_retries, result, error_message, scheduled_at, started_at, completed_at, created_at, updated_at FROM job_queue WHERE id = $1`,
      [jobId],
    );

    if (result.rows.length === 0) {
      logger.warn('Dequeued job ID not found in database', { jobId, queueName });
      return null;
    }

    return rowToJob(result.rows[0]);
  }

  /**
   * Execute a job using the supplied processor function.
   *
   * Transitions the job through processing -> completed (or failed),
   * tracking start time and duration.
   *
   * @param jobId       - The ID of the job to process.
   * @param processorFn - Async function that receives the job and returns a result.
   */
  static async processJob(
    jobId: string,
    processorFn: (job: Job) => Promise<Record<string, unknown>>,
  ): Promise<Job> {
    // Mark as processing
    const startResult = await pool.query(
      `UPDATE job_queue
       SET status = 'processing',
           started_at = NOW(),
           attempts = attempts + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId],
    );

    if (startResult.rows.length === 0) {
      throw new NotFoundError(`Job with id '${jobId}' not found`);
    }

    const job = rowToJob(startResult.rows[0]);

    // Update Redis metadata
    await redis.hset(redisJobKey(jobId), 'status', 'processing');

    const startTime = Date.now();

    try {
      const result = await processorFn(job);
      const durationMs = Date.now() - startTime;

      // Mark as completed
      const completedResult = await pool.query(
        `UPDATE job_queue
         SET status = 'completed',
             result = $2,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [jobId, JSON.stringify(result)],
      );

      await redis.hset(redisJobKey(jobId), 'status', 'completed');

      logger.info('Job completed', { jobId, queueName: job.queueName, jobType: job.jobType, durationMs });

      return rowToJob(completedResult.rows[0]);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      const failedResult = await pool.query(
        `UPDATE job_queue
         SET status = 'failed',
             error_message = $2,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [jobId, errorMessage],
      );

      await redis.hset(redisJobKey(jobId), 'status', 'failed');

      const failedJob = rowToJob(failedResult.rows[0]);

      logger.error('Job failed', {
        jobId,
        queueName: job.queueName,
        jobType: job.jobType,
        durationMs,
        error: errorMessage,
      });

      // If the job has exhausted all retries, move it to the dead letter queue.
      const maxRetries = job.maxRetries || env.MAX_JOB_RETRIES;
      if (failedJob.attempts >= maxRetries) {
        await QueueService.moveToDeadLetter(failedJob, errorMessage);
      }

      return failedJob;
    }
  }

  /**
   * Retrieve the current status and metadata of a job by its ID.
   *
   * @throws NotFoundError if the job does not exist.
   */
  static async getJobStatus(jobId: string): Promise<Job> {
    const result = await pool.query(
      `SELECT id, queue_name, job_type, payload, status, priority, attempts, max_retries, result, error_message, scheduled_at, started_at, completed_at, created_at, updated_at FROM job_queue WHERE id = $1`,
      [jobId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Job with id '${jobId}' not found`);
    }

    return rowToJob(result.rows[0]);
  }

  /**
   * List jobs with optional filtering and pagination.
   */
  static async listJobs(
    filters?: JobFilters,
    pagination?: JobPagination,
  ): Promise<PaginatedJobs> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.queue_name) {
      conditions.push(`queue_name = $${paramIndex++}`);
      params.push(filters.queue_name);
    }

    if (filters?.job_type) {
      conditions.push(`job_type = $${paramIndex++}`);
      params.push(filters.job_type);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count total matching rows
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM job_queue ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Pagination defaults
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT id, queue_name, job_type, payload, status, priority, attempts, max_retries, result, error_message, scheduled_at, started_at, completed_at, created_at, updated_at FROM job_queue ${whereClause}
       ORDER BY priority ASC, created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(rowToJob),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Re-enqueue a failed job, incrementing its attempt count.
   *
   * @throws NotFoundError if the job does not exist.
   * @throws ValidationError if the job is not in a retryable state or
   *   has exceeded its maximum retry count.
   */
  static async retryJob(jobId: string): Promise<Job> {
    const result = await pool.query(
      `SELECT id, queue_name, job_type, payload, status, priority, attempts, max_retries, result, error_message, scheduled_at, started_at, completed_at, created_at, updated_at FROM job_queue WHERE id = $1`,
      [jobId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Job with id '${jobId}' not found`);
    }

    const job = rowToJob(result.rows[0]);

    if (job.status !== 'failed') {
      throw new ValidationError(`Only failed jobs can be retried. Current status: ${job.status}`);
    }

    if (job.attempts >= job.maxRetries) {
      throw new ValidationError(
        `Job has reached maximum retry limit (${job.maxRetries}). Attempts: ${job.attempts}`,
      );
    }

    // Update status to retrying
    const updatedResult = await pool.query(
      `UPDATE job_queue
       SET status = 'retrying',
           error_message = NULL,
           started_at = NULL,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [jobId],
    );

    // Re-enqueue in Redis
    await redis.lpush(redisQueueKey(job.queueName), jobId);
    await redis.hset(redisJobKey(jobId), 'status', 'retrying');

    logger.info('Job re-enqueued for retry', {
      jobId,
      queueName: job.queueName,
      jobType: job.jobType,
      attempts: job.attempts,
    });

    return rowToJob(updatedResult.rows[0]);
  }

  /**
   * Return aggregate counts per queue grouped by status.
   */
  static async getQueueStats(): Promise<QueueStats> {
    const result = await pool.query(
      `SELECT
         queue_name,
         status,
         COUNT(*)::int AS count
       FROM job_queue
       GROUP BY queue_name, status
       ORDER BY queue_name, status`,
    );

    const queues: QueueStats['queues'] = {};
    const totals: QueueStats['totals'] = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
    };

    for (const row of result.rows) {
      const queueName = row.queue_name as string;
      const status = row.status as keyof QueueStats['totals'];
      const count = row.count as number;

      if (!queues[queueName]) {
        queues[queueName] = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          retrying: 0,
        };
      }

      queues[queueName][status] = count;
      totals[status] += count;
    }

    return { queues, totals };
  }

  /**
   * Delete completed and failed jobs older than the specified number of days.
   *
   * @param olderThanDays - Delete jobs whose created_at is older than this many days.
   * @returns The number of deleted jobs.
   */
  static async cleanupOldJobs(olderThanDays: number): Promise<number> {
    if (olderThanDays < 1) {
      throw new ValidationError('olderThanDays must be at least 1');
    }

    const result = await pool.query(
      `DELETE FROM job_queue
       WHERE status IN ('completed', 'failed')
         AND created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [olderThanDays],
    );

    const deletedCount = result.rowCount ?? 0;

    // Clean up Redis keys for deleted jobs
    for (const row of result.rows) {
      await cacheDel(redisJobKey(row.id));
    }

    logger.info('Old jobs cleaned up', { olderThanDays, deletedCount });

    return deletedCount;
  }

  // -------------------------------------------------------------------------
  // Dead Letter Queue
  // -------------------------------------------------------------------------

  /**
   * Move a failed job to the dead_letter_jobs table.
   *
   * Preserves the original job ID, type, full payload, and the final error
   * message so operators can inspect and optionally re-enqueue it.
   */
  static async moveToDeadLetter(
    job: Job,
    errorMessage: string,
  ): Promise<DeadLetterJob> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO dead_letter_jobs
         (id, original_job_id, type, payload, error, attempts, failed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        id,
        job.id,
        job.jobType,
        JSON.stringify(job.payload),
        errorMessage,
        job.attempts,
      ],
    );

    logger.warn('Job moved to dead letter queue', {
      deadLetterId: id,
      originalJobId: job.id,
      queueName: job.queueName,
      jobType: job.jobType,
      attempts: job.attempts,
    });

    return rowToDeadLetterJob(result.rows[0]);
  }

  /**
   * List dead letter jobs with pagination.
   */
  static async listDeadLetterJobs(
    pagination?: JobPagination,
  ): Promise<PaginatedDeadLetterJobs> {
    // Count total rows
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM dead_letter_jobs`,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Pagination defaults
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT id, original_job_id, type, payload, error, attempts, failed_at, created_at FROM dead_letter_jobs
       ORDER BY failed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return {
      data: dataResult.rows.map(rowToDeadLetterJob),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Retry a dead letter job by re-enqueuing it into the original queue.
   *
   * The dead letter record is deleted upon successful re-enqueue so it does
   * not appear in the dead letter list anymore.
   *
   * @throws NotFoundError if the dead letter job does not exist.
   */
  static async retryDeadLetterJob(deadLetterId: string): Promise<string> {
    const result = await pool.query(
      `SELECT id, original_job_id, type, payload, error, attempts, failed_at, created_at FROM dead_letter_jobs WHERE id = $1`,
      [deadLetterId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Dead letter job with id '${deadLetterId}' not found`);
    }

    const dlJob = rowToDeadLetterJob(result.rows[0]);

    // Look up the original job to get the queue name; fall back to 'default'.
    const originalResult = await pool.query(
      `SELECT queue_name FROM job_queue WHERE id = $1`,
      [dlJob.originalJobId],
    );
    const queueName =
      originalResult.rows.length > 0
        ? (originalResult.rows[0].queue_name as string)
        : 'default';

    // Re-enqueue a fresh job with the original payload.
    const newJobId = await QueueService.enqueue(
      queueName,
      dlJob.type,
      dlJob.payload,
      { max_retries: env.MAX_JOB_RETRIES },
    );

    // Remove the dead letter entry
    await pool.query(
      `DELETE FROM dead_letter_jobs WHERE id = $1`,
      [deadLetterId],
    );

    logger.info('Dead letter job re-enqueued', {
      deadLetterId,
      originalJobId: dlJob.originalJobId,
      newJobId,
      queueName,
    });

    return newJobId;
  }
}

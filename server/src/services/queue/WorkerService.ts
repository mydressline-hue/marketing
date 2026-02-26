/**
 * Worker Service – Background Job Processor.
 *
 * Provides static methods for registering job processors, starting and
 * stopping queue workers, and querying worker health. Workers poll their
 * assigned Redis queue at a configurable interval and delegate execution
 * to registered processor functions via `QueueService.processJob`.
 *
 * Built-in stub processors are registered for:
 *   - `platform_sync`    : ad_sync, crm_sync, shopify_sync
 *   - `analytics_export` : analytics_export
 *   - `bulk_import`      : crm_import
 */

import { logger } from '../../utils/logger';
import { QueueService, Job } from './QueueService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProcessorFn = (job: Job) => Promise<Record<string, unknown>>;

export interface WorkerOptions {
  pollIntervalMs?: number;
  concurrency?: number;
}

export interface WorkerInfo {
  queueName: string;
  status: 'running' | 'stopped';
  pollIntervalMs: number;
  concurrency: number;
  jobsProcessed: number;
  jobsFailed: number;
  lastPollAt: string | null;
  startedAt: string | null;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Map of queue+jobType -> processor function */
const processors: Map<string, ProcessorFn> = new Map();

/** Map of queueName -> worker runtime state */
const workers: Map<string, {
  running: boolean;
  pollIntervalMs: number;
  concurrency: number;
  jobsProcessed: number;
  jobsFailed: number;
  lastPollAt: string | null;
  startedAt: string | null;
  timerId: ReturnType<typeof setTimeout> | null;
  activeJobs: number;
}> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function processorKey(queueName: string, jobType: string): string {
  return `${queueName}:${jobType}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WorkerService {
  /**
   * Register a handler function for a specific job type on a queue.
   *
   * @param queueName   - The queue this processor is responsible for.
   * @param jobType     - The specific job type to handle.
   * @param processorFn - Async function that processes the job and returns a result.
   */
  static registerProcessor(
    queueName: string,
    jobType: string,
    processorFn: ProcessorFn,
  ): void {
    const key = processorKey(queueName, jobType);
    processors.set(key, processorFn);
    logger.info('Processor registered', { queueName, jobType });
  }

  /**
   * Start polling a queue for jobs.
   *
   * @param queueName - The queue to poll.
   * @param options   - pollIntervalMs (default 5000) and concurrency (default 1).
   */
  static startWorker(queueName: string, options?: WorkerOptions): void {
    const existing = workers.get(queueName);
    if (existing?.running) {
      logger.warn('Worker already running', { queueName });
      return;
    }

    const pollIntervalMs = options?.pollIntervalMs ?? 5000;
    const concurrency = options?.concurrency ?? 1;

    const state = {
      running: true,
      pollIntervalMs,
      concurrency,
      jobsProcessed: existing?.jobsProcessed ?? 0,
      jobsFailed: existing?.jobsFailed ?? 0,
      lastPollAt: null as string | null,
      startedAt: new Date().toISOString(),
      timerId: null as ReturnType<typeof setTimeout> | null,
      activeJobs: 0,
    };

    workers.set(queueName, state);

    logger.info('Worker started', { queueName, pollIntervalMs, concurrency });

    // Begin the poll loop
    const poll = async (): Promise<void> => {
      const workerState = workers.get(queueName);
      if (!workerState || !workerState.running) {
        return;
      }

      workerState.lastPollAt = new Date().toISOString();

      try {
        // Dequeue up to (concurrency - activeJobs) jobs
        const slotsAvailable = workerState.concurrency - workerState.activeJobs;

        for (let i = 0; i < slotsAvailable; i++) {
          const job = await QueueService.dequeue(queueName);
          if (!job) {
            break; // Queue is empty
          }

          // Find the right processor
          const key = processorKey(queueName, job.jobType);
          const processor = processors.get(key);

          if (!processor) {
            logger.warn('No processor registered for job type', {
              queueName,
              jobType: job.jobType,
              jobId: job.id,
            });
            // Mark as failed since no processor is available
            await QueueService.processJob(job.id, async () => {
              throw new Error(`No processor registered for job type '${job.jobType}' on queue '${queueName}'`);
            });
            workerState.jobsFailed++;
            continue;
          }

          // Process concurrently (fire-and-forget within the poll cycle)
          workerState.activeJobs++;
          QueueService.processJob(job.id, processor)
            .then((processedJob) => {
              if (processedJob.status === 'completed') {
                workerState.jobsProcessed++;
              } else {
                workerState.jobsFailed++;
              }
            })
            .catch(() => {
              workerState.jobsFailed++;
            })
            .finally(() => {
              workerState.activeJobs--;
            });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Worker poll error', { queueName, error: message });
      }

      // Schedule the next poll
      if (workerState.running) {
        workerState.timerId = setTimeout(poll, workerState.pollIntervalMs);
      }
    };

    // Kick off the first poll
    state.timerId = setTimeout(poll, 0);
  }

  /**
   * Stop polling a queue.
   */
  static stopWorker(queueName: string): void {
    const state = workers.get(queueName);
    if (!state) {
      logger.warn('No worker found for queue', { queueName });
      return;
    }

    state.running = false;

    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    logger.info('Worker stopped', { queueName });
  }

  /**
   * Return the current status of all registered workers.
   */
  static getWorkerStatus(): WorkerInfo[] {
    const statuses: WorkerInfo[] = [];

    for (const [queueName, state] of workers.entries()) {
      statuses.push({
        queueName,
        status: state.running ? 'running' : 'stopped',
        pollIntervalMs: state.pollIntervalMs,
        concurrency: state.concurrency,
        jobsProcessed: state.jobsProcessed,
        jobsFailed: state.jobsFailed,
        lastPollAt: state.lastPollAt,
        startedAt: state.startedAt,
      });
    }

    return statuses;
  }

  /**
   * Register all built-in stub processors.
   *
   * These are lightweight placeholder implementations that log the job
   * and return a success result. Replace with real logic as integrations
   * are built out.
   */
  static registerBuiltInProcessors(): void {
    // ---- platform_sync queue ----

    WorkerService.registerProcessor('platform_sync', 'ad_sync', async (job: Job) => {
      logger.info('Processing ad_sync job', { jobId: job.id, payload: job.payload });
      // Stub: simulate platform ad synchronisation
      return { synced: true, platform: job.payload.platform ?? 'unknown', recordsProcessed: 0 };
    });

    WorkerService.registerProcessor('platform_sync', 'crm_sync', async (job: Job) => {
      logger.info('Processing crm_sync job', { jobId: job.id, payload: job.payload });
      // Stub: simulate CRM synchronisation
      return { synced: true, crm: job.payload.crm ?? 'unknown', recordsProcessed: 0 };
    });

    WorkerService.registerProcessor('platform_sync', 'shopify_sync', async (job: Job) => {
      logger.info('Processing shopify_sync job', { jobId: job.id, payload: job.payload });
      // Stub: simulate Shopify data synchronisation
      return { synced: true, shop: job.payload.shop ?? 'unknown', productsProcessed: 0 };
    });

    // ---- analytics_export queue ----

    WorkerService.registerProcessor('analytics_export', 'analytics_export', async (job: Job) => {
      logger.info('Processing analytics_export job', { jobId: job.id, payload: job.payload });
      // Stub: simulate analytics data export
      return { exported: true, format: job.payload.format ?? 'csv', rowCount: 0 };
    });

    // ---- bulk_import queue ----

    WorkerService.registerProcessor('bulk_import', 'crm_import', async (job: Job) => {
      logger.info('Processing crm_import job', { jobId: job.id, payload: job.payload });
      // Stub: simulate bulk CRM import
      return { imported: true, source: job.payload.source ?? 'unknown', recordCount: 0 };
    });

    logger.info('Built-in job processors registered');
  }
}

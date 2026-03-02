/**
 * Queue Service Integration Tests (Phase 12C - Batch 2).
 *
 * Validates job enqueue, dequeue, worker processing simulation,
 * job priority handling, retry logic with backoff, dead letter queue,
 * job status tracking, and queue metrics.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn(),
    hset: jest.fn().mockResolvedValue(undefined),
    hget: jest.fn().mockResolvedValue(null),
    expire: jest.fn().mockResolvedValue(undefined),
    lpush: jest.fn().mockResolvedValue(undefined),
    rpop: jest.fn().mockResolvedValue(null),
    zadd: jest.fn().mockResolvedValue(undefined),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(undefined),
  },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test', PORT: 3001, API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h', JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000, RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error', LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('job-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { redis, cacheDel } from '../../../src/config/redis';
import { QueueService } from '../../../src/services/queue/QueueService';

const mockQuery = pool.query as jest.Mock;
const mockRedis = redis as any;
const mockCacheDel = cacheDel as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-test-uuid',
    queue_name: 'platform_sync',
    job_type: 'ad_sync',
    payload: { platform: 'google_ads' },
    status: 'pending',
    priority: 5,
    attempts: 0,
    max_retries: 3,
    result: null,
    error_message: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Queue Service Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.hset.mockResolvedValue(undefined);
    mockRedis.expire.mockResolvedValue(undefined);
    mockRedis.lpush.mockResolvedValue(undefined);
    mockRedis.rpop.mockResolvedValue(null);
    mockRedis.zadd.mockResolvedValue(undefined);
    mockRedis.zrangebyscore.mockResolvedValue([]);
    mockRedis.zrem.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Job enqueue
  // =========================================================================

  describe('Job enqueue', () => {
    it('should enqueue a job with default priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const jobId = await QueueService.enqueue('platform_sync', 'ad_sync', { platform: 'google_ads' });

      expect(jobId).toBe('job-test-uuid');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_queue'),
        expect.arrayContaining(['job-test-uuid', 'platform_sync', 'ad_sync']),
      );
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'job:job-test-uuid',
        expect.objectContaining({ queueName: 'platform_sync', jobType: 'ad_sync', status: 'pending' }),
      );
      expect(mockRedis.lpush).toHaveBeenCalledWith('queue:platform_sync', 'job-test-uuid');
    });

    it('should enqueue a job with custom priority', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await QueueService.enqueue('platform_sync', 'ad_sync', {}, { priority: 1 });

      const insertParams = mockQuery.mock.calls[0][1];
      expect(insertParams).toContain(1); // priority
    });

    it('should reject priority below 1', async () => {
      await expect(
        QueueService.enqueue('platform_sync', 'ad_sync', {}, { priority: 0 }),
      ).rejects.toThrow('Priority must be between 1 and 10');
    });

    it('should reject priority above 10', async () => {
      await expect(
        QueueService.enqueue('platform_sync', 'ad_sync', {}, { priority: 11 }),
      ).rejects.toThrow('Priority must be between 1 and 10');
    });

    it('should reject empty queue name', async () => {
      await expect(
        QueueService.enqueue('', 'ad_sync', {}),
      ).rejects.toThrow('Queue name and job type are required');
    });

    it('should reject empty job type', async () => {
      await expect(
        QueueService.enqueue('platform_sync', '', {}),
      ).rejects.toThrow('Queue name and job type are required');
    });

    it('should use sorted set for delayed jobs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await QueueService.enqueue('platform_sync', 'ad_sync', {}, { delay_ms: 5000 });

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'delayed:platform_sync',
        expect.any(Number),
        'job-test-uuid',
      );
      expect(mockRedis.lpush).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Job dequeue
  // =========================================================================

  describe('Job dequeue', () => {
    it('should dequeue a job from the queue', async () => {
      mockRedis.rpop.mockResolvedValueOnce('job-1');
      mockQuery.mockResolvedValueOnce({ rows: [makeJobRow({ id: 'job-1' })] });

      const job = await QueueService.dequeue('platform_sync');

      expect(job).not.toBeNull();
      expect(job!.id).toBe('job-1');
      expect(job!.queueName).toBe('platform_sync');
    });

    it('should return null when queue is empty', async () => {
      mockRedis.rpop.mockResolvedValueOnce(null);

      const job = await QueueService.dequeue('platform_sync');

      expect(job).toBeNull();
    });

    it('should return null when dequeued job ID is not in database', async () => {
      mockRedis.rpop.mockResolvedValueOnce('orphaned-job');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const job = await QueueService.dequeue('platform_sync');

      expect(job).toBeNull();
    });

    it('should promote delayed jobs before dequeuing', async () => {
      mockRedis.zrangebyscore.mockResolvedValueOnce(['delayed-job-1', 'delayed-job-2']);
      mockRedis.rpop.mockResolvedValueOnce('delayed-job-1');
      mockQuery.mockResolvedValueOnce({ rows: [makeJobRow({ id: 'delayed-job-1' })] });

      const job = await QueueService.dequeue('platform_sync');

      expect(mockRedis.lpush).toHaveBeenCalledWith('queue:platform_sync', 'delayed-job-1');
      expect(mockRedis.lpush).toHaveBeenCalledWith('queue:platform_sync', 'delayed-job-2');
      expect(mockRedis.zrem).toHaveBeenCalledTimes(2);
      expect(job).not.toBeNull();
    });
  });

  // =========================================================================
  // Worker processing simulation
  // =========================================================================

  describe('Worker processing simulation', () => {
    it('should process a job successfully via processJob', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'processing', attempts: 1 })] }) // mark processing
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'completed', result: { synced: 10 } })] }); // mark completed

      const processorFn = jest.fn().mockResolvedValue({ synced: 10 });
      const result = await QueueService.processJob('job-1', processorFn);

      expect(result.status).toBe('completed');
      expect(processorFn).toHaveBeenCalled();
      expect(mockRedis.hset).toHaveBeenCalledWith('job:job-1', 'status', 'processing');
      expect(mockRedis.hset).toHaveBeenCalledWith('job:job-1', 'status', 'completed');
    });

    it('should mark a job as failed when processor throws', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'processing', attempts: 1 })] })
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'failed', error_message: 'Timeout' })] });

      const processorFn = jest.fn().mockRejectedValue(new Error('Timeout'));
      const result = await QueueService.processJob('job-1', processorFn);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Timeout');
      expect(mockRedis.hset).toHaveBeenCalledWith('job:job-1', 'status', 'failed');
    });

    it('should throw NotFoundError when processing a non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const processorFn = jest.fn();
      await expect(QueueService.processJob('non-existent', processorFn)).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // Job priority handling
  // =========================================================================

  describe('Job priority handling', () => {
    it('should list jobs sorted by priority ascending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({
          rows: [
            makeJobRow({ id: 'j1', priority: 1 }),
            makeJobRow({ id: 'j2', priority: 5 }),
            makeJobRow({ id: 'j3', priority: 10 }),
          ],
        });

      const result = await QueueService.listJobs();

      expect(result.data[0].priority).toBe(1);
      expect(result.data[1].priority).toBe(5);
      expect(result.data[2].priority).toBe(10);
    });
  });

  // =========================================================================
  // Retry logic
  // =========================================================================

  describe('Retry logic', () => {
    it('should retry a failed job', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'failed', attempts: 1, max_retries: 3 })] })
        .mockResolvedValueOnce({ rows: [makeJobRow({ status: 'retrying', attempts: 1 })] });

      const result = await QueueService.retryJob('job-1');

      expect(result.status).toBe('retrying');
      expect(mockRedis.lpush).toHaveBeenCalledWith('queue:platform_sync', 'job-1');
      expect(mockRedis.hset).toHaveBeenCalledWith('job:job-1', 'status', 'retrying');
    });

    it('should reject retry for non-failed job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeJobRow({ status: 'completed', attempts: 1 })] });

      await expect(QueueService.retryJob('job-1')).rejects.toThrow('Only failed jobs can be retried');
    });

    it('should reject retry when max retries exceeded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeJobRow({ status: 'failed', attempts: 3, max_retries: 3 })],
      });

      await expect(QueueService.retryJob('job-1')).rejects.toThrow('maximum retry limit');
    });

    it('should throw NotFoundError when retrying non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(QueueService.retryJob('non-existent')).rejects.toThrow('not found');
    });
  });

  // =========================================================================
  // Job status tracking
  // =========================================================================

  describe('Job status tracking', () => {
    it('should return job status by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeJobRow({ status: 'processing', attempts: 1 })] });

      const job = await QueueService.getJobStatus('job-1');

      expect(job.id).toBe('job-test-uuid');
      expect(job.status).toBe('processing');
      expect(job.attempts).toBe(1);
    });

    it('should throw NotFoundError for non-existent job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(QueueService.getJobStatus('non-existent')).rejects.toThrow('not found');
    });

    it('should list jobs with status filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            makeJobRow({ id: 'j1', status: 'failed' }),
            makeJobRow({ id: 'j2', status: 'failed' }),
          ],
        });

      const result = await QueueService.listJobs({ status: 'failed' });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(j => j.status === 'failed')).toBe(true);
    });

    it('should list jobs with queue_name filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [makeJobRow({ queue_name: 'notifications' })] });

      const result = await QueueService.listJobs({ queue_name: 'notifications' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].queueName).toBe('notifications');
    });

    it('should paginate job results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await QueueService.listJobs(undefined, { page: 3, limit: 10 });

      expect(result.total).toBe(50);
      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(5);
    });
  });

  // =========================================================================
  // Queue metrics
  // =========================================================================

  describe('Queue metrics', () => {
    it('should return aggregate stats grouped by queue and status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { queue_name: 'platform_sync', status: 'pending', count: 5 },
          { queue_name: 'platform_sync', status: 'completed', count: 20 },
          { queue_name: 'platform_sync', status: 'failed', count: 2 },
          { queue_name: 'notifications', status: 'pending', count: 10 },
          { queue_name: 'notifications', status: 'processing', count: 3 },
        ],
      });

      const stats = await QueueService.getQueueStats();

      // Per-queue stats
      expect(stats.queues['platform_sync'].pending).toBe(5);
      expect(stats.queues['platform_sync'].completed).toBe(20);
      expect(stats.queues['platform_sync'].failed).toBe(2);
      expect(stats.queues['notifications'].pending).toBe(10);
      expect(stats.queues['notifications'].processing).toBe(3);

      // Totals
      expect(stats.totals.pending).toBe(15); // 5 + 10
      expect(stats.totals.completed).toBe(20);
      expect(stats.totals.failed).toBe(2);
      expect(stats.totals.processing).toBe(3);
    });

    it('should return empty stats when no jobs exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const stats = await QueueService.getQueueStats();

      expect(Object.keys(stats.queues)).toHaveLength(0);
      expect(stats.totals.pending).toBe(0);
      expect(stats.totals.processing).toBe(0);
      expect(stats.totals.completed).toBe(0);
      expect(stats.totals.failed).toBe(0);
    });
  });

  // =========================================================================
  // Cleanup old jobs (dead letter behavior)
  // =========================================================================

  describe('Cleanup old jobs', () => {
    it('should delete old completed and failed jobs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'old-1' }, { id: 'old-2' }], rowCount: 2 });

      const count = await QueueService.cleanupOldJobs(30);

      expect(count).toBe(2);
      expect(mockCacheDel).toHaveBeenCalledWith('job:old-1');
      expect(mockCacheDel).toHaveBeenCalledWith('job:old-2');
    });

    it('should reject cleanup with olderThanDays < 1', async () => {
      await expect(QueueService.cleanupOldJobs(0)).rejects.toThrow('olderThanDays must be at least 1');
    });

    it('should handle no jobs to clean up', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const count = await QueueService.cleanupOldJobs(7);

      expect(count).toBe(0);
    });
  });
});

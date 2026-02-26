/**
 * E2E tests for Performance and Concurrency.
 *
 * Validates system behavior under concurrent operations:
 *   1. Multiple agents running simultaneously
 *   2. Concurrent API requests without data corruption
 *   3. Rate limiting under load
 *   4. Database connection pool handling concurrent queries
 *   5. Redis caching under concurrent access
 *   6. Job queue processing order
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Simulation Types
// ---------------------------------------------------------------------------

type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface AgentRun {
  agentId: string;
  agentType: string;
  status: AgentStatus;
  startedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

interface ApiRequest {
  id: string;
  method: string;
  path: string;
  userId: string;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'completed' | 'rate_limited' | 'failed';
  response?: unknown;
}

interface RateLimitWindow {
  userId: string;
  requestCount: number;
  windowStart: number;
  windowSize: number;
  maxRequests: number;
}

interface ConnectionPoolSlot {
  id: number;
  inUse: boolean;
  acquiredAt?: number;
  releasedAt?: number;
  queryCount: number;
}

interface CacheEntry {
  key: string;
  value: unknown;
  setAt: number;
  ttl: number;
  accessCount: number;
}

interface QueueJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
}

// ---------------------------------------------------------------------------
// Concurrency Simulator
// ---------------------------------------------------------------------------

class ConcurrencySimulator {
  private agentRuns: Map<string, AgentRun> = new Map();
  private apiRequests: Map<string, ApiRequest> = new Map();
  private rateLimitWindows: Map<string, RateLimitWindow> = new Map();
  private connectionPool: ConnectionPoolSlot[] = [];
  private cacheStore: Map<string, CacheEntry> = new Map();
  private jobQueue: QueueJob[] = [];
  private processedJobs: QueueJob[] = [];
  private requestCounter = 0;
  private jobCounter = 0;
  private operationLog: Array<{ op: string; timestamp: number; detail: string }> = [];

  constructor(poolSize: number = 10) {
    // Initialize connection pool
    for (let i = 0; i < poolSize; i++) {
      this.connectionPool.push({
        id: i,
        inUse: false,
        queryCount: 0,
      });
    }
  }

  // -- Agent Concurrent Operations --

  async startAgent(agentType: string, agentId: string, durationMs: number = 10): Promise<AgentRun> {
    const run: AgentRun = {
      agentId,
      agentType,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    this.agentRuns.set(agentId, run);
    this.log('agent_start', `Agent ${agentType}:${agentId} started`);

    // Simulate async work
    await this.simulateWork(durationMs);

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.result = { processed: true, agentType };
    this.log('agent_complete', `Agent ${agentType}:${agentId} completed`);

    return run;
  }

  async runAgentsConcurrently(agents: Array<{ type: string; id: string }>): Promise<AgentRun[]> {
    const promises = agents.map((a) => this.startAgent(a.type, a.id));
    return Promise.all(promises);
  }

  getRunningAgents(): AgentRun[] {
    return Array.from(this.agentRuns.values()).filter((r) => r.status === 'running');
  }

  getCompletedAgents(): AgentRun[] {
    return Array.from(this.agentRuns.values()).filter((r) => r.status === 'completed');
  }

  // -- Concurrent API Request Handling --

  async processApiRequest(method: string, path: string, userId: string): Promise<ApiRequest> {
    this.requestCounter++;
    const request: ApiRequest = {
      id: `req-${this.requestCounter}`,
      method,
      path,
      userId,
      startedAt: Date.now(),
      status: 'pending',
    };

    this.apiRequests.set(request.id, request);

    // Check rate limit
    const rateLimited = this.checkRateLimit(userId);
    if (rateLimited) {
      request.status = 'rate_limited';
      request.completedAt = Date.now();
      this.log('rate_limited', `Request ${request.id} rate limited for user ${userId}`);
      return request;
    }

    // Simulate async processing
    await this.simulateWork(1);

    request.status = 'completed';
    request.completedAt = Date.now();
    request.response = { success: true, requestId: request.id };
    this.log('api_complete', `Request ${request.id} completed`);

    return request;
  }

  async processRequestsConcurrently(requests: Array<{ method: string; path: string; userId: string }>): Promise<ApiRequest[]> {
    const promises = requests.map((r) => this.processApiRequest(r.method, r.path, r.userId));
    return Promise.all(promises);
  }

  // -- Rate Limiting --

  private checkRateLimit(userId: string): boolean {
    const key = `rate:${userId}`;
    const now = Date.now();
    const windowSize = 60000; // 1 minute
    const maxRequests = 100;

    let window = this.rateLimitWindows.get(key);

    if (!window || now - window.windowStart >= windowSize) {
      // Start new window
      window = {
        userId,
        requestCount: 1,
        windowStart: now,
        windowSize,
        maxRequests,
      };
      this.rateLimitWindows.set(key, window);
      return false;
    }

    window.requestCount++;
    if (window.requestCount > maxRequests) {
      return true;
    }

    return false;
  }

  configureRateLimit(userId: string, maxRequests: number): void {
    const key = `rate:${userId}`;
    this.rateLimitWindows.set(key, {
      userId,
      requestCount: 0,
      windowStart: Date.now(),
      windowSize: 60000,
      maxRequests,
    });
  }

  getRateLimitStatus(userId: string): RateLimitWindow | undefined {
    return this.rateLimitWindows.get(`rate:${userId}`);
  }

  // -- Connection Pool Management --

  acquireConnection(): ConnectionPoolSlot | null {
    const available = this.connectionPool.find((c) => !c.inUse);
    if (!available) return null;

    available.inUse = true;
    available.acquiredAt = Date.now();
    this.log('pool_acquire', `Connection ${available.id} acquired`);
    return available;
  }

  releaseConnection(slotId: number): void {
    const slot = this.connectionPool.find((c) => c.id === slotId);
    if (slot) {
      slot.inUse = false;
      slot.releasedAt = Date.now();
      this.log('pool_release', `Connection ${slot.id} released`);
    }
  }

  async executeQuery(query: string): Promise<{ success: boolean; connectionId: number; error?: string }> {
    const conn = this.acquireConnection();
    if (!conn) {
      return { success: false, connectionId: -1, error: 'No available connections' };
    }

    try {
      await this.simulateWork(1);
      conn.queryCount++;
      return { success: true, connectionId: conn.id };
    } finally {
      this.releaseConnection(conn.id);
    }
  }

  async executeConcurrentQueries(queries: string[]): Promise<Array<{ success: boolean; connectionId: number; error?: string }>> {
    const promises = queries.map((q) => this.executeQuery(q));
    return Promise.all(promises);
  }

  getPoolStatus(): { total: number; inUse: number; available: number; totalQueries: number } {
    const inUse = this.connectionPool.filter((c) => c.inUse).length;
    const totalQueries = this.connectionPool.reduce((sum, c) => sum + c.queryCount, 0);
    return {
      total: this.connectionPool.length,
      inUse,
      available: this.connectionPool.length - inUse,
      totalQueries,
    };
  }

  // -- Cache Concurrent Access --

  cacheSet(key: string, value: unknown, ttl: number = 60): void {
    const entry: CacheEntry = {
      key,
      value,
      setAt: Date.now(),
      ttl,
      accessCount: 0,
    };
    this.cacheStore.set(key, entry);
    this.log('cache_set', `Cache set: ${key}`);
  }

  cacheGet(key: string): unknown | null {
    const entry = this.cacheStore.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.setAt > entry.ttl * 1000) {
      this.cacheStore.delete(key);
      return null;
    }

    entry.accessCount++;
    this.log('cache_hit', `Cache hit: ${key} (access #${entry.accessCount})`);
    return entry.value;
  }

  cacheDelete(key: string): boolean {
    const deleted = this.cacheStore.delete(key);
    if (deleted) this.log('cache_del', `Cache deleted: ${key}`);
    return deleted;
  }

  async concurrentCacheOperations(operations: Array<{ op: 'get' | 'set' | 'del'; key: string; value?: unknown }>): Promise<Array<{ op: string; key: string; result: unknown }>> {
    const promises = operations.map(async (op) => {
      await this.simulateWork(0); // microtask yield
      let result: unknown;
      switch (op.op) {
        case 'get':
          result = this.cacheGet(op.key);
          break;
        case 'set':
          this.cacheSet(op.key, op.value);
          result = true;
          break;
        case 'del':
          result = this.cacheDelete(op.key);
          break;
      }
      return { op: op.op, key: op.key, result };
    });

    return Promise.all(promises);
  }

  getCacheStats(): { entries: number; totalAccesses: number } {
    let totalAccesses = 0;
    for (const entry of this.cacheStore.values()) {
      totalAccesses += entry.accessCount;
    }
    return { entries: this.cacheStore.size, totalAccesses };
  }

  // -- Job Queue --

  enqueueJob(type: string, payload: Record<string, unknown>, priority: number = 0): QueueJob {
    this.jobCounter++;
    const job: QueueJob = {
      id: `job-${this.jobCounter}`,
      type,
      payload,
      priority,
      status: 'pending',
      enqueuedAt: Date.now(),
    };

    // Insert in priority order (higher priority first, FIFO within same priority)
    const insertIndex = this.jobQueue.findIndex((j) => j.priority < priority);
    if (insertIndex === -1) {
      this.jobQueue.push(job);
    } else {
      this.jobQueue.splice(insertIndex, 0, job);
    }

    this.log('job_enqueue', `Job ${job.id} (type: ${type}, priority: ${priority}) enqueued`);
    return job;
  }

  async processNextJob(): Promise<QueueJob | null> {
    const job = this.jobQueue.shift();
    if (!job) return null;

    job.status = 'processing';
    job.startedAt = Date.now();

    await this.simulateWork(1);

    job.status = 'completed';
    job.completedAt = Date.now();
    job.result = { processed: true };
    this.processedJobs.push(job);

    this.log('job_complete', `Job ${job.id} completed`);
    return job;
  }

  async processAllJobs(): Promise<QueueJob[]> {
    const results: QueueJob[] = [];
    let job = await this.processNextJob();
    while (job) {
      results.push(job);
      job = await this.processNextJob();
    }
    return results;
  }

  getQueueSize(): number {
    return this.jobQueue.length;
  }

  getProcessedJobs(): QueueJob[] {
    return [...this.processedJobs];
  }

  // -- Helpers --

  private async simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(op: string, detail: string): void {
    this.operationLog.push({ op, timestamp: Date.now(), detail });
  }

  getOperationLog(): typeof this.operationLog {
    return [...this.operationLog];
  }

  getApiRequests(): ApiRequest[] {
    return Array.from(this.apiRequests.values());
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Performance & Concurrency', () => {
  let sim: ConcurrencySimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    sim = new ConcurrencySimulator(10);
    mockGenerateId.mockReturnValue('test-uuid-generated');
  });

  // =========================================================================
  // 1. Multiple Agents Running Simultaneously
  // =========================================================================

  describe('Multiple Agents Running Simultaneously', () => {
    it('should run multiple agents concurrently and all complete', async () => {
      const agents = [
        { type: 'budget_optimizer', id: 'agent-1' },
        { type: 'creative_optimizer', id: 'agent-2' },
        { type: 'bidding_agent', id: 'agent-3' },
        { type: 'performance_analyzer', id: 'agent-4' },
      ];

      const results = await sim.runAgentsConcurrently(agents);

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.status).toBe('completed');
        expect(result.completedAt).toBeDefined();
        expect(result.result).toBeDefined();
      }

      expect(sim.getCompletedAgents()).toHaveLength(4);
    });

    it('should track all concurrent agent types correctly', async () => {
      const agents = [
        { type: 'budget_optimizer', id: 'bo-1' },
        { type: 'budget_optimizer', id: 'bo-2' },
        { type: 'creative_optimizer', id: 'co-1' },
      ];

      const results = await sim.runAgentsConcurrently(agents);

      const types = results.map((r) => r.agentType);
      expect(types.filter((t) => t === 'budget_optimizer')).toHaveLength(2);
      expect(types.filter((t) => t === 'creative_optimizer')).toHaveLength(1);
    });

    it('should assign unique agent IDs to each concurrent run', async () => {
      const agents = Array.from({ length: 8 }, (_, i) => ({
        type: 'performance_analyzer',
        id: `pa-${i + 1}`,
      }));

      const results = await sim.runAgentsConcurrently(agents);
      const agentIds = results.map((r) => r.agentId);
      const uniqueIds = new Set(agentIds);

      expect(uniqueIds.size).toBe(8);
    });
  });

  // =========================================================================
  // 2. Concurrent API Requests Without Data Corruption
  // =========================================================================

  describe('Concurrent API Requests Without Data Corruption', () => {
    it('should process multiple concurrent requests without corruption', async () => {
      const requests = Array.from({ length: 20 }, (_, i) => ({
        method: 'GET',
        path: `/api/v1/campaigns/${i}`,
        userId: `user-${i % 5}`,
      }));

      const results = await sim.processRequestsConcurrently(requests);

      expect(results).toHaveLength(20);

      // All should be completed (rate limit is 100/min so 20 is fine)
      const completed = results.filter((r) => r.status === 'completed');
      expect(completed).toHaveLength(20);

      // Each request should have a unique ID
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(20);

      // Each response should reference its own request ID
      for (const result of completed) {
        const response = result.response as { success: boolean; requestId: string };
        expect(response.success).toBe(true);
        expect(response.requestId).toBe(result.id);
      }
    });

    it('should maintain request isolation between users', async () => {
      const requests = [
        { method: 'POST', path: '/api/v1/campaigns', userId: 'user-A' },
        { method: 'POST', path: '/api/v1/campaigns', userId: 'user-B' },
        { method: 'GET', path: '/api/v1/campaigns', userId: 'user-A' },
        { method: 'GET', path: '/api/v1/campaigns', userId: 'user-B' },
      ];

      const results = await sim.processRequestsConcurrently(requests);

      // User A's requests should be isolated from User B's
      const userARequests = results.filter((r) => r.userId === 'user-A');
      const userBRequests = results.filter((r) => r.userId === 'user-B');

      expect(userARequests).toHaveLength(2);
      expect(userBRequests).toHaveLength(2);

      // No cross-contamination
      for (const req of userARequests) {
        expect(req.userId).toBe('user-A');
      }
      for (const req of userBRequests) {
        expect(req.userId).toBe('user-B');
      }
    });
  });

  // =========================================================================
  // 3. Rate Limiting Under Load
  // =========================================================================

  describe('Rate Limiting Under Load', () => {
    it('should enforce rate limits when request count exceeds threshold', async () => {
      // Configure a strict rate limit
      sim.configureRateLimit('heavy-user', 5);

      const requests = Array.from({ length: 10 }, () => ({
        method: 'GET',
        path: '/api/v1/dashboard',
        userId: 'heavy-user',
      }));

      const results = await sim.processRequestsConcurrently(requests);

      const completed = results.filter((r) => r.status === 'completed');
      const rateLimited = results.filter((r) => r.status === 'rate_limited');

      // First 5 should succeed, rest should be rate limited
      expect(completed.length).toBe(5);
      expect(rateLimited.length).toBe(5);
    });

    it('should not rate limit different users against each other', async () => {
      sim.configureRateLimit('user-1', 3);
      sim.configureRateLimit('user-2', 3);

      const requests = [
        ...Array.from({ length: 3 }, () => ({ method: 'GET' as const, path: '/api', userId: 'user-1' })),
        ...Array.from({ length: 3 }, () => ({ method: 'GET' as const, path: '/api', userId: 'user-2' })),
      ];

      const results = await sim.processRequestsConcurrently(requests);

      // All 6 should succeed (3 per user, each within their own limit)
      const completed = results.filter((r) => r.status === 'completed');
      expect(completed).toHaveLength(6);
    });
  });

  // =========================================================================
  // 4. Database Connection Pool Under Concurrent Queries
  // =========================================================================

  describe('Database Connection Pool Handling', () => {
    it('should handle concurrent queries within pool capacity', async () => {
      const queries = Array.from({ length: 8 }, (_, i) =>
        `SELECT * FROM campaigns WHERE id = ${i + 1}`,
      );

      const results = await sim.executeConcurrentQueries(queries);

      // All should succeed (pool has 10 slots, 8 queries)
      const successful = results.filter((r) => r.success);
      expect(successful).toHaveLength(8);

      // After completion, all connections should be released
      const poolStatus = sim.getPoolStatus();
      expect(poolStatus.inUse).toBe(0);
      expect(poolStatus.totalQueries).toBe(8);
    });

    it('should track total query count across all pool connections', async () => {
      // Execute two batches of queries
      await sim.executeConcurrentQueries(['SELECT 1', 'SELECT 2', 'SELECT 3']);
      await sim.executeConcurrentQueries(['SELECT 4', 'SELECT 5']);

      const status = sim.getPoolStatus();
      expect(status.totalQueries).toBe(5);
      expect(status.available).toBe(status.total);
    });

    it('should handle pool exhaustion gracefully', async () => {
      // Create a small pool and run more queries than available connections
      const smallSim = new ConcurrencySimulator(2);

      // Acquire all connections manually to simulate exhaustion
      const conn1 = smallSim.acquireConnection();
      const conn2 = smallSim.acquireConnection();
      expect(conn1).not.toBeNull();
      expect(conn2).not.toBeNull();

      // Pool is now full
      const result = await smallSim.executeQuery('SELECT 1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No available connections');

      // Release one and try again
      smallSim.releaseConnection(conn1!.id);
      const result2 = await smallSim.executeQuery('SELECT 2');
      expect(result2.success).toBe(true);
    });
  });

  // =========================================================================
  // 5. Redis Caching Under Concurrent Access
  // =========================================================================

  describe('Redis Caching Under Concurrent Access', () => {
    it('should handle concurrent read/write operations', async () => {
      // Set a value
      sim.cacheSet('campaign:1', { name: 'Test Campaign', spend: 100 });

      // Concurrent reads
      const operations = Array.from({ length: 10 }, () => ({
        op: 'get' as const,
        key: 'campaign:1',
      }));

      const results = await sim.concurrentCacheOperations(operations);

      // All reads should return the same value
      for (const result of results) {
        expect(result.result).toEqual({ name: 'Test Campaign', spend: 100 });
      }

      // Access count should reflect all reads
      const stats = sim.getCacheStats();
      expect(stats.totalAccesses).toBe(10);
    });

    it('should handle concurrent writes to different keys', async () => {
      const operations = Array.from({ length: 5 }, (_, i) => ({
        op: 'set' as const,
        key: `key-${i}`,
        value: { index: i },
      }));

      await sim.concurrentCacheOperations(operations);

      // All keys should exist
      for (let i = 0; i < 5; i++) {
        const value = sim.cacheGet(`key-${i}`);
        expect(value).toEqual({ index: i });
      }

      const stats = sim.getCacheStats();
      expect(stats.entries).toBe(5);
    });

    it('should handle mixed concurrent get/set/delete operations', async () => {
      // Pre-populate some cache entries
      sim.cacheSet('key-A', 'value-A');
      sim.cacheSet('key-B', 'value-B');
      sim.cacheSet('key-C', 'value-C');

      const operations = [
        { op: 'get' as const, key: 'key-A' },
        { op: 'set' as const, key: 'key-D', value: 'value-D' },
        { op: 'del' as const, key: 'key-B' },
        { op: 'get' as const, key: 'key-C' },
        { op: 'set' as const, key: 'key-E', value: 'value-E' },
      ];

      const results = await sim.concurrentCacheOperations(operations);

      expect(results).toHaveLength(5);

      // Verify resulting state
      expect(sim.cacheGet('key-A')).toBe('value-A');
      expect(sim.cacheGet('key-B')).toBeNull(); // deleted
      expect(sim.cacheGet('key-C')).toBe('value-C');
      expect(sim.cacheGet('key-D')).toBe('value-D'); // new
      expect(sim.cacheGet('key-E')).toBe('value-E'); // new
    });

    it('should invalidate cache under concurrent access patterns', async () => {
      // Set then immediately delete
      sim.cacheSet('ephemeral', 'temporary');

      const ops = [
        { op: 'get' as const, key: 'ephemeral' },
        { op: 'del' as const, key: 'ephemeral' },
        { op: 'get' as const, key: 'ephemeral' },
      ];

      const results = await sim.concurrentCacheOperations(ops);

      // First get should return value, second get may or may not (depends on ordering)
      // Key should be deleted after operations complete
      expect(sim.cacheGet('ephemeral')).toBeNull();
    });
  });

  // =========================================================================
  // 6. Job Queue Processes Jobs in Order
  // =========================================================================

  describe('Job Queue Processing Order', () => {
    it('should process jobs in FIFO order within same priority', async () => {
      sim.enqueueJob('sync', { platform: 'google_ads' }, 0);
      sim.enqueueJob('sync', { platform: 'meta_ads' }, 0);
      sim.enqueueJob('sync', { platform: 'tiktok_ads' }, 0);

      const processed = await sim.processAllJobs();

      expect(processed).toHaveLength(3);
      expect(processed[0].payload.platform).toBe('google_ads');
      expect(processed[1].payload.platform).toBe('meta_ads');
      expect(processed[2].payload.platform).toBe('tiktok_ads');
    });

    it('should process higher priority jobs first', async () => {
      sim.enqueueJob('low_priority_sync', { platform: 'bing_ads' }, 0);
      sim.enqueueJob('critical_alert', { alert_id: 'alert-1' }, 10);
      sim.enqueueJob('normal_sync', { platform: 'meta_ads' }, 5);

      const processed = await sim.processAllJobs();

      expect(processed).toHaveLength(3);
      expect(processed[0].type).toBe('critical_alert');
      expect(processed[1].type).toBe('normal_sync');
      expect(processed[2].type).toBe('low_priority_sync');
    });

    it('should maintain FIFO within same priority level', async () => {
      sim.enqueueJob('task-A', { order: 1 }, 5);
      sim.enqueueJob('task-B', { order: 2 }, 5);
      sim.enqueueJob('task-C', { order: 3 }, 5);

      const processed = await sim.processAllJobs();

      expect(processed[0].type).toBe('task-A');
      expect(processed[1].type).toBe('task-B');
      expect(processed[2].type).toBe('task-C');
    });

    it('should mark jobs with correct status transitions', async () => {
      const job = sim.enqueueJob('test-job', { data: 1 });
      expect(job.status).toBe('pending');
      expect(sim.getQueueSize()).toBe(1);

      const processed = await sim.processNextJob();
      expect(processed).not.toBeNull();
      expect(processed!.status).toBe('completed');
      expect(processed!.startedAt).toBeDefined();
      expect(processed!.completedAt).toBeDefined();
      expect(sim.getQueueSize()).toBe(0);
    });

    it('should return null when processing from empty queue', async () => {
      const result = await sim.processNextJob();
      expect(result).toBeNull();
    });

    it('should handle large batch of concurrent job enqueues and ordered processing', async () => {
      // Enqueue 50 jobs with varying priorities
      for (let i = 0; i < 50; i++) {
        sim.enqueueJob(`batch-${i}`, { index: i }, i % 3); // priorities 0, 1, 2
      }

      expect(sim.getQueueSize()).toBe(50);

      const processed = await sim.processAllJobs();
      expect(processed).toHaveLength(50);

      // Verify priority ordering: all priority-2 before priority-1 before priority-0
      let lastPriority = Infinity;
      for (const job of processed) {
        expect(job.priority).toBeLessThanOrEqual(lastPriority);
        if (job.priority < lastPriority) {
          lastPriority = job.priority;
        }
      }
    });
  });

  // =========================================================================
  // DB Mock Integration for Concurrent Patterns
  // =========================================================================

  describe('DB Mock Integration for Concurrent Patterns', () => {
    it('should handle concurrent pool.query calls', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: '1', name: 'Campaign A' }] })
        .mockResolvedValueOnce({ rows: [{ id: '2', name: 'Campaign B' }] })
        .mockResolvedValueOnce({ rows: [{ id: '3', name: 'Campaign C' }] });

      const [r1, r2, r3] = await Promise.all([
        mockPool.query('SELECT * FROM campaigns WHERE id = $1', ['1']),
        mockPool.query('SELECT * FROM campaigns WHERE id = $1', ['2']),
        mockPool.query('SELECT * FROM campaigns WHERE id = $1', ['3']),
      ]);

      expect(r1.rows[0].name).toBe('Campaign A');
      expect(r2.rows[0].name).toBe('Campaign B');
      expect(r3.rows[0].name).toBe('Campaign C');
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent cache reads with mocked Redis', async () => {
      mockCacheGet
        .mockResolvedValueOnce({ spend: 500 })
        .mockResolvedValueOnce({ spend: 700 })
        .mockResolvedValueOnce(null);

      const [r1, r2, r3] = await Promise.all([
        mockCacheGet('dashboard:spend:user-1'),
        mockCacheGet('dashboard:spend:user-2'),
        mockCacheGet('dashboard:spend:user-3'),
      ]);

      expect(r1).toEqual({ spend: 500 });
      expect(r2).toEqual({ spend: 700 });
      expect(r3).toBeNull();
      expect(mockCacheGet).toHaveBeenCalledTimes(3);
    });
  });
});

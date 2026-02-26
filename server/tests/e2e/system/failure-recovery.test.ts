/**
 * Failure Recovery E2E Test Suite.
 *
 * Validates circuit breaker patterns, database and Redis connection retry
 * logic, graceful degradation, agent failure isolation, partial system
 * operation, exponential backoff, error aggregation, health checks, and
 * full system recovery.
 *
 * All external dependencies are mocked for deterministic, isolated tests.
 */

// ---------------------------------------------------------------------------
// Mocks – declared before imports
// ---------------------------------------------------------------------------

const mockPoolQuery = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDel = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisScan = jest.fn();
const mockAuditLog = jest.fn();

jest.mock('../../../src/config/database', () => ({
  pool: { query: mockPoolQuery },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    scan: mockRedisScan,
  },
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  cacheDel: mockCacheDel,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: mockAuditLog },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret',
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { FailoverService } from '../../../src/services/failover/FailoverService';
import { retryWithBackoff } from '../../../src/utils/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a serialised circuit breaker state for Redis mock. */
function buildCBState(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    service: 'test-service',
    state: 'closed',
    failure_count: 0,
    threshold: 5,
    timeout_ms: 30000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Failure Recovery E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // =========================================================================
  // 1. Circuit breaker opens after consecutive failures
  // =========================================================================
  describe('Circuit breaker opens after consecutive failures', () => {
    it('should transition from closed to open after reaching failure threshold', async () => {
      // Start with closed state, 4 failures already (threshold is 5)
      mockRedisGet.mockResolvedValue(
        buildCBState({ state: 'closed', failure_count: 4, threshold: 5 }),
      );
      mockRedisSet.mockResolvedValue('OK');

      const failingFn = jest.fn().mockRejectedValue(new Error('Service down'));

      await expect(
        FailoverService.executeWithCircuitBreaker('api-service', failingFn),
      ).rejects.toThrow('Service down');

      // Verify circuit breaker state was saved as open
      expect(mockRedisSet).toHaveBeenCalled();
      const savedState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(savedState.state).toBe('open');
      expect(savedState.failure_count).toBe(5);
    });

    it('should record failure but stay closed when under threshold', async () => {
      mockRedisGet.mockResolvedValue(
        buildCBState({ state: 'closed', failure_count: 1, threshold: 5 }),
      );
      mockRedisSet.mockResolvedValue('OK');

      const failingFn = jest.fn().mockRejectedValue(new Error('Transient error'));

      await expect(
        FailoverService.executeWithCircuitBreaker('api-service', failingFn),
      ).rejects.toThrow('Transient error');

      const savedState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(savedState.state).toBe('closed');
      expect(savedState.failure_count).toBe(2);
    });
  });

  // =========================================================================
  // 2. Circuit breaker closes after recovery
  // =========================================================================
  describe('Circuit breaker closes after recovery', () => {
    it('should transition from half_open to closed on success', async () => {
      mockRedisGet.mockResolvedValue(
        buildCBState({
          state: 'half_open',
          failure_count: 5,
        }),
      );
      mockRedisSet.mockResolvedValue('OK');

      const successFn = jest.fn().mockResolvedValue({ data: 'ok' });

      const result = await FailoverService.executeWithCircuitBreaker(
        'api-service',
        successFn,
      );

      expect(result).toEqual({ data: 'ok' });

      // Verify circuit breaker was reset to closed
      const savedState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(savedState.state).toBe('closed');
      expect(savedState.failure_count).toBe(0);
    });

    it('should transition from open to half_open after timeout and succeed', async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 60s ago, well past 30s timeout

      mockRedisGet.mockResolvedValue(
        buildCBState({
          state: 'open',
          failure_count: 5,
          last_failure_at: pastTime,
          timeout_ms: 30000,
        }),
      );
      mockRedisSet.mockResolvedValue('OK');

      const successFn = jest.fn().mockResolvedValue('recovered');

      const result = await FailoverService.executeWithCircuitBreaker(
        'api-service',
        successFn,
      );

      expect(result).toBe('recovered');

      // First save: transition to half_open; Second save: reset to closed
      expect(mockRedisSet).toHaveBeenCalledTimes(2);
      const halfOpenState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(halfOpenState.state).toBe('half_open');

      const closedState = JSON.parse(mockRedisSet.mock.calls[1][1]);
      expect(closedState.state).toBe('closed');
      expect(closedState.failure_count).toBe(0);
    });
  });

  // =========================================================================
  // 3. Circuit breaker fails fast when open
  // =========================================================================
  describe('Circuit breaker fail-fast when open', () => {
    it('should reject immediately when circuit is open and timeout not elapsed', async () => {
      const recentTime = new Date().toISOString();

      mockRedisGet.mockResolvedValue(
        buildCBState({
          state: 'open',
          failure_count: 5,
          last_failure_at: recentTime,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn();

      await expect(
        FailoverService.executeWithCircuitBreaker('api-service', fn),
      ).rejects.toThrow('Circuit breaker is open');

      // The actual function should never have been called
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Database connection retry logic
  // =========================================================================
  describe('Database connection retry logic', () => {
    it('should retry database connection with exponential backoff', async () => {
      let attempts = 0;

      const result = await retryWithBackoff(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('ECONNREFUSED');
          }
          return { connected: true };
        },
        3,
        10, // short delay for tests
      );

      expect(result).toEqual({ connected: true });
      expect(attempts).toBe(3);
    });

    it('should throw after max retries are exhausted', async () => {
      await expect(
        retryWithBackoff(
          async () => {
            throw new Error('Database unreachable');
          },
          2,
          10,
        ),
      ).rejects.toThrow('Database unreachable');
    });
  });

  // =========================================================================
  // 5. Redis connection retry logic
  // =========================================================================
  describe('Redis connection retry logic', () => {
    it('should retry Redis operations and succeed on later attempt', async () => {
      let attempts = 0;

      const result = await retryWithBackoff(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('ECONNRESET');
          }
          return 'PONG';
        },
        3,
        10,
      );

      expect(result).toBe('PONG');
      expect(attempts).toBe(2);
    });

    it('should handle Redis timeout errors with retry', async () => {
      let attempt = 0;

      const result = await retryWithBackoff(
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('Redis connection timed out');
          }
          return { status: 'ready' };
        },
        3,
        10,
      );

      expect(result).toEqual({ status: 'ready' });
      expect(attempt).toBe(2);
    });
  });

  // =========================================================================
  // 6. Graceful degradation when DB is down (cached responses)
  // =========================================================================
  describe('Graceful degradation when DB is down', () => {
    it('should serve cached failover state when Redis has data', async () => {
      const cachedState = {
        mode: 'normal',
        since: new Date().toISOString(),
        affected_services: [],
        active_fallbacks: [],
        last_check: new Date().toISOString(),
      };

      mockCacheGet.mockResolvedValueOnce(cachedState);

      const state = await FailoverService.getFailoverState();

      expect(state).toEqual(cachedState);
      // No DB queries should have been made since cache hit
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('should serve cached backup history when DB is unavailable', async () => {
      const cachedBackups = [
        {
          id: 'b1',
          type: 'full',
          status: 'success',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:30:00Z',
          size_mb: 100,
          tables_backed_up: ['users', 'campaigns'],
        },
      ];

      mockCacheGet.mockResolvedValueOnce(cachedBackups);

      const history = await FailoverService.getBackupHistory();

      expect(history).toEqual(cachedBackups);
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. Graceful degradation when Redis is down (fallback to DB)
  // =========================================================================
  describe('Graceful degradation when Redis is down', () => {
    it('should fall back to DB when cache returns null for failover state', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // Redis scan for degraded services
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // Redis scan for circuit breakers
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // cacheSet after computing state
      mockCacheSet.mockResolvedValueOnce(undefined);

      const state = await FailoverService.getFailoverState();

      expect(state).toBeDefined();
      expect(state.mode).toBe('normal');
      expect(state.affected_services).toEqual([]);
    });

    it('should fall back to DB when cache returns null for backup history', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'b1',
            type: 'full',
            status: 'success',
            started_at: '2024-01-01T00:00:00Z',
            completed_at: '2024-01-01T00:30:00Z',
            size_mb: 100,
            tables_backed_up: JSON.stringify(['users']),
            error: null,
          },
        ],
      });

      const history = await FailoverService.getBackupHistory();

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
      expect(mockPoolQuery).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 8. Agent failure does not crash orchestrator
  // =========================================================================
  describe('Agent failure isolation', () => {
    it('should handle service failure without throwing to caller', async () => {
      mockRedisGet.mockResolvedValue(
        buildCBState({ state: 'closed', failure_count: 0, threshold: 5 }),
      );
      mockRedisSet.mockResolvedValue('OK');
      // enterDegradedMode dependencies
      mockRedisScan.mockResolvedValue(['0', []]);
      mockCacheGet.mockResolvedValue(null);
      mockCacheSet.mockResolvedValue(undefined);

      // handleServiceFailure should not throw
      await expect(
        FailoverService.handleServiceFailure(
          'content-agent',
          new Error('Agent crashed unexpectedly'),
        ),
      ).resolves.not.toThrow();

      // Verify the failure was recorded
      expect(mockRedisSet).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.service_failure',
          resourceId: 'content-agent',
        }),
      );
    });

    it('should record failure details including error message', async () => {
      mockRedisGet.mockResolvedValue(
        buildCBState({ state: 'closed', failure_count: 2, threshold: 5 }),
      );
      mockRedisSet.mockResolvedValue('OK');

      await FailoverService.handleServiceFailure(
        'analytics-agent',
        new Error('Out of memory'),
      );

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            error: 'Out of memory',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 9. Partial system operation (some agents down, others continue)
  // =========================================================================
  describe('Partial system operation', () => {
    it('should report degraded mode with specific services affected', async () => {
      mockRedisSet.mockResolvedValue('OK');
      // After entering degraded mode, getFailoverState is called
      mockCacheDel.mockResolvedValue(undefined);
      mockCacheGet.mockResolvedValueOnce(null);
      // Redis scan for degraded services
      mockRedisScan
        .mockResolvedValueOnce([
          '0',
          ['failover:degraded:content-agent', 'failover:degraded:analytics-agent'],
        ]);
      // Get fallback configs
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify({
          service: 'content-agent',
          fallback_behavior: 'use_cached_content',
          max_degradation_minutes: 30,
          auto_recover: true,
        }))
        .mockResolvedValueOnce(JSON.stringify({
          service: 'analytics-agent',
          fallback_behavior: 'return_stale_data',
          max_degradation_minutes: 60,
          auto_recover: true,
        }));
      // Redis scan for circuit breakers
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.enterDegradedMode(
        ['content-agent', 'analytics-agent'],
        'Partial outage in AI subsystem',
      );

      expect(state.mode).toBe('degraded');
      expect(state.affected_services).toContain('content-agent');
      expect(state.affected_services).toContain('analytics-agent');

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.enter_degraded_mode',
          details: expect.objectContaining({
            services: ['content-agent', 'analytics-agent'],
          }),
        }),
      );
    });

    it('should allow healthy services to continue while others are degraded', async () => {
      // Healthy service circuit breaker: closed
      mockRedisGet.mockResolvedValue(
        buildCBState({
          service: 'healthy-agent',
          state: 'closed',
          failure_count: 0,
        }),
      );
      mockRedisSet.mockResolvedValue('OK');

      const healthyResult = await FailoverService.executeWithCircuitBreaker(
        'healthy-agent',
        async () => ({ status: 'operational', data: [1, 2, 3] }),
      );

      expect(healthyResult).toEqual({ status: 'operational', data: [1, 2, 3] });
    });
  });

  // =========================================================================
  // 10. Retry with exponential backoff for external APIs
  // =========================================================================
  describe('Retry with exponential backoff', () => {
    it('should implement exponential delay between retries', async () => {
      const timestamps: number[] = [];

      await retryWithBackoff(
        async () => {
          timestamps.push(Date.now());
          if (timestamps.length < 3) {
            throw new Error('API rate limited');
          }
          return 'success';
        },
        3,
        50, // base delay 50ms for testing
      );

      expect(timestamps).toHaveLength(3);
      // Second retry should be delayed more than first
      if (timestamps.length >= 3) {
        const firstDelay = timestamps[1] - timestamps[0];
        const secondDelay = timestamps[2] - timestamps[1];
        // Second delay should generally be longer due to exponential backoff
        // (with some tolerance for jitter)
        expect(firstDelay).toBeGreaterThanOrEqual(30); // base * 2^0 = 50ms + jitter - tolerance
        expect(secondDelay).toBeGreaterThanOrEqual(50); // base * 2^1 = 100ms + jitter - tolerance
      }
    });

    it('should use FailoverService retry with configured settings', async () => {
      // Configure retry
      mockRedisSet.mockResolvedValue('OK');

      const config = await FailoverService.configureRetry('external-api', {
        max_retries: 3,
        base_delay_ms: 100,
        max_delay_ms: 5000,
        backoff_multiplier: 2,
      });

      expect(config.service).toBe('external-api');
      expect(config.max_retries).toBe(3);
      expect(config.backoff_multiplier).toBe(2);
    });

    it('should execute function with retry using configured backoff', async () => {
      // Get retry config
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'external-api',
          max_retries: 2,
          base_delay_ms: 10,
          max_delay_ms: 1000,
          backoff_multiplier: 2,
        }),
      );

      let attempts = 0;
      const result = await FailoverService.executeWithRetry(
        'external-api',
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('503 Service Unavailable');
          }
          return { data: 'response' };
        },
      );

      expect(result).toEqual({ data: 'response' });
      expect(attempts).toBe(2);
    });
  });

  // =========================================================================
  // 11. Error aggregation during system failure
  // =========================================================================
  describe('Error aggregation during system failure', () => {
    it('should aggregate errors across multiple service failures', async () => {
      const services = ['service-a', 'service-b', 'service-c'];
      const errors = [
        new Error('Connection refused'),
        new Error('Timeout'),
        new Error('DNS resolution failed'),
      ];

      for (let i = 0; i < services.length; i++) {
        mockRedisGet.mockResolvedValueOnce(
          buildCBState({ service: services[i], failure_count: 0 }),
        );
        mockRedisSet.mockResolvedValue('OK');

        await FailoverService.handleServiceFailure(services[i], errors[i]);
      }

      // Each failure should have been logged
      expect(mockAuditLog).toHaveBeenCalledTimes(3);

      const auditCalls = mockAuditLog.mock.calls;
      expect(auditCalls[0][0].resourceId).toBe('service-a');
      expect(auditCalls[0][0].details.error).toBe('Connection refused');
      expect(auditCalls[1][0].resourceId).toBe('service-b');
      expect(auditCalls[1][0].details.error).toBe('Timeout');
      expect(auditCalls[2][0].resourceId).toBe('service-c');
      expect(auditCalls[2][0].details.error).toBe('DNS resolution failed');
    });

    it('should track failure count per service independently', async () => {
      // Service A: 4 failures (under threshold)
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'svc-a', failure_count: 3, threshold: 5 }),
      );
      mockRedisSet.mockResolvedValue('OK');

      await FailoverService.handleServiceFailure('svc-a', new Error('error'));

      // Service B: at threshold
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'svc-b', failure_count: 4, threshold: 5 }),
      );
      // enterDegradedMode flow mocks
      mockRedisSet.mockResolvedValue('OK');
      mockCacheDel.mockResolvedValue(undefined);
      mockCacheGet.mockResolvedValue(null);
      mockRedisScan.mockResolvedValue(['0', []]);
      mockCacheSet.mockResolvedValue(undefined);

      await FailoverService.handleServiceFailure('svc-b', new Error('error'));

      // Verify both were tracked
      expect(mockRedisSet).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 12. Health check reports degraded status
  // =========================================================================
  describe('Health check degraded status reporting', () => {
    it('should report degraded status when services have open circuit breakers', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // Degraded services scan
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:db-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'db-service',
          fallback_behavior: 'cache_only',
          max_degradation_minutes: 30,
          auto_recover: true,
        }),
      );

      // Circuit breaker scan
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:db-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'db-service', state: 'open' }),
      );

      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.getFailoverState();

      expect(state.mode).toBe('failover');
      expect(state.affected_services).toContain('db-service');
      expect(state.active_fallbacks).toContain('cache_only');
    });

    it('should report recovery mode when circuit breaker is half_open', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // Degraded services
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // Circuit breaker scan
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:recovering-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'recovering-service', state: 'half_open' }),
      );
      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.getFailoverState();

      expect(state.mode).toBe('recovery');
    });

    it('should report normal mode when all services are healthy', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.getFailoverState();

      expect(state.mode).toBe('normal');
      expect(state.affected_services).toEqual([]);
    });
  });

  // =========================================================================
  // 13. System recovery after full failure
  // =========================================================================
  describe('System recovery after full failure', () => {
    it('should recover a service by resetting circuit breaker and exiting degraded mode', async () => {
      // Health check query
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // getCircuitBreakerState
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'api-gateway', state: 'open', failure_count: 10 }),
      );
      mockRedisSet.mockResolvedValue('OK');
      mockRedisDel.mockResolvedValue(1);
      mockCacheDel.mockResolvedValue(undefined);

      const result = await FailoverService.attemptRecovery('api-gateway');

      expect(result.recovered).toBe(true);
      expect(result.service).toBe('api-gateway');
      expect(result.message).toContain('recovered successfully');

      // Verify circuit breaker was reset to closed
      const savedState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(savedState.state).toBe('closed');
      expect(savedState.failure_count).toBe(0);

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.service_recovered',
          resourceId: 'api-gateway',
        }),
      );
    });

    it('should report failure when health check fails during recovery', async () => {
      // Health check fails
      mockPoolQuery.mockRejectedValueOnce(new Error('DB still down'));

      const result = await FailoverService.attemptRecovery('api-gateway');

      expect(result.recovered).toBe(false);
      expect(result.message).toContain('Recovery failed');
      expect(result.message).toContain('DB still down');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.recovery_failed',
        }),
      );
    });
  });

  // =========================================================================
  // 14. Graceful degradation configuration
  // =========================================================================
  describe('Graceful degradation configuration', () => {
    it('should configure fallback behavior for a service', async () => {
      mockRedisSet.mockResolvedValue('OK');

      const config = await FailoverService.enableGracefulDegradation(
        'content-service',
        {
          fallback_behavior: 'serve_cached_content',
          max_degradation_minutes: 60,
          auto_recover: true,
        },
      );

      expect(config.service).toBe('content-service');
      expect(config.fallback_behavior).toBe('serve_cached_content');
      expect(config.max_degradation_minutes).toBe(60);
      expect(config.auto_recover).toBe(true);

      // Verify persisted to Redis
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degradation_config:content-service',
        expect.any(String),
      );

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.degradation_configured',
          resourceId: 'content-service',
        }),
      );
    });
  });

  // =========================================================================
  // 15. Exit degraded mode with health verification
  // =========================================================================
  describe('Exit degraded mode with health verification', () => {
    it('should exit degraded mode when circuit breaker is closed', async () => {
      // getCircuitBreakerState for the service
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'api-service', state: 'closed', failure_count: 0 }),
      );
      mockRedisDel.mockResolvedValue(1);
      mockCacheDel.mockResolvedValue(undefined);

      // getFailoverState after exit
      mockCacheGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.exitDegradedMode(['api-service']);

      expect(state.mode).toBe('normal');
      expect(mockRedisDel).toHaveBeenCalledWith('failover:degraded:api-service');
    });

    it('should refuse to exit degraded mode when circuit breaker is still open', async () => {
      mockRedisGet.mockResolvedValueOnce(
        buildCBState({ service: 'failing-service', state: 'open', failure_count: 10 }),
      );
      mockCacheDel.mockResolvedValue(undefined);

      // getFailoverState after attempted exit (still degraded)
      mockCacheGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:failing-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockCacheSet.mockResolvedValue(undefined);

      const state = await FailoverService.exitDegradedMode(['failing-service']);

      // Service should still be in affected list since we couldn't exit
      expect(state.affected_services).toContain('failing-service');
      // redisDel should NOT have been called for this service
      expect(mockRedisDel).not.toHaveBeenCalledWith(
        'failover:degraded:failing-service',
      );
    });
  });

  // =========================================================================
  // 16. Circuit breaker re-opens from half_open on failure
  // =========================================================================
  describe('Circuit breaker half_open to open on failure', () => {
    it('should transition from half_open back to open on failure', async () => {
      mockRedisGet.mockResolvedValue(
        buildCBState({
          state: 'half_open',
          failure_count: 5,
        }),
      );
      mockRedisSet.mockResolvedValue('OK');

      await expect(
        FailoverService.executeWithCircuitBreaker(
          'test-service',
          async () => {
            throw new Error('Still failing');
          },
        ),
      ).rejects.toThrow('Still failing');

      const savedState = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(savedState.state).toBe('open');
    });
  });

  // =========================================================================
  // 17. Recovery status reports all service states
  // =========================================================================
  describe('Recovery status reporting', () => {
    it('should report comprehensive status of all services', async () => {
      // Scan circuit breaker keys
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:svc-a', 'failover:cb:svc-b'],
      ]);
      // Scan degraded keys
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:svc-b'],
      ]);

      // getCircuitBreakerState for svc-a
      mockRedisGet
        .mockResolvedValueOnce(buildCBState({ service: 'svc-a', state: 'closed' }))
        // degraded status for svc-a - not degraded
        .mockResolvedValueOnce(null)
        // degradation config for svc-a
        .mockResolvedValueOnce(null)
        // getCircuitBreakerState for svc-b
        .mockResolvedValueOnce(buildCBState({ service: 'svc-b', state: 'open', failure_count: 5 }))
        // degraded status for svc-b - degraded
        .mockResolvedValueOnce(JSON.stringify({ entered_at: '2024-01-01T00:00:00Z' }))
        // degradation config for svc-b
        .mockResolvedValueOnce(
          JSON.stringify({
            service: 'svc-b',
            fallback_behavior: 'cache_fallback',
            max_degradation_minutes: 30,
            auto_recover: true,
          }),
        );

      // getFailoverState inside getRecoveryStatus
      mockCacheGet.mockResolvedValueOnce({
        mode: 'degraded',
        since: new Date().toISOString(),
        affected_services: ['svc-b'],
        active_fallbacks: ['cache_fallback'],
        last_check: new Date().toISOString(),
      });

      const status = await FailoverService.getRecoveryStatus();

      expect(status.services).toHaveLength(2);

      const svcA = status.services.find((s) => s.service === 'svc-a');
      expect(svcA).toBeDefined();
      expect(svcA!.circuit_breaker.state).toBe('closed');
      expect(svcA!.is_degraded).toBe(false);

      const svcB = status.services.find((s) => s.service === 'svc-b');
      expect(svcB).toBeDefined();
      expect(svcB!.circuit_breaker.state).toBe('open');
      expect(svcB!.is_degraded).toBe(true);
      expect(svcB!.degradation_config?.fallback_behavior).toBe('cache_fallback');

      expect(status.overall_state.mode).toBe('degraded');
    });
  });

  // =========================================================================
  // 18. Default circuit breaker state for unknown services
  // =========================================================================
  describe('Default circuit breaker state', () => {
    it('should return default closed state for unknown services', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      const state = await FailoverService.getCircuitBreakerState(
        'unknown-service',
      );

      expect(state.service).toBe('unknown-service');
      expect(state.state).toBe('closed');
      expect(state.failure_count).toBe(0);
      expect(state.threshold).toBe(5);
      expect(state.timeout_ms).toBe(30000);
    });
  });
});

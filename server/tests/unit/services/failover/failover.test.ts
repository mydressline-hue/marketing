/**
 * Unit tests for FailoverService.
 *
 * All external dependencies (database pool, Redis, logger, helpers,
 * AuditService) are fully mocked so tests exercise only the service
 * logic: state management, circuit breaker transitions, retry logic,
 * backup/restore orchestration, and recovery flows.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
  },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('generated-uuid'),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { FailoverService } from '../../../../src/services/failover/FailoverService';
import { pool } from '../../../../src/config/database';
import { redis, cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { logger } from '../../../../src/utils/logger';
import { generateId } from '../../../../src/utils/helpers';
import { AuditService } from '../../../../src/services/audit.service';

import type {
  FailoverState,
  CircuitBreakerState,
  BackupResult,
} from '../../../../src/services/failover/FailoverService';

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;
const mockRedisDel = redis.del as jest.Mock;
const mockRedisScan = redis.scan as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockLoggerInfo = (logger as unknown as Record<string, jest.Mock>).info;
const mockLoggerWarn = (logger as unknown as Record<string, jest.Mock>).warn;
const mockLoggerError = (logger as unknown as Record<string, jest.Mock>).error;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Setup redis.scan to return an empty result (no keys found).
 * Handles the cursor-based scanning loop.
 */
function mockEmptyScan(): void {
  mockRedisScan.mockResolvedValue(['0', []]);
}

/**
 * Setup redis.scan to return specific keys for a single iteration.
 */
function mockScanWithKeys(keys: string[]): void {
  mockRedisScan.mockResolvedValueOnce(['0', keys]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FailoverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    mockAuditLog.mockResolvedValue(undefined);
    mockGenerateId.mockReturnValue('generated-uuid');
  });

  // -----------------------------------------------------------------------
  // getFailoverState
  // -----------------------------------------------------------------------

  describe('getFailoverState', () => {
    it('returns cached state when available', async () => {
      const cachedState: FailoverState = {
        mode: 'normal',
        since: '2026-01-01T00:00:00.000Z',
        affected_services: [],
        active_fallbacks: [],
        last_check: '2026-01-01T00:00:00.000Z',
      };
      mockCacheGet.mockResolvedValueOnce(cachedState);

      const result = await FailoverService.getFailoverState();

      expect(result).toEqual(cachedState);
      expect(mockRedisScan).not.toHaveBeenCalled();
    });

    it('returns normal mode when no degraded services or open circuit breakers exist', async () => {
      // First scan for degraded keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // Second scan for circuit breaker keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      const result = await FailoverService.getFailoverState();

      expect(result.mode).toBe('normal');
      expect(result.affected_services).toEqual([]);
      expect(result.active_fallbacks).toEqual([]);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'failover:state',
        expect.objectContaining({ mode: 'normal' }),
        30,
      );
    });

    it('returns degraded mode when degraded services exist', async () => {
      // Scan for degraded keys: found one
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:payment-service'],
      ]);
      // Fallback config lookup
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'payment-service',
          fallback_behavior: 'use_cached_prices',
          max_degradation_minutes: 30,
          auto_recover: true,
        }),
      );
      // Scan for CB keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      const result = await FailoverService.getFailoverState();

      expect(result.mode).toBe('degraded');
      expect(result.affected_services).toContain('payment-service');
      expect(result.active_fallbacks).toContain('use_cached_prices');
    });

    it('returns failover mode when a circuit breaker is open', async () => {
      // Scan for degraded keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // Scan for CB keys: found one
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:api-gateway'],
      ]);
      // CB state lookup
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'api-gateway',
          state: 'open',
          failure_count: 10,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const result = await FailoverService.getFailoverState();

      expect(result.mode).toBe('failover');
    });

    it('returns recovery mode when a circuit breaker is half_open', async () => {
      // Scan for degraded keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      // Scan for CB keys: found one
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:api-gateway'],
      ]);
      // CB state lookup
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'api-gateway',
          state: 'half_open',
          failure_count: 5,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const result = await FailoverService.getFailoverState();

      expect(result.mode).toBe('recovery');
    });
  });

  // -----------------------------------------------------------------------
  // enterDegradedMode
  // -----------------------------------------------------------------------

  describe('enterDegradedMode', () => {
    it('sets degraded state in Redis for each service', async () => {
      // After entering degraded mode, getFailoverState will be called
      // Scan for degraded: returns the newly added service
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:search-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(null);
      // Scan for CB keys: none
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      await FailoverService.enterDegradedMode(
        ['search-service'],
        'High latency detected',
      );

      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degraded:search-service',
        expect.stringContaining('High latency detected'),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.enter_degraded_mode',
          details: expect.objectContaining({
            services: ['search-service'],
            reason: 'High latency detected',
          }),
        }),
      );
    });

    it('handles multiple services simultaneously', async () => {
      // After entering degraded mode, getFailoverState is called
      mockRedisScan.mockResolvedValueOnce([
        '0',
        [
          'failover:degraded:service-a',
          'failover:degraded:service-b',
        ],
      ]);
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      await FailoverService.enterDegradedMode(
        ['service-a', 'service-b'],
        'Maintenance window',
      );

      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degraded:service-a',
        expect.any(String),
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degraded:service-b',
        expect.any(String),
      );
      expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // exitDegradedMode
  // -----------------------------------------------------------------------

  describe('exitDegradedMode', () => {
    it('removes degraded state when circuit breaker is closed', async () => {
      // getCircuitBreakerState: return closed
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'search-service',
          state: 'closed',
          failure_count: 0,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );
      // After exit, getFailoverState called
      mockRedisScan.mockResolvedValueOnce(['0', []]);
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      await FailoverService.exitDegradedMode(['search-service']);

      expect(mockRedisDel).toHaveBeenCalledWith(
        'failover:degraded:search-service',
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.exit_degraded_mode',
        }),
      );
    });

    it('refuses to exit degraded mode when circuit breaker is open', async () => {
      // getCircuitBreakerState: return open
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'search-service',
          state: 'open',
          failure_count: 10,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );
      // After exit attempt, getFailoverState called
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:search-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisScan.mockResolvedValueOnce(['0', []]);

      await FailoverService.exitDegradedMode(['search-service']);

      // del should NOT have been called for the degraded key
      expect(mockRedisDel).not.toHaveBeenCalledWith(
        'failover:degraded:search-service',
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Cannot exit degraded mode: circuit breaker is open',
        expect.objectContaining({ service: 'search-service' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // initiateBackup
  // -----------------------------------------------------------------------

  describe('initiateBackup', () => {
    it('performs a full backup recording all tables', async () => {
      // Get all tables
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: 'users' },
          { table_name: 'campaigns' },
        ],
      });
      // INSERT backup record
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Size query for 'users'
      mockQuery.mockResolvedValueOnce({
        rows: [{ size_bytes: 1048576 }],
      });
      // Size query for 'campaigns'
      mockQuery.mockResolvedValueOnce({
        rows: [{ size_bytes: 2097152 }],
      });
      // UPDATE backup to success
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await FailoverService.initiateBackup('full');

      expect(result.id).toBe('generated-uuid');
      expect(result.type).toBe('full');
      expect(result.status).toBe('success');
      expect(result.tables_backed_up).toEqual(['users', 'campaigns']);
      expect(result.size_mb).toBeGreaterThan(0);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.backup_initiated',
          resourceType: 'backup',
        }),
      );
    });

    it('performs an incremental backup with specified tables', async () => {
      // INSERT backup record
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Size query for 'campaigns'
      mockQuery.mockResolvedValueOnce({
        rows: [{ size_bytes: 524288 }],
      });
      // UPDATE backup to success
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await FailoverService.initiateBackup('incremental', [
        'campaigns',
      ]);

      expect(result.type).toBe('incremental');
      expect(result.tables_backed_up).toEqual(['campaigns']);
      expect(result.status).toBe('success');
    });

    it('marks backup as failed when an error occurs during size calculation', async () => {
      // Get all tables
      mockQuery.mockResolvedValueOnce({
        rows: [{ table_name: 'users' }],
      });
      // INSERT backup record
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Size query fails
      mockQuery.mockRejectedValueOnce(new Error('Relation not found'));
      // UPDATE backup to failed
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await FailoverService.initiateBackup('full');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Relation not found');
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Backup failed',
        expect.objectContaining({ error: 'Relation not found' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // restoreFromBackup
  // -----------------------------------------------------------------------

  describe('restoreFromBackup', () => {
    it('restores from a valid successful backup', async () => {
      // Fetch backup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'backup-1',
            status: 'success',
            tables_backed_up: JSON.stringify(['users', 'campaigns']),
          },
        ],
      });
      // INSERT restore record
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE restore to success
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await FailoverService.restoreFromBackup('backup-1');

      expect(result.backup_id).toBe('backup-1');
      expect(result.status).toBe('success');
      expect(result.tables_restored).toEqual(['users', 'campaigns']);
    });

    it('throws when backup does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        FailoverService.restoreFromBackup('nonexistent'),
      ).rejects.toThrow('Backup not found: nonexistent');
    });

    it('throws when backup status is not success', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'backup-2', status: 'failed' }],
      });

      await expect(
        FailoverService.restoreFromBackup('backup-2'),
      ).rejects.toThrow('Cannot restore from backup with status: failed');
    });
  });

  // -----------------------------------------------------------------------
  // getBackupHistory
  // -----------------------------------------------------------------------

  describe('getBackupHistory', () => {
    it('returns cached backup history when available', async () => {
      const cachedHistory: BackupResult[] = [
        {
          id: 'backup-1',
          type: 'full',
          status: 'success',
          started_at: '2026-01-01T00:00:00.000Z',
          completed_at: '2026-01-01T00:05:00.000Z',
          size_mb: 100,
          tables_backed_up: ['users'],
        },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedHistory);

      const result = await FailoverService.getBackupHistory();

      expect(result).toEqual(cachedHistory);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries database and caches when cache is empty', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'backup-1',
            type: 'full',
            status: 'success',
            started_at: '2026-01-01T00:00:00.000Z',
            completed_at: '2026-01-01T00:05:00.000Z',
            size_mb: 100,
            tables_backed_up: JSON.stringify(['users', 'campaigns']),
            error: null,
          },
        ],
      });

      const result = await FailoverService.getBackupHistory();

      expect(result).toHaveLength(1);
      expect(result[0].tables_backed_up).toEqual(['users', 'campaigns']);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'failover:backup_history',
        expect.any(Array),
        300,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Circuit Breaker State
  // -----------------------------------------------------------------------

  describe('getCircuitBreakerState', () => {
    it('returns stored state from Redis', async () => {
      const storedState: CircuitBreakerState = {
        service: 'email-service',
        state: 'open',
        failure_count: 7,
        last_failure_at: '2026-01-01T00:00:00.000Z',
        threshold: 5,
        timeout_ms: 30000,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(storedState));

      const result =
        await FailoverService.getCircuitBreakerState('email-service');

      expect(result).toEqual(storedState);
    });

    it('returns default closed state when no state exists', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      const result =
        await FailoverService.getCircuitBreakerState('new-service');

      expect(result.service).toBe('new-service');
      expect(result.state).toBe('closed');
      expect(result.failure_count).toBe(0);
      expect(result.threshold).toBe(5);
      expect(result.timeout_ms).toBe(30000);
    });
  });

  // -----------------------------------------------------------------------
  // executeWithCircuitBreaker
  // -----------------------------------------------------------------------

  describe('executeWithCircuitBreaker', () => {
    it('executes successfully when circuit is closed', async () => {
      mockRedisGet.mockResolvedValueOnce(null); // Default closed state

      const fn = jest.fn().mockResolvedValue('success');
      const result = await FailoverService.executeWithCircuitBreaker(
        'test-service',
        fn,
      );

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('transitions from closed to open after reaching failure threshold', async () => {
      // CB state: 4 failures (threshold is 5)
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          state: 'closed',
          failure_count: 4,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn().mockRejectedValue(new Error('Service down'));

      await expect(
        FailoverService.executeWithCircuitBreaker('test-service', fn),
      ).rejects.toThrow('Service down');

      // Verify circuit breaker was saved with open state (4 + 1 = 5 >= threshold)
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:test-service',
        expect.stringContaining('"state":"open"'),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.circuit_breaker_opened',
        }),
      );
    });

    it('fails fast when circuit is open and timeout has not elapsed', async () => {
      const recentFailure = new Date().toISOString();
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          state: 'open',
          failure_count: 5,
          last_failure_at: recentFailure,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn();

      await expect(
        FailoverService.executeWithCircuitBreaker('test-service', fn),
      ).rejects.toThrow('Circuit breaker is open for service: test-service');

      // The function should NOT have been called
      expect(fn).not.toHaveBeenCalled();
    });

    it('transitions from open to half_open after timeout elapses', async () => {
      const oldFailure = new Date(Date.now() - 60000).toISOString();
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          state: 'open',
          failure_count: 5,
          last_failure_at: oldFailure,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn().mockResolvedValue('recovered');
      const result = await FailoverService.executeWithCircuitBreaker(
        'test-service',
        fn,
      );

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(1);

      // Should have saved half_open state first, then closed on success
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:test-service',
        expect.stringContaining('"state":"half_open"'),
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:test-service',
        expect.stringContaining('"state":"closed"'),
      );
    });

    it('transitions from half_open back to open on failure', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          state: 'half_open',
          failure_count: 5,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn().mockRejectedValue(new Error('Still failing'));

      await expect(
        FailoverService.executeWithCircuitBreaker('test-service', fn),
      ).rejects.toThrow('Still failing');

      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:test-service',
        expect.stringContaining('"state":"open"'),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Circuit breaker re-opened from half_open',
        expect.any(Object),
      );
    });

    it('transitions from half_open to closed on success', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          state: 'half_open',
          failure_count: 5,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const fn = jest.fn().mockResolvedValue('ok');
      const result = await FailoverService.executeWithCircuitBreaker(
        'test-service',
        fn,
      );

      expect(result).toBe('ok');
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:test-service',
        expect.stringContaining('"state":"closed"'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // configureRetry / executeWithRetry
  // -----------------------------------------------------------------------

  describe('configureRetry', () => {
    it('saves retry configuration to Redis', async () => {
      const config = {
        max_retries: 5,
        base_delay_ms: 500,
        max_delay_ms: 15000,
        backoff_multiplier: 2,
      };

      const result = await FailoverService.configureRetry(
        'email-service',
        config,
      );

      expect(result).toEqual({ service: 'email-service', ...config });
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:retry:email-service',
        expect.stringContaining('"max_retries":5'),
      );
    });
  });

  describe('executeWithRetry', () => {
    it('returns immediately on first success', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          max_retries: 3,
          base_delay_ms: 100,
          max_delay_ms: 5000,
          backoff_multiplier: 2,
        }),
      );

      const fn = jest.fn().mockResolvedValue('immediate-success');
      const result = await FailoverService.executeWithRetry(
        'test-service',
        fn,
      );

      expect(result).toBe('immediate-success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds eventually', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          max_retries: 3,
          base_delay_ms: 10, // Short delay for testing
          max_delay_ms: 100,
          backoff_multiplier: 2,
        }),
      );

      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success-on-third');

      const result = await FailoverService.executeWithRetry(
        'test-service',
        fn,
      );

      expect(result).toBe('success-on-third');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after all retries are exhausted', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'test-service',
          max_retries: 2,
          base_delay_ms: 10,
          max_delay_ms: 100,
          backoff_multiplier: 2,
        }),
      );

      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        FailoverService.executeWithRetry('test-service', fn),
      ).rejects.toThrow('Persistent failure');

      // Initial call + 2 retries = 3 total calls
      expect(fn).toHaveBeenCalledTimes(3);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'All retry attempts exhausted',
        expect.objectContaining({ service: 'test-service', max_retries: 2 }),
      );
    });

    it('uses default retry config when none is configured', async () => {
      // No config in Redis
      mockRedisGet.mockResolvedValueOnce(null);

      const fn = jest.fn().mockResolvedValue('default-config-success');
      const result = await FailoverService.executeWithRetry(
        'unconfigured-service',
        fn,
      );

      expect(result).toBe('default-config-success');
    });
  });

  // -----------------------------------------------------------------------
  // enableGracefulDegradation
  // -----------------------------------------------------------------------

  describe('enableGracefulDegradation', () => {
    it('stores degradation config in Redis and logs audit event', async () => {
      const config = {
        fallback_behavior: 'return_cached_response',
        max_degradation_minutes: 60,
        auto_recover: true,
      };

      const result = await FailoverService.enableGracefulDegradation(
        'recommendation-service',
        config,
      );

      expect(result).toEqual({
        service: 'recommendation-service',
        ...config,
      });
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degradation_config:recommendation-service',
        expect.stringContaining('return_cached_response'),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.degradation_configured',
          resourceId: 'recommendation-service',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // handleServiceFailure
  // -----------------------------------------------------------------------

  describe('handleServiceFailure', () => {
    it('increments failure count and keeps circuit closed below threshold', async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'api-service',
          state: 'closed',
          failure_count: 1,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      await FailoverService.handleServiceFailure(
        'api-service',
        new Error('Connection timeout'),
      );

      // Should save with incremented failure count but still closed
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:api-service',
        expect.stringContaining('"failure_count":2'),
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:api-service',
        expect.stringContaining('"state":"closed"'),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.service_failure',
        }),
      );
    });

    it('opens circuit breaker and enters degraded mode when threshold reached', async () => {
      mockRedisGet
        // First call: getCircuitBreakerState for handleServiceFailure
        .mockResolvedValueOnce(
          JSON.stringify({
            service: 'api-service',
            state: 'closed',
            failure_count: 4,
            threshold: 5,
            timeout_ms: 30000,
          }),
        )
        // enterDegradedMode calls are handled by mockRedisSet
        // Then getFailoverState is called (via enterDegradedMode -> getFailoverState)
        // getFailoverState scans for degraded keys
      ;
      // Scans for getFailoverState (called by enterDegradedMode)
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:api-service'],
      ]);
      mockRedisGet.mockResolvedValueOnce(null); // fallback config
      mockRedisScan.mockResolvedValueOnce(['0', []]); // CB scan

      await FailoverService.handleServiceFailure(
        'api-service',
        new Error('Service unavailable'),
      );

      // Should have opened the circuit
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:api-service',
        expect.stringContaining('"state":"open"'),
      );
      // Should have entered degraded mode
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:degraded:api-service',
        expect.any(String),
      );
    });
  });

  // -----------------------------------------------------------------------
  // attemptRecovery
  // -----------------------------------------------------------------------

  describe('attemptRecovery', () => {
    it('recovers service when health check passes', async () => {
      // Health check query
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // getCircuitBreakerState
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'db-service',
          state: 'open',
          failure_count: 10,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );

      const result = await FailoverService.attemptRecovery('db-service');

      expect(result.recovered).toBe(true);
      expect(result.service).toBe('db-service');
      // Circuit breaker should be reset to closed
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:db-service',
        expect.stringContaining('"state":"closed"'),
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'failover:cb:db-service',
        expect.stringContaining('"failure_count":0'),
      );
      // Degraded key should be deleted
      expect(mockRedisDel).toHaveBeenCalledWith(
        'failover:degraded:db-service',
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.service_recovered',
        }),
      );
    });

    it('returns failure when health check fails', async () => {
      // Health check query fails
      mockQuery.mockRejectedValueOnce(new Error('Database unreachable'));

      const result =
        await FailoverService.attemptRecovery('db-service');

      expect(result.recovered).toBe(false);
      expect(result.message).toContain('Database unreachable');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'failover.recovery_failed',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getRecoveryStatus
  // -----------------------------------------------------------------------

  describe('getRecoveryStatus', () => {
    it('aggregates status for all known services', async () => {
      // Scan CB keys
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:cb:service-a'],
      ]);
      // Scan degraded keys
      mockRedisScan.mockResolvedValueOnce([
        '0',
        ['failover:degraded:service-b'],
      ]);

      // getCircuitBreakerState for service-a
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          service: 'service-a',
          state: 'closed',
          failure_count: 0,
          threshold: 5,
          timeout_ms: 30000,
        }),
      );
      // Degraded check for service-a
      mockRedisGet.mockResolvedValueOnce(null);
      // Degradation config for service-a
      mockRedisGet.mockResolvedValueOnce(null);

      // getCircuitBreakerState for service-b
      mockRedisGet.mockResolvedValueOnce(null); // default state
      // Degraded check for service-b
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({ entered_at: '2026-01-01T00:00:00.000Z' }),
      );
      // Degradation config for service-b
      mockRedisGet.mockResolvedValueOnce(null);

      // getFailoverState (called at end) - needs its own scans
      mockCacheGet.mockResolvedValueOnce({
        mode: 'degraded',
        since: '2026-01-01T00:00:00.000Z',
        affected_services: ['service-b'],
        active_fallbacks: [],
        last_check: '2026-01-01T00:00:00.000Z',
      });

      const result = await FailoverService.getRecoveryStatus();

      expect(result.services).toHaveLength(2);

      const serviceA = result.services.find((s) => s.service === 'service-a');
      expect(serviceA).toBeDefined();
      expect(serviceA!.is_degraded).toBe(false);
      expect(serviceA!.circuit_breaker.state).toBe('closed');

      const serviceB = result.services.find((s) => s.service === 'service-b');
      expect(serviceB).toBeDefined();
      expect(serviceB!.is_degraded).toBe(true);
      expect(serviceB!.degraded_since).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});

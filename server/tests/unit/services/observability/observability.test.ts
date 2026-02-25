/**
 * Unit tests for ObservabilityService.
 *
 * Database pool, Redis cache utilities, and direct Redis operations are fully
 * mocked so tests exercise only the service logic (tracing, error aggregation,
 * confidence drift, log retention, health checks).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0,
  },
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    ping: jest.fn(),
    info: jest.fn(),
  },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn(),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ObservabilityService } from '../../../../src/services/observability/ObservabilityService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { redis } from '../../../../src/config/redis';
import { generateId } from '../../../../src/utils/helpers';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;
const mockRedisPing = redis.ping as jest.Mock;
const mockRedisInfo = redis.info as jest.Mock;
const mockGenerateId = generateId as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupGenerateIdSequence(ids: string[]): void {
  ids.forEach((id) => mockGenerateId.mockReturnValueOnce(id));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ObservabilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisPing.mockResolvedValue('PONG');
  });

  // -----------------------------------------------------------------------
  // Distributed Tracing
  // -----------------------------------------------------------------------

  describe('startTrace', () => {
    it('creates a root trace and span, persists to Redis and DB', async () => {
      setupGenerateIdSequence(['trace-001', 'span-001']);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.startTrace('http.request', 'api-gateway');

      expect(result.trace_id).toBe('trace-001');
      expect(result.span_id).toBe('span-001');

      // Redis should store trace and span
      expect(mockRedisSet).toHaveBeenCalledTimes(2);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'observability:trace:trace-001',
        expect.stringContaining('"trace_id":"trace-001"'),
        'EX',
        3600,
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        'observability:span:span-001',
        expect.any(String),
        'EX',
        3600,
      );

      // DB should persist the span
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trace_spans'),
        expect.arrayContaining(['span-001', 'trace-001', null, 'http.request', 'api-gateway']),
      );
    });

    it('includes metadata in the root span', async () => {
      setupGenerateIdSequence(['trace-002', 'span-002']);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await ObservabilityService.startTrace('agent.run', 'agent-service', {
        agent_type: 'market_intelligence',
        country: 'DE',
      });

      // Verify metadata is serialized in the DB insert
      const dbCall = mockQuery.mock.calls[0];
      const metadataParam = dbCall[1][8]; // metadata is the 9th param
      const parsed = JSON.parse(metadataParam);
      expect(parsed.agent_type).toBe('market_intelligence');
      expect(parsed.country).toBe('DE');
    });
  });

  describe('startSpan', () => {
    it('adds a child span to an existing trace', async () => {
      mockGenerateId.mockReturnValueOnce('span-child-001');

      // Existing trace in Redis
      const existingTrace = {
        trace_id: 'trace-001',
        spans: [{
          id: 'span-root',
          trace_id: 'trace-001',
          operation: 'http.request',
          service: 'api',
          start_time: '2025-01-01T00:00:00.000Z',
          status: 'ok',
          metadata: {},
        }],
        created_at: '2025-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(existingTrace));
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.startSpan(
        'trace-001',
        'span-root',
        'db.query',
        'database-service',
      );

      expect(result.span_id).toBe('span-child-001');

      // Redis trace should be updated with the new span
      expect(mockRedisSet).toHaveBeenCalledWith(
        'observability:trace:trace-001',
        expect.stringContaining('span-child-001'),
        'EX',
        3600,
      );
    });

    it('creates span even when trace is not in Redis', async () => {
      mockGenerateId.mockReturnValueOnce('span-orphan-001');
      mockRedisGet.mockResolvedValueOnce(null); // trace not in Redis
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.startSpan(
        'trace-missing',
        'span-parent',
        'cache.lookup',
        'redis-service',
      );

      expect(result.span_id).toBe('span-orphan-001');

      // Should still persist to DB
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trace_spans'),
        expect.arrayContaining(['span-orphan-001', 'trace-missing', 'span-parent']),
      );
    });
  });

  describe('endSpan', () => {
    it('ends a span and computes duration from Redis data', async () => {
      const spanData: Record<string, unknown> = {
        id: 'span-001',
        trace_id: 'trace-001',
        operation: 'http.request',
        service: 'api',
        start_time: '2025-01-01T00:00:00.000Z',
        status: 'ok',
        metadata: { key: 'value' },
      };
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify(spanData)) // span lookup
        .mockResolvedValueOnce(JSON.stringify({ // trace lookup
          trace_id: 'trace-001',
          spans: [spanData],
        }));
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DB update

      await ObservabilityService.endSpan('span-001', 'ok', { result: 'success' });

      // Verify DB update with duration
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trace_spans'),
        expect.arrayContaining(['ok', 'span-001']),
      );

      // Verify Redis was updated
      expect(mockRedisSet).toHaveBeenCalledWith(
        'observability:span:span-001',
        expect.stringContaining('"status":"ok"'),
        'EX',
        3600,
      );
    });

    it('marks span with error status', async () => {
      const spanData = {
        id: 'span-err',
        trace_id: 'trace-err',
        operation: 'db.query',
        service: 'database',
        start_time: '2025-01-01T00:00:00.000Z',
        status: 'ok',
        metadata: {},
      };
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify(spanData))
        .mockResolvedValueOnce(JSON.stringify({
          trace_id: 'trace-err',
          spans: [spanData],
        }));
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await ObservabilityService.endSpan('span-err', 'error', { error: 'timeout' });

      // Verify error status written to Redis
      const spanUpdateCall = mockRedisSet.mock.calls.find(
        (call: unknown[]) => call[0] === 'observability:span:span-err',
      );
      expect(spanUpdateCall).toBeDefined();
      const updatedSpan = JSON.parse(spanUpdateCall![1] as string);
      expect(updatedSpan.status).toBe('error');
    });

    it('falls back to DB-only update when span not in Redis', async () => {
      mockRedisGet.mockResolvedValueOnce(null); // span not in Redis
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await ObservabilityService.endSpan('span-missing', 'ok');

      // Should update DB directly
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trace_spans'),
        expect.arrayContaining(['span-missing']),
      );
    });
  });

  describe('getTrace', () => {
    it('returns trace from Redis cache', async () => {
      const traceData = {
        trace_id: 'trace-001',
        spans: [
          {
            id: 'span-root',
            trace_id: 'trace-001',
            operation: 'http.request',
            service: 'api',
            start_time: '2025-01-01T00:00:00.000Z',
            end_time: '2025-01-01T00:00:00.150Z',
            duration_ms: 150,
            status: 'ok',
            metadata: {},
          },
          {
            id: 'span-child',
            trace_id: 'trace-001',
            parent_span_id: 'span-root',
            operation: 'db.query',
            service: 'database',
            start_time: '2025-01-01T00:00:00.010Z',
            end_time: '2025-01-01T00:00:00.100Z',
            duration_ms: 90,
            status: 'ok',
            metadata: {},
          },
        ],
        created_at: '2025-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(traceData));

      const result = await ObservabilityService.getTrace('trace-001');

      expect(result).not.toBeNull();
      expect(result!.trace_id).toBe('trace-001');
      expect(result!.spans).toHaveLength(2);
      expect(result!.root_operation).toBe('http.request');
      expect(result!.status).toBe('ok');
      expect(result!.total_duration_ms).toBe(150);
    });

    it('falls back to DB when trace not in Redis', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'span-root',
            trace_id: 'trace-db',
            parent_span_id: null,
            operation: 'api.call',
            service: 'gateway',
            agent_type: null,
            start_time: '2025-01-01T00:00:00.000Z',
            end_time: '2025-01-01T00:00:00.200Z',
            duration_ms: 200,
            status: 'ok',
            metadata: '{}',
          },
        ],
      });

      const result = await ObservabilityService.getTrace('trace-db');

      expect(result).not.toBeNull();
      expect(result!.trace_id).toBe('trace-db');
      expect(result!.root_operation).toBe('api.call');
      expect(result!.total_duration_ms).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['trace-db'],
      );
    });

    it('returns null when trace does not exist anywhere', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.getTrace('trace-nonexistent');

      expect(result).toBeNull();
    });

    it('detects partial_error status when some spans have errors', async () => {
      const traceData = {
        trace_id: 'trace-mixed',
        spans: [
          {
            id: 'span-ok',
            trace_id: 'trace-mixed',
            operation: 'http.request',
            service: 'api',
            start_time: '2025-01-01T00:00:00.000Z',
            end_time: '2025-01-01T00:00:00.100Z',
            duration_ms: 100,
            status: 'ok',
            metadata: {},
          },
          {
            id: 'span-fail',
            trace_id: 'trace-mixed',
            parent_span_id: 'span-ok',
            operation: 'db.query',
            service: 'database',
            start_time: '2025-01-01T00:00:00.010Z',
            end_time: '2025-01-01T00:00:00.050Z',
            duration_ms: 40,
            status: 'error',
            metadata: {},
          },
        ],
        created_at: '2025-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(traceData));

      const result = await ObservabilityService.getTrace('trace-mixed');

      expect(result!.status).toBe('partial_error');
    });

    it('detects full error status when all spans have errors', async () => {
      const traceData = {
        trace_id: 'trace-fail',
        spans: [
          {
            id: 'span-e1',
            trace_id: 'trace-fail',
            operation: 'op1',
            service: 'svc',
            start_time: '2025-01-01T00:00:00.000Z',
            duration_ms: 50,
            status: 'error',
            metadata: {},
          },
          {
            id: 'span-e2',
            trace_id: 'trace-fail',
            parent_span_id: 'span-e1',
            operation: 'op2',
            service: 'svc',
            start_time: '2025-01-01T00:00:00.010Z',
            duration_ms: 20,
            status: 'error',
            metadata: {},
          },
        ],
        created_at: '2025-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(traceData));

      const result = await ObservabilityService.getTrace('trace-fail');

      expect(result!.status).toBe('error');
    });
  });

  // -----------------------------------------------------------------------
  // Trace Lifecycle (integration of start/span/end/get)
  // -----------------------------------------------------------------------

  describe('trace lifecycle', () => {
    it('supports full trace lifecycle: start -> add span -> end spans -> retrieve', async () => {
      // 1. Start trace
      setupGenerateIdSequence(['trace-lc', 'span-root-lc']);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DB insert

      const trace = await ObservabilityService.startTrace('request', 'api');
      expect(trace.trace_id).toBe('trace-lc');
      expect(trace.span_id).toBe('span-root-lc');

      // 2. Add child span
      mockGenerateId.mockReturnValueOnce('span-child-lc');
      const rootSpanData = {
        id: 'span-root-lc',
        trace_id: 'trace-lc',
        operation: 'request',
        service: 'api',
        start_time: '2025-01-01T00:00:00.000Z',
        status: 'ok',
        metadata: {},
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({
        trace_id: 'trace-lc',
        spans: [rootSpanData],
        created_at: '2025-01-01T00:00:00.000Z',
      }));
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DB insert

      const child = await ObservabilityService.startSpan(
        'trace-lc', 'span-root-lc', 'db.query', 'database',
      );
      expect(child.span_id).toBe('span-child-lc');

      // 3. End child span
      const childSpanData = {
        id: 'span-child-lc',
        trace_id: 'trace-lc',
        parent_span_id: 'span-root-lc',
        operation: 'db.query',
        service: 'database',
        start_time: '2025-01-01T00:00:00.010Z',
        status: 'ok',
        metadata: {},
      };
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify(childSpanData))
        .mockResolvedValueOnce(JSON.stringify({
          trace_id: 'trace-lc',
          spans: [rootSpanData, childSpanData],
        }));
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DB update

      await ObservabilityService.endSpan('span-child-lc', 'ok');

      // Verify that span and trace were updated
      expect(mockRedisSet).toHaveBeenCalledWith(
        'observability:span:span-child-lc',
        expect.any(String),
        'EX',
        3600,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error Aggregation
  // -----------------------------------------------------------------------

  describe('aggregateErrors', () => {
    it('aggregates errors by type over the given window', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            error_type: 'ValidationError',
            count: '15',
            first_seen: '2025-01-01T00:00:00Z',
            last_seen: '2025-01-01T12:00:00Z',
            sample_message: 'Invalid input data',
            affected_services: ['api', 'agent-service'],
          },
          {
            error_type: 'TimeoutError',
            count: '5',
            first_seen: '2025-01-01T06:00:00Z',
            last_seen: '2025-01-01T11:00:00Z',
            sample_message: 'Request timed out after 30s',
            affected_services: ['database'],
          },
        ],
      });

      const result = await ObservabilityService.aggregateErrors(24);

      expect(result).toHaveLength(2);
      expect(result[0].error_type).toBe('ValidationError');
      expect(result[0].count).toBe(15);
      expect(result[0].sample_message).toBe('Invalid input data');
      expect(result[0].affected_services).toEqual(['api', 'agent-service']);
      expect(result[1].error_type).toBe('TimeoutError');
      expect(result[1].count).toBe(5);

      // Verify the SQL uses the time window parameter
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 hour' * $1"),
        [24],
      );
    });

    it('returns empty array when no errors in window', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.aggregateErrors(1);

      expect(result).toEqual([]);
    });

    it('handles null error_type gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          error_type: null,
          count: '3',
          first_seen: '2025-01-01T00:00:00Z',
          last_seen: '2025-01-01T01:00:00Z',
          sample_message: null,
          affected_services: [],
        }],
      });

      const result = await ObservabilityService.aggregateErrors(1);

      expect(result[0].error_type).toBe('unknown');
      expect(result[0].sample_message).toBe('');
    });
  });

  describe('getErrorDashboard', () => {
    it('returns cached dashboard when available', async () => {
      const cached = {
        last_24h: [{ error_type: 'TestError', count: 1, first_seen: '', last_seen: '', sample_message: '', affected_services: [] }],
        last_1h: [],
        last_15min: [],
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await ObservabilityService.getErrorDashboard();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('fetches and caches dashboard for 3 time windows', async () => {
      // 24h window
      mockQuery.mockResolvedValueOnce({
        rows: [{
          error_type: 'Err1',
          count: '10',
          first_seen: '2025-01-01T00:00:00Z',
          last_seen: '2025-01-01T23:00:00Z',
          sample_message: 'msg1',
          affected_services: ['svc1'],
        }],
      });
      // 1h window
      mockQuery.mockResolvedValueOnce({
        rows: [{
          error_type: 'Err1',
          count: '2',
          first_seen: '2025-01-01T22:00:00Z',
          last_seen: '2025-01-01T23:00:00Z',
          sample_message: 'msg1',
          affected_services: ['svc1'],
        }],
      });
      // 15min window
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.getErrorDashboard();

      expect(result.last_24h).toHaveLength(1);
      expect(result.last_1h).toHaveLength(1);
      expect(result.last_15min).toHaveLength(0);

      // Should cache the result for 2 minutes
      expect(mockCacheSet).toHaveBeenCalledWith(
        'observability:error_dashboard',
        expect.any(Object),
        120,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Confidence Drift
  // -----------------------------------------------------------------------

  describe('trackConfidenceDrift', () => {
    it('computes confidence stats and stable trend', async () => {
      // Main stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_confidence: '0.85',
          min_confidence: '0.70',
          max_confidence: '0.95',
          sample_count: '50',
        }],
      });
      // Trend query: first half and second half nearly equal
      mockQuery.mockResolvedValueOnce({
        rows: [{
          first_half_avg: '0.84',
          second_half_avg: '0.86',
        }],
      });

      const result = await ObservabilityService.trackConfidenceDrift('market_intelligence', '7');

      expect(result.agent_type).toBe('market_intelligence');
      expect(result.period).toBe('7');
      expect(result.average_confidence).toBeCloseTo(0.85);
      expect(result.min_confidence).toBeCloseTo(0.70);
      expect(result.max_confidence).toBeCloseTo(0.95);
      expect(result.sample_count).toBe(50);
      expect(result.trend).toBe('stable');
    });

    it('detects improving trend when second half average is higher', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_confidence: '0.80',
          min_confidence: '0.60',
          max_confidence: '0.95',
          sample_count: '100',
        }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          first_half_avg: '0.72',
          second_half_avg: '0.88',
        }],
      });

      const result = await ObservabilityService.trackConfidenceDrift('paid_ads', '7');

      expect(result.trend).toBe('improving');
    });

    it('detects declining trend when second half average is lower', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_confidence: '0.75',
          min_confidence: '0.50',
          max_confidence: '0.90',
          sample_count: '80',
        }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          first_half_avg: '0.85',
          second_half_avg: '0.65',
        }],
      });

      const result = await ObservabilityService.trackConfidenceDrift('content_blog', '7');

      expect(result.trend).toBe('declining');
    });

    it('handles zero samples gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          avg_confidence: null,
          min_confidence: null,
          max_confidence: null,
          sample_count: '0',
        }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          first_half_avg: null,
          second_half_avg: null,
        }],
      });

      const result = await ObservabilityService.trackConfidenceDrift('unknown_agent', '7');

      expect(result.average_confidence).toBe(0);
      expect(result.min_confidence).toBe(0);
      expect(result.max_confidence).toBe(0);
      expect(result.sample_count).toBe(0);
      expect(result.trend).toBe('stable');
    });
  });

  describe('getConfidenceDriftReport', () => {
    it('returns cached report when available', async () => {
      const cached = [{
        agent_type: 'market_intelligence',
        period: '7',
        average_confidence: 0.85,
        min_confidence: 0.70,
        max_confidence: 0.95,
        trend: 'stable' as const,
        sample_count: 50,
      }];
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await ObservabilityService.getConfidenceDriftReport();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('fetches drift for all agent types and caches for 30 minutes', async () => {
      // Distinct agent types query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { agent_type: 'market_intelligence' },
          { agent_type: 'paid_ads' },
        ],
      });
      // market_intelligence stats
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_confidence: '0.85', min_confidence: '0.70', max_confidence: '0.95', sample_count: '50' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_half_avg: '0.84', second_half_avg: '0.86' }],
      });
      // paid_ads stats
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_confidence: '0.78', min_confidence: '0.60', max_confidence: '0.90', sample_count: '30' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ first_half_avg: '0.75', second_half_avg: '0.81' }],
      });

      const result = await ObservabilityService.getConfidenceDriftReport();

      expect(result).toHaveLength(2);
      expect(result[0].agent_type).toBe('market_intelligence');
      expect(result[1].agent_type).toBe('paid_ads');

      // Should cache for 30 minutes (1800 seconds)
      expect(mockCacheSet).toHaveBeenCalledWith(
        'observability:confidence_drift_report',
        expect.any(Array),
        1800,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Log Retention
  // -----------------------------------------------------------------------

  describe('configureLogRetention', () => {
    it('upserts a log retention policy', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const policy = await ObservabilityService.configureLogRetention({
        log_type: 'audit_logs',
        retention_days: 90,
        archive_after_days: 30,
        is_active: true,
      });

      expect(policy.log_type).toBe('audit_logs');
      expect(policy.retention_days).toBe(90);
      expect(policy.archive_after_days).toBe(30);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO log_retention_policies'),
        ['audit_logs', 90, 30, true],
      );

      // Should invalidate cache
      expect(mockCacheDel).toHaveBeenCalledWith('observability:log_retention_policies');
    });

    it('handles policy without archive_after_days', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const policy = await ObservabilityService.configureLogRetention({
        log_type: 'trace_spans',
        retention_days: 30,
        is_active: true,
      });

      expect(policy.log_type).toBe('trace_spans');
      // Verify null is passed for archive_after_days
      expect(mockQuery.mock.calls[0][1][2]).toBeNull();
    });
  });

  describe('enforceLogRetention', () => {
    it('deletes records older than retention period per active policy', async () => {
      // getLogRetentionPolicies: no cache, fetch from DB
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [
          { log_type: 'audit_logs', retention_days: 90, archive_after_days: null, is_active: true },
          { log_type: 'trace_spans', retention_days: 30, archive_after_days: null, is_active: true },
        ],
      });
      // Cache set for policies
      mockCacheSet.mockResolvedValueOnce(undefined);
      // Delete from audit_logs
      mockQuery.mockResolvedValueOnce({ rowCount: 42 });
      // Delete from trace_spans
      mockQuery.mockResolvedValueOnce({ rowCount: 108 });

      const result = await ObservabilityService.enforceLogRetention();

      expect(result.audit_logs).toBe(42);
      expect(result.trace_spans).toBe(108);

      // Verify DELETE queries were issued
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM audit_logs'),
        [90],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trace_spans'),
        [30],
      );
    });

    it('skips inactive policies', async () => {
      mockCacheGet.mockResolvedValueOnce([
        { log_type: 'audit_logs', retention_days: 90, is_active: false },
        { log_type: 'trace_spans', retention_days: 30, is_active: true },
      ]);
      // Only trace_spans should be deleted
      mockQuery.mockResolvedValueOnce({ rowCount: 10 });

      const result = await ObservabilityService.enforceLogRetention();

      expect(result.trace_spans).toBe(10);
      expect(result.audit_logs).toBeUndefined();
      // Only one DELETE query
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('handles deletion errors gracefully and returns 0 for failed tables', async () => {
      mockCacheGet.mockResolvedValueOnce([
        { log_type: 'broken_table', retention_days: 7, is_active: true },
      ]);
      mockQuery.mockRejectedValueOnce(new Error('relation "broken_table" does not exist'));

      const result = await ObservabilityService.enforceLogRetention();

      expect(result.broken_table).toBe(0);
    });
  });

  describe('getLogRetentionPolicies', () => {
    it('returns cached policies when available', async () => {
      const cached = [
        { log_type: 'audit_logs', retention_days: 90, is_active: true },
      ];
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await ObservabilityService.getLogRetentionPolicies();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('fetches from DB and caches when no cache hit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { log_type: 'audit_logs', retention_days: 90, archive_after_days: 30, is_active: true },
          { log_type: 'trace_spans', retention_days: 30, archive_after_days: null, is_active: true },
        ],
      });

      const result = await ObservabilityService.getLogRetentionPolicies();

      expect(result).toHaveLength(2);
      expect(result[0].log_type).toBe('audit_logs');
      expect(result[0].archive_after_days).toBe(30);
      expect(result[1].archive_after_days).toBeUndefined();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'observability:log_retention_policies',
        expect.any(Array),
        300,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Health Checks
  // -----------------------------------------------------------------------

  describe('healthCheck', () => {
    it('returns healthy status when all services are up', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // DB ping
      mockRedisPing.mockResolvedValueOnce('PONG');

      const result = await ObservabilityService.healthCheck();

      expect(result.overall).toBe('healthy');
      expect(result.services).toHaveLength(3);

      const dbService = result.services.find((s) => s.service === 'database');
      expect(dbService!.status).toBe('healthy');

      const redisService = result.services.find((s) => s.service === 'redis');
      expect(redisService!.status).toBe('healthy');

      const apiService = result.services.find((s) => s.service === 'api');
      expect(apiService!.status).toBe('healthy');

      expect(result.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(result.checked_at).toBeDefined();
    });

    it('returns unhealthy when database is down', async () => {
      mockQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      mockRedisPing.mockResolvedValueOnce('PONG');

      const result = await ObservabilityService.healthCheck();

      expect(result.overall).toBe('unhealthy');

      const dbService = result.services.find((s) => s.service === 'database');
      expect(dbService!.status).toBe('unhealthy');
      expect(dbService!.details).toHaveProperty('error');
    });

    it('returns unhealthy when Redis is down', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockRedisPing.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await ObservabilityService.healthCheck();

      expect(result.overall).toBe('unhealthy');

      const redisService = result.services.find((s) => s.service === 'redis');
      expect(redisService!.status).toBe('unhealthy');
      expect(redisService!.details).toHaveProperty('error');
    });

    it('does not throw even when checks fail', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      mockRedisPing.mockRejectedValueOnce(new Error('Redis down'));

      const result = await ObservabilityService.healthCheck();

      expect(result.overall).toBe('unhealthy');
      expect(result.services).toHaveLength(3);
      // The function should never throw
    });
  });

  describe('getDetailedHealthCheck', () => {
    it('returns extended health info including pool stats and Redis info', async () => {
      // DB ping
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockRedisPing.mockResolvedValueOnce('PONG');
      // Redis info
      mockRedisInfo.mockResolvedValueOnce(
        'used_memory:1048576\r\nused_memory_human:1.00M\r\n',
      );
      // Agent states query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { agent_type: 'market_intelligence', status: 'idle', last_run_at: '2025-01-01T00:00:00Z', error_message: null },
        ],
      });
      // Kill switch query
      mockQuery.mockResolvedValueOnce({
        rows: [{ active_count: '0' }],
      });

      const result = await ObservabilityService.getDetailedHealthCheck();

      expect(result.overall).toBe('healthy');
      expect(result.database_pool).toHaveProperty('totalCount', 10);
      expect(result.database_pool).toHaveProperty('idleCount', 5);
      expect(result.database_pool).toHaveProperty('waitingCount', 0);
      expect(result.redis_info.used_memory).toBe(1048576);
      expect(result.redis_info.used_memory_human).toBe('1.00M');
      expect(result.agent_states).toHaveLength(1);
      expect(result.kill_switch_active).toBe(false);
    });

    it('returns kill_switch_active true when kill switches exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // DB ping
      mockRedisPing.mockResolvedValueOnce('PONG');
      mockRedisInfo.mockResolvedValueOnce('used_memory:2048\r\nused_memory_human:2K\r\n');
      mockQuery.mockResolvedValueOnce({ rows: [] }); // agent states
      mockQuery.mockResolvedValueOnce({ rows: [{ active_count: '3' }] }); // kill switch

      const result = await ObservabilityService.getDetailedHealthCheck();

      expect(result.kill_switch_active).toBe(true);
    });

    it('handles Redis info failure gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // DB ping
      mockRedisPing.mockResolvedValueOnce('PONG');
      mockRedisInfo.mockRejectedValueOnce(new Error('Redis info failed'));
      mockQuery.mockResolvedValueOnce({ rows: [] }); // agent states
      mockQuery.mockResolvedValueOnce({ rows: [{ active_count: '0' }] }); // kill switch

      const result = await ObservabilityService.getDetailedHealthCheck();

      expect(result.redis_info).toHaveProperty('error');
      // Should still return a result, not throw
      expect(result.overall).toBe('healthy');
    });
  });

  // -----------------------------------------------------------------------
  // Span nesting (parent-child relationships)
  // -----------------------------------------------------------------------

  describe('span nesting', () => {
    it('correctly links parent and child spans', async () => {
      mockGenerateId.mockReturnValueOnce('span-nested-child');

      const parentSpan = {
        id: 'span-parent-a',
        trace_id: 'trace-nest',
        operation: 'parent.op',
        service: 'svc-a',
        start_time: '2025-01-01T00:00:00.000Z',
        status: 'ok',
        metadata: {},
      };
      const traceData = {
        trace_id: 'trace-nest',
        spans: [parentSpan],
        created_at: '2025-01-01T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(traceData));
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ObservabilityService.startSpan(
        'trace-nest',
        'span-parent-a',
        'child.op',
        'svc-b',
      );

      expect(result.span_id).toBe('span-nested-child');

      // Verify the trace was updated with the nested span having correct parent
      const traceUpdateCall = mockRedisSet.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('trace:trace-nest'),
      );
      expect(traceUpdateCall).toBeDefined();
      const updatedTrace = JSON.parse(traceUpdateCall![1] as string);
      const childSpan = updatedTrace.spans.find(
        (s: Record<string, unknown>) => s.id === 'span-nested-child',
      );
      expect(childSpan).toBeDefined();
      expect(childSpan.parent_span_id).toBe('span-parent-a');
      expect(childSpan.operation).toBe('child.op');
      expect(childSpan.service).toBe('svc-b');
    });
  });
});

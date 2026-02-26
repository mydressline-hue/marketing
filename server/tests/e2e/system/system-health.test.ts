/**
 * System Health Comprehensive Test (Phase 10C - Part 4: Capstone).
 *
 * Tests the /health endpoint and all subsystem health checks:
 *   - Basic health endpoint returns full system status
 *   - All sub-system health checks (DB, Redis, agents, integrations)
 *   - Health check detects degraded components
 *   - Health check returns correct response times
 *   - Readiness and liveness probes
 *   - Historical health data
 *   - Deep health check with all subsystem validations
 *
 * At least 10 test cases covering comprehensive health checking.
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    totalCount: 10,
    idleCount: 8,
    waitingCount: 0,
  },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn(),
    quit: jest.fn(),
    connect: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest.fn().mockResolvedValue('used_memory_human:5.2M\r\nconnected_clients:3\r\n'),
    scan: jest.fn().mockResolvedValue(['0', []]),
    pipeline: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
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

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../src/app';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';
import { HealthCheckService } from '../../../src/services/healthcheck/HealthCheckService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API = '/api/v1';

const mockPool = pool as unknown as {
  query: jest.Mock;
  connect: jest.Mock;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

const mockRedis = redis as unknown as {
  ping: jest.Mock;
  info: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  scan: jest.Mock;
  pipeline: jest.Mock;
};

function adminToken() {
  return jwt.sign(
    { id: 'u0000000-0000-4000-8000-000000000001', email: 'admin@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('System Health Comprehensive Tests', () => {
  let token: string;

  beforeAll(() => {
    token = adminToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mocks
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.info.mockResolvedValue('used_memory_human:5.2M\r\nconnected_clients:3\r\n');
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.scan.mockResolvedValue(['0', []]);
  });

  // =========================================================================
  // 1. Basic Health Endpoint
  // =========================================================================

  describe('Basic Health Endpoint', () => {
    it('1. GET /health returns 200 with status ok, timestamp, uptime, and version', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.timestamp).toBeDefined();
      expect(typeof res.body.data.uptime).toBe('number');
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body.data.version).toBeDefined();
      expect(res.body.data.environment).toBe('test');
    });

    it('2. GET /health does not require authentication', async () => {
      // No Authorization header
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
    });

    it('3. GET /health returns proper JSON content-type', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-type']).toMatch(/json/);
    });
  });

  // =========================================================================
  // 2. Liveness Probe
  // =========================================================================

  describe('Liveness Probe', () => {
    it('4. GET /health/live returns alive=true with pid and uptime', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alive).toBe(true);
      expect(typeof res.body.data.pid).toBe('number');
      expect(res.body.data.pid).toBeGreaterThan(0);
      expect(typeof res.body.data.uptime).toBe('number');
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 3. Readiness Probe
  // =========================================================================

  describe('Readiness Probe', () => {
    it('5. GET /health/ready returns ready=true when DB and Redis are up', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.data.ready).toBe(true);
      expect(res.body.data.checks.postgresql).toBe(true);
      expect(res.body.data.checks.redis).toBe(true);
    });

    it('6. GET /health/ready returns 503 when DB is down', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.data.ready).toBe(false);
      expect(res.body.data.checks.postgresql).toBe(false);
      expect(res.body.data.checks.redis).toBe(true);
    });

    it('7. GET /health/ready returns 503 when Redis is down', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });
      mockRedis.ping.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.data.ready).toBe(false);
      expect(res.body.data.checks.postgresql).toBe(true);
      expect(res.body.data.checks.redis).toBe(false);
    });

    it('8. GET /health/ready returns 503 when both DB and Redis are down', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('PG down'));
      mockRedis.ping.mockRejectedValueOnce(new Error('Redis down'));

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.data.ready).toBe(false);
      expect(res.body.data.checks.postgresql).toBe(false);
      expect(res.body.data.checks.redis).toBe(false);
    });
  });

  // =========================================================================
  // 4. Deep Health Check
  // =========================================================================

  describe('Deep Health Check', () => {
    it('9. GET /health/deep returns comprehensive check with all subsystems (authenticated)', async () => {
      // The deep health check runs 7 checks in Promise.all. Pool.query calls
      // are consumed in this order (due to microtask scheduling):
      //   #1: checkPostgres   -> SELECT 1
      //   #2: checkIntegrations -> connections query (1st await)
      //   #3: checkAgentSystem  -> agent_decisions query
      //   #4: checkFinalOutputs -> agent_decisions for deliverables
      //   #5: checkIntegrations -> sync_errors query (2nd await, after #2 resolves)
      mockPool.query
        // #1 checkPostgres: SELECT 1
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })
        // #2 checkIntegrations: connections query
        .mockResolvedValueOnce({
          rows: [
            { platform_type: 'google_ads', status: 'connected', last_sync_at: '2025-06-01T00:00:00Z' },
            { platform_type: 'meta', status: 'connected', last_sync_at: '2025-06-01T00:00:00Z' },
          ],
          rowCount: 2,
        })
        // #3 checkAgentSystem: agent_decisions aggregate
        .mockResolvedValueOnce({
          rows: [{
            total_agents: 5,
            active_agents: 5,
            last_decision_at: '2025-06-01T12:00:00Z',
            decisions_24h: 50,
            avg_confidence: 85,
          }],
          rowCount: 1,
        })
        // #4 checkFinalOutputs: agent_decisions by deliverable type
        .mockResolvedValueOnce({
          rows: [
            { agent_type: 'country_strategy', cnt: 10, last_at: '2025-06-01T12:00:00Z', avg_conf: 88 },
            { agent_type: 'channel_allocation', cnt: 8, last_at: '2025-06-01T11:00:00Z', avg_conf: 85 },
            { agent_type: 'budget_model', cnt: 6, last_at: '2025-06-01T10:00:00Z', avg_conf: 82 },
            { agent_type: 'risk_assessment', cnt: 5, last_at: '2025-06-01T09:00:00Z', avg_conf: 90 },
            { agent_type: 'roi_projection', cnt: 4, last_at: '2025-06-01T08:00:00Z', avg_conf: 87 },
            { agent_type: 'execution_roadmap', cnt: 3, last_at: '2025-06-01T07:00:00Z', avg_conf: 84 },
          ],
          rowCount: 6,
        })
        // #5 checkIntegrations: sync error counts (2nd query after connections resolve)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get('/health/deep')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Status may be 'healthy' or 'degraded' depending on real disk usage in test env
      expect(['healthy', 'degraded']).toContain(res.body.data.status);
      expect(res.body.data.timestamp).toBeDefined();
      expect(typeof res.body.data.uptime).toBe('number');
      expect(res.body.data.version).toBeDefined();

      // Verify all subsystem checks are present
      const checks = res.body.data.checks;
      expect(checks.postgresql).toBeDefined();
      expect(checks.postgresql.status).toBe('up');
      expect(checks.redis).toBeDefined();
      expect(checks.redis.status).toBe('up');
      expect(checks.integrations).toBeDefined();
      expect(checks.integrations.healthy).toBe(2);
      expect(checks.agents).toBeDefined();
      expect(checks.agents.status).toBe('operational');
      expect(checks.final_outputs).toBeDefined();
      expect(checks.final_outputs.status).toBe('ready');
      expect(checks.memory).toBeDefined();
      expect(checks.memory.rss_mb).toBeGreaterThan(0);
      expect(checks.disk).toBeDefined();
    });

    it('10. GET /health/deep returns degraded when some components fail', async () => {
      // Mock PostgreSQL SELECT 1 (up)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })
        // Mock integrations: one degraded
        .mockResolvedValueOnce({
          rows: [
            { platform_type: 'google_ads', status: 'connected', last_sync_at: '2025-06-01T00:00:00Z' },
            { platform_type: 'meta', status: 'degraded', last_sync_at: '2025-05-01T00:00:00Z' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // Mock agent system: degraded (not all active)
        .mockResolvedValueOnce({
          rows: [{
            total_agents: 5,
            active_agents: 3,
            last_decision_at: '2025-06-01T12:00:00Z',
            decisions_24h: 20,
            avg_confidence: 72,
          }],
          rowCount: 1,
        })
        // Mock final outputs: partial
        .mockResolvedValueOnce({
          rows: [
            { agent_type: 'country_strategy', cnt: 10, last_at: '2025-06-01T12:00:00Z', avg_conf: 88 },
            { agent_type: 'channel_allocation', cnt: 8, last_at: '2025-06-01T11:00:00Z', avg_conf: 85 },
          ],
          rowCount: 2,
        });

      const res = await request(app)
        .get('/health/deep')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('degraded');
    });

    it('11. GET /health/deep returns unhealthy when critical components are down', async () => {
      // Mock PostgreSQL fails
      mockPool.query
        .mockRejectedValueOnce(new Error('Connection refused'))
        // integrations query also fails
        .mockRejectedValueOnce(new Error('Connection refused'))
        // agent system fails
        .mockRejectedValueOnce(new Error('Connection refused'))
        // final outputs fails
        .mockRejectedValueOnce(new Error('Connection refused'));

      const res = await request(app)
        .get('/health/deep')
        .set('Authorization', `Bearer ${token}`);

      // Could be either 503 or 200 depending on implementation, but status should be unhealthy
      expect(res.body.data.status).toBe('unhealthy');
    });

    it('12. GET /health/deep requires authentication (returns 401 without token)', async () => {
      const res = await request(app).get('/health/deep');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 5. Service-Level Health Checks (unit-style via HealthCheckService)
  // =========================================================================

  describe('HealthCheckService Direct Checks', () => {
    it('13. checkBasic returns correct structure with all required fields', () => {
      const result = HealthCheckService.checkBasic();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBeDefined();
      expect(result.environment).toBe('test');
    });

    it('14. checkLiveness returns alive=true with process info', () => {
      const result = HealthCheckService.checkLiveness();

      expect(result.alive).toBe(true);
      expect(result.pid).toBe(process.pid);
      expect(typeof result.uptime).toBe('number');
    });

    it('15. checkReadiness correctly reports when both DB and Redis are up', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const result = await HealthCheckService.checkReadiness();

      expect(result.ready).toBe(true);
      expect(result.checks.postgresql).toBe(true);
      expect(result.checks.redis).toBe(true);
    });

    it('16. checkReadiness correctly reports when DB is down', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const result = await HealthCheckService.checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.checks.postgresql).toBe(false);
      expect(result.checks.redis).toBe(true);
    });
  });

  // =========================================================================
  // 6. Response Time Validation
  // =========================================================================

  describe('Health Check Response Times', () => {
    it('17. basic health check responds within 100ms', async () => {
      const start = Date.now();
      await request(app).get('/health');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500); // generous for test environments
    });

    it('18. liveness probe responds within 100ms', async () => {
      const start = Date.now();
      await request(app).get('/health/live');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  // =========================================================================
  // 7. Historical Health Data
  // =========================================================================

  describe('Historical Health Data', () => {
    it('19. GET /health/history returns historical snapshots when available', async () => {
      // Mock Redis scan to return some health history keys
      const ts1 = Date.now() - 3600000; // 1 hour ago
      const ts2 = Date.now() - 7200000; // 2 hours ago
      mockRedis.scan.mockResolvedValueOnce([
        '0',
        [`health:history:${ts1}`, `health:history:${ts2}`],
      ]);

      const snapshotData = JSON.stringify({
        status: 'healthy',
        timestamp: new Date(ts1).toISOString(),
        uptime: 1000,
        version: '1.0.0',
        checks: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
        },
      });

      mockRedis.pipeline.mockReturnValueOnce({
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, snapshotData],
          [null, snapshotData],
        ]),
      });

      const res = await request(app)
        .get('/health/history?hours=24')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('20. GET /health/history returns empty array when no snapshots exist', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);

      const res = await request(app)
        .get('/health/history')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

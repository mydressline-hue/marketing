/**
 * Integration tests for the Execution Roadmap API endpoints.
 *
 * Validates that the Express routes, controller, and service work together
 * correctly. Database and Redis are mocked; the focus is on HTTP-level
 * behaviour (status codes, response shapes, authentication).
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
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

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import finalOutputsRoadmapRoutes from '../../../src/routes/final-outputs-roadmap.routes';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/final-outputs', finalOutputsRoadmapRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateTestToken(role = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function setupDBResponses() {
  mockQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'orch-1',
        request_id: 'req-1',
        overall_confidence: 78,
        contradictions_found: 2,
        contradictions_resolved: 1,
        challenge_cycles_run: 1,
        actions_assigned: 3,
        reasoning: 'Test orchestration.',
        completed_at: '2026-02-20T10:00:00Z',
      }],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'act-1',
          type: 'compliance_enforcement',
          description: 'Enforce GDPR compliance',
          assigned_agent: 'compliance',
          priority: 'critical',
          deadline: null,
          dependencies: '[]',
          status: 'pending',
          source_entry_agent: 'compliance',
          confidence_score: 88,
          created_at: '2026-02-20T10:00:00Z',
        },
        {
          id: 'act-2',
          type: 'campaign_management',
          description: 'Launch Google Ads',
          assigned_agent: 'paid_ads',
          priority: 'high',
          deadline: null,
          dependencies: '["act-1"]',
          status: 'pending',
          source_entry_agent: 'paid_ads',
          confidence_score: 74,
          created_at: '2026-02-20T10:00:00Z',
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'matrix-1',
        overall_confidence: 80,
        generated_by: 'master_orchestrator',
        request_id: 'req-1',
        entries: JSON.stringify([
          { agent: 'compliance', decision: 'Enforce GDPR', confidence: 90, approved: true, action: 'GDPR procedures', priority: 1 },
          { agent: 'paid_ads', decision: 'Launch ads', confidence: 75, approved: true, action: 'Ad campaigns', priority: 3 },
        ]),
        created_at: '2026-02-20T10:00:00Z',
      }],
    })
    .mockResolvedValueOnce({
      rows: [
        { code: 'DE', name: 'Germany', is_active: true },
        { code: 'FR', name: 'France', is_active: true },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        { name: 'ROAS', value: 3.2, previous_value: 2.8, change_percent: 14.3, trend: 'up', period: '2026-02' },
      ],
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Execution Roadmap API', () => {
  let app: express.Express;
  let token: string;

  beforeAll(() => {
    app = createTestApp();
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // GET /execution-roadmap
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/execution-roadmap', () => {
    it('returns 200 with full roadmap data', async () => {
      setupDBResponses();

      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('roadmap');
      expect(res.body.data).toHaveProperty('milestones');
      expect(res.body.data).toHaveProperty('critical_path');
      expect(res.body.data).toHaveProperty('resource_requirements');
      expect(res.body.data).toHaveProperty('kpi_targets');
      expect(res.body.data).toHaveProperty('generated_at');
      expect(res.body.data).toHaveProperty('confidence_score');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap')
        .expect(401);

      expect(res.body).toHaveProperty('error');
    });

    it('returns roadmap with three phases', async () => {
      setupDBResponses();

      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.roadmap).toHaveProperty('phase_1_days_1_30');
      expect(res.body.data.roadmap).toHaveProperty('phase_2_days_31_60');
      expect(res.body.data.roadmap).toHaveProperty('phase_3_days_61_90');
    });
  });

  // -----------------------------------------------------------------------
  // GET /execution-roadmap/:phase
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/execution-roadmap/:phase', () => {
    it('returns 200 with phase 1 details', async () => {
      setupDBResponses();

      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name');
      expect(res.body.data).toHaveProperty('objectives');
      expect(res.body.data).toHaveProperty('key_actions');
      expect(res.body.data).toHaveProperty('expected_outcomes');
      expect(res.body.data).toHaveProperty('risks');
    });

    it('returns 400 for invalid phase number', async () => {
      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap/5')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PHASE');
    });

    it('returns 401 without authentication', async () => {
      await request(app)
        .get('/api/v1/final-outputs/execution-roadmap/1')
        .expect(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /execution-roadmap/milestones
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/execution-roadmap/milestones', () => {
    it('returns 200 with milestone status data', async () => {
      // setupDBResponses for main roadmap generation (5 queries)
      setupDBResponses();
      // Also mock the completed milestones query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/final-outputs/execution-roadmap/milestones')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('milestones');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('completed');
      expect(res.body.data).toHaveProperty('in_progress');
      expect(res.body.data).toHaveProperty('pending');
      expect(res.body.data).toHaveProperty('completion_percentage');
    });

    it('returns 401 without authentication', async () => {
      await request(app)
        .get('/api/v1/final-outputs/execution-roadmap/milestones')
        .expect(401);
    });
  });
});

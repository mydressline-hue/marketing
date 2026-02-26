/**
 * Integration tests for Weakness & Improvement Report API endpoints.
 *
 * Tests the full HTTP request/response cycle for weakness report routes,
 * with all database, Redis, and service dependencies mocked.
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import { authenticate } from '../../../src/middleware/auth';
import {
  asyncHandler,
  errorHandler,
  notFoundHandler,
} from '../../../src/middleware/errorHandler';
import { WeaknessReportOutputService } from '../../../src/services/final-outputs/WeaknessReportOutputService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChallengeRoundRow() {
  return {
    id: 'cr-001',
    round_number: 1,
    challenges_json: JSON.stringify([
      {
        challengerId: 'market_intelligence',
        challengedId: 'country_strategy',
        findings: [
          {
            area: 'confidence',
            issue: 'Agent country_strategy has very low confidence (25/100)',
            severity: 'critical',
            evidence: 'Confidence score: 25',
            suggestedFix: 'Flag for manual review',
          },
        ],
        overallSeverity: 'critical',
        confidence: 70,
      },
    ]),
    inconsistencies_json: JSON.stringify([]),
    gaps_json: JSON.stringify([]),
    created_at: '2026-02-25T10:00:00Z',
  };
}

function setupDbMocks() {
  mockQuery
    .mockResolvedValueOnce({ rows: [makeChallengeRoundRow()] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'gap-001',
        summary: 'No gaps',
        critical_gaps_json: JSON.stringify([]),
        recommendations_json: JSON.stringify([]),
        created_at: '2026-02-25T10:00:00Z',
      }],
    })
    .mockResolvedValueOnce({ rows: [] });
}

// ---------------------------------------------------------------------------
// Build test Express app
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const service = new WeaknessReportOutputService();
  const router = express.Router();

  router.use(authenticate);

  // GET /final-outputs/weakness-report
  router.get(
    '/final-outputs/weakness-report',
    asyncHandler(async (_req, res) => {
      const report = await service.generateWeaknessReport();
      res.json({ success: true, data: report });
    }),
  );

  // GET /final-outputs/weakness-report/priorities
  router.get(
    '/final-outputs/weakness-report/priorities',
    asyncHandler(async (_req, res) => {
      const priorities = await service.getImprovementPriorities();
      res.json({ success: true, data: priorities, meta: { count: priorities.length } });
    }),
  );

  // GET /final-outputs/weakness-report/:category
  router.get(
    '/final-outputs/weakness-report/:category',
    asyncHandler(async (req, res) => {
      const { category } = req.params;
      const weaknesses = await service.getWeaknessByCategory(category);
      res.json({ success: true, data: weaknesses, meta: { category, count: weaknesses.length } });
    }),
  );

  app.use(`${API_PREFIX}`, router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let request: typeof import('supertest').default;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Weakness Report API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/final-outputs/weakness-report
  // =========================================================================

  describe('GET /api/v1/final-outputs/weakness-report', () => {
    it('returns 200 with full weakness report for authenticated admin', async () => {
      const token = generateTestToken('admin');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overall_health');
      expect(response.body.data).toHaveProperty('weaknesses');
      expect(response.body.data).toHaveProperty('contradictions_found');
      expect(response.body.data).toHaveProperty('data_gaps');
      expect(response.body.data).toHaveProperty('improvement_roadmap');
      expect(response.body.data).toHaveProperty('cross_challenge_summary');
      expect(response.body.data).toHaveProperty('generated_at');
      expect(response.body.data).toHaveProperty('confidence_score');
    });

    it('returns 401 without authentication token', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns weaknesses from challenge round findings', async () => {
      const token = generateTestToken('admin');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.weaknesses.length).toBeGreaterThan(0);
      expect(response.body.data.weaknesses[0]).toHaveProperty('id');
      expect(response.body.data.weaknesses[0]).toHaveProperty('category');
      expect(response.body.data.weaknesses[0]).toHaveProperty('severity');
      expect(response.body.data.weaknesses[0]).toHaveProperty('description');
      expect(response.body.data.weaknesses[0]).toHaveProperty('affected_agents');
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/weakness-report/priorities
  // =========================================================================

  describe('GET /api/v1/final-outputs/weakness-report/priorities', () => {
    it('returns 200 with prioritised improvement actions', async () => {
      const token = generateTestToken('admin');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report/priorities`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('count');
    });

    it('returns 401 without authentication token', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report/priorities`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/weakness-report/:category
  // =========================================================================

  describe('GET /api/v1/final-outputs/weakness-report/:category', () => {
    it('returns 200 with weaknesses filtered by category', async () => {
      const token = generateTestToken('admin');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report/confidence`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.category).toBe('confidence');
      expect(typeof response.body.meta.count).toBe('number');
    });

    it('returns empty array for non-existent category', async () => {
      const token = generateTestToken('admin');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report/nonexistent`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.count).toBe(0);
    });

    it('allows viewer role to access weakness report by category', async () => {
      const token = generateTestToken('viewer');
      setupDbMocks();

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/weakness-report/confidence`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});

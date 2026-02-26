/**
 * Integration tests for System-Wide Confidence Score API endpoints.
 *
 * Tests the full HTTP request/response cycle for confidence score
 * routes, with all database, Redis, and service dependencies mocked.
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

jest.mock('../../../src/services/final-outputs/ConfidenceScoreOutputService', () => ({
  ConfidenceScoreOutputService: {
    generateSystemConfidenceScore: jest.fn(),
    getAgentConfidence: jest.fn(),
    getConfidenceTrend: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../../src/middleware/auth';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { ConfidenceScoreOutputService } from '../../../src/services/final-outputs/ConfidenceScoreOutputService';
import { pool } from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockService = ConfidenceScoreOutputService as jest.Mocked<
  typeof ConfidenceScoreOutputService
>;
const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());

  const router = express.Router();
  router.use(authenticate);

  // Import route handlers inline
  const {
    getSystemConfidenceScore,
    getConfidenceTrend,
    getAgentConfidenceScore,
  } = require('../../../src/controllers/final-outputs-confidence.controller');

  router.get('/final-outputs/confidence-score', getSystemConfidenceScore);
  router.get('/final-outputs/confidence-score/trend', getConfidenceTrend);
  router.get('/final-outputs/confidence-score/:agentId', getAgentConfidenceScore);

  app.use(API_PREFIX, router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'user-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SYSTEM_CONFIDENCE_RESULT = {
  system_score: 76.5,
  system_grade: 'C' as const,
  agent_scores: [
    {
      agent_id: 'master_orchestrator',
      agent_name: 'Master Orchestrator',
      confidence_score: 85,
      last_updated: '2026-02-25T12:00:00Z',
      data_quality_score: 90,
      decision_count: 10,
      uncertainty_flags: [],
    },
  ],
  category_scores: {
    market_intelligence: 78,
    advertising: 72,
    content_creative: 70,
    analytics_budget: 80,
    testing_conversion: 65,
    integrations: 60,
    compliance_security: 88,
    infrastructure: 75,
    orchestration: 85,
  },
  score_trend: [
    { date: '2026-02-24', score: 74 },
    { date: '2026-02-25', score: 76.5 },
  ],
  low_confidence_alerts: [],
  methodology: 'Weighted average of all 20 agent confidence scores.',
  generated_at: '2026-02-25T12:00:00Z',
};

const AGENT_CONFIDENCE_RESULT = {
  agent_id: 'paid_ads',
  agent_name: 'Paid Ads',
  agent_type: 'paid_ads',
  confidence_score: 72,
  data_quality_score: 80,
  decision_count: 5,
  recent_decisions: [
    {
      id: 'dec-1',
      decision_type: 'bid_adjustment',
      confidence_score: 72,
      created_at: '2026-02-25T12:00:00Z',
    },
  ],
  uncertainty_flags: ['Market volatility'],
  last_updated: '2026-02-25T12:00:00Z',
};

const TREND_RESULT = {
  days: 30,
  trend: [
    { date: '2026-02-20', score: 70 },
    { date: '2026-02-25', score: 76 },
  ],
  average_score: 73,
  min_score: 70,
  max_score: 76,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Confidence Score API Integration', () => {
  let app: express.Express;
  let token: string;

  beforeAll(() => {
    // Mock the sessions check used by authenticate
    mockQuery.mockResolvedValue({ rows: [{ id: 'session-1' }] });
    app = buildTestApp();
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 'session-1' }] });
  });

  describe('GET /api/v1/final-outputs/confidence-score', () => {
    it('should return system-wide confidence score with 200', async () => {
      mockService.generateSystemConfidenceScore.mockResolvedValueOnce(
        SYSTEM_CONFIDENCE_RESULT,
      );

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/confidence-score`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.system_score).toBe(76.5);
      expect(res.body.data.system_grade).toBe('C');
      expect(res.body.data.agent_scores).toBeDefined();
      expect(res.body.data.category_scores).toBeDefined();
      expect(res.body.data.methodology).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get(
        `${API_PREFIX}/final-outputs/confidence-score`,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/final-outputs/confidence-score/trend', () => {
    it('should return trend data with default 30 days', async () => {
      mockService.getConfidenceTrend.mockResolvedValueOnce(TREND_RESULT);

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/confidence-score/trend`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.days).toBe(30);
      expect(res.body.data.trend).toHaveLength(2);
      expect(res.body.data.average_score).toBe(73);
    });

    it('should accept custom days parameter', async () => {
      mockService.getConfidenceTrend.mockResolvedValueOnce({
        ...TREND_RESULT,
        days: 7,
      });

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/confidence-score/trend?days=7`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.days).toBe(7);
    });
  });

  describe('GET /api/v1/final-outputs/confidence-score/:agentId', () => {
    it('should return per-agent confidence breakdown', async () => {
      mockService.getAgentConfidence.mockResolvedValueOnce(
        AGENT_CONFIDENCE_RESULT,
      );

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/confidence-score/paid_ads`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.agent_id).toBe('paid_ads');
      expect(res.body.data.confidence_score).toBe(72);
      expect(res.body.data.recent_decisions).toHaveLength(1);
    });

    it('should handle service errors gracefully', async () => {
      mockService.getAgentConfidence.mockRejectedValueOnce(
        new Error('Agent not found'),
      );

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/confidence-score/invalid_agent`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
    });
  });
});

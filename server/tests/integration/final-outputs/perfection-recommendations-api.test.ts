/**
 * Integration tests for Perfection Recommendations API endpoints.
 *
 * Tests the full HTTP request/response cycle through Express using supertest,
 * with all database and Redis dependencies mocked.
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

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import perfectionRoutes from '../../../src/routes/final-outputs-perfection.routes';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/final-outputs', perfectionRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildAgentDecisionRows(baseConfidence: number): Record<string, unknown>[] {
  const agents = [
    'data_engineering', 'performance_analytics',
    'creative_generation', 'ab_testing', 'conversion_optimization',
    'paid_ads', 'organic_social', 'content_blog', 'budget_optimization',
    'compliance', 'brand_consistency',
    'enterprise_security', 'fraud_detection',
    'shopify_integration', 'localization',
    'market_intelligence', 'country_strategy', 'competitive_intelligence',
    'revenue_forecasting',
  ];

  return agents.map((agentType, idx) => ({
    id: `decision-${idx}`,
    agent_type: agentType,
    decision_type: 'analysis',
    confidence_score: String(baseConfidence + (idx % 5)),
    reasoning: `Analysis for ${agentType}`,
    output_data: JSON.stringify({
      recommendations: [`Improve ${agentType}`],
      warnings: baseConfidence < 60 ? [`Issue in ${agentType}`] : [],
      uncertainties: [],
    }),
    input_data: '{}',
    created_at: '2025-06-01T00:00:00Z',
  }));
}

const ORCHESTRATOR_ROW = {
  id: 'orch-1',
  overall_confidence: '75',
  confidence_score: '75',
  contradictions_count: '2',
  resolved_count: '1',
  agent_coverage: '19',
  reasoning: 'Orchestration completed',
  actions_count: '10',
  output_data: JSON.stringify({}),
  created_at: '2025-06-01T00:00:00Z',
};

const BENCHMARK_ROW = {
  industry_average_score: '55',
  top_performer_score: '92',
  sample_size: '150',
  created_at: '2025-06-01T00:00:00Z',
};

const CROSS_CHALLENGE_ROW = {
  id: 'cc-1',
  challenger: 'compliance',
  challenged: 'paid_ads',
  finding: 'Ad targeting potentially violates GDPR',
  severity: 'warning',
  confidence: '70',
  resolved: false,
  created_at: '2025-06-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Perfection Recommendations API', () => {
  let app: express.Express;
  let token: string;

  beforeAll(() => {
    app = createApp();
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // GET /perfection-recommendations
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/perfection-recommendations', () => {
    it('returns 200 with full recommendations report', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [ORCHESTRATOR_ROW] })
        .mockResolvedValueOnce({ rows: buildAgentDecisionRows(72) })
        .mockResolvedValueOnce({ rows: [CROSS_CHALLENGE_ROW] })
        .mockResolvedValueOnce({ rows: [BENCHMARK_ROW] });

      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('enterprise_readiness_score');
      expect(res.body.data).toHaveProperty('grade');
      expect(res.body.data).toHaveProperty('recommendations');
      expect(res.body.data).toHaveProperty('maturity_assessment');
      expect(res.body.data).toHaveProperty('next_steps');
      expect(res.body.data).toHaveProperty('benchmarks');
      expect(res.body.data).toHaveProperty('generated_at');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations')
        .expect(401);

      expect(res.body.error || res.status).toBeTruthy();
    });

    it('returns recommendations with correct structure', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [ORCHESTRATOR_ROW] })
        .mockResolvedValueOnce({ rows: buildAgentDecisionRows(72) })
        .mockResolvedValueOnce({ rows: [CROSS_CHALLENGE_ROW] })
        .mockResolvedValueOnce({ rows: [BENCHMARK_ROW] });

      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const data = res.body.data;
      expect(typeof data.enterprise_readiness_score).toBe('number');
      expect(data.enterprise_readiness_score).toBeGreaterThanOrEqual(0);
      expect(data.enterprise_readiness_score).toBeLessThanOrEqual(100);
      expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(data.grade);
      expect(Array.isArray(data.recommendations)).toBe(true);

      if (data.recommendations.length > 0) {
        const rec = data.recommendations[0];
        expect(rec).toHaveProperty('id');
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('title');
        expect(rec).toHaveProperty('implementation_steps');
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /perfection-recommendations/maturity
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/perfection-recommendations/maturity', () => {
    it('returns 200 with maturity assessment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [ORCHESTRATOR_ROW] })
        .mockResolvedValueOnce({ rows: buildAgentDecisionRows(70) })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [BENCHMARK_ROW] });

      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations/maturity')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('data_infrastructure');
      expect(data).toHaveProperty('ai_capabilities');
      expect(data).toHaveProperty('marketing_operations');
      expect(data).toHaveProperty('compliance_governance');
      expect(data).toHaveProperty('security_posture');
      expect(data).toHaveProperty('integration_ecosystem');

      // Each domain should have level, description, score, improvements_needed
      for (const domain of Object.values(data) as Array<Record<string, unknown>>) {
        expect(domain).toHaveProperty('level');
        expect(domain).toHaveProperty('description');
        expect(domain).toHaveProperty('score');
        expect(domain).toHaveProperty('improvements_needed');
        expect(typeof domain.level).toBe('number');
        expect((domain.level as number)).toBeGreaterThanOrEqual(1);
        expect((domain.level as number)).toBeLessThanOrEqual(5);
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /perfection-recommendations/:category
  // -----------------------------------------------------------------------

  describe('GET /api/v1/final-outputs/perfection-recommendations/:category', () => {
    it('returns filtered recommendations for a valid category', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [ORCHESTRATOR_ROW] })
        .mockResolvedValueOnce({ rows: buildAgentDecisionRows(50) })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [BENCHMARK_ROW] });

      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations/compliance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      for (const rec of res.body.data) {
        expect(rec.category).toBe('compliance');
      }
    });

    it('returns 400 for an invalid category', async () => {
      const res = await request(app)
        .get('/api/v1/final-outputs/perfection-recommendations/invalid_category')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CATEGORY');
    });
  });
});

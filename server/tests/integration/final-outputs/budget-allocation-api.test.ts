/**
 * Integration tests for Budget Allocation Model API endpoints.
 *
 * Tests the full HTTP request/response cycle for budget allocation model
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

jest.mock('../../../src/services/final-outputs/BudgetAllocationOutputService', () => ({
  BudgetAllocationOutputService: {
    generateBudgetAllocationModel: jest.fn(),
    getSpendingVelocity: jest.fn(),
    getBudgetUtilization: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../../src/middleware/auth';
import { asyncHandler, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { BudgetAllocationOutputService } from '../../../src/services/final-outputs/BudgetAllocationOutputService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockService = BudgetAllocationOutputService as jest.Mocked<typeof BudgetAllocationOutputService>;

// ---------------------------------------------------------------------------
// Test Express app
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();
  router.use(authenticate);

  // Budget model routes
  router.get(
    '/final-outputs/budget-model',
    asyncHandler(async (_req, res) => {
      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();
      res.json({ success: true, data: model });
    }),
  );

  router.get(
    '/final-outputs/budget-model/velocity',
    asyncHandler(async (_req, res) => {
      const velocity = await BudgetAllocationOutputService.getSpendingVelocity();
      res.json({ success: true, data: velocity });
    }),
  );

  router.get(
    '/final-outputs/budget-model/utilization',
    asyncHandler(async (_req, res) => {
      const utilization = await BudgetAllocationOutputService.getBudgetUtilization();
      res.json({ success: true, data: utilization });
    }),
  );

  app.use(API_PREFIX, router);
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

describe('Budget Allocation Model API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /api/v1/final-outputs/budget-model
  // =========================================================================

  describe('GET /api/v1/final-outputs/budget-model', () => {
    it('returns 200 with the full budget allocation model', async () => {
      const token = generateTestToken('admin');
      const mockModel = {
        total_budget: 50000,
        currency: 'USD',
        allocations: [
          {
            category: 'paid_media',
            subcategory: 'google',
            amount: 25000,
            percentage: 50,
            expected_roi: 3.5,
            risk_level: 'low',
            optimization_status: 'increase',
          },
        ],
        country_budgets: [
          {
            country_code: 'US',
            total_allocation: 50000,
            channel_split: [{ channel: 'google', amount: 25000 }],
          },
        ],
        guardrails: {
          max_single_channel_pct: 60,
          max_single_country_pct: 50,
          min_roas_threshold: 1.5,
          daily_spend_cap: 2000,
        },
        reallocation_recommendations: [
          {
            from_channel: 'tiktok',
            to_channel: 'google',
            amount: 1000,
            expected_improvement_pct: 15,
            confidence: 72,
          },
        ],
        generated_at: '2026-02-26T10:00:00.000Z',
        confidence_score: 72,
      };

      mockService.generateBudgetAllocationModel.mockResolvedValueOnce(mockModel);

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_budget).toBe(50000);
      expect(response.body.data.currency).toBe('USD');
      expect(response.body.data.allocations).toHaveLength(1);
      expect(response.body.data.country_budgets).toHaveLength(1);
      expect(response.body.data.guardrails).toBeDefined();
      expect(response.body.data.reallocation_recommendations).toHaveLength(1);
      expect(response.body.data.confidence_score).toBe(72);
    });

    it('returns 401 when no token is provided', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/budget-model/velocity
  // =========================================================================

  describe('GET /api/v1/final-outputs/budget-model/velocity', () => {
    it('returns 200 with spending velocity data', async () => {
      const token = generateTestToken('analyst');
      const mockVelocity = {
        current_daily_rate: 350.5,
        current_weekly_rate: 2453.5,
        projected_monthly_rate: 10515,
        budget_remaining: 15000,
        days_remaining: 30,
        projected_exhaustion_date: '2026-04-15T00:00:00.000Z',
        on_track: true,
        velocity_trend: 'stable' as const,
      };

      mockService.getSpendingVelocity.mockResolvedValueOnce(mockVelocity);

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model/velocity`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.current_daily_rate).toBe(350.5);
      expect(response.body.data.on_track).toBe(true);
      expect(response.body.data.velocity_trend).toBe('stable');
    });

    it('returns 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model/velocity`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/budget-model/utilization
  // =========================================================================

  describe('GET /api/v1/final-outputs/budget-model/utilization', () => {
    it('returns 200 with budget utilization data', async () => {
      const token = generateTestToken('campaign_manager');
      const mockUtilization = {
        total_budget: 50000,
        total_spent: 22500,
        utilization_pct: 45,
        by_channel: [
          { channel: 'google', allocated: 25000, spent: 12500, utilization_pct: 50 },
          { channel: 'meta', allocated: 15000, spent: 6000, utilization_pct: 40 },
        ],
        by_country: [
          { country_code: 'US', country_name: 'United States', allocated: 50000, spent: 22500, utilization_pct: 45 },
        ],
        period_start: '2026-01-01',
        period_end: '2026-06-30',
      };

      mockService.getBudgetUtilization.mockResolvedValueOnce(mockUtilization);

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model/utilization`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_budget).toBe(50000);
      expect(response.body.data.utilization_pct).toBe(45);
      expect(response.body.data.by_channel).toHaveLength(2);
      expect(response.body.data.by_country).toHaveLength(1);
    });

    it('returns 401 for unauthenticated utilization requests', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model/utilization`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('handles service errors gracefully with a 500 response', async () => {
      const token = generateTestToken('admin');

      mockService.getBudgetUtilization.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const response = await request(app)
        .get(`${API_PREFIX}/final-outputs/budget-model/utilization`)
        .set('Authorization', `Bearer ${token}`)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});

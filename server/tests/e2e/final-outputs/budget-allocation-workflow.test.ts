/**
 * E2E tests for Budget Allocation Model workflow.
 *
 * Tests full budget allocation model workflows including:
 *   - Generate model -> verify structure -> check allocations total to budget
 *   - Velocity tracking -> verify trend detection
 *   - Utilization -> verify channel + country breakdowns sum correctly
 *   - Full lifecycle: model -> velocity -> utilization in sequence
 *   - Empty state handling
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();
jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
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
import { authenticate } from '../../../src/middleware/auth';
import { asyncHandler, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { BudgetAllocationOutputService } from '../../../src/services/final-outputs/BudgetAllocationOutputService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Test Express app
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();
  router.use(authenticate);

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
// Helpers
// ---------------------------------------------------------------------------

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

function makeAllocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alloc-001',
    country_id: 'country-us',
    channel_allocations: { google: 5000, meta: 3000, tiktok: 2000 },
    period_start: new Date(Date.now() - 15 * 86400000).toISOString(),
    period_end: new Date(Date.now() + 15 * 86400000).toISOString(),
    total_budget: '10000',
    total_spent: '4500',
    risk_guardrails: [
      { type: 'max_channel_concentration', threshold: 50, action: 'alert' },
      { type: 'max_daily_spend', threshold: 500, action: 'alert' },
      { type: 'min_roas', threshold: 1.5, action: 'reduce' },
    ],
    ...overrides,
  };
}

/**
 * Sets up mock DB responses for the full model generation flow.
 */
function setupModelMocks(options: {
  allocations?: Record<string, unknown>[];
} = {}) {
  const allocations = options.allocations ?? [makeAllocationRow()];

  let callIndex = 0;
  mockQuery.mockImplementation(() => {
    callIndex++;
    // 1: active allocations
    if (callIndex === 1) return { rows: allocations, rowCount: allocations.length };
    // 2: currency
    if (callIndex === 2) return { rows: [{ currency: 'USD' }], rowCount: 1 };
    // 3: ROAS from campaigns
    if (callIndex === 3) {
      return {
        rows: [
          { platform: 'google', avg_roas: '3.5' },
          { platform: 'meta', avg_roas: '2.1' },
          { platform: 'tiktok', avg_roas: '1.2' },
        ],
        rowCount: 3,
      };
    }
    // 4: agent decisions (optimization actions)
    if (callIndex === 4) {
      return {
        rows: [{
          output_data: {
            optimization: {
              actions: [
                { target: 'google', type: 'increase' },
                { target: 'tiktok', type: 'decrease' },
              ],
            },
            validatedPlan: {
              plan: {
                fromChannels: { tiktok: 200 },
                toChannels: { google: 200 },
                totalReallocated: 200,
              },
            },
          },
          confidence_score: '72',
        }],
        rowCount: 1,
      };
    }
    // 5: countries
    if (callIndex === 5) return { rows: [{ id: 'country-us', code: 'US' }], rowCount: 1 };
    // 6: agent config fallback (not needed)
    if (callIndex === 6) return { rows: [], rowCount: 0 };
    // 7: reallocation recommendations (same agent decision)
    if (callIndex === 7) {
      return {
        rows: [{
          output_data: {
            validatedPlan: {
              plan: {
                fromChannels: { tiktok: 200 },
                toChannels: { google: 200 },
                totalReallocated: 200,
              },
            },
          },
          confidence_score: '72',
        }],
        rowCount: 1,
      };
    }
    // 8: avg confidence
    if (callIndex === 8) return { rows: [{ avg_confidence: '72' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

function setupVelocityMocks() {
  const today = new Date();
  const dailyRows = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(today.getTime() - i * 86400000);
    dailyRows.push({
      spend_date: date.toISOString().split('T')[0],
      daily_total: String(300 + i * 5),
    });
  }

  let callIndex = 0;
  mockQuery.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) return { rows: dailyRows, rowCount: dailyRows.length };
    if (callIndex === 2) {
      return {
        rows: [{
          total_budget: '10000',
          total_spent: '4500',
          earliest_start: new Date(Date.now() - 15 * 86400000).toISOString(),
          latest_end: new Date(Date.now() + 15 * 86400000).toISOString(),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
}

function setupUtilizationMocks() {
  let callIndex = 0;
  mockQuery.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) {
      return {
        rows: [{
          total_budget: '10000',
          total_spent: '4500',
          period_start: '2026-01-01',
          period_end: '2026-06-30',
        }],
        rowCount: 1,
      };
    }
    if (callIndex === 2) {
      return {
        rows: [
          { channel: 'google', allocated: '5000', spent: '2250' },
          { channel: 'meta', allocated: '3000', spent: '1350' },
          { channel: 'tiktok', allocated: '2000', spent: '900' },
        ],
        rowCount: 3,
      };
    }
    if (callIndex === 3) {
      return {
        rows: [
          { country_code: 'US', country_name: 'United States', allocated: '10000', spent: '4500' },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let request: typeof import('supertest').default;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Budget Allocation Model E2E Workflow Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Workflow 1: Full model generation with structural validation
  // =========================================================================

  it('generates a budget model where allocations sum to total budget', async () => {
    setupModelMocks();
    const token = generateTestToken('admin');

    const response = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const model = response.body.data;
    expect(model.total_budget).toBeGreaterThan(0);

    // Verify allocations sum to total budget
    const allocationSum = model.allocations.reduce(
      (sum: number, a: { amount: number }) => sum + a.amount,
      0,
    );
    expect(Math.abs(allocationSum - model.total_budget)).toBeLessThan(0.01);

    // Verify percentages sum to ~100%
    const percentageSum = model.allocations.reduce(
      (sum: number, a: { percentage: number }) => sum + a.percentage,
      0,
    );
    expect(Math.abs(percentageSum - 100)).toBeLessThan(0.1);
  });

  // =========================================================================
  // Workflow 2: Velocity tracking with trend detection
  // =========================================================================

  it('computes velocity and detects spending trends correctly', async () => {
    setupVelocityMocks();
    const token = generateTestToken('analyst');

    const response = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model/velocity`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const velocity = response.body.data;
    expect(velocity.current_daily_rate).toBeGreaterThan(0);
    expect(velocity.current_weekly_rate).toBeCloseTo(velocity.current_daily_rate * 7, 0);
    expect(velocity.projected_monthly_rate).toBeCloseTo(velocity.current_daily_rate * 30, 0);
    expect(velocity.budget_remaining).toBe(5500);
    expect(velocity.days_remaining).toBeGreaterThan(0);
    expect(['accelerating', 'decelerating', 'stable']).toContain(velocity.velocity_trend);
  });

  // =========================================================================
  // Workflow 3: Utilization with channel + country breakdowns
  // =========================================================================

  it('returns utilization where channel spend sums to total spent', async () => {
    setupUtilizationMocks();
    const token = generateTestToken('campaign_manager');

    const response = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model/utilization`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const util = response.body.data;
    expect(util.total_budget).toBe(10000);
    expect(util.total_spent).toBe(4500);
    expect(util.utilization_pct).toBe(45);

    // Channel spent values sum to total spent
    const channelSpentSum = util.by_channel.reduce(
      (sum: number, c: { spent: number }) => sum + c.spent,
      0,
    );
    expect(Math.abs(channelSpentSum - util.total_spent)).toBeLessThan(0.01);

    // Each channel has a valid utilization percentage
    for (const ch of util.by_channel) {
      expect(ch.utilization_pct).toBeGreaterThanOrEqual(0);
      expect(ch.utilization_pct).toBeLessThanOrEqual(100);
    }
  });

  // =========================================================================
  // Workflow 4: Full lifecycle across all endpoints
  // =========================================================================

  it('completes a full lifecycle: model -> velocity -> utilization', async () => {
    const token = generateTestToken('admin');

    // Step 1: Get budget model
    setupModelMocks();
    const modelResponse = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(modelResponse.body.success).toBe(true);
    const totalBudget = modelResponse.body.data.total_budget;
    expect(totalBudget).toBeGreaterThan(0);

    // Step 2: Check spending velocity
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    setupVelocityMocks();

    const velocityResponse = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model/velocity`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(velocityResponse.body.success).toBe(true);
    expect(velocityResponse.body.data.budget_remaining).toBeGreaterThanOrEqual(0);

    // Step 3: Check utilization
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    setupUtilizationMocks();

    const utilizationResponse = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model/utilization`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(utilizationResponse.body.success).toBe(true);
    expect(utilizationResponse.body.data.utilization_pct).toBeGreaterThanOrEqual(0);
    expect(utilizationResponse.body.data.utilization_pct).toBeLessThanOrEqual(100);
  });

  // =========================================================================
  // Workflow 5: Empty state - no allocations in DB
  // =========================================================================

  it('handles empty state gracefully when no allocations exist', async () => {
    setupModelMocks({ allocations: [] });
    const token = generateTestToken('admin');

    const response = await request(app)
      .get(`${API_PREFIX}/final-outputs/budget-model`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const model = response.body.data;
    expect(model.total_budget).toBe(0);
    expect(model.allocations).toEqual([]);
    expect(model.country_budgets).toEqual([]);
  });
});

/**
 * Unit tests for BudgetAllocationOutputService.
 *
 * Tests the three main public methods:
 *   - generateBudgetAllocationModel()
 *   - getSpendingVelocity()
 *   - getBudgetUtilization()
 *
 * All database and cache interactions are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();
jest.mock('../../../../src/config/database', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
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

jest.mock('../../../../src/utils/logger', () => ({
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

import { BudgetAllocationOutputService } from '../../../../src/services/final-outputs/BudgetAllocationOutputService';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function makeDailySpendRow(date: string, amount: number) {
  return { spend_date: date, daily_total: String(amount) };
}

/**
 * Sets up mock query responses for generateBudgetAllocationModel.
 * Accepts optional overrides for each query response.
 */
function setupModelQueryMocks(options: {
  allocations?: Record<string, unknown>[];
  currency?: string;
  roasData?: Array<{ platform: string; avg_roas: string }>;
  agentDecision?: Record<string, unknown> | null;
  avgConfidence?: string;
} = {}) {
  const allocations = options.allocations ?? [makeAllocationRow()];
  const currency = options.currency ?? 'USD';
  const roasData = options.roasData ?? [
    { platform: 'google', avg_roas: '3.5' },
    { platform: 'meta', avg_roas: '2.1' },
    { platform: 'tiktok', avg_roas: '1.2' },
  ];
  const agentDecision = options.agentDecision !== undefined ? options.agentDecision : {
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
  };
  const avgConfidence = options.avgConfidence ?? '72';

  let callIndex = 0;
  mockQuery.mockImplementation(() => {
    callIndex++;
    // Call 1: active allocations
    if (callIndex === 1) {
      return { rows: allocations, rowCount: allocations.length };
    }
    // Call 2: currency
    if (callIndex === 2) {
      return { rows: [{ currency }], rowCount: 1 };
    }
    // Call 3: ROAS data from campaigns
    if (callIndex === 3) {
      return { rows: roasData, rowCount: roasData.length };
    }
    // Call 4: agent decisions (optimization status)
    if (callIndex === 4) {
      return agentDecision
        ? { rows: [agentDecision], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    // Call 5: countries (for country budgets)
    if (callIndex === 5) {
      return { rows: [{ id: 'country-us', code: 'US' }], rowCount: 1 };
    }
    // Call 6: agent config (if no guardrails found)
    if (callIndex === 6) {
      return { rows: [], rowCount: 0 };
    }
    // Call 7: agent decisions (reallocation recommendations)
    if (callIndex === 7) {
      return agentDecision
        ? { rows: [agentDecision], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    // Call 8: avg confidence
    if (callIndex === 8) {
      return { rows: [{ avg_confidence: avgConfidence }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetAllocationOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // generateBudgetAllocationModel
  // =========================================================================

  describe('generateBudgetAllocationModel', () => {
    it('returns a complete budget allocation model with all required fields', async () => {
      setupModelQueryMocks();

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model).toHaveProperty('total_budget');
      expect(model).toHaveProperty('currency');
      expect(model).toHaveProperty('allocations');
      expect(model).toHaveProperty('country_budgets');
      expect(model).toHaveProperty('guardrails');
      expect(model).toHaveProperty('reallocation_recommendations');
      expect(model).toHaveProperty('generated_at');
      expect(model).toHaveProperty('confidence_score');
    });

    it('computes total budget from all active allocations', async () => {
      const allocations = [
        makeAllocationRow({ id: 'alloc-001', total_budget: '10000' }),
        makeAllocationRow({ id: 'alloc-002', country_id: 'country-de', total_budget: '5000' }),
      ];

      setupModelQueryMocks({ allocations });

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model.total_budget).toBe(15000);
    });

    it('returns the correct currency from the database', async () => {
      setupModelQueryMocks({ currency: 'EUR' });

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model.currency).toBe('EUR');
    });

    it('builds channel allocations with ROAS and optimization status from agent data', async () => {
      setupModelQueryMocks();

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model.allocations.length).toBeGreaterThan(0);
      for (const alloc of model.allocations) {
        expect(alloc).toHaveProperty('category');
        expect(alloc).toHaveProperty('subcategory');
        expect(alloc).toHaveProperty('amount');
        expect(alloc).toHaveProperty('percentage');
        expect(alloc).toHaveProperty('expected_roi');
        expect(alloc).toHaveProperty('risk_level');
        expect(alloc).toHaveProperty('optimization_status');
        expect(typeof alloc.amount).toBe('number');
        expect(typeof alloc.percentage).toBe('number');
      }
    });

    it('derives guardrails from allocation risk_guardrails in DB', async () => {
      setupModelQueryMocks();

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model.guardrails).toHaveProperty('max_single_channel_pct');
      expect(model.guardrails).toHaveProperty('max_single_country_pct');
      expect(model.guardrails).toHaveProperty('min_roas_threshold');
      expect(model.guardrails).toHaveProperty('daily_spend_cap');
      // Should reflect values from the mock guardrails
      expect(model.guardrails.max_single_channel_pct).toBe(50);
      expect(model.guardrails.daily_spend_cap).toBe(500);
      expect(model.guardrails.min_roas_threshold).toBe(1.5);
    });

    it('returns cached model when available', async () => {
      const cachedModel = {
        total_budget: 10000,
        currency: 'USD',
        allocations: [],
        country_budgets: [],
        guardrails: {
          max_single_channel_pct: 50,
          max_single_country_pct: 40,
          min_roas_threshold: 1.5,
          daily_spend_cap: 500,
        },
        reallocation_recommendations: [],
        generated_at: new Date().toISOString(),
        confidence_score: 72,
      };

      mockCacheGet.mockResolvedValueOnce(cachedModel);

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model).toEqual(cachedModel);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('handles empty allocations gracefully', async () => {
      setupModelQueryMocks({
        allocations: [],
        agentDecision: null,
        avgConfidence: '0',
      });

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(model.total_budget).toBe(0);
      expect(model.allocations).toEqual([]);
      expect(model.country_budgets).toEqual([]);
    });

    it('produces reallocation recommendations from agent decisions', async () => {
      setupModelQueryMocks();

      const model = await BudgetAllocationOutputService.generateBudgetAllocationModel();

      expect(Array.isArray(model.reallocation_recommendations)).toBe(true);
      if (model.reallocation_recommendations.length > 0) {
        const rec = model.reallocation_recommendations[0];
        expect(rec).toHaveProperty('from_channel');
        expect(rec).toHaveProperty('to_channel');
        expect(rec).toHaveProperty('amount');
        expect(rec).toHaveProperty('expected_improvement_pct');
        expect(rec).toHaveProperty('confidence');
        expect(typeof rec.amount).toBe('number');
        expect(rec.amount).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // getSpendingVelocity
  // =========================================================================

  describe('getSpendingVelocity', () => {
    it('returns spending velocity with all required fields', async () => {
      // Mock daily spend records
      const today = new Date();
      const dailyRows = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(today.getTime() - i * 86400000);
        dailyRows.push(makeDailySpendRow(date.toISOString().split('T')[0], 300 + i * 10));
      }

      let callIndex = 0;
      mockQuery.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return { rows: dailyRows, rowCount: dailyRows.length };
        }
        // Budget remaining query
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

      const velocity = await BudgetAllocationOutputService.getSpendingVelocity();

      expect(velocity).toHaveProperty('current_daily_rate');
      expect(velocity).toHaveProperty('current_weekly_rate');
      expect(velocity).toHaveProperty('projected_monthly_rate');
      expect(velocity).toHaveProperty('budget_remaining');
      expect(velocity).toHaveProperty('days_remaining');
      expect(velocity).toHaveProperty('projected_exhaustion_date');
      expect(velocity).toHaveProperty('on_track');
      expect(velocity).toHaveProperty('velocity_trend');

      expect(typeof velocity.current_daily_rate).toBe('number');
      expect(velocity.current_daily_rate).toBeGreaterThan(0);
      expect(velocity.budget_remaining).toBe(5500);
    });

    it('detects accelerating spend velocity trend', async () => {
      // Recent week: higher spend
      const rows = [];
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(today.getTime() - i * 86400000);
        rows.push(makeDailySpendRow(date.toISOString().split('T')[0], 500));
      }
      // Previous week: lower spend
      for (let i = 7; i < 14; i++) {
        const date = new Date(today.getTime() - i * 86400000);
        rows.push(makeDailySpendRow(date.toISOString().split('T')[0], 200));
      }

      let callIndex = 0;
      mockQuery.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return { rows, rowCount: rows.length };
        if (callIndex === 2) {
          return {
            rows: [{
              total_budget: '20000',
              total_spent: '5000',
              earliest_start: new Date(Date.now() - 30 * 86400000).toISOString(),
              latest_end: new Date(Date.now() + 30 * 86400000).toISOString(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const velocity = await BudgetAllocationOutputService.getSpendingVelocity();

      expect(velocity.velocity_trend).toBe('accelerating');
    });

    it('returns cached velocity when available', async () => {
      const cachedVelocity = {
        current_daily_rate: 300,
        current_weekly_rate: 2100,
        projected_monthly_rate: 9000,
        budget_remaining: 5500,
        days_remaining: 15,
        projected_exhaustion_date: null,
        on_track: true,
        velocity_trend: 'stable' as const,
      };

      mockCacheGet.mockResolvedValueOnce(cachedVelocity);

      const velocity = await BudgetAllocationOutputService.getSpendingVelocity();

      expect(velocity).toEqual(cachedVelocity);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getBudgetUtilization
  // =========================================================================

  describe('getBudgetUtilization', () => {
    it('returns budget utilization with all required fields', async () => {
      let callIndex = 0;
      mockQuery.mockImplementation(() => {
        callIndex++;
        // Totals
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
        // Channel utilization
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
        // Country utilization
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

      const utilization = await BudgetAllocationOutputService.getBudgetUtilization();

      expect(utilization).toHaveProperty('total_budget', 10000);
      expect(utilization).toHaveProperty('total_spent', 4500);
      expect(utilization).toHaveProperty('utilization_pct', 45);
      expect(utilization).toHaveProperty('by_channel');
      expect(utilization).toHaveProperty('by_country');
      expect(utilization).toHaveProperty('period_start');
      expect(utilization).toHaveProperty('period_end');

      expect(utilization.by_channel).toHaveLength(3);
      expect(utilization.by_country).toHaveLength(1);
    });

    it('computes channel-level utilization percentages correctly', async () => {
      let callIndex = 0;
      mockQuery.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return {
            rows: [{ total_budget: '10000', total_spent: '5000', period_start: '2026-01-01', period_end: '2026-06-30' }],
            rowCount: 1,
          };
        }
        if (callIndex === 2) {
          return {
            rows: [
              { channel: 'google', allocated: '6000', spent: '3000' },
              { channel: 'meta', allocated: '4000', spent: '2000' },
            ],
            rowCount: 2,
          };
        }
        if (callIndex === 3) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      const utilization = await BudgetAllocationOutputService.getBudgetUtilization();

      expect(utilization.by_channel[0].utilization_pct).toBe(50);
      expect(utilization.by_channel[1].utilization_pct).toBe(50);
    });

    it('returns cached utilization when available', async () => {
      const cachedUtilization = {
        total_budget: 10000,
        total_spent: 4500,
        utilization_pct: 45,
        by_channel: [],
        by_country: [],
        period_start: '2026-01-01',
        period_end: '2026-06-30',
      };

      mockCacheGet.mockResolvedValueOnce(cachedUtilization);

      const utilization = await BudgetAllocationOutputService.getBudgetUtilization();

      expect(utilization).toEqual(cachedUtilization);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('handles zero budget gracefully', async () => {
      let callIndex = 0;
      mockQuery.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return {
            rows: [{ total_budget: '0', total_spent: '0', period_start: '2026-01-01', period_end: '2026-06-30' }],
            rowCount: 1,
          };
        }
        if (callIndex === 2) return { rows: [], rowCount: 0 };
        if (callIndex === 3) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      const utilization = await BudgetAllocationOutputService.getBudgetUtilization();

      expect(utilization.total_budget).toBe(0);
      expect(utilization.total_spent).toBe(0);
      expect(utilization.utilization_pct).toBe(0);
    });
  });
});

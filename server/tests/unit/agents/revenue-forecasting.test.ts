// ============================================================
// Revenue Forecasting Agent - Unit Tests
// Agent 19: Revenue Forecasting & Financial Modeling
//
// Tests cover: configuration, forecast generation, LTV/CAC
// modeling, break-even analysis, scenario simulation, ROI
// projection, payback period, trend analysis, sensitivity
// analysis, and the main process() pipeline.
// ============================================================

// ---- Mocks — must be declared before imports ----

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../src/config/redis', () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/utils/logger', () => ({
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-id-123'),
  retryWithBackoff: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

// ---- Imports (after mocks) ----

import { RevenueForecastingAgent } from '../../../src/agents/modules/RevenueForecastingAgent';
import type {
  ScenarioConfig,
} from '../../../src/agents/modules/RevenueForecastingAgent';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

// ---- Test Helpers ----

/**
 * Builds mock historical revenue rows that pool.query would return
 * from the campaigns table aggregation query.
 */
function buildRevenueRows(count: number, baseRevenue = 10000, monthlyGrowth = 500) {
  return Array.from({ length: count }, (_, i) => ({
    period: `2025-${String(i + 1).padStart(2, '0')}`,
    revenue: String(baseRevenue + i * monthlyGrowth),
  }));
}

/**
 * Builds mock campaign spend rows for CAC/ROI calculations.
 */
function buildSpendRows(count: number, opts?: {
  platform?: string;
  spend?: number;
  conversions?: number;
  roas?: number;
  clicks?: number;
}) {
  const platform = opts?.platform ?? 'google';
  const spend = opts?.spend ?? 1000;
  const conversions = opts?.conversions ?? 50;
  const roas = opts?.roas ?? 3;
  const clicks = opts?.clicks ?? 500;

  return Array.from({ length: count }, () => ({
    platform,
    spend: String(spend),
    conversions: String(conversions),
    revenue: String(spend * roas),
    clicks: String(clicks),
  }));
}

/**
 * Sets up mockPool.query to return revenue rows, then spend rows,
 * then budget rows, then additional calls as empty. This covers
 * the typical fetch sequence used by the agent.
 */
function setupStandardMocks(
  revenueCount = 6,
  spendCount = 6,
  fixedCosts = 50000,
) {
  const revenueRows = buildRevenueRows(revenueCount);
  const spendRows = buildSpendRows(spendCount);

  // The agent may issue multiple queries in sequence. We return
  // rows for the first few calls and empty results for the rest.
  mockPool.query.mockImplementation(() => {
    const callCount = mockPool.query.mock.calls.length;
    // All revenue queries return revenue data, all spend queries return spend data
    // We use a simple heuristic: if the SQL contains 'budget_allocations' return fixed costs
    const lastCall = mockPool.query.mock.calls[callCount - 1];
    const sql = typeof lastCall[0] === 'string' ? lastCall[0] : '';

    if (sql.includes('budget_allocations')) {
      return Promise.resolve({ rows: [{ fixed_costs: String(fixedCosts) }] });
    }
    if (sql.includes('roas') && sql.includes('GROUP BY')) {
      return Promise.resolve({ rows: revenueRows });
    }
    if (sql.includes('platform') && !sql.includes('GROUP BY')) {
      return Promise.resolve({ rows: spendRows });
    }
    // agent_states and agent_decisions
    return Promise.resolve({ rows: [] });
  });
}

// ---- Test Suite ----

describe('RevenueForecastingAgent', () => {
  let agent: RevenueForecastingAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new RevenueForecastingAgent();
  });

  // ------------------------------------------------------------------
  // 1. Constructor & Configuration
  // ------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('should set agentType to revenue_forecasting', () => {
      expect(agent.getAgentType()).toBe('revenue_forecasting');
    });

    it('should use opus model for complex financial modeling', () => {
      const config = agent.getConfig();
      expect(config.model).toBe('opus');
    });

    it('should accept custom configuration overrides', () => {
      const custom = new RevenueForecastingAgent({
        confidenceThreshold: 80,
        maxRetries: 5,
        timeoutMs: 60_000,
      });
      const config = custom.getConfig();
      expect(config.confidenceThreshold).toBe(80);
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(60_000);
    });

    it('should return correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toContain('performance_analytics');
      expect(targets).toContain('budget_optimization');
      expect(targets).toContain('market_intelligence');
      expect(targets).toHaveLength(3);
    });

    it('should return a non-empty system prompt mentioning forecasting', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Revenue Forecasting');
    });
  });

  // ------------------------------------------------------------------
  // 2. generateForecast
  // ------------------------------------------------------------------

  describe('generateForecast', () => {
    it('should generate forecast periods matching the requested horizon', async () => {
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(8) });
      const result = await agent.generateForecast(6);
      expect(result.horizon).toBe(6);
      expect(result.periods).toHaveLength(6);
    });

    it('should compute totalProjected as the sum of period revenues', async () => {
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(8) });
      const result = await agent.generateForecast(4);
      const sum = result.periods.reduce((s, p) => s + p.revenue, 0);
      expect(Math.abs(result.totalProjected - sum)).toBeLessThan(0.02);
    });

    it('should return an empty forecast when no historical data exists', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await agent.generateForecast(12);
      expect(result.periods).toHaveLength(0);
      expect(result.totalProjected).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('should include assumptions and risks arrays', async () => {
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(4) });
      const result = await agent.generateForecast(6);
      expect(result.assumptions.length).toBeGreaterThan(0);
      // Limited data triggers a risk
      expect(result.risks.some((r) => r.includes('Limited historical data'))).toBe(true);
    });

    it('should serve cached forecast when available', async () => {
      const cached = {
        horizon: 6,
        periods: [],
        totalProjected: 99999,
        confidence: 75,
        assumptions: ['cached'],
        risks: [],
      };
      mockCacheGet.mockResolvedValueOnce(cached);
      const result = await agent.generateForecast(6);
      expect(result.totalProjected).toBe(99999);
    });

    it('should produce non-negative revenues for all periods', async () => {
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(10) });
      const result = await agent.generateForecast(12);
      for (const period of result.periods) {
        expect(period.revenue).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ------------------------------------------------------------------
  // 3. modelLTV
  // ------------------------------------------------------------------

  describe('modelLTV', () => {
    it('should compute averageLTV from revenue and conversions', async () => {
      // First call: historical revenue, second call: campaign spend
      mockPool.query
        .mockResolvedValueOnce({ rows: buildRevenueRows(6) })   // revenue
        .mockResolvedValueOnce({ rows: buildSpendRows(6) });     // spend

      const result = await agent.modelLTV();
      expect(result.averageLTV).toBeGreaterThan(0);
      expect(result.methodology).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should compute ltvToCAC ratio', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: buildRevenueRows(6) })
        .mockResolvedValueOnce({ rows: buildSpendRows(6) });

      const result = await agent.modelLTV();
      expect(result.ltvToCAC).toBeGreaterThanOrEqual(0);
      expect(typeof result.ltvToCAC).toBe('number');
    });

    it('should return empty model when no revenue data exists', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })   // revenue
        .mockResolvedValueOnce({ rows: [] });   // spend

      const result = await agent.modelLTV();
      expect(result.averageLTV).toBe(0);
      expect(result.ltvToCAC).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should build per-segment breakdown by platform', async () => {
      // Mixed platforms
      const spendRows = [
        ...buildSpendRows(3, { platform: 'google', spend: 1000, conversions: 50, roas: 3 }),
        ...buildSpendRows(3, { platform: 'meta', spend: 800, conversions: 40, roas: 2 }),
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: buildRevenueRows(6) })
        .mockResolvedValueOnce({ rows: spendRows });

      const result = await agent.modelLTV();
      expect(Object.keys(result.bySegment).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ------------------------------------------------------------------
  // 4. modelCAC
  // ------------------------------------------------------------------

  describe('modelCAC', () => {
    it('should compute averageCAC from spend and conversions', async () => {
      mockPool.query.mockResolvedValue({
        rows: buildSpendRows(6, { spend: 2000, conversions: 100 }),
      });
      const result = await agent.modelCAC();
      // 2000 / 100 = 20
      expect(result.averageCAC).toBe(20);
    });

    it('should determine CAC trend from time-ordered data', async () => {
      // First half: low CAC, second half: high CAC => increasing
      const rows = [
        ...buildSpendRows(3, { spend: 1000, conversions: 100 }), // CAC = 10
        ...buildSpendRows(3, { spend: 3000, conversions: 100 }), // CAC = 30
      ];
      mockPool.query.mockResolvedValue({ rows });
      const result = await agent.modelCAC();
      expect(result.trend).toBe('increasing');
    });

    it('should return empty model when no campaign data exists', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await agent.modelCAC();
      expect(result.averageCAC).toBe(0);
      expect(result.trend).toBe('stable');
      expect(result.efficiency).toBe(0);
    });

    it('should filter by channel when specified', async () => {
      const rows = [
        ...buildSpendRows(3, { platform: 'google', spend: 1000, conversions: 50 }),
        ...buildSpendRows(3, { platform: 'meta', spend: 2000, conversions: 40 }),
      ];
      mockPool.query.mockResolvedValue({ rows });
      const result = await agent.modelCAC('google');
      expect(result.byChannel).toHaveProperty('google');
      expect(Object.keys(result.byChannel)).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // 5. calculateBreakEven
  // ------------------------------------------------------------------

  describe('calculateBreakEven', () => {
    it('should compute break-even with valid data', async () => {
      // spend data, revenue data, fixed costs
      mockPool.query.mockImplementation((_sql: string) => {
        const sql = typeof _sql === 'string' ? _sql : '';
        if (sql.includes('budget_allocations')) {
          return Promise.resolve({ rows: [{ fixed_costs: '50000' }] });
        }
        if (sql.includes('GROUP BY')) {
          return Promise.resolve({ rows: buildRevenueRows(6, 10000, 1000) });
        }
        return Promise.resolve({
          rows: buildSpendRows(6, { spend: 1000, conversions: 50, roas: 3 }),
        });
      });

      const result = await agent.calculateBreakEven();
      expect(result.fixedCosts).toBe(50000);
      expect(result.variableCostPerUnit).toBeGreaterThan(0);
      expect(result.averageRevPerUnit).toBeGreaterThan(0);
      expect(result.unitsToBreakEven).toBeGreaterThan(0);
    });

    it('should return empty analysis when no data is available', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await agent.calculateBreakEven();
      expect(result.breakEvenPoint).toBe(0);
      expect(result.timeToBreakEven).toBe('Unable to determine');
      expect(result.unitsToBreakEven).toBe(0);
    });

    it('should include sensitivity data when contribution margin is positive', async () => {
      mockPool.query.mockImplementation((_sql: string) => {
        const sql = typeof _sql === 'string' ? _sql : '';
        if (sql.includes('budget_allocations')) {
          return Promise.resolve({ rows: [{ fixed_costs: '10000' }] });
        }
        if (sql.includes('GROUP BY')) {
          return Promise.resolve({ rows: buildRevenueRows(6, 20000, 0) });
        }
        return Promise.resolve({
          rows: buildSpendRows(6, { spend: 500, conversions: 50, roas: 5 }),
        });
      });

      const result = await agent.calculateBreakEven();
      if (result.averageRevPerUnit > result.variableCostPerUnit) {
        expect(Object.keys(result.sensitivity).length).toBeGreaterThan(0);
      }
    });
  });

  // ------------------------------------------------------------------
  // 6. simulateScenario / runAllScenarios
  // ------------------------------------------------------------------

  describe('scenario simulation', () => {
    beforeEach(() => {
      mockPool.query.mockImplementation((_sql: string) => {
        const sql = typeof _sql === 'string' ? _sql : '';
        if (sql.includes('GROUP BY')) {
          return Promise.resolve({ rows: buildRevenueRows(6, 10000, 500) });
        }
        return Promise.resolve({
          rows: buildSpendRows(6, { spend: 1000, conversions: 50, roas: 3 }),
        });
      });
    });

    it('should produce different revenue for conservative vs aggressive', async () => {
      const conservative: ScenarioConfig = {
        name: 'conservative',
        assumptions: { growthMultiplier: 0.6 },
        horizon: 6,
      };
      const aggressive: ScenarioConfig = {
        name: 'aggressive',
        assumptions: { growthMultiplier: 1.5 },
        horizon: 6,
      };

      const consResult = await agent.simulateScenario(conservative);
      const aggrResult = await agent.simulateScenario(aggressive);

      expect(aggrResult.revenue).toBeGreaterThan(consResult.revenue);
    });

    it('should include timeline with correct number of periods', async () => {
      const config: ScenarioConfig = {
        name: 'base',
        assumptions: { growthMultiplier: 1.0 },
        horizon: 8,
      };
      const result = await agent.simulateScenario(config);
      expect(result.timeline).toHaveLength(8);
      expect(result.name).toBe('base');
    });

    it('should include probability and risks in scenario results', async () => {
      const config: ScenarioConfig = {
        name: 'aggressive',
        assumptions: { growthMultiplier: 1.5 },
        horizon: 6,
      };
      const result = await agent.simulateScenario(config);
      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('runAllScenarios should return all three tiers with a recommendation', async () => {
      const comparison = await agent.runAllScenarios();
      expect(comparison.conservative).toBeDefined();
      expect(comparison.base).toBeDefined();
      expect(comparison.aggressive).toBeDefined();
      expect(comparison.conservative.name).toBe('conservative');
      expect(comparison.base.name).toBe('base');
      expect(comparison.aggressive.name).toBe('aggressive');
      expect(comparison.recommendation).toBeTruthy();
      expect(comparison.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ------------------------------------------------------------------
  // 7. projectROI
  // ------------------------------------------------------------------

  describe('projectROI', () => {
    it('should project revenue based on historical ROAS', async () => {
      mockPool.query.mockResolvedValue({
        rows: buildSpendRows(4, { platform: 'google', spend: 1000, roas: 3 }),
      });

      const result = await agent.projectROI(5000, 'google', 12);
      // ROAS = 3, so projected revenue = 5000 * 3 = 15000
      expect(result.projectedRevenue).toBe(15000);
      expect(result.projectedROI).toBe(2); // (15000 - 5000) / 5000
      expect(result.investment).toBe(5000);
      expect(result.channel).toBe('google');
    });

    it('should return zero projection when no channel data exists', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await agent.projectROI(10000, 'tiktok', 6);
      expect(result.projectedRevenue).toBe(0);
      expect(result.projectedROI).toBe(0);
      expect(result.confidence).toBe(10);
    });
  });

  // ------------------------------------------------------------------
  // 8. calculatePaybackPeriod
  // ------------------------------------------------------------------

  describe('calculatePaybackPeriod', () => {
    it('should calculate months to break even', async () => {
      mockPool.query.mockResolvedValue({
        rows: buildSpendRows(6, { platform: 'meta', spend: 500, conversions: 25, roas: 4 }),
      });
      const result = await agent.calculatePaybackPeriod(3000, 'meta');
      expect(result.months).toBeGreaterThan(0);
      expect(result.cumulativeRevenue.length).toBeGreaterThan(0);
      expect(result.breakEvenMonth).toBeGreaterThan(0);
    });

    it('should return empty result for zero investment', async () => {
      mockPool.query.mockResolvedValue({
        rows: buildSpendRows(3, { platform: 'google' }),
      });
      const result = await agent.calculatePaybackPeriod(0, 'google');
      expect(result.months).toBe(0);
      expect(result.cumulativeRevenue).toHaveLength(0);
    });

    it('should return empty result when channel has no data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await agent.calculatePaybackPeriod(5000, 'unknown');
      expect(result.months).toBe(0);
      expect(result.confidence).toBe(10);
    });
  });

  // ------------------------------------------------------------------
  // 9. trendAnalysis
  // ------------------------------------------------------------------

  describe('trendAnalysis', () => {
    it('should detect upward trend with positive slope', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { period: '2025-01', value: '1000' },
          { period: '2025-02', value: '1200' },
          { period: '2025-03', value: '1400' },
          { period: '2025-04', value: '1600' },
        ],
      });

      const result = await agent.trendAnalysis('revenue', 4);
      expect(result.direction).toBe('up');
      expect(result.magnitude).toBeGreaterThan(0);
      expect(result.projection.length).toBeGreaterThan(0);
    });

    it('should return stable for insufficient data', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ period: '2025-01', value: '500' }],
      });
      const result = await agent.trendAnalysis('cac', 1);
      expect(result.direction).toBe('stable');
      expect(result.magnitude).toBe(0);
      expect(result.projection).toHaveLength(0);
    });

    it('should produce non-negative projections', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { period: '2025-01', value: '100' },
          { period: '2025-02', value: '90' },
          { period: '2025-03', value: '80' },
        ],
      });
      const result = await agent.trendAnalysis('revenue', 3);
      for (const val of result.projection) {
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ------------------------------------------------------------------
  // 10. sensitivityAnalysis
  // ------------------------------------------------------------------

  describe('sensitivityAnalysis', () => {
    beforeEach(() => {
      mockPool.query.mockImplementation((_sql: string) => {
        const sql = typeof _sql === 'string' ? _sql : '';
        if (sql.includes('GROUP BY')) {
          return Promise.resolve({ rows: buildRevenueRows(6, 10000, 500) });
        }
        return Promise.resolve({
          rows: buildSpendRows(6, { spend: 1000, conversions: 50, roas: 3, clicks: 500 }),
        });
      });
    });

    it('should produce impact entries spanning the specified range', async () => {
      const result = await agent.sensitivityAnalysis('cac', [-0.2, 0.2]);
      expect(result.variable).toBe('cac');
      expect(result.baseValue).toBeGreaterThan(0);
      expect(result.impacts.length).toBe(6); // 5 steps + 1
      expect(result.impacts[0].change).toBeCloseTo(-0.2, 2);
      expect(result.impacts[result.impacts.length - 1].change).toBeCloseTo(0.2, 2);
    });

    it('should calculate revenue impact for conversion_rate variable', async () => {
      const result = await agent.sensitivityAnalysis('conversion_rate', [-0.1, 0.1]);
      expect(result.variable).toBe('conversion_rate');
      // Positive change in conversion rate should increase revenue
      const positiveChange = result.impacts.find((i) => i.change > 0);
      expect(positiveChange).toBeDefined();
      expect(positiveChange!.revenueImpact).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // 11. process() - main pipeline
  // ------------------------------------------------------------------

  describe('process', () => {
    it('should return a complete output with all financial models', async () => {
      setupStandardMocks(8, 8, 30000);

      const output = await agent.process({
        context: {},
        parameters: { horizon: 6 },
        requestId: 'test-req-1',
      });

      expect(output.agentType).toBe('revenue_forecasting');
      expect(output.decision).toBe('revenue_forecast_complete');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.reasoning).toContain('revenue forecast');
      expect(output.timestamp).toBeTruthy();

      const data = output.data as Record<string, unknown>;
      expect(data.forecast).toBeDefined();
      expect(data.ltvModel).toBeDefined();
      expect(data.cacModel).toBeDefined();
      expect(data.breakEven).toBeDefined();
      expect(data.scenarioComparison).toBeDefined();
    });

    it('should flag uncertainties when no data is available', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const output = await agent.process({
        context: {},
        parameters: {},
        requestId: 'test-req-empty',
      });

      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.uncertainties.some((u) => u.includes('data'))).toBe(true);
    });

    it('should include confidence factors in the output', async () => {
      setupStandardMocks(6, 6, 20000);

      const output = await agent.process({
        context: {},
        parameters: {},
        requestId: 'test-req-conf',
      });

      expect(output.confidence.factors).toHaveProperty('dataAvailability');
      expect(output.confidence.factors).toHaveProperty('spendDataCoverage');
      expect(output.confidence.factors).toHaveProperty('forecastHorizonPenalty');
    });

    it('should handle partial failures gracefully and still return output', async () => {
      // Revenue query succeeds but spend query fails
      let callIdx = 0;
      mockPool.query.mockImplementation(() => {
        callIdx++;
        if (callIdx <= 2) {
          return Promise.resolve({ rows: buildRevenueRows(6) });
        }
        return Promise.reject(new Error('Connection lost'));
      });

      const output = await agent.process({
        context: {},
        parameters: {},
        requestId: 'test-req-partial',
      });

      // Should still produce output even if some sub-analyses fail
      expect(output.agentType).toBe('revenue_forecasting');
      expect(output.decision).toBe('revenue_forecast_complete');
    });
  });

  // ------------------------------------------------------------------
  // 12. Confidence scoring
  // ------------------------------------------------------------------

  describe('confidence scoring', () => {
    it('should produce higher confidence with more data', async () => {
      // Run with minimal data
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(3) });
      const small = await agent.generateForecast(6);

      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(12) });
      mockCacheGet.mockResolvedValue(null);
      const large = await agent.generateForecast(6);

      expect(large.confidence).toBeGreaterThan(small.confidence);
    });

    it('should reduce confidence for longer horizons', async () => {
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(10) });

      const short = await agent.generateForecast(3);
      mockCacheGet.mockResolvedValue(null);
      mockPool.query.mockResolvedValue({ rows: buildRevenueRows(10) });

      const long = await agent.generateForecast(20);

      expect(short.confidence).toBeGreaterThan(long.confidence);
    });
  });
});

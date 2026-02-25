// ============================================================
// Revenue Forecasting Agent - Unit Tests
// ============================================================

import { RevenueForecastingAgent } from '../../../src/agents/modules/RevenueForecastingAgent';

// ---- Mocks ----

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

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

describe('RevenueForecastingAgent', () => {
  let agent: RevenueForecastingAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new RevenueForecastingAgent();
  });

  // ------------------------------------------------------------------
  // Constructor & Configuration
  // ------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('should have correct agent type', () => {
      expect((agent as any).config.agentType).toBe('revenue_forecasting');
    });

    it('should use opus model', () => {
      expect((agent as any).config.model).toBe('opus');
    });

    it('should accept custom config overrides', () => {
      const custom = new RevenueForecastingAgent({ confidenceThreshold: 80 });
      expect((custom as any).config.confidenceThreshold).toBe(80);
    });

    it('should return correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toContain('market_intelligence');
      expect(targets).toContain('budget_optimization');
      expect(targets).toContain('performance_analytics');
      expect(targets).toHaveLength(3);
    });

    it('should return a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Revenue Forecasting');
    });
  });

  // ------------------------------------------------------------------
  // generateForecast
  // ------------------------------------------------------------------

  describe('generateForecast', () => {
    const historicalData = Array.from({ length: 12 }, (_, i) => ({
      period: `2025-${String(i + 1).padStart(2, '0')}`,
      revenue: 10000 + i * 500,
      channel: 'paid_ads',
    }));

    it('should generate projections for the requested horizon', async () => {
      const result = await agent.generateForecast(historicalData, 6, []);
      expect(result.projections).toHaveLength(6);
      expect(result.forecastHorizon).toBe('6 months');
      expect(result.modelUsed).toBe('weighted_linear_regression_seasonal');
    });

    it('should produce non-negative projections', async () => {
      const result = await agent.generateForecast(historicalData, 12, []);
      for (const proj of result.projections) {
        expect(proj.projected).toBeGreaterThanOrEqual(0);
        expect(proj.lowerBound).toBeGreaterThanOrEqual(0);
        expect(proj.upperBound).toBeGreaterThanOrEqual(proj.projected);
      }
    });

    it('should apply seasonal factors when provided', async () => {
      const seasonal = [
        { month: 1, factor: 1.3, trend: 'peak' as const, description: 'January peak' },
        { month: 7, factor: 0.7, trend: 'trough' as const, description: 'July dip' },
      ];
      const result = await agent.generateForecast(historicalData, 12, seasonal);
      expect(result.projections).toHaveLength(12);
      expect(result.totalProjectedRevenue).toBeGreaterThan(0);
    });

    it('should return cached result if available', async () => {
      const cached = {
        projections: [],
        totalProjectedRevenue: 50000,
        averageGrowthRate: 0.05,
        forecastHorizon: '6 months',
        modelUsed: 'cached',
        accuracy: 85,
      };
      mockCacheGet.mockResolvedValueOnce(cached);
      const result = await agent.generateForecast(historicalData, 6, []);
      expect(result.modelUsed).toBe('cached');
    });

    it('should calculate totalProjectedRevenue as sum of projections', async () => {
      const result = await agent.generateForecast(historicalData, 3, []);
      const sum = result.projections.reduce((s, p) => s + p.projected, 0);
      expect(Math.abs(result.totalProjectedRevenue - sum)).toBeLessThan(0.01);
    });
  });

  // ------------------------------------------------------------------
  // generateScenarios
  // ------------------------------------------------------------------

  describe('generateScenarios', () => {
    const baseForecast = {
      projections: [],
      totalProjectedRevenue: 100000,
      averageGrowthRate: 0.05,
      forecastHorizon: '12 months',
      modelUsed: 'test',
      accuracy: 80,
    };

    it('should generate at least 3 scenarios with rule-based fallback', async () => {
      const result = await agent.generateScenarios([], baseForecast);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('should include optimistic, baseline, pessimistic, and worst_case scenarios', async () => {
      const result = await agent.generateScenarios([], baseForecast);
      const names = result.map(s => s.name);
      expect(names).toContain('optimistic');
      expect(names).toContain('baseline');
      expect(names).toContain('pessimistic');
      expect(names).toContain('worst_case');
    });

    it('should have probabilities that are valid (0-1)', async () => {
      const result = await agent.generateScenarios([], baseForecast);
      for (const scenario of result) {
        expect(scenario.probability).toBeGreaterThanOrEqual(0);
        expect(scenario.probability).toBeLessThanOrEqual(1);
      }
    });

    it('should have higher revenue for optimistic than pessimistic', async () => {
      const result = await agent.generateScenarios([], baseForecast);
      const optimistic = result.find(s => s.name === 'optimistic')!;
      const pessimistic = result.find(s => s.name === 'pessimistic')!;
      expect(optimistic.projectedRevenue).toBeGreaterThan(pessimistic.projectedRevenue);
    });
  });

  // ------------------------------------------------------------------
  // identifyRiskFactors
  // ------------------------------------------------------------------

  describe('identifyRiskFactors', () => {
    it('should include systemic risks even with no DB data', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await agent.identifyRiskFactors();
      expect(result.length).toBeGreaterThanOrEqual(3);
      const names = result.map(r => r.name);
      expect(names).toContain('Market volatility');
      expect(names).toContain('Currency fluctuation');
      expect(names).toContain('Regulatory changes');
    });

    it('should merge DB risks with systemic risks', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'risk-1',
            name: 'Supply chain disruption',
            severity_score: 75,
            probability: '0.4',
            potential_impact: '0.3',
            mitigation: 'Diversify suppliers',
            affected_periods: ['2025-Q1'],
          },
        ],
      });
      const result = await agent.identifyRiskFactors('country-1');
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result.find(r => r.name === 'Supply chain disruption')).toBeTruthy();
    });

    it('should return cached results when available', async () => {
      const cached = [{ id: 'cached', name: 'Cached risk', severity: 'low', probability: 0.1, potentialImpact: 0.05, mitigation: 'test', affectedPeriods: [] }];
      mockCacheGet.mockResolvedValueOnce(cached);
      const result = await agent.identifyRiskFactors();
      expect(result).toEqual(cached);
    });

    it('should map severity scores correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'r1', name: 'Low', severity_score: 20, probability: '0.1', potential_impact: '0.05', mitigation: '', affected_periods: [] },
          { id: 'r2', name: 'Medium', severity_score: 45, probability: '0.3', potential_impact: '0.1', mitigation: '', affected_periods: [] },
          { id: 'r3', name: 'High', severity_score: 65, probability: '0.5', potential_impact: '0.2', mitigation: '', affected_periods: [] },
          { id: 'r4', name: 'Critical', severity_score: 90, probability: '0.7', potential_impact: '0.4', mitigation: '', affected_periods: [] },
        ],
      });
      const result = await agent.identifyRiskFactors('c1');
      const dbRisks = result.filter(r => ['Low', 'Medium', 'High', 'Critical'].includes(r.name));
      expect(dbRisks.find(r => r.name === 'Low')!.severity).toBe('low');
      expect(dbRisks.find(r => r.name === 'Medium')!.severity).toBe('medium');
      expect(dbRisks.find(r => r.name === 'High')!.severity).toBe('high');
      expect(dbRisks.find(r => r.name === 'Critical')!.severity).toBe('critical');
    });
  });

  // ------------------------------------------------------------------
  // computeConfidenceIntervals
  // ------------------------------------------------------------------

  describe('computeConfidenceIntervals', () => {
    it('should return an interval for each projection', () => {
      const forecast = {
        projections: [
          { period: '2026-01', projected: 10000, lowerBound: 8000, upperBound: 12000, growthRate: 0.05, confidence: 85 },
          { period: '2026-02', projected: 10500, lowerBound: 8200, upperBound: 12800, growthRate: 0.05, confidence: 80 },
        ],
        totalProjectedRevenue: 20500,
        averageGrowthRate: 0.05,
        forecastHorizon: '2 months',
        modelUsed: 'test',
        accuracy: 80,
      };
      const historical = [
        { period: '2025-11', revenue: 9500 },
        { period: '2025-12', revenue: 9800 },
      ];
      const intervals = agent.computeConfidenceIntervals(forecast, historical);
      expect(intervals).toHaveLength(2);
      expect(intervals[0].period).toBe('2026-01');
    });

    it('should have wider intervals for later periods', () => {
      const forecast = {
        projections: Array.from({ length: 6 }, (_, i) => ({
          period: `2026-${String(i + 1).padStart(2, '0')}`,
          projected: 10000 + i * 500,
          lowerBound: 8000,
          upperBound: 12000,
          growthRate: 0.05,
          confidence: 85 - i * 5,
        })),
        totalProjectedRevenue: 67500,
        averageGrowthRate: 0.05,
        forecastHorizon: '6 months',
        modelUsed: 'test',
        accuracy: 80,
      };
      const historical = Array.from({ length: 12 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, '0')}`,
        revenue: 9000 + i * 200 + Math.random() * 500,
      }));
      const intervals = agent.computeConfidenceIntervals(forecast, historical);
      expect(intervals[5].standardDeviation).toBeGreaterThan(intervals[0].standardDeviation);
    });

    it('should have lower95 <= lower80 <= mean <= upper80 <= upper95', () => {
      const forecast = {
        projections: [
          { period: '2026-01', projected: 10000, lowerBound: 8000, upperBound: 12000, growthRate: 0.05, confidence: 85 },
        ],
        totalProjectedRevenue: 10000,
        averageGrowthRate: 0.05,
        forecastHorizon: '1 month',
        modelUsed: 'test',
        accuracy: 80,
      };
      const historical = Array.from({ length: 12 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, '0')}`,
        revenue: 9000 + i * 200,
      }));
      const intervals = agent.computeConfidenceIntervals(forecast, historical);
      const ci = intervals[0];
      expect(ci.lower95).toBeLessThanOrEqual(ci.lower80);
      expect(ci.lower80).toBeLessThanOrEqual(ci.mean);
      expect(ci.mean).toBeLessThanOrEqual(ci.upper80);
      expect(ci.upper80).toBeLessThanOrEqual(ci.upper95);
    });
  });

  // ------------------------------------------------------------------
  // detectSeasonalPatterns
  // ------------------------------------------------------------------

  describe('detectSeasonalPatterns', () => {
    it('should detect peaks and troughs', async () => {
      const data = Array.from({ length: 24 }, (_, i) => {
        const month = (i % 12) + 1;
        // December peak, June trough
        const factor = month === 12 ? 1.5 : month === 6 ? 0.6 : 1.0;
        return {
          period: `${2024 + Math.floor(i / 12)}-${String(month).padStart(2, '0')}`,
          revenue: 10000 * factor,
        };
      });
      const patterns = await agent.detectSeasonalPatterns(data);
      const december = patterns.find(p => p.month === 12);
      const june = patterns.find(p => p.month === 6);
      expect(december?.trend).toBe('peak');
      expect(june?.trend).toBe('trough');
    });

    it('should return cached result when available', async () => {
      const cached = [{ month: 1, factor: 1.0, trend: 'normal', description: 'Cached' }];
      mockCacheGet.mockResolvedValueOnce(cached);
      const result = await agent.detectSeasonalPatterns([{ period: '2025-01', revenue: 100 }]);
      expect(result).toEqual(cached);
    });

    it('should return empty array when average is zero', async () => {
      const data = [{ period: '2025-01', revenue: 0 }, { period: '2025-02', revenue: 0 }];
      const result = await agent.detectSeasonalPatterns(data);
      expect(result).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // evaluateForecastAccuracy
  // ------------------------------------------------------------------

  describe('evaluateForecastAccuracy', () => {
    it('should compute percentage errors from DB data', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { period: '2025-01', forecasted_revenue: '11000', actual_revenue: '10000' },
          { period: '2025-02', forecasted_revenue: '12000', actual_revenue: '12000' },
        ],
      });
      const result = await agent.evaluateForecastAccuracy();
      expect(result).toHaveLength(2);
      expect(result[0].percentageError).toBe(10);
      expect(result[1].percentageError).toBe(0);
    });

    it('should return empty array on DB error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));
      const result = await agent.evaluateForecastAccuracy();
      expect(result).toEqual([]);
    });

    it('should return cached accuracy data', async () => {
      const cached = [{ period: '2025-01', forecasted: 100, actual: 90, absoluteError: 10, percentageError: 11.11 }];
      mockCacheGet.mockResolvedValueOnce(cached);
      const result = await agent.evaluateForecastAccuracy();
      expect(result).toEqual(cached);
    });
  });

  // ------------------------------------------------------------------
  // identifyGrowthDrivers
  // ------------------------------------------------------------------

  describe('identifyGrowthDrivers', () => {
    it('should identify trend momentum from historical data', async () => {
      const data = Array.from({ length: 6 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, '0')}`,
        revenue: 10000 + i * 1000,
        channel: 'paid_ads',
      }));
      const drivers = await agent.identifyGrowthDrivers(data);
      expect(drivers.length).toBeGreaterThanOrEqual(1);
      const trend = drivers.find(d => d.factor === 'Revenue trend momentum');
      expect(trend).toBeTruthy();
      expect(trend!.direction).toBe('positive');
    });

    it('should detect channel diversification', async () => {
      const data = [
        { period: '2025-01', revenue: 5000, channel: 'paid_ads' },
        { period: '2025-02', revenue: 3000, channel: 'organic' },
        { period: '2025-03', revenue: 2000, channel: 'social' },
        { period: '2025-04', revenue: 4000, channel: 'paid_ads' },
        { period: '2025-05', revenue: 3500, channel: 'organic' },
        { period: '2025-06', revenue: 2500, channel: 'social' },
      ];
      const drivers = await agent.identifyGrowthDrivers(data);
      const diversification = drivers.find(d => d.factor === 'Channel diversification');
      expect(diversification).toBeTruthy();
      expect(diversification!.direction).toBe('positive');
    });
  });

  // ------------------------------------------------------------------
  // process
  // ------------------------------------------------------------------

  describe('process', () => {
    it('should return insufficient_data when no historical data', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await agent.process({
        context: {},
        parameters: {},
        requestId: 'req-1',
      });
      expect(result.decision).toBe('insufficient_data');
      expect(result.confidence.score).toBe(0);
    });

    it('should generate a complete forecast with sufficient data', async () => {
      // Historical revenue query
      const historicalRows = Array.from({ length: 12 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, '0')}`,
        revenue: String(10000 + i * 500),
        channel: 'paid_ads',
        country_id: 'us',
      }));
      mockPool.query
        .mockResolvedValueOnce({ rows: historicalRows }) // fetchHistoricalRevenue
        .mockResolvedValueOnce({ rows: [] }) // identifyRiskFactors
        .mockResolvedValueOnce({ rows: [] }) // evaluateForecastAccuracy
        .mockResolvedValueOnce({ rows: [] }) // persistState
        .mockResolvedValueOnce({ rows: [] }); // logDecision

      const result = await agent.process({
        context: {},
        parameters: { countryId: 'us' },
        requestId: 'req-2',
      });
      expect(result.decision).toContain('Revenue forecast generated');
      expect(result.data.report).toBeTruthy();
      expect(result.confidence.score).toBeGreaterThan(0);
    });

    it('should include confidence factors in the output', async () => {
      const historicalRows = Array.from({ length: 12 }, (_, i) => ({
        period: `2025-${String(i + 1).padStart(2, '0')}`,
        revenue: String(10000 + i * 500),
        channel: 'paid_ads',
        country_id: null,
      }));
      mockPool.query
        .mockResolvedValueOnce({ rows: historicalRows })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await agent.process({
        context: {},
        parameters: {},
        requestId: 'req-3',
      });
      expect(result.confidence.factors).toHaveProperty('data_availability');
      expect(result.confidence.factors).toHaveProperty('data_recency');
      expect(result.confidence.factors).toHaveProperty('model_accuracy');
    });

    it('should handle errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await agent.process({
        context: {},
        parameters: {},
        requestId: 'req-error',
      });
      expect(result.decision).toBe('forecasting_failed');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

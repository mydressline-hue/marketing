// ============================================================
// AI International Growth Engine - Performance Analytics Agent Tests
// Unit tests for metric computation, funnel analysis, and attribution
// ============================================================

import { PerformanceAnalyticsAgent } from '../../../src/agents/modules/PerformanceAnalyticsAgent';
import type {
  MetricResult,
  FunnelAnalysis,
  FunnelStageData,
  ChannelAttribution,
  AttributionResult,
  AttributionComparison,
  DropOffPoint,
} from '../../../src/agents/modules/PerformanceAnalyticsAgent';
import type { AgentInput } from '../../../src/agents/base/types';
import type { ChannelMetric, KPI, DateRange } from '../../../src/types';

// ---- Mocks ----

// Mock database pool
const mockQuery = jest.fn();
jest.mock('../../../src/config/database', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock Redis cache - default to cache miss
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/config/redis', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock helpers
jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
}));

// ---- Test Suite ----

describe('PerformanceAnalyticsAgent', () => {
  let agent: PerformanceAnalyticsAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    agent = new PerformanceAnalyticsAgent();
  });

  // ------------------------------------------------------------------
  // 1. Agent Configuration
  // ------------------------------------------------------------------

  describe('agent configuration', () => {
    it('should have correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('performance_analytics');
      const config = agent.getConfig();
      expect(config.model).toBe('opus');
      expect(config.confidenceThreshold).toBe(65);
      expect(config.maxRetries).toBe(3);
      expect(config.timeoutMs).toBe(60000);
    });

    it('should return correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual([
        'budget_optimization',
        'revenue_forecasting',
        'paid_ads',
      ]);
    });

    it('should return a system prompt string', () => {
      const prompt = agent.getSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Performance Analytics');
    });
  });

  // ------------------------------------------------------------------
  // 2. CAC Computation
  // ------------------------------------------------------------------

  describe('computeCAC', () => {
    it('should compute CAC from campaign spend and conversions', async () => {
      // Current period query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_conversions: '200' }],
      });
      // Previous period query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000', total_conversions: '180' }],
      });

      const dateRange: DateRange = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      };

      const result: MetricResult = await agent.computeCAC(dateRange);

      expect(result.value).toBe(50); // 10000 / 200
      expect(result.previousValue).toBeCloseTo(44.44, 1); // 8000 / 180
      expect(result.trend).toBe('up'); // CAC increased
      expect(result.period).toBe('2026-01-01 to 2026-01-31');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return zero CAC when there are no conversions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '5000', total_conversions: '0' }],
      });

      const result = await agent.computeCAC();

      expect(result.value).toBe(0);
      expect(result.period).toBe('all time');
    });

    it('should use cache when available', async () => {
      const cachedResult: MetricResult = {
        value: 42,
        previousValue: 38,
        changePercent: 10.53,
        trend: 'up',
        period: 'cached',
        confidence: 0.9,
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.computeCAC();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // 3. LTV Computation
  // ------------------------------------------------------------------

  describe('computeLTV', () => {
    it('should compute LTV from revenue and customer data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_customers: '500',
            total_revenue: '75000',
            span_days: '365',
          },
        ],
      });

      const result = await agent.computeLTV();

      // avgRevenuePerCustomer = 75000 / 500 = 150
      // annualizationFactor = 365 / 365 = 1
      // LTV = 150 * 1 = 150
      expect(result.value).toBe(150);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.period).toBe('all segments');
    });

    it('should filter by segment when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_customers: '100',
            total_revenue: '20000',
            span_days: '180',
          },
        ],
      });

      const result = await agent.computeLTV('premium');

      expect(result.period).toBe('segment: premium');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.type = $1'),
        ['premium'],
      );
    });
  });

  // ------------------------------------------------------------------
  // 4. ROAS Computation
  // ------------------------------------------------------------------

  describe('computeROAS', () => {
    it('should compute ROAS from spend and revenue', async () => {
      // Current period (active/completed)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '5000', total_revenue: '15000' }],
      });
      // Previous period (completed/archived)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '4000', total_revenue: '10000' }],
      });

      const result = await agent.computeROAS();

      expect(result.value).toBe(3); // 15000 / 5000
      expect(result.previousValue).toBe(2.5); // 10000 / 4000
      expect(result.trend).toBe('up');
    });

    it('should filter by channel or campaign when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '2000', total_revenue: '8000' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '1500', total_revenue: '5000' }],
      });

      const result = await agent.computeROAS('google');

      expect(result.value).toBe(4); // 8000 / 2000
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.platform = $1'),
        ['google'],
      );
    });
  });

  // ------------------------------------------------------------------
  // 5. MER Computation
  // ------------------------------------------------------------------

  describe('computeMER', () => {
    it('should compute MER as revenue / total marketing spend', async () => {
      // Total spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '20000' }],
      });
      // Total revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '60000' }],
      });

      const result = await agent.computeMER();

      expect(result.value).toBe(3); // 60000 / 20000
      expect(result.period).toBe('all time');
    });

    it('should compute previous period MER when date range is provided', async () => {
      // Current spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000' }],
      });
      // Current revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '25000' }],
      });
      // Previous spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '9000' }],
      });
      // Previous revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '18000' }],
      });

      const dateRange: DateRange = {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      };

      const result = await agent.computeMER(dateRange);

      expect(result.value).toBe(2.5); // 25000 / 10000
      expect(result.previousValue).toBe(2); // 18000 / 9000
      expect(result.trend).toBe('up');
      expect(result.changePercent).toBe(25); // (2.5 - 2) / 2 * 100
    });
  });

  // ------------------------------------------------------------------
  // 6. Funnel Analysis
  // ------------------------------------------------------------------

  describe('analyzeFunnel', () => {
    it('should analyze funnel stages from funnel_events table', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { stage: 'awareness', visitors: '10000', conversions: '6000', avg_time_seconds: '120' },
          { stage: 'interest', visitors: '6000', conversions: '3000', avg_time_seconds: '300' },
          { stage: 'consideration', visitors: '3000', conversions: '1500', avg_time_seconds: '600' },
          { stage: 'intent', visitors: '1500', conversions: '800', avg_time_seconds: '900' },
          { stage: 'purchase', visitors: '800', conversions: '500', avg_time_seconds: '180' },
          { stage: 'loyalty', visitors: '500', conversions: '200', avg_time_seconds: '0' },
        ],
      });

      const result: FunnelAnalysis = await agent.analyzeFunnel();

      expect(result.stages).toHaveLength(6);
      expect(result.stages[0].stage).toBe('awareness');
      expect(result.stages[0].visitors).toBe(10000);
      expect(result.overallConversionRate).toBeGreaterThan(0);
      expect(result.totalDropOff).toBeGreaterThan(0);
      expect(result.overallConversionRate + result.totalDropOff).toBeCloseTo(1, 2);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should fall back to campaign-derived funnel when funnel_events table is absent', async () => {
      // First query fails (no funnel_events table)
      mockQuery.mockRejectedValueOnce(new Error('relation "funnel_events" does not exist'));
      // Fallback query succeeds
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_impressions: '50000',
            total_clicks: '2500',
            total_conversions: '100',
          },
        ],
      });

      const result = await agent.analyzeFunnel();

      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.stages[0].stage).toBe('awareness');
    });
  });

  // ------------------------------------------------------------------
  // 7. Drop-Off Points
  // ------------------------------------------------------------------

  describe('identifyDropOffPoints', () => {
    it('should identify drop-off points between funnel stages', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'awareness', visitors: 10000, conversions: 6000, conversionRate: 0.6, dropOffRate: 0.4, avgTimeInStage: 120 },
          { stage: 'interest', visitors: 6000, conversions: 3000, conversionRate: 0.5, dropOffRate: 0.5, avgTimeInStage: 300 },
          { stage: 'consideration', visitors: 3000, conversions: 1000, conversionRate: 0.333, dropOffRate: 0.667, avgTimeInStage: 600 },
          { stage: 'intent', visitors: 1000, conversions: 500, conversionRate: 0.5, dropOffRate: 0.5, avgTimeInStage: 900 },
          { stage: 'purchase', visitors: 500, conversions: 400, conversionRate: 0.8, dropOffRate: 0.2, avgTimeInStage: 180 },
        ],
        overallConversionRate: 0.04,
        totalDropOff: 0.96,
        recommendations: [],
      };

      const dropOffs: DropOffPoint[] = agent.identifyDropOffPoints(funnel);

      expect(dropOffs.length).toBeGreaterThan(0);
      // Each drop-off should have fromStage, toStage, and recommendations
      for (const point of dropOffs) {
        expect(point.fromStage).toBeDefined();
        expect(point.toStage).toBeDefined();
        expect(point.dropOffRate).toBeGreaterThanOrEqual(0);
        expect(point.dropOffRate).toBeLessThanOrEqual(1);
        expect(point.recommendations.length).toBeGreaterThan(0);
      }

      // Should be sorted by dropOffRate descending
      for (let i = 1; i < dropOffs.length; i++) {
        expect(dropOffs[i - 1].dropOffRate).toBeGreaterThanOrEqual(dropOffs[i].dropOffRate);
      }
    });

    it('should return empty array for single-stage funnel', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'purchase', visitors: 100, conversions: 80, conversionRate: 0.8, dropOffRate: 0.2, avgTimeInStage: 60 },
        ],
        overallConversionRate: 0.8,
        totalDropOff: 0.2,
        recommendations: [],
      };

      const dropOffs = agent.identifyDropOffPoints(funnel);
      expect(dropOffs).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // 8. Attribution Models
  // ------------------------------------------------------------------

  describe('lastClickAttribution', () => {
    it('should attribute 100% to the last touchpoint', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 100, position: 0, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'meta', touchpoint_time: '2026-01-05', revenue: 100, position: 1, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'tiktok', touchpoint_time: '2026-01-10', revenue: 100, position: 2, total_touchpoints: 3 },
      ];

      const result = agent.lastClickAttribution(conversions);

      // Only the last touchpoint (tiktok at position 2) should get credit
      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe('tiktok');
      expect(result[0].attributedConversions).toBe(1);
      expect(result[0].attributedRevenue).toBe(100);
    });
  });

  describe('linearAttribution', () => {
    it('should distribute credit equally across all touchpoints', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 300, position: 0, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'meta', touchpoint_time: '2026-01-05', revenue: 300, position: 1, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'tiktok', touchpoint_time: '2026-01-10', revenue: 300, position: 2, total_touchpoints: 3 },
      ];

      const result = agent.linearAttribution(conversions);

      expect(result).toHaveLength(3);

      // Each channel should get 1/3 of conversions and revenue
      const totalConversions = result.reduce((s, r) => s + r.attributedConversions, 0);
      const totalRevenue = result.reduce((s, r) => s + r.attributedRevenue, 0);

      expect(totalConversions).toBeCloseTo(1, 1);
      expect(totalRevenue).toBeCloseTo(300, 0);

      for (const ch of result) {
        expect(ch.attributedConversions).toBeCloseTo(0.33, 1);
        expect(ch.attributedRevenue).toBeCloseTo(100, 0);
      }
    });
  });

  describe('timeDecayAttribution', () => {
    it('should give more credit to touchpoints closer to conversion', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 200, position: 0, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'meta', touchpoint_time: '2026-01-08', revenue: 200, position: 1, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'tiktok', touchpoint_time: '2026-01-14', revenue: 200, position: 2, total_touchpoints: 3 },
      ];

      const result = agent.timeDecayAttribution(conversions, 7);

      expect(result).toHaveLength(3);

      // The last touchpoint (tiktok) should have the highest attributed revenue
      const tiktok = result.find((r) => r.channel === 'tiktok');
      const google = result.find((r) => r.channel === 'google');
      const meta = result.find((r) => r.channel === 'meta');

      expect(tiktok).toBeDefined();
      expect(google).toBeDefined();
      expect(meta).toBeDefined();

      // tiktok (most recent) > meta (middle) > google (earliest)
      expect(tiktok!.attributedRevenue).toBeGreaterThan(meta!.attributedRevenue);
      expect(meta!.attributedRevenue).toBeGreaterThan(google!.attributedRevenue);

      // Total should still sum to 1 conversion
      const totalConversions = result.reduce((s, r) => s + r.attributedConversions, 0);
      expect(totalConversions).toBeCloseTo(1, 1);
    });
  });

  describe('positionBasedAttribution', () => {
    it('should assign 40/20/40 split for first/middle/last with 3 touchpoints', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 500, position: 0, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'meta', touchpoint_time: '2026-01-05', revenue: 500, position: 1, total_touchpoints: 3 },
        { conversion_id: 'c1', channel: 'tiktok', touchpoint_time: '2026-01-10', revenue: 500, position: 2, total_touchpoints: 3 },
      ];

      const result = agent.positionBasedAttribution(conversions, 0.4, 0.4);

      const google = result.find((r) => r.channel === 'google');
      const meta = result.find((r) => r.channel === 'meta');
      const tiktok = result.find((r) => r.channel === 'tiktok');

      expect(google).toBeDefined();
      expect(meta).toBeDefined();
      expect(tiktok).toBeDefined();

      // First (google) and last (tiktok) get 40% each, middle (meta) gets 20%
      expect(google!.attributedConversions).toBeCloseTo(0.4, 1);
      expect(tiktok!.attributedConversions).toBeCloseTo(0.4, 1);
      expect(meta!.attributedConversions).toBeCloseTo(0.2, 1);

      expect(google!.attributedRevenue).toBeCloseTo(200, 0);
      expect(tiktok!.attributedRevenue).toBeCloseTo(200, 0);
      expect(meta!.attributedRevenue).toBeCloseTo(100, 0);
    });

    it('should handle single touchpoint with full credit', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 100, position: 0, total_touchpoints: 1 },
      ];

      const result = agent.positionBasedAttribution(conversions, 0.4, 0.4);

      expect(result).toHaveLength(1);
      expect(result[0].attributedConversions).toBe(1);
      expect(result[0].attributedRevenue).toBe(100);
    });

    it('should handle two touchpoints by splitting between first and last', () => {
      const conversions = [
        { conversion_id: 'c1', channel: 'google', touchpoint_time: '2026-01-01', revenue: 200, position: 0, total_touchpoints: 2 },
        { conversion_id: 'c1', channel: 'meta', touchpoint_time: '2026-01-10', revenue: 200, position: 1, total_touchpoints: 2 },
      ];

      const result = agent.positionBasedAttribution(conversions, 0.4, 0.4);

      const google = result.find((r) => r.channel === 'google');
      const meta = result.find((r) => r.channel === 'meta');

      expect(google).toBeDefined();
      expect(meta).toBeDefined();

      // 50/50 split since first and last weights are equal
      expect(google!.attributedConversions).toBeCloseTo(0.5, 1);
      expect(meta!.attributedConversions).toBeCloseTo(0.5, 1);
    });
  });

  // ------------------------------------------------------------------
  // 9. Attribution Model Comparison
  // ------------------------------------------------------------------

  describe('compareAttributionModels', () => {
    it('should compare all four attribution models', async () => {
      // Mock for fetchConversionTouchpoints - the table doesn't exist, so fallback
      // Each runAttributionModel call will trigger this
      const campaignData = {
        rows: [
          { campaign_id: 'camp1', channel: 'google', touchpoint_time: '2026-01-05', revenue: '5000', conversions: '50' },
          { campaign_id: 'camp2', channel: 'meta', touchpoint_time: '2026-01-10', revenue: '3000', conversions: '30' },
        ],
      };

      // 4 attribution model calls run via Promise.all (concurrent), each with fallback
      // All touchpoint queries reject first, then all fallback derive queries resolve
      for (let i = 0; i < 4; i++) {
        mockQuery.mockRejectedValueOnce(new Error('table not found'));
      }
      for (let i = 0; i < 4; i++) {
        mockQuery.mockResolvedValueOnce(campaignData);
      }

      const dateRange: DateRange = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      };

      const result: AttributionComparison =
        await agent.compareAttributionModels(dateRange);

      expect(result.models).toBeDefined();
      expect(Object.keys(result.models)).toHaveLength(4);
      expect(result.models['last_click']).toBeDefined();
      expect(result.models['linear']).toBeDefined();
      expect(result.models['time_decay']).toBeDefined();
      expect(result.models['position_based']).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.bestModelForGoal).toBeDefined();
      expect(result.bestModelForGoal['brand_awareness']).toBe('position_based');
      expect(result.bestModelForGoal['short_sales_cycle']).toBe('last_click');
    });
  });

  // ------------------------------------------------------------------
  // 10. Channel Metrics
  // ------------------------------------------------------------------

  describe('getChannelMetrics', () => {
    it('should aggregate channel-level metrics from campaigns', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            channel: 'google',
            impressions: '100000',
            clicks: '5000',
            conversions: '250',
            spend: '7500',
            revenue: '22500',
          },
          {
            channel: 'meta',
            impressions: '80000',
            clicks: '4000',
            conversions: '200',
            spend: '6000',
            revenue: '15000',
          },
        ],
      });

      const result: ChannelMetric[] = await agent.getChannelMetrics();

      expect(result).toHaveLength(2);
      expect(result[0].channel).toBe('google');
      expect(result[0].impressions).toBe(100000);
      expect(result[0].ctr).toBe(0.05); // 5000 / 100000
      expect(result[0].cpc).toBe(1.5); // 7500 / 5000
      expect(result[0].cpa).toBe(30); // 7500 / 250
      expect(result[0].roas).toBe(3); // 22500 / 7500
    });
  });

  // ------------------------------------------------------------------
  // 11. KPI Computation
  // ------------------------------------------------------------------

  describe('computeKPIs', () => {
    it('should compute all KPIs from underlying metrics', async () => {
      // Promise.allSettled runs CAC, LTV, ROAS, MER concurrently.
      // Round 1 (first query from each): CAC, LTV, ROAS current, MER spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_conversions: '200' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_customers: '500', total_revenue: '75000', span_days: '365' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '20000', total_revenue: '60000' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '20000' }],
      });
      // Round 2 (second query from ROAS + MER): ROAS previous, MER revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '15000', total_revenue: '40000' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '60000' }],
      });
      // Aggregate KPIs
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_impressions: '500000',
            total_clicks: '25000',
            total_conversions: '1000',
            total_spend: '50000',
            campaign_count: '15',
          },
        ],
      });

      const kpis: KPI[] = await agent.computeKPIs();

      expect(kpis.length).toBeGreaterThanOrEqual(4);

      const cacKpi = kpis.find((k) => k.name === 'Customer Acquisition Cost');
      expect(cacKpi).toBeDefined();
      expect(cacKpi!.value).toBe(50); // 10000 / 200

      const ltvKpi = kpis.find((k) => k.name === 'Customer Lifetime Value');
      expect(ltvKpi).toBeDefined();
      expect(ltvKpi!.value).toBe(150); // 75000 / 500

      const roasKpi = kpis.find((k) => k.name === 'Return on Ad Spend');
      expect(roasKpi).toBeDefined();
      expect(roasKpi!.value).toBe(3); // 60000 / 20000
    });
  });

  // ------------------------------------------------------------------
  // 12. Full Process Integration
  // ------------------------------------------------------------------

  describe('process', () => {
    it('should produce a valid AgentOutput with all metrics', async () => {
      // Mock all database queries that process() triggers
      // CAC current
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_conversions: '100' }],
      });
      // CAC previous
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000', total_conversions: '90' }],
      });
      // LTV
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_customers: '200', total_revenue: '40000', span_days: '365' }],
      });
      // ROAS current
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_revenue: '30000' }],
      });
      // ROAS previous
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000', total_revenue: '20000' }],
      });
      // MER spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000' }],
      });
      // MER revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '30000' }],
      });
      // MER prev spend
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000' }],
      });
      // MER prev revenue
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '20000' }],
      });
      // Funnel (fail -> fallback)
      mockQuery.mockRejectedValueOnce(new Error('table not found'));
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_impressions: '50000', total_clicks: '2500', total_conversions: '100' }],
      });
      // Attribution: 4 models x (fail + fallback)
      for (let i = 0; i < 4; i++) {
        mockQuery.mockRejectedValueOnce(new Error('table not found'));
        mockQuery.mockResolvedValueOnce({
          rows: [
            { campaign_id: 'c1', channel: 'google', touchpoint_time: '2026-01-15', revenue: '5000', conversions: '50' },
          ],
        });
      }
      // Channel metrics
      mockQuery.mockResolvedValueOnce({
        rows: [
          { channel: 'google', impressions: '50000', clicks: '2500', conversions: '100', spend: '5000', revenue: '15000' },
        ],
      });
      // KPI: CAC (from cache after first compute)
      mockCacheGet
        .mockResolvedValueOnce(null) // CAC first call cache miss
        .mockResolvedValueOnce(null); // Other misses as needed

      // KPIs - will call computeCAC, etc. which may be cached or re-queried
      // Since they were already computed, mock the next batch
      // CAC (cached from earlier)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_conversions: '100' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000', total_conversions: '90' }],
      });
      // LTV
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_customers: '200', total_revenue: '40000', span_days: '365' }],
      });
      // ROAS
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '10000', total_revenue: '30000' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '8000', total_revenue: '20000' }],
      });
      // MER spend + revenue
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '10000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '30000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '8000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '20000' }] });
      // Aggregate KPIs
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_impressions: '50000', total_clicks: '2500', total_conversions: '100', total_spend: '10000', campaign_count: '5' }],
      });
      // persistState upsert
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      // logDecision insert
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input: AgentInput = {
        context: {},
        parameters: {
          dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
        },
        requestId: 'test-req-001',
      };

      const output = await agent.process(input);

      expect(output.agentType).toBe('performance_analytics');
      expect(output.decision).toBeDefined();
      expect(output.decision.length).toBeGreaterThan(0);
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeDefined();
      expect(output.data).toBeDefined();
      expect(output.timestamp).toBeDefined();
    });

    it('should handle missing date range gracefully with uncertainty flag', async () => {
      // CAC (no date range, simpler query)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '5000', total_conversions: '50' }],
      });
      // LTV
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_customers: '100', total_revenue: '15000', span_days: '180' }],
      });
      // ROAS current
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '5000', total_revenue: '15000' }],
      });
      // ROAS previous
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '3000', total_revenue: '8000' }],
      });
      // MER spend
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '5000' }] });
      // MER revenue
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '15000' }] });
      // Funnel fallback
      mockQuery.mockRejectedValueOnce(new Error('table not found'));
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_impressions: '20000', total_clicks: '1000', total_conversions: '50' }],
      });
      // Channel metrics
      mockQuery.mockResolvedValueOnce({
        rows: [{ channel: 'google', impressions: '20000', clicks: '1000', conversions: '50', spend: '5000', revenue: '15000' }],
      });
      // KPIs (re-queries since no cache)
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '5000', total_conversions: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_customers: '100', total_revenue: '15000', span_days: '180' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '5000', total_revenue: '15000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '3000', total_revenue: '8000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '5000' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '15000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_impressions: '20000', total_clicks: '1000', total_conversions: '50', total_spend: '5000', campaign_count: '3' }],
      });
      // persistState + logDecision
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input: AgentInput = {
        context: {},
        parameters: {},
        requestId: 'test-req-002',
      };

      const output = await agent.process(input);

      // Should flag that attribution was skipped due to no date range
      const attributionUncertainty = output.uncertainties.find((u) =>
        u.includes('attribution'),
      );
      expect(attributionUncertainty).toBeDefined();
    });
  });
});

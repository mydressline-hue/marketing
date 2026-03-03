/**
 * Unit tests for ContinuousLearningService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic (reinforcement
 * learning, strategy memory, country performance, creative fatigue detection,
 * seasonal adjustments, trend optimisation, and system status).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (fn: (client: { query: jest.Mock }) => Promise<unknown>) => {
    const { pool: mockPool } = require('../../../../src/config/database');
    return fn({ query: mockPool.query });
  }),
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('learn-uuid-new'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ContinuousLearningService } from '../../../../src/services/learning/ContinuousLearningService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { generateId } from '../../../../src/utils/helpers';
import { logger } from '../../../../src/utils/logger';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockLogger = logger as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const STRATEGY_ID = 'strategy-uuid-1';
const CAMPAIGN_ID = 'campaign-uuid-1';
const COUNTRY_CODE = 'US';
const CHANNEL = 'google_ads';
const CREATIVE_ID = 'creative-uuid-1';

function makeStrategyOutcomeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'outcome-uuid-1',
    strategy_id: STRATEGY_ID,
    campaign_id: CAMPAIGN_ID,
    country_code: COUNTRY_CODE,
    channel: CHANNEL,
    strategy_type: 'budget_allocation',
    parameters: { budget: 10000, bid_strategy: 'target_cpa' },
    outcome: {
      roas: 3.4,
      cpa: 28.5,
      conversions: 350,
      spend: 9975,
    },
    performance_score: 0.82,
    recorded_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeStrategyMemoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'memory-uuid-1',
    country_code: COUNTRY_CODE,
    channel: CHANNEL,
    strategy_type: 'budget_allocation',
    strategy_config: { budget: 10000, bid_strategy: 'target_cpa' },
    success_rate: 0.78,
    avg_roas: 3.2,
    avg_cpa: 30.5,
    times_used: 15,
    last_used_at: '2026-02-20T00:00:00Z',
    created_at: '2025-12-01T00:00:00Z',
    ...overrides,
  };
}

function makeCountryPerformanceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cp-uuid-1',
    country_code: COUNTRY_CODE,
    channel: CHANNEL,
    period: '2026-02',
    total_spend: 45000,
    total_conversions: 1500,
    avg_roas: 3.3,
    avg_cpa: 30.0,
    avg_ctr: 0.042,
    avg_cpc: 1.15,
    trend: 'improving',
    recorded_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeCreativePerformanceRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'crp-uuid-1',
    creative_id: CREATIVE_ID,
    campaign_id: CAMPAIGN_ID,
    impressions: 500000,
    clicks: 17500,
    conversions: 580,
    ctr: 0.035,
    ctr_trend: [0.042, 0.040, 0.038, 0.035, 0.032],
    fatigue_score: 0.65,
    days_running: 45,
    last_refreshed_at: '2026-01-10T00:00:00Z',
    recorded_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeSeasonalDataRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'season-uuid-1',
    country_code: COUNTRY_CODE,
    channel: CHANNEL,
    event_name: 'black_friday',
    event_start: '2026-11-27',
    event_end: '2026-11-30',
    cpc_multiplier: 1.65,
    conversion_multiplier: 2.1,
    budget_adjustment: 1.8,
    historical_performance: { avg_roas: 4.2, avg_cpa: 22.0 },
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeMarketSignalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'signal-uuid-1',
    signal_type: 'cpc_trend',
    country_code: COUNTRY_CODE,
    channel: CHANNEL,
    signal_value: { direction: 'increasing', magnitude: 0.12, period: '7d' },
    confidence: 0.88,
    source: 'platform_api',
    recorded_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContinuousLearningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Reinforcement Learning Loop
  // =========================================================================

  describe('Reinforcement Learning Loop', () => {
    it('should record strategy outcomes', async () => {
      const row = makeStrategyOutcomeRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.recordStrategyOutcome({
        strategyId: STRATEGY_ID,
        campaignId: CAMPAIGN_ID,
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        strategyType: 'budget_allocation',
        parameters: { budget: 10000, bid_strategy: 'target_cpa' },
        outcome: { roas: 3.4, cpa: 28.5, conversions: 350, spend: 9975 },
      });

      expect(result.id).toBeDefined();
      expect(result.performance_score).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const insertSql = mockQuery.mock.calls[0][0] as string;
      expect(insertSql).toContain('INSERT INTO');
    });

    it('should evaluate strategy performance', async () => {
      const outcomes = [
        makeStrategyOutcomeRow({ performance_score: 0.82 }),
        makeStrategyOutcomeRow({ id: 'outcome-2', performance_score: 0.75 }),
        makeStrategyOutcomeRow({ id: 'outcome-3', performance_score: 0.91 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: outcomes });

      const result = await ContinuousLearningService.evaluateStrategyPerformance(STRATEGY_ID);

      expect(result.strategy_id).toBe(STRATEGY_ID);
      expect(result.avg_performance_score).toBeDefined();
      expect(result.total_executions).toBe(3);
      expect(result.trend).toBeDefined();
    });

    it('should suggest improvements based on outcomes', async () => {
      const outcomes = [
        makeStrategyOutcomeRow({ performance_score: 0.55 }),
        makeStrategyOutcomeRow({ id: 'outcome-2', performance_score: 0.48 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: outcomes }); // fetch outcomes
      mockQuery.mockResolvedValueOnce({ rows: [makeStrategyMemoryRow({ success_rate: 0.85 })] }); // top strategy

      const result = await ContinuousLearningService.suggestImprovements(STRATEGY_ID);

      expect(result.suggestions).toBeInstanceOf(Array);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.current_performance).toBeDefined();
      expect(result.suggested_strategy).toBeDefined();
    });

    it('should return reinforcement metrics', async () => {
      const metricsRow = {
        total_outcomes_recorded: 1250,
        avg_performance_score: 0.74,
        improvement_rate: 0.12,
        top_performing_strategy: 'target_cpa',
        last_updated: '2026-02-25T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [metricsRow] });

      const result = await ContinuousLearningService.getReinforcementMetrics();

      expect(result.total_outcomes_recorded).toBe(1250);
      expect(result.avg_performance_score).toBe(0.74);
      expect(result.improvement_rate).toBe(0.12);
      expect(result.top_performing_strategy).toBe('target_cpa');
    });

    it('should handle empty outcomes for strategy evaluation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        ContinuousLearningService.evaluateStrategyPerformance('nonexistent-strategy'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // Strategy Memory
  // =========================================================================

  describe('Strategy Memory', () => {
    it('should store strategy memory entries', async () => {
      const row = makeStrategyMemoryRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.storeStrategyMemory({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        strategyType: 'budget_allocation',
        strategyConfig: { budget: 10000, bid_strategy: 'target_cpa' },
        successRate: 0.78,
        avgRoas: 3.2,
      });

      expect(result.id).toBeDefined();
      expect(result.success_rate).toBe(0.78);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should query strategy memory with filters', async () => {
      const rows = [
        makeStrategyMemoryRow({ strategy_type: 'budget_allocation' }),
        makeStrategyMemoryRow({ id: 'memory-2', strategy_type: 'bid_optimization' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ContinuousLearningService.queryStrategyMemory({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
      });

      expect(result).toHaveLength(2);
      const querySql = mockQuery.mock.calls[0][0] as string;
      expect(querySql).toContain('country_code');
      expect(querySql).toContain('channel');
    });

    it('should return top strategies for country/channel', async () => {
      const rows = [
        makeStrategyMemoryRow({ success_rate: 0.92, avg_roas: 4.1 }),
        makeStrategyMemoryRow({ id: 'memory-2', success_rate: 0.85, avg_roas: 3.5 }),
        makeStrategyMemoryRow({ id: 'memory-3', success_rate: 0.78, avg_roas: 3.2 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ContinuousLearningService.getTopStrategies(COUNTRY_CODE, CHANNEL);

      expect(result).toHaveLength(3);
      expect(result[0].success_rate).toBeGreaterThanOrEqual(result[1].success_rate);
      const querySql = mockQuery.mock.calls[0][0] as string;
      expect(querySql).toContain('ORDER BY');
    });

    it('should return strategy insights', async () => {
      const insightRow = {
        total_strategies: 45,
        avg_success_rate: 0.72,
        best_channel: 'google_ads',
        best_country: 'US',
        top_strategy_type: 'target_cpa',
        improvement_over_time: 0.08,
      };
      mockQuery.mockResolvedValueOnce({ rows: [insightRow] });

      const result = await ContinuousLearningService.getStrategyInsights();

      expect(result.total_strategies).toBe(45);
      expect(result.avg_success_rate).toBe(0.72);
      expect(result.best_channel).toBe('google_ads');
    });

    it('should deduplicate memory entries', async () => {
      // Simulates upsert behavior -- same strategy config should update, not insert duplicate
      const row = makeStrategyMemoryRow({ times_used: 16 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.storeStrategyMemory({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        strategyType: 'budget_allocation',
        strategyConfig: { budget: 10000, bid_strategy: 'target_cpa' },
        successRate: 0.80,
        avgRoas: 3.3,
      });

      expect(result.times_used).toBe(16);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT');
    });

    it('should return from cache for top strategies', async () => {
      const cached = [makeStrategyMemoryRow({ success_rate: 0.92 })];
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await ContinuousLearningService.getTopStrategies(COUNTRY_CODE, CHANNEL);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Country Performance Memory
  // =========================================================================

  describe('Country Performance Memory', () => {
    it('should record country performance metrics', async () => {
      const row = makeCountryPerformanceRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.recordCountryPerformance({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        period: '2026-02',
        totalSpend: 45000,
        totalConversions: 1500,
        avgRoas: 3.3,
        avgCpa: 30.0,
      });

      expect(result.id).toBeDefined();
      expect(result.country_code).toBe(COUNTRY_CODE);
      expect(result.total_spend).toBe(45000);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return performance history', async () => {
      const rows = [
        makeCountryPerformanceRow({ period: '2026-02' }),
        makeCountryPerformanceRow({ id: 'cp-2', period: '2026-01', avg_roas: 3.1 }),
        makeCountryPerformanceRow({ id: 'cp-3', period: '2025-12', avg_roas: 2.9 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ContinuousLearningService.getCountryPerformanceHistory(
        COUNTRY_CODE,
        { months: 3 },
      );

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][1]).toContain(COUNTRY_CODE);
    });

    it('should calculate country trends', async () => {
      const trendRow = {
        country_code: COUNTRY_CODE,
        roas_trend: 'improving',
        cpa_trend: 'stable',
        spend_trend: 'increasing',
        period_over_period_change: { roas: 0.06, cpa: -0.02, spend: 0.15 },
      };
      mockQuery.mockResolvedValueOnce({ rows: [trendRow] });

      const result = await ContinuousLearningService.getCountryTrends(COUNTRY_CODE);

      expect(result.roas_trend).toBe('improving');
      expect(result.cpa_trend).toBe('stable');
      expect(result.period_over_period_change).toBeDefined();
    });

    it('should compare country performance', async () => {
      const rows = [
        makeCountryPerformanceRow({ country_code: 'US', avg_roas: 3.3 }),
        makeCountryPerformanceRow({ id: 'cp-2', country_code: 'UK', avg_roas: 2.8 }),
        makeCountryPerformanceRow({ id: 'cp-3', country_code: 'DE', avg_roas: 3.0 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ContinuousLearningService.compareCountryPerformance(
        ['US', 'UK', 'DE'],
        { period: '2026-02' },
      );

      expect(result).toHaveLength(3);
      expect(result[0].country_code).toBeDefined();
      expect(result[0].avg_roas).toBeDefined();
    });
  });

  // =========================================================================
  // Creative Fatigue Detection
  // =========================================================================

  describe('Creative Fatigue Detection', () => {
    it('should detect creative fatigue', async () => {
      // Initial query returns creatives with baseline/recent stats that indicate fatigue
      const rows = [
        { creative_id: 'cr-1', creative_name: 'Ad A', campaign_id: CAMPAIGN_ID,
          days_running: 60, baseline_ctr: 0.05, baseline_conv: 0.03,
          recent_ctr: 0.02, recent_conv: 0.015, frequency: 8 },
      ];
      mockQuery.mockResolvedValueOnce({ rows }); // main query
      mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Replacement Creative' }] }); // suggestions
      mockQuery.mockResolvedValueOnce({ rows: [] }); // insert alert

      const result = await ContinuousLearningService.detectCreativeFatigue(CAMPAIGN_ID) as any;

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].fatigue_score).toBeGreaterThanOrEqual(0.5);
    });

    it('should recommend creative rotations', async () => {
      const fatigueRows = [
        makeCreativePerformanceRow({ fatigue_score: 0.85, days_running: 60 }),
      ];
      const freshRows = [
        makeCreativePerformanceRow({ id: 'crp-fresh', fatigue_score: 0.15, creative_id: 'cr-fresh', days_running: 5 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: fatigueRows }); // fatigued creatives
      mockQuery.mockResolvedValueOnce({ rows: freshRows }); // available replacements

      const result = await ContinuousLearningService.recommendCreativeRotations(CAMPAIGN_ID);

      expect(result.rotations).toBeInstanceOf(Array);
      expect(result.rotations.length).toBeGreaterThan(0);
      expect(result.rotations[0].current_creative_id).toBeDefined();
      expect(result.rotations[0].suggested_replacement_id).toBeDefined();
    });

    it('should record creative performance', async () => {
      const row = makeCreativePerformanceRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.recordCreativePerformance({
        creativeId: CREATIVE_ID,
        campaignId: CAMPAIGN_ID,
        impressions: 500000,
        clicks: 17500,
        conversions: 580,
        ctr: 0.035,
      });

      expect(result.id).toBeDefined();
      expect(result.creative_id).toBe(CREATIVE_ID);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return fatigue alerts', async () => {
      const alertRows = [
        {
          id: 'alert-1',
          creative_id: 'cr-1',
          campaign_id: CAMPAIGN_ID,
          fatigue_score: 0.88,
          alert_level: 'critical',
          days_running: 75,
          ctr_decline: 0.45,
          recommendation: 'immediate_rotation',
          created_at: '2026-02-25T00:00:00Z',
        },
        {
          id: 'alert-2',
          creative_id: 'cr-2',
          campaign_id: CAMPAIGN_ID,
          fatigue_score: 0.72,
          alert_level: 'warning',
          days_running: 50,
          ctr_decline: 0.22,
          recommendation: 'schedule_rotation',
          created_at: '2026-02-25T00:00:00Z',
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: alertRows });

      const result = await ContinuousLearningService.getFatigueAlerts({ campaignId: CAMPAIGN_ID });

      expect(result).toHaveLength(2);
      expect(result[0].alert_level).toBe('critical');
      expect(result[0].recommendation).toBe('immediate_rotation');
    });

    it('should calculate fatigue score correctly', async () => {
      // Creative with significant CTR and conversion decline + high frequency
      const row = {
        creative_id: 'cr-fat', creative_name: 'Fatigued Ad', campaign_id: CAMPAIGN_ID,
        days_running: 55, baseline_ctr: 0.050, baseline_conv: 0.030,
        recent_ctr: 0.020, recent_conv: 0.012, frequency: 10,
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] }); // main query
      mockQuery.mockResolvedValueOnce({ rows: [] }); // suggestions
      mockQuery.mockResolvedValueOnce({ rows: [] }); // insert alert

      const result = await ContinuousLearningService.detectCreativeFatigue(CAMPAIGN_ID) as any;

      // Fatigue score should be high when CTR is declining
      expect(result.length).toBe(1);
      expect(result[0].fatigue_score).toBeGreaterThan(0.5);
      expect(result[0].ctr_decline_pct).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Seasonal Adjustment AI
  // =========================================================================

  describe('Seasonal Adjustment AI', () => {
    it('should detect seasonal patterns', async () => {
      const patternRows = [
        {
          pattern_type: 'recurring_peak',
          country_code: COUNTRY_CODE,
          channel: CHANNEL,
          months: [11, 12],
          avg_cpc_multiplier: 1.45,
          avg_conversion_lift: 1.8,
          confidence: 0.91,
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: patternRows });

      const result = await ContinuousLearningService.detectSeasonalPatterns(
        COUNTRY_CODE,
        CHANNEL,
      );

      expect(result.patterns).toBeInstanceOf(Array);
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].pattern_type).toBe('recurring_peak');
      expect(result.patterns[0].confidence).toBeGreaterThan(0.5);
    });

    it('should return seasonal adjustments', async () => {
      const adjustmentRow = {
        country_code: COUNTRY_CODE,
        channel: CHANNEL,
        current_period: '2026-02',
        cpc_adjustment: 1.05,
        budget_adjustment: 1.1,
        bid_adjustment: 0.95,
        reason: 'post_holiday_cooldown',
      };
      mockQuery.mockResolvedValueOnce({ rows: [adjustmentRow] });

      const result = await ContinuousLearningService.getSeasonalAdjustments(
        COUNTRY_CODE,
        CHANNEL,
      );

      expect(result.cpc_adjustment).toBe(1.05);
      expect(result.budget_adjustment).toBe(1.1);
      expect(result.reason).toBe('post_holiday_cooldown');
    });

    it('should record seasonal data', async () => {
      const row = makeSeasonalDataRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.recordSeasonalData({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        eventName: 'black_friday',
        eventStart: '2026-11-27',
        eventEnd: '2026-11-30',
        cpcMultiplier: 1.65,
        conversionMultiplier: 2.1,
      });

      expect(result.id).toBeDefined();
      expect(result.event_name).toBe('black_friday');
      expect(result.cpc_multiplier).toBe(1.65);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return upcoming seasonal events', async () => {
      const upcomingRows = [
        makeSeasonalDataRow({ event_name: 'spring_sale', event_start: '2026-03-15', event_end: '2026-03-22' }),
        makeSeasonalDataRow({ id: 'season-2', event_name: 'easter', event_start: '2026-04-05', event_end: '2026-04-06' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: upcomingRows });

      const result = await ContinuousLearningService.getUpcomingSeasonalEvents(COUNTRY_CODE);

      expect(result).toHaveLength(2);
      expect(result[0].event_name).toBeDefined();
      expect(result[0].event_start).toBeDefined();
    });

    it('should cache seasonal adjustments', async () => {
      const adjustmentRow = {
        country_code: COUNTRY_CODE,
        channel: CHANNEL,
        cpc_adjustment: 1.0,
        budget_adjustment: 1.0,
        reason: 'no_seasonal_event',
      };
      mockQuery.mockResolvedValueOnce({ rows: [adjustmentRow] });

      await ContinuousLearningService.getSeasonalAdjustments(COUNTRY_CODE, CHANNEL);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('seasonal:'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // =========================================================================
  // Trend Optimization
  // =========================================================================

  describe('Trend Optimization', () => {
    it('should record market signals', async () => {
      const row = makeMarketSignalRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await ContinuousLearningService.recordMarketSignal({
        signalType: 'cpc_trend',
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        signalValue: { direction: 'increasing', magnitude: 0.12, period: '7d' },
        confidence: 0.88,
        source: 'platform_api',
      });

      expect(result.id).toBeDefined();
      expect(result.signal_type).toBe('cpc_trend');
      expect(result.confidence).toBe(0.88);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should analyze market trends', async () => {
      const trendAnalysis = {
        country_code: COUNTRY_CODE,
        channel: CHANNEL,
        trends: [
          { signal_type: 'cpc_trend', direction: 'increasing', magnitude: 0.12, confidence: 0.88 },
          { signal_type: 'conversion_rate', direction: 'stable', magnitude: 0.01, confidence: 0.92 },
          { signal_type: 'competition', direction: 'increasing', magnitude: 0.08, confidence: 0.75 },
        ],
        overall_outlook: 'cautious',
        analyzed_at: '2026-02-25T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [trendAnalysis] });

      const result = await ContinuousLearningService.analyzeMarketTrends(COUNTRY_CODE, CHANNEL);

      expect(result.trends).toBeInstanceOf(Array);
      expect(result.trends.length).toBeGreaterThan(0);
      expect(result.overall_outlook).toBe('cautious');
    });

    it('should provide trend-based recommendations', async () => {
      const recommendationRow = {
        country_code: COUNTRY_CODE,
        channel: CHANNEL,
        recommendations: [
          { action: 'reduce_bids', reason: 'CPC inflation detected', priority: 'high', expected_impact: 'save 12% on CPC' },
          { action: 'shift_budget', reason: 'Better ROAS in display', priority: 'medium', expected_impact: 'improve ROAS by 8%' },
        ],
        generated_at: '2026-02-25T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [recommendationRow] });

      const result = await ContinuousLearningService.getTrendRecommendations(COUNTRY_CODE, CHANNEL);

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].action).toBeDefined();
      expect(result.recommendations[0].priority).toBeDefined();
    });

    it('should filter signal history', async () => {
      const rows = [
        makeMarketSignalRow({ signal_type: 'cpc_trend' }),
        makeMarketSignalRow({ id: 'signal-2', signal_type: 'cpc_trend', recorded_at: '2026-02-24T00:00:00Z' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await ContinuousLearningService.getSignalHistory({
        countryCode: COUNTRY_CODE,
        channel: CHANNEL,
        signalType: 'cpc_trend',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });

      expect(result).toHaveLength(2);
      const querySql = mockQuery.mock.calls[0][0] as string;
      expect(querySql).toContain('signal_type');
      expect(querySql).toContain('country_code');
    });

    it('should cache market trend analysis', async () => {
      const trendAnalysis = {
        country_code: COUNTRY_CODE,
        channel: CHANNEL,
        trends: [],
        overall_outlook: 'neutral',
      };
      mockQuery.mockResolvedValueOnce({ rows: [trendAnalysis] });

      await ContinuousLearningService.analyzeMarketTrends(COUNTRY_CODE, CHANNEL);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('trends:'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // =========================================================================
  // System Status
  // =========================================================================

  describe('System Status', () => {
    it('should return learning system status', async () => {
      const statusRow = {
        is_active: true,
        last_learning_run: '2026-02-25T12:00:00Z',
        total_strategies_learned: 450,
        total_outcomes_processed: 12500,
        total_signals_recorded: 8900,
        model_version: '2.3.1',
        health: 'healthy',
      };
      mockQuery.mockResolvedValueOnce({ rows: [statusRow] });

      const result = await ContinuousLearningService.getSystemStatus();

      expect(result.is_active).toBe(true);
      expect(result.health).toBe('healthy');
      expect(result.total_strategies_learned).toBe(450);
      expect(result.model_version).toBe('2.3.1');
    });

    it('should return learning metrics', async () => {
      // getLearningMetrics makes 4 queries: records count, strategy memory, fatigue alerts, market trends
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 340, avg_rw: 0.74 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // strategy memory
      mockQuery.mockResolvedValueOnce({ rows: [{ c: 8 }] }); // fatigue alerts
      mockQuery.mockResolvedValueOnce({ rows: [{ c: 3 }] }); // market trends

      const result = await ContinuousLearningService.getLearningMetrics();

      expect(result.totalRecords).toBe(340);
      expect(result.avgReward).toBeDefined();
      expect(result.fatigueAlerts).toBe(8);
      expect(result.activeTrends).toBe(3);
    });

    it('should handle reset learning data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 450 }] }); // strategy memory
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 12500 }] }); // outcomes
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 8900 }] }); // signals

      const result = await ContinuousLearningService.resetLearningData(USER_ID, {
        scope: 'all',
      });

      expect(result.deleted).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'learning.reset',
          resourceType: 'learning_system',
        }),
      );
    });

    it('should invalidate cache on reset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 10 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 20 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ deleted_count: 30 }] });

      await ContinuousLearningService.resetLearningData(USER_ID, { scope: 'all' });

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should return cached system status when available', async () => {
      const cached = {
        is_active: true,
        health: 'healthy',
        total_strategies_learned: 450,
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await ContinuousLearningService.getSystemStatus();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});

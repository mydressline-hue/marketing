/**
 * Unit tests for ChannelAllocationOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (aggregation, classification, matrix building).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ChannelAllocationOutputService } from '../../../../src/services/final-outputs/ChannelAllocationOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT_DECISION_PAID_ADS = {
  id: 'decision-1',
  agent_type: 'paid_ads',
  decision_type: 'budget_recommendation',
  decision_data: {
    channel: 'Google',
    recommendation: 'Increase Google Ads budget by 15%',
    risk_level: 'low',
    scaling_potential: 'scale up',
    action: 'increase',
  },
  confidence: 0.85,
  created_at: '2026-01-15T10:00:00Z',
};

const AGENT_DECISION_PERF = {
  id: 'decision-2',
  agent_type: 'performance_analytics',
  decision_type: 'performance_review',
  decision_data: {
    channel: 'Meta',
    recommendation: 'Meta ROAS trending upward',
    risk_level: 'medium',
    reasoning: 'CPC decreasing while conversions increase',
  },
  confidence: 0.78,
  created_at: '2026-01-14T10:00:00Z',
};

const AGENT_DECISION_BUDGET = {
  id: 'decision-3',
  agent_type: 'budget_optimization',
  decision_type: 'reallocation',
  decision_data: {
    channel: 'TikTok',
    recommendation: 'Reduce TikTok spend due to declining ROAS',
    risk_level: 'high',
    scaling_potential: 'maintain',
    optimization_note: 'Consider audience retargeting before scaling down',
  },
  confidence: 0.72,
  created_at: '2026-01-13T10:00:00Z',
};

const BUDGET_ALLOCATION_US = {
  id: 'budget-1',
  country_id: 'country-us',
  channel_allocations: { Google: 5000, Meta: 3000, TikTok: 2000 },
  total_budget: 10000,
  total_spent: 7500,
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

const BUDGET_ALLOCATION_DE = {
  id: 'budget-2',
  country_id: 'country-de',
  channel_allocations: { Google: 3000, Meta: 2000 },
  total_budget: 5000,
  total_spent: 3200,
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

const CAMPAIGN_GOOGLE_US = {
  id: 'campaign-1',
  country_id: 'country-us',
  platform: 'Google',
  budget: 5000,
  spent: 4500,
  impressions: 200000,
  clicks: 10000,
  conversions: 500,
  revenue: 25000,
  status: 'active',
};

const CAMPAIGN_META_US = {
  id: 'campaign-2',
  country_id: 'country-us',
  platform: 'Meta',
  budget: 3000,
  spent: 2800,
  impressions: 150000,
  clicks: 7500,
  conversions: 300,
  revenue: 12000,
  status: 'active',
};

const CAMPAIGN_TIKTOK_US = {
  id: 'campaign-3',
  country_id: 'country-us',
  platform: 'TikTok',
  budget: 2000,
  spent: 1800,
  impressions: 100000,
  clicks: 5000,
  conversions: 100,
  revenue: 3000,
  status: 'paused',
};

const COUNTRY_US = { id: 'country-us', code: 'US', name: 'United States' };
const COUNTRY_DE = { id: 'country-de', code: 'DE', name: 'Germany' };

// ---------------------------------------------------------------------------
// Helper to set up DB mocks for generateChannelAllocationMatrix
// ---------------------------------------------------------------------------

function setupAllMocks() {
  mockCacheGet.mockResolvedValue(null);

  // 1. agent_decisions query
  mockQuery.mockResolvedValueOnce({
    rows: [AGENT_DECISION_PAID_ADS, AGENT_DECISION_PERF, AGENT_DECISION_BUDGET],
    rowCount: 3,
  });

  // 2. budget_allocations query
  mockQuery.mockResolvedValueOnce({
    rows: [BUDGET_ALLOCATION_US, BUDGET_ALLOCATION_DE],
    rowCount: 2,
  });

  // 3. campaigns query
  mockQuery.mockResolvedValueOnce({
    rows: [CAMPAIGN_GOOGLE_US, CAMPAIGN_META_US, CAMPAIGN_TIKTOK_US],
    rowCount: 3,
  });

  // 4. countries query
  mockQuery.mockResolvedValueOnce({
    rows: [COUNTRY_US, COUNTRY_DE],
    rowCount: 2,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChannelAllocationOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // generateChannelAllocationMatrix
  // =========================================================================

  describe('generateChannelAllocationMatrix()', () => {
    it('returns a valid matrix structure with all required fields', async () => {
      setupAllMocks();

      const result =
        await ChannelAllocationOutputService.generateChannelAllocationMatrix();

      expect(result).toBeDefined();
      expect(result.matrix).toBeInstanceOf(Array);
      expect(result.country_breakdown).toBeInstanceOf(Array);
      expect(typeof result.total_budget).toBe('number');
      expect(result.optimization_notes).toBeInstanceOf(Array);
      expect(typeof result.generated_at).toBe('string');
      expect(typeof result.confidence_score).toBe('number');
    });

    it('correctly computes total budget from budget allocations', async () => {
      setupAllMocks();

      const result =
        await ChannelAllocationOutputService.generateChannelAllocationMatrix();

      // 10000 + 5000 = 15000
      expect(result.total_budget).toBe(15000);
    });

    it('returns cached result when available', async () => {
      const cachedMatrix = {
        matrix: [],
        country_breakdown: [],
        total_budget: 10000,
        optimization_notes: [],
        generated_at: '2026-01-01T00:00:00Z',
        confidence_score: 0.8,
      };
      mockCacheGet.mockResolvedValue(cachedMatrix);

      const result =
        await ChannelAllocationOutputService.generateChannelAllocationMatrix();

      expect(result).toEqual(cachedMatrix);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns an empty matrix when no data exists', async () => {
      mockCacheGet.mockResolvedValue(null);

      // Empty results for all queries
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // agent_decisions
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // budget_allocations
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // campaigns
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // countries

      const result =
        await ChannelAllocationOutputService.generateChannelAllocationMatrix();

      expect(result.total_budget).toBe(0);
      expect(result.country_breakdown).toHaveLength(0);
      expect(result.confidence_score).toBe(0);
    });

    it('caches the result after generation', async () => {
      setupAllMocks();

      await ChannelAllocationOutputService.generateChannelAllocationMatrix();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'final_output:channel_allocation:latest',
        expect.objectContaining({
          matrix: expect.any(Array),
          total_budget: expect.any(Number),
        }),
        300,
      );
    });
  });

  // =========================================================================
  // determinePriorityLevel
  // =========================================================================

  describe('determinePriorityLevel()', () => {
    it('returns critical for high allocation and high ROAS', () => {
      expect(
        ChannelAllocationOutputService.determinePriorityLevel(30, 4),
      ).toBe('critical');
    });

    it('returns high for medium allocation or good ROAS', () => {
      expect(
        ChannelAllocationOutputService.determinePriorityLevel(16, 1),
      ).toBe('high');
    });

    it('returns medium for moderate allocation or ROAS', () => {
      expect(
        ChannelAllocationOutputService.determinePriorityLevel(10, 1),
      ).toBe('medium');
    });

    it('returns low for small allocation', () => {
      expect(
        ChannelAllocationOutputService.determinePriorityLevel(4, 1),
      ).toBe('low');
    });

    it('returns experimental for very small allocation', () => {
      expect(
        ChannelAllocationOutputService.determinePriorityLevel(1, 0.5),
      ).toBe('experimental');
    });
  });

  // =========================================================================
  // determineScalingPotential
  // =========================================================================

  describe('determineScalingPotential()', () => {
    it('returns high when agent insights recommend scaling', () => {
      const insights = {
        recommendations: [],
        riskAssessments: [],
        scalingRecommendations: ['scale up'],
        confidences: [0.8],
      };

      expect(
        ChannelAllocationOutputService.determineScalingPotential(
          insights,
          2,
          30,
        ),
      ).toBe('high');
    });

    it('returns high for excellent ROAS and conversions', () => {
      expect(
        ChannelAllocationOutputService.determineScalingPotential(
          undefined,
          4,
          100,
        ),
      ).toBe('high');
    });

    it('returns medium for good ROAS and conversions', () => {
      expect(
        ChannelAllocationOutputService.determineScalingPotential(
          undefined,
          2,
          25,
        ),
      ).toBe('medium');
    });

    it('returns low for poor performance', () => {
      expect(
        ChannelAllocationOutputService.determineScalingPotential(
          undefined,
          0.5,
          5,
        ),
      ).toBe('low');
    });
  });

  // =========================================================================
  // determineRiskLevel
  // =========================================================================

  describe('determineRiskLevel()', () => {
    it('returns high when agent decisions indicate high risk', () => {
      const insights = {
        recommendations: [],
        riskAssessments: ['high', 'high', 'medium'],
        scalingRecommendations: [],
        confidences: [],
      };

      expect(
        ChannelAllocationOutputService.determineRiskLevel(
          insights,
          1.5,
          1000,
        ),
      ).toBe('high');
    });

    it('returns high when ROAS is below 1 with spend', () => {
      expect(
        ChannelAllocationOutputService.determineRiskLevel(
          undefined,
          0.8,
          5000,
        ),
      ).toBe('high');
    });

    it('returns medium when ROAS is below 2', () => {
      expect(
        ChannelAllocationOutputService.determineRiskLevel(
          undefined,
          1.5,
          5000,
        ),
      ).toBe('medium');
    });

    it('returns low when ROAS is above 2', () => {
      expect(
        ChannelAllocationOutputService.determineRiskLevel(
          undefined,
          3,
          5000,
        ),
      ).toBe('low');
    });
  });

  // =========================================================================
  // computeConfidence
  // =========================================================================

  describe('computeConfidence()', () => {
    it('returns 0 when no decisions exist', () => {
      expect(ChannelAllocationOutputService.computeConfidence([])).toBe(0);
    });

    it('computes average confidence from valid decisions', () => {
      const decisions = [
        { ...AGENT_DECISION_PAID_ADS, confidence: 0.8 },
        { ...AGENT_DECISION_PERF, confidence: 0.6 },
      ];

      expect(
        ChannelAllocationOutputService.computeConfidence(decisions as any),
      ).toBe(0.7);
    });

    it('ignores invalid confidence values', () => {
      const decisions = [
        { ...AGENT_DECISION_PAID_ADS, confidence: 0.8 },
        { ...AGENT_DECISION_PERF, confidence: NaN },
      ];

      expect(
        ChannelAllocationOutputService.computeConfidence(decisions as any),
      ).toBe(0.8);
    });
  });

  // =========================================================================
  // gatherOptimizationNotes
  // =========================================================================

  describe('gatherOptimizationNotes()', () => {
    it('extracts unique notes from agent decisions', () => {
      const decisions = [
        AGENT_DECISION_PAID_ADS,
        AGENT_DECISION_PERF,
        AGENT_DECISION_BUDGET,
      ];

      const notes = ChannelAllocationOutputService.gatherOptimizationNotes(
        decisions as any,
      );

      expect(notes).toContain('Increase Google Ads budget by 15%');
      expect(notes).toContain('Meta ROAS trending upward');
      expect(notes).toContain('CPC decreasing while conversions increase');
      expect(notes).toContain('Reduce TikTok spend due to declining ROAS');
      expect(notes).toContain(
        'Consider audience retargeting before scaling down',
      );
    });

    it('deduplicates identical notes', () => {
      const decisions = [
        {
          ...AGENT_DECISION_PAID_ADS,
          decision_data: { recommendation: 'Same note' },
        },
        {
          ...AGENT_DECISION_PERF,
          decision_data: { recommendation: 'Same note' },
        },
      ];

      const notes = ChannelAllocationOutputService.gatherOptimizationNotes(
        decisions as any,
      );

      const sameNoteCount = notes.filter((n) => n === 'Same note').length;
      expect(sameNoteCount).toBe(1);
    });

    it('returns empty array when no decisions have notes', () => {
      const decisions = [
        {
          ...AGENT_DECISION_PAID_ADS,
          decision_data: {},
        },
      ];

      const notes = ChannelAllocationOutputService.gatherOptimizationNotes(
        decisions as any,
      );

      expect(notes).toEqual([]);
    });
  });

  // =========================================================================
  // aggregateChannelMetrics
  // =========================================================================

  describe('aggregateChannelMetrics()', () => {
    it('aggregates campaign data by channel', () => {
      const countryLookup = new Map([
        ['country-us', COUNTRY_US],
        ['country-de', COUNTRY_DE],
      ]);

      const result = ChannelAllocationOutputService.aggregateChannelMetrics(
        [CAMPAIGN_GOOGLE_US, CAMPAIGN_META_US] as any,
        [] as any,
        countryLookup as any,
      );

      const google = result.get('google');
      expect(google).toBeDefined();
      expect(google!.totalSpend).toBe(4500);
      expect(google!.totalRevenue).toBe(25000);
      expect(google!.totalConversions).toBe(500);
      expect(google!.countries.has('US')).toBe(true);
    });

    it('merges budget allocation data into channel metrics', () => {
      const countryLookup = new Map([
        ['country-us', COUNTRY_US],
        ['country-de', COUNTRY_DE],
      ]);

      const result = ChannelAllocationOutputService.aggregateChannelMetrics(
        [] as any,
        [BUDGET_ALLOCATION_US, BUDGET_ALLOCATION_DE] as any,
        countryLookup as any,
      );

      const google = result.get('google');
      expect(google).toBeDefined();
      // Google: 5000 (US) + 3000 (DE) = 8000 from budget allocations
      expect(google!.totalBudgetAllocated).toBe(8000);
      expect(google!.countries.has('US')).toBe(true);
      expect(google!.countries.has('DE')).toBe(true);
    });
  });

  // =========================================================================
  // buildCountryBreakdown
  // =========================================================================

  describe('buildCountryBreakdown()', () => {
    it('builds per-country channel breakdowns', () => {
      const countryLookup = new Map([
        ['country-us', COUNTRY_US],
        ['country-de', COUNTRY_DE],
      ]);

      const result = ChannelAllocationOutputService.buildCountryBreakdown(
        [BUDGET_ALLOCATION_US] as any,
        [CAMPAIGN_GOOGLE_US, CAMPAIGN_META_US] as any,
        countryLookup as any,
      );

      const us = result.find((c) => c.country_code === 'US');
      expect(us).toBeDefined();
      expect(us!.channels.length).toBeGreaterThan(0);

      const googleChannel = us!.channels.find((c) => c.channel === 'Google');
      expect(googleChannel).toBeDefined();
      expect(googleChannel!.estimated_spend).toBe(4500);
      expect(googleChannel!.projected_conversions).toBe(500);
    });

    it('sorts countries alphabetically', () => {
      const countryLookup = new Map([
        ['country-us', COUNTRY_US],
        ['country-de', COUNTRY_DE],
      ]);

      const result = ChannelAllocationOutputService.buildCountryBreakdown(
        [BUDGET_ALLOCATION_US, BUDGET_ALLOCATION_DE] as any,
        [CAMPAIGN_GOOGLE_US] as any,
        countryLookup as any,
      );

      // DE should come before US alphabetically
      expect(result[0].country_code).toBe('DE');
      expect(result[1].country_code).toBe('US');
    });
  });

  // =========================================================================
  // getChannelPerformanceHistory
  // =========================================================================

  describe('getChannelPerformanceHistory()', () => {
    it('returns formatted historical performance data', async () => {
      mockCacheGet.mockResolvedValue(null);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            platform: 'Google',
            period: '2026-01',
            total_spend: '5000',
            total_revenue: '20000',
            total_conversions: '400',
            total_clicks: '8000',
            total_impressions: '150000',
          },
          {
            platform: 'Meta',
            period: '2026-01',
            total_spend: '3000',
            total_revenue: '9000',
            total_conversions: '200',
            total_clicks: '5000',
            total_impressions: '100000',
          },
        ],
        rowCount: 2,
      });

      const result =
        await ChannelAllocationOutputService.getChannelPerformanceHistory();

      expect(result).toHaveLength(2);
      expect(result[0].channel).toBe('Google');
      expect(result[0].spend).toBe(5000);
      expect(result[0].revenue).toBe(20000);
      expect(result[0].roas).toBe(4);
      expect(result[0].conversions).toBe(400);
      expect(result[0].clicks).toBe(8000);
      expect(result[0].impressions).toBe(150000);
    });

    it('returns cached history when available', async () => {
      const cachedHistory = [
        {
          channel: 'Google',
          period: '2026-01',
          spend: 5000,
          revenue: 20000,
          roas: 4,
          conversions: 400,
          clicks: 8000,
          impressions: 150000,
        },
      ];
      mockCacheGet.mockResolvedValue(cachedHistory);

      const result =
        await ChannelAllocationOutputService.getChannelPerformanceHistory();

      expect(result).toEqual(cachedHistory);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('handles zero spend gracefully with ROAS = 0', async () => {
      mockCacheGet.mockResolvedValue(null);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            platform: 'Email',
            period: '2026-01',
            total_spend: '0',
            total_revenue: '0',
            total_conversions: '0',
            total_clicks: '0',
            total_impressions: '0',
          },
        ],
        rowCount: 1,
      });

      const result =
        await ChannelAllocationOutputService.getChannelPerformanceHistory();

      expect(result[0].roas).toBe(0);
      expect(result[0].spend).toBe(0);
    });
  });

  // =========================================================================
  // extractAgentInsights
  // =========================================================================

  describe('extractAgentInsights()', () => {
    it('groups insights by channel', () => {
      const decisions = [
        AGENT_DECISION_PAID_ADS,
        AGENT_DECISION_PERF,
        AGENT_DECISION_BUDGET,
      ];

      const insights = ChannelAllocationOutputService.extractAgentInsights(
        decisions as any,
      );

      expect(insights.has('google')).toBe(true);
      expect(insights.has('meta')).toBe(true);
      expect(insights.has('tiktok')).toBe(true);
    });

    it('collects recommendations and risk assessments', () => {
      const decisions = [AGENT_DECISION_PAID_ADS];

      const insights = ChannelAllocationOutputService.extractAgentInsights(
        decisions as any,
      );

      const google = insights.get('google');
      expect(google).toBeDefined();
      expect(google!.recommendations).toContain(
        'Increase Google Ads budget by 15%',
      );
      expect(google!.riskAssessments).toContain('low');
      expect(google!.scalingRecommendations).toContain('scale up');
      expect(google!.confidences).toContain(0.85);
    });

    it('handles decisions with no channel gracefully', () => {
      const decisions = [
        {
          ...AGENT_DECISION_PAID_ADS,
          decision_data: { note: 'general insight' },
        },
      ];

      const insights = ChannelAllocationOutputService.extractAgentInsights(
        decisions as any,
      );

      // Should not create an entry for empty channel
      expect(insights.size).toBe(0);
    });
  });
});

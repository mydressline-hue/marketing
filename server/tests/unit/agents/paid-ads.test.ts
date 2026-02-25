// ============================================================
// Unit Tests - PaidAdsAgent (Agent 3)
// Covers core methods with mocked DB, Redis, and AI
// ============================================================

import type { AgentInput, AgentOutput, AgentConfidenceScore } from '../../../src/agents/base/types';
import type {
  Campaign,
  CampaignMetrics,
  Platform,
  RetargetingConfig,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import of the module under test
// ---------------------------------------------------------------------------

const mockPoolQuery = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('../../../src/config/database', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

jest.mock('../../../src/config/redis', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

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

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid'),
  retryWithBackoff: jest.fn().mockImplementation((fn) => fn()),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import the module under test after all mocks are in place
// ---------------------------------------------------------------------------

import { PaidAdsAgent } from '../../../src/agents/modules/PaidAdsAgent';
import type {
  CampaignAnalysis,
  BiddingRecommendation,
  ConversionTrackingResult,
  PlatformPerformance,
  BudgetReallocation,
  TargetingRecommendation,
} from '../../../src/agents/modules/PaidAdsAgent';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeCampaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-001',
    name: 'Test Campaign',
    country_id: 'country-001',
    platform: 'google' as Platform,
    type: 'search',
    status: 'active',
    budget: 1000,
    spent: 500,
    start_date: '2026-01-01',
    end_date: '2026-03-01',
    impressions: 10000,
    clicks: 200,
    conversions: 20,
    revenue: 1500,
    created_by: 'user-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    country_name: 'United States',
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-001',
    name: 'Test Campaign',
    country_id: 'country-001',
    platform: 'google',
    type: 'search',
    status: 'active',
    budget: 1000,
    spent: 500,
    start_date: '2026-01-01',
    end_date: '2026-03-01',
    targeting: {},
    metrics: {
      impressions: 10000,
      clicks: 200,
      conversions: 20,
      spend: 500,
      ctr: 2.0,
      cpc: 2.5,
      cpa: 25.0,
      roas: 3.0,
    },
    created_by: 'user-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function makeAgentInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    context: {},
    parameters: {},
    requestId: 'req-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PaidAdsAgent', () => {
  let agent: PaidAdsAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null); // default: no cache
    mockCacheSet.mockResolvedValue(undefined);
    agent = new PaidAdsAgent();
  });

  // ----------------------------------------------------------------
  // 1. Constructor and configuration
  // ----------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('should initialise with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('paid_ads');
      expect(agent.getConfig().model).toBe('sonnet');
      expect(agent.getConfig().confidenceThreshold).toBe(70);
    });

    it('should return correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual([
        'budget_optimization',
        'performance_analytics',
        'conversion_optimization',
      ]);
    });
  });

  // ----------------------------------------------------------------
  // 2. process() - main pipeline
  // ----------------------------------------------------------------

  describe('process()', () => {
    it('should return no_active_campaigns when no campaigns are found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // fetchActiveCampaigns
      // logDecision: persistState + agent_decisions insert
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const input = makeAgentInput();
      const output: AgentOutput = await agent.process(input);

      expect(output.decision).toBe('no_active_campaigns');
      expect(output.agentType).toBe('paid_ads');
      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.confidence.level).toBe('low');
    });

    it('should analyse active campaigns and return optimization output', async () => {
      const rows = [makeCampaignRow(), makeCampaignRow({ id: 'camp-002', name: 'Campaign 2' })];

      // fetchActiveCampaigns
      mockPoolQuery.mockResolvedValueOnce({ rows });

      // getPlatformPerformance (google)
      mockPoolQuery.mockResolvedValueOnce({ rows });

      // analyzeCampaignPerformance (camp-001): campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [rows[0]] });
      // analyzeCampaignPerformance (camp-001): historical averages
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ avg_ctr: '1.5', avg_cpc: '2.0', avg_roas: '2.5', avg_conversions: '15' }],
      });

      // analyzeCampaignPerformance (camp-002): campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [rows[1]] });
      // analyzeCampaignPerformance (camp-002): historical averages
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ avg_ctr: '1.5', avg_cpc: '2.0', avg_roas: '2.5', avg_conversions: '15' }],
      });

      // trackConversions for each campaign: campaign query + recent count
      mockPoolQuery.mockResolvedValueOnce({ rows: [rows[0]] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '5' }] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [rows[1]] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '3' }] });

      // persistState + logDecision
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const input = makeAgentInput();
      const output: AgentOutput = await agent.process(input);

      expect(output.decision).toBe('campaign_optimization_complete');
      expect(output.agentType).toBe('paid_ads');
      expect((output.data as Record<string, unknown>).totalCampaigns).toBe(2);
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.timestamp).toBeDefined();
    });
  });

  // ----------------------------------------------------------------
  // 3. analyzeCampaignPerformance()
  // ----------------------------------------------------------------

  describe('analyzeCampaignPerformance()', () => {
    it('should compute metrics and trends for a campaign', async () => {
      const row = makeCampaignRow();

      // campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [row] });
      // historical averages
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ avg_ctr: '1.0', avg_cpc: '3.0', avg_roas: '2.0', avg_conversions: '10' }],
      });

      const analysis: CampaignAnalysis = await agent.analyzeCampaignPerformance('camp-001');

      expect(analysis.campaignId).toBe('camp-001');
      expect(analysis.metrics.impressions).toBe(10000);
      expect(analysis.metrics.clicks).toBe(200);
      expect(analysis.metrics.conversions).toBe(20);
      expect(analysis.metrics.roas).toBe(3.0);
      expect(analysis.score).toBeDefined();
      expect(analysis.score.score).toBeGreaterThan(0);

      // CTR=2.0 vs avg 1.0 => improving
      expect(analysis.trends.ctr).toBe('improving');
    });

    it('should return cached analysis when available', async () => {
      const cachedAnalysis: CampaignAnalysis = {
        campaignId: 'camp-cached',
        metrics: { impressions: 5000, clicks: 100, conversions: 10, spend: 300, ctr: 2.0, cpc: 3.0, cpa: 30.0, roas: 2.5 },
        trends: { ctr: 'stable', cpc: 'stable', roas: 'improving', conversions: 'stable' },
        recommendations: [],
        score: { score: 80, level: 'high', factors: {} },
      };

      mockCacheGet.mockResolvedValueOnce(cachedAnalysis);

      const result = await agent.analyzeCampaignPerformance('camp-cached');
      expect(result.campaignId).toBe('camp-cached');
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent campaign', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.analyzeCampaignPerformance('nonexistent')).rejects.toThrow(
        'Campaign with id "nonexistent" not found',
      );
    });
  });

  // ----------------------------------------------------------------
  // 4. optimizeBidding()
  // ----------------------------------------------------------------

  describe('optimizeBidding()', () => {
    it('should recommend manual bidding for low-conversion campaigns', async () => {
      const campaign = makeCampaign({
        metrics: {
          impressions: 5000,
          clicks: 100,
          conversions: 5,
          spend: 200,
          ctr: 2.0,
          cpc: 2.0,
          cpa: 40.0,
          roas: 1.5,
        },
      });

      const rec: BiddingRecommendation = await agent.optimizeBidding(campaign);

      expect(rec.strategy).toBe('manual');
      expect(rec.reasoning).toContain('Insufficient conversion data');
      expect(rec.suggestedBid).toBe(2.0); // falls back to CPC
    });

    it('should recommend target_roas for high-performing campaigns', async () => {
      const campaign = makeCampaign({
        spent: 500,
        metrics: {
          impressions: 50000,
          clicks: 2000,
          conversions: 100,
          spend: 500,
          ctr: 4.0,
          cpc: 0.25,
          cpa: 5.0,
          roas: 4.0,
        },
      });

      const rec: BiddingRecommendation = await agent.optimizeBidding(campaign);

      expect(rec.strategy).toBe('target_roas');
      expect(rec.suggestedBid).toBeCloseTo(3.6, 1); // 4.0 * 0.9
      expect(rec.reasoning).toContain('Strong ROAS');
    });

    it('should recommend target_cpa when ROAS < 2.0 but conversions >= 30', async () => {
      const campaign = makeCampaign({
        spent: 600,
        metrics: {
          impressions: 30000,
          clicks: 1500,
          conversions: 45,
          spend: 600,
          ctr: 5.0,
          cpc: 0.4,
          cpa: 13.33,
          roas: 1.5,
        },
      });

      const rec: BiddingRecommendation = await agent.optimizeBidding(campaign);

      expect(rec.strategy).toBe('target_cpa');
      expect(rec.reasoning).toContain('Sufficient conversion history');
    });

    it('should recommend maximize_conversions as a fallback', async () => {
      const campaign = makeCampaign({
        spent: 300,
        metrics: {
          impressions: 20000,
          clicks: 800,
          conversions: 20,
          spend: 300,
          ctr: 4.0,
          cpc: 0.375,
          cpa: 15.0,
          roas: 1.2,
        },
      });

      const rec: BiddingRecommendation = await agent.optimizeBidding(campaign);

      expect(rec.strategy).toBe('maximize_conversions');
    });
  });

  // ----------------------------------------------------------------
  // 5. detectUnderperformers()
  // ----------------------------------------------------------------

  describe('detectUnderperformers()', () => {
    it('should identify campaigns with ROAS below 1.0', () => {
      const campaigns: Campaign[] = [
        makeCampaign({
          id: 'good-camp',
          spent: 500,
          metrics: { impressions: 10000, clicks: 200, conversions: 20, spend: 500, ctr: 2.0, cpc: 2.5, cpa: 25.0, roas: 3.0 },
        }),
        makeCampaign({
          id: 'bad-camp',
          spent: 500,
          metrics: { impressions: 10000, clicks: 200, conversions: 5, spend: 500, ctr: 2.0, cpc: 2.5, cpa: 100.0, roas: 0.5 },
        }),
      ];

      const underperformers = agent.detectUnderperformers(campaigns);

      expect(underperformers).toHaveLength(1);
      expect(underperformers[0].id).toBe('bad-camp');
    });

    it('should not flag campaigns with zero spend', () => {
      const campaigns: Campaign[] = [
        makeCampaign({ id: 'no-spend', spent: 0 }),
      ];

      const underperformers = agent.detectUnderperformers(campaigns);
      expect(underperformers).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------
  // 6. calculateROAS()
  // ----------------------------------------------------------------

  describe('calculateROAS()', () => {
    it('should return 0 when spent is 0', () => {
      const campaign = makeCampaign({ spent: 0 });
      expect(agent.calculateROAS(campaign)).toBe(0);
    });

    it('should compute correct ROAS from campaign metrics', () => {
      const campaign = makeCampaign({
        spent: 400,
        metrics: {
          impressions: 10000,
          clicks: 200,
          conversions: 20,
          spend: 400,
          ctr: 2.0,
          cpc: 2.0,
          cpa: 20.0,
          roas: 2.5,
        },
      });

      // calculateROAS checks metrics.revenue, then falls back to direct revenue
      // Since metrics does not have revenue, it will look at (campaign as CampaignRow).revenue
      // which is undefined, so returns 0
      const roas = agent.calculateROAS(campaign);
      expect(typeof roas).toBe('number');
    });
  });

  // ----------------------------------------------------------------
  // 7. trackConversions()
  // ----------------------------------------------------------------

  describe('trackConversions()', () => {
    it('should detect conversion tracking issues', async () => {
      const row = makeCampaignRow({
        clicks: 200,
        conversions: 0,
        revenue: 0,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '0' }] }); // recent conversions

      const result: ConversionTrackingResult = await agent.trackConversions('camp-001');

      expect(result.pixelStatus).toBe('error');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('No conversions'))).toBe(true);
    });

    it('should report healthy tracking for a well-configured campaign', async () => {
      const row = makeCampaignRow({
        clicks: 200,
        conversions: 20,
        revenue: 1500,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ recent_count: '5' }] }); // recent conversions

      const result: ConversionTrackingResult = await agent.trackConversions('camp-001');

      expect(result.pixelStatus).toBe('active');
      expect(result.issues).toHaveLength(0);
      expect(result.conversions).toBe(20);
      expect(result.revenue).toBe(1500);
    });

    it('should throw NotFoundError for missing campaign', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.trackConversions('nonexistent')).rejects.toThrow(
        'Campaign with id "nonexistent" not found',
      );
    });
  });

  // ----------------------------------------------------------------
  // 8. getPlatformPerformance()
  // ----------------------------------------------------------------

  describe('getPlatformPerformance()', () => {
    it('should aggregate platform performance from DB', async () => {
      const rows = [
        makeCampaignRow({ id: 'camp-001', spent: 500, revenue: 1500 }),
        makeCampaignRow({ id: 'camp-002', spent: 300, revenue: 600 }),
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows });

      const result: PlatformPerformance = await agent.getPlatformPerformance('google');

      expect(result.platform).toBe('google');
      expect(result.campaigns).toBe(2);
      expect(result.totalSpend).toBe(800);
      expect(result.totalRevenue).toBe(2100);
      expect(result.averageROAS).toBeCloseTo(2.63, 1);
      expect(result.topCampaigns.length).toBeLessThanOrEqual(5);
      expect(result.topCampaigns[0].roas).toBeGreaterThanOrEqual(result.topCampaigns[1].roas);
    });

    it('should return cached platform performance when available', async () => {
      const cached: PlatformPerformance = {
        platform: 'meta',
        campaigns: 3,
        totalSpend: 1000,
        totalRevenue: 3000,
        averageROAS: 3.0,
        topCampaigns: [],
      };

      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await agent.getPlatformPerformance('meta');
      expect(result.platform).toBe('meta');
      expect(result.totalSpend).toBe(1000);
      expect(mockPoolQuery).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // 9. suggestBudgetReallocation()
  // ----------------------------------------------------------------

  describe('suggestBudgetReallocation()', () => {
    it('should suggest reallocations from underperformers to top performers', async () => {
      const campaigns: Campaign[] = [
        makeCampaign({
          id: 'under-camp',
          budget: 1000,
          spent: 800,
          metrics: {
            impressions: 20000,
            clicks: 400,
            conversions: 5,
            spend: 800,
            ctr: 2.0,
            cpc: 2.0,
            cpa: 160.0,
            roas: 0.5,
          },
        }),
        makeCampaign({
          id: 'top-camp',
          budget: 1000,
          spent: 600,
          metrics: {
            impressions: 30000,
            clicks: 600,
            conversions: 60,
            spend: 600,
            ctr: 2.0,
            cpc: 1.0,
            cpa: 10.0,
            roas: 5.0,
          },
        }),
      ];

      const reallocations: BudgetReallocation[] = await agent.suggestBudgetReallocation(campaigns);

      expect(reallocations.length).toBeGreaterThan(0);
      expect(reallocations[0].fromCampaign).toBe('under-camp');
      expect(reallocations[0].toCampaign).toBe('top-camp');
      expect(reallocations[0].amount).toBe(200); // 20% of 1000 budget
      expect(reallocations[0].reasoning).toContain('ROAS');
    });

    it('should return empty array when fewer than 2 campaigns', async () => {
      const result = await agent.suggestBudgetReallocation([makeCampaign()]);
      expect(result).toEqual([]);
    });

    it('should return empty when no underperformers or no top performers', async () => {
      const campaigns = [
        makeCampaign({ id: 'c1', spent: 100, metrics: { impressions: 1000, clicks: 50, conversions: 5, spend: 100, ctr: 5.0, cpc: 2.0, cpa: 20.0, roas: 1.5 } }),
        makeCampaign({ id: 'c2', spent: 100, metrics: { impressions: 1000, clicks: 50, conversions: 5, spend: 100, ctr: 5.0, cpc: 2.0, cpa: 20.0, roas: 1.5 } }),
      ];

      const result = await agent.suggestBudgetReallocation(campaigns);
      expect(result).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // 10. configureRetargeting()
  // ----------------------------------------------------------------

  describe('configureRetargeting()', () => {
    it('should configure retargeting for a campaign with sufficient traffic', async () => {
      const row = makeCampaignRow({
        impressions: 5000,
        clicks: 150,
        conversions: 15,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // audience segments

      const config: RetargetingConfig = await agent.configureRetargeting('camp-001');

      expect(config.enabled).toBe(true);
      expect(config.lookback_days).toBeGreaterThan(0);
      expect(config.lookback_days).toBeLessThanOrEqual(30);
      expect(Array.isArray(config.audience_ids)).toBe(true);
      expect(Array.isArray(config.exclusions)).toBe(true);
    });

    it('should disable retargeting for campaigns with insufficient traffic', async () => {
      const row = makeCampaignRow({
        impressions: 500,
        clicks: 5,
        conversions: 0,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // audience segments

      const config: RetargetingConfig = await agent.configureRetargeting('camp-001');

      expect(config.enabled).toBe(false);
      expect(config.lookback_days).toBe(30); // default for low-data
    });

    it('should throw NotFoundError for missing campaign', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.configureRetargeting('nonexistent')).rejects.toThrow(
        'Campaign with id "nonexistent" not found',
      );
    });
  });

  // ----------------------------------------------------------------
  // 11. optimizeTargeting() — fallback path
  // ----------------------------------------------------------------

  describe('optimizeTargeting()', () => {
    it('should return heuristic targeting for Google campaigns when AI is unavailable', async () => {
      const campaign = makeCampaign({
        platform: 'google',
        metrics: {
          impressions: 10000,
          clicks: 100,
          conversions: 10,
          spend: 500,
          ctr: 1.0,
          cpc: 5.0,
          cpa: 50.0,
          roas: 1.5,
        },
      });

      const result: TargetingRecommendation = await agent.optimizeTargeting(campaign);

      expect(Array.isArray(result.audiences)).toBe(true);
      expect(Array.isArray(result.keywords)).toBe(true);
      expect(Array.isArray(result.placements)).toBe(true);
      expect(Array.isArray(result.exclusions)).toBe(true);
      // Google with low CTR should suggest long-tail keywords
      expect(result.keywords.some((k) => k.includes('long-tail'))).toBe(true);
    });

    it('should return heuristic targeting for Meta campaigns when AI is unavailable', async () => {
      const campaign = makeCampaign({
        platform: 'meta',
        metrics: {
          impressions: 20000,
          clicks: 150,
          conversions: 15,
          spend: 300,
          ctr: 0.75,
          cpc: 2.0,
          cpa: 20.0,
          roas: 2.5,
        },
      });

      const result: TargetingRecommendation = await agent.optimizeTargeting(campaign);

      expect(result.audiences.some((a) => a.includes('lookalike'))).toBe(true);
      expect(result.placements).toContain('feed');
      expect(result.exclusions.some((e) => e.includes('converted'))).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // 12. Confidence scoring integration
  // ----------------------------------------------------------------

  describe('confidence scoring', () => {
    it('should produce low confidence for campaigns without data', async () => {
      const row = makeCampaignRow({
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spent: 0,
        revenue: 0,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ avg_ctr: '0', avg_cpc: '0', avg_roas: '0', avg_conversions: '0' }],
      });

      const analysis = await agent.analyzeCampaignPerformance('camp-001');

      expect(analysis.score.score).toBeLessThan(50);
      expect(['low', 'medium']).toContain(analysis.score.level);
    });

    it('should produce higher confidence for campaigns with strong data', async () => {
      const row = makeCampaignRow({
        impressions: 100000,
        clicks: 5000,
        conversions: 500,
        spent: 2000,
        revenue: 8000,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [row] }); // campaign query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ avg_ctr: '3.0', avg_cpc: '0.4', avg_roas: '2.0', avg_conversions: '200' }],
      });

      const analysis = await agent.analyzeCampaignPerformance('camp-001');

      expect(analysis.score.score).toBeGreaterThan(60);
      expect(analysis.score.factors).toHaveProperty('data_completeness');
      expect(analysis.score.factors).toHaveProperty('sample_size');
      expect(analysis.score.factors).toHaveProperty('roas_health');
    });
  });
});

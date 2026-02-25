// ============================================================
// Budget Optimization Agent - Unit Tests
// ============================================================

import {
  BudgetOptimizationAgent,
  type OptimizationResult,
  type ReallocationPlan,
  type ValidatedPlan,
  type RiskScore,
  type SimulationResult,
  type SpendVelocity,
  type SpendAnomaly,
  type ScalingResult,
  type OptimizationAction,
} from '../../../src/agents/modules/BudgetOptimizationAgent';
import type { BudgetAllocation, RiskGuardrail, Campaign, ROASMetric } from '../../../src/types';
import type { AgentInput, AgentOutput } from '../../../src/agents/base/types';

// ---- Mocks ----

// Mock database pool
const mockQuery = jest.fn();
jest.mock('../../../src/config/database', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Mock redis cache
const mockCacheGet = jest.fn().mockResolvedValue(null);
const mockCacheSet = jest.fn().mockResolvedValue(undefined);
const mockCacheDel = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/config/redis', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheDel: (...args: unknown[]) => mockCacheDel(...args),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock helpers
jest.mock('../../../src/utils/helpers', () => ({
  generateId: () => 'test-uuid-' + Math.random().toString(36).slice(2, 10),
}));

// ---- Test Helpers ----

function createAgent(): BudgetOptimizationAgent {
  return new BudgetOptimizationAgent();
}

function makeBudgetAllocation(
  overrides: Partial<BudgetAllocation> = {},
): BudgetAllocation {
  return {
    id: 'alloc-001',
    country_id: 'country-us',
    channel_allocations: {
      google: 5000,
      meta: 3000,
      tiktok: 2000,
    },
    period_start: new Date(Date.now() - 15 * 86400000).toISOString(),
    period_end: new Date(Date.now() + 15 * 86400000).toISOString(),
    total_budget: 10000,
    total_spent: 4500,
    risk_guardrails: [
      {
        type: 'max_channel_concentration',
        threshold: 60,
        action: 'alert',
        description: 'No single channel should exceed 60% of total budget',
      },
      {
        type: 'max_daily_spend',
        threshold: 500,
        action: 'reduce',
        description: 'Daily spend per channel should not exceed 500',
      },
      {
        type: 'max_reallocation_pct',
        threshold: 2000,
        action: 'alert',
        description: 'Total reallocation should not exceed 2000',
      },
    ],
    created_by: 'user-001',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    context: {},
    parameters: {},
    requestId: 'req-test-001',
    ...overrides,
  };
}

// ---- Test Suite ----

describe('BudgetOptimizationAgent', () => {
  let agent: BudgetOptimizationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    agent = createAgent();
  });

  // Test 1: Constructor and configuration
  describe('constructor and config', () => {
    it('should initialize with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('budget_optimization');
      expect(agent.getConfig().model).toBe('opus');
      expect(agent.getConfig().agentType).toBe('budget_optimization');
      expect(agent.getConfig().confidenceThreshold).toBe(65);
    });

    it('should accept custom config overrides', () => {
      const custom = new BudgetOptimizationAgent({
        confidenceThreshold: 80,
        maxRetries: 5,
        timeoutMs: 120000,
      });
      expect(custom.getConfig().confidenceThreshold).toBe(80);
      expect(custom.getConfig().maxRetries).toBe(5);
      expect(custom.getConfig().timeoutMs).toBe(120000);
      expect(custom.getConfig().model).toBe('opus');
    });
  });

  // Test 2: getChallengeTargets
  describe('getChallengeTargets', () => {
    it('should return the correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual([
        'paid_ads',
        'performance_analytics',
        'revenue_forecasting',
      ]);
      expect(targets).toHaveLength(3);
    });
  });

  // Test 3: getSystemPrompt
  describe('getSystemPrompt', () => {
    it('should return a non-empty system prompt containing budget optimization context', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Budget Optimization');
      expect(prompt).toContain('ROAS');
      expect(prompt).toContain('guardrails');
      expect(prompt).toContain('confidence');
    });
  });

  // Test 4: calculateRiskScore
  describe('calculateRiskScore', () => {
    it('should return low risk for a well-diversified allocation', () => {
      const allocation = makeBudgetAllocation({
        channel_allocations: {
          google: 2500,
          meta: 2500,
          tiktok: 2500,
          snapchat: 2500,
        },
        total_budget: 10000,
        total_spent: 5000,
        risk_guardrails: [
          { type: 'max_channel_concentration', threshold: 60, action: 'alert', description: '' },
          { type: 'max_daily_spend', threshold: 500, action: 'reduce', description: '' },
          { type: 'min_channel_budget', threshold: 100, action: 'alert', description: '' },
        ],
      });

      const riskScore = agent.calculateRiskScore(allocation);

      expect(riskScore.score).toBeDefined();
      expect(riskScore.level).toBe('low');
      expect(riskScore.factors).toHaveProperty('concentration_risk');
      expect(riskScore.factors).toHaveProperty('utilization_risk');
      expect(riskScore.factors).toHaveProperty('diversity_risk');
      expect(riskScore.factors).toHaveProperty('guardrail_coverage');
      expect(riskScore.factors.concentration_risk).toBe(25); // 2500/10000 = 25%
    });

    it('should return high risk for a heavily concentrated allocation', () => {
      const allocation = makeBudgetAllocation({
        channel_allocations: { google: 9500 },
        total_budget: 10000,
        total_spent: 9200,
        risk_guardrails: [],
      });

      const riskScore = agent.calculateRiskScore(allocation);

      expect(riskScore.level).toBe('critical');
      expect(riskScore.factors.concentration_risk).toBe(95);
      expect(riskScore.factors.diversity_risk).toBe(90);
      expect(riskScore.recommendations.length).toBeGreaterThan(0);
    });

    it('should flag missing guardrails as a risk factor', () => {
      const allocation = makeBudgetAllocation({
        risk_guardrails: [],
      });

      const riskScore = agent.calculateRiskScore(allocation);
      expect(riskScore.factors.guardrail_coverage).toBe(80);
      expect(riskScore.recommendations).toContain(
        'No risk guardrails configured: add spend caps and concentration limits',
      );
    });

    it('should flag budget exhaustion risk', () => {
      const allocation = makeBudgetAllocation({
        total_budget: 10000,
        total_spent: 9500,
      });

      const riskScore = agent.calculateRiskScore(allocation);
      expect(riskScore.factors.utilization_risk).toBe(90);
      expect(riskScore.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Budget nearly exhausted'),
        ]),
      );
    });
  });

  // Test 5: enforceGuardrails
  describe('enforceGuardrails', () => {
    it('should pass through a plan that respects all guardrails', () => {
      const plan: ReallocationPlan = {
        fromChannels: { tiktok: 200 },
        toChannels: { google: 200 },
        totalReallocated: 200,
        expectedImpact: 'Shifting 200 to high-ROAS channel',
      };

      const guardrails: RiskGuardrail[] = [
        {
          type: 'max_reallocation_pct',
          threshold: 5000,
          action: 'alert',
          description: 'Max reallocation',
        },
      ];

      const result = agent.enforceGuardrails(plan, guardrails);

      expect(result.approved).toBe(true);
      expect(result.adjustments).toHaveLength(0);
      expect(result.guardrailsApplied).toContain('max_reallocation_pct: 5000');
      expect(result.plan.totalReallocated).toBe(200);
    });

    it('should cap reallocation when exceeding max_reallocation_pct guardrail', () => {
      const plan: ReallocationPlan = {
        fromChannels: { tiktok: 3000 },
        toChannels: { google: 3000 },
        totalReallocated: 3000,
        expectedImpact: 'Large reallocation',
      };

      const guardrails: RiskGuardrail[] = [
        {
          type: 'max_reallocation_pct',
          threshold: 1500,
          action: 'alert',
          description: 'Limit reallocation to 1500',
        },
      ];

      const result = agent.enforceGuardrails(plan, guardrails);

      expect(result.plan.totalReallocated).toBe(1500);
      expect(result.adjustments.length).toBeGreaterThan(0);
      expect(result.adjustments[0]).toContain('Scaled total reallocation');
    });

    it('should block plan when unknown guardrail type has pause action', () => {
      const plan: ReallocationPlan = {
        fromChannels: { tiktok: 500 },
        toChannels: { google: 500 },
        totalReallocated: 500,
        expectedImpact: 'Moderate shift',
      };

      const guardrails: RiskGuardrail[] = [
        {
          type: 'custom_guardrail',
          threshold: 100,
          action: 'pause',
          description: 'Custom rule that blocks execution',
        },
      ];

      const result = agent.enforceGuardrails(plan, guardrails);

      expect(result.approved).toBe(false);
      expect(result.adjustments).toContain(
        'Unknown guardrail "custom_guardrail" with pause action blocked the plan',
      );
    });

    it('should handle empty guardrails list', () => {
      const plan: ReallocationPlan = {
        fromChannels: { tiktok: 500 },
        toChannels: { google: 500 },
        totalReallocated: 500,
        expectedImpact: 'Moderate shift',
      };

      const result = agent.enforceGuardrails(plan, []);

      expect(result.approved).toBe(true);
      expect(result.guardrailsApplied).toHaveLength(0);
      expect(result.adjustments).toHaveLength(0);
    });
  });

  // Test 6: process - no allocation found
  describe('process', () => {
    it('should return no_allocation_found when no active allocation exists', async () => {
      // Mock: no allocation found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = makeInput({
        parameters: { countryId: 'country-nonexistent' },
      });

      const output = await agent.process(input);

      expect(output.agentType).toBe('budget_optimization');
      expect(output.decision).toBe('no_allocation_found');
      expect(output.confidence.score).toBe(0);
      expect(output.confidence.level).toBe('low');
      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.recommendations).toContain(
        'Create a budget allocation before running optimization',
      );
    });

    it('should return a complete optimization output with allocation data', async () => {
      const allocation = makeBudgetAllocation();

      // Mock: fetchCurrentAllocation returns an allocation
      mockQuery.mockResolvedValueOnce({ rows: [allocation] });

      // Mock channel ROAS queries: for each of 3 channels, 4 queries (spend, revenue, prevSpend, prevRevenue)
      const channelQueryMock = () => {
        // Spend query
        mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1500' }] });
        // Revenue query
        mockQuery.mockResolvedValueOnce({
          rows: [{ estimated_revenue: '6000', total_campaign_spend: '1500' }],
        });
        // Previous period spend
        mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1200' }] });
        // Previous period revenue
        mockQuery.mockResolvedValueOnce({
          rows: [{ estimated_revenue: '4200', total_campaign_spend: '1200' }],
        });
      };

      // 3 channels (google, meta, tiktok)
      channelQueryMock();
      channelQueryMock();
      channelQueryMock();

      // Mock high-ROAS campaigns query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'camp-1',
            name: 'Top Campaign',
            budget: 2000,
            spent: 1000,
            metrics: { roas: 5.0 },
            platform: 'google',
            status: 'active',
          },
        ],
      });

      // Mock underperformer campaigns query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'camp-2',
            name: 'Weak Campaign',
            budget: 1000,
            spent: 800,
            metrics: { roas: 0.5 },
            platform: 'tiktok',
            status: 'active',
          },
        ],
      });

      // Note: suggestReallocation will call calculateChannelROAS again.
      // Because we already cached ROAS data (via cacheSet mock), but our mock returns null,
      // so it will re-query. Let's set up cache to return data on second call.
      // Actually since we cleared mocks and cacheGet returns null by default, we need
      // to set up the ROAS queries again for suggestReallocation
      channelQueryMock();
      channelQueryMock();
      channelQueryMock();

      // Mock logDecision query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock persistState query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = makeInput({ parameters: {} });
      const output = await agent.process(input);

      expect(output.agentType).toBe('budget_optimization');
      expect(output.decision).toBe('budget_optimization_complete');
      expect(output.data).toHaveProperty('optimization');
      expect(output.data).toHaveProperty('channelROAS');
      expect(output.data).toHaveProperty('validatedPlan');
      expect(output.data).toHaveProperty('riskScore');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.reasoning.length).toBeGreaterThan(0);
      expect(output.timestamp).toBeDefined();
    });
  });

  // Test 7: calculateChannelROAS
  describe('calculateChannelROAS', () => {
    it('should return empty object for empty channel allocations', async () => {
      const result = await agent.calculateChannelROAS({});
      expect(result).toEqual({});
    });

    it('should compute ROAS with trend detection', async () => {
      // Current period
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '2000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '8000', total_campaign_spend: '2000' }],
      });
      // Previous period
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1800' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '5400', total_campaign_spend: '1800' }],
      });

      const result = await agent.calculateChannelROAS({ google: 5000 });

      expect(result).toHaveProperty('google');
      expect(result.google.channel).toBe('google');
      expect(result.google.spend).toBe(2000);
      expect(result.google.revenue).toBe(8000);
      expect(result.google.roas).toBe(4);
      // ROAS went from 3.0 to 4.0 -> up
      expect(result.google.trend).toBe('up');
    });

    it('should use cached ROAS data when available', async () => {
      const cachedROAS: Record<string, ROASMetric> = {
        google: { channel: 'google', spend: 1000, revenue: 4000, roas: 4.0, trend: 'up' },
      };
      mockCacheGet.mockResolvedValueOnce(cachedROAS);

      const result = await agent.calculateChannelROAS({ google: 5000 });

      expect(result).toEqual(cachedROAS);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // Test 8: identifyHighROASCampaigns
  describe('identifyHighROASCampaigns', () => {
    it('should query campaigns above the threshold', async () => {
      const campaigns = [
        { id: 'c1', name: 'Campaign A', metrics: { roas: 5.2 }, status: 'active' },
        { id: 'c2', name: 'Campaign B', metrics: { roas: 3.5 }, status: 'active' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: campaigns });

      const result = await agent.identifyHighROASCampaigns(3.0);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("(metrics->>'roas')::numeric >= $1"),
        [3.0],
      );
    });
  });

  // Test 9: identifyUnderperformers
  describe('identifyUnderperformers', () => {
    it('should query active campaigns with ROAS below the threshold', async () => {
      const campaigns = [
        { id: 'c3', name: 'Weak Campaign', metrics: { roas: 0.3 }, status: 'active', spent: 500 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: campaigns });

      const result = await agent.identifyUnderperformers(1.0);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("(metrics->>'roas')::numeric < $1"),
        [1.0],
      );
    });
  });

  // Test 10: scaleCampaign
  describe('scaleCampaign', () => {
    it('should scale campaign budget and return the result', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'camp-1', budget: '2000', status: 'active', metrics: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await agent.scaleCampaign('camp-1', 1.5);

      expect(result.campaignId).toBe('camp-1');
      expect(result.previousBudget).toBe(2000);
      expect(result.newBudget).toBe(3000);
      expect(result.scaleFactor).toBe(1.5);
      expect(result.riskAssessment).toBe('low');
    });

    it('should throw for invalid scale factor', async () => {
      await expect(agent.scaleCampaign('camp-1', 0)).rejects.toThrow(
        'Invalid scale factor 0: must be greater than 0',
      );
      await expect(agent.scaleCampaign('camp-1', -1)).rejects.toThrow(
        'must be greater than 0',
      );
    });

    it('should throw if campaign is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.scaleCampaign('nonexistent', 1.5)).rejects.toThrow(
        'Campaign nonexistent not found',
      );
    });

    it('should assess high risk for aggressive scaling', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'camp-1', budget: '1000', status: 'active', metrics: {} }],
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await agent.scaleCampaign('camp-1', 2.5);
      expect(result.riskAssessment).toBe('high');
    });
  });

  // Test 11: pauseUnderperformer
  describe('pauseUnderperformer', () => {
    it('should pause an active campaign and log the decision', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // UPDATE campaigns
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT audit log

      await expect(
        agent.pauseUnderperformer('camp-bad', 'ROAS below 0.5'),
      ).resolves.toBeUndefined();

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'paused'"),
        ['camp-bad'],
      );
    });

    it('should throw if campaign is not found or not active', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        agent.pauseUnderperformer('camp-inactive', 'Low ROAS'),
      ).rejects.toThrow('not found or not in active status');
    });
  });

  // Test 12: simulateAllocation
  describe('simulateAllocation', () => {
    it('should return simulation results with expected ROAS and risk level', async () => {
      // ROAS queries for 2 channels: 4 queries each
      // google
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '3000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '12000', total_campaign_spend: '3000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '2800' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '8400', total_campaign_spend: '2800' }],
      });
      // meta
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '2000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '6000', total_campaign_spend: '2000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1800' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '5400', total_campaign_spend: '1800' }],
      });

      const result = await agent.simulateAllocation({
        google: 6000,
        meta: 4000,
      });

      expect(result.proposedAllocation).toEqual({ google: 6000, meta: 4000 });
      expect(result.expectedROAS).toBeGreaterThan(0);
      expect(result.expectedRevenue).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  // Test 13: getSpendVelocity
  describe('getSpendVelocity', () => {
    it('should compute daily, weekly, and projected monthly spend', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2026-02-18', daily_spend: '100' },
          { date: '2026-02-19', daily_spend: '120' },
          { date: '2026-02-20', daily_spend: '110' },
          { date: '2026-02-21', daily_spend: '130' },
          { date: '2026-02-22', daily_spend: '115' },
          { date: '2026-02-23', daily_spend: '105' },
          { date: '2026-02-24', daily_spend: '125' },
        ],
      });

      // Allocation data for on-track check
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_budget: 10000,
            total_spent: 4000,
            period_start: new Date(Date.now() - 15 * 86400000).toISOString(),
            period_end: new Date(Date.now() + 15 * 86400000).toISOString(),
          },
        ],
      });

      const result = await agent.getSpendVelocity('alloc-001');

      // Average of [100, 120, 110, 130, 115, 105, 125] = 115
      expect(result.daily).toBeCloseTo(115, 0);
      expect(result.weekly).toBeCloseTo(805, 0);
      expect(result.projectedMonthly).toBeCloseTo(3450, 0);
      expect(typeof result.onTrack).toBe('boolean');
    });

    it('should use cached velocity when available', async () => {
      const cachedVelocity: SpendVelocity = {
        daily: 100,
        weekly: 700,
        projectedMonthly: 3000,
        onTrack: true,
      };
      mockCacheGet.mockResolvedValueOnce(cachedVelocity);

      const result = await agent.getSpendVelocity('alloc-cached');

      expect(result).toEqual(cachedVelocity);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // Test 14: detectSpendAnomalies
  describe('detectSpendAnomalies', () => {
    it('should detect anomalous spending days', async () => {
      // 10 days of normal spend around 100, then a spike at 500
      const rows = [];
      for (let i = 0; i < 10; i++) {
        rows.push({
          date: `2026-02-${String(i + 10).padStart(2, '0')}`,
          daily_spend: String(100 + (i % 3) * 5), // 100, 105, 110, 100, 105, ...
        });
      }
      // Spike day
      rows.push({ date: '2026-02-20', daily_spend: '500' });

      mockQuery.mockResolvedValueOnce({ rows });

      const anomalies = await agent.detectSpendAnomalies('alloc-001');

      // The 500 spend should be detected as an anomaly
      expect(anomalies.length).toBeGreaterThanOrEqual(1);

      const spike = anomalies.find((a) => a.actual === 500);
      expect(spike).toBeDefined();
      expect(spike!.deviation).toBeGreaterThan(2);
      expect(['medium', 'high', 'critical']).toContain(spike!.severity);
    });

    it('should return empty array with insufficient data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2026-02-24', daily_spend: '100' },
          { date: '2026-02-25', daily_spend: '110' },
        ],
      });

      const anomalies = await agent.detectSpendAnomalies('alloc-sparse');
      expect(anomalies).toEqual([]);
    });
  });

  // Test 15: suggestReallocation
  describe('suggestReallocation', () => {
    it('should suggest moving budget from low-ROAS to high-ROAS channels', async () => {
      const allocation = makeBudgetAllocation();

      // Set up ROAS queries: google = high ROAS (4.0), meta = medium (2.0), tiktok = low (0.8)
      // google
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '2000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '8000', total_campaign_spend: '2000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '2000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '8000', total_campaign_spend: '2000' }],
      });
      // meta
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1500' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '3000', total_campaign_spend: '1500' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1500' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '3000', total_campaign_spend: '1500' }],
      });
      // tiktok
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '800', total_campaign_spend: '1000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '1000' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ estimated_revenue: '800', total_campaign_spend: '1000' }],
      });

      const plan = await agent.suggestReallocation(allocation);

      // tiktok (ROAS 0.8) and meta (ROAS 2.0) are below average (~ 2.62),
      // google (ROAS 4.0) is above average -> should receive budget
      expect(plan.totalReallocated).toBeGreaterThan(0);
      expect(Object.keys(plan.fromChannels).length).toBeGreaterThan(0);
      expect(Object.keys(plan.toChannels).length).toBeGreaterThan(0);
      expect(plan.toChannels).toHaveProperty('google');
      expect(plan.expectedImpact).toContain('Shifting');
    });

    it('should return zero reallocation when no ROAS data exists', async () => {
      const allocation = makeBudgetAllocation({
        channel_allocations: {},
      });

      const plan = await agent.suggestReallocation(allocation);

      expect(plan.totalReallocated).toBe(0);
      expect(plan.expectedImpact).toContain('No channels');
    });
  });
});

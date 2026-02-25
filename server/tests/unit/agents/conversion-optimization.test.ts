/**
 * Unit tests for ConversionOptimizationAgent (Agent 10).
 *
 * All external dependencies (database, Redis, AI client, logger) are mocked
 * so that we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports so Jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PASSWORD: '',
    REDIS_DB: 0,
    DB_POOL_MIN: 1,
    DB_POOL_MAX: 5,
    DB_SSL: false,
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ConversionOptimizationAgent,
  FunnelAnalysis,
  Bottleneck,
  UXRecommendation,
  UserSegment,
} from '../../../src/agents/modules/ConversionOptimizationAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

// Typed mocks
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createAgent(): ConversionOptimizationAgent {
  return new ConversionOptimizationAgent();
}

function makeFunnelRows(stages: Array<{ stage: string; visitors: number; exits: number; avg_time: number }>) {
  return { rows: stages };
}

function makeBottleneck(overrides: Partial<Bottleneck> = {}): Bottleneck {
  return {
    stage: 'consideration',
    dropOffRate: 0.4,
    severity: 'high',
    possibleCauses: ['Pricing unclear'],
    estimatedImpact: 0.15,
    ...overrides,
  };
}

function makeRecommendation(overrides: Partial<UXRecommendation> = {}): UXRecommendation {
  return {
    id: 'rec-1',
    area: 'checkout',
    issue: 'Too many steps',
    recommendation: 'Reduce steps to 3',
    expectedLift: 0.05,
    effort: 'medium',
    priority: 8,
    evidence: 'Industry benchmarks show 3-step checkouts convert higher',
    ...overrides,
  };
}

function makeSegment(overrides: Partial<UserSegment> = {}): UserSegment {
  return {
    id: 'seg-1',
    name: 'High Intent Shoppers',
    size: 5000,
    conversionRate: 0.08,
    avgOrderValue: 150,
    characteristics: { source: 'organic', device: 'mobile' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversionOptimizationAgent', () => {
  let agent: ConversionOptimizationAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = createAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('initializes with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('conversion_optimization');
      expect(agent.getConfig().model).toBe('opus');
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['ab_testing', 'performance_analytics', 'shopify_integration']);
    });

    it('produces a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('conversion');
    });
  });

  // -----------------------------------------------------------------------
  // analyzeFunnel
  // -----------------------------------------------------------------------

  describe('analyzeFunnel', () => {
    it('returns funnel analysis from database when cache is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // funnel_analytics query
      mockQuery.mockResolvedValueOnce(
        makeFunnelRows([
          { stage: 'awareness', visitors: 10000, exits: 3000, avg_time: 30 },
          { stage: 'interest', visitors: 7000, exits: 2000, avg_time: 45 },
          { stage: 'consideration', visitors: 5000, exits: 2500, avg_time: 60 },
          { stage: 'intent', visitors: 2500, exits: 800, avg_time: 90 },
          { stage: 'purchase', visitors: 1700, exits: 500, avg_time: 120 },
        ]),
      );

      // orders query for revenue estimation
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_order_value: 75 }] });

      const result = await agent.analyzeFunnel();

      expect(result.stages).toHaveLength(5);
      expect(result.stages[0].stage).toBe('awareness');
      expect(result.stages[0].visitors).toBe(10000);
      expect(result.stages[0].exits).toBe(3000);
      expect(result.stages[0].conversionRate).toBe(0.7);
      expect(result.overallRate).toBeGreaterThan(0);
      expect(result.overallRate).toBeLessThanOrEqual(1);
      expect(typeof result.estimatedRevenueLoss).toBe('number');
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('returns cached result when available', async () => {
      const cachedAnalysis: FunnelAnalysis = {
        stages: [{ stage: 'awareness', visitors: 1000, exits: 200, conversionRate: 0.8, avgTime: 20 }],
        overallRate: 0.4,
        bottlenecks: [],
        estimatedRevenueLoss: 500,
      };

      mockCacheGet.mockResolvedValueOnce(cachedAnalysis);

      const result = await agent.analyzeFunnel();

      expect(result).toEqual(cachedAnalysis);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('filters by countryId when provided', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce(makeFunnelRows([]));
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_order_value: 0 }] });

      await agent.analyzeFunnel('country-123');

      expect(mockQuery.mock.calls[0][1]).toEqual(['country-123']);
    });

    it('handles empty funnel data gracefully', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce(makeFunnelRows([]));
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_order_value: 0 }] });

      const result = await agent.analyzeFunnel();

      expect(result.stages).toHaveLength(0);
      expect(result.overallRate).toBe(0);
      expect(result.bottlenecks).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // identifyBottlenecks
  // -----------------------------------------------------------------------

  describe('identifyBottlenecks', () => {
    it('identifies bottlenecks from funnel stages with high drop-off', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'awareness', visitors: 10000, exits: 2000, conversionRate: 0.8, avgTime: 25 },
          { stage: 'consideration', visitors: 8000, exits: 5000, conversionRate: 0.375, avgTime: 60 },
          { stage: 'purchase', visitors: 3000, exits: 1800, conversionRate: 0.4, avgTime: 150 },
        ],
        overallRate: 0.12,
        bottlenecks: [],
        estimatedRevenueLoss: 0,
      };

      const bottlenecks = agent.identifyBottlenecks(funnel);

      // consideration has 5000/8000 = 62.5% drop off (critical)
      // purchase has 1800/3000 = 60% drop off (critical)
      // awareness has 2000/10000 = 20% drop off (medium)
      expect(bottlenecks.length).toBeGreaterThanOrEqual(2);

      const criticalBottlenecks = bottlenecks.filter((b) => b.severity === 'critical');
      expect(criticalBottlenecks.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when all stages have zero drop-off', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'awareness', visitors: 1000, exits: 0, conversionRate: 1, avgTime: 20 },
          { stage: 'purchase', visitors: 1000, exits: 0, conversionRate: 1, avgTime: 30 },
        ],
        overallRate: 1,
        bottlenecks: [],
        estimatedRevenueLoss: 0,
      };

      const bottlenecks = agent.identifyBottlenecks(funnel);
      expect(bottlenecks).toHaveLength(0);
    });

    it('sorts bottlenecks by severity (critical first) then by drop-off rate', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'awareness', visitors: 1000, exits: 250, conversionRate: 0.75, avgTime: 20 },
          { stage: 'intent', visitors: 750, exits: 400, conversionRate: 0.47, avgTime: 50 },
          { stage: 'purchase', visitors: 350, exits: 200, conversionRate: 0.43, avgTime: 180 },
        ],
        overallRate: 0.15,
        bottlenecks: [],
        estimatedRevenueLoss: 0,
      };

      const bottlenecks = agent.identifyBottlenecks(funnel);
      expect(bottlenecks.length).toBeGreaterThan(0);

      // Verify sorting: severity descending (critical < high < medium < low), then dropOff descending
      for (let i = 1; i < bottlenecks.length; i++) {
        const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const prevSev = severityOrder[bottlenecks[i - 1].severity];
        const curSev = severityOrder[bottlenecks[i].severity];
        if (prevSev === curSev) {
          expect(bottlenecks[i - 1].dropOffRate).toBeGreaterThanOrEqual(bottlenecks[i].dropOffRate);
        } else {
          expect(prevSev).toBeLessThanOrEqual(curSev);
        }
      }
    });

    it('includes possibleCauses for each bottleneck', () => {
      const funnel: FunnelAnalysis = {
        stages: [
          { stage: 'purchase', visitors: 500, exits: 300, conversionRate: 0.4, avgTime: 200 },
        ],
        overallRate: 0.4,
        bottlenecks: [],
        estimatedRevenueLoss: 0,
      };

      const bottlenecks = agent.identifyBottlenecks(funnel);
      expect(bottlenecks.length).toBe(1);
      expect(bottlenecks[0].possibleCauses.length).toBeGreaterThan(0);
      // Purchase stage should mention checkout/payment related causes
      const allCauses = bottlenecks[0].possibleCauses.join(' ').toLowerCase();
      expect(allCauses).toMatch(/checkout|payment|friction/);
    });
  });

  // -----------------------------------------------------------------------
  // generateUXRecommendations
  // -----------------------------------------------------------------------

  describe('generateUXRecommendations', () => {
    it('returns empty array when no bottlenecks provided', async () => {
      const result = await agent.generateUXRecommendations([]);
      expect(result).toEqual([]);
    });

    it('calls AI with bottleneck data and parses response', async () => {
      // Mock callAI via prototype
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockResolvedValueOnce(
        JSON.stringify([
          {
            area: 'checkout',
            issue: 'Too many form fields',
            recommendation: 'Reduce to essential fields only',
            expectedLift: 0.04,
            effort: 'low',
            priority: 9,
            evidence: 'Studies show each removed field increases conversion by 1-2%',
          },
          {
            area: 'product_page',
            issue: 'Missing trust signals',
            recommendation: 'Add security badges and reviews section',
            expectedLift: 0.03,
            effort: 'low',
            priority: 7,
            evidence: 'Trust signals improve conversion by 2-5% in e-commerce',
          },
        ]),
      );

      const bottlenecks = [makeBottleneck()];
      const result = await agent.generateUXRecommendations(bottlenecks);

      expect(mockCallAI).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Bottlenecks'),
        'opus',
      );
      expect(result).toHaveLength(2);
      expect(result[0].area).toBe('checkout');
      expect(result[0].expectedLift).toBe(0.04);
      expect(result[0].effort).toBe('low');
      expect(result[1].area).toBe('product_page');

      mockCallAI.mockRestore();
    });

    it('handles malformed AI response gracefully', async () => {
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockResolvedValueOnce(
        'This is not valid JSON at all',
      );

      const bottlenecks = [makeBottleneck()];
      const result = await agent.generateUXRecommendations(bottlenecks);

      expect(result).toEqual([]);
      mockCallAI.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // optimizeCheckout
  // -----------------------------------------------------------------------

  describe('optimizeCheckout', () => {
    it('returns empty optimization when no checkout data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.optimizeCheckout('country-1');

      expect(result.currentSteps).toBe(0);
      expect(result.suggestions).toHaveLength(0);
      expect(result.expectedConversionLift).toBe(0);
    });

    it('falls back to rule-based suggestions when AI is unavailable', async () => {
      // checkout_analytics query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          step_count: 5,
          checkout_starts: 1000,
          checkout_completions: 200,
          steps_data: [],
        }],
      });

      // countries query
      mockQuery.mockResolvedValueOnce({
        rows: [{ name: 'Germany', currency: 'EUR', language: 'de', cultural_behavior: {} }],
      });

      // Mock AI failure
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockRejectedValueOnce(
        new Error('AI unavailable'),
      );

      const result = await agent.optimizeCheckout('country-de');

      expect(result.currentSteps).toBe(5);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.expectedConversionLift).toBeGreaterThan(0);
      expect(result.recommendedSteps).toBeLessThanOrEqual(result.currentSteps);

      mockCallAI.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // analyzePagePerformance
  // -----------------------------------------------------------------------

  describe('analyzePagePerformance', () => {
    it('identifies slow load time as an issue', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          load_time: 4500,
          bounce_rate: 0.45,
          exit_rate: 0.3,
          scroll_depth: 0.6,
          sample_count: 500,
        }],
      });

      const result = await agent.analyzePagePerformance('https://example.com/product');

      expect(result.url).toBe('https://example.com/product');
      expect(result.loadTime).toBe(4500);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('load time'))).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('identifies high bounce rate as an issue', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          load_time: 1200,
          bounce_rate: 0.75,
          exit_rate: 0.3,
          scroll_depth: 0.5,
          sample_count: 1000,
        }],
      });

      const result = await agent.analyzePagePerformance('https://example.com/landing');

      expect(result.bounceRate).toBe(0.75);
      expect(result.issues.some((i) => i.toLowerCase().includes('bounce rate'))).toBe(true);
    });

    it('flags low sample size as a data quality concern', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          load_time: 1500,
          bounce_rate: 0.3,
          exit_rate: 0.2,
          scroll_depth: 0.7,
          sample_count: 25,
        }],
      });

      const result = await agent.analyzePagePerformance('https://example.com/new-page');

      expect(result.issues.some((i) => i.toLowerCase().includes('sample size'))).toBe(true);
    });

    it('returns cached page analysis when available', async () => {
      const cached = {
        url: 'https://example.com/cached',
        loadTime: 1000,
        bounceRate: 0.2,
        exitRate: 0.1,
        scrollDepth: 0.8,
        issues: [],
        recommendations: [],
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await agent.analyzePagePerformance('https://example.com/cached');

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // calculateConversionRate
  // -----------------------------------------------------------------------

  describe('calculateConversionRate', () => {
    it('calculates conversion rate from database metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_conversions: 350, total_visitors: 10000 }],
      });

      const rate = await agent.calculateConversionRate();

      expect(rate).toBe(0.035);
    });

    it('returns 0 when no visitor data exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_conversions: 0, total_visitors: 0 }],
      });

      const rate = await agent.calculateConversionRate();
      expect(rate).toBe(0);
    });

    it('applies segment and date range filters', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_conversions: 50, total_visitors: 500 }],
      });

      const rate = await agent.calculateConversionRate('mobile_users', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(rate).toBe(0.1);
      // Verify query was called with params for segment and date range
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('mobile_users');
      expect(params).toContain('2026-01-01');
      expect(params).toContain('2026-01-31');
    });
  });

  // -----------------------------------------------------------------------
  // identifyHighValueSegments
  // -----------------------------------------------------------------------

  describe('identifyHighValueSegments', () => {
    it('returns segments ordered by value from database', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [
          { segment_id: 's1', segment_name: 'VIP', user_count: 500, conversion_rate: 0.12, avg_order_value: 200, characteristics: { tier: 'gold' } },
          { segment_id: 's2', segment_name: 'Regular', user_count: 5000, conversion_rate: 0.03, avg_order_value: 50, characteristics: { tier: 'standard' } },
        ],
      });

      const segments = await agent.identifyHighValueSegments();

      expect(segments).toHaveLength(2);
      expect(segments[0].id).toBe('s1');
      expect(segments[0].name).toBe('VIP');
      expect(segments[0].conversionRate).toBe(0.12);
      expect(segments[0].avgOrderValue).toBe(200);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('returns cached segments when available', async () => {
      const cached = [makeSegment()];
      mockCacheGet.mockResolvedValueOnce(cached);

      const segments = await agent.identifyHighValueSegments();

      expect(segments).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // suggestPersonalization
  // -----------------------------------------------------------------------

  describe('suggestPersonalization', () => {
    it('falls back to rule-based suggestions when AI fails', async () => {
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockRejectedValueOnce(
        new Error('AI unavailable'),
      );

      const segment = makeSegment({ conversionRate: 0.08, avgOrderValue: 150 });
      const result = await agent.suggestPersonalization(segment);

      expect(result.segment).toBe(segment.name);
      expect(result.contentChanges.length).toBeGreaterThan(0);
      expect(result.layoutChanges.length).toBeGreaterThan(0);
      expect(result.offerChanges.length).toBeGreaterThan(0);
      expect(result.expectedLift).toBeGreaterThan(0);

      mockCallAI.mockRestore();
    });

    it('returns AI-generated personalization when available', async () => {
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockResolvedValueOnce(
        JSON.stringify({
          contentChanges: ['Add testimonials from similar users'],
          layoutChanges: ['Move CTA above the fold'],
          offerChanges: ['Offer 10% loyalty discount'],
          expectedLift: 0.06,
        }),
      );

      const segment = makeSegment();
      const result = await agent.suggestPersonalization(segment);

      expect(result.contentChanges).toEqual(['Add testimonials from similar users']);
      expect(result.layoutChanges).toEqual(['Move CTA above the fold']);
      expect(result.offerChanges).toEqual(['Offer 10% loyalty discount']);
      expect(result.expectedLift).toBe(0.06);

      mockCallAI.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // estimateRevenueLift
  // -----------------------------------------------------------------------

  describe('estimateRevenueLift', () => {
    it('estimates revenue lift based on current revenue and recommendations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ monthly_revenue: 100000 }],
      });

      const recommendations = [
        makeRecommendation({ id: 'r1', expectedLift: 0.05 }),
        makeRecommendation({ id: 'r2', expectedLift: 0.03 }),
      ];

      const result = await agent.estimateRevenueLift(recommendations);

      expect(result.totalEstimatedLift).toBeGreaterThan(0);
      expect(result.byRecommendation['r1']).toBeGreaterThan(0);
      expect(result.byRecommendation['r2']).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(result.timeframe).toBe('30 days');
    });

    it('returns zero lift when no revenue data exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ monthly_revenue: 0 }],
      });

      const result = await agent.estimateRevenueLift([makeRecommendation()]);

      expect(result.totalEstimatedLift).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // process (full pipeline)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('runs complete analysis pipeline and returns structured output', async () => {
      // analyzeFunnel: funnel_analytics query
      mockQuery.mockResolvedValueOnce(
        makeFunnelRows([
          { stage: 'awareness', visitors: 5000, exits: 1000, avg_time: 20 },
          { stage: 'interest', visitors: 4000, exits: 1500, avg_time: 35 },
          { stage: 'purchase', visitors: 2500, exits: 800, avg_time: 90 },
        ]),
      );
      // analyzeFunnel: revenue estimation
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_order_value: 50 }] });

      // calculateConversionRate
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_conversions: 100, total_visitors: 5000 }],
      });

      // identifyHighValueSegments
      mockQuery.mockResolvedValueOnce({
        rows: [
          { segment_id: 's1', segment_name: 'Premium', user_count: 200, conversion_rate: 0.1, avg_order_value: 100, characteristics: {} },
        ],
      });

      // persistState and logDecision queries
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      // Mock AI to throw (simulating unavailability) so pipeline still completes
      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockRejectedValue(
        new Error('AI module not available'),
      );

      const output = await agent.process({
        context: {},
        parameters: {},
        requestId: 'req-001',
      });

      expect(output.agentType).toBe('conversion_optimization');
      expect(output.decision).toContain('Conversion funnel analysis complete');
      expect(output.data).toHaveProperty('funnelAnalysis');
      expect(output.data).toHaveProperty('bottlenecks');
      expect(output.data).toHaveProperty('conversionRate');
      expect(output.data).toHaveProperty('segments');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeDefined();
      expect(output.timestamp).toBeDefined();
      // Should have uncertainties because AI was unavailable
      expect(output.uncertainties.length).toBeGreaterThan(0);

      mockCallAI.mockRestore();
    });

    it('includes confidence factors in the output', async () => {
      // Minimal responses for the pipeline
      mockQuery.mockResolvedValueOnce(makeFunnelRows([])); // funnel
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_order_value: 0 }] }); // revenue
      mockQuery.mockResolvedValueOnce({ rows: [{ total_conversions: 0, total_visitors: 0 }] }); // conv rate
      mockQuery.mockResolvedValueOnce({ rows: [] }); // segments
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // persist

      const mockCallAI = jest.spyOn(agent as any, 'callAI').mockRejectedValue(new Error('unavailable'));

      const output = await agent.process({
        context: {},
        parameters: {},
        requestId: 'req-002',
      });

      expect(output.confidence.factors).toBeDefined();
      expect(typeof output.confidence.factors.data_completeness).toBe('number');
      expect(typeof output.confidence.factors.bottleneck_detection).toBe('number');
      expect(typeof output.confidence.factors.recommendation_quality).toBe('number');

      mockCallAI.mockRestore();
    });
  });
});

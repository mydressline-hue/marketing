// ============================================================
// AI International Growth Engine - Competitive Intelligence Agent Tests
// Unit tests for Agent 14 (CompetitiveIntelAgent)
// ============================================================

import { CompetitiveIntelAgent } from '../../../src/agents/modules/CompetitiveIntelAgent';
import type { AgentInput } from '../../../src/agents/base/types';
import type { Competitor, GapAnalysis, TrendSignal } from '../../../src/types';

// ---- Mocks ----

// Mock the database pool
const mockQuery = jest.fn();
jest.mock('../../../src/config/database', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Mock Redis cache
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('../../../src/config/redis', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
}));

// Mock logger (suppress output during tests)
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

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

// ---- Test Fixtures ----

function buildCompetitorRow(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp-001',
    name: 'Acme Corp',
    website: 'https://acme.example.com',
    platforms: {
      google: { estimated_spend: 15000 },
      meta: { estimated_spend: 10000, creatives: [{ content: 'Buy now at Acme', type: 'ad_copy' }] },
    },
    metrics: {
      estimated_spend: 25000,
      market_share: 12,
      ad_frequency: 4,
      top_keywords: ['growth', 'saas', 'automation'],
      creative_count: 35,
    },
    last_analyzed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildAgentInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    context: {},
    parameters: { action: 'full_report' },
    requestId: 'req-test-001',
    ...overrides,
  };
}

// ---- Test Suite ----

describe('CompetitiveIntelAgent', () => {
  let agent: CompetitiveIntelAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new CompetitiveIntelAgent();
  });

  // ------------------------------------------------------------------
  // 1. Construction and configuration
  // ------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('should initialise with correct agent type and model', () => {
      expect(agent.getAgentType()).toBe('competitive_intelligence');
      expect(agent.getConfig().model).toBe('opus');
    });

    it('should accept custom configuration overrides', () => {
      const custom = new CompetitiveIntelAgent({
        model: 'sonnet',
        maxRetries: 5,
        confidenceThreshold: 80,
      });
      const config = custom.getConfig();
      expect(config.model).toBe('sonnet');
      expect(config.maxRetries).toBe(5);
      expect(config.confidenceThreshold).toBe(80);
    });

    it('should return correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toEqual(['market_intelligence', 'country_strategy', 'paid_ads']);
    });

    it('should return a non-empty system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Competitive Intelligence');
    });
  });

  // ------------------------------------------------------------------
  // 2. analyzeCompetitor
  // ------------------------------------------------------------------

  describe('analyzeCompetitor', () => {
    it('should return a structured CompetitorAnalysis from database data', async () => {
      const competitor = buildCompetitorRow();

      // fetchCompetitor query
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });

      const analysis = await agent.analyzeCompetitor('comp-001');

      expect(analysis.competitorId).toBe('comp-001');
      expect(analysis.name).toBe('Acme Corp');
      expect(analysis.estimatedSpend).toBe(25000);
      expect(analysis.marketShare).toBe(12);
      expect(['low', 'medium', 'high']).toContain(analysis.threatLevel);
      expect(Array.isArray(analysis.strengths)).toBe(true);
      expect(Array.isArray(analysis.weaknesses)).toBe(true);
      expect(Array.isArray(analysis.topChannels)).toBe(true);
      expect(Array.isArray(analysis.recentChanges)).toBe(true);
    });

    it('should return cached data when cache is available', async () => {
      const cachedAnalysis = {
        competitorId: 'comp-001',
        name: 'Cached Corp',
        strengths: ['cached'],
        weaknesses: [],
        estimatedSpend: 999,
        marketShare: 5,
        topChannels: ['google'],
        recentChanges: [],
        threatLevel: 'low' as const,
      };
      mockCacheGet.mockResolvedValueOnce(cachedAnalysis);

      const analysis = await agent.analyzeCompetitor('comp-001');

      expect(analysis.name).toBe('Cached Corp');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError for nonexistent competitor', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(agent.analyzeCompetitor('nonexistent')).rejects.toThrow(
        'Competitor not found',
      );
    });
  });

  // ------------------------------------------------------------------
  // 3. monitorCompetitors
  // ------------------------------------------------------------------

  describe('monitorCompetitors', () => {
    it('should produce a MonitoringReport with competitor analyses', async () => {
      const comp1 = buildCompetitorRow({ id: 'comp-001', name: 'Alpha' });
      const comp2 = buildCompetitorRow({
        id: 'comp-002',
        name: 'Beta',
        metrics: { estimated_spend: 8000, market_share: 5, creative_count: 10 },
      });

      // fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: [comp1, comp2] });
      // loadState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // analyzeCompetitor for comp-001 (fetchCompetitor)
      mockQuery.mockResolvedValueOnce({ rows: [comp1] });
      // analyzeCompetitor for comp-002 (fetchCompetitor)
      mockQuery.mockResolvedValueOnce({ rows: [comp2] });
      // resolveCompetitorNames (newEntrants - empty)
      // persistState (INSERT)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const report = await agent.monitorCompetitors();

      expect(report.competitors.length).toBe(2);
      expect(report.timestamp).toBeDefined();
      expect(Array.isArray(report.newEntrants)).toBe(true);
      expect(Array.isArray(report.exitedCompetitors)).toBe(true);
      expect(Array.isArray(report.significantChanges)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 4. detectTrends
  // ------------------------------------------------------------------

  describe('detectTrends', () => {
    it('should return trends from the database', async () => {
      const trendRows: TrendSignal[] = [
        {
          id: 'trend-1',
          source: 'market_data',
          signal_type: 'spend_increase',
          description: 'Overall market ad spend increasing',
          confidence: 0.85,
          detected_at: new Date().toISOString(),
        },
      ];

      // trend_signals query
      mockQuery.mockResolvedValueOnce({ rows: trendRows });
      // fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const trends = await agent.detectTrends('30d');

      expect(trends.length).toBe(1);
      expect(trends[0].signal_type).toBe('spend_increase');
      expect(trends[0].confidence).toBe(0.85);
    });

    it('should parse different time window formats correctly', async () => {
      // trend_signals query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const trends = await agent.detectTrends('2w');
      expect(trends).toEqual([]);

      // Verify the query was called (which means parsing happened)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ------------------------------------------------------------------
  // 5. performGapAnalysis
  // ------------------------------------------------------------------

  describe('performGapAnalysis', () => {
    it('should identify gaps based on competitor metrics', async () => {
      const competitor = buildCompetitorRow();

      // fetchCompetitor
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });
      // fetchOurMetrics - campaigns spend
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '15000' }] });
      // fetchOurMetrics - creatives count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '20' }] });

      const result = await agent.performGapAnalysis('comp-001');

      expect(result.competitor_id).toBe('comp-001');
      expect(result.generated_at).toBeDefined();
      expect(result.gaps.length).toBeGreaterThan(0);

      // Verify gap structure
      for (const gap of result.gaps) {
        expect(gap).toHaveProperty('area');
        expect(gap).toHaveProperty('our_score');
        expect(gap).toHaveProperty('their_score');
        expect(gap).toHaveProperty('opportunity');
        expect(typeof gap.our_score).toBe('number');
        expect(typeof gap.their_score).toBe('number');
      }
    });
  });

  // ------------------------------------------------------------------
  // 6. identifyOpportunities
  // ------------------------------------------------------------------

  describe('identifyOpportunities', () => {
    it('should convert gap analysis into prioritised opportunities', () => {
      const gapAnalysis: GapAnalysis = {
        competitor_id: 'comp-001',
        gaps: [
          { area: 'advertising_spend', our_score: 30, their_score: 80, opportunity: 'Increase budget' },
          { area: 'creative_volume', our_score: 60, their_score: 90, opportunity: 'Produce more creatives' },
          { area: 'market_share', our_score: 48, their_score: 50, opportunity: 'Close margin' },
        ],
        generated_at: new Date().toISOString(),
      };

      const opportunities = agent.identifyOpportunities(gapAnalysis);

      // The 2pp market_share gap (< 5) should be filtered out
      expect(opportunities.length).toBe(2);

      // Should be sorted by priority descending
      for (let i = 0; i < opportunities.length - 1; i++) {
        expect(opportunities[i].priority).toBeGreaterThanOrEqual(
          opportunities[i + 1].priority,
        );
      }

      // Verify structure
      for (const opp of opportunities) {
        expect(opp).toHaveProperty('area');
        expect(opp).toHaveProperty('description');
        expect(opp).toHaveProperty('potentialImpact');
        expect(opp).toHaveProperty('effort');
        expect(opp).toHaveProperty('priority');
        expect(typeof opp.potentialImpact).toBe('number');
        expect(['low', 'medium', 'high']).toContain(opp.effort);
      }
    });

    it('should return empty array when gaps are too small', () => {
      const gapAnalysis: GapAnalysis = {
        competitor_id: 'comp-001',
        gaps: [
          { area: 'spend', our_score: 50, their_score: 52, opportunity: 'minor' },
        ],
        generated_at: new Date().toISOString(),
      };

      const opportunities = agent.identifyOpportunities(gapAnalysis);
      expect(opportunities.length).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // 7. estimateCompetitorSpend
  // ------------------------------------------------------------------

  describe('estimateCompetitorSpend', () => {
    it('should return spend estimate from direct competitor data', async () => {
      const competitor = buildCompetitorRow();
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });

      const estimate = await agent.estimateCompetitorSpend('comp-001');

      expect(estimate.competitorId).toBe('comp-001');
      expect(estimate.estimatedMonthlySpend).toBe(25000);
      expect(estimate.confidence).toBeGreaterThan(0);
      expect(estimate.methodology).toBeDefined();
      expect(typeof estimate.methodology).toBe('string');
    });

    it('should produce low confidence when data is sparse', async () => {
      const competitor = buildCompetitorRow({
        metrics: {},
        platforms: {},
      });
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });

      const estimate = await agent.estimateCompetitorSpend('comp-001');

      expect(estimate.estimatedMonthlySpend).toBe(0);
      expect(estimate.confidence).toBeLessThanOrEqual(15); // low data points
      expect(estimate.methodology).toContain('Insufficient data');
    });
  });

  // ------------------------------------------------------------------
  // 8. benchmarkPerformance
  // ------------------------------------------------------------------

  describe('benchmarkPerformance', () => {
    it('should compute percentile rankings against competitors', async () => {
      const competitors = [
        buildCompetitorRow({
          id: 'c1',
          metrics: { estimated_spend: 20000, market_share: 8 },
        }),
        buildCompetitorRow({
          id: 'c2',
          metrics: { estimated_spend: 40000, market_share: 18 },
        }),
      ];

      // fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: competitors });

      const result = await agent.benchmarkPerformance({
        estimated_spend: 30000,
        market_share: 15,
      });

      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.metrics.estimated_spend).toBeDefined();
      expect(result.metrics.estimated_spend.ours).toBe(30000);
      expect(result.metrics.estimated_spend.percentile).toBeGreaterThan(0);
      expect(result.metrics.estimated_spend.percentile).toBeLessThanOrEqual(100);
      expect(result.metrics.market_share.industryAvg).toBeGreaterThan(0);
    });

    it('should use default percentile when no competitor data is available', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await agent.benchmarkPerformance({ custom_metric: 42 });

      expect(result.metrics.custom_metric.percentile).toBe(50);
      expect(result.metrics.custom_metric.ours).toBe(42);
    });
  });

  // ------------------------------------------------------------------
  // 9. process (main entry point)
  // ------------------------------------------------------------------

  describe('process', () => {
    it('should handle analyze_competitor action', async () => {
      const competitor = buildCompetitorRow();

      // fetchCompetitor for analyzeCompetitor
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });
      // getTrackedCompetitorCount
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // assessDataRecency
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_hours: 12 }] });
      // logDecision (INSERT)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input = buildAgentInput({
        parameters: { action: 'analyze_competitor', competitorId: 'comp-001' },
      });

      const output = await agent.process(input);

      expect(output.agentType).toBe('competitive_intelligence');
      expect(output.decision).toContain('Competitor analysis complete');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.data.competitorAnalysis).toBeDefined();
      expect(output.timestamp).toBeDefined();
    });

    it('should return failure output with uncertainty when processing errors occur', async () => {
      // Make the first query fail to trigger error path
      mockQuery.mockRejectedValueOnce(new Error('Database connection lost'));

      const input = buildAgentInput({
        parameters: { action: 'analyze_competitor', competitorId: 'comp-fail' },
      });

      const output = await agent.process(input);

      expect(output.decision).toBe('analysis_failed');
      expect(output.confidence.score).toBe(0);
      expect(output.confidence.level).toBe('low');
      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('should require competitorId for analyze_competitor action', async () => {
      const input = buildAgentInput({
        parameters: { action: 'analyze_competitor' },
      });

      const output = await agent.process(input);

      expect(output.decision).toBe('analysis_failed');
      expect(output.data.error).toContain('competitorId parameter is required');
    });

    it('should flag uncertainty when competitor count is zero', async () => {
      // fetchAllCompetitors for full_report
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectTrends - trend_signals
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectTrends - fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getTrackedCompetitorCount
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // assessDataRecency
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_hours: null }] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input = buildAgentInput({ parameters: { action: 'full_report' } });
      const output = await agent.process(input);

      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.uncertainties.some((u) => u.includes('competitor_data'))).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 10. analyzeMessagingGaps
  // ------------------------------------------------------------------

  describe('analyzeMessagingGaps', () => {
    it('should return structural comparison when AI is unavailable', async () => {
      const competitor = buildCompetitorRow();

      // fetchCompetitor
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });
      // fetchOurCreatives
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // fetchCompetitorCreatives (table not found, triggers fallback)
      mockQuery.mockRejectedValueOnce(new Error('relation "competitor_creatives" does not exist'));
      // fetchCompetitor (fallback in fetchCompetitorCreatives)
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });

      const result = await agent.analyzeMessagingGaps('comp-001');

      expect(result.competitorId).toBe('comp-001');
      expect(Array.isArray(result.theirMessaging)).toBe(true);
      expect(Array.isArray(result.ourMessaging)).toBe(true);
      expect(Array.isArray(result.gaps)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 11. trackCompetitorCreatives
  // ------------------------------------------------------------------

  describe('trackCompetitorCreatives', () => {
    it('should extract creative intelligence from competitor data', async () => {
      const competitor = buildCompetitorRow();

      // fetchCompetitor
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });
      // fetchCompetitorCreatives (table query fails)
      mockQuery.mockRejectedValueOnce(new Error('table not found'));
      // fetchCompetitor fallback
      mockQuery.mockResolvedValueOnce({ rows: [competitor] });

      const result = await agent.trackCompetitorCreatives('comp-001');

      expect(result.competitorId).toBe('comp-001');
      expect(typeof result.adCount).toBe('number');
      expect(Array.isArray(result.topFormats)).toBe(true);
      expect(Array.isArray(result.messagingThemes)).toBe(true);
      expect(Array.isArray(result.callToActions)).toBe(true);
      expect(typeof result.frequency).toBe('number');
      expect(result.frequency).toBe(4); // from competitor metrics
    });
  });

  // ------------------------------------------------------------------
  // 12. Confidence scoring integration
  // ------------------------------------------------------------------

  describe('confidence scoring', () => {
    it('should produce low confidence when data is unavailable', async () => {
      // fetchAllCompetitors - empty
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectTrends - trend_signals
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectTrends - fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getTrackedCompetitorCount
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // assessDataRecency
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_hours: null }] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input = buildAgentInput({ parameters: { action: 'full_report' } });
      const output = await agent.process(input);

      expect(output.confidence.level).toBe('low');
      expect(output.confidence.score).toBeLessThan(40);
      expect(output.confidence.factors).toHaveProperty('data_availability');
      expect(output.confidence.factors).toHaveProperty('data_recency');
    });

    it('should produce higher confidence with sufficient data', async () => {
      const competitors = [
        buildCompetitorRow({ id: 'c1' }),
        buildCompetitorRow({ id: 'c2' }),
        buildCompetitorRow({ id: 'c3' }),
        buildCompetitorRow({ id: 'c4' }),
        buildCompetitorRow({ id: 'c5' }),
      ];

      // fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: competitors });
      // analyzeCompetitor x5 (each with fetchCompetitor)
      for (const comp of competitors) {
        mockQuery.mockResolvedValueOnce({ rows: [comp] });
      }
      // performGapAnalysis x5 (fetchCompetitor + fetchOurMetrics each)
      for (const comp of competitors) {
        mockQuery.mockResolvedValueOnce({ rows: [comp] });
        mockQuery.mockResolvedValueOnce({ rows: [{ total: '20000' }] });
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '30' }] });
      }
      // detectTrends - trend_signals
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectTrends - fetchAllCompetitors
      mockQuery.mockResolvedValueOnce({ rows: competitors });
      // getTrackedCompetitorCount
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // assessDataRecency (very fresh data)
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_hours: 2 }] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const input = buildAgentInput({ parameters: { action: 'full_report' } });
      const output = await agent.process(input);

      expect(output.confidence.score).toBeGreaterThanOrEqual(60);
      expect(output.confidence.factors.data_availability).toBeGreaterThanOrEqual(80);
      expect(output.confidence.factors.data_recency).toBeGreaterThan(90);
    });
  });
});

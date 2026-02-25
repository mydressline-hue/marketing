/**
 * Unit tests for MarketIntelligenceAgent.
 *
 * All external dependencies (database, Redis cache, AI client, logger)
 * are fully mocked so tests exercise only the agent's scoring logic,
 * ranking algorithms, and decision-building pipeline.
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
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
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    LOG_LEVEL: 'silent',
  },
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

jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn((score: number) => {
    if (score >= 80) return 'very_high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// Mock the AnthropicClient with sendMessage (used by BaseAgent.callAI via dynamic import)
jest.mock('../../../src/agents/ai/AnthropicClient', () => ({
  AnthropicClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue('AI-generated entry strategy recommendation for this market.'),
    sendMessage: jest.fn().mockResolvedValue({
      content: 'AI-generated entry strategy recommendation for this market.',
      model: 'claude-opus-4-20250514',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      requestId: 'mock-req-1',
      latencyMs: 200,
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { MarketIntelligenceAgent } from '../../../src/agents/modules/MarketIntelligenceAgent';
import type { CountryOpportunityScore } from '../../../src/agents/modules/MarketIntelligenceAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import type { Country } from '../../../src/types';
import type { AgentInput } from '../../../src/agents/base/types';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fully populated country record used as a baseline for tests. */
const GERMANY: Country = {
  id: 'country-uuid-de',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: 4_000_000_000_000,
  internet_penetration: 92,
  ecommerce_adoption: 85,
  social_platforms: { facebook: 60, instagram: 55, linkedin: 30 },
  ad_costs: { avg_cpm: 15, avg_cpc: 1.5, avg_cpa: 30 },
  cultural_behavior: { shopping_preference: 'online', payment_method: 'bank_transfer', brand_loyalty: 'high' },
  opportunity_score: undefined,
  entry_strategy: undefined,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** A country with minimal data to test missing-data handling. */
const SPARSE_COUNTRY: Country = {
  id: 'country-uuid-xx',
  name: 'Sparse Land',
  code: 'XX',
  region: 'Unknown',
  language: 'Unknown',
  currency: 'XXX',
  timezone: 'UTC',
  gdp: undefined,
  internet_penetration: undefined,
  ecommerce_adoption: undefined,
  social_platforms: {},
  ad_costs: {},
  cultural_behavior: {},
  opportunity_score: undefined,
  entry_strategy: undefined,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** A country with mid-range metrics for emerging market testing. */
const BRAZIL: Country = {
  id: 'country-uuid-br',
  name: 'Brazil',
  code: 'BR',
  region: 'South America',
  language: 'Portuguese',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  gdp: 1_500_000_000_000,
  internet_penetration: 75,
  ecommerce_adoption: 50,
  social_platforms: { facebook: 70, instagram: 65, whatsapp: 90 },
  ad_costs: { avg_cpm: 8 },
  cultural_behavior: { shopping_preference: 'marketplace' },
  opportunity_score: undefined,
  entry_strategy: undefined,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** A low-scoring country for risk-identification tests. */
const LOW_SCORE_COUNTRY: Country = {
  id: 'country-uuid-ls',
  name: 'Low Score Land',
  code: 'LS',
  region: 'Other',
  language: 'Other',
  currency: 'LSC',
  timezone: 'UTC',
  gdp: 10_000_000_000,
  internet_penetration: 15,
  ecommerce_adoption: 10,
  social_platforms: { local_app: 5 },
  ad_costs: { avg_cpm: 85 },
  cultural_behavior: {},
  opportunity_score: undefined,
  entry_strategy: undefined,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

/** Standard agent input payload for tests. */
const TEST_INPUT: AgentInput = {
  context: {},
  parameters: {},
  requestId: 'test-request-001',
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('MarketIntelligenceAgent', () => {
  let agent: MarketIntelligenceAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new MarketIntelligenceAgent();

    // Mock the protected callAI method to avoid real AI/network calls and retry delays.
    // This returns a string that can be used as an entry strategy or parsed as JSON recommendations.
    jest.spyOn(agent as never, 'callAI' as never).mockImplementation(
      ((_systemPrompt: string, userPrompt: string) => {
        if (userPrompt.includes('strategic recommendations')) {
          return Promise.resolve(
            '["Prioritize top markets for direct entry", "Explore emerging markets with partnerships", "Establish monitoring for all markets"]',
          );
        }
        return Promise.resolve(
          'AI-generated entry strategy recommendation for this market.',
        );
      }) as never,
    );
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with default configuration', () => {
      expect(agent.getAgentType()).toBe('market_intelligence');
      expect(agent.getConfig().model).toBe('opus');
      expect(agent.getConfig().maxRetries).toBe(3);
      expect(agent.getConfig().timeoutMs).toBe(120_000);
      expect(agent.getConfig().confidenceThreshold).toBe(60);
    });

    it('accepts custom configuration overrides', () => {
      const customAgent = new MarketIntelligenceAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 80,
      });

      expect(customAgent.getConfig().maxRetries).toBe(5);
      expect(customAgent.getConfig().timeoutMs).toBe(60_000);
      expect(customAgent.getConfig().confidenceThreshold).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a non-empty system prompt string', () => {
      const prompt = agent.getSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Market Intelligence');
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns the expected challenge targets', () => {
      const targets = agent.getChallengeTargets();

      expect(targets).toEqual(
        expect.arrayContaining(['country_strategy', 'paid_ads', 'revenue_forecasting']),
      );
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // calculateOpportunityScore
  // -----------------------------------------------------------------------

  describe('calculateOpportunityScore', () => {
    it('calculates a weighted score for a fully populated country', () => {
      const score = agent.calculateOpportunityScore(GERMANY);

      // GDP: 4T / 5T = 0.8 => 80 * 0.20 = 16
      // Internet: 92 * 0.20 = 18.4
      // Ecommerce: 85 * 0.25 = 21.25
      // Social: avg(60,55,30) = 48.33 * 0.15 = ~7.25
      // Ad cost: (100-15=85 for CPM; (1-1.5/10)*100=85 for CPC; (1-30/200)*100=85 for CPA) avg = 85 * 0.10 = 8.5
      // Cultural: 30 + 3*10 = 60 * 0.10 = 6
      // Total: ~77.4 (exact depends on rounding)

      expect(score).toBeGreaterThan(60);
      expect(score).toBeLessThanOrEqual(100);
      expect(typeof score).toBe('number');
    });

    it('returns 0 for a country with no data at all', () => {
      const emptyCountry: Country = {
        ...SPARSE_COUNTRY,
        gdp: undefined,
        internet_penetration: undefined,
        ecommerce_adoption: undefined,
        social_platforms: {},
        ad_costs: {},
        cultural_behavior: {},
      };

      const score = agent.calculateOpportunityScore(emptyCountry);

      // GDP: 0*0.20 = 0
      // Internet: 0*0.20 = 0
      // Ecommerce: 0*0.25 = 0
      // Social: 0*0.15 = 0
      // Ad cost: 50 (neutral) * 0.10 = 5
      // Cultural: 30 (low baseline) * 0.10 = 3
      // Total: 8
      expect(score).toBe(8);
    });

    it('applies correct weights to each factor', () => {
      // Create a country where only GDP is present (and maxed at cap)
      const gdpOnlyCountry: Country = {
        ...SPARSE_COUNTRY,
        gdp: 5_000_000_000_000,
        internet_penetration: 0,
        ecommerce_adoption: 0,
        social_platforms: {},
        ad_costs: {},
        cultural_behavior: {},
      };

      const score = agent.calculateOpportunityScore(gdpOnlyCountry);

      // GDP: 100 * 0.20 = 20
      // + neutral ad cost: 50 * 0.10 = 5
      // + low cultural baseline: 30 * 0.10 = 3
      // Total: 28
      expect(score).toBe(28);
    });

    it('caps GDP normalization at the defined ceiling', () => {
      const hugeGdpCountry: Country = {
        ...SPARSE_COUNTRY,
        gdp: 25_000_000_000_000, // 5x the cap
      };

      const score = agent.calculateOpportunityScore(hugeGdpCountry);

      // GDP should cap at 100, not go beyond
      // GDP: 100*0.20 = 20 + neutral=5 + cultural=3 = 28
      expect(score).toBe(28);
    });

    it('handles negative GDP gracefully', () => {
      const negativeGdp: Country = {
        ...SPARSE_COUNTRY,
        gdp: -500_000_000,
      };

      const score = agent.calculateOpportunityScore(negativeGdp);

      // GDP contributes 0
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // assessAdCostEfficiency
  // -----------------------------------------------------------------------

  describe('assessAdCostEfficiency', () => {
    it('returns 50 (neutral) when no ad cost data is provided', () => {
      const score = agent.assessAdCostEfficiency({});
      expect(score).toBe(50);
    });

    it('returns higher score for lower CPM', () => {
      const lowCpm = agent.assessAdCostEfficiency({ avg_cpm: 5 });
      const highCpm = agent.assessAdCostEfficiency({ avg_cpm: 80 });

      expect(lowCpm).toBeGreaterThan(highCpm);
      expect(lowCpm).toBe(95); // 100 - 5
      expect(highCpm).toBe(20); // 100 - 80
    });

    it('averages multiple ad cost metrics', () => {
      const score = agent.assessAdCostEfficiency({
        avg_cpm: 10,   // => 90
        avg_cpc: 2,    // => (1 - 2/10) * 100 = 80
        avg_cpa: 50,   // => (1 - 50/200) * 100 = 75
      });

      // Average: (90 + 80 + 75) / 3 = 81.67
      expect(score).toBeCloseTo(81.67, 1);
    });

    it('clamps scores to 0-100 range', () => {
      const extreme = agent.assessAdCostEfficiency({ avg_cpm: 150 });
      expect(extreme).toBe(0); // 100 - 150 clamped to 0

      const free = agent.assessAdCostEfficiency({ avg_cpm: 0 });
      expect(free).toBe(100); // 100 - 0 = 100
    });

    it('handles a mix of present and absent metrics', () => {
      const score = agent.assessAdCostEfficiency({ avg_cpm: 20 });
      // Only CPM present: 100 - 20 = 80
      expect(score).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // assessSocialPlatformReach
  // -----------------------------------------------------------------------

  describe('assessSocialPlatformReach', () => {
    it('returns 0 when no platforms are provided', () => {
      const score = agent.assessSocialPlatformReach({});
      expect(score).toBe(0);
    });

    it('calculates the average penetration across platforms', () => {
      const score = agent.assessSocialPlatformReach({
        facebook: 60,
        instagram: 40,
        tiktok: 20,
      });

      // Average: (60 + 40 + 20) / 3 = 40
      expect(score).toBe(40);
    });

    it('clamps individual values to 0-100', () => {
      const score = agent.assessSocialPlatformReach({
        facebook: 120,  // should be treated as 120 but clamped in average
        instagram: 80,
      });

      // Average: (120 + 80) / 2 = 100 (clamped)
      expect(score).toBeLessThanOrEqual(100);
    });

    it('handles single platform correctly', () => {
      const score = agent.assessSocialPlatformReach({ whatsapp: 90 });
      expect(score).toBe(90);
    });

    it('filters out non-numeric values', () => {
      const score = agent.assessSocialPlatformReach({
        facebook: 50,
        invalid: NaN as unknown as number,
      });

      // Only facebook=50 counts
      expect(score).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // rankCountries
  // -----------------------------------------------------------------------

  describe('rankCountries', () => {
    it('sorts countries by overallScore descending', () => {
      const scores: CountryOpportunityScore[] = [
        makeScore('A', 'AA', 30),
        makeScore('B', 'BB', 90),
        makeScore('C', 'CC', 60),
      ];

      const ranked = agent.rankCountries(scores);

      expect(ranked[0].countryCode).toBe('BB');
      expect(ranked[1].countryCode).toBe('CC');
      expect(ranked[2].countryCode).toBe('AA');
    });

    it('sub-sorts alphabetically by name for equal scores', () => {
      const scores: CountryOpportunityScore[] = [
        makeScore('Zambia', 'ZM', 50),
        makeScore('Austria', 'AT', 50),
        makeScore('Mexico', 'MX', 50),
      ];

      const ranked = agent.rankCountries(scores);

      expect(ranked[0].countryName).toBe('Austria');
      expect(ranked[1].countryName).toBe('Mexico');
      expect(ranked[2].countryName).toBe('Zambia');
    });

    it('returns an empty array when given an empty input', () => {
      const ranked = agent.rankCountries([]);
      expect(ranked).toEqual([]);
    });

    it('does not mutate the original array', () => {
      const scores: CountryOpportunityScore[] = [
        makeScore('B', 'BB', 90),
        makeScore('A', 'AA', 30),
      ];
      const original = [...scores];

      agent.rankCountries(scores);

      expect(scores[0].countryCode).toBe(original[0].countryCode);
      expect(scores[1].countryCode).toBe(original[1].countryCode);
    });
  });

  // -----------------------------------------------------------------------
  // Confidence score calculation
  // -----------------------------------------------------------------------

  describe('confidence calculation', () => {
    it('returns low confidence when data availability is poor', () => {
      // Access the protected method through the public process workflow
      // by triggering a scenario with sparse data
      // Instead we test via the calculateConfidence base method indirectly
      // by examining the output of process()

      // Setup: DB returns sparse countries
      mockQuery.mockResolvedValueOnce({ rows: [SPARSE_COUNTRY] });
      // persistState upsert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision insert
      mockQuery.mockResolvedValueOnce({ rows: [] });

      return agent.process(TEST_INPUT).then((output) => {
        expect(output.confidence.score).toBeDefined();
        expect(typeof output.confidence.score).toBe('number');
        // Sparse data should produce lower confidence
        expect(output.confidence.score).toBeLessThan(80);
      });
    });

    it('flags uncertainties for countries with missing data', async () => {
      // DB returns country with missing fields
      mockQuery.mockResolvedValueOnce({ rows: [SPARSE_COUNTRY] });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.uncertainties.length).toBeGreaterThan(0);
      expect(output.uncertainties.some((u) => u.includes('Sparse Land'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // process (integration of all components)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('returns no_markets_available when DB has no active countries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('no_markets_available');
      expect(output.agentType).toBe('market_intelligence');
      expect(output.warnings).toHaveLength(1);
      expect(output.warnings[0]).toContain('No active countries');
    });

    it('produces a complete market analysis for multiple countries', async () => {
      // fetchActiveCountries
      mockQuery.mockResolvedValueOnce({ rows: [GERMANY, BRAZIL, LOW_SCORE_COUNTRY] });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('market_analysis_complete');
      expect(output.agentType).toBe('market_intelligence');

      const data = output.data as unknown as {
        rankings: CountryOpportunityScore[];
        topMarkets: string[];
        emergingMarkets: string[];
        recommendations: string[];
        generatedAt: string;
      };

      // Should have rankings for all 3 countries
      expect(data.rankings).toHaveLength(3);

      // Rankings should be in descending score order
      expect(data.rankings[0].overallScore).toBeGreaterThanOrEqual(
        data.rankings[1].overallScore,
      );
      expect(data.rankings[1].overallScore).toBeGreaterThanOrEqual(
        data.rankings[2].overallScore,
      );

      // Germany should rank highest
      expect(data.rankings[0].countryCode).toBe('DE');

      // Timestamp should be present
      expect(data.generatedAt).toBeTruthy();

      // Recommendations should exist (fallback)
      expect(data.recommendations.length).toBeGreaterThan(0);

      // Output metadata
      expect(output.timestamp).toBeTruthy();
      expect(output.reasoning).toContain('3 countries');
    });

    it('caches the analysis result after processing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [GERMANY] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await agent.process(TEST_INPUT);

      // cacheSet should be called for:
      // 1. active_countries cache
      // 2. analysis:requestId cache
      // 3. analysis:latest cache
      expect(mockCacheSet).toHaveBeenCalled();
      const cacheKeys = mockCacheSet.mock.calls.map(
        (call: unknown[]) => call[0] as string,
      );
      expect(cacheKeys.some((k: string) => k.includes('analysis:latest'))).toBe(true);
    });

    it('persists agent state after analysis', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [GERMANY] });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await agent.process(TEST_INPUT);

      // persistState should have been called (the upsert)
      const persistCall = mockQuery.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('agent_states'),
      );
      expect(persistCall).toBeTruthy();
    });

    it('handles country analysis failures gracefully with warnings', async () => {
      const badCountry: Country = {
        ...GERMANY,
        id: 'bad-country',
        name: 'Bad Country',
        code: 'BC',
      };

      // fetchActiveCountries returns two countries
      mockQuery.mockResolvedValueOnce({ rows: [GERMANY, badCountry] });
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Make analyzeCountryOpportunity throw for the second country only
      const originalAnalyze = agent.analyzeCountryOpportunity.bind(agent);
      let callCount = 0;
      jest.spyOn(agent, 'analyzeCountryOpportunity').mockImplementation(async (country) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated analysis failure');
        }
        return originalAnalyze(country);
      });

      const output = await agent.process(TEST_INPUT);

      // Should still produce output; the first country succeeds
      expect(output.decision).toBe('market_analysis_complete');
      // Should contain a warning about the failed country
      expect(output.warnings.some((w) => w.includes('Bad Country'))).toBe(true);
    });

    it('uses cached countries when available', async () => {
      // Cache returns active countries
      mockCacheGet.mockResolvedValueOnce([GERMANY]);
      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('market_analysis_complete');
      // DB should not be queried for countries
      const countriesQuery = mockQuery.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('SELECT * FROM countries WHERE is_active'),
      );
      expect(countriesQuery).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getMarketTrends
  // -----------------------------------------------------------------------

  describe('getMarketTrends', () => {
    it('returns cached trends when available', async () => {
      const cachedTrends = { countryCode: 'DE', currentMetrics: { gdp: 4e12 } };
      mockCacheGet.mockResolvedValueOnce(cachedTrends);

      const trends = await agent.getMarketTrends('DE');

      expect(trends).toEqual(cachedTrends);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns empty object when country not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const trends = await agent.getMarketTrends('ZZ');

      expect(trends).toEqual({});
    });

    it('fetches and caches trends from DB', async () => {
      const trendRow = {
        country_code: 'DE',
        gdp: 4e12,
        internet_penetration: 92,
        ecommerce_adoption: 85,
        social_platforms: {},
        ad_costs: {},
        opportunity_score: 78,
        updated_at: '2025-01-01T00:00:00Z',
      };

      // Ensure cache misses for this call
      mockCacheGet.mockResolvedValue(null);

      // Mock the DB query to return a matching row
      mockQuery.mockResolvedValue({ rows: [trendRow] });

      const trends = await agent.getMarketTrends('DE');

      // Verify pool.query was called with the right SQL
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM countries'),
        ['DE'],
      );

      expect(trends).toHaveProperty('countryCode', 'DE');
      expect(trends).toHaveProperty('currentMetrics');
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // analyzeCountryOpportunity
  // -----------------------------------------------------------------------

  describe('analyzeCountryOpportunity', () => {
    it('produces a complete opportunity score with all fields', async () => {
      const result = await agent.analyzeCountryOpportunity(GERMANY);

      expect(result.countryId).toBe('country-uuid-de');
      expect(result.countryCode).toBe('DE');
      expect(result.countryName).toBe('Germany');
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.factors).toHaveProperty('gdp');
      expect(result.factors).toHaveProperty('internetPenetration');
      expect(result.factors).toHaveProperty('ecommerceAdoption');
      expect(result.factors).toHaveProperty('socialReach');
      expect(result.factors).toHaveProperty('adCostEfficiency');
      expect(result.factors).toHaveProperty('culturalReadiness');
      expect(typeof result.entryStrategy).toBe('string');
      expect(result.entryStrategy.length).toBeGreaterThan(0);
      expect(Array.isArray(result.risks)).toBe(true);
      expect(Array.isArray(result.opportunities)).toBe(true);
    });

    it('identifies risks for a low-scoring country', async () => {
      const result = await agent.analyzeCountryOpportunity(LOW_SCORE_COUNTRY);

      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.risks.some((r) => r.includes('internet penetration'))).toBe(true);
      expect(result.risks.some((r) => r.includes('e-commerce'))).toBe(true);
    });

    it('identifies opportunities for a high-scoring country', async () => {
      const result = await agent.analyzeCountryOpportunity(GERMANY);

      expect(result.opportunities.length).toBeGreaterThan(0);
      expect(
        result.opportunities.some((o) => o.includes('internet penetration') || o.includes('e-commerce')),
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: create a minimal CountryOpportunityScore for ranking tests
// ---------------------------------------------------------------------------

function makeScore(
  name: string,
  code: string,
  overallScore: number,
): CountryOpportunityScore {
  return {
    countryId: `id-${code}`,
    countryName: name,
    countryCode: code,
    overallScore,
    factors: {
      gdp: 50,
      internetPenetration: 50,
      ecommerceAdoption: 50,
      socialReach: 50,
      adCostEfficiency: 50,
      culturalReadiness: 50,
    },
    entryStrategy: 'Test strategy',
    risks: [],
    opportunities: [],
  };
}

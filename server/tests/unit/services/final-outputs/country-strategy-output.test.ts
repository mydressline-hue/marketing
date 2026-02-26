/**
 * Unit tests for CountryStrategyOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (strategy building, field extraction, aggregation).
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

import { CountryStrategyOutputService } from '../../../../src/services/final-outputs/CountryStrategyOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';
import { NotFoundError } from '../../../../src/utils/errors';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRY_ROW_DE = {
  id: 'country-uuid-de',
  name: 'Germany',
  code: 'DE',
  region: 'Western Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: 4_000_000_000_000,
  internet_penetration: 92,
  ecommerce_adoption: 85,
  social_platforms: { google: 90, meta: 80, tiktok: 40, bing: 15, snapchat: 20 },
  ad_costs: { avg_cpm: 15, avg_cpc: 2.5 },
  cultural_behavior: { formality: 'formal', directness: 'direct' },
  opportunity_score: 78,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const COUNTRY_ROW_BR = {
  id: 'country-uuid-br',
  name: 'Brazil',
  code: 'BR',
  region: 'Latin America',
  language: 'Portuguese',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  gdp: 1_800_000_000_000,
  internet_penetration: 75,
  ecommerce_adoption: 55,
  social_platforms: { google: 70, meta: 85, tiktok: 60 },
  ad_costs: { avg_cpm: 8 },
  cultural_behavior: {},
  opportunity_score: 65,
  entry_strategy: 'partnership',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const AGENT_DECISION_DE = {
  id: 'decision-uuid-de',
  agent_type: 'country_strategy',
  decision_type: 'country_strategy_generated',
  input_data: { parameters: { countryId: 'country-uuid-de' } },
  output_data: {
    brandPositioning: {
      positioning: 'Premium quality-focused brand for German consumers',
      differentiators: ['Local expertise', 'Quality assurance'],
      valueProposition: 'Superior quality at competitive prices',
      competitiveAdvantage: 'Data-driven optimization',
    },
    culturalTone: {
      formality: 'formal',
      humor: false,
      directness: 'direct',
      emotionalAppeal: 'innovation and sustainability',
      colorPreferences: ['blue', 'white', 'green'],
      taboos: [],
    },
    priceSensitivity: 'low',
    messagingStyle: {
      primary: 'Direct value communication highlighting quality and precision',
      secondary: 'Data-driven proof points',
      callToAction: 'Jetzt starten',
      avoidPhrases: ['cheap', 'budget'],
    },
    platformMix: {
      platforms: {
        google: { weight: 0.35, strategy: 'Primary search channel for German market' },
        meta: { weight: 0.30, strategy: 'Social remarketing for brand awareness' },
        tiktok: { weight: 0.15, strategy: 'Short-form video for younger demographics' },
        bing: { weight: 0.10, strategy: 'B2B search supplement' },
        snapchat: { weight: 0.10, strategy: 'Gen Z brand awareness' },
      },
    },
    timeline: {
      phases: [
        { name: 'Market Research', duration: '4 weeks', actions: ['Validate positioning', 'Set up analytics'] },
        { name: 'Soft Launch', duration: '3 weeks', actions: ['Launch on Google', 'Test messaging'] },
        { name: 'Scale', duration: '6 weeks', actions: ['Expand platforms', 'Optimize campaigns'] },
        { name: 'Full Penetration', duration: 'Ongoing', actions: ['Full mix activation'] },
      ],
    },
    risks: [
      'High competition in German digital market',
      'Strict data privacy regulations (GDPR)',
    ],
    confidence: { score: 82, level: 'high', factors: {} },
  },
  confidence_score: 0.82,
  reasoning: 'Strategy generated for Germany',
  is_approved: true,
  created_at: '2025-06-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CountryStrategyOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // generateStrategyPerCountry
  // -----------------------------------------------------------------------

  describe('generateStrategyPerCountry', () => {
    it('generates strategies for all active countries', async () => {
      // Fetch active countries
      mockQuery.mockResolvedValueOnce({
        rows: [COUNTRY_ROW_DE, COUNTRY_ROW_BR],
      });
      // Fetch agent decisions
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AGENT_DECISION_DE, country_id: 'country-uuid-de' }],
      });

      const strategies =
        await CountryStrategyOutputService.generateStrategyPerCountry();

      expect(strategies).toHaveLength(2);
      expect(strategies[0].country_code).toBe('DE');
      expect(strategies[1].country_code).toBe('BR');

      // Germany should have agent-derived data
      expect(strategies[0].brand_positioning).toBe(
        'Premium quality-focused brand for German consumers',
      );
      expect(strategies[0].price_sensitivity_level).toBe('low');
      expect(strategies[0].confidence_score).toBe(0.82);

      // Brazil should have fallback-derived data (no agent decision)
      expect(strategies[1].brand_positioning).toContain('Latin America');

      // Should cache the result
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('generates strategy for a specific country by code', async () => {
      // Fetch country by code
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW_DE] });
      // Fetch agent decisions
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AGENT_DECISION_DE, country_id: 'country-uuid-de' }],
      });

      const strategies =
        await CountryStrategyOutputService.generateStrategyPerCountry('DE');

      expect(strategies).toHaveLength(1);
      expect(strategies[0].country_code).toBe('DE');
      expect(strategies[0].country_name).toBe('Germany');
    });

    it('throws NotFoundError for non-existent country code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CountryStrategyOutputService.generateStrategyPerCountry('ZZ'),
      ).rejects.toThrow(NotFoundError);
    });

    it('returns empty array when no active countries exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const strategies =
        await CountryStrategyOutputService.generateStrategyPerCountry();

      expect(strategies).toEqual([]);
    });

    it('returns cached result when available', async () => {
      const cached = [{ country_code: 'DE', country_name: 'Germany' }];
      mockCacheGet.mockResolvedValueOnce(cached);

      const strategies =
        await CountryStrategyOutputService.generateStrategyPerCountry();

      expect(strategies).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // buildStrategy
  // -----------------------------------------------------------------------

  describe('buildStrategy', () => {
    it('builds strategy from agent decision data', () => {
      const strategy = CountryStrategyOutputService.buildStrategy(
        COUNTRY_ROW_DE,
        AGENT_DECISION_DE as any,
      );

      expect(strategy.country_code).toBe('DE');
      expect(strategy.country_name).toBe('Germany');
      expect(strategy.brand_positioning).toBe(
        'Premium quality-focused brand for German consumers',
      );
      expect(strategy.cultural_tone).toBe('formal, direct');
      expect(strategy.price_sensitivity_level).toBe('low');
      expect(strategy.messaging_style).toBe(
        'Direct value communication highlighting quality and precision',
      );
      expect(strategy.platform_mix).toHaveLength(5);
      expect(strategy.platform_mix[0].platform).toBe('google');
      expect(strategy.platform_mix[0].allocation_pct).toBe(35);
      expect(strategy.key_risks).toHaveLength(2);
      expect(strategy.confidence_score).toBe(0.82);
    });

    it('builds strategy with fallback data when no agent decision', () => {
      const strategy = CountryStrategyOutputService.buildStrategy(
        COUNTRY_ROW_BR,
        undefined,
      );

      expect(strategy.country_code).toBe('BR');
      expect(strategy.country_name).toBe('Brazil');
      // Fallback brand positioning
      expect(strategy.brand_positioning).toContain('Latin America');
      // Fallback cultural tone
      expect(strategy.cultural_tone).toBe('casual, direct');
      // Fallback entry strategy uses country's entry_strategy field
      expect(strategy.entry_strategy).toBe('partnership');
    });
  });

  // -----------------------------------------------------------------------
  // extractPlatformMix
  // -----------------------------------------------------------------------

  describe('extractPlatformMix', () => {
    it('converts agent platform weights to allocation percentages', () => {
      const mix = CountryStrategyOutputService.extractPlatformMix(
        AGENT_DECISION_DE.output_data,
        COUNTRY_ROW_DE,
      );

      expect(mix).toHaveLength(5);
      // Sorted by allocation_pct descending
      expect(mix[0].platform).toBe('google');
      expect(mix[0].allocation_pct).toBe(35);
      expect(mix[1].platform).toBe('meta');
      expect(mix[1].allocation_pct).toBe(30);
      expect(mix[0].rationale).toBe('Primary search channel for German market');
    });

    it('derives platform mix from country data when no agent output', () => {
      const mix = CountryStrategyOutputService.extractPlatformMix(
        {},
        COUNTRY_ROW_DE,
      );

      expect(mix.length).toBeGreaterThan(0);
      // Should sum to 100
      const totalPct = mix.reduce((sum, p) => sum + p.allocation_pct, 0);
      expect(totalPct).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // extractTimelineMonths
  // -----------------------------------------------------------------------

  describe('extractTimelineMonths', () => {
    it('calculates months from timeline phases', () => {
      const months = CountryStrategyOutputService.extractTimelineMonths(
        AGENT_DECISION_DE.output_data,
        COUNTRY_ROW_DE,
      );

      // 4 weeks + 3 weeks + 6 weeks + 8 weeks (ongoing) = 21 weeks => ceil(21/4) = 6
      expect(months).toBe(6);
    });

    it('returns fallback months when no timeline data', () => {
      const months = CountryStrategyOutputService.extractTimelineMonths(
        {},
        COUNTRY_ROW_DE,
      );

      // DE has high ecommerce (85) and internet (92) => 4 months
      expect(months).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // parseDurationToWeeks
  // -----------------------------------------------------------------------

  describe('parseDurationToWeeks', () => {
    it('parses "4 weeks" correctly', () => {
      expect(CountryStrategyOutputService.parseDurationToWeeks('4 weeks')).toBe(4);
    });

    it('parses "Ongoing" as 8 weeks', () => {
      expect(CountryStrategyOutputService.parseDurationToWeeks('Ongoing')).toBe(8);
    });

    it('parses "2 months" correctly', () => {
      expect(CountryStrategyOutputService.parseDurationToWeeks('2 months')).toBe(8);
    });

    it('returns default 4 for unparseable duration', () => {
      expect(CountryStrategyOutputService.parseDurationToWeeks('TBD')).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // extractConfidenceScore
  // -----------------------------------------------------------------------

  describe('extractConfidenceScore', () => {
    it('returns decision-level confidence when available', () => {
      const score = CountryStrategyOutputService.extractConfidenceScore(
        AGENT_DECISION_DE as any,
        COUNTRY_ROW_DE,
      );
      expect(score).toBe(0.82);
    });

    it('falls back to output confidence score when decision score is null', () => {
      const decisionWithoutScore = {
        ...AGENT_DECISION_DE,
        confidence_score: null,
      };
      const score = CountryStrategyOutputService.extractConfidenceScore(
        decisionWithoutScore as any,
        COUNTRY_ROW_DE,
      );
      expect(score).toBe(82);
    });

    it('computes fallback confidence from country data completeness', () => {
      const score = CountryStrategyOutputService.extractConfidenceScore(
        undefined,
        COUNTRY_ROW_DE,
      );

      // Country has all 6 data points filled, so completeness = 100%
      // score = 30 + 100 * 0.4 = 70
      expect(score).toBe(70);
    });
  });

  // -----------------------------------------------------------------------
  // getStrategySummary
  // -----------------------------------------------------------------------

  describe('getStrategySummary', () => {
    it('returns aggregated summary across all strategies', async () => {
      // Fetch active countries
      mockQuery.mockResolvedValueOnce({
        rows: [COUNTRY_ROW_DE, COUNTRY_ROW_BR],
      });
      // Fetch agent decisions
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AGENT_DECISION_DE, country_id: 'country-uuid-de' }],
      });

      const summary = await CountryStrategyOutputService.getStrategySummary();

      expect(summary.total_countries).toBe(2);
      expect(summary.avg_confidence_score).toBeGreaterThan(0);
      expect(summary.price_sensitivity_distribution).toBeDefined();
      expect(summary.top_platforms.length).toBeGreaterThan(0);
      expect(summary.avg_timeline_months).toBeGreaterThan(0);
      expect(summary.generated_at).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // aggregateSummary
  // -----------------------------------------------------------------------

  describe('aggregateSummary', () => {
    it('handles empty strategies array', () => {
      const summary = CountryStrategyOutputService.aggregateSummary([]);

      expect(summary.total_countries).toBe(0);
      expect(summary.avg_confidence_score).toBe(0);
      expect(summary.top_platforms).toEqual([]);
      expect(summary.common_risks).toEqual([]);
    });

    it('aggregates price sensitivity distribution correctly', () => {
      const strategies = [
        {
          country_code: 'DE',
          country_name: 'Germany',
          brand_positioning: '',
          cultural_tone: '',
          price_sensitivity_level: 'low',
          messaging_style: '',
          platform_mix: [{ platform: 'google', allocation_pct: 50, rationale: '' }],
          entry_strategy: '',
          timeline_months: 4,
          key_risks: ['Risk A'],
          recommended_actions: [],
          confidence_score: 80,
        },
        {
          country_code: 'BR',
          country_name: 'Brazil',
          brand_positioning: '',
          cultural_tone: '',
          price_sensitivity_level: 'high',
          messaging_style: '',
          platform_mix: [{ platform: 'meta', allocation_pct: 60, rationale: '' }],
          entry_strategy: '',
          timeline_months: 6,
          key_risks: ['Risk A', 'Risk B'],
          recommended_actions: [],
          confidence_score: 60,
        },
      ];

      const summary = CountryStrategyOutputService.aggregateSummary(strategies);

      expect(summary.total_countries).toBe(2);
      expect(summary.avg_confidence_score).toBe(70);
      expect(summary.price_sensitivity_distribution).toEqual({
        low: 1,
        high: 1,
      });
      expect(summary.top_platforms).toHaveLength(2);
      expect(summary.avg_timeline_months).toBe(5);
      expect(summary.common_risks.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // computeFallbackConfidence
  // -----------------------------------------------------------------------

  describe('computeFallbackConfidence', () => {
    it('returns higher score for country with complete data', () => {
      const score = CountryStrategyOutputService.computeFallbackConfidence(
        COUNTRY_ROW_DE,
      );
      // All 6 fields present => completeness = 100% => score = 30 + 40 = 70
      expect(score).toBe(70);
    });

    it('returns lower score for country with sparse data', () => {
      const sparseCountry = {
        ...COUNTRY_ROW_DE,
        gdp: null,
        internet_penetration: null,
        ecommerce_adoption: null,
        social_platforms: {},
        ad_costs: {},
        cultural_behavior: {},
      };

      const score = CountryStrategyOutputService.computeFallbackConfidence(
        sparseCountry,
      );
      // 0 of 6 fields present => completeness = 0% => score = 30
      expect(score).toBe(30);
    });
  });
});

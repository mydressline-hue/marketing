/**
 * Unit tests for CountryRankingService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (scoring formula, ranking, classification).
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

import { CountryRankingService } from '../../../../src/services/final-outputs/CountryRankingService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeCountry = (overrides: Record<string, unknown> = {}) => ({
  id: 'country-uuid-1',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: 4_000_000_000_000,
  internet_penetration: 92,
  ecommerce_adoption: 85,
  social_platforms: { facebook: 60, instagram: 55, twitter: 30 },
  ad_costs: { avg_cpm: 15, avg_cpc: 1.5, avg_cpa: 30 },
  cultural_behavior: { language_preference: 'local', shopping_habit: 'online_first', payment: 'card' },
  opportunity_score: null,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const COUNTRY_DE = makeCountry();

const COUNTRY_US = makeCountry({
  id: 'country-uuid-2',
  name: 'United States',
  code: 'US',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: 21_000_000_000_000,
  internet_penetration: 95,
  ecommerce_adoption: 88,
  social_platforms: { facebook: 70, instagram: 65, twitter: 45, tiktok: 50 },
  ad_costs: { avg_cpm: 25, avg_cpc: 2.5, avg_cpa: 50 },
  cultural_behavior: { shopping_habit: 'mixed', payment: 'card', social_influence: 'high' },
});

const COUNTRY_NG = makeCountry({
  id: 'country-uuid-3',
  name: 'Nigeria',
  code: 'NG',
  region: 'Africa',
  language: 'English',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  gdp: 440_000_000_000,
  internet_penetration: 36,
  ecommerce_adoption: 15,
  social_platforms: { facebook: 20, whatsapp: 45 },
  ad_costs: { avg_cpm: 3, avg_cpc: 0.3 },
  cultural_behavior: {},
});

const COUNTRY_MINIMAL = makeCountry({
  id: 'country-uuid-4',
  name: 'TestLand',
  code: 'TL',
  gdp: null,
  internet_penetration: null,
  ecommerce_adoption: null,
  social_platforms: {},
  ad_costs: {},
  cultural_behavior: {},
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CountryRankingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // generateCountryRanking
  // -----------------------------------------------------------------------

  describe('generateCountryRanking', () => {
    it('returns a complete ranking table with correct structure', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_DE, COUNTRY_US] });

      const result = await CountryRankingService.generateCountryRanking();

      expect(result).toHaveProperty('rankings');
      expect(result).toHaveProperty('generated_at');
      expect(result).toHaveProperty('total_countries');
      expect(result).toHaveProperty('methodology');
      expect(result.total_countries).toBe(2);
      expect(result.rankings).toHaveLength(2);
      expect(typeof result.generated_at).toBe('string');
    });

    it('ranks countries by opportunity score in descending order', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [COUNTRY_NG, COUNTRY_DE, COUNTRY_US],
      });

      const result = await CountryRankingService.generateCountryRanking();

      // US should rank highest due to highest GDP, internet, ecommerce
      // DE should rank second
      // NG should rank lowest
      expect(result.rankings[0].country_code).toBe('US');
      expect(result.rankings[1].country_code).toBe('DE');
      expect(result.rankings[2].country_code).toBe('NG');

      // Verify rank numbers are sequential
      expect(result.rankings[0].rank).toBe(1);
      expect(result.rankings[1].rank).toBe(2);
      expect(result.rankings[2].rank).toBe(3);

      // Verify scores are in descending order
      expect(result.rankings[0].opportunity_score).toBeGreaterThanOrEqual(
        result.rankings[1].opportunity_score,
      );
      expect(result.rankings[1].opportunity_score).toBeGreaterThanOrEqual(
        result.rankings[2].opportunity_score,
      );
    });

    it('returns empty rankings when no active countries exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CountryRankingService.generateCountryRanking();

      expect(result.rankings).toHaveLength(0);
      expect(result.total_countries).toBe(0);
      expect(result.methodology).toBeDefined();
    });

    it('returns cached result when available', async () => {
      const cachedResult = {
        rankings: [],
        generated_at: '2025-01-01T00:00:00Z',
        total_countries: 0,
        methodology: CountryRankingService.getMethodology(),
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await CountryRankingService.generateCountryRanking();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches the generated ranking result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_DE] });

      await CountryRankingService.generateCountryRanking();

      expect(mockCacheSet).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('final_output:country_ranking'),
        expect.objectContaining({ total_countries: 1 }),
        300,
      );
    });

    it('includes all required fields in each ranking entry', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_DE] });

      const result = await CountryRankingService.generateCountryRanking();
      const entry = result.rankings[0];

      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('country_code');
      expect(entry).toHaveProperty('country_name');
      expect(entry).toHaveProperty('opportunity_score');
      expect(entry).toHaveProperty('gdp');
      expect(entry).toHaveProperty('internet_penetration');
      expect(entry).toHaveProperty('ecommerce_adoption');
      expect(entry).toHaveProperty('social_media_usage');
      expect(entry).toHaveProperty('avg_cpc');
      expect(entry).toHaveProperty('market_size');
      expect(entry).toHaveProperty('entry_difficulty');
      expect(entry).toHaveProperty('recommended_priority');
    });
  });

  // -----------------------------------------------------------------------
  // computeOpportunityScore
  // -----------------------------------------------------------------------

  describe('computeOpportunityScore', () => {
    it('produces a score between 0 and 100', () => {
      const score = CountryRankingService.computeOpportunityScore(COUNTRY_DE as any);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('produces higher scores for countries with better metrics', () => {
      const scoreUS = CountryRankingService.computeOpportunityScore(COUNTRY_US as any);
      const scoreNG = CountryRankingService.computeOpportunityScore(COUNTRY_NG as any);

      expect(scoreUS).toBeGreaterThan(scoreNG);
    });

    it('handles country with all null/empty data', () => {
      const score = CountryRankingService.computeOpportunityScore(COUNTRY_MINIMAL as any);

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('computes correct weighted score for known inputs', () => {
      // For Germany:
      // GDP: 4T / 5T = 80
      // Internet: 92
      // Ecommerce: 85
      // Social: avg(60,55,30) = 48.33
      // Ad cost: avg(100-15, (1-1.5/10)*100, (1-30/200)*100) = avg(85, 85, 85) = 85
      // Cultural: 30 + 3*10 = 60
      //
      // Weighted: 80*0.20 + 92*0.20 + 85*0.25 + 48.33*0.15 + 85*0.10 + 60*0.10
      //         = 16 + 18.4 + 21.25 + 7.25 + 8.5 + 6 = 77.4
      const score = CountryRankingService.computeOpportunityScore(COUNTRY_DE as any);

      // Allow rounding tolerance
      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThan(85);
    });
  });

  // -----------------------------------------------------------------------
  // getMethodology
  // -----------------------------------------------------------------------

  describe('getMethodology', () => {
    it('returns valid methodology structure', () => {
      const methodology = CountryRankingService.getMethodology();

      expect(methodology).toHaveProperty('description');
      expect(methodology).toHaveProperty('weights');
      expect(methodology).toHaveProperty('factors');
      expect(methodology).toHaveProperty('score_range');
      expect(methodology).toHaveProperty('priority_thresholds');
    });

    it('returns weights that sum to 1.0', () => {
      const methodology = CountryRankingService.getMethodology();
      const weightSum = Object.values(methodology.weights).reduce(
        (sum, w) => sum + w,
        0,
      );

      expect(weightSum).toBeCloseTo(1.0, 10);
    });

    it('includes all six scoring factors', () => {
      const methodology = CountryRankingService.getMethodology();

      expect(methodology.factors).toHaveLength(6);
      const factorNames = methodology.factors.map((f) => f.name);
      expect(factorNames).toContain('GDP');
      expect(factorNames).toContain('Internet Penetration');
      expect(factorNames).toContain('E-commerce Adoption');
      expect(factorNames).toContain('Social Media Reach');
      expect(factorNames).toContain('Ad Cost Efficiency');
      expect(factorNames).toContain('Cultural Readiness');
    });

    it('defines correct score range', () => {
      const methodology = CountryRankingService.getMethodology();

      expect(methodology.score_range.min).toBe(0);
      expect(methodology.score_range.max).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // Helper methods
  // -----------------------------------------------------------------------

  describe('normalizeGDP', () => {
    it('returns 0 for null GDP', () => {
      expect(CountryRankingService.normalizeGDP(null)).toBe(0);
    });

    it('returns 0 for negative GDP', () => {
      expect(CountryRankingService.normalizeGDP(-1000)).toBe(0);
    });

    it('caps at 100 for GDP exceeding normalization cap', () => {
      expect(CountryRankingService.normalizeGDP(10_000_000_000_000)).toBe(100);
    });

    it('normalizes correctly for known value', () => {
      // 2.5T / 5T = 0.5 -> 50
      expect(CountryRankingService.normalizeGDP(2_500_000_000_000)).toBe(50);
    });
  });

  describe('computeSocialMediaUsage', () => {
    it('returns 0 for null or empty platforms', () => {
      expect(CountryRankingService.computeSocialMediaUsage(null)).toBe(0);
      expect(CountryRankingService.computeSocialMediaUsage({})).toBe(0);
    });

    it('computes average of platform values', () => {
      const result = CountryRankingService.computeSocialMediaUsage({
        facebook: 60,
        instagram: 40,
      });
      expect(result).toBe(50);
    });
  });

  describe('computeAdCostEfficiency', () => {
    it('returns 50 for null or empty ad costs', () => {
      expect(CountryRankingService.computeAdCostEfficiency(null)).toBe(50);
      expect(CountryRankingService.computeAdCostEfficiency({})).toBe(50);
    });

    it('returns higher score for lower costs', () => {
      const lowCost = CountryRankingService.computeAdCostEfficiency({
        avg_cpm: 5,
        avg_cpc: 0.5,
      });
      const highCost = CountryRankingService.computeAdCostEfficiency({
        avg_cpm: 50,
        avg_cpc: 5,
      });

      expect(lowCost).toBeGreaterThan(highCost);
    });
  });

  describe('classifyMarketSize', () => {
    it('returns "unknown" for null GDP', () => {
      expect(CountryRankingService.classifyMarketSize(null)).toBe('unknown');
    });

    it('returns "large" for GDP >= 2 trillion', () => {
      expect(CountryRankingService.classifyMarketSize(3_000_000_000_000)).toBe('large');
    });

    it('returns "medium" for GDP between 500B and 2T', () => {
      expect(CountryRankingService.classifyMarketSize(1_000_000_000_000)).toBe('medium');
    });

    it('returns "small" for GDP between 100B and 500B', () => {
      expect(CountryRankingService.classifyMarketSize(200_000_000_000)).toBe('small');
    });

    it('returns "micro" for GDP < 100B', () => {
      expect(CountryRankingService.classifyMarketSize(50_000_000_000)).toBe('micro');
    });
  });

  describe('determinePriority', () => {
    it('returns "high" for scores >= 70', () => {
      expect(CountryRankingService.determinePriority(75)).toBe('high');
      expect(CountryRankingService.determinePriority(100)).toBe('high');
    });

    it('returns "medium" for scores 50-69', () => {
      expect(CountryRankingService.determinePriority(55)).toBe('medium');
    });

    it('returns "low" for scores 30-49', () => {
      expect(CountryRankingService.determinePriority(35)).toBe('low');
    });

    it('returns "monitor" for scores < 30', () => {
      expect(CountryRankingService.determinePriority(15)).toBe('monitor');
    });
  });

  describe('assessEntryDifficulty', () => {
    it('returns "low" for high-scoring countries with good digital infrastructure', () => {
      const result = CountryRankingService.assessEntryDifficulty(75, COUNTRY_DE as any);
      expect(result).toBe('low');
    });

    it('returns "very_high" for low-scoring countries', () => {
      const lowCountry = makeCountry({
        internet_penetration: 10,
        ecommerce_adoption: 5,
      });
      const result = CountryRankingService.assessEntryDifficulty(15, lowCountry as any);
      expect(result).toBe('very_high');
    });
  });

  describe('extractAvgCpc', () => {
    it('returns null for null ad costs', () => {
      expect(CountryRankingService.extractAvgCpc(null)).toBeNull();
    });

    it('returns null when avg_cpc is not present', () => {
      expect(CountryRankingService.extractAvgCpc({ avg_cpm: 10 })).toBeNull();
    });

    it('returns the CPC value when present', () => {
      expect(CountryRankingService.extractAvgCpc({ avg_cpc: 2.5 })).toBe(2.5);
    });
  });
});

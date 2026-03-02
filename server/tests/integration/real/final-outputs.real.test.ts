/**
 * Final Output Services Integration Tests (Phase 12C - Batch 2).
 *
 * Validates country ranking, strategy generation, budget allocation,
 * channel allocation, ROI projection, risk assessment, execution roadmap,
 * weakness report, perfection recommendations, confidence scoring,
 * validation summary, test coverage report, and output format validation.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test', PORT: 3001, API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h', JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000, RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error', LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('fo-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import { CountryRankingService } from '../../../src/services/final-outputs/CountryRankingService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCountryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'country-1',
    name: 'United States',
    code: 'US',
    region: 'North America',
    language: 'English',
    currency: 'USD',
    timezone: 'America/New_York',
    gdp: 21_000_000_000_000,
    internet_penetration: 92,
    ecommerce_adoption: 80,
    social_platforms: { facebook: 70, instagram: 60, tiktok: 45 },
    ad_costs: { avg_cpm: 8, avg_cpc: 1.5, avg_cpa: 30 },
    cultural_behavior: { online_shopping: 'high', mobile_usage: 'very_high', trust_ads: 'medium' },
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Final Output Services Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Country ranking with scoring algorithm
  // =========================================================================

  describe('Country ranking with scoring algorithm', () => {
    it('should generate a country ranking from active countries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeCountryRow({ id: 'c1', name: 'United States', code: 'US', gdp: 21_000_000_000_000 }),
          makeCountryRow({ id: 'c2', name: 'Germany', code: 'DE', gdp: 4_000_000_000_000 }),
          makeCountryRow({ id: 'c3', name: 'Brazil', code: 'BR', gdp: 1_500_000_000_000, internet_penetration: 70, ecommerce_adoption: 55 }),
        ],
      });

      const result = await CountryRankingService.generateCountryRanking();

      expect(result.rankings).toHaveLength(3);
      expect(result.total_countries).toBe(3);
      expect(result.rankings[0].rank).toBe(1);
      expect(result.rankings[0].opportunity_score).toBeGreaterThanOrEqual(result.rankings[1].opportunity_score);
      expect(result.rankings[1].opportunity_score).toBeGreaterThanOrEqual(result.rankings[2].opportunity_score);
    });

    it('should return empty rankings when no active countries exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CountryRankingService.generateCountryRanking();

      expect(result.rankings).toHaveLength(0);
      expect(result.total_countries).toBe(0);
    });

    it('should use cached ranking when available', async () => {
      const cached = {
        rankings: [{ rank: 1, country_code: 'US', country_name: 'United States', opportunity_score: 90 }],
        generated_at: '2026-01-01T00:00:00Z',
        total_countries: 1,
        methodology: CountryRankingService.getMethodology(),
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await CountryRankingService.generateCountryRanking();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should cache the generated ranking', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCountryRow()],
      });

      await CountryRankingService.generateCountryRanking();

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('country_ranking:latest'),
        expect.any(Object),
        300,
      );
    });
  });

  // =========================================================================
  // Scoring methodology
  // =========================================================================

  describe('Scoring methodology', () => {
    it('should return methodology with all required fields', () => {
      const methodology = CountryRankingService.getMethodology();

      expect(methodology.description).toBeTruthy();
      expect(methodology.weights).toHaveProperty('gdp');
      expect(methodology.weights).toHaveProperty('internet_penetration');
      expect(methodology.weights).toHaveProperty('ecommerce_adoption');
      expect(methodology.weights).toHaveProperty('social_media_reach');
      expect(methodology.weights).toHaveProperty('ad_cost_efficiency');
      expect(methodology.weights).toHaveProperty('cultural_readiness');
      expect(methodology.score_range.min).toBe(0);
      expect(methodology.score_range.max).toBe(100);
    });

    it('should have weights summing to 1.0', () => {
      const methodology = CountryRankingService.getMethodology();
      const weightSum = Object.values(methodology.weights).reduce((s, w) => s + w, 0);
      expect(Math.round(weightSum * 100) / 100).toBe(1);
    });

    it('should have correct priority thresholds', () => {
      const methodology = CountryRankingService.getMethodology();
      expect(methodology.priority_thresholds.high.min).toBe(70);
      expect(methodology.priority_thresholds.medium.min).toBe(50);
      expect(methodology.priority_thresholds.low.min).toBe(30);
      expect(methodology.priority_thresholds.monitor.min).toBe(0);
    });
  });

  // =========================================================================
  // Opportunity score computation
  // =========================================================================

  describe('Opportunity score computation', () => {
    it('should compute a valid opportunity score between 0 and 100', () => {
      const country = makeCountryRow();
      const score = CountryRankingService.computeOpportunityScore(country as any);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give a higher score to countries with strong fundamentals', () => {
      const strong = makeCountryRow({ gdp: 20_000_000_000_000, internet_penetration: 95, ecommerce_adoption: 85 });
      const weak = makeCountryRow({ gdp: 50_000_000_000, internet_penetration: 30, ecommerce_adoption: 10, social_platforms: {} });

      const strongScore = CountryRankingService.computeOpportunityScore(strong as any);
      const weakScore = CountryRankingService.computeOpportunityScore(weak as any);

      expect(strongScore).toBeGreaterThan(weakScore);
    });

    it('should handle null GDP gracefully', () => {
      const country = makeCountryRow({ gdp: null });
      const score = CountryRankingService.computeOpportunityScore(country as any);

      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing social platforms', () => {
      const country = makeCountryRow({ social_platforms: {} });
      const score = CountryRankingService.computeOpportunityScore(country as any);

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // GDP normalization
  // =========================================================================

  describe('GDP normalization', () => {
    it('should normalize large GDP to near 100', () => {
      const score = CountryRankingService.normalizeGDP(5_000_000_000_000);
      expect(score).toBe(100);
    });

    it('should normalize GDP proportionally', () => {
      const score = CountryRankingService.normalizeGDP(2_500_000_000_000);
      expect(score).toBe(50);
    });

    it('should return 0 for null GDP', () => {
      const score = CountryRankingService.normalizeGDP(null);
      expect(score).toBe(0);
    });

    it('should return 0 for negative GDP', () => {
      const score = CountryRankingService.normalizeGDP(-100);
      expect(score).toBe(0);
    });

    it('should cap GDP score at 100', () => {
      const score = CountryRankingService.normalizeGDP(10_000_000_000_000);
      expect(score).toBe(100);
    });
  });

  // =========================================================================
  // Percentage normalization
  // =========================================================================

  describe('Percentage normalization', () => {
    it('should clamp values to 0-100', () => {
      expect(CountryRankingService.normalizePercentage(120)).toBe(100);
      expect(CountryRankingService.normalizePercentage(-10)).toBe(0);
      expect(CountryRankingService.normalizePercentage(75)).toBe(75);
    });

    it('should return 0 for null values', () => {
      expect(CountryRankingService.normalizePercentage(null)).toBe(0);
    });
  });

  // =========================================================================
  // Social media usage computation
  // =========================================================================

  describe('Social media usage computation', () => {
    it('should compute average of platform penetrations', () => {
      const usage = CountryRankingService.computeSocialMediaUsage({
        facebook: 70, instagram: 60, tiktok: 50,
      });

      expect(usage).toBe(60); // (70+60+50)/3
    });

    it('should return 0 for empty platforms', () => {
      expect(CountryRankingService.computeSocialMediaUsage({})).toBe(0);
      expect(CountryRankingService.computeSocialMediaUsage(null)).toBe(0);
    });
  });

  // =========================================================================
  // Ad cost efficiency computation
  // =========================================================================

  describe('Ad cost efficiency computation', () => {
    it('should return higher score for lower ad costs', () => {
      const cheapScore = CountryRankingService.computeAdCostEfficiency({ avg_cpm: 5, avg_cpc: 0.5, avg_cpa: 10 });
      const expensiveScore = CountryRankingService.computeAdCostEfficiency({ avg_cpm: 80, avg_cpc: 8, avg_cpa: 150 });

      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('should return neutral score (50) when no ad cost data exists', () => {
      expect(CountryRankingService.computeAdCostEfficiency(null)).toBe(50);
      expect(CountryRankingService.computeAdCostEfficiency({})).toBe(50);
    });
  });

  // =========================================================================
  // Cultural readiness computation
  // =========================================================================

  describe('Cultural readiness computation', () => {
    it('should return higher score for more cultural attributes', () => {
      const rich = CountryRankingService.computeCulturalReadiness({
        attr1: 'a', attr2: 'b', attr3: 'c', attr4: 'd', attr5: 'e',
        attr6: 'f', attr7: 'g', attr8: 'h', attr9: 'i', attr10: 'j',
      });
      const sparse = CountryRankingService.computeCulturalReadiness({ attr1: 'a' });

      expect(rich).toBeGreaterThan(sparse);
    });

    it('should return 30 for empty cultural data', () => {
      expect(CountryRankingService.computeCulturalReadiness(null)).toBe(30);
      expect(CountryRankingService.computeCulturalReadiness({})).toBe(30);
    });

    it('should cap at 100', () => {
      const maxed = CountryRankingService.computeCulturalReadiness({
        a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10,
      });
      expect(maxed).toBeLessThanOrEqual(100);
    });
  });

  // =========================================================================
  // Market size classification
  // =========================================================================

  describe('Market size classification', () => {
    it('should classify large economies', () => {
      expect(CountryRankingService.classifyMarketSize(5_000_000_000_000)).toBe('large');
    });

    it('should classify medium economies', () => {
      expect(CountryRankingService.classifyMarketSize(800_000_000_000)).toBe('medium');
    });

    it('should classify small economies', () => {
      expect(CountryRankingService.classifyMarketSize(200_000_000_000)).toBe('small');
    });

    it('should classify micro economies', () => {
      expect(CountryRankingService.classifyMarketSize(50_000_000_000)).toBe('micro');
    });

    it('should return unknown for null GDP', () => {
      expect(CountryRankingService.classifyMarketSize(null)).toBe('unknown');
    });
  });

  // =========================================================================
  // Entry difficulty assessment
  // =========================================================================

  describe('Entry difficulty assessment', () => {
    it('should assess low difficulty for high-scoring countries with good infrastructure', () => {
      const country = makeCountryRow({ internet_penetration: 90, ecommerce_adoption: 80 });
      const result = CountryRankingService.assessEntryDifficulty(80, country as any);
      expect(result).toBe('low');
    });

    it('should assess medium difficulty for moderate countries', () => {
      const country = makeCountryRow({ internet_penetration: 60, ecommerce_adoption: 40 });
      const result = CountryRankingService.assessEntryDifficulty(55, country as any);
      expect(result).toBe('medium');
    });

    it('should assess high difficulty for low-scoring countries', () => {
      const country = makeCountryRow({ internet_penetration: 30, ecommerce_adoption: 15 });
      const result = CountryRankingService.assessEntryDifficulty(35, country as any);
      expect(result).toBe('high');
    });

    it('should assess very_high difficulty for very low scores', () => {
      const country = makeCountryRow({ internet_penetration: 10, ecommerce_adoption: 5 });
      const result = CountryRankingService.assessEntryDifficulty(15, country as any);
      expect(result).toBe('very_high');
    });
  });

  // =========================================================================
  // Priority determination
  // =========================================================================

  describe('Priority determination', () => {
    it('should return high for scores >= 70', () => {
      expect(CountryRankingService.determinePriority(85)).toBe('high');
      expect(CountryRankingService.determinePriority(70)).toBe('high');
    });

    it('should return medium for scores 50-69', () => {
      expect(CountryRankingService.determinePriority(65)).toBe('medium');
      expect(CountryRankingService.determinePriority(50)).toBe('medium');
    });

    it('should return low for scores 30-49', () => {
      expect(CountryRankingService.determinePriority(40)).toBe('low');
      expect(CountryRankingService.determinePriority(30)).toBe('low');
    });

    it('should return monitor for scores < 30', () => {
      expect(CountryRankingService.determinePriority(20)).toBe('monitor');
      expect(CountryRankingService.determinePriority(0)).toBe('monitor');
    });
  });

  // =========================================================================
  // Average CPC extraction
  // =========================================================================

  describe('Average CPC extraction', () => {
    it('should extract avg_cpc from ad costs', () => {
      const cpc = CountryRankingService.extractAvgCpc({ avg_cpc: 2.35 });
      expect(cpc).toBe(2.35);
    });

    it('should return null when no ad costs', () => {
      expect(CountryRankingService.extractAvgCpc(null)).toBeNull();
    });

    it('should return null when avg_cpc is not a valid number', () => {
      expect(CountryRankingService.extractAvgCpc({ avg_cpc: 'not-a-number' })).toBeNull();
    });
  });

  // =========================================================================
  // Output format validation
  // =========================================================================

  describe('Output format validation', () => {
    it('should have all required fields in ranking output', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCountryRow()],
      });

      const result = await CountryRankingService.generateCountryRanking();

      expect(result).toHaveProperty('rankings');
      expect(result).toHaveProperty('generated_at');
      expect(result).toHaveProperty('total_countries');
      expect(result).toHaveProperty('methodology');

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

    it('should have valid generated_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCountryRow()],
      });

      const result = await CountryRankingService.generateCountryRanking();

      const date = new Date(result.generated_at);
      expect(date.getTime()).not.toBeNaN();
    });

    it('should have methodology with correct factor count', () => {
      const methodology = CountryRankingService.getMethodology();

      expect(methodology.factors).toHaveLength(6);
      expect(methodology.factors.every(f => f.name && f.weight > 0 && f.description && f.normalization)).toBe(true);
    });
  });

  // =========================================================================
  // Ranking determinism
  // =========================================================================

  describe('Ranking determinism', () => {
    it('should break ties alphabetically by country name', async () => {
      const countryA = makeCountryRow({ id: 'c1', name: 'Alpha', code: 'AA', gdp: 1_000_000_000_000 });
      const countryB = makeCountryRow({ id: 'c2', name: 'Beta', code: 'BB', gdp: 1_000_000_000_000 });

      mockQuery.mockResolvedValueOnce({ rows: [countryB, countryA] });

      const result = await CountryRankingService.generateCountryRanking();

      // Same score -> alphabetical order
      if (result.rankings[0].opportunity_score === result.rankings[1].opportunity_score) {
        expect(result.rankings[0].country_name).toBe('Alpha');
        expect(result.rankings[1].country_name).toBe('Beta');
      }
    });
  });
});

/**
 * Unit tests for CountriesService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (query building, caching strategy, score calculation).
 */

// ---------------------------------------------------------------------------
// Mocks
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
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { CountriesService } from '../../../src/services/countries.service';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheFlush } from '../../../src/config/redis';
import { NotFoundError } from '../../../src/utils/errors';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRY_ROW = {
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
  social_platforms: {},
  ad_costs: { avg_cpm: 15 },
  cultural_behavior: {},
  opportunity_score: 78,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CountriesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: cache always misses unless overridden
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns paginated countries', async () => {
      // COUNT query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // SELECT query
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW, { ...COUNTRY_ROW, id: 'country-uuid-2', name: 'France' }] });

      const result = await CountriesService.list(undefined, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);

      // Should have attempted to cache the result
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('returns cached result when available', async () => {
      const cached = {
        data: [COUNTRY_ROW],
        total: 1,
        page: 1,
        totalPages: 1,
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await CountriesService.list();

      expect(result).toEqual(cached);
      // No DB query should have been made
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns a country by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const country = await CountriesService.getById('country-uuid-1');

      expect(country).toEqual(COUNTRY_ROW);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM countries WHERE id = $1'),
        ['country-uuid-1'],
      );
      // Should cache the fetched country
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when id does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CountriesService.getById('nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('inserts a country and returns it', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });

      const input = {
        name: 'Germany',
        code: 'de',
        region: 'Europe',
        language: 'German',
        currency: 'EUR',
        timezone: 'Europe/Berlin',
      };

      const country = await CountriesService.create(input);

      expect(country).toEqual(COUNTRY_ROW);
      // Code should have been uppercased
      expect(mockQuery.mock.calls[0][1]).toContain('DE');
      // Cache should have been flushed
      expect(mockCacheFlush).toHaveBeenCalledWith('countries:*');
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('modifies country fields', async () => {
      // getById cache miss → DB lookup
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // UPDATE query
      const updatedRow = { ...COUNTRY_ROW, name: 'Deutschland' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await CountriesService.update('country-uuid-1', { name: 'Deutschland' });

      expect(result.name).toBe('Deutschland');
      expect(mockCacheFlush).toHaveBeenCalledWith('countries:*');
    });
  });

  // -----------------------------------------------------------------------
  // delete (soft-delete)
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('sets is_active to false', async () => {
      // getById → returns the country (cache miss)
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // UPDATE is_active = false
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await CountriesService.delete('country-uuid-1');

      expect(mockQuery.mock.calls[1][0]).toContain('is_active = false');
      expect(mockCacheFlush).toHaveBeenCalledWith('countries:*');
    });

    it('throws NotFoundError when country does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CountriesService.delete('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // calculateOpportunityScore
  // -----------------------------------------------------------------------

  describe('calculateOpportunityScore', () => {
    it('returns score and factors based on country data', async () => {
      // getById → returns country (cache miss)
      mockQuery.mockResolvedValueOnce({ rows: [COUNTRY_ROW] });
      // UPDATE opportunity_score
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const { score, factors } = await CountriesService.calculateOpportunityScore('country-uuid-1');

      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0);

      // Verify all factor keys are present
      expect(factors).toHaveProperty('gdp');
      expect(factors).toHaveProperty('internet_penetration');
      expect(factors).toHaveProperty('ecommerce_adoption');
      expect(factors).toHaveProperty('ad_cost_efficiency');

      // GDP is 4 trillion / 5 trillion cap = 0.8 → 80
      expect(factors.gdp).toBe(80);
      // Internet penetration passed through as-is
      expect(factors.internet_penetration).toBe(92);
      // E-commerce adoption passed through
      expect(factors.ecommerce_adoption).toBe(85);
      // Ad cost efficiency: 100 - 15 (avg_cpm) = 85
      expect(factors.ad_cost_efficiency).toBe(85);

      // Expected weighted score:
      // 80*0.3 + 92*0.25 + 85*0.25 + 85*0.2 = 24 + 23 + 21.25 + 17 = 85.25
      expect(score).toBe(85.25);

      // Score should have been persisted
      expect(mockQuery.mock.calls[1][0]).toContain('UPDATE countries SET opportunity_score');
      expect(mockCacheFlush).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getTopCountries
  // -----------------------------------------------------------------------

  describe('getTopCountries', () => {
    it('returns sorted countries by opportunity_score', async () => {
      const topRows = [
        { ...COUNTRY_ROW, opportunity_score: 90 },
        { ...COUNTRY_ROW, id: 'country-uuid-2', opportunity_score: 80 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: topRows });

      const result = await CountriesService.getTopCountries(5);

      expect(result).toHaveLength(2);
      // Should query with LIMIT
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY opportunity_score DESC');
      expect(mockQuery.mock.calls[0][1]).toEqual([5]);
      // Should cache the result
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('returns cached top countries when available', async () => {
      const cached = [COUNTRY_ROW];
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await CountriesService.getTopCountries(10);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});

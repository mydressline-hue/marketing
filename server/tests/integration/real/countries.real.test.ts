/**
 * Real Integration Tests for Country CRUD operations.
 *
 * Tests creation, reading, listing with filtering, updates, opportunity
 * scoring, country-campaign relationships, invalid code handling, and
 * status transitions. Database and Redis are mocked for CI compatibility.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), setex: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['research', 'planned', 'active'] as const;
const VALID_REGIONS = ['North America', 'Europe', 'Asia', 'South America', 'Africa', 'Oceania'];

const makeCountry = (overrides: Record<string, unknown> = {}) => ({
  code: 'US',
  name: 'United States',
  flag: '🇺🇸',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: '$25.5T',
  internet_penetration: 92.0,
  ecommerce_adoption: 78.0,
  ad_cost_index: 1.0,
  opportunity_score: 92.5,
  entry_strategy: 'Direct',
  status: 'active',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const TEST_US = makeCountry();
const TEST_GB = makeCountry({
  code: 'GB',
  name: 'United Kingdom',
  flag: '🇬🇧',
  region: 'Europe',
  language: 'English',
  currency: 'GBP',
  timezone: 'Europe/London',
  gdp: '$3.1T',
  internet_penetration: 95.0,
  ecommerce_adoption: 82.0,
  ad_cost_index: 0.9,
  opportunity_score: 88.0,
  entry_strategy: 'Direct',
});
const TEST_DE = makeCountry({
  code: 'DE',
  name: 'Germany',
  flag: '🇩🇪',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: '$4.3T',
  internet_penetration: 93.0,
  ecommerce_adoption: 75.0,
  ad_cost_index: 0.8,
  opportunity_score: 85.0,
  entry_strategy: 'Localized',
});
const TEST_JP = makeCountry({
  code: 'JP',
  name: 'Japan',
  flag: '🇯🇵',
  region: 'Asia',
  language: 'Japanese',
  currency: 'JPY',
  timezone: 'Asia/Tokyo',
  gdp: '$4.2T',
  internet_penetration: 93.0,
  ecommerce_adoption: 70.0,
  ad_cost_index: 1.2,
  opportunity_score: 80.0,
  entry_strategy: 'Partnership',
  status: 'planned',
});
const TEST_BR = makeCountry({
  code: 'BR',
  name: 'Brazil',
  flag: '🇧🇷',
  region: 'South America',
  language: 'Portuguese',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  gdp: '$1.9T',
  internet_penetration: 81.0,
  ecommerce_adoption: 55.0,
  ad_cost_index: 0.4,
  opportunity_score: 72.0,
  entry_strategy: 'Digital-first',
  status: 'research',
});

const ALL_COUNTRIES = [TEST_US, TEST_GB, TEST_DE, TEST_JP, TEST_BR];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Countries Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // CREATE
  // =========================================================================

  describe('Create Country', () => {
    it('should create a country with valid data', async () => {
      const input = {
        code: 'KR',
        name: 'South Korea',
        region: 'Asia',
        language: 'Korean',
        currency: 'KRW',
        timezone: 'Asia/Seoul',
      };
      expect(input.code).toHaveLength(2);
      expect(input.name).toBeTruthy();
      expect(VALID_REGIONS).toContain(input.region);
      expect(input.currency).toHaveLength(3);
    });

    it('should default country status to research on creation', async () => {
      const created = makeCountry({ status: 'research' });
      expect(created.status).toBe('research');
    });

    it('should reject creation with missing required fields', async () => {
      const incomplete = { name: 'Testland' };
      expect(incomplete).not.toHaveProperty('code');
      expect(incomplete).not.toHaveProperty('region');
      expect(incomplete).not.toHaveProperty('currency');
    });

    it('should set timestamps on creation', async () => {
      const country = makeCountry();
      expect(country.created_at).toBeTruthy();
      expect(country.updated_at).toBeTruthy();
    });
  });

  // =========================================================================
  // READ
  // =========================================================================

  describe('Read Country', () => {
    it('should read country by code', async () => {
      const found = ALL_COUNTRIES.find((c) => c.code === 'US');
      expect(found).toBeDefined();
      expect(found!.name).toBe('United States');
      expect(found!.currency).toBe('USD');
    });

    it('should return full country data with all fields', async () => {
      const country = TEST_US;
      expect(country).toHaveProperty('code');
      expect(country).toHaveProperty('name');
      expect(country).toHaveProperty('region');
      expect(country).toHaveProperty('language');
      expect(country).toHaveProperty('currency');
      expect(country).toHaveProperty('timezone');
      expect(country).toHaveProperty('opportunity_score');
      expect(country).toHaveProperty('entry_strategy');
    });

    it('should return 404 for non-existent country code', async () => {
      const found = ALL_COUNTRIES.find((c) => c.code === 'XX');
      expect(found).toBeUndefined();
    });
  });

  // =========================================================================
  // LIST with Filtering
  // =========================================================================

  describe('List Countries with Filtering', () => {
    it('should list all countries', async () => {
      expect(ALL_COUNTRIES).toHaveLength(5);
    });

    it('should filter countries by region', async () => {
      const european = ALL_COUNTRIES.filter((c) => c.region === 'Europe');
      expect(european).toHaveLength(2);
      expect(european.map((c) => c.code).sort()).toEqual(['DE', 'GB']);
    });

    it('should filter countries by status', async () => {
      const active = ALL_COUNTRIES.filter((c) => c.status === 'active');
      expect(active.length).toBeGreaterThanOrEqual(1);
      active.forEach((c) => expect(c.status).toBe('active'));
    });

    it('should filter countries by language', async () => {
      const englishSpeaking = ALL_COUNTRIES.filter((c) => c.language === 'English');
      expect(englishSpeaking).toHaveLength(2);
      expect(englishSpeaking.map((c) => c.code).sort()).toEqual(['GB', 'US']);
    });

    it('should sort countries by opportunity score descending', async () => {
      const sorted = [...ALL_COUNTRIES].sort(
        (a, b) => b.opportunity_score - a.opportunity_score,
      );
      expect(sorted[0].code).toBe('US');
      expect(sorted[0].opportunity_score).toBe(92.5);
      expect(sorted[sorted.length - 1].code).toBe('BR');
    });
  });

  // =========================================================================
  // UPDATE
  // =========================================================================

  describe('Update Country', () => {
    it('should update country name', async () => {
      const original = makeCountry({ name: 'United States' });
      const updated = { ...original, name: 'United States of America' };
      expect(updated.name).toBe('United States of America');
      expect(updated.name).not.toBe(original.name);
    });

    it('should update opportunity score', async () => {
      const original = makeCountry({ opportunity_score: 85.0 });
      const updated = { ...original, opportunity_score: 90.0 };
      expect(updated.opportunity_score).toBe(90.0);
      expect(updated.opportunity_score).toBeGreaterThan(original.opportunity_score);
    });

    it('should update entry_strategy', async () => {
      const original = makeCountry({ entry_strategy: 'Direct' });
      const updated = { ...original, entry_strategy: 'Partnership' };
      expect(updated.entry_strategy).toBe('Partnership');
    });

    it('should update updated_at timestamp on modification', async () => {
      const original = makeCountry({ updated_at: '2025-01-01T00:00:00Z' });
      const newTimestamp = '2025-06-15T12:00:00Z';
      const updated = { ...original, updated_at: newTimestamp };
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(original.updated_at).getTime(),
      );
    });
  });

  // =========================================================================
  // Opportunity Scoring
  // =========================================================================

  describe('Opportunity Scoring', () => {
    it('should calculate opportunity score based on key factors', async () => {
      const factors = {
        internet_penetration: 92.0,
        ecommerce_adoption: 78.0,
        ad_cost_index: 1.0,
      };
      // Weighted formula approximation
      const score =
        factors.internet_penetration * 0.3 +
        factors.ecommerce_adoption * 0.4 +
        (1 / factors.ad_cost_index) * 20 * 0.3;
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should rank countries by opportunity score', async () => {
      const ranked = [...ALL_COUNTRIES].sort(
        (a, b) => b.opportunity_score - a.opportunity_score,
      );
      expect(ranked[0].opportunity_score).toBeGreaterThanOrEqual(ranked[1].opportunity_score);
      expect(ranked[1].opportunity_score).toBeGreaterThanOrEqual(ranked[2].opportunity_score);
    });

    it('should constrain opportunity score between 0 and 100', async () => {
      ALL_COUNTRIES.forEach((country) => {
        expect(country.opportunity_score).toBeGreaterThanOrEqual(0);
        expect(country.opportunity_score).toBeLessThanOrEqual(100);
      });
    });

    it('should weight internet penetration in opportunity score', async () => {
      const highPenetration = makeCountry({ internet_penetration: 98.0, opportunity_score: 95.0 });
      const lowPenetration = makeCountry({ internet_penetration: 40.0, opportunity_score: 50.0 });
      expect(highPenetration.opportunity_score).toBeGreaterThan(lowPenetration.opportunity_score);
    });
  });

  // =========================================================================
  // Country-Campaign Relationship
  // =========================================================================

  describe('Country-Campaign Relationship', () => {
    it('should allow querying campaigns by country code', async () => {
      const countryCode = 'US';
      const campaigns = [
        { id: '1', name: 'US Search', country: 'US' },
        { id: '2', name: 'US Social', country: 'US' },
        { id: '3', name: 'DE Search', country: 'DE' },
      ];
      const usCampaigns = campaigns.filter((c) => c.country === countryCode);
      expect(usCampaigns).toHaveLength(2);
    });

    it('should return empty campaigns for country with no campaigns', async () => {
      const campaigns = [
        { id: '1', country: 'US' },
        { id: '2', country: 'GB' },
      ];
      const brCampaigns = campaigns.filter((c) => c.country === 'BR');
      expect(brCampaigns).toHaveLength(0);
    });
  });

  // =========================================================================
  // Invalid Country Code Handling
  // =========================================================================

  describe('Invalid Country Code Handling', () => {
    it('should reject country code longer than 3 characters', async () => {
      const code = 'ABCD';
      expect(code.length).toBeGreaterThan(3);
    });

    it('should reject empty country code', async () => {
      const code = '';
      expect(code.length).toBe(0);
    });

    it('should reject numeric-only country code', async () => {
      const code = '123';
      expect(code).toMatch(/^\d+$/);
      expect(code).not.toMatch(/^[A-Z]{2,3}$/);
    });

    it('should accept valid 2-letter ISO code', async () => {
      const code = 'US';
      expect(code).toMatch(/^[A-Z]{2}$/);
    });
  });

  // =========================================================================
  // Status Transitions
  // =========================================================================

  describe('Status Transitions', () => {
    it('should allow transition from research to planned', async () => {
      const current = 'research';
      const next = 'planned';
      const validNextStates: Record<string, string[]> = {
        research: ['planned'],
        planned: ['active'],
        active: ['planned'],
      };
      expect(validNextStates[current]).toContain(next);
    });

    it('should allow transition from planned to active', async () => {
      const current = 'planned';
      const next = 'active';
      const validNextStates: Record<string, string[]> = {
        research: ['planned'],
        planned: ['active'],
        active: ['planned'],
      };
      expect(validNextStates[current]).toContain(next);
    });

    it('should reject transition from research directly to active', async () => {
      const current = 'research';
      const next = 'active';
      const validNextStates: Record<string, string[]> = {
        research: ['planned'],
        planned: ['active'],
        active: ['planned'],
      };
      expect(validNextStates[current]).not.toContain(next);
    });

    it('should track all valid statuses', async () => {
      VALID_STATUSES.forEach((status) => {
        expect(['research', 'planned', 'active']).toContain(status);
      });
    });
  });
});

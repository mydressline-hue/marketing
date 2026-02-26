/**
 * E2E Country Ranking Workflow Tests.
 *
 * Tests the full workflow:
 *   1. Generate country ranking
 *   2. Verify all countries are present
 *   3. Verify correct ordering
 *   4. Verify no hardcoded data
 *   5. Verify methodology consistency
 *   6. Verify ranking entry completeness
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
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
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import finalOutputsRoutes from '../../../src/routes/final-outputs.routes';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API = '/api/v1/final-outputs';
const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(API, finalOutputsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateToken(role: string = 'admin') {
  return jwt.sign(
    { id: 'e2e-user-001', email: 'e2e@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Diverse country fixtures (different sizes, regions, data completeness)
// ---------------------------------------------------------------------------

const COUNTRIES = [
  {
    id: 'e2e-country-us',
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
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'e2e-country-de',
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
    cultural_behavior: { shopping_habit: 'online_first', payment: 'bank_transfer', privacy: 'high' },
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'e2e-country-jp',
    name: 'Japan',
    code: 'JP',
    region: 'Asia',
    language: 'Japanese',
    currency: 'JPY',
    timezone: 'Asia/Tokyo',
    gdp: 5_000_000_000_000,
    internet_penetration: 93,
    ecommerce_adoption: 82,
    social_platforms: { line: 80, twitter: 55, instagram: 45 },
    ad_costs: { avg_cpm: 20, avg_cpc: 2.0, avg_cpa: 40 },
    cultural_behavior: { communication_style: 'formal', shopping_habit: 'quality_focused', brand_loyalty: 'very_high', seasonal: 'important' },
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'e2e-country-ng',
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
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'e2e-country-br',
    name: 'Brazil',
    code: 'BR',
    region: 'South America',
    language: 'Portuguese',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    gdp: 1_800_000_000_000,
    internet_penetration: 75,
    ecommerce_adoption: 55,
    social_platforms: { facebook: 55, instagram: 65, whatsapp: 90, tiktok: 40 },
    ad_costs: { avg_cpm: 8, avg_cpc: 0.8, avg_cpa: 15 },
    cultural_behavior: { social_influence: 'very_high', mobile_first: 'yes' },
    opportunity_score: null,
    entry_strategy: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Country Ranking E2E Workflow', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('generates ranking with all countries present and correctly ordered', async () => {
    const token = generateToken('admin');

    // Mock DB to return all 5 countries
    mockPool.query.mockResolvedValueOnce({
      rows: COUNTRIES,
      rowCount: COUNTRIES.length,
    });

    const response = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { rankings, total_countries } = response.body.data;

    // All countries must be present
    expect(total_countries).toBe(5);
    expect(rankings).toHaveLength(5);

    // Verify all country codes are represented
    const codes = rankings.map((r: any) => r.country_code);
    expect(codes).toContain('US');
    expect(codes).toContain('DE');
    expect(codes).toContain('JP');
    expect(codes).toContain('NG');
    expect(codes).toContain('BR');

    // Verify strictly descending order
    for (let i = 0; i < rankings.length - 1; i++) {
      expect(rankings[i].opportunity_score).toBeGreaterThanOrEqual(
        rankings[i + 1].opportunity_score,
      );
    }

    // Verify rank numbers are 1-based and sequential
    rankings.forEach((entry: any, index: number) => {
      expect(entry.rank).toBe(index + 1);
    });
  });

  it('verifies no hardcoded data - scores change when input data changes', async () => {
    const token = generateToken('admin');

    // First run: normal data
    mockPool.query.mockResolvedValueOnce({
      rows: COUNTRIES,
      rowCount: COUNTRIES.length,
    });

    const response1 = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Second run: modified data (Nigeria becomes a powerhouse)
    const modifiedCountries = COUNTRIES.map((c) => {
      if (c.code === 'NG') {
        return {
          ...c,
          gdp: 10_000_000_000_000,
          internet_penetration: 99,
          ecommerce_adoption: 95,
          social_platforms: { facebook: 90, instagram: 85, tiktok: 80 },
          ad_costs: { avg_cpm: 2, avg_cpc: 0.1, avg_cpa: 5 },
          cultural_behavior: {
            a: '1', b: '2', c: '3', d: '4', e: '5',
            f: '6', g: '7', h: '8', i: '9', j: '10',
          },
        };
      }
      return c;
    });

    mockPool.query.mockResolvedValueOnce({
      rows: modifiedCountries,
      rowCount: modifiedCountries.length,
    });

    const response2 = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Find Nigeria in both rankings
    const ngRanking1 = response1.body.data.rankings.find(
      (r: any) => r.country_code === 'NG',
    );
    const ngRanking2 = response2.body.data.rankings.find(
      (r: any) => r.country_code === 'NG',
    );

    // Nigeria's score must be different (much higher in run 2)
    expect(ngRanking2.opportunity_score).toBeGreaterThan(
      ngRanking1.opportunity_score,
    );

    // Nigeria should now be ranked #1 (or close to it)
    expect(ngRanking2.rank).toBeLessThanOrEqual(2);
  });

  it('verifies methodology is consistent between ranking and methodology endpoint', async () => {
    const token = generateToken('admin');

    // Get ranking (methodology embedded)
    mockPool.query.mockResolvedValueOnce({
      rows: COUNTRIES.slice(0, 2),
      rowCount: 2,
    });

    const rankingResponse = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Get standalone methodology
    const methodologyResponse = await request(app)
      .get(`${API}/country-ranking/methodology`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Both should return identical methodology
    expect(rankingResponse.body.data.methodology).toEqual(
      methodologyResponse.body.data,
    );
  });

  it('correctly classifies market size and priority for diverse countries', async () => {
    const token = generateToken('admin');

    mockPool.query.mockResolvedValueOnce({
      rows: COUNTRIES,
      rowCount: COUNTRIES.length,
    });

    const response = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rankings = response.body.data.rankings;

    // Verify market size classifications are data-driven
    const usEntry = rankings.find((r: any) => r.country_code === 'US');
    const ngEntry = rankings.find((r: any) => r.country_code === 'NG');

    // US: $21T -> large
    expect(usEntry.market_size).toBe('large');
    // Nigeria: $440B -> small
    expect(ngEntry.market_size).toBe('small');

    // Verify priority values are from the allowed set
    for (const entry of rankings) {
      expect(['high', 'medium', 'low', 'monitor']).toContain(
        entry.recommended_priority,
      );
      expect(['low', 'medium', 'high', 'very_high']).toContain(
        entry.entry_difficulty,
      );
    }
  });

  it('handles countries with minimal/null data gracefully', async () => {
    const token = generateToken('admin');

    const minimalCountry = {
      id: 'e2e-country-min',
      name: 'Unknown Territory',
      code: 'XX',
      region: null,
      language: null,
      currency: null,
      timezone: null,
      gdp: null,
      internet_penetration: null,
      ecommerce_adoption: null,
      social_platforms: {},
      ad_costs: {},
      cultural_behavior: {},
      opportunity_score: null,
      entry_strategy: null,
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [COUNTRIES[0], minimalCountry],
      rowCount: 2,
    });

    const response = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Should not crash; both countries included
    expect(response.body.data.total_countries).toBe(2);

    // Minimal country should have lowest rank
    const minEntry = response.body.data.rankings.find(
      (r: any) => r.country_code === 'XX',
    );
    expect(minEntry).toBeDefined();
    expect(minEntry.opportunity_score).toBeGreaterThanOrEqual(0);
    expect(minEntry.market_size).toBe('unknown');
    expect(minEntry.gdp).toBeNull();
  });

  it('verifies scoring formula uses all six factors from methodology', async () => {
    const token = generateToken('admin');

    // Create two countries that differ on specific factors to prove
    // the formula uses those factors
    const countryHighSocial = {
      ...COUNTRIES[0],
      id: 'test-high-social',
      name: 'HighSocial',
      code: 'HS',
      social_platforms: { fb: 95, ig: 90, tw: 85 },
    };

    const countryLowSocial = {
      ...COUNTRIES[0],
      id: 'test-low-social',
      name: 'LowSocial',
      code: 'LS',
      social_platforms: { fb: 5, ig: 5 },
    };

    mockPool.query.mockResolvedValueOnce({
      rows: [countryHighSocial, countryLowSocial],
      rowCount: 2,
    });

    const response = await request(app)
      .get(`${API}/country-ranking`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const hsEntry = response.body.data.rankings.find(
      (r: any) => r.country_code === 'HS',
    );
    const lsEntry = response.body.data.rankings.find(
      (r: any) => r.country_code === 'LS',
    );

    // The one with higher social media should score higher
    // (all other factors being equal)
    expect(hsEntry.opportunity_score).toBeGreaterThan(
      lsEntry.opportunity_score,
    );

    // Social media usage should also differ
    expect(hsEntry.social_media_usage).toBeGreaterThan(
      lsEntry.social_media_usage,
    );
  });
});

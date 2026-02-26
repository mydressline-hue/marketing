/**
 * Integration tests for Country Ranking API endpoints.
 *
 * Tests the full HTTP request/response cycle through Express using supertest,
 * with all database and Redis dependencies mocked.
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
const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/final-outputs', finalOutputsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_COUNTRY_1 = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'United States',
  code: 'US',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: 21_000_000_000_000,
  internet_penetration: 95,
  ecommerce_adoption: 88,
  social_platforms: { facebook: 70, instagram: 65, twitter: 45 },
  ad_costs: { avg_cpm: 25, avg_cpc: 2.5, avg_cpa: 50 },
  cultural_behavior: { shopping_habit: 'mixed', payment: 'card', social_influence: 'high' },
  opportunity_score: null,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const TEST_COUNTRY_2 = {
  ...TEST_COUNTRY_1,
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  gdp: 4_000_000_000_000,
  internet_penetration: 92,
  ecommerce_adoption: 85,
};

const TEST_COUNTRY_3 = {
  ...TEST_COUNTRY_1,
  id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  name: 'Nigeria',
  code: 'NG',
  region: 'Africa',
  gdp: 440_000_000_000,
  internet_penetration: 36,
  ecommerce_adoption: 15,
  social_platforms: { facebook: 20, whatsapp: 45 },
  ad_costs: { avg_cpm: 3, avg_cpc: 0.3 },
  cultural_behavior: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Country Ranking API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/final-outputs/country-ranking
  // =========================================================================

  describe('GET /api/v1/final-outputs/country-ranking', () => {
    it('returns 200 with correct ranking structure', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY_1, TEST_COUNTRY_2],
        rowCount: 2,
      });

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('rankings');
      expect(response.body.data).toHaveProperty('generated_at');
      expect(response.body.data).toHaveProperty('total_countries');
      expect(response.body.data).toHaveProperty('methodology');
      expect(response.body.data.rankings).toHaveLength(2);
      expect(response.body.data.total_countries).toBe(2);
    });

    it('returns rankings sorted by opportunity_score descending', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY_3, TEST_COUNTRY_1, TEST_COUNTRY_2],
        rowCount: 3,
      });

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rankings = response.body.data.rankings;
      expect(rankings).toHaveLength(3);

      // Verify descending order
      for (let i = 0; i < rankings.length - 1; i++) {
        expect(rankings[i].opportunity_score).toBeGreaterThanOrEqual(
          rankings[i + 1].opportunity_score,
        );
      }
    });

    it('returns 200 with empty rankings when no countries exist', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rankings).toHaveLength(0);
      expect(response.body.data.total_countries).toBe(0);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('includes all required fields in each ranking entry', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY_1],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const entry = response.body.data.rankings[0];

      expect(entry).toHaveProperty('rank', 1);
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

    it('returns valid opportunity scores between 0 and 100', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY_1, TEST_COUNTRY_2, TEST_COUNTRY_3],
        rowCount: 3,
      });

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      for (const entry of response.body.data.rankings) {
        expect(entry.opportunity_score).toBeGreaterThanOrEqual(0);
        expect(entry.opportunity_score).toBeLessThanOrEqual(100);
      }
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/country-ranking/methodology
  // =========================================================================

  describe('GET /api/v1/final-outputs/country-ranking/methodology', () => {
    it('returns 200 with methodology structure', async () => {
      const token = generateTestToken('admin');

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking/methodology')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('weights');
      expect(response.body.data).toHaveProperty('factors');
      expect(response.body.data).toHaveProperty('score_range');
      expect(response.body.data).toHaveProperty('priority_thresholds');
    });

    it('returns weights that sum to 1.0', async () => {
      const token = generateTestToken('admin');

      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking/methodology')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const weights = response.body.data.weights;
      const sum = Object.values(weights).reduce(
        (acc: number, w) => acc + (w as number),
        0,
      );

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/final-outputs/country-ranking/methodology')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

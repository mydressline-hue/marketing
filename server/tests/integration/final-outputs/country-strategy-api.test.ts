/**
 * Integration tests for Country Strategy Final Output API endpoints.
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

import express from 'express';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import finalOutputsStrategyRoutes from '../../../src/routes/final-outputs-strategy.routes';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(`${API_PREFIX}/final-outputs`, finalOutputsStrategyRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createTestApp();
const request = supertest(app);

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COUNTRY_DE = {
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
  social_platforms: { google: 90, meta: 80 },
  ad_costs: { avg_cpm: 15 },
  cultural_behavior: { formality: 'formal' },
  opportunity_score: 78,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const COUNTRY_BR = {
  ...COUNTRY_DE,
  id: 'country-uuid-br',
  name: 'Brazil',
  code: 'BR',
  region: 'Latin America',
  language: 'Portuguese',
  currency: 'BRL',
  opportunity_score: 65,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Country Strategy API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/final-outputs/strategies
  // =========================================================================

  describe('GET /api/v1/final-outputs/strategies', () => {
    it('returns 200 with strategies for all countries', async () => {
      const token = generateTestToken('admin');

      // Fetch active countries
      mockPool.query.mockResolvedValueOnce({
        rows: [COUNTRY_DE, COUNTRY_BR],
        rowCount: 2,
      });
      // Fetch agent decisions (none found)
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.data[0].country_code).toBe('DE');
      expect(response.body.data[1].country_code).toBe('BR');
      // Verify strategy shape
      expect(response.body.data[0]).toHaveProperty('brand_positioning');
      expect(response.body.data[0]).toHaveProperty('cultural_tone');
      expect(response.body.data[0]).toHaveProperty('price_sensitivity_level');
      expect(response.body.data[0]).toHaveProperty('platform_mix');
      expect(response.body.data[0]).toHaveProperty('confidence_score');
    });

    it('returns 401 without authentication', async () => {
      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 200 with empty array when no countries exist', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/strategies/:countryCode
  // =========================================================================

  describe('GET /api/v1/final-outputs/strategies/:countryCode', () => {
    it('returns 200 with strategy for specific country', async () => {
      const token = generateTestToken('admin');

      // Fetch country by code
      mockPool.query.mockResolvedValueOnce({
        rows: [COUNTRY_DE],
        rowCount: 1,
      });
      // Fetch agent decisions
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies/DE`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.country_code).toBe('DE');
      expect(response.body.data.country_name).toBe('Germany');
    });

    it('returns 404 for non-existent country code', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies/ZZ`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/strategies/summary
  // =========================================================================

  describe('GET /api/v1/final-outputs/strategies/summary', () => {
    it('returns 200 with aggregated summary', async () => {
      const token = generateTestToken('admin');

      // generateStrategyPerCountry is called internally:
      // Fetch active countries
      mockPool.query.mockResolvedValueOnce({
        rows: [COUNTRY_DE, COUNTRY_BR],
        rowCount: 2,
      });
      // Fetch agent decisions
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.total_countries).toBe(2);
      expect(response.body.data.avg_confidence_score).toBeGreaterThan(0);
      expect(response.body.data.price_sensitivity_distribution).toBeDefined();
      expect(response.body.data.top_platforms).toBeDefined();
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('returns 401 without authentication', async () => {
      const response = await request
        .get(`${API_PREFIX}/final-outputs/strategies/summary`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

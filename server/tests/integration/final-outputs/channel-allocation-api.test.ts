/**
 * Integration tests for Channel Allocation Matrix API endpoints.
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
import channelAllocationRoutes from '../../../src/routes/final-outputs-channels.routes';
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
  app.use('/api/v1/final-outputs/channel-allocation', channelAllocationRoutes);
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

const AGENT_DECISIONS = [
  {
    id: 'decision-1',
    agent_type: 'paid_ads',
    decision_type: 'budget_recommendation',
    decision_data: {
      channel: 'Google',
      recommendation: 'Increase budget',
      risk_level: 'low',
    },
    confidence: 0.85,
    created_at: '2026-01-15T10:00:00Z',
  },
];

const BUDGET_ALLOCATIONS = [
  {
    id: 'budget-1',
    country_id: 'country-us',
    channel_allocations: { Google: 5000, Meta: 3000 },
    total_budget: 8000,
    total_spent: 6000,
    period_start: '2026-01-01',
    period_end: '2026-12-31',
  },
];

const CAMPAIGNS = [
  {
    id: 'campaign-1',
    country_id: 'country-us',
    platform: 'Google',
    budget: 5000,
    spent: 4000,
    impressions: 200000,
    clicks: 10000,
    conversions: 500,
    revenue: 20000,
    status: 'active',
  },
];

const COUNTRIES = [
  { id: 'country-us', code: 'US', name: 'United States' },
];

/**
 * Sets up mock DB responses for the full matrix generation flow.
 */
function setupMatrixMocks() {
  mockCacheGet.mockResolvedValue(null);
  mockPool.query.mockResolvedValueOnce({ rows: AGENT_DECISIONS, rowCount: 1 });
  mockPool.query.mockResolvedValueOnce({ rows: BUDGET_ALLOCATIONS, rowCount: 1 });
  mockPool.query.mockResolvedValueOnce({ rows: CAMPAIGNS, rowCount: 1 });
  mockPool.query.mockResolvedValueOnce({ rows: COUNTRIES, rowCount: 1 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Channel Allocation API Integration Tests', () => {
  const app = createApp();
  const testRequest = request(app);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/final-outputs/channel-allocation
  // =========================================================================

  describe('GET /api/v1/final-outputs/channel-allocation', () => {
    it('returns 200 with the full channel allocation matrix', async () => {
      const token = generateTestToken('admin');
      setupMatrixMocks();

      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.matrix).toBeInstanceOf(Array);
      expect(response.body.data.country_breakdown).toBeInstanceOf(Array);
      expect(typeof response.body.data.total_budget).toBe('number');
      expect(typeof response.body.data.confidence_score).toBe('number');
      expect(typeof response.body.data.generated_at).toBe('string');
    });

    it('returns 401 without authentication', async () => {
      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('returns matrix with correct channel data', async () => {
      const token = generateTestToken('admin');
      setupMatrixMocks();

      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const matrix = response.body.data.matrix;
      expect(matrix.length).toBeGreaterThan(0);

      // Each matrix entry should have the required fields
      for (const entry of matrix) {
        expect(entry).toHaveProperty('channel');
        expect(entry).toHaveProperty('budget_allocation_pct');
        expect(entry).toHaveProperty('expected_roas');
        expect(entry).toHaveProperty('cac_estimate');
        expect(entry).toHaveProperty('recommended_countries');
        expect(entry).toHaveProperty('priority_level');
        expect(entry).toHaveProperty('scaling_potential');
        expect(entry).toHaveProperty('risk_level');
      }
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/channel-allocation/:countryCode
  // =========================================================================

  describe('GET /api/v1/final-outputs/channel-allocation/:countryCode', () => {
    it('returns 200 with country-specific allocation data', async () => {
      const token = generateTestToken('admin');
      setupMatrixMocks();

      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation/US')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.country_code).toBe('US');
      expect(response.body.data.channels).toBeInstanceOf(Array);
    });

    it('returns 404 for a non-existent country code', async () => {
      const token = generateTestToken('admin');
      setupMatrixMocks();

      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation/XX')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // GET /api/v1/final-outputs/channel-allocation/history
  // =========================================================================

  describe('GET /api/v1/final-outputs/channel-allocation/history', () => {
    it('returns 200 with historical channel performance data', async () => {
      const token = generateTestToken('admin');
      mockCacheGet.mockResolvedValue(null);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            platform: 'Google',
            period: '2026-01',
            total_spend: '5000',
            total_revenue: '20000',
            total_conversions: '400',
            total_clicks: '8000',
            total_impressions: '150000',
          },
        ],
        rowCount: 1,
      });

      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation/history')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].channel).toBe('Google');
      expect(response.body.data[0].roas).toBe(4);
      expect(response.body.meta.count).toBe(1);
    });

    it('returns 401 without authentication for history', async () => {
      const response = await testRequest
        .get('/api/v1/final-outputs/channel-allocation/history')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});

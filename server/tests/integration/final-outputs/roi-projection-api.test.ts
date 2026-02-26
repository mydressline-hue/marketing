/**
 * Integration tests for ROI Projection API endpoints.
 *
 * Tests the full HTTP request/response cycle for ROI projection routes
 * with all dependencies mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
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

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { pool } from '../../../src/config/database';
import { authenticate } from '../../../src/middleware/auth';
import { asyncHandler } from '../../../src/middleware/errorHandler';
import { ROIProjectionOutputService } from '../../../src/services/final-outputs/ROIProjectionOutputService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Build test Express app with inline routes
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());

  const router = express.Router();

  router.get(
    '/final-outputs/roi-projection',
    authenticate,
    asyncHandler(async (_req, res) => {
      const result = await ROIProjectionOutputService.generateROIProjection();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/final-outputs/roi-projection/trend',
    authenticate,
    asyncHandler(async (_req, res) => {
      const result = await ROIProjectionOutputService.getROITrend();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/final-outputs/roi-projection/:countryCode',
    authenticate,
    asyncHandler(async (req, res) => {
      const result = await ROIProjectionOutputService.getROIByCountry(req.params.countryCode);
      res.json({ success: true, data: result });
    }),
  );

  app.use(API_PREFIX, router);

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(role = 'admin') {
  return jwt.sign(
    { id: 'user-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function makeCampaignRows() {
  return [
    {
      platform: 'google_ads',
      spend: '5000',
      conversions: '100',
      revenue: '15000',
      start_date: '2025-11-01',
      country_id: 'US',
    },
    {
      platform: 'meta',
      spend: '3000',
      conversions: '60',
      revenue: '9000',
      start_date: '2025-12-01',
      country_id: 'US',
    },
  ];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: express.Express;

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ROI Projection API Integration', () => {
  describe('GET /final-outputs/roi-projection', () => {
    it('should return full ROI projection with authentication', async () => {
      mockQuery.mockResolvedValueOnce({ rows: makeCampaignRows() });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // simulations
      mockQuery.mockResolvedValueOnce({ rows: [{ period: '2025-11', revenue: '15000' }, { period: '2025-12', revenue: '9000' }] }); // growth rate
      mockQuery.mockResolvedValueOnce({ rows: [{ period: '2025-11', revenue: '15000' }, { period: '2025-12', revenue: '9000' }] }); // monthly revenues
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '24000', total_spend: '8000', total_conversions: '160' }] }); // overall LTV/CAC
      mockQuery.mockResolvedValueOnce({ rows: [{ country_code: 'US', revenue: '24000', spend: '8000', conversions: '160' }] }); // country LTV/CAC

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('projections');
      expect(res.body.data).toHaveProperty('roi_summary');
      expect(res.body.data).toHaveProperty('ltv_cac_analysis');
      expect(res.body.data).toHaveProperty('channel_roi');
      expect(res.body.data).toHaveProperty('monthly_forecast');
      expect(res.body.data).toHaveProperty('confidence_score');
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /final-outputs/roi-projection/trend', () => {
    it('should return ROI trend data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { period: '2025-11', spend: '5000', revenue: '15000' },
          { period: '2025-12', spend: '3000', revenue: '9000' },
        ],
      });

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection/trend`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('trend');
      expect(res.body.data).toHaveProperty('direction');
      expect(res.body.data).toHaveProperty('avg_roi');
      expect(Array.isArray(res.body.data.trend)).toBe(true);
    });

    it('should reject unauthenticated trend requests', async () => {
      await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection/trend`)
        .expect(401);
    });
  });

  describe('GET /final-outputs/roi-projection/:countryCode', () => {
    it('should return country-specific ROI projection', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'US', name: 'United States' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'google_ads', spend: '5000', conversions: '100', revenue: '15000' },
        ],
      });

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection/US`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.country_code).toBe('US');
      expect(res.body.data).toHaveProperty('total_investment');
      expect(res.body.data).toHaveProperty('projected_revenue');
      expect(res.body.data).toHaveProperty('roi_pct');
      expect(res.body.data).toHaveProperty('ltv');
      expect(res.body.data).toHaveProperty('cac');
      expect(res.body.data).toHaveProperty('ltv_cac_ratio');
      expect(res.body.data).toHaveProperty('channel_roi');
    });

    it('should handle country with no data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'ZZ', name: 'Test Country' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`${API_PREFIX}/final-outputs/roi-projection/ZZ`)
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total_investment).toBe(0);
      expect(res.body.data.roi_pct).toBe(0);
    });
  });
});

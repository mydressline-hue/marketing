/**
 * E2E Channel Allocation Matrix Workflow Tests.
 *
 * Tests the full workflow through the HTTP layer:
 *   1.  Generate the full channel allocation matrix
 *   2.  Verify matrix structure and data integrity
 *   3.  Retrieve country-specific allocation
 *   4.  Retrieve historical channel performance
 *   5.  Verify optimization notes and confidence scoring
 *   6.  Verify authentication enforcement
 *   7.  Validate country breakdown channel entries
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

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import channelAllocationRoutes from '../../../src/routes/final-outputs-channels.routes';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

/**
 * Creates a minimal Express app with only the channel allocation routes,
 * matching the mount path used in the full application.
 */
function createWorkflowApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/final-outputs/channel-allocation',
    channelAllocationRoutes,
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateAdminToken(): string {
  return jwt.sign(
    {
      id: 'admin-user-001',
      email: 'admin@example.com',
      role: 'admin',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const AGENT_DECISIONS = [
  {
    id: 'decision-1',
    agent_type: 'paid_ads',
    decision_type: 'budget_recommendation',
    decision_data: {
      channel: 'Google',
      recommendation: 'Increase Google budget for Q1',
      risk_level: 'low',
      scaling_potential: 'scale up',
    },
    confidence: 0.9,
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'decision-2',
    agent_type: 'performance_analytics',
    decision_type: 'performance_review',
    decision_data: {
      channel: 'Meta',
      recommendation: 'Meta performing well in US market',
      risk_level: 'low',
      reasoning: 'Strong conversion rates observed',
    },
    confidence: 0.85,
    created_at: '2026-01-14T10:00:00Z',
  },
  {
    id: 'decision-3',
    agent_type: 'budget_optimization',
    decision_type: 'reallocation',
    decision_data: {
      channel: 'TikTok',
      recommendation: 'Consider TikTok for younger demographics',
      risk_level: 'medium',
      optimization_note: 'Test with small budget first',
    },
    confidence: 0.7,
    created_at: '2026-01-13T10:00:00Z',
  },
];

const BUDGET_ALLOCATIONS = [
  {
    id: 'budget-1',
    country_id: 'country-us',
    channel_allocations: { Google: 15000, Meta: 8000, TikTok: 3000 },
    total_budget: 26000,
    total_spent: 18000,
    period_start: '2026-01-01',
    period_end: '2026-12-31',
  },
  {
    id: 'budget-2',
    country_id: 'country-de',
    channel_allocations: { Google: 8000, Meta: 5000 },
    total_budget: 13000,
    total_spent: 9500,
    period_start: '2026-01-01',
    period_end: '2026-12-31',
  },
];

const CAMPAIGNS = [
  {
    id: 'campaign-1',
    country_id: 'country-us',
    platform: 'Google',
    budget: 15000,
    spent: 12000,
    impressions: 500000,
    clicks: 25000,
    conversions: 1500,
    revenue: 75000,
    status: 'active',
  },
  {
    id: 'campaign-2',
    country_id: 'country-us',
    platform: 'Meta',
    budget: 8000,
    spent: 7000,
    impressions: 300000,
    clicks: 15000,
    conversions: 800,
    revenue: 32000,
    status: 'active',
  },
  {
    id: 'campaign-3',
    country_id: 'country-de',
    platform: 'Google',
    budget: 8000,
    spent: 6500,
    impressions: 200000,
    clicks: 10000,
    conversions: 600,
    revenue: 30000,
    status: 'active',
  },
  {
    id: 'campaign-4',
    country_id: 'country-us',
    platform: 'TikTok',
    budget: 3000,
    spent: 2500,
    impressions: 180000,
    clicks: 8000,
    conversions: 200,
    revenue: 6000,
    status: 'paused',
  },
];

const COUNTRIES = [
  { id: 'country-us', code: 'US', name: 'United States' },
  { id: 'country-de', code: 'DE', name: 'Germany' },
];

const HISTORY_ROWS = [
  {
    platform: 'Google',
    period: '2026-01',
    total_spend: '18500',
    total_revenue: '105000',
    total_conversions: '2100',
    total_clicks: '35000',
    total_impressions: '700000',
  },
  {
    platform: 'Meta',
    period: '2026-01',
    total_spend: '7000',
    total_revenue: '32000',
    total_conversions: '800',
    total_clicks: '15000',
    total_impressions: '300000',
  },
  {
    platform: 'Google',
    period: '2025-12',
    total_spend: '16000',
    total_revenue: '90000',
    total_conversions: '1800',
    total_clicks: '30000',
    total_impressions: '600000',
  },
];

/**
 * Sets up mock DB responses for the full matrix generation flow.
 * The service issues 4 parallel queries:
 *   1. agent_decisions
 *   2. budget_allocations
 *   3. campaigns
 *   4. countries
 */
function setupMatrixMocks() {
  mockCacheGet.mockResolvedValue(null);
  mockPool.query.mockResolvedValueOnce({ rows: AGENT_DECISIONS, rowCount: 3 });
  mockPool.query.mockResolvedValueOnce({ rows: BUDGET_ALLOCATIONS, rowCount: 2 });
  mockPool.query.mockResolvedValueOnce({ rows: CAMPAIGNS, rowCount: 4 });
  mockPool.query.mockResolvedValueOnce({ rows: COUNTRIES, rowCount: 2 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Channel Allocation Matrix E2E Workflow', () => {
  const app = createWorkflowApp();
  const request = supertest(app);
  const adminToken = generateAdminToken();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('generates a full channel allocation matrix with correct structure', async () => {
    setupMatrixMocks();

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { data } = response.body;

    // Validate top-level structure
    expect(data.matrix).toBeInstanceOf(Array);
    expect(data.matrix.length).toBeGreaterThan(0);
    expect(data.country_breakdown).toBeInstanceOf(Array);
    expect(data.total_budget).toBe(39000); // 26000 + 13000
    expect(data.optimization_notes).toBeInstanceOf(Array);
    expect(data.optimization_notes.length).toBeGreaterThan(0);
    expect(data.confidence_score).toBeGreaterThan(0);
    expect(data.confidence_score).toBeLessThanOrEqual(1);
    expect(data.generated_at).toBeDefined();

    // Validate each channel entry has required fields
    for (const entry of data.matrix) {
      expect(typeof entry.channel).toBe('string');
      expect(typeof entry.budget_allocation_pct).toBe('number');
      expect(typeof entry.expected_roas).toBe('number');
      expect(typeof entry.cac_estimate).toBe('number');
      expect(entry.recommended_countries).toBeInstanceOf(Array);
      expect(['critical', 'high', 'medium', 'low', 'experimental']).toContain(
        entry.priority_level,
      );
      expect(['high', 'medium', 'low']).toContain(entry.scaling_potential);
      expect(['low', 'medium', 'high']).toContain(entry.risk_level);
    }
  });

  it('retrieves country-specific allocation for an active country', async () => {
    setupMatrixMocks();

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation/US')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { data } = response.body;

    expect(data.country_code).toBe('US');
    expect(data.channels).toBeInstanceOf(Array);
    expect(data.channels.length).toBeGreaterThan(0);

    // Validate channel entries for country
    for (const entry of data.channels) {
      expect(typeof entry.channel).toBe('string');
      expect(typeof entry.allocation_pct).toBe('number');
      expect(typeof entry.estimated_spend).toBe('number');
      expect(typeof entry.projected_conversions).toBe('number');
    }

    // US should have Google, Meta, and TikTok channels
    const channelNames = data.channels.map((c: { channel: string }) => c.channel);
    expect(channelNames).toContain('Google');
    expect(channelNames).toContain('Meta');
  });

  it('returns 404 for a country code without allocation data', async () => {
    setupMatrixMocks();

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation/ZZ')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('retrieves historical channel performance with computed ROAS', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockPool.query.mockResolvedValueOnce({
      rows: HISTORY_ROWS,
      rowCount: 3,
    });

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { data, meta } = response.body;

    expect(data).toBeInstanceOf(Array);
    expect(data).toHaveLength(3);
    expect(meta.count).toBe(3);

    // Verify Google Jan 2026 entry
    const googleJan = data.find(
      (d: { channel: string; period: string }) =>
        d.channel === 'Google' && d.period === '2026-01',
    );
    expect(googleJan).toBeDefined();
    expect(googleJan.spend).toBe(18500);
    expect(googleJan.revenue).toBe(105000);
    // ROAS: 105000 / 18500 = 5.675... rounded to 5.68
    expect(googleJan.roas).toBe(5.68);
    expect(googleJan.conversions).toBe(2100);
    expect(googleJan.clicks).toBe(35000);
    expect(googleJan.impressions).toBe(700000);
  });

  it('generates optimization notes from agent decisions', async () => {
    setupMatrixMocks();

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const notes = response.body.data.optimization_notes;

    expect(notes.length).toBeGreaterThan(0);
    // Verify some expected notes from our fixture data
    expect(notes).toContain('Increase Google budget for Q1');
    expect(notes).toContain('Meta performing well in US market');
    expect(notes).toContain('Test with small budget first');
  });

  it('correctly computes confidence score from agent decisions', async () => {
    setupMatrixMocks();

    const response = await request
      .get('/api/v1/final-outputs/channel-allocation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const confidence = response.body.data.confidence_score;

    // Average of 0.9, 0.85, 0.7 = 0.8166... rounded to 0.82
    expect(confidence).toBe(0.82);
  });

  it('denies access without authentication', async () => {
    await request
      .get('/api/v1/final-outputs/channel-allocation')
      .expect(401);

    await request
      .get('/api/v1/final-outputs/channel-allocation/US')
      .expect(401);

    await request
      .get('/api/v1/final-outputs/channel-allocation/history')
      .expect(401);
  });
});

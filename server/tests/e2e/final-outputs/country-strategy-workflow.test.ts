/**
 * E2E Country Strategy Workflow Tests.
 *
 * Tests the full workflow for generating marketing strategies per country:
 *   1. Generate strategies for all countries
 *   2. Generate strategy for a specific country
 *   3. Retrieve strategy summary
 *   4. Verify strategy data uses agent decisions when available
 *   5. Verify fallback behavior when no agent decisions exist
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
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import finalOutputsStrategyRoutes from '../../../src/routes/final-outputs-strategy.routes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(`${API}/final-outputs`, finalOutputsStrategyRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateToken(role: string = 'admin') {
  return jwt.sign(
    { id: 'e2e-user-id', email: 'e2e@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCountryUS = {
  id: 'c-us-001',
  name: 'United States',
  code: 'US',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: 21_000_000_000_000,
  internet_penetration: 90,
  ecommerce_adoption: 80,
  social_platforms: { google: 95, meta: 88, tiktok: 55, bing: 25, snapchat: 35 },
  ad_costs: { avg_cpm: 20, avg_cpc: 3.5, avg_cpa: 45 },
  cultural_behavior: { formality: 'casual', humor: 'appropriate', directness: 'direct' },
  opportunity_score: 88,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockCountryJP = {
  id: 'c-jp-001',
  name: 'Japan',
  code: 'JP',
  region: 'East Asia',
  language: 'Japanese',
  currency: 'JPY',
  timezone: 'Asia/Tokyo',
  gdp: 4_900_000_000_000,
  internet_penetration: 93,
  ecommerce_adoption: 82,
  social_platforms: { google: 85, meta: 40, tiktok: 50 },
  ad_costs: { avg_cpm: 12 },
  cultural_behavior: { formality: 'formal', directness: 'indirect' },
  opportunity_score: 80,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockAgentDecisionUS = {
  id: 'dec-us-001',
  agent_type: 'country_strategy',
  decision_type: 'country_strategy_generated',
  input_data: { parameters: { countryId: 'c-us-001' } },
  output_data: {
    brandPositioning: {
      positioning: 'Innovation-led brand for American digital consumers',
      differentiators: ['AI-powered personalization', 'Same-day delivery'],
      valueProposition: 'Cutting-edge products with unmatched convenience',
      competitiveAdvantage: 'Technology leadership and logistics network',
    },
    culturalTone: {
      formality: 'casual',
      humor: true,
      directness: 'direct',
      emotionalAppeal: 'individuality and convenience',
      colorPreferences: ['blue', 'red', 'white'],
      taboos: [],
    },
    priceSensitivity: 'low',
    messagingStyle: {
      primary: 'Direct value communication with bold, action-oriented copy',
      secondary: 'Data-driven social proof with specific metrics',
      callToAction: 'Get started now',
      avoidPhrases: [],
    },
    platformMix: {
      platforms: {
        google: { weight: 0.40, strategy: 'Primary search and shopping channel' },
        meta: { weight: 0.30, strategy: 'Social remarketing and lookalike audiences' },
        tiktok: { weight: 0.15, strategy: 'Gen Z brand engagement' },
        bing: { weight: 0.10, strategy: 'B2B supplement' },
        snapchat: { weight: 0.05, strategy: 'Awareness for younger demographics' },
      },
    },
    timeline: {
      phases: [
        { name: 'Research', duration: '3 weeks', actions: ['Market analysis', 'Competitor review'] },
        { name: 'Launch', duration: '4 weeks', actions: ['Launch Google campaigns', 'Deploy Meta ads'] },
        { name: 'Scale', duration: '8 weeks', actions: ['Expand to TikTok', 'Optimize ROAS'] },
      ],
    },
    risks: ['Market saturation', 'High ad costs'],
    recommendations: [
      'Launch Google campaigns first',
      'Invest in video creative for TikTok',
      'Set up conversion tracking early',
    ],
    confidence: { score: 90, level: 'very_high', factors: {} },
  },
  confidence_score: 0.9,
  reasoning: 'Comprehensive strategy generated for US market',
  is_approved: true,
  created_at: '2025-06-01T00:00:00Z',
  country_id: 'c-us-001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Country Strategy Workflow E2E Tests', () => {
  const app = createTestApp();
  const agent = request(app);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('generates strategies for all countries and returns structured results', async () => {
    const token = generateToken('admin');

    // Active countries query
    mockPool.query.mockResolvedValueOnce({
      rows: [mockCountryUS, mockCountryJP],
      rowCount: 2,
    });
    // Agent decisions query
    mockPool.query.mockResolvedValueOnce({
      rows: [mockAgentDecisionUS],
      rowCount: 1,
    });

    const response = await agent
      .get(`${API}/final-outputs/strategies`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const strategies = response.body.data;
    expect(strategies).toHaveLength(2);

    // Verify US strategy has agent-derived data
    const usStrategy = strategies.find(
      (s: any) => s.country_code === 'US',
    );
    expect(usStrategy).toBeDefined();
    expect(usStrategy.brand_positioning).toBe(
      'Innovation-led brand for American digital consumers',
    );
    expect(usStrategy.cultural_tone).toBe('casual, humor-friendly, direct');
    expect(usStrategy.price_sensitivity_level).toBe('low');
    expect(usStrategy.platform_mix.length).toBeGreaterThan(0);
    expect(usStrategy.platform_mix[0].platform).toBe('google');
    expect(usStrategy.platform_mix[0].allocation_pct).toBe(40);
    expect(usStrategy.key_risks).toContain('Market saturation');
    expect(usStrategy.recommended_actions).toContain(
      'Launch Google campaigns first',
    );
    expect(usStrategy.confidence_score).toBe(0.9);

    // Verify JP strategy uses fallback data (no agent decision)
    const jpStrategy = strategies.find(
      (s: any) => s.country_code === 'JP',
    );
    expect(jpStrategy).toBeDefined();
    expect(jpStrategy.brand_positioning).toContain('East Asia');
    expect(jpStrategy.cultural_tone).toBe('formal, indirect');
  });

  it('generates strategy for a single country with full detail', async () => {
    const token = generateToken('admin');

    // Fetch country by code
    mockPool.query.mockResolvedValueOnce({
      rows: [mockCountryUS],
      rowCount: 1,
    });
    // Agent decisions
    mockPool.query.mockResolvedValueOnce({
      rows: [mockAgentDecisionUS],
      rowCount: 1,
    });

    const response = await agent
      .get(`${API}/final-outputs/strategies/US`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const strategy = response.body.data;
    expect(strategy.country_code).toBe('US');
    expect(strategy.country_name).toBe('United States');

    // Verify all strategy fields are present and non-empty
    expect(strategy.brand_positioning).toBeTruthy();
    expect(strategy.cultural_tone).toBeTruthy();
    expect(strategy.price_sensitivity_level).toBeTruthy();
    expect(strategy.messaging_style).toBeTruthy();
    expect(strategy.platform_mix.length).toBeGreaterThan(0);
    expect(strategy.entry_strategy).toBeTruthy();
    expect(strategy.timeline_months).toBeGreaterThan(0);
    expect(strategy.confidence_score).toBeGreaterThan(0);

    // Verify platform mix has proper structure
    for (const platform of strategy.platform_mix) {
      expect(platform).toHaveProperty('platform');
      expect(platform).toHaveProperty('allocation_pct');
      expect(platform).toHaveProperty('rationale');
      expect(platform.allocation_pct).toBeGreaterThan(0);
    }
  });

  it('retrieves strategy summary with aggregated metrics', async () => {
    const token = generateToken('admin');

    // Fetch active countries (called by getStrategySummary -> generateStrategyPerCountry)
    mockPool.query.mockResolvedValueOnce({
      rows: [mockCountryUS, mockCountryJP],
      rowCount: 2,
    });
    // Agent decisions
    mockPool.query.mockResolvedValueOnce({
      rows: [mockAgentDecisionUS],
      rowCount: 1,
    });

    const response = await agent
      .get(`${API}/final-outputs/strategies/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const summary = response.body.data;

    expect(summary.total_countries).toBe(2);
    expect(summary.avg_confidence_score).toBeGreaterThan(0);
    expect(summary.price_sensitivity_distribution).toBeDefined();
    expect(Object.keys(summary.price_sensitivity_distribution).length).toBeGreaterThan(0);
    expect(summary.top_platforms.length).toBeGreaterThan(0);
    expect(summary.avg_timeline_months).toBeGreaterThan(0);
    expect(summary.generated_at).toBeDefined();

    // Verify top platforms have valid structure
    for (const p of summary.top_platforms) {
      expect(p).toHaveProperty('platform');
      expect(p).toHaveProperty('avg_allocation_pct');
      expect(p.avg_allocation_pct).toBeGreaterThan(0);
    }
  });

  it('handles country with no agent decision gracefully using fallback data', async () => {
    const token = generateToken('admin');

    // Fetch country by code
    mockPool.query.mockResolvedValueOnce({
      rows: [mockCountryJP],
      rowCount: 1,
    });
    // No agent decisions
    mockPool.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const response = await agent
      .get(`${API}/final-outputs/strategies/JP`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const strategy = response.body.data;

    // Verify fallback data is used
    expect(strategy.country_code).toBe('JP');
    expect(strategy.brand_positioning).toContain('East Asia');
    expect(strategy.cultural_tone).toBe('formal, indirect');
    // Fallback confidence should be computed from data completeness
    expect(strategy.confidence_score).toBeGreaterThan(0);
    expect(strategy.confidence_score).toBeLessThanOrEqual(70);
    // Platform mix should be derived from country social_platforms
    expect(strategy.platform_mix.length).toBeGreaterThan(0);
    // Timeline should use fallback
    expect(strategy.timeline_months).toBeGreaterThan(0);
  });

  it('returns 404 for an invalid country code', async () => {
    const token = generateToken('admin');

    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await agent
      .get(`${API}/final-outputs/strategies/XX`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('XX');
  });
});

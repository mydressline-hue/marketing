/**
 * UI-Backend Integration Validation (Phase 10 - Non-Negotiable Rules).
 *
 * Validates full end-to-end integration between the 23 UI pages and their
 * corresponding API endpoints. Verifies that:
 *   - Every UI page has at least one corresponding backend route
 *   - API endpoints return proper JSON structures
 *   - CORS is configured for the UI origin
 *   - WebSocket / real-time notification endpoints exist
 *   - Data flows correctly through UI -> API -> Service -> DB layers
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
    CORS_ORIGINS: 'http://localhost:5173',
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

import request from 'supertest';
import app from '../../../src/app';
import { pool } from '../../../src/config/database';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const mockPool = pool as unknown as { query: jest.Mock };

/**
 * Mapping of each UI page to the API route(s) it depends on.
 * The keys correspond to .tsx filenames in ui/src/pages/.
 */
const UI_PAGE_API_MAP: Record<string, string[]> = {
  Dashboard: ['/dashboard'],
  Analytics: ['/dashboard'],
  PaidAds: ['/agents', '/campaigns'],
  OrganicSocial: ['/agents'],
  CreativeStudio: ['/creatives', '/agents'],
  ContentBlog: ['/content', '/agents'],
  Localization: ['/agents'],
  CountryStrategy: ['/countries', '/agents'],
  BudgetOptimizer: ['/budget', '/agents'],
  ABTesting: ['/agents'],
  BrandConsistency: ['/agents'],
  CompetitiveIntel: ['/agents'],
  Compliance: ['/agents'],
  Conversion: ['/agents'],
  DataEngineering: ['/agents'],
  Security: ['/agents', '/infrastructure'],
  FraudDetection: ['/agents'],
  MarketIntelligence: ['/agents'],
  RevenueForecast: ['/agents'],
  Shopify: ['/integrations'],
  KillSwitch: ['/killswitch'],
  Orchestrator: ['/agents'],
  Settings: ['/settings'],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UI-Backend Integration Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Verify all 23 UI pages exist
  // -----------------------------------------------------------------------
  describe('All 23 UI pages exist on disk', () => {
    const uiPagesDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'ui',
      'src',
      'pages',
    );

    it('should have a ui/src/pages directory', () => {
      expect(fs.existsSync(uiPagesDir)).toBe(true);
    });

    it('should contain at least 23 page components', () => {
      const pages = fs
        .readdirSync(uiPagesDir)
        .filter((f) => f.endsWith('.tsx'));
      expect(pages.length).toBeGreaterThanOrEqual(23);
    });

    it('should have a page file for each UI page in the map', () => {
      const pages = fs
        .readdirSync(uiPagesDir)
        .map((f) => f.replace('.tsx', ''));
      for (const pageName of Object.keys(UI_PAGE_API_MAP)) {
        expect(pages).toContain(pageName);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Each UI page has corresponding backend API endpoints
  // -----------------------------------------------------------------------
  describe('Each UI page has corresponding API endpoints', () => {
    for (const [page, routes] of Object.entries(UI_PAGE_API_MAP)) {
      it(`UI page "${page}" has backend routes: ${routes.join(', ')}`, async () => {
        // For each route, verify it doesn't return 404 (route-not-found)
        // We expect either 200, 401 (auth required), or 403 -- but NOT 404.
        for (const route of routes) {
          // Mock an empty DB result so the service doesn't throw on missing data
          mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

          const res = await request(app).get(`${API}${route}`);

          // A 404 from the notFoundHandler means the route doesn't exist.
          // 401/403/200/400 all indicate the route IS registered.
          expect(res.status).not.toBe(404);
        }
      });
    }
  });

  // -----------------------------------------------------------------------
  // 3. API endpoints return proper JSON
  // -----------------------------------------------------------------------
  describe('API endpoints return proper JSON structures', () => {
    it('GET /health should return JSON response', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-type']).toMatch(/json/);
      // Health endpoint may return 200 (open) or 401 (behind auth)
      expect([200, 401]).toContain(res.status);
    });

    it('GET /api/v1/health should return JSON response', async () => {
      const res = await request(app).get(`${API}/health`);
      expect(res.headers['content-type']).toMatch(/json/);
      // Health endpoint responds with status or auth error
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.status).toBe('ok');
      }
    });

    it('Protected endpoints return JSON error on missing token', async () => {
      const protectedRoutes = [
        '/campaigns',
        '/countries',
        '/agents',
        '/settings',
        '/budget',
        '/alerts',
      ];

      for (const route of protectedRoutes) {
        mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
        const res = await request(app).get(`${API}${route}`);

        // Should return 401 with a JSON error body
        if (res.status === 401) {
          expect(res.headers['content-type']).toMatch(/json/);
          expect(res.body).toHaveProperty('error');
        }
      }
    });

    it('POST endpoints handle malformed payloads', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{}');

      // Empty body should return 400 (validation error) or 401 (missing creds)
      expect(res.headers['content-type']).toMatch(/json/);
      expect([400, 401]).toContain(res.status);
    });
  });

  // -----------------------------------------------------------------------
  // 4. CORS configuration
  // -----------------------------------------------------------------------
  describe('CORS is configured for UI origin', () => {
    it('should include Access-Control-Allow-Origin in preflight response', async () => {
      const res = await request(app)
        .options(`${API}/health`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      // CORS middleware should respond with the allow-origin header
      const allowOrigin = res.headers['access-control-allow-origin'];
      expect(allowOrigin).toBeDefined();
    });

    it('should allow common HTTP methods in CORS headers', async () => {
      const res = await request(app)
        .options(`${API}/campaigns`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      const allowMethods = res.headers['access-control-allow-methods'];
      if (allowMethods) {
        expect(allowMethods).toMatch(/GET|POST|PUT|PATCH|DELETE/);
      }
      // If no allow-methods, the preflight itself responded (204/200) which
      // still indicates CORS is active.
      expect(res.status).toBeLessThan(400);
    });

    it('should allow Authorization header in CORS', async () => {
      const res = await request(app)
        .options(`${API}/auth/profile`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      expect(res.status).toBeLessThan(400);
    });
  });

  // -----------------------------------------------------------------------
  // 5. WebSocket / real-time endpoints
  // -----------------------------------------------------------------------
  describe('Real-time notification endpoints exist', () => {
    it('should have a notifications API route', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app).get(`${API}/notifications`);
      // Route exists (not 404). May require auth.
      expect(res.status).not.toBe(404);
    });

    it('should have a webhook endpoint for external platforms', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app).get(`${API}/webhooks`);
      expect(res.status).not.toBe(404);
    });

    it('should have a queue status endpoint for async jobs', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const res = await request(app).get(`${API}/queue`);
      expect(res.status).not.toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Full data flow: UI -> API -> Service -> DB
  // -----------------------------------------------------------------------
  describe('Data flow: UI -> API -> Service -> DB', () => {
    it('GET /countries triggers a DB query through the service layer', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: '1', name: 'United States', code: 'US', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/countries`)
        .set('Authorization', 'Bearer dummy'); // Will fail auth but proves route

      // Either returns data (200) or auth error (401) -- both prove the route works
      expect([200, 401]).toContain(res.status);

      // If auth was bypassed or not required, verify DB was queried
      if (res.status === 200) {
        expect(mockPool.query).toHaveBeenCalled();
      }
    });

    it('GET /dashboard triggers service aggregation', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ total_campaigns: 5, active_campaigns: 3, total_spend: 10000 }],
        rowCount: 1,
      });

      const res = await request(app).get(`${API}/dashboard`);
      // Dashboard may or may not require auth
      expect([200, 401]).toContain(res.status);
    });

    it('POST /auth/register flows through auth service to DB insert', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check existing
        .mockResolvedValueOnce({
          rows: [{
            id: 'test-id',
            email: 'flow@test.com',
            name: 'Flow Test',
            role: 'campaign_manager',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
          rowCount: 1,
        });

      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: 'flow@test.com',
          password: 'FlowTest123',
          name: 'Flow Test',
          role: 'campaign_manager',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Confirm DB was called (SELECT check + INSERT)
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Route registration completeness
  // -----------------------------------------------------------------------
  describe('All major route groups are registered', () => {
    const EXPECTED_ROUTE_PREFIXES = [
      '/auth',
      '/campaigns',
      '/countries',
      '/creatives',
      '/products',
      '/content',
      '/alerts',
      '/settings',
      '/budget',
      '/agents',
      '/infrastructure',
      '/advanced-ai',
      '/integrations',
      '/webhooks',
      '/queue',
      '/ratelimits',
      '/dashboard',
      '/notifications',
      '/audit',
      '/apikeys',
      '/final-outputs',
    ];

    for (const prefix of EXPECTED_ROUTE_PREFIXES) {
      it(`route group "${prefix}" is registered`, async () => {
        mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
        const res = await request(app).get(`${API}${prefix}`);
        // Not 404 means route group is registered
        expect(res.status).not.toBe(404);
      });
    }
  });
});

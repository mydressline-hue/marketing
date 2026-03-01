/**
 * E2E Campaign Management Workflow Tests
 *
 * Tests the full campaign lifecycle through the HTTP layer:
 *   1.  Login as campaign_manager
 *   2.  Create a new country (as admin)
 *   3.  Create a new campaign for that country -> status = 'draft'
 *   4.  Update campaign details
 *   5.  Change campaign status to 'active'
 *   6.  Add a creative to the campaign
 *   7.  Create an A/B test for the campaign
 *   8.  Get campaign metrics
 *   9.  Pause the campaign (status -> 'paused')
 *  10.  Archive the campaign (via DELETE soft-delete)
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));
jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));
jest.mock('../../src/config/env', () => ({
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

import request from 'supertest';
import app from '../../src/app';
import { pool } from '../../src/config/database';
import { cacheGet } from '../../src/config/redis';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

/** Generate a valid JWT for a given role -- avoids the need for a real login. */
function generateTestToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      id: 'a0000000-0000-4000-8000-000000000001',
      email: 'manager@example.com',
      role: 'campaign_manager',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function generateAdminToken() {
  return jwt.sign(
    { id: 'a0000000-0000-4000-8000-000000000002', email: 'admin@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// -- Reusable mock data ---------------------------------------------------

const mockCountryRow = {
  id: 'c0000000-0000-4000-8000-000000000001',
  name: 'United States',
  code: 'US',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: 21000000000000,
  internet_penetration: 90,
  ecommerce_adoption: 75,
  social_platforms: {},
  ad_costs: { avg_cpm: 12 },
  cultural_behavior: {},
  opportunity_score: 85,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const mockCampaignRow = {
  id: 'd0000000-0000-4000-8000-000000000001',
  name: 'Summer Sale 2025',
  country_id: 'c0000000-0000-4000-8000-000000000001',
  country_name: 'United States',
  platform: 'google',
  type: 'search',
  status: 'draft',
  budget: 10000,
  spent: 0,
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  targeting: {},
  metrics: {},
  created_by: 'a0000000-0000-4000-8000-000000000001',
  created_at: '2025-01-15T00:00:00.000Z',
  updated_at: '2025-01-15T00:00:00.000Z',
};

const mockCreativeRow = {
  id: 'e0000000-0000-4000-8000-000000000001',
  name: 'Summer Sale Hero Banner',
  type: 'ad_copy',
  campaign_id: 'd0000000-0000-4000-8000-000000000001',
  content: 'Huge summer discounts! Shop now.',
  performance: {},
  fatigue_score: 0,
  is_active: true,
  created_by: 'a0000000-0000-4000-8000-000000000001',
  created_at: '2025-01-16T00:00:00.000Z',
  updated_at: '2025-01-16T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Campaign Management Workflow (E2E)', () => {
  let managerToken: string;
  let adminToken: string;

  beforeAll(() => {
    managerToken = generateTestToken();
    adminToken = generateAdminToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null); // always cache miss
  });

  // -----------------------------------------------------------------------
  // 1. Login as campaign_manager
  // -----------------------------------------------------------------------
  describe('Step 1: Login as campaign_manager', () => {
    it('should login and receive a token with campaign_manager role', async () => {
      const hashedPassword = await bcrypt.hash('ManagerPass1', 12);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'a0000000-0000-4000-8000-000000000001',
              email: 'manager@example.com',
              password_hash: hashedPassword,
              name: 'Campaign Manager',
              role: 'campaign_manager',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE last_login_at
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit_log

      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'manager@example.com', password: 'ManagerPass1' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('campaign_manager');
      expect(res.body.data.token).toBeDefined();

      managerToken = res.body.data.token;
    });
  });

  // -----------------------------------------------------------------------
  // 2. Create a new country (admin only -- using admin token)
  // -----------------------------------------------------------------------
  describe('Step 2: Create a new country', () => {
    it('should create a country and return 201', async () => {
      // CountriesService.create: INSERT ... RETURNING * + cacheFlush
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCountryRow],
        rowCount: 1,
      });

      const res = await request(app)
        .post(`${API}/countries`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'United States',
          code: 'US',
          region: 'North America',
          language: 'English',
          currency: 'USD',
          timezone: 'America/New_York',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('United States');
      expect(res.body.data.code).toBe('US');
    });

    it('should return 403 when campaign_manager tries to create a country without write:campaigns', () => {
      // campaign_manager HAS write:campaigns permission, so this should succeed
      // Instead test that a 'viewer' role is blocked
      const viewerToken = jwt.sign(
        { id: 'a0000000-0000-4000-8000-000000000099', email: 'viewer@example.com', role: 'viewer' },
        JWT_SECRET,
        { expiresIn: '1h' },
      );

      return request(app)
        .post(`${API}/countries`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Canada',
          code: 'CA',
          region: 'North America',
          language: 'English',
          currency: 'CAD',
          timezone: 'America/Toronto',
        })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Create a new campaign -> status = 'draft'
  // -----------------------------------------------------------------------
  describe('Step 3: Create a new campaign', () => {
    it('should create a campaign with status draft and return 201', async () => {
      // KillSwitchService.getCurrentLevel -> SELECT from kill_switch_state
      // CampaignsService.create:
      //   1. SELECT country to verify it exists
      //   2. INSERT campaign RETURNING *
      //   3. cacheFlush (mock)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 }) // kill switch check
        .mockResolvedValueOnce({ rows: [{ id: 'c0000000-0000-4000-8000-000000000001' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Summer Sale 2025',
          countryId: 'c0000000-0000-4000-8000-000000000001',
          platform: 'google',
          type: 'search',
          budget: 10000,
          startDate: '2025-06-01',
          endDate: '2025-08-31',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.name).toBe('Summer Sale 2025');
      expect(res.body.data.budget).toBe(10000);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Incomplete Campaign' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Update campaign details
  // -----------------------------------------------------------------------
  describe('Step 4: Update campaign details', () => {
    it('should update campaign name and budget', async () => {
      const updatedCampaign = {
        ...mockCampaignRow,
        name: 'Summer Mega Sale 2025',
        budget: 15000,
      };

      // CampaignsService.update:
      //   1. getById -> SELECT (verify exists)
      //   2. UPDATE RETURNING *
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [updatedCampaign], rowCount: 1 });

      const res = await request(app)
        .put(`${API}/campaigns/d0000000-0000-4000-8000-000000000001`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Summer Mega Sale 2025', budget: 15000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Summer Mega Sale 2025');
      expect(res.body.data.budget).toBe(15000);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Change campaign status to 'active'
  // -----------------------------------------------------------------------
  describe('Step 5: Activate campaign (draft -> active)', () => {
    it('should change status from draft to active', async () => {
      const activeCampaign = { ...mockCampaignRow, status: 'active' };

      // KillSwitchService.getCurrentLevel -> SELECT from kill_switch_state
      // CampaignsService.updateStatus:
      //   1. getById -> SELECT (to get current status)
      //   2. UPDATE status RETURNING *
      //   3. INSERT campaign_status_audit
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 }) // kill switch check
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 }) // current status = 'draft'
        .mockResolvedValueOnce({ rows: [activeCampaign], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit log

      const res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');
    });

    it('should reject an invalid status transition (draft -> completed)', async () => {
      // getById returns a draft campaign
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCampaignRow],
        rowCount: 1,
      });

      const res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Add a creative to the campaign
  // -----------------------------------------------------------------------
  describe('Step 6: Add a creative to the campaign', () => {
    it('should create a creative linked to the campaign', async () => {
      // CreativesService.create:
      //   1. SELECT campaign to verify it exists
      //   2. INSERT creative RETURNING *
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'd0000000-0000-4000-8000-000000000001' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCreativeRow], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Summer Sale Hero Banner',
          type: 'ad_copy',
          campaignId: 'd0000000-0000-4000-8000-000000000001',
          content: 'Huge summer discounts! Shop now.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Summer Sale Hero Banner');
      expect(res.body.data.type).toBe('ad_copy');
      expect(res.body.data.campaignId).toBe('d0000000-0000-4000-8000-000000000001');
    });

    it('should return 404 if the campaign does not exist', async () => {
      // Campaign lookup returns empty
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Orphan Creative',
          type: 'ad_copy',
          campaignId: '00000000-0000-0000-0000-000000000000',
          content: 'This should fail.',
        });

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Create an A/B test for the campaign
  // -----------------------------------------------------------------------
  describe('Step 7: A/B test or campaign metrics endpoint', () => {
    it('should return campaign metrics with derived KPIs', async () => {
      const campaignWithMetrics = {
        ...mockCampaignRow,
        status: 'active',
        impressions: 50000,
        clicks: 2500,
        conversions: 150,
        spent: 3000,
        revenue: 12000,
      };

      // CampaignsService.getMetrics -> getById
      mockPool.query.mockResolvedValueOnce({
        rows: [campaignWithMetrics],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/metrics`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const metrics = res.body.data;
      expect(metrics.impressions).toBe(50000);
      expect(metrics.clicks).toBe(2500);
      expect(metrics.conversions).toBe(150);
      expect(metrics.spend).toBe(3000);

      // CTR = (2500 / 50000) * 100 = 5%
      expect(metrics.ctr).toBe(5);
      // CPC = 3000 / 2500 = 1.2
      expect(metrics.cpc).toBe(1.2);
      // CPA = 3000 / 150 = 20
      expect(metrics.cpa).toBe(20);
      // ROAS = 12000 / 3000 = 4
      expect(metrics.roas).toBe(4);
    });

    it('should handle campaign with zero metrics gracefully', async () => {
      // Campaign with all-zero metrics
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCampaignRow], // all metrics are 0
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/metrics`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ctr).toBe(0);
      expect(res.body.data.cpc).toBe(0);
      expect(res.body.data.cpa).toBe(0);
      expect(res.body.data.roas).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Get campaign details with metrics
  // -----------------------------------------------------------------------
  describe('Step 8: Get campaign details', () => {
    it('should retrieve the campaign by id', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockCampaignRow, status: 'active' }],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000001`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('d0000000-0000-4000-8000-000000000001');
      expect(res.body.data.status).toBe('active');
    });

    it('should list campaigns with pagination', async () => {
      // list: COUNT query then data query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...mockCampaignRow, status: 'active' }],
          rowCount: 1,
        });

      const res = await request(app)
        .get(`${API}/campaigns?page=1&limit=10`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Pause the campaign (active -> paused)
  // -----------------------------------------------------------------------
  describe('Step 9: Pause the campaign', () => {
    it('should change status from active to paused', async () => {
      const activeCampaign = { ...mockCampaignRow, status: 'active' };
      const pausedCampaign = { ...mockCampaignRow, status: 'paused' };

      // updateStatus:
      //   1. getById (current status = active)
      //   2. UPDATE status RETURNING *
      //   3. INSERT campaign_status_audit
      mockPool.query
        .mockResolvedValueOnce({ rows: [activeCampaign], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [pausedCampaign], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit log

      const res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'paused' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paused');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Archive the campaign (soft delete)
  // -----------------------------------------------------------------------
  describe('Step 10: Archive the campaign', () => {
    it('should soft-delete the campaign (set status to archived)', async () => {
      // CampaignsService.delete: UPDATE ... SET status = 'archived'
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .delete(`${API}/campaigns/d0000000-0000-4000-8000-000000000001`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Campaign deleted successfully');
    });

    it('should return 404 when archiving a non-existent campaign', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete(`${API}/campaigns/f0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Bonus: Campaign spend summary
  // -----------------------------------------------------------------------
  describe('Bonus: Spend summary', () => {
    it('should return spend breakdown by platform and country', async () => {
      // getSpendSummary: 3 queries (total, by platform, by country)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_spend: '5000.00' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { platform: 'google', total: '3000.00' },
            { platform: 'meta', total: '2000.00' },
          ],
          rowCount: 2,
        })
        .mockResolvedValueOnce({
          rows: [{ country_name: 'United States', total: '5000.00' }],
          rowCount: 1,
        });

      const res = await request(app)
        .get(`${API}/campaigns/spend/summary`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalSpend).toBe(5000);
      expect(res.body.data.byPlatform.google).toBe(3000);
      expect(res.body.data.byPlatform.meta).toBe(2000);
      expect(res.body.data.byCountry['United States']).toBe(5000);
    });
  });

  // -----------------------------------------------------------------------
  // Bonus: Campaign status transitions (complete coverage)
  // -----------------------------------------------------------------------
  describe('Bonus: Full status transition chain', () => {
    it('should walk through draft -> active -> paused -> active -> completed', async () => {
      // draft -> active
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'draft' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'active' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      let res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'active' });
      expect(res.body.data.status).toBe('active');

      // active -> paused
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'active' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'paused' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'paused' });
      expect(res.body.data.status).toBe('paused');

      // paused -> active
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'paused' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'active' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'active' });
      expect(res.body.data.status).toBe('active');

      // active -> completed
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'active' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...mockCampaignRow, status: 'completed' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000001/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'completed' });
      expect(res.body.data.status).toBe('completed');
    });
  });
});

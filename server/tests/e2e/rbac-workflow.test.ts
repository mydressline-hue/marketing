/**
 * E2E Role-Based Access Control (RBAC) Workflow Tests
 *
 * Tests that different roles have the correct permissions:
 *   1. admin     -> can create/update/delete campaigns, manage settings, create API keys
 *   2. campaign_manager -> can create campaigns but NOT system settings
 *   3. analyst   -> can read campaigns but NOT write them
 *   4. viewer    -> read-only access (no write operations)
 *   5. API key creation (admin only)
 *   6. Audit logs are created for all actions
 *
 * Role permission map (from src/middleware/rbac.ts):
 *   admin:            ['*']
 *   campaign_manager: ['read:*', 'write:campaigns', 'write:creatives', 'write:content', 'write:budget', 'write:ab_tests']
 *   analyst:          ['read:*', 'write:reports', 'write:analytics', 'read:campaigns', 'read:agents']
 *   viewer:           ['read:*']
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
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

/** Generate a signed JWT for any role. */
function tokenForRole(role: string, userId = `b0000000-0000-4000-8000-00000000${role.length.toString().padStart(4, '0')}`) {
  return jwt.sign(
    { id: userId, email: `${role}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// -- Tokens for each role --------------------------------------------------

const adminToken = tokenForRole('admin');
const managerToken = tokenForRole('campaign_manager');
const analystToken = tokenForRole('analyst');
const viewerToken = tokenForRole('viewer');

// -- Reusable mock data ---------------------------------------------------

const mockCampaignRow = {
  id: 'd0000000-0000-4000-8000-000000000099',
  name: 'RBAC Test Campaign',
  country_id: 'c0000000-0000-4000-8000-000000000001',
  country_name: 'United States',
  platform: 'meta',
  type: 'awareness',
  status: 'draft',
  budget: 5000,
  spent: 0,
  start_date: '2025-07-01',
  end_date: '2025-09-30',
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  targeting: {},
  metrics: {},
  created_by: 'b0000000-0000-4000-8000-000000000005',
  created_at: '2025-02-01T00:00:00.000Z',
  updated_at: '2025-02-01T00:00:00.000Z',
};

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
  ad_costs: {},
  cultural_behavior: {},
  opportunity_score: 85,
  entry_strategy: null,
  is_active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const newCampaignPayload = {
  name: 'RBAC Test Campaign',
  countryId: 'c0000000-0000-4000-8000-000000000001',
  platform: 'meta',
  type: 'awareness',
  budget: 5000,
  startDate: '2025-07-01',
  endDate: '2025-09-30',
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RBAC Workflow (E2E)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =======================================================================
  // 1. ADMIN -- full access
  // =======================================================================
  describe('Step 1: Admin has full access', () => {
    it('should allow admin to CREATE a campaign', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 }) // kill switch check
        .mockResolvedValueOnce({ rows: [{ id: 'c0000000-0000-4000-8000-000000000001' }], rowCount: 1 }) // country exists
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });     // INSERT campaign

      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newCampaignPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin to UPDATE a campaign', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 }) // getById
        .mockResolvedValueOnce({
          rows: [{ ...mockCampaignRow, name: 'Updated by Admin' }],
          rowCount: 1,
        });

      const res = await request(app)
        .put(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated by Admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated by Admin');
    });

    it('should allow admin to DELETE (archive) a campaign', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .delete(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Campaign deleted successfully');
    });

    it('should allow admin to READ campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin to access system settings (GET /settings)', async () => {
      // SettingsService.getAll
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'site_name', value: 'AI Growth Engine' },
          { key: 'maintenance_mode', value: 'false' },
        ],
        rowCount: 2,
      });

      const res = await request(app)
        .get(`${API}/settings`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin to update system settings (PUT /settings/:key)', async () => {
      // SettingsService.set
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .put(`${API}/settings/maintenance_mode`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin to create a country', async () => {
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
    });
  });

  // =======================================================================
  // 2. CAMPAIGN_MANAGER -- can write campaigns but NOT system settings
  // =======================================================================
  describe('Step 2: Campaign Manager permissions', () => {
    it('should allow campaign_manager to CREATE campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 }) // kill switch check
        .mockResolvedValueOnce({ rows: [{ id: 'c0000000-0000-4000-8000-000000000001' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send(newCampaignPayload);

      expect(res.status).toBe(201);
    });

    it('should allow campaign_manager to UPDATE campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...mockCampaignRow, budget: 8000 }],
          rowCount: 1,
        });

      const res = await request(app)
        .put(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ budget: 8000 });

      expect(res.status).toBe(200);
    });

    it('should allow campaign_manager to DELETE (archive) campaigns', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .delete(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow campaign_manager to READ campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/campaigns`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow campaign_manager to create creatives (write:creatives)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'd0000000-0000-4000-8000-000000000099' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'e0000000-0000-4000-8000-000000000001',
              name: 'Manager Creative',
              type: 'ad_copy',
              campaign_id: 'd0000000-0000-4000-8000-000000000099',
              content: 'Test content',
              performance: {},
              fatigue_score: 0,
              is_active: true,
              created_by: 'b0000000-0000-4000-8000-000000000016',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        });

      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Manager Creative',
          type: 'ad_copy',
          campaignId: 'd0000000-0000-4000-8000-000000000099',
          content: 'Test content',
        });

      expect(res.status).toBe(201);
    });

    it('should DENY campaign_manager access to GET /settings (admin only)', async () => {
      const res = await request(app)
        .get(`${API}/settings`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should DENY campaign_manager access to PUT /settings/:key (admin only)', async () => {
      const res = await request(app)
        .put(`${API}/settings/maintenance_mode`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ value: 'true' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =======================================================================
  // 3. ANALYST -- read access, no campaign writes
  // =======================================================================
  describe('Step 3: Analyst permissions', () => {
    it('should allow analyst to READ campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/campaigns`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow analyst to READ a single campaign', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCampaignRow],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow analyst to READ campaign metrics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...mockCampaignRow, impressions: 1000, clicks: 50, conversions: 5, spent: 200, revenue: 500 }],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000099/metrics`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.impressions).toBe(1000);
    });

    it('should allow analyst to READ countries', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCountryRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/countries`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(200);
    });

    it('should DENY analyst from CREATING campaigns (no write:campaigns)', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send(newCampaignPayload);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should DENY analyst from UPDATING campaigns', async () => {
      const res = await request(app)
        .put(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ name: 'Analyst Override Attempt' });

      expect(res.status).toBe(403);
    });

    it('should DENY analyst from DELETING campaigns', async () => {
      const res = await request(app)
        .delete(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(403);
    });

    it('should DENY analyst from creating creatives (no write:creatives)', async () => {
      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          name: 'Analyst Creative',
          type: 'ad_copy',
          campaignId: 'd0000000-0000-4000-8000-000000000099',
          content: 'Should be denied.',
        });

      expect(res.status).toBe(403);
    });

    it('should DENY analyst from creating countries (no write:campaigns)', async () => {
      const res = await request(app)
        .post(`${API}/countries`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          name: 'France',
          code: 'FR',
          region: 'Europe',
          language: 'French',
          currency: 'EUR',
          timezone: 'Europe/Paris',
        });

      expect(res.status).toBe(403);
    });

    it('should DENY analyst from accessing system settings', async () => {
      const res = await request(app)
        .get(`${API}/settings`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =======================================================================
  // 4. VIEWER -- read-only access
  // =======================================================================
  describe('Step 4: Viewer permissions (read-only)', () => {
    it('should allow viewer to READ campaigns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/campaigns`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow viewer to READ a single campaign', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [mockCampaignRow],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow viewer to READ countries', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockCountryRow], rowCount: 1 });

      const res = await request(app)
        .get(`${API}/countries`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it('should allow viewer to READ creatives', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get(`${API}/creatives`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it('should DENY viewer from CREATING campaigns', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(newCampaignPayload);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should DENY viewer from UPDATING campaigns', async () => {
      const res = await request(app)
        .put(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Viewer Override Attempt' });

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from DELETING campaigns', async () => {
      const res = await request(app)
        .delete(`${API}/campaigns/d0000000-0000-4000-8000-000000000099`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from creating creatives', async () => {
      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Viewer Creative',
          type: 'ad_copy',
          campaignId: 'd0000000-0000-4000-8000-000000000099',
          content: 'Should be denied.',
        });

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from creating countries', async () => {
      const res = await request(app)
        .post(`${API}/countries`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Germany',
          code: 'DE',
          region: 'Europe',
          language: 'German',
          currency: 'EUR',
          timezone: 'Europe/Berlin',
        });

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from changing campaign status', async () => {
      const res = await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000099/status`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: 'active' });

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from accessing system settings', async () => {
      const res = await request(app)
        .get(`${API}/settings`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =======================================================================
  // 5. API key creation (admin only)
  // =======================================================================
  describe('Step 5: API key management (admin only)', () => {
    it('should allow admin to view API key configuration', async () => {
      // SettingsService.getApiKeyConfig makes 6 SettingsService.get() calls:
      //   1. shopify_api_key
      //   2-6. platform_google_ads, platform_meta_ads, platform_tiktok_ads, platform_shopify, platform_klaviyo
      // Each does a pool.query that returns { rows: [] } (not configured)
      for (let i = 0; i < 6; i++) {
        mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      }

      const res = await request(app)
        .get(`${API}/settings/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should DENY campaign_manager from viewing API key configuration', async () => {
      const res = await request(app)
        .get(`${API}/settings/api-keys`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });

    it('should DENY analyst from viewing API key configuration', async () => {
      const res = await request(app)
        .get(`${API}/settings/api-keys`)
        .set('Authorization', `Bearer ${analystToken}`);

      expect(res.status).toBe(403);
    });

    it('should DENY viewer from viewing API key configuration', async () => {
      const res = await request(app)
        .get(`${API}/settings/api-keys`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =======================================================================
  // 6. Audit logs are created for actions
  // =======================================================================
  describe('Step 6: Audit log verification', () => {
    it('should insert audit log on login', async () => {
      const bcryptLib = require('bcryptjs');
      const hashedPassword = await bcryptLib.hash('AdminPass1', 12);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'b0000000-0000-4000-8000-000000000005',
              email: 'admin@example.com',
              password_hash: hashedPassword,
              name: 'Admin User',
              role: 'admin',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE last_login_at
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit_log

      await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'admin@example.com', password: 'AdminPass1' });

      // Verify an audit log INSERT was called with 'LOGIN' action
      const auditCalls = mockPool.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO audit_logs') &&
          Array.isArray(call[1]) &&
          call[1].includes('LOGIN'),
      );
      expect(auditCalls.length).toBe(1);
    });

    it('should insert audit log on logout', async () => {
      // Logout with a valid admin token
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit_log

      await request(app)
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${adminToken}`);

      const auditCalls = mockPool.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO audit_logs') &&
          Array.isArray(call[1]) &&
          call[1].includes('LOGOUT'),
      );
      expect(auditCalls.length).toBe(1);
    });

    it('should insert campaign_status_audit log on status change', async () => {
      const activeCampaign = { ...mockCampaignRow, status: 'active' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ max_level: 0 }], rowCount: 1 }) // kill switch check
        .mockResolvedValueOnce({ rows: [mockCampaignRow], rowCount: 1 }) // getById (draft)
        .mockResolvedValueOnce({ rows: [activeCampaign], rowCount: 1 }) // UPDATE status
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT campaign_status_audit

      await request(app)
        .patch(`${API}/campaigns/d0000000-0000-4000-8000-000000000099/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      // Verify that campaign_status_audit was called
      const statusAuditCalls = mockPool.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO campaign_status_audit'),
      );
      expect(statusAuditCalls.length).toBe(1);

      // Verify the audit contains the correct transition
      const auditParams = statusAuditCalls[0][1];
      expect(auditParams).toContain('draft');   // previous_status
      expect(auditParams).toContain('active');  // new_status
    });
  });

  // =======================================================================
  // Bonus: Unauthenticated access is always denied
  // =======================================================================
  describe('Bonus: Unauthenticated requests are always denied', () => {
    it('should return 401 for GET /campaigns without token', async () => {
      const res = await request(app).get(`${API}/campaigns`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for POST /campaigns without token', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .send(newCampaignPayload);
      expect(res.status).toBe(401);
    });

    it('should return 401 for GET /countries without token', async () => {
      const res = await request(app).get(`${API}/countries`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for GET /settings without token', async () => {
      const res = await request(app).get(`${API}/settings`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for POST /creatives without token', async () => {
      const res = await request(app)
        .post(`${API}/creatives`)
        .send({
          name: 'Unauthenticated Creative',
          type: 'ad_copy',
          campaignId: 'd0000000-0000-4000-8000-000000000099',
          content: 'Should be denied.',
        });
      expect(res.status).toBe(401);
    });
  });

  // =======================================================================
  // Bonus: Permission boundary -- role-specific edge cases
  // =======================================================================
  describe('Bonus: Permission boundary edge cases', () => {
    it('should DENY campaign_manager from modifying settings via PUT /settings/:key', async () => {
      const res = await request(app)
        .put(`${API}/settings/some_key`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ value: 'hacked' });

      expect(res.status).toBe(403);
    });

    it('should ALLOW campaign_manager to update notification preferences', async () => {
      // Notification settings are available to any authenticated user
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .put(`${API}/settings/notifications`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ email: true, push: false });

      expect(res.status).toBe(200);
    });

    it('should ALLOW viewer to update their appearance preferences', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .put(`${API}/settings/appearance`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ theme: 'dark', language: 'en' });

      expect(res.status).toBe(200);
    });

    it('should handle unknown roles gracefully (deny all writes)', async () => {
      const unknownRoleToken = jwt.sign(
        { id: 'b0000000-0000-4000-8000-000000000099', email: 'unknown@example.com', role: 'unknown_role' },
        JWT_SECRET,
        { expiresIn: '1h' },
      );

      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${unknownRoleToken}`)
        .send(newCampaignPayload);

      expect(res.status).toBe(403);
    });

    it('should handle unknown roles gracefully (deny reads that require specific roles)', async () => {
      const unknownRoleToken = jwt.sign(
        { id: 'b0000000-0000-4000-8000-000000000099', email: 'unknown@example.com', role: 'unknown_role' },
        JWT_SECRET,
        { expiresIn: '1h' },
      );

      const res = await request(app)
        .get(`${API}/settings`)
        .set('Authorization', `Bearer ${unknownRoleToken}`);

      expect(res.status).toBe(403);
    });
  });
});

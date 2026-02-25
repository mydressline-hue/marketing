/**
 * Integration tests for Campaigns API endpoints.
 *
 * Tests the full HTTP request/response cycle through Express using supertest,
 * with all database and Redis dependencies mocked via the shared test setup
 * helper.
 */

import {
  createTestApp,
  generateTestToken,
  mockPool,
  mockCache,
} from '../../helpers/setup';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const app = createTestApp();
const request = supertest(app);

// Shared test data
const TEST_CAMPAIGN = {
  id: 'campaign-uuid-1234',
  name: 'Summer Sale US',
  country_id: 'country-uuid-1234',
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
  created_by: 'test-user-id-1234',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const TEST_CAMPAIGN_ACTIVE = {
  ...TEST_CAMPAIGN,
  id: 'campaign-uuid-5678',
  name: 'Winter Promo DE',
  status: 'active',
  spent: 2500,
  impressions: 50000,
  clicks: 1200,
  conversions: 85,
  revenue: 8500,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Campaigns API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure cacheGet always returns null so we hit the DB mocks
    mockCache.cacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/campaigns
  // =========================================================================

  describe('GET /api/v1/campaigns', () => {
    it('returns 200 with paginated list of campaigns', async () => {
      const token = generateTestToken('admin');

      // Mock: COUNT query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '2' }],
        rowCount: 1,
      });
      // Mock: SELECT campaigns with JOIN
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_CAMPAIGN, TEST_CAMPAIGN_ACTIVE],
        rowCount: 2,
      });

      const response = await request
        .get('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.totalPages).toBe(1);
      expect(response.body.data[0].name).toBe('Summer Sale US');
      expect(response.body.data[1].name).toBe('Winter Promo DE');
    });

    it('returns 401 without authentication', async () => {
      const response = await request
        .get('/api/v1/campaigns')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 200 with empty list when no campaigns exist', async () => {
      const token = generateTestToken('admin');

      // Mock: COUNT query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1,
      });
      // Mock: SELECT → empty
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/v1/campaigns/:id
  // =========================================================================

  describe('GET /api/v1/campaigns/:id', () => {
    it('returns 200 with campaign data', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT campaign by id with JOIN
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_CAMPAIGN],
        rowCount: 1,
      });

      const response = await request
        .get(`/api/v1/campaigns/${TEST_CAMPAIGN.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('Summer Sale US');
      expect(response.body.data.platform).toBe('google');
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.budget).toBe(10000);
    });

    it('returns 404 for non-existent campaign', async () => {
      const token = generateTestToken('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // Mock: SELECT campaign → no rows
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get(`/api/v1/campaigns/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // POST /api/v1/campaigns
  // =========================================================================

  describe('POST /api/v1/campaigns', () => {
    const newCampaignPayload = {
      name: 'Black Friday Campaign',
      countryId: '11111111-1111-1111-1111-111111111111',
      platform: 'meta',
      type: 'social',
      budget: 25000,
      startDate: '2025-11-20',
      endDate: '2025-12-01',
    };

    it('returns 201 with status draft', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT country (validate exists)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: newCampaignPayload.countryId }],
        rowCount: 1,
      });

      // Mock: INSERT campaign
      const createdCampaign = {
        ...TEST_CAMPAIGN,
        id: 'new-campaign-uuid',
        name: 'Black Friday Campaign',
        platform: 'meta',
        type: 'social',
        budget: 25000,
        status: 'draft',
        start_date: '2025-11-20',
        end_date: '2025-12-01',
      };
      mockPool.query.mockResolvedValueOnce({
        rows: [createdCampaign],
        rowCount: 1,
      });

      const response = await request
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send(newCampaignPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('Black Friday Campaign');
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.platform).toBe('meta');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send(newCampaignPayload)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 400 for missing required fields', async () => {
      const token = generateTestToken('admin');

      const response = await request
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incomplete Campaign' })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid platform', async () => {
      const token = generateTestToken('admin');

      const response = await request
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...newCampaignPayload,
          platform: 'invalid_platform',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // PUT /api/v1/campaigns/:id
  // =========================================================================

  describe('PUT /api/v1/campaigns/:id', () => {
    it('returns 200 when updated by admin', async () => {
      const token = generateTestToken('admin');
      const campaignId = TEST_CAMPAIGN.id;

      // Mock: getById (called by service.update to verify existence)
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_CAMPAIGN],
        rowCount: 1,
      });

      // Mock: UPDATE campaign
      const updatedCampaign = { ...TEST_CAMPAIGN, name: 'Updated Summer Sale' };
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedCampaign],
        rowCount: 1,
      });

      const response = await request
        .put(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Summer Sale' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Summer Sale');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .put(`/api/v1/campaigns/${TEST_CAMPAIGN.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Should Not Work' })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 404 for non-existent campaign', async () => {
      const token = generateTestToken('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // Mock: getById → not found
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .put(`/api/v1/campaigns/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ghost Campaign' })
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // PATCH /api/v1/campaigns/:id/status
  // =========================================================================

  describe('PATCH /api/v1/campaigns/:id/status', () => {
    it('returns 200 for valid status transition (draft -> active)', async () => {
      const token = generateTestToken('admin');
      const campaignId = TEST_CAMPAIGN.id;

      // Mock: getById (check current status)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...TEST_CAMPAIGN, status: 'draft' }],
        rowCount: 1,
      });

      // Mock: UPDATE status
      const updatedCampaign = { ...TEST_CAMPAIGN, status: 'active' };
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedCampaign],
        rowCount: 1,
      });

      // Mock: INSERT campaign_status_audit
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const response = await request
        .patch(`/api/v1/campaigns/${campaignId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('returns 400 for invalid status transition (draft -> completed)', async () => {
      const token = generateTestToken('admin');
      const campaignId = TEST_CAMPAIGN.id;

      // Mock: getById (current status is draft)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...TEST_CAMPAIGN, status: 'draft' }],
        rowCount: 1,
      });

      const response = await request
        .patch(`/api/v1/campaigns/${campaignId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .patch(`/api/v1/campaigns/${TEST_CAMPAIGN.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'active' })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =========================================================================
  // DELETE /api/v1/campaigns/:id
  // =========================================================================

  describe('DELETE /api/v1/campaigns/:id', () => {
    it('returns 200 when deleted by admin', async () => {
      const token = generateTestToken('admin');
      const campaignId = TEST_CAMPAIGN.id;

      // Mock: UPDATE status to archived
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const response = await request
        .delete(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Campaign deleted successfully');
    });

    it('returns 404 for non-existent campaign', async () => {
      const token = generateTestToken('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      // Mock: UPDATE → rowCount 0
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .delete(`/api/v1/campaigns/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .delete(`/api/v1/campaigns/${TEST_CAMPAIGN.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });
});

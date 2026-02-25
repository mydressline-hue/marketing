/**
 * Integration tests for Countries API endpoints.
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

// Use valid UUIDs since routes validate params with idParamSchema
const COUNTRY_ID_1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const COUNTRY_ID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

// Shared test data
const TEST_COUNTRY = {
  id: COUNTRY_ID_1,
  name: 'United States',
  code: 'US',
  region: 'North America',
  language: 'English',
  currency: 'USD',
  timezone: 'America/New_York',
  gdp: 21000000000000,
  internet_penetration: 90,
  ecommerce_adoption: 80,
  social_platforms: {},
  ad_costs: { avg_cpm: 15 },
  cultural_behavior: {},
  opportunity_score: 85.5,
  entry_strategy: 'direct',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const TEST_COUNTRY_2 = {
  ...TEST_COUNTRY,
  id: COUNTRY_ID_2,
  name: 'Germany',
  code: 'DE',
  region: 'Europe',
  language: 'German',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  opportunity_score: 78.2,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Countries API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure cacheGet always returns null so we hit the DB mocks
    mockCache.cacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/countries
  // =========================================================================

  describe('GET /api/v1/countries', () => {
    it('returns 200 with paginated list of countries', async () => {
      const token = generateTestToken('admin');

      // Mock: COUNT query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '2' }],
        rowCount: 1,
      });
      // Mock: SELECT query
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY, TEST_COUNTRY_2],
        rowCount: 2,
      });

      const response = await request
        .get('/api/v1/countries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.totalPages).toBe(1);
      expect(response.body.data[0].name).toBe('United States');
      expect(response.body.data[1].name).toBe('Germany');
    });

    it('returns 401 without authentication', async () => {
      const response = await request
        .get('/api/v1/countries')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/countries/:id
  // =========================================================================

  describe('GET /api/v1/countries/:id', () => {
    it('returns 200 with country data', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT country by id
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY],
        rowCount: 1,
      });

      const response = await request
        .get(`/api/v1/countries/${COUNTRY_ID_1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('United States');
      expect(response.body.data.code).toBe('US');
      expect(response.body.data.region).toBe('North America');
    });

    it('returns 404 for non-existent country', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT country -> no rows
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get(`/api/v1/countries/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // POST /api/v1/countries
  // =========================================================================

  describe('POST /api/v1/countries', () => {
    const newCountryPayload = {
      name: 'Japan',
      code: 'JP',
      region: 'Asia',
      language: 'Japanese',
      currency: 'JPY',
      timezone: 'Asia/Tokyo',
    };

    it('returns 201 when created by admin', async () => {
      const token = generateTestToken('admin');

      // Mock: INSERT country -> return new row
      const createdCountry = {
        ...TEST_COUNTRY,
        id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
        name: 'Japan',
        code: 'JP',
        region: 'Asia',
        language: 'Japanese',
        currency: 'JPY',
        timezone: 'Asia/Tokyo',
      };
      mockPool.query.mockResolvedValueOnce({
        rows: [createdCountry],
        rowCount: 1,
      });

      const response = await request
        .post('/api/v1/countries')
        .set('Authorization', `Bearer ${token}`)
        .send(newCountryPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('Japan');
      expect(response.body.data.code).toBe('JP');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .post('/api/v1/countries')
        .set('Authorization', `Bearer ${token}`)
        .send(newCountryPayload)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 400 for missing required fields', async () => {
      const token = generateTestToken('admin');

      const response = await request
        .post('/api/v1/countries')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Japan' }) // missing code, region, etc.
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // PUT /api/v1/countries/:id
  // =========================================================================

  describe('PUT /api/v1/countries/:id', () => {
    it('returns 200 when updated by admin', async () => {
      const token = generateTestToken('admin');

      // Mock: getById (called by service.update to verify existence)
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY],
        rowCount: 1,
      });

      // Mock: UPDATE country
      const updatedCountry = { ...TEST_COUNTRY, name: 'United States of America' };
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedCountry],
        rowCount: 1,
      });

      const response = await request
        .put(`/api/v1/countries/${COUNTRY_ID_1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'United States of America' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('United States of America');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .put(`/api/v1/countries/${COUNTRY_ID_1}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =========================================================================
  // DELETE /api/v1/countries/:id
  // =========================================================================

  describe('DELETE /api/v1/countries/:id', () => {
    it('returns 200 when deleted by admin', async () => {
      const token = generateTestToken('admin');

      // Mock: getById (verify existence)
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY],
        rowCount: 1,
      });

      // Mock: UPDATE is_active = false
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const response = await request
        .delete(`/api/v1/countries/${COUNTRY_ID_1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Country deleted successfully');
    });

    it('returns 403 for viewer role', async () => {
      const token = generateTestToken('viewer');

      const response = await request
        .delete(`/api/v1/countries/${COUNTRY_ID_1}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 404 when country does not exist', async () => {
      const token = generateTestToken('admin');

      // Mock: getById -> not found
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .delete(`/api/v1/countries/${NON_EXISTENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // GET /api/v1/countries/top
  // =========================================================================

  describe('GET /api/v1/countries/top', () => {
    it('returns 200 with sorted countries by opportunity score', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT top countries ordered by opportunity_score DESC
      mockPool.query.mockResolvedValueOnce({
        rows: [TEST_COUNTRY, TEST_COUNTRY_2],
        rowCount: 2,
      });

      const response = await request
        .get('/api/v1/countries/top')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      // Verify order: highest score first
      expect(response.body.data[0].opportunity_score).toBe(85.5);
      expect(response.body.data[1].opportunity_score).toBe(78.2);
    });

    it('returns 200 with empty array when no countries exist', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request
        .get('/api/v1/countries/top')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('returns 401 without authentication', async () => {
      const response = await request
        .get('/api/v1/countries/top')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

/**
 * Integration tests for Auth API endpoints.
 *
 * Tests the full HTTP request/response cycle through Express using supertest,
 * with all database and Redis dependencies mocked via the shared test setup
 * helper.
 */

import {
  createTestApp,
  generateTestToken,
  mockPool,
} from '../../helpers/setup';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const app = createTestApp();
const request = supertest(app);

// Shared test data
const TEST_USER = {
  id: 'test-uuid-1234',
  email: 'alice@example.com',
  name: 'Alice Tester',
  role: 'admin',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /api/v1/auth/register
  // =========================================================================

  describe('POST /api/v1/auth/register', () => {
    it('returns 201 with user and tokens for valid registration', async () => {
      // Mock: check for existing user (none found)
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock: INSERT user → return the new user
      mockPool.query.mockResolvedValueOnce({ rows: [TEST_USER], rowCount: 1 });

      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'SecurePass1',
          name: 'Alice Tester',
          role: 'admin',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('alice@example.com');
      expect(response.body.data.user.name).toBe('Alice Tester');
    });

    it('returns 400 for invalid email', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePass1',
          name: 'Alice Tester',
          role: 'admin',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for weak password (no uppercase)', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'weakpass1',
          name: 'Alice Tester',
          role: 'admin',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for weak password (too short)', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'Sh0rt',
          name: 'Alice Tester',
          role: 'admin',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for weak password (no number)', async () => {
      const response = await request
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'WeakPassword',
          name: 'Alice Tester',
          role: 'admin',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // POST /api/v1/auth/login
  // =========================================================================

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with tokens for valid credentials', async () => {
      const dbRow = {
        ...TEST_USER,
        password_hash: '$2b$12$fakehashfortest',
      };

      // Mock: SELECT user by email
      mockPool.query.mockResolvedValueOnce({ rows: [dbRow], rowCount: 1 });
      // Mock: UPDATE last_login_at
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: INSERT session
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: INSERT audit_log
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Mock bcrypt.compare to return true (we need to mock comparePassword)
      const helpers = require('../../../src/utils/helpers');
      jest.spyOn(helpers, 'comparePassword').mockResolvedValueOnce(true);

      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePass1',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('alice@example.com');
    });

    it('returns 401 for wrong password', async () => {
      const dbRow = {
        ...TEST_USER,
        password_hash: '$2b$12$fakehashfortest',
      };

      // Mock: SELECT user by email
      mockPool.query.mockResolvedValueOnce({ rows: [dbRow], rowCount: 1 });

      // Mock bcrypt.compare to return false
      const helpers = require('../../../src/utils/helpers');
      jest.spyOn(helpers, 'comparePassword').mockResolvedValueOnce(false);

      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'WrongPassword1',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for non-existent user', async () => {
      // Mock: SELECT user by email → no rows
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: 'nobody@example.com',
          password: 'SecurePass1',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // POST /api/v1/auth/logout
  // =========================================================================

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 with valid auth header', async () => {
      const token = generateTestToken('admin');

      // Mock: DELETE session
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock: INSERT audit_log
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const response = await request
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logged out successfully');
    });

    it('returns 401 without auth header', async () => {
      const response = await request
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/auth/profile
  // =========================================================================

  describe('GET /api/v1/auth/profile', () => {
    it('returns 200 with user data when authenticated', async () => {
      const token = generateTestToken('admin');

      // Mock: SELECT user by ID
      mockPool.query.mockResolvedValueOnce({ rows: [TEST_USER], rowCount: 1 });

      const response = await request
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.email).toBe('alice@example.com');
      expect(response.body.data.name).toBe('Alice Tester');
      expect(response.body.data.role).toBe('admin');
    });

    it('returns 401 without auth header', async () => {
      const response = await request
        .get('/api/v1/auth/profile')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 with an invalid token', async () => {
      const response = await request
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token-value')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 with a malformed authorization header', async () => {
      const response = await request
        .get('/api/v1/auth/profile')
        .set('Authorization', 'NotBearer some-token')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

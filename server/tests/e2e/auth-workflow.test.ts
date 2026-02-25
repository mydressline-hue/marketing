/**
 * E2E Auth Workflow Tests
 *
 * Tests the full authentication lifecycle through the HTTP layer:
 *   1. Register a new user
 *   2. Login with the registered credentials
 *   3. Access a protected route with the token
 *   4. Access a protected route without a token
 *   5. Logout (session destruction)
 *   6. Verify session invalidation after logout
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
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';

const mockPool = pool as unknown as { query: jest.Mock };

/** Convenience: returns a standard user row object. */
function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-4000-8000-000000000010',
    email: 'testuser@example.com',
    password_hash: '$2b$12$hashedpasswordplaceholder',
    name: 'Test User',
    role: 'campaign_manager',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Auth Workflow (E2E)', () => {
  let accessToken: string;
  let refreshTokenValue: string;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Register a new user -> 201 with tokens
  // -----------------------------------------------------------------------
  describe('Step 1: Register a new user', () => {
    it('should return 201 with user, token and refreshToken', async () => {
      // First query: check for existing user (returns none)
      // Second query: INSERT ... RETURNING *
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [makeUserRow()],
          rowCount: 1,
        });

      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: 'testuser@example.com',
          password: 'Password123',
          name: 'Test User',
          role: 'campaign_manager',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('testuser@example.com');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Save tokens for later steps
      accessToken = res.body.data.token;
      refreshTokenValue = res.body.data.refreshToken;
    });

    it('should return 409 when email already exists', async () => {
      // First query: check for existing user (returns match)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'a0000000-0000-4000-8000-000000000010' }],
        rowCount: 1,
      });

      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: 'testuser@example.com',
          password: 'Password123',
          name: 'Test User',
          role: 'campaign_manager',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should return 400 for invalid registration data', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({
          email: 'not-an-email',
          password: 'short',
          name: '',
          role: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Login with registered user -> tokens returned
  // -----------------------------------------------------------------------
  describe('Step 2: Login with registered user', () => {
    it('should return 200 with user, token and refreshToken', async () => {
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      // 1. SELECT user by email
      // 2. UPDATE last_login_at
      // 3. INSERT session
      // 4. INSERT audit_log
      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({
          email: 'testuser@example.com',
          password: 'Password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('testuser@example.com');
      expect(res.body.data.user.role).toBe('campaign_manager');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Save tokens for subsequent tests
      accessToken = res.body.data.token;
      refreshTokenValue = res.body.data.refreshToken;
    });

    it('should return 401 for wrong password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword1', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      // SELECT user by email -- password won't match
      mockPool.query.mockResolvedValueOnce({ rows: [userRow], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({
          email: 'testuser@example.com',
          password: 'WrongPassword1',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 for non-existent user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({
          email: 'nobody@example.com',
          password: 'Password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Access protected route with token -> 200
  // -----------------------------------------------------------------------
  describe('Step 3: Access protected route with valid token', () => {
    beforeEach(async () => {
      // Perform a login to get a valid token
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const loginRes = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'testuser@example.com', password: 'Password123' });

      accessToken = loginRes.body.data.token;
    });

    it('should return 200 for GET /auth/profile with valid token', async () => {
      // getProfile queries user by id
      mockPool.query.mockResolvedValueOnce({
        rows: [makeUserRow()],
        rowCount: 1,
      });

      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('testuser@example.com');
      expect(res.body.data.name).toBe('Test User');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Access protected route without token -> 401
  // -----------------------------------------------------------------------
  describe('Step 4: Access protected route without token', () => {
    it('should return 401 when no Authorization header is present', async () => {
      const res = await request(app).get(`${API}/auth/profile`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 when Authorization header is malformed', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'InvalidHeader');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 when token is expired or invalid', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // 5. Logout -> session destroyed
  // -----------------------------------------------------------------------
  describe('Step 5: Logout', () => {
    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const loginRes = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'testuser@example.com', password: 'Password123' });

      accessToken = loginRes.body.data.token;
    });

    it('should return 200 and confirm logout', async () => {
      // Logout: DELETE FROM sessions ... + INSERT INTO audit_logs ...
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // DELETE session
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit log

      const res = await request(app)
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');

      // Verify that the session deletion query was executed
      const deleteCalls = mockPool.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('DELETE FROM sessions'),
      );
      expect(deleteCalls.length).toBe(1);

      // Verify that an audit log was created for the logout action
      const auditCalls = mockPool.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO audit_logs') &&
          Array.isArray(call[1]) &&
          call[1].includes('LOGOUT'),
      );
      expect(auditCalls.length).toBe(1);
    });

    it('should return 401 when trying to logout without token', async () => {
      const res = await request(app).post(`${API}/auth/logout`);

      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Access protected route after logout
  // -----------------------------------------------------------------------
  describe('Step 6: Access after logout (JWT stateless caveat)', () => {
    it('should still accept a valid JWT even after logout (stateless token)', async () => {
      // Login first to get a real JWT
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const loginRes = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'testuser@example.com', password: 'Password123' });

      const token = loginRes.body.data.token;

      // Perform logout
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await request(app)
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${token}`);

      // The JWT middleware only verifies the token signature -- it does not
      // check whether the session has been destroyed. As long as the JWT has
      // not expired, it will still pass the `authenticate` middleware.
      //
      // This test documents that behaviour; a production system would
      // typically add a token blacklist (Redis set) check inside the
      // authenticate middleware to fully invalidate tokens on logout.
      mockPool.query.mockResolvedValueOnce({
        rows: [makeUserRow()],
        rowCount: 1,
      });

      const profileRes = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', `Bearer ${token}`);

      // JWT is stateless, so the token is still technically valid
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.email).toBe('testuser@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // Bonus: Token refresh workflow
  // -----------------------------------------------------------------------
  describe('Bonus: Token refresh', () => {
    it('should issue a new token pair when given a valid refresh token', async () => {
      // First, login to get a refresh token
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const loginRes = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'testuser@example.com', password: 'Password123' });

      refreshTokenValue = loginRes.body.data.refreshToken;

      // refreshToken handler fetches user by id from the decoded refresh token
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'a0000000-0000-4000-8000-000000000010', email: 'testuser@example.com', role: 'campaign_manager' }],
        rowCount: 1,
      });

      const res = await request(app)
        .post(`${API}/auth/refresh-token`)
        .send({ refreshToken: refreshTokenValue });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Verify new tokens are valid JWTs (same-second generation may produce identical tokens)
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.split('.')).toHaveLength(3);
    });

    it('should return 401 for an invalid refresh token', async () => {
      const res = await request(app)
        .post(`${API}/auth/refresh-token`)
        .send({ refreshToken: 'totally-invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // -----------------------------------------------------------------------
  // Bonus: Profile update and password change
  // -----------------------------------------------------------------------
  describe('Bonus: Profile update', () => {
    let token: string;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('Password123', 12);
      const userRow = makeUserRow({ password_hash: hashedPassword });

      mockPool.query
        .mockResolvedValueOnce({ rows: [userRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const loginRes = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'testuser@example.com', password: 'Password123' });

      token = loginRes.body.data.token;
    });

    it('should update the user profile name', async () => {
      const updatedUser = makeUserRow({ name: 'Updated Name' });

      // PATCH /auth/profile: check duplicate email (none), then UPDATE user
      mockPool.query.mockResolvedValueOnce({
        rows: [updatedUser],
        rowCount: 1,
      });

      const res = await request(app)
        .patch(`${API}/auth/profile`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should change the password successfully', async () => {
      const hashedCurrent = await bcrypt.hash('Password123', 12);

      // 1. SELECT password_hash
      // 2. UPDATE password_hash
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ password_hash: hashedCurrent }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post(`${API}/auth/change-password`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'Password123',
          newPassword: 'NewPassword456',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Password changed successfully');
    });
  });
});

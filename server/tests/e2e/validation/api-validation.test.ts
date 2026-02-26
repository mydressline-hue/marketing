/**
 * E2E API Validation Tests.
 *
 * Verifies that all key API endpoints enforce request body, query, and
 * parameter validation using Zod schemas. Tests that invalid payloads are
 * rejected with structured 400 error responses containing field-level details.
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

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../src/app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

function adminToken(): string {
  return jwt.sign(
    { id: 'a0000000-0000-4000-8000-000000000001', email: 'admin@test.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function managerToken(): string {
  return jwt.sign(
    { id: 'a0000000-0000-4000-8000-000000000002', email: 'mgr@test.com', role: 'campaign_manager' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * Assert that the response is a 400 validation error with a structured body.
 */
function expectValidationError(res: request.Response): void {
  expect(res.status).toBe(400);
  expect(res.body.error).toBeDefined();
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(res.body.error.statusCode).toBe(400);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Validation E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Auth validation
  // =========================================================================

  describe('POST /auth/register -- body validation', () => {
    it('should reject registration with missing email', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ password: 'Abc12345', name: 'Test', role: 'viewer' });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: 'test@example.com', password: 'short', name: 'Test', role: 'viewer' });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: 'not-an-email', password: 'Abc12345', name: 'Test', role: 'viewer' });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });
  });

  describe('POST /auth/login -- body validation', () => {
    it('should reject login with empty password', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'test@example.com', password: '' });

      expectValidationError(res);
    });
  });

  // =========================================================================
  // 2. Campaign validation
  // =========================================================================

  describe('POST /campaigns -- body validation', () => {
    it('should reject campaign creation with missing required fields', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});

      expectValidationError(res);
      // Should have multiple field errors
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject campaign with invalid platform', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Test Campaign',
          countryId: 'c0000000-0000-4000-8000-000000000001',
          platform: 'invalid_platform',
          type: 'search',
          budget: 1000,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'platform' }),
        ]),
      );
    });

    it('should reject campaign with negative budget', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Test Campaign',
          countryId: 'c0000000-0000-4000-8000-000000000001',
          platform: 'google',
          type: 'search',
          budget: -500,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'budget' }),
        ]),
      );
    });

    it('should reject campaign with invalid countryId UUID', async () => {
      const res = await request(app)
        .post(`${API}/campaigns`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Test Campaign',
          countryId: 'not-a-uuid',
          platform: 'google',
          type: 'search',
          budget: 1000,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'countryId' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 3. Country validation
  // =========================================================================

  describe('POST /countries -- body validation', () => {
    it('should reject country with invalid ISO code length', async () => {
      const res = await request(app)
        .post(`${API}/countries`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Germany',
          code: 'DEU',
          region: 'Europe',
          language: 'German',
          currency: 'EUR',
          timezone: 'Europe/Berlin',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'code' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 4. Creative validation
  // =========================================================================

  describe('POST /creatives -- body validation', () => {
    it('should reject creative with invalid type', async () => {
      const res = await request(app)
        .post(`${API}/creatives`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Test Creative',
          type: 'invalid_type',
          campaignId: 'c0000000-0000-4000-8000-000000000001',
          content: 'Some content',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'type' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 5. Product validation
  // =========================================================================

  describe('POST /products -- body validation', () => {
    it('should reject product with empty variants array', async () => {
      const res = await request(app)
        .post(`${API}/products`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          title: 'Test Product',
          description: 'A product',
          variants: [],
          images: [],
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'variants' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 6. Kill switch validation
  // =========================================================================

  describe('POST /killswitch/activate -- body validation', () => {
    it('should reject activation with missing level', async () => {
      const res = await request(app)
        .post(`${API}/killswitch/activate`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Emergency' });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'level' }),
        ]),
      );
    });

    it('should reject activation with level out of range', async () => {
      const res = await request(app)
        .post(`${API}/killswitch/activate`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ level: 99, reason: 'Emergency' });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'level' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 7. Param validation
  // =========================================================================

  describe('GET /campaigns/:id -- param validation', () => {
    it('should reject request with invalid UUID param', async () => {
      const res = await request(app)
        .get(`${API}/campaigns/not-a-uuid`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'id' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 8. Content validation
  // =========================================================================

  describe('POST /content -- body validation', () => {
    it('should reject content with missing seoKeywords', async () => {
      const res = await request(app)
        .post(`${API}/content`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          title: 'Blog Post',
          body: 'The body of the post',
          countryId: 'c0000000-0000-4000-8000-000000000001',
          language: 'en',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'seoKeywords' }),
        ]),
      );
    });
  });

  // =========================================================================
  // 9. Validation error structure
  // =========================================================================

  describe('Validation error response structure', () => {
    it('should return structured errors with code, message, statusCode, and details', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(res.body.error).toHaveProperty('message', 'Validation failed');
      expect(res.body.error).toHaveProperty('statusCode', 400);
      expect(res.body.error).toHaveProperty('details');
      expect(Array.isArray(res.body.error.details)).toBe(true);

      // Each detail should have field and message
      for (const detail of res.body.error.details) {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('message');
        expect(typeof detail.field).toBe('string');
        expect(typeof detail.message).toBe('string');
      }
    });

    it('should return multiple field errors when multiple fields are invalid', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({});

      expectValidationError(res);
      // email, password, name, and role are all required
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =========================================================================
  // 10. Alert validation
  // =========================================================================

  describe('POST /alerts -- body validation', () => {
    it('should reject alert with invalid severity', async () => {
      const res = await request(app)
        .post(`${API}/alerts`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          type: 'fraud',
          severity: 'extreme',
          message: 'Something happened',
        });

      expectValidationError(res);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'severity' }),
        ]),
      );
    });
  });
});

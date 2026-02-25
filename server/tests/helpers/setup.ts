/**
 * Test Setup Helper.
 *
 * Provides a pre-configured Express application with all database and Redis
 * modules mocked out, along with utilities for generating JWT tokens and
 * setting up mock database responses. This file must be imported at the top
 * of every integration test so that the jest.mock calls are hoisted before
 * any application code is required.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
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

jest.mock('../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
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

import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../src/config/redis';

// Import route modules
import authRoutes from '../../src/routes/auth.routes';
import countriesRoutes from '../../src/routes/countries.routes';

// Import middleware
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Mock references (re-exported for easy assertion in tests)
// ---------------------------------------------------------------------------

export const mockPool = pool as unknown as {
  query: jest.Mock;
  connect: jest.Mock;
};

export const mockCache = {
  cacheGet: cacheGet as jest.Mock,
  cacheSet: cacheSet as jest.Mock,
  cacheDel: cacheDel as jest.Mock,
  cacheFlush: cacheFlush as jest.Mock,
};

// ---------------------------------------------------------------------------
// createTestApp
// ---------------------------------------------------------------------------

/**
 * Builds and returns a fully configured Express application suitable for
 * integration testing with supertest. All routes are mounted under the
 * `/api/v1` prefix, and the centralised error handler is attached.
 */
export function createTestApp(): express.Express {
  const app = express();

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount routes
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/countries`, countriesRoutes);

  // Campaigns routes are assembled inline since there is no dedicated route file yet
  const campaignsRouter = buildCampaignsRouter();
  app.use(`${API_PREFIX}/campaigns`, campaignsRouter);

  // 404 catch-all and error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Campaigns router builder (no route file exists in the source yet)
// ---------------------------------------------------------------------------

import { authenticate } from '../../src/middleware/auth';
import { requirePermission } from '../../src/middleware/rbac';
import { asyncHandler } from '../../src/middleware/errorHandler';
import { validateBody } from '../../src/middleware/validation';
import { createCampaignSchema, updateCampaignSchema } from '../../src/validators/schemas';
import { CampaignsService } from '../../src/services/campaigns.service';

function buildCampaignsRouter(): express.Router {
  const router = express.Router();

  // All campaign routes require authentication
  router.use(authenticate);

  // GET /campaigns - list campaigns
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { countryId, platform, status, page, limit, sortBy, sortOrder } = req.query;
      const filters = {
        countryId: countryId as string | undefined,
        platform: platform as string | undefined,
        status: status as string | undefined,
        createdBy: undefined,
      };
      const pagination = {
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
        sortBy: sortBy as string | undefined,
        sortOrder: sortOrder as string | undefined,
      };
      const result = await CampaignsService.list(filters, pagination);
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: result.page, totalPages: result.totalPages },
      });
    }),
  );

  // GET /campaigns/:id - get single campaign
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const campaign = await CampaignsService.getById(req.params.id);
      res.json({ success: true, data: campaign });
    }),
  );

  // POST /campaigns - create campaign
  router.post(
    '/',
    requirePermission('write:campaigns'),
    validateBody(createCampaignSchema),
    asyncHandler(async (req, res) => {
      const campaign = await CampaignsService.create(req.body, req.user!.id);
      res.status(201).json({ success: true, data: campaign });
    }),
  );

  // PUT /campaigns/:id - update campaign
  router.put(
    '/:id',
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const campaign = await CampaignsService.update(req.params.id, req.body);
      res.json({ success: true, data: campaign });
    }),
  );

  // PATCH /campaigns/:id/status - update campaign status
  router.patch(
    '/:id/status',
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const { status } = req.body;
      const campaign = await CampaignsService.updateStatus(
        req.params.id,
        status,
        req.user!.id,
      );
      res.json({ success: true, data: campaign });
    }),
  );

  // DELETE /campaigns/:id - soft-delete campaign
  router.delete(
    '/:id',
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      await CampaignsService.delete(req.params.id);
      res.json({ success: true, data: { message: 'Campaign deleted successfully' } });
    }),
  );

  return router;
}

// ---------------------------------------------------------------------------
// generateTestToken
// ---------------------------------------------------------------------------

/**
 * Creates a valid JWT access token for testing. By default the token is
 * signed for an admin user so that permission checks pass. Override `role`
 * to test other RBAC scenarios.
 */
export function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    {
      id: 'test-user-id-1234',
      email: 'testuser@example.com',
      role,
    },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// mockDbQuery
// ---------------------------------------------------------------------------

/**
 * Convenience helper to enqueue a mock return value for the next call to
 * `pool.query`. Accepts either a raw value (which is returned as-is) or
 * an array of rows which is wrapped in `{ rows, rowCount }`.
 */
export function mockDbQuery(returnValue: unknown): void {
  if (Array.isArray(returnValue)) {
    mockPool.query.mockResolvedValueOnce({
      rows: returnValue,
      rowCount: returnValue.length,
    });
  } else {
    mockPool.query.mockResolvedValueOnce(returnValue);
  }
}

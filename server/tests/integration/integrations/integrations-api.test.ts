/**
 * Integration tests for Integrations API endpoints.
 *
 * Tests the full HTTP request/response cycle for platform connections,
 * sync operations, CRM contacts, and analytics exports with all
 * dependencies mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
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

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/services/integrations/IntegrationsService', () => ({
  IntegrationsService: {
    connectPlatform: jest.fn(),
    disconnectPlatform: jest.fn(),
    getAllStatuses: jest.fn(),
    getPlatformStatus: jest.fn(),
    triggerSync: jest.fn(),
    getSyncStatus: jest.fn(),
    getPlatformReports: jest.fn(),
    syncCrmContacts: jest.fn(),
    listCrmContacts: jest.fn(),
    exportAnalyticsData: jest.fn(),
    listDashboards: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { cacheGet } from '../../../src/config/redis';
import { authenticate } from '../../../src/middleware/auth';
import { asyncHandler, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { IntegrationsService } from '../../../src/services/integrations/IntegrationsService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockCacheGet = cacheGet as jest.Mock;
const mockIntegrationsService = IntegrationsService as jest.Mocked<typeof IntegrationsService>;

// ---------------------------------------------------------------------------
// Build test Express app with inline integrations routes
// ---------------------------------------------------------------------------

function buildIntegrationsRouter(): express.Router {
  const router = express.Router();

  // All integrations routes require authentication
  router.use(authenticate);

  // POST /integrations/connect - Connect a platform
  router.post(
    '/connect',
    asyncHandler(async (req, res) => {
      const { platform_type, credentials, config } = req.body;
      if (!platform_type) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'platform_type is required' },
        });
        return;
      }
      const validPlatforms = [
        'google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads',
        'shopify', 'salesforce', 'hubspot', 'looker', 'google_analytics',
      ];
      if (!validPlatforms.includes(platform_type)) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid platform_type: ${platform_type}` },
        });
        return;
      }
      const result = await IntegrationsService.connectPlatform({
        platform_type,
        credentials,
        config,
        user_id: req.user!.id,
      });
      res.status(201).json({ success: true, data: result });
    }),
  );

  // DELETE /integrations/:platformType/disconnect - Disconnect platform
  router.delete(
    '/:platformType/disconnect',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.disconnectPlatform(
        req.params.platformType,
        req.user!.id,
      );
      res.json({ success: true, data: result });
    }),
  );

  // GET /integrations/status - Get all connection statuses
  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.getAllStatuses(req.user!.id);
      res.json({ success: true, data: result });
    }),
  );

  // GET /integrations/:platformType/status - Get specific platform status
  router.get(
    '/:platformType/status',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.getPlatformStatus(
        req.params.platformType,
        req.user!.id,
      );
      res.json({ success: true, data: result });
    }),
  );

  // POST /integrations/:platformType/sync - Trigger sync
  router.post(
    '/:platformType/sync',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.triggerSync(
        req.params.platformType,
        req.user!.id,
        req.body,
      );
      res.json({ success: true, data: result });
    }),
  );

  // GET /integrations/:platformType/sync/status - Get sync status
  router.get(
    '/:platformType/sync/status',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.getSyncStatus(
        req.params.platformType,
        req.user!.id,
      );
      res.json({ success: true, data: result });
    }),
  );

  // GET /integrations/:platformType/reports - Get platform reports
  router.get(
    '/:platformType/reports',
    asyncHandler(async (req, res) => {
      const { start_date, end_date, page, limit } = req.query;
      const result = await IntegrationsService.getPlatformReports(
        req.params.platformType,
        req.user!.id,
        {
          start_date: start_date as string | undefined,
          end_date: end_date as string | undefined,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
        },
      );
      res.json({ success: true, data: result.data, meta: result.meta });
    }),
  );

  // POST /integrations/crm/:platformType/sync-contacts - Sync CRM contacts
  router.post(
    '/crm/:platformType/sync-contacts',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.syncCrmContacts(
        req.params.platformType,
        req.user!.id,
        req.body,
      );
      res.json({ success: true, data: result });
    }),
  );

  // GET /integrations/crm/:platformType/contacts - List CRM contacts
  router.get(
    '/crm/:platformType/contacts',
    asyncHandler(async (req, res) => {
      const { page, limit, search } = req.query;
      const result = await IntegrationsService.listCrmContacts(
        req.params.platformType,
        req.user!.id,
        {
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
          search: search as string | undefined,
        },
      );
      res.json({ success: true, data: result.data, meta: result.meta });
    }),
  );

  // POST /integrations/analytics/:platformType/export - Export analytics data
  router.post(
    '/analytics/:platformType/export',
    asyncHandler(async (req, res) => {
      const result = await IntegrationsService.exportAnalyticsData(
        req.params.platformType,
        req.user!.id,
        req.body,
      );
      res.status(202).json({ success: true, data: result });
    }),
  );

  // GET /integrations/analytics/:platformType/dashboards - List dashboards
  router.get(
    '/analytics/:platformType/dashboards',
    asyncHandler(async (req, res) => {
      const { page, limit } = req.query;
      const result = await IntegrationsService.listDashboards(
        req.params.platformType,
        req.user!.id,
        {
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
        },
      );
      res.json({ success: true, data: result.data, meta: result.meta });
    }),
  );

  return router;
}

function buildIntegrationsTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(`${API_PREFIX}/integrations`, buildIntegrationsRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let request: typeof import('supertest').default;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Integrations API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildIntegrationsTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Connection Management
  // =========================================================================

  describe('POST /api/v1/integrations/connect', () => {
    it('returns 201 when connecting a valid platform', async () => {
      const token = generateTestToken('admin');
      const connectionResult = {
        id: 'conn-gads-001',
        platform_type: 'google_ads',
        status: 'connected',
        connected_at: '2026-02-25T10:00:00Z',
        user_id: 'test-user-id-1234',
      };

      mockIntegrationsService.connectPlatform.mockResolvedValueOnce(connectionResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform_type: 'google_ads',
          credentials: { client_id: 'gads-client-123', client_secret: 'secret', refresh_token: 'rt-123' },
          config: { account_id: '123-456-7890' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.platform_type).toBe('google_ads');
      expect(response.body.data.status).toBe('connected');
      expect(mockIntegrationsService.connectPlatform).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_type: 'google_ads',
          user_id: 'test-user-id-1234',
        }),
      );
    });

    it('returns 201 when connecting meta_ads platform', async () => {
      const token = generateTestToken('campaign_manager');
      const connectionResult = {
        id: 'conn-meta-001',
        platform_type: 'meta_ads',
        status: 'connected',
        connected_at: '2026-02-25T10:05:00Z',
        user_id: 'test-user-id-1234',
      };

      mockIntegrationsService.connectPlatform.mockResolvedValueOnce(connectionResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform_type: 'meta_ads',
          credentials: { access_token: 'fb-token-xyz', ad_account_id: 'act_123456' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.platform_type).toBe('meta_ads');
    });

    it('returns 201 when connecting shopify platform', async () => {
      const token = generateTestToken('admin');
      const connectionResult = {
        id: 'conn-shopify-001',
        platform_type: 'shopify',
        status: 'connected',
        connected_at: '2026-02-25T10:10:00Z',
        user_id: 'test-user-id-1234',
      };

      mockIntegrationsService.connectPlatform.mockResolvedValueOnce(connectionResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform_type: 'shopify',
          credentials: { api_key: 'shpka_xxx', api_secret: 'shpks_yyy', shop_domain: 'mystore.myshopify.com' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.platform_type).toBe('shopify');
    });

    it('returns 400 when platform_type is missing', async () => {
      const token = generateTestToken('admin');

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({ credentials: { token: 'abc' } })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('platform_type is required');
    });

    it('returns 400 when platform_type is invalid', async () => {
      const token = generateTestToken('admin');

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({ platform_type: 'invalid_platform', credentials: { token: 'abc' } })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid platform_type');
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .send({ platform_type: 'google_ads', credentials: {} })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('DELETE /api/v1/integrations/:platformType/disconnect', () => {
    it('returns 200 when disconnecting a connected platform', async () => {
      const token = generateTestToken('admin');
      const disconnectResult = {
        platform_type: 'google_ads',
        status: 'disconnected',
        disconnected_at: '2026-02-25T12:00:00Z',
      };

      mockIntegrationsService.disconnectPlatform.mockResolvedValueOnce(disconnectResult);

      const response = await request(app)
        .delete(`${API_PREFIX}/integrations/google_ads/disconnect`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('disconnected');
      expect(response.body.data.platform_type).toBe('google_ads');
      expect(mockIntegrationsService.disconnectPlatform).toHaveBeenCalledWith(
        'google_ads',
        'test-user-id-1234',
      );
    });

    it('returns 404 when platform is not connected', async () => {
      const token = generateTestToken('admin');

      mockIntegrationsService.disconnectPlatform.mockRejectedValueOnce(
        Object.assign(new Error('Platform tiktok_ads is not connected'), { statusCode: 404, code: 'NOT_FOUND' }),
      );

      const response = await request(app)
        .delete(`${API_PREFIX}/integrations/tiktok_ads/disconnect`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .delete(`${API_PREFIX}/integrations/google_ads/disconnect`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/v1/integrations/status', () => {
    it('returns 200 with all platform statuses', async () => {
      const token = generateTestToken('admin');
      const statusResult = [
        { platform_type: 'google_ads', status: 'connected', last_sync: '2026-02-25T09:00:00Z', health: 'healthy' },
        { platform_type: 'meta_ads', status: 'connected', last_sync: '2026-02-25T08:30:00Z', health: 'healthy' },
        { platform_type: 'shopify', status: 'disconnected', last_sync: null, health: 'n/a' },
        { platform_type: 'salesforce', status: 'disconnected', last_sync: null, health: 'n/a' },
        { platform_type: 'tiktok_ads', status: 'error', last_sync: '2026-02-24T22:00:00Z', health: 'degraded' },
        { platform_type: 'linkedin_ads', status: 'disconnected', last_sync: null, health: 'n/a' },
        { platform_type: 'hubspot', status: 'disconnected', last_sync: null, health: 'n/a' },
        { platform_type: 'looker', status: 'connected', last_sync: '2026-02-25T07:00:00Z', health: 'healthy' },
        { platform_type: 'google_analytics', status: 'connected', last_sync: '2026-02-25T09:15:00Z', health: 'healthy' },
      ];

      mockIntegrationsService.getAllStatuses.mockResolvedValueOnce(statusResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(9);
      expect(response.body.data.filter((s: { status: string }) => s.status === 'connected')).toHaveLength(4);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/integrations/status`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/v1/integrations/:platformType/status', () => {
    it('returns 200 for a connected platform', async () => {
      const token = generateTestToken('viewer');
      const statusResult = {
        platform_type: 'google_ads',
        status: 'connected',
        connected_at: '2026-02-20T08:00:00Z',
        last_sync: '2026-02-25T09:00:00Z',
        sync_frequency: 'hourly',
        health: 'healthy',
        metrics: {
          total_campaigns_synced: 45,
          total_records: 125000,
          error_count_24h: 0,
        },
      };

      mockIntegrationsService.getPlatformStatus.mockResolvedValueOnce(statusResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/google_ads/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('connected');
      expect(response.body.data.health).toBe('healthy');
      expect(response.body.data.metrics.total_campaigns_synced).toBe(45);
    });

    it('returns 200 for a disconnected platform', async () => {
      const token = generateTestToken('viewer');
      const statusResult = {
        platform_type: 'salesforce',
        status: 'disconnected',
        connected_at: null,
        last_sync: null,
        sync_frequency: null,
        health: 'n/a',
        metrics: null,
      };

      mockIntegrationsService.getPlatformStatus.mockResolvedValueOnce(statusResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/salesforce/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('disconnected');
      expect(response.body.data.connected_at).toBeNull();
    });
  });

  // =========================================================================
  // Platform Operations
  // =========================================================================

  describe('POST /api/v1/integrations/:platformType/sync', () => {
    it('returns 200 with sync results for connected platform', async () => {
      const token = generateTestToken('admin');
      const syncResult = {
        sync_id: 'sync-gads-001',
        platform_type: 'google_ads',
        status: 'completed',
        started_at: '2026-02-25T10:00:00Z',
        completed_at: '2026-02-25T10:02:30Z',
        records_synced: 1250,
        records_created: 30,
        records_updated: 1220,
        records_failed: 0,
        duration_ms: 150000,
      };

      mockIntegrationsService.triggerSync.mockResolvedValueOnce(syncResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/google_ads/sync`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_type: 'full', date_range: { start: '2026-02-01', end: '2026-02-25' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sync_id).toBe('sync-gads-001');
      expect(response.body.data.records_synced).toBe(1250);
      expect(response.body.data.status).toBe('completed');
    });

    it('returns 200 with sync results for meta_ads', async () => {
      const token = generateTestToken('campaign_manager');
      const syncResult = {
        sync_id: 'sync-meta-001',
        platform_type: 'meta_ads',
        status: 'completed',
        started_at: '2026-02-25T10:05:00Z',
        completed_at: '2026-02-25T10:06:45Z',
        records_synced: 870,
        records_created: 15,
        records_updated: 855,
        records_failed: 2,
        duration_ms: 105000,
      };

      mockIntegrationsService.triggerSync.mockResolvedValueOnce(syncResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/meta_ads/sync`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_type: 'incremental' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records_failed).toBe(2);
    });

    it('returns 404 when platform is not connected', async () => {
      const token = generateTestToken('admin');

      mockIntegrationsService.triggerSync.mockRejectedValueOnce(
        Object.assign(new Error('Platform linkedin_ads is not connected'), { statusCode: 404, code: 'NOT_FOUND' }),
      );

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/linkedin_ads/sync`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_type: 'full' })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/integrations/:platformType/sync/status', () => {
    it('returns 200 with last sync details', async () => {
      const token = generateTestToken('viewer');
      const syncStatus = {
        platform_type: 'google_ads',
        last_sync: {
          sync_id: 'sync-gads-001',
          status: 'completed',
          started_at: '2026-02-25T09:00:00Z',
          completed_at: '2026-02-25T09:02:15Z',
          records_synced: 1100,
          errors: [],
        },
        next_scheduled_sync: '2026-02-25T10:00:00Z',
        sync_frequency: 'hourly',
        is_syncing: false,
      };

      mockIntegrationsService.getSyncStatus.mockResolvedValueOnce(syncStatus);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/google_ads/sync/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.last_sync.status).toBe('completed');
      expect(response.body.data.is_syncing).toBe(false);
      expect(response.body.data.sync_frequency).toBe('hourly');
    });

    it('returns 200 with in-progress sync status', async () => {
      const token = generateTestToken('admin');
      const syncStatus = {
        platform_type: 'meta_ads',
        last_sync: {
          sync_id: 'sync-meta-002',
          status: 'in_progress',
          started_at: '2026-02-25T10:05:00Z',
          completed_at: null,
          records_synced: 320,
          errors: [],
        },
        next_scheduled_sync: null,
        sync_frequency: 'every_6_hours',
        is_syncing: true,
      };

      mockIntegrationsService.getSyncStatus.mockResolvedValueOnce(syncStatus);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/meta_ads/sync/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_syncing).toBe(true);
      expect(response.body.data.last_sync.status).toBe('in_progress');
    });
  });

  describe('GET /api/v1/integrations/:platformType/reports', () => {
    it('returns 200 with paginated reports', async () => {
      const token = generateTestToken('viewer');
      const reportsResult = {
        data: [
          {
            id: 'report-001',
            campaign_name: 'Summer Sale 2026',
            impressions: 450000,
            clicks: 12500,
            conversions: 850,
            spend: 4200.50,
            ctr: 0.0278,
            cpc: 0.336,
            date: '2026-02-24',
          },
          {
            id: 'report-002',
            campaign_name: 'Brand Awareness Q1',
            impressions: 1200000,
            clicks: 28000,
            conversions: 1200,
            spend: 8500.00,
            ctr: 0.0233,
            cpc: 0.304,
            date: '2026-02-24',
          },
        ],
        meta: { total: 45, page: 1, totalPages: 23, limit: 2 },
      };

      mockIntegrationsService.getPlatformReports.mockResolvedValueOnce(reportsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/google_ads/reports`)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(45);
      expect(response.body.meta.totalPages).toBe(23);
      expect(response.body.data[0].impressions).toBe(450000);
    });

    it('returns 200 with reports filtered by date range', async () => {
      const token = generateTestToken('admin');
      const reportsResult = {
        data: [
          {
            id: 'report-010',
            campaign_name: 'Valentine Promo',
            impressions: 320000,
            clicks: 9800,
            conversions: 620,
            spend: 3100.00,
            ctr: 0.0306,
            cpc: 0.316,
            date: '2026-02-14',
          },
        ],
        meta: { total: 7, page: 1, totalPages: 1, limit: 20 },
      };

      mockIntegrationsService.getPlatformReports.mockResolvedValueOnce(reportsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/meta_ads/reports`)
        .set('Authorization', `Bearer ${token}`)
        .query({ start_date: '2026-02-10', end_date: '2026-02-20', page: 1, limit: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.total).toBe(7);
      expect(mockIntegrationsService.getPlatformReports).toHaveBeenCalledWith(
        'meta_ads',
        'test-user-id-1234',
        expect.objectContaining({
          start_date: '2026-02-10',
          end_date: '2026-02-20',
        }),
      );
    });

    it('returns 200 with empty reports when no data available', async () => {
      const token = generateTestToken('viewer');
      const reportsResult = {
        data: [],
        meta: { total: 0, page: 1, totalPages: 0, limit: 20 },
      };

      mockIntegrationsService.getPlatformReports.mockResolvedValueOnce(reportsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/tiktok_ads/reports`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });
  });

  // =========================================================================
  // CRM Operations
  // =========================================================================

  describe('POST /api/v1/integrations/crm/:platformType/sync-contacts', () => {
    it('returns 200 with sync counts for Salesforce contacts', async () => {
      const token = generateTestToken('admin');
      const syncResult = {
        sync_id: 'crm-sync-001',
        platform_type: 'salesforce',
        contacts_created: 150,
        contacts_updated: 320,
        contacts_skipped: 12,
        contacts_failed: 3,
        total_processed: 485,
        duration_ms: 45000,
        completed_at: '2026-02-25T11:00:45Z',
      };

      mockIntegrationsService.syncCrmContacts.mockResolvedValueOnce(syncResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/crm/salesforce/sync-contacts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_direction: 'bidirectional', filters: { updated_since: '2026-02-20' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contacts_created).toBe(150);
      expect(response.body.data.contacts_updated).toBe(320);
      expect(response.body.data.total_processed).toBe(485);
    });

    it('returns 200 with sync counts for HubSpot contacts', async () => {
      const token = generateTestToken('campaign_manager');
      const syncResult = {
        sync_id: 'crm-sync-002',
        platform_type: 'hubspot',
        contacts_created: 85,
        contacts_updated: 210,
        contacts_skipped: 5,
        contacts_failed: 0,
        total_processed: 300,
        duration_ms: 28000,
        completed_at: '2026-02-25T11:05:28Z',
      };

      mockIntegrationsService.syncCrmContacts.mockResolvedValueOnce(syncResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/crm/hubspot/sync-contacts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_direction: 'pull' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contacts_failed).toBe(0);
      expect(response.body.data.platform_type).toBe('hubspot');
    });
  });

  describe('GET /api/v1/integrations/crm/:platformType/contacts', () => {
    it('returns 200 with paginated contacts', async () => {
      const token = generateTestToken('viewer');
      const contactsResult = {
        data: [
          {
            id: 'contact-001',
            email: 'jane.doe@acme.com',
            first_name: 'Jane',
            last_name: 'Doe',
            company: 'Acme Corp',
            lifecycle_stage: 'customer',
            last_activity: '2026-02-24T15:30:00Z',
          },
          {
            id: 'contact-002',
            email: 'john.smith@globex.com',
            first_name: 'John',
            last_name: 'Smith',
            company: 'Globex Inc',
            lifecycle_stage: 'lead',
            last_activity: '2026-02-23T10:00:00Z',
          },
        ],
        meta: { total: 485, page: 1, totalPages: 25, limit: 20 },
      };

      mockIntegrationsService.listCrmContacts.mockResolvedValueOnce(contactsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/crm/salesforce/contacts`)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(485);
      expect(response.body.data[0].email).toBe('jane.doe@acme.com');
    });

    it('returns 200 with filtered contacts by search query', async () => {
      const token = generateTestToken('admin');
      const contactsResult = {
        data: [
          {
            id: 'contact-001',
            email: 'jane.doe@acme.com',
            first_name: 'Jane',
            last_name: 'Doe',
            company: 'Acme Corp',
            lifecycle_stage: 'customer',
            last_activity: '2026-02-24T15:30:00Z',
          },
        ],
        meta: { total: 1, page: 1, totalPages: 1, limit: 20 },
      };

      mockIntegrationsService.listCrmContacts.mockResolvedValueOnce(contactsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/crm/salesforce/contacts`)
        .set('Authorization', `Bearer ${token}`)
        .query({ search: 'acme', page: 1, limit: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.total).toBe(1);
      expect(mockIntegrationsService.listCrmContacts).toHaveBeenCalledWith(
        'salesforce',
        'test-user-id-1234',
        expect.objectContaining({ search: 'acme' }),
      );
    });
  });

  // =========================================================================
  // Analytics Operations
  // =========================================================================

  describe('POST /api/v1/integrations/analytics/:platformType/export', () => {
    it('returns 202 accepted with export ID for Looker', async () => {
      const token = generateTestToken('admin');
      const exportResult = {
        export_id: 'export-looker-001',
        platform_type: 'looker',
        status: 'processing',
        format: 'csv',
        requested_at: '2026-02-25T12:00:00Z',
        estimated_completion: '2026-02-25T12:05:00Z',
        download_url: null,
      };

      mockIntegrationsService.exportAnalyticsData.mockResolvedValueOnce(exportResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/analytics/looker/export`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          format: 'csv',
          date_range: { start: '2026-01-01', end: '2026-02-25' },
          metrics: ['impressions', 'clicks', 'conversions', 'spend'],
          dimensions: ['campaign_name', 'date', 'country'],
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.export_id).toBe('export-looker-001');
      expect(response.body.data.status).toBe('processing');
    });

    it('returns 202 accepted with export ID for Google Analytics', async () => {
      const token = generateTestToken('campaign_manager');
      const exportResult = {
        export_id: 'export-ga-001',
        platform_type: 'google_analytics',
        status: 'processing',
        format: 'json',
        requested_at: '2026-02-25T12:10:00Z',
        estimated_completion: '2026-02-25T12:12:00Z',
        download_url: null,
      };

      mockIntegrationsService.exportAnalyticsData.mockResolvedValueOnce(exportResult);

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/analytics/google_analytics/export`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          format: 'json',
          date_range: { start: '2026-02-01', end: '2026-02-25' },
          metrics: ['sessions', 'page_views', 'bounce_rate'],
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.format).toBe('json');
    });
  });

  describe('GET /api/v1/integrations/analytics/:platformType/dashboards', () => {
    it('returns 200 with paginated dashboards for Looker', async () => {
      const token = generateTestToken('viewer');
      const dashboardsResult = {
        data: [
          {
            id: 'dash-001',
            name: 'Campaign Performance Overview',
            description: 'High-level KPIs across all active campaigns',
            created_at: '2026-01-15T08:00:00Z',
            updated_at: '2026-02-25T07:00:00Z',
            widgets: 8,
            shared_with: ['admin', 'campaign_manager'],
          },
          {
            id: 'dash-002',
            name: 'Spend Analysis by Channel',
            description: 'Breakdown of ad spend across platforms',
            created_at: '2026-01-20T10:00:00Z',
            updated_at: '2026-02-24T18:00:00Z',
            widgets: 5,
            shared_with: ['admin'],
          },
          {
            id: 'dash-003',
            name: 'Conversion Funnel',
            description: 'Funnel visualization from impression to purchase',
            created_at: '2026-02-01T09:00:00Z',
            updated_at: '2026-02-23T14:00:00Z',
            widgets: 6,
            shared_with: ['admin', 'campaign_manager', 'viewer'],
          },
        ],
        meta: { total: 12, page: 1, totalPages: 4, limit: 3 },
      };

      mockIntegrationsService.listDashboards.mockResolvedValueOnce(dashboardsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/analytics/looker/dashboards`)
        .set('Authorization', `Bearer ${token}`)
        .query({ page: 1, limit: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.meta.total).toBe(12);
      expect(response.body.meta.totalPages).toBe(4);
      expect(response.body.data[0].name).toBe('Campaign Performance Overview');
    });

    it('returns 200 with empty dashboards for platform with none', async () => {
      const token = generateTestToken('admin');
      const dashboardsResult = {
        data: [],
        meta: { total: 0, page: 1, totalPages: 0, limit: 20 },
      };

      mockIntegrationsService.listDashboards.mockResolvedValueOnce(dashboardsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/integrations/analytics/google_analytics/dashboards`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });
  });

  // =========================================================================
  // Authentication edge cases
  // =========================================================================

  describe('Authentication edge cases', () => {
    it('returns 401 for expired token on connect', async () => {
      const expiredToken = jwt.sign(
        { id: 'test-user-id-1234', email: 'test@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ platform_type: 'google_ads', credentials: {} })
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for malformed token on status', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/integrations/status`)
        .set('Authorization', 'Bearer not-a-valid-jwt-token')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for missing Authorization header on sync', async () => {
      const response = await request(app)
        .post(`${API_PREFIX}/integrations/google_ads/sync`)
        .send({ sync_type: 'full' })
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for empty Bearer token on reports', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/integrations/google_ads/reports`)
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // Service error handling
  // =========================================================================

  describe('Service error handling', () => {
    it('returns 500 when service throws unexpected error on connect', async () => {
      const token = generateTestToken('admin');

      mockIntegrationsService.connectPlatform.mockRejectedValueOnce(
        new Error('Unexpected database connection failure'),
      );

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/connect`)
        .set('Authorization', `Bearer ${token}`)
        .send({ platform_type: 'google_ads', credentials: { token: 'abc' } })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('returns 500 when service throws unexpected error on sync', async () => {
      const token = generateTestToken('admin');

      mockIntegrationsService.triggerSync.mockRejectedValueOnce(
        new Error('External API rate limit exceeded'),
      );

      const response = await request(app)
        .post(`${API_PREFIX}/integrations/google_ads/sync`)
        .set('Authorization', `Bearer ${token}`)
        .send({ sync_type: 'full' })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});

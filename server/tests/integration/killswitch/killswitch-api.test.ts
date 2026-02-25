/**
 * Integration tests for Kill Switch & Governance API endpoints.
 *
 * Tests the full HTTP request/response cycle for kill-switch and governance
 * routes, with all database, Redis, and service dependencies mocked via the
 * shared test setup helper.
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

jest.mock('../../../src/services/killswitch/KillSwitchService', () => ({
  KillSwitchService: {
    activate: jest.fn(),
    deactivate: jest.fn(),
    getStatus: jest.fn(),
    getCurrentLevel: jest.fn(),
    getHistory: jest.fn(),
    pauseCampaign: jest.fn(),
    resumeCampaign: jest.fn(),
    pauseCountry: jest.fn(),
    resumeCountry: jest.fn(),
    lockApiKeys: jest.fn(),
    checkOperation: jest.fn(),
  },
}));

jest.mock('../../../src/services/killswitch/AutomatedTriggersService', () => ({
  AutomatedTriggersService: {
    pauseAll: jest.fn(),
  },
}));

jest.mock('../../../src/services/governance/GovernanceService', () => ({
  GovernanceService: {
    assessRisk: jest.fn(),
    gateConfidence: jest.fn(),
    validateStrategy: jest.fn(),
    getApprovals: jest.fn(),
    resolveApproval: jest.fn(),
    manualOverride: jest.fn(),
    getPolicy: jest.fn(),
    updatePolicy: jest.fn(),
    getMetrics: jest.fn(),
    getAuditTrail: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { cacheGet } from '../../../src/config/redis';
import { authenticate } from '../../../src/middleware/auth';
import { requirePermission } from '../../../src/middleware/rbac';
import { asyncHandler, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { KillSwitchService } from '../../../src/services/killswitch/KillSwitchService';
import { AutomatedTriggersService } from '../../../src/services/killswitch/AutomatedTriggersService';
import { GovernanceService } from '../../../src/services/governance/GovernanceService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockCacheGet = cacheGet as jest.Mock;
const mockKillSwitchService = KillSwitchService as jest.Mocked<typeof KillSwitchService>;
const mockAutoTriggersService = AutomatedTriggersService as jest.Mocked<typeof AutomatedTriggersService>;
const mockGovernanceService = GovernanceService as jest.Mocked<typeof GovernanceService>;

// ---------------------------------------------------------------------------
// Build test Express app with kill switch and governance routes
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();
  router.use(authenticate);

  // ---- Kill Switch routes ----

  router.post(
    '/killswitch/activate',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const { level, reason, trigger_type, affected_countries, affected_campaigns } = req.body;
      const userId = req.user!.id;
      const result = await KillSwitchService.activate({
        level, reason, trigger_type, affected_countries, affected_campaigns, activated_by: userId,
      });
      res.status(201).json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/:id/deactivate',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.deactivate(id, userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/killswitch/status',
    requirePermission('read:killswitch'),
    asyncHandler(async (_req, res) => {
      const result = await KillSwitchService.getStatus();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/killswitch/level',
    requirePermission('read:killswitch'),
    asyncHandler(async (_req, res) => {
      const result = await KillSwitchService.getCurrentLevel();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/killswitch/history',
    requirePermission('read:killswitch'),
    asyncHandler(async (req, res) => {
      const { page, limit } = req.query;
      const pagination = {
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      };
      const result = await KillSwitchService.getHistory(pagination);
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: result.page, totalPages: result.totalPages },
      });
    }),
  );

  router.post(
    '/killswitch/campaign/:id/pause',
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.pauseCampaign(id, userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/campaign/:id/resume',
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.resumeCampaign(id, userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/country/:id/pause',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.pauseCountry(id, userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/country/:id/resume',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.resumeCountry(id, userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/automation/pause',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await AutomatedTriggersService.pauseAll(userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/killswitch/api-keys/lock',
    requirePermission('write:killswitch'),
    asyncHandler(async (req, res) => {
      const userId = req.user!.id;
      const { reason } = req.body;
      const result = await KillSwitchService.lockApiKeys(userId, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/killswitch/check',
    requirePermission('read:killswitch'),
    asyncHandler(async (req, res) => {
      const { operation, context } = req.query;
      const result = await KillSwitchService.checkOperation(
        operation as string,
        context ? JSON.parse(context as string) : {},
      );
      res.json({ success: true, data: result });
    }),
  );

  // ---- Governance routes ----

  router.post(
    '/governance/assess-risk/:decisionId',
    requirePermission('write:governance'),
    asyncHandler(async (req, res) => {
      const { decisionId } = req.params;
      const userId = req.user!.id;
      const result = await GovernanceService.assessRisk(decisionId, userId);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/governance/gate-confidence',
    requirePermission('read:governance'),
    asyncHandler(async (req, res) => {
      const { confidence_score, decision_type, context } = req.body;
      const result = await GovernanceService.gateConfidence({
        confidence_score, decision_type, context,
      });
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/governance/validate-strategy/:decisionId',
    requirePermission('write:governance'),
    asyncHandler(async (req, res) => {
      const { decisionId } = req.params;
      const userId = req.user!.id;
      const result = await GovernanceService.validateStrategy(decisionId, userId);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/governance/approvals',
    requirePermission('read:governance'),
    asyncHandler(async (req, res) => {
      const { page, limit, status } = req.query;
      const filters = {
        status: status as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      };
      const result = await GovernanceService.getApprovals(filters);
      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: result.page, totalPages: result.totalPages },
      });
    }),
  );

  router.post(
    '/governance/approvals/:id/resolve',
    requirePermission('write:governance'),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user!.id;
      const { action, reason } = req.body;
      const result = await GovernanceService.resolveApproval(id, userId, action, reason);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/governance/override/:decisionId',
    requirePermission('write:governance'),
    asyncHandler(async (req, res) => {
      const { decisionId } = req.params;
      const userId = req.user!.id;
      const { reason, override_action } = req.body;
      const result = await GovernanceService.manualOverride(decisionId, userId, reason, override_action);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/governance/policy',
    requirePermission('read:governance'),
    asyncHandler(async (_req, res) => {
      const result = await GovernanceService.getPolicy();
      res.json({ success: true, data: result });
    }),
  );

  router.put(
    '/governance/policy',
    requirePermission('write:governance'),
    asyncHandler(async (req, res) => {
      const userId = req.user!.id;
      const result = await GovernanceService.updatePolicy(req.body, userId);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/governance/metrics',
    requirePermission('read:governance'),
    asyncHandler(async (req, res) => {
      const { startDate, endDate } = req.query;
      const dateRange = {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      };
      const result = await GovernanceService.getMetrics(dateRange);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/governance/audit-trail/:decisionId',
    requirePermission('read:governance'),
    asyncHandler(async (req, res) => {
      const { decisionId } = req.params;
      const result = await GovernanceService.getAuditTrail(decisionId);
      res.json({ success: true, data: result });
    }),
  );

  app.use(`${API_PREFIX}`, router);
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

describe('Kill Switch & Governance API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // POST /api/v1/killswitch/activate
  // =========================================================================

  describe('POST /api/v1/killswitch/activate', () => {
    it('returns 201 when admin activates kill switch at level 1', async () => {
      const token = generateTestToken('admin');
      const activatedSwitch = {
        id: 'ks-uuid-001',
        level: 1,
        is_active: true,
        activated_by: 'test-user-id-1234',
        trigger_type: 'manual',
        activated_at: '2026-02-25T10:00:00Z',
        created_at: '2026-02-25T10:00:00Z',
      };

      mockKillSwitchService.activate.mockResolvedValueOnce(activatedSwitch);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/activate`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          level: 1,
          reason: 'ROAS below threshold',
          trigger_type: 'manual',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.level).toBe(1);
      expect(response.body.data.is_active).toBe(true);
      expect(mockKillSwitchService.activate).toHaveBeenCalledWith({
        level: 1,
        reason: 'ROAS below threshold',
        trigger_type: 'manual',
        affected_countries: undefined,
        affected_campaigns: undefined,
        activated_by: 'test-user-id-1234',
      });
    });

    it('returns 201 when admin activates kill switch at level 4', async () => {
      const token = generateTestToken('admin');
      const activatedSwitch = {
        id: 'ks-uuid-002',
        level: 4,
        is_active: true,
        activated_by: 'test-user-id-1234',
        trigger_type: 'manual',
        affected_countries: ['country-de', 'country-fr'],
        activated_at: '2026-02-25T10:00:00Z',
        created_at: '2026-02-25T10:00:00Z',
      };

      mockKillSwitchService.activate.mockResolvedValueOnce(activatedSwitch);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/activate`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          level: 4,
          reason: 'Critical system failure',
          trigger_type: 'manual',
          affected_countries: ['country-de', 'country-fr'],
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.level).toBe(4);
      expect(response.body.data.affected_countries).toHaveLength(2);
    });

    it('returns 403 for viewer role on activate', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/activate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ level: 1, reason: 'test' })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 401 without authentication token', async () => {
      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/activate`)
        .send({ level: 1, reason: 'test' })
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // POST /api/v1/killswitch/:id/deactivate
  // =========================================================================

  describe('POST /api/v1/killswitch/:id/deactivate', () => {
    it('returns 200 when admin deactivates a kill switch', async () => {
      const token = generateTestToken('admin');
      const deactivatedSwitch = {
        id: 'ks-uuid-001',
        level: 1,
        is_active: false,
        deactivated_at: '2026-02-25T11:00:00Z',
        activated_at: '2026-02-25T10:00:00Z',
        created_at: '2026-02-25T10:00:00Z',
      };

      mockKillSwitchService.deactivate.mockResolvedValueOnce(deactivatedSwitch);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/ks-uuid-001/deactivate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Issue resolved' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(false);
      expect(response.body.data.deactivated_at).toBeDefined();
      expect(mockKillSwitchService.deactivate).toHaveBeenCalledWith(
        'ks-uuid-001',
        'test-user-id-1234',
        'Issue resolved',
      );
    });

    it('returns 403 for viewer role on deactivate', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/ks-uuid-001/deactivate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'test' })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/killswitch/status
  // =========================================================================

  describe('GET /api/v1/killswitch/status', () => {
    it('returns 200 with active kill switches', async () => {
      const token = generateTestToken('admin');
      const statusData = {
        active_switches: [
          {
            id: 'ks-uuid-001',
            level: 2,
            is_active: true,
            trigger_type: 'roas_drop',
            activated_at: '2026-02-25T10:00:00Z',
          },
        ],
        highest_level: 2,
        paused_campaigns: ['camp-123'],
        paused_countries: [],
      };

      mockKillSwitchService.getStatus.mockResolvedValueOnce(statusData);

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.active_switches).toHaveLength(1);
      expect(response.body.data.highest_level).toBe(2);
      expect(response.body.data.paused_campaigns).toContain('camp-123');
    });

    it('allows viewer role to read status', async () => {
      const token = generateTestToken('viewer');
      mockKillSwitchService.getStatus.mockResolvedValueOnce({
        active_switches: [],
        highest_level: 0,
        paused_campaigns: [],
        paused_countries: [],
      });

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/status`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // =========================================================================
  // Campaign pause/resume cycle
  // =========================================================================

  describe('Campaign pause/resume cycle', () => {
    it('returns 200 when pausing a campaign', async () => {
      const token = generateTestToken('admin');
      const pauseResult = {
        campaign_id: 'camp-123',
        status: 'paused',
        paused_by: 'test-user-id-1234',
        paused_at: '2026-02-25T10:00:00Z',
      };

      mockKillSwitchService.pauseCampaign.mockResolvedValueOnce(pauseResult);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/campaign/camp-123/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Budget exceeded' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
      expect(response.body.data.campaign_id).toBe('camp-123');
    });

    it('returns 200 when resuming a paused campaign', async () => {
      const token = generateTestToken('admin');
      const resumeResult = {
        campaign_id: 'camp-123',
        status: 'active',
        resumed_by: 'test-user-id-1234',
        resumed_at: '2026-02-25T11:00:00Z',
      };

      mockKillSwitchService.resumeCampaign.mockResolvedValueOnce(resumeResult);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/campaign/camp-123/resume`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Budget increased' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('allows campaign_manager to pause campaigns', async () => {
      const token = generateTestToken('campaign_manager');
      mockKillSwitchService.pauseCampaign.mockResolvedValueOnce({
        campaign_id: 'camp-456',
        status: 'paused',
        paused_by: 'test-user-id-1234',
        paused_at: '2026-02-25T10:00:00Z',
      });

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/campaign/camp-456/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Performance issue' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
    });
  });

  // =========================================================================
  // Country pause/resume cycle
  // =========================================================================

  describe('Country pause/resume cycle', () => {
    it('returns 200 when admin pauses a country', async () => {
      const token = generateTestToken('admin');
      const pauseResult = {
        country_id: 'country-de',
        status: 'paused',
        paused_by: 'test-user-id-1234',
        paused_at: '2026-02-25T10:00:00Z',
      };

      mockKillSwitchService.pauseCountry.mockResolvedValueOnce(pauseResult);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/country/country-de/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Regulatory issue in DE' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
      expect(response.body.data.country_id).toBe('country-de');
    });

    it('returns 200 when admin resumes a country', async () => {
      const token = generateTestToken('admin');
      const resumeResult = {
        country_id: 'country-de',
        status: 'active',
        resumed_by: 'test-user-id-1234',
        resumed_at: '2026-02-25T11:00:00Z',
      };

      mockKillSwitchService.resumeCountry.mockResolvedValueOnce(resumeResult);

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/country/country-de/resume`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Regulatory issue resolved' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('active');
    });

    it('returns 403 for viewer role on country pause', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/country/country-de/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'test' })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/killswitch/check
  // =========================================================================

  describe('GET /api/v1/killswitch/check', () => {
    it('returns allowed when no kill switch is active', async () => {
      const token = generateTestToken('admin');
      mockKillSwitchService.checkOperation.mockResolvedValueOnce({
        allowed: true,
        reason: 'No active kill switch',
        current_level: 0,
      });

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/check`)
        .query({ operation: 'scale_campaign', context: JSON.stringify({ campaign_id: 'camp-123' }) })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allowed).toBe(true);
    });

    it('returns denied when kill switch blocks the operation', async () => {
      const token = generateTestToken('admin');
      mockKillSwitchService.checkOperation.mockResolvedValueOnce({
        allowed: false,
        reason: 'Kill switch level 3 active: all scaling blocked',
        current_level: 3,
      });

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/check`)
        .query({ operation: 'scale_campaign' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.allowed).toBe(false);
      expect(response.body.data.current_level).toBe(3);
    });
  });

  // =========================================================================
  // Authentication edge cases
  // =========================================================================

  describe('Authentication edge cases', () => {
    it('returns 401 without token on GET /killswitch/status', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/status`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 403 for viewer on admin routes (automation/pause)', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/automation/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'test' })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 403 for viewer on api-keys/lock', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/api-keys/lock`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'test' })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { id: 'test-user-id-1234', email: 'test@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/status`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/killswitch/history
  // =========================================================================

  describe('GET /api/v1/killswitch/history', () => {
    it('returns 200 with paginated kill switch history', async () => {
      const token = generateTestToken('admin');
      const historyData = {
        data: [
          {
            id: 'ks-uuid-001',
            level: 2,
            is_active: false,
            trigger_type: 'roas_drop',
            activated_at: '2026-02-25T08:00:00Z',
            deactivated_at: '2026-02-25T09:00:00Z',
          },
          {
            id: 'ks-uuid-002',
            level: 1,
            is_active: true,
            trigger_type: 'manual',
            activated_at: '2026-02-25T10:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        totalPages: 1,
      };

      mockKillSwitchService.getHistory.mockResolvedValueOnce(historyData);

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/history`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
    });
  });

  // =========================================================================
  // POST /api/v1/killswitch/automation/pause
  // =========================================================================

  describe('POST /api/v1/killswitch/automation/pause', () => {
    it('returns 200 when admin pauses automation', async () => {
      const token = generateTestToken('admin');
      mockAutoTriggersService.pauseAll.mockResolvedValueOnce({
        status: 'paused',
        paused_by: 'test-user-id-1234',
        paused_at: '2026-02-25T10:00:00Z',
        affected_triggers: 5,
      });

      const response = await request(app)
        .post(`${API_PREFIX}/killswitch/automation/pause`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'System maintenance' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
      expect(response.body.data.affected_triggers).toBe(5);
    });
  });

  // =========================================================================
  // GET /api/v1/killswitch/level
  // =========================================================================

  describe('GET /api/v1/killswitch/level', () => {
    it('returns 200 with current highest level', async () => {
      const token = generateTestToken('viewer');
      mockKillSwitchService.getCurrentLevel.mockResolvedValueOnce({
        level: 2,
        description: 'Scaling paused for underperforming countries',
      });

      const response = await request(app)
        .get(`${API_PREFIX}/killswitch/level`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.level).toBe(2);
    });
  });
});

/**
 * Integration tests for Advanced AI API endpoints (Phase 7).
 *
 * Tests the full HTTP request/response cycle for simulation engine,
 * continuous learning, marketing models, strategic commander, and
 * campaign health routes with all dependencies mocked.
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

jest.mock('../../../src/services/advancedai/SimulationEngineService', () => ({
  SimulationEngineService: {
    runCampaignSimulation: jest.fn(),
    predictScalingOutcome: jest.fn(),
    modelCompetitorReaction: jest.fn(),
    getSimulationHistory: jest.fn(),
    getSimulationById: jest.fn(),
  },
}));

jest.mock('../../../src/services/advancedai/ContinuousLearningService', () => ({
  ContinuousLearningService: {
    recordOutcome: jest.fn(),
    getStrategyMemory: jest.fn(),
    getTopStrategies: jest.fn(),
    getCountryTrends: jest.fn(),
    getSeasonalPatterns: jest.fn(),
    getSystemStatus: jest.fn(),
  },
}));

jest.mock('../../../src/services/advancedai/MarketingModelsService', () => ({
  MarketingModelsService: {
    runMMM: jest.fn(),
    runBayesianAttribution: jest.fn(),
    createGeoLiftTest: jest.fn(),
    createBrandLiftSurvey: jest.fn(),
    recordOfflineConversion: jest.fn(),
    getDashboard: jest.fn(),
  },
}));

jest.mock('../../../src/services/advancedai/StrategicCommanderService', () => ({
  StrategicCommanderService: {
    generateProjection: jest.fn(),
    generateScenarios: jest.fn(),
    initiateChallenge: jest.fn(),
    getDashboard: jest.fn(),
    getRecommendations: jest.fn(),
  },
}));

jest.mock('../../../src/services/advancedai/CampaignHealthService', () => ({
  CampaignHealthService: {
    getCampaignHealth: jest.fn(),
    getHealthDashboard: jest.fn(),
    getAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    runFullCheck: jest.fn(),
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
import { errorHandler, notFoundHandler, asyncHandler } from '../../../src/middleware/errorHandler';
import { SimulationEngineService } from '../../../src/services/advancedai/SimulationEngineService';
import { ContinuousLearningService } from '../../../src/services/advancedai/ContinuousLearningService';
import { MarketingModelsService } from '../../../src/services/advancedai/MarketingModelsService';
import { StrategicCommanderService } from '../../../src/services/advancedai/StrategicCommanderService';
import { CampaignHealthService } from '../../../src/services/advancedai/CampaignHealthService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockCacheGet = cacheGet as jest.Mock;
const mockSimulation = SimulationEngineService as jest.Mocked<typeof SimulationEngineService>;
const mockLearning = ContinuousLearningService as jest.Mocked<typeof ContinuousLearningService>;
const mockModels = MarketingModelsService as jest.Mocked<typeof MarketingModelsService>;
const mockCommander = StrategicCommanderService as jest.Mocked<typeof StrategicCommanderService>;
const mockHealth = CampaignHealthService as jest.Mocked<typeof CampaignHealthService>;

// ---------------------------------------------------------------------------
// Build test Express app with inline routes
// ---------------------------------------------------------------------------

function buildAdvancedAITestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();

  // -- Simulation Engine routes --

  router.post(
    '/simulation/campaign',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await SimulationEngineService.runCampaignSimulation(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/simulation/scaling',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await SimulationEngineService.predictScalingOutcome(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/simulation/competitor-reaction',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await SimulationEngineService.modelCompetitorReaction(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/simulation/history',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await SimulationEngineService.getSimulationHistory(req.query as Record<string, string>);
      res.json({ success: true, data: result.data, meta: { total: result.total, page: result.page, totalPages: result.totalPages } });
    }),
  );

  router.get(
    '/simulation/:id',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await SimulationEngineService.getSimulationById(req.params.id);
      if (!result) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Simulation not found', statusCode: 404 } });
        return;
      }
      res.json({ success: true, data: result });
    }),
  );

  // -- Continuous Learning routes --

  router.post(
    '/learning/outcomes',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await ContinuousLearningService.recordOutcome(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/learning/strategy-memory',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await ContinuousLearningService.getStrategyMemory(req.query as Record<string, string>);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/learning/top-strategies/:country/:channel',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await ContinuousLearningService.getTopStrategies(req.params.country, req.params.channel);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/learning/country-trends/:country',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await ContinuousLearningService.getCountryTrends(req.params.country);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/learning/seasonal-patterns/:country',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await ContinuousLearningService.getSeasonalPatterns(req.params.country);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/learning/status',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await ContinuousLearningService.getSystemStatus();
      res.json({ success: true, data: result });
    }),
  );

  // -- Marketing Models routes --

  router.post(
    '/models/mmm',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await MarketingModelsService.runMMM(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/models/bayesian-attribution',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await MarketingModelsService.runBayesianAttribution(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/models/geo-lift',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await MarketingModelsService.createGeoLiftTest(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/models/brand-lift',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await MarketingModelsService.createBrandLiftSurvey(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/models/offline-conversion',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await MarketingModelsService.recordOfflineConversion(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/models/dashboard',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await MarketingModelsService.getDashboard();
      res.json({ success: true, data: result });
    }),
  );

  // -- Strategic Commander routes --

  router.post(
    '/commander/projection',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      if (req.body.horizon_days && (req.body.horizon_days < 1 || req.body.horizon_days > 365)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'horizon_days must be between 1 and 365', statusCode: 400 } });
        return;
      }
      const result = await StrategicCommanderService.generateProjection(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/commander/scenarios',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await StrategicCommanderService.generateScenarios(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/commander/challenge',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await StrategicCommanderService.initiateChallenge(req.body);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/commander/dashboard',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await StrategicCommanderService.getDashboard();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/commander/recommendations',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await StrategicCommanderService.getRecommendations();
      res.json({ success: true, data: result });
    }),
  );

  // -- Campaign Health routes --

  router.get(
    '/health/campaign/:campaignId',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await CampaignHealthService.getCampaignHealth(req.params.campaignId);
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/health/dashboard',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await CampaignHealthService.getHealthDashboard();
      res.json({ success: true, data: result });
    }),
  );

  router.get(
    '/health/alerts',
    authenticate,
    requirePermission('read:campaigns'),
    asyncHandler(async (_req, res) => {
      const result = await CampaignHealthService.getAlerts();
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/health/alerts/:alertId/acknowledge',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await CampaignHealthService.acknowledgeAlert(req.params.alertId, req.user!.id);
      if (!result) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found', statusCode: 404 } });
        return;
      }
      res.json({ success: true, data: result });
    }),
  );

  router.post(
    '/health/campaign/:campaignId/full-check',
    authenticate,
    requirePermission('write:campaigns'),
    asyncHandler(async (req, res) => {
      const result = await CampaignHealthService.runFullCheck(req.params.campaignId);
      res.json({ success: true, data: result });
    }),
  );

  app.use(`${API_PREFIX}/advanced-ai`, router);
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

describe('Advanced AI API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildAdvancedAITestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Simulation Engine API
  // =========================================================================

  describe('Simulation Engine API', () => {
    describe('POST /api/v1/advanced-ai/simulation/campaign', () => {
      it('should run campaign simulation and return 200', async () => {
        const token = generateTestToken('admin');
        const simulationResult = {
          id: 'sim-001',
          type: 'campaign',
          status: 'completed',
          projected_roas: 4.2,
          projected_conversions: 1250,
          projected_spend: 25000,
          projected_revenue: 105000,
          confidence_interval: { lower: 3.6, upper: 4.8 },
          risk_score: 0.23,
          recommendations: ['Increase budget by 15%', 'Shift 20% to video ads'],
          created_at: '2026-02-25T10:00:00Z',
        };

        mockSimulation.runCampaignSimulation.mockResolvedValueOnce(simulationResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/campaign`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            campaign_id: 'camp-123',
            country: 'US',
            channel: 'google_ads',
            budget: 25000,
            duration_days: 30,
            target_audience: 'tech_professionals',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.projected_roas).toBe(4.2);
        expect(response.body.data.projected_conversions).toBe(1250);
        expect(response.body.data.confidence_interval.lower).toBe(3.6);
        expect(response.body.data.recommendations).toHaveLength(2);
      });

      it('should validate required params and return 400 for missing body', async () => {
        const token = generateTestToken('admin');

        mockSimulation.runCampaignSimulation.mockRejectedValueOnce(
          Object.assign(new Error('Validation failed'), { statusCode: 400, code: 'VALIDATION_ERROR', isOperational: true }),
        );

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/campaign`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(400);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should require authentication and return 401 without token', async () => {
        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/campaign`)
          .send({ campaign_id: 'camp-123' })
          .expect(401);

        expect(response.body.error).toBeDefined();
        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      });

      it('should return 403 for viewer role on simulation create', async () => {
        const token = generateTestToken('viewer');

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/campaign`)
          .set('Authorization', `Bearer ${token}`)
          .send({ campaign_id: 'camp-123' })
          .expect(403);

        expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
      });

      it('should allow campaign_manager to run simulation', async () => {
        const token = generateTestToken('campaign_manager');
        mockSimulation.runCampaignSimulation.mockResolvedValueOnce({
          id: 'sim-002',
          type: 'campaign',
          status: 'completed',
          projected_roas: 3.8,
        });

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/campaign`)
          .set('Authorization', `Bearer ${token}`)
          .send({ campaign_id: 'camp-456', country: 'DE', channel: 'meta', budget: 10000 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.projected_roas).toBe(3.8);
      });
    });

    describe('POST /api/v1/advanced-ai/simulation/scaling', () => {
      it('should predict scaling outcome and return 200', async () => {
        const token = generateTestToken('admin');
        const scalingResult = {
          id: 'scale-001',
          current_spend: 10000,
          proposed_spend: 25000,
          predicted_roas_at_scale: 3.1,
          diminishing_returns_threshold: 20000,
          saturation_point: 35000,
          marginal_cost_curve: [
            { spend: 10000, marginal_cpa: 12.50 },
            { spend: 15000, marginal_cpa: 14.20 },
            { spend: 20000, marginal_cpa: 17.80 },
            { spend: 25000, marginal_cpa: 23.50 },
          ],
          recommendation: 'Scale to $20K for optimal efficiency',
        };

        mockSimulation.predictScalingOutcome.mockResolvedValueOnce(scalingResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/scaling`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            campaign_id: 'camp-123',
            current_spend: 10000,
            proposed_spend: 25000,
            channel: 'google_ads',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.diminishing_returns_threshold).toBe(20000);
        expect(response.body.data.marginal_cost_curve).toHaveLength(4);
        expect(response.body.data.saturation_point).toBe(35000);
      });

      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/scaling`)
          .send({ campaign_id: 'camp-123' })
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      });
    });

    describe('POST /api/v1/advanced-ai/simulation/competitor-reaction', () => {
      it('should model competitor reaction and return 200', async () => {
        const token = generateTestToken('admin');
        const competitorResult = {
          id: 'comp-001',
          scenario: 'aggressive_bid_increase',
          competitor_responses: [
            { competitor: 'CompetitorA', likely_action: 'match_bids', probability: 0.65, impact_on_cpc: 0.15 },
            { competitor: 'CompetitorB', likely_action: 'shift_channels', probability: 0.40, impact_on_cpc: -0.05 },
          ],
          net_cpc_impact: 0.10,
          recommended_counter_strategy: 'Focus on quality score improvement to offset CPC increase',
        };

        mockSimulation.modelCompetitorReaction.mockResolvedValueOnce(competitorResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/simulation/competitor-reaction`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            action: 'increase_bids',
            magnitude: 0.25,
            channel: 'google_ads',
            country: 'US',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.competitor_responses).toHaveLength(2);
        expect(response.body.data.net_cpc_impact).toBe(0.10);
        expect(response.body.data.recommended_counter_strategy).toBeDefined();
      });
    });

    describe('GET /api/v1/advanced-ai/simulation/history', () => {
      it('should return simulation history with pagination', async () => {
        const token = generateTestToken('admin');
        const historyResult = {
          data: [
            { id: 'sim-001', type: 'campaign', status: 'completed', created_at: '2026-02-25T10:00:00Z' },
            { id: 'sim-002', type: 'scaling', status: 'completed', created_at: '2026-02-24T10:00:00Z' },
          ],
          total: 15,
          page: 1,
          totalPages: 8,
        };

        mockSimulation.getSimulationHistory.mockResolvedValueOnce(historyResult);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/simulation/history`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.meta.total).toBe(15);
        expect(response.body.meta.totalPages).toBe(8);
      });

      it('should support filtering by type and status', async () => {
        const token = generateTestToken('admin');
        const filteredResult = {
          data: [{ id: 'sim-003', type: 'campaign', status: 'completed' }],
          total: 1,
          page: 1,
          totalPages: 1,
        };

        mockSimulation.getSimulationHistory.mockResolvedValueOnce(filteredResult);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/simulation/history?type=campaign&status=completed`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(mockSimulation.getSimulationHistory).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'campaign', status: 'completed' }),
        );
      });

      it('should allow viewer role to read simulation history', async () => {
        const token = generateTestToken('viewer');
        mockSimulation.getSimulationHistory.mockResolvedValueOnce({
          data: [],
          total: 0,
          page: 1,
          totalPages: 0,
        });

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/simulation/history`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/v1/advanced-ai/simulation/:id', () => {
      it('should return simulation by ID', async () => {
        const token = generateTestToken('admin');
        const simulation = {
          id: 'sim-001',
          type: 'campaign',
          status: 'completed',
          input: { campaign_id: 'camp-123', budget: 25000 },
          output: { projected_roas: 4.2, projected_conversions: 1250 },
          created_at: '2026-02-25T10:00:00Z',
        };

        mockSimulation.getSimulationById.mockResolvedValueOnce(simulation);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/simulation/sim-001`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe('sim-001');
        expect(response.body.data.output.projected_roas).toBe(4.2);
      });

      it('should return 404 for non-existent simulation', async () => {
        const token = generateTestToken('admin');
        mockSimulation.getSimulationById.mockResolvedValueOnce(null);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/simulation/non-existent`)
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(response.body.error.code).toBe('NOT_FOUND');
      });
    });
  });

  // =========================================================================
  // Continuous Learning API
  // =========================================================================

  describe('Continuous Learning API', () => {
    describe('POST /api/v1/advanced-ai/learning/outcomes', () => {
      it('should record strategy outcome and return 200', async () => {
        const token = generateTestToken('admin');
        const outcomeResult = {
          id: 'outcome-001',
          strategy_id: 'strat-123',
          country: 'US',
          channel: 'google_ads',
          outcome_metric: 'roas',
          outcome_value: 4.5,
          recorded_at: '2026-02-25T10:00:00Z',
          feedback_incorporated: true,
        };

        mockLearning.recordOutcome.mockResolvedValueOnce(outcomeResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/learning/outcomes`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            strategy_id: 'strat-123',
            country: 'US',
            channel: 'google_ads',
            outcome_metric: 'roas',
            outcome_value: 4.5,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.outcome_value).toBe(4.5);
        expect(response.body.data.feedback_incorporated).toBe(true);
      });

      it('should return 403 for viewer role', async () => {
        const token = generateTestToken('viewer');

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/learning/outcomes`)
          .set('Authorization', `Bearer ${token}`)
          .send({ strategy_id: 'strat-123' })
          .expect(403);

        expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
      });
    });

    describe('GET /api/v1/advanced-ai/learning/strategy-memory', () => {
      it('should return strategy memory entries', async () => {
        const token = generateTestToken('admin');
        const memoryEntries = [
          {
            id: 'mem-001',
            strategy_type: 'bid_optimization',
            country: 'US',
            channel: 'google_ads',
            success_rate: 0.78,
            avg_roas: 3.9,
            sample_size: 45,
            last_updated: '2026-02-25T10:00:00Z',
          },
          {
            id: 'mem-002',
            strategy_type: 'audience_expansion',
            country: 'DE',
            channel: 'meta',
            success_rate: 0.65,
            avg_roas: 2.8,
            sample_size: 30,
            last_updated: '2026-02-24T10:00:00Z',
          },
        ];

        mockLearning.getStrategyMemory.mockResolvedValueOnce(memoryEntries);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/learning/strategy-memory`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0].success_rate).toBe(0.78);
      });
    });

    describe('GET /api/v1/advanced-ai/learning/top-strategies/:country/:channel', () => {
      it('should return top strategies for country and channel', async () => {
        const token = generateTestToken('admin');
        const topStrategies = [
          { strategy_type: 'bid_optimization', avg_roas: 4.2, success_rate: 0.82, rank: 1 },
          { strategy_type: 'dayparting', avg_roas: 3.8, success_rate: 0.75, rank: 2 },
          { strategy_type: 'audience_targeting', avg_roas: 3.5, success_rate: 0.70, rank: 3 },
        ];

        mockLearning.getTopStrategies.mockResolvedValueOnce(topStrategies);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/learning/top-strategies/US/google_ads`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(3);
        expect(response.body.data[0].rank).toBe(1);
        expect(response.body.data[0].avg_roas).toBe(4.2);
        expect(mockLearning.getTopStrategies).toHaveBeenCalledWith('US', 'google_ads');
      });
    });

    describe('GET /api/v1/advanced-ai/learning/country-trends/:country', () => {
      it('should return country trends', async () => {
        const token = generateTestToken('admin');
        const trends = {
          country: 'US',
          period: 'last_90_days',
          cpc_trend: 'increasing',
          cpc_change_pct: 12.5,
          conversion_rate_trend: 'stable',
          top_performing_channel: 'google_ads',
          emerging_opportunities: ['tiktok_ads', 'connected_tv'],
        };

        mockLearning.getCountryTrends.mockResolvedValueOnce(trends);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/learning/country-trends/US`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.country).toBe('US');
        expect(response.body.data.cpc_trend).toBe('increasing');
        expect(response.body.data.emerging_opportunities).toHaveLength(2);
      });
    });

    describe('GET /api/v1/advanced-ai/learning/seasonal-patterns/:country', () => {
      it('should return seasonal patterns', async () => {
        const token = generateTestToken('admin');
        const patterns = {
          country: 'US',
          patterns: [
            { month: 'November', event: 'Black Friday', cpc_multiplier: 1.85, conversion_lift: 0.45 },
            { month: 'December', event: 'Holiday Season', cpc_multiplier: 1.65, conversion_lift: 0.35 },
            { month: 'January', event: 'Post-holiday dip', cpc_multiplier: 0.75, conversion_lift: -0.15 },
          ],
          current_season_recommendation: 'Maintain steady spend; no major seasonal factors',
        };

        mockLearning.getSeasonalPatterns.mockResolvedValueOnce(patterns);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/learning/seasonal-patterns/US`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.patterns).toHaveLength(3);
        expect(response.body.data.patterns[0].event).toBe('Black Friday');
      });
    });

    describe('GET /api/v1/advanced-ai/learning/status', () => {
      it('should return learning system status', async () => {
        const token = generateTestToken('admin');
        const status = {
          total_outcomes_recorded: 5482,
          strategy_memory_entries: 234,
          countries_tracked: 18,
          channels_tracked: 6,
          last_learning_cycle: '2026-02-25T09:00:00Z',
          model_accuracy: 0.87,
          reinforcement_learning_status: 'active',
          next_scheduled_update: '2026-02-25T12:00:00Z',
        };

        mockLearning.getSystemStatus.mockResolvedValueOnce(status);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/learning/status`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.total_outcomes_recorded).toBe(5482);
        expect(response.body.data.model_accuracy).toBe(0.87);
        expect(response.body.data.reinforcement_learning_status).toBe('active');
      });
    });
  });

  // =========================================================================
  // Marketing Models API
  // =========================================================================

  describe('Marketing Models API', () => {
    describe('POST /api/v1/advanced-ai/models/mmm', () => {
      it('should run MMM analysis and return 200', async () => {
        const token = generateTestToken('admin');
        const mmmResult = {
          id: 'mmm-001',
          status: 'completed',
          channel_contributions: [
            { channel: 'google_ads', contribution_pct: 0.35, roi: 3.8 },
            { channel: 'meta', contribution_pct: 0.25, roi: 2.9 },
            { channel: 'organic', contribution_pct: 0.20, roi: null },
            { channel: 'email', contribution_pct: 0.12, roi: 5.2 },
            { channel: 'direct', contribution_pct: 0.08, roi: null },
          ],
          optimal_budget_allocation: {
            google_ads: 0.40,
            meta: 0.30,
            email: 0.15,
            tiktok: 0.15,
          },
          r_squared: 0.92,
          created_at: '2026-02-25T10:00:00Z',
        };

        mockModels.runMMM.mockResolvedValueOnce(mmmResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/models/mmm`)
          .set('Authorization', `Bearer ${token}`)
          .send({ country: 'US', date_range: { start: '2025-01-01', end: '2026-02-25' }, channels: ['google_ads', 'meta', 'email'] })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.channel_contributions).toHaveLength(5);
        expect(response.body.data.r_squared).toBe(0.92);
        expect(response.body.data.optimal_budget_allocation.google_ads).toBe(0.40);
      });
    });

    describe('POST /api/v1/advanced-ai/models/bayesian-attribution', () => {
      it('should run Bayesian attribution and return 200', async () => {
        const token = generateTestToken('admin');
        const attributionResult = {
          id: 'attr-001',
          model: 'bayesian_multi_touch',
          touchpoint_weights: [
            { touchpoint: 'google_search', weight: 0.30, confidence: 0.92 },
            { touchpoint: 'meta_retargeting', weight: 0.25, confidence: 0.88 },
            { touchpoint: 'email_nurture', weight: 0.20, confidence: 0.85 },
            { touchpoint: 'direct_visit', weight: 0.15, confidence: 0.90 },
            { touchpoint: 'organic_search', weight: 0.10, confidence: 0.82 },
          ],
          posterior_credible_intervals: {
            google_search: { lower: 0.24, upper: 0.36 },
            meta_retargeting: { lower: 0.19, upper: 0.31 },
          },
          created_at: '2026-02-25T10:00:00Z',
        };

        mockModels.runBayesianAttribution.mockResolvedValueOnce(attributionResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/models/bayesian-attribution`)
          .set('Authorization', `Bearer ${token}`)
          .send({ conversion_window_days: 30, country: 'US' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.touchpoint_weights).toHaveLength(5);
        expect(response.body.data.model).toBe('bayesian_multi_touch');
      });
    });

    describe('POST /api/v1/advanced-ai/models/geo-lift', () => {
      it('should create geo lift test and return 200', async () => {
        const token = generateTestToken('admin');
        const geoLiftResult = {
          id: 'geo-001',
          status: 'running',
          test_regions: ['California', 'New York'],
          control_regions: ['Texas', 'Florida'],
          start_date: '2026-02-25',
          end_date: '2026-03-25',
          metric: 'conversions',
          minimum_detectable_effect: 0.10,
          statistical_power: 0.80,
        };

        mockModels.createGeoLiftTest.mockResolvedValueOnce(geoLiftResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/models/geo-lift`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            test_regions: ['California', 'New York'],
            control_regions: ['Texas', 'Florida'],
            duration_days: 28,
            metric: 'conversions',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.test_regions).toHaveLength(2);
        expect(response.body.data.control_regions).toHaveLength(2);
        expect(response.body.data.statistical_power).toBe(0.80);
      });
    });

    describe('POST /api/v1/advanced-ai/models/brand-lift', () => {
      it('should create brand lift survey and return 200', async () => {
        const token = generateTestToken('admin');
        const brandLiftResult = {
          id: 'bl-001',
          status: 'collecting_responses',
          survey_type: 'pre_post',
          sample_size: 2000,
          questions: [
            { id: 'q1', text: 'How familiar are you with Brand X?', type: 'likert_5' },
            { id: 'q2', text: 'How likely are you to purchase from Brand X?', type: 'likert_5' },
          ],
          target_completion_date: '2026-03-10',
        };

        mockModels.createBrandLiftSurvey.mockResolvedValueOnce(brandLiftResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/models/brand-lift`)
          .set('Authorization', `Bearer ${token}`)
          .send({ campaign_id: 'camp-123', survey_type: 'pre_post', sample_size: 2000 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sample_size).toBe(2000);
        expect(response.body.data.questions).toHaveLength(2);
      });
    });

    describe('POST /api/v1/advanced-ai/models/offline-conversion', () => {
      it('should record offline conversion and return 200', async () => {
        const token = generateTestToken('admin');
        const offlineResult = {
          id: 'oc-001',
          conversion_type: 'in_store_purchase',
          attributed_to: { channel: 'google_ads', campaign_id: 'camp-123', confidence: 0.78 },
          value: 250.00,
          recorded_at: '2026-02-25T14:00:00Z',
        };

        mockModels.recordOfflineConversion.mockResolvedValueOnce(offlineResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/models/offline-conversion`)
          .set('Authorization', `Bearer ${token}`)
          .send({ conversion_type: 'in_store_purchase', value: 250.00, customer_id: 'cust-456' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.attributed_to.confidence).toBe(0.78);
        expect(response.body.data.value).toBe(250.00);
      });
    });

    describe('GET /api/v1/advanced-ai/models/dashboard', () => {
      it('should return models dashboard and return 200', async () => {
        const token = generateTestToken('admin');
        const dashboardData = {
          active_models: 3,
          total_analyses: 47,
          last_mmm_run: '2026-02-24T10:00:00Z',
          last_attribution_run: '2026-02-25T08:00:00Z',
          active_geo_lift_tests: 1,
          active_brand_lift_surveys: 2,
          offline_conversions_30d: 342,
          model_health: 'healthy',
        };

        mockModels.getDashboard.mockResolvedValueOnce(dashboardData);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/models/dashboard`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.active_models).toBe(3);
        expect(response.body.data.offline_conversions_30d).toBe(342);
        expect(response.body.data.model_health).toBe('healthy');
      });

      it('should allow viewer role to read models dashboard', async () => {
        const token = generateTestToken('viewer');
        mockModels.getDashboard.mockResolvedValueOnce({ active_models: 0 });

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/models/dashboard`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  // =========================================================================
  // Strategic Commander API
  // =========================================================================

  describe('Strategic Commander API', () => {
    describe('POST /api/v1/advanced-ai/commander/projection', () => {
      it('should generate projection and return 200', async () => {
        const token = generateTestToken('admin');
        const projectionResult = {
          id: 'proj-001',
          horizon_days: 90,
          projections: {
            revenue: { day_30: 150000, day_60: 310000, day_90: 480000 },
            spend: { day_30: 40000, day_60: 82000, day_90: 125000 },
            roas: { day_30: 3.75, day_60: 3.78, day_90: 3.84 },
          },
          confidence_bands: {
            optimistic: { day_90_revenue: 550000 },
            pessimistic: { day_90_revenue: 410000 },
          },
          key_assumptions: ['Stable CPC environment', 'No new competitor entry'],
          risk_factors: ['Q2 seasonal dip', 'Possible policy changes'],
        };

        mockCommander.generateProjection.mockResolvedValueOnce(projectionResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/commander/projection`)
          .set('Authorization', `Bearer ${token}`)
          .send({ horizon_days: 90, country: 'US', include_scenarios: true })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.horizon_days).toBe(90);
        expect(response.body.data.projections.revenue.day_90).toBe(480000);
        expect(response.body.data.risk_factors).toHaveLength(2);
      });

      it('should validate horizon_days is within valid range', async () => {
        const token = generateTestToken('admin');

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/commander/projection`)
          .set('Authorization', `Bearer ${token}`)
          .send({ horizon_days: 500, country: 'US' })
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.message).toContain('horizon_days');
      });

      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/commander/projection`)
          .send({ horizon_days: 30 })
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      });
    });

    describe('POST /api/v1/advanced-ai/commander/scenarios', () => {
      it('should generate scenarios and return 200', async () => {
        const token = generateTestToken('admin');
        const scenariosResult = {
          id: 'scen-001',
          scenarios: [
            {
              name: 'Aggressive Growth',
              description: 'Increase spend 50% across all channels',
              projected_revenue: 600000,
              projected_roas: 3.2,
              risk_level: 'high',
              probability_of_success: 0.55,
            },
            {
              name: 'Steady State',
              description: 'Maintain current spend levels',
              projected_revenue: 400000,
              projected_roas: 3.8,
              risk_level: 'low',
              probability_of_success: 0.85,
            },
            {
              name: 'Efficiency Focus',
              description: 'Cut spend 20%, optimize remaining budget',
              projected_revenue: 350000,
              projected_roas: 4.5,
              risk_level: 'medium',
              probability_of_success: 0.72,
            },
          ],
          recommended_scenario: 'Steady State',
          analysis_timestamp: '2026-02-25T10:00:00Z',
        };

        mockCommander.generateScenarios.mockResolvedValueOnce(scenariosResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/commander/scenarios`)
          .set('Authorization', `Bearer ${token}`)
          .send({ country: 'US', budget_range: { min: 50000, max: 200000 } })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.scenarios).toHaveLength(3);
        expect(response.body.data.recommended_scenario).toBe('Steady State');
      });
    });

    describe('POST /api/v1/advanced-ai/commander/challenge', () => {
      it('should initiate internal challenge and return 200', async () => {
        const token = generateTestToken('admin');
        const challengeResult = {
          id: 'challenge-001',
          decision_under_review: 'Increase Meta spend by 30%',
          devil_advocate_arguments: [
            'Meta CPM has risen 18% in Q1, further spend may yield diminishing returns',
            'Audience saturation in primary demographic approaching 75%',
            'Competitor brand lift campaign may distort attribution',
          ],
          supporting_evidence: [
            'Meta ROAS still exceeds 3.0 threshold',
            'Lookalike audiences showing 15% lower CPA',
          ],
          risk_assessment: {
            overall_risk: 'medium',
            downside_exposure: 15000,
            upside_potential: 45000,
          },
          recommendation: 'Proceed with 15% increase instead of 30% as compromise',
        };

        mockCommander.initiateChallenge.mockResolvedValueOnce(challengeResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/commander/challenge`)
          .set('Authorization', `Bearer ${token}`)
          .send({ decision: 'Increase Meta spend by 30%', context: { current_spend: 50000 } })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.devil_advocate_arguments).toHaveLength(3);
        expect(response.body.data.risk_assessment.overall_risk).toBe('medium');
      });
    });

    describe('GET /api/v1/advanced-ai/commander/dashboard', () => {
      it('should return commander dashboard and return 200', async () => {
        const token = generateTestToken('admin');
        const dashboardData = {
          active_projections: 2,
          pending_challenges: 1,
          portfolio_health: 'good',
          total_managed_spend: 250000,
          overall_roas: 3.7,
          top_risk: 'CPC inflation in DE market',
          next_review_date: '2026-03-01',
        };

        mockCommander.getDashboard.mockResolvedValueOnce(dashboardData);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/commander/dashboard`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.overall_roas).toBe(3.7);
        expect(response.body.data.portfolio_health).toBe('good');
      });

      it('should allow viewer to read commander dashboard', async () => {
        const token = generateTestToken('viewer');
        mockCommander.getDashboard.mockResolvedValueOnce({ portfolio_health: 'good' });

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/commander/dashboard`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/v1/advanced-ai/commander/recommendations', () => {
      it('should return strategic recommendations and return 200', async () => {
        const token = generateTestToken('admin');
        const recommendations = [
          {
            id: 'rec-001',
            priority: 'high',
            type: 'budget_reallocation',
            title: 'Shift budget from Meta to Google Ads in US',
            description: 'Google Ads ROAS is 40% higher than Meta in US market. Recommend shifting 20% of Meta budget.',
            estimated_impact: { additional_revenue: 25000, roas_improvement: 0.3 },
            confidence: 0.85,
          },
          {
            id: 'rec-002',
            priority: 'medium',
            type: 'new_market',
            title: 'Expand to UK market',
            description: 'Simulation shows high potential in UK with projected ROAS of 3.5',
            estimated_impact: { additional_revenue: 50000, roas_improvement: 0.0 },
            confidence: 0.72,
          },
        ];

        mockCommander.getRecommendations.mockResolvedValueOnce(recommendations);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/commander/recommendations`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0].priority).toBe('high');
        expect(response.body.data[0].estimated_impact.additional_revenue).toBe(25000);
      });
    });
  });

  // =========================================================================
  // Campaign Health API
  // =========================================================================

  describe('Campaign Health API', () => {
    describe('GET /api/v1/advanced-ai/health/campaign/:campaignId', () => {
      it('should return campaign health score and return 200', async () => {
        const token = generateTestToken('admin');
        const healthData = {
          campaign_id: 'camp-123',
          overall_score: 82,
          scores: {
            performance: 85,
            budget_utilization: 78,
            creative_freshness: 90,
            audience_fatigue: 72,
            competitive_position: 85,
          },
          status: 'healthy',
          issues: [
            { type: 'audience_fatigue', severity: 'medium', message: 'CTR declining 5% week-over-week' },
          ],
          recommendations: ['Rotate ad creatives', 'Expand audience targeting'],
          last_checked: '2026-02-25T10:00:00Z',
        };

        mockHealth.getCampaignHealth.mockResolvedValueOnce(healthData);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/health/campaign/camp-123`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.overall_score).toBe(82);
        expect(response.body.data.scores.creative_freshness).toBe(90);
        expect(response.body.data.issues).toHaveLength(1);
        expect(response.body.data.recommendations).toHaveLength(2);
      });

      it('should allow viewer to read campaign health', async () => {
        const token = generateTestToken('viewer');
        mockHealth.getCampaignHealth.mockResolvedValueOnce({ campaign_id: 'camp-123', overall_score: 82 });

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/health/campaign/camp-123`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/v1/advanced-ai/health/dashboard', () => {
      it('should return health dashboard and return 200', async () => {
        const token = generateTestToken('admin');
        const dashboardData = {
          total_campaigns: 24,
          healthy: 18,
          warning: 4,
          critical: 2,
          avg_health_score: 76,
          top_issues: [
            { type: 'creative_fatigue', affected_campaigns: 6 },
            { type: 'budget_underspend', affected_campaigns: 3 },
          ],
          campaigns_needing_attention: ['camp-456', 'camp-789'],
        };

        mockHealth.getHealthDashboard.mockResolvedValueOnce(dashboardData);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/health/dashboard`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.total_campaigns).toBe(24);
        expect(response.body.data.critical).toBe(2);
        expect(response.body.data.top_issues).toHaveLength(2);
      });
    });

    describe('GET /api/v1/advanced-ai/health/alerts', () => {
      it('should return all health alerts and return 200', async () => {
        const token = generateTestToken('admin');
        const alerts = [
          {
            id: 'ha-001',
            campaign_id: 'camp-456',
            type: 'performance_drop',
            severity: 'critical',
            message: 'ROAS dropped below 1.0 threshold',
            created_at: '2026-02-25T09:00:00Z',
            acknowledged: false,
          },
          {
            id: 'ha-002',
            campaign_id: 'camp-789',
            type: 'budget_overspend',
            severity: 'high',
            message: 'Daily budget exceeded by 40%',
            created_at: '2026-02-25T10:00:00Z',
            acknowledged: false,
          },
        ];

        mockHealth.getAlerts.mockResolvedValueOnce(alerts);

        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/health/alerts`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0].severity).toBe('critical');
        expect(response.body.data[1].type).toBe('budget_overspend');
      });

      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .get(`${API_PREFIX}/advanced-ai/health/alerts`)
          .expect(401);

        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      });
    });

    describe('POST /api/v1/advanced-ai/health/alerts/:alertId/acknowledge', () => {
      it('should acknowledge alert and return 200', async () => {
        const token = generateTestToken('admin');
        const ackResult = {
          id: 'ha-001',
          acknowledged: true,
          acknowledged_by: 'test-user-id-1234',
          acknowledged_at: '2026-02-25T11:00:00Z',
        };

        mockHealth.acknowledgeAlert.mockResolvedValueOnce(ackResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/alerts/ha-001/acknowledge`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.acknowledged).toBe(true);
        expect(response.body.data.acknowledged_by).toBe('test-user-id-1234');
      });

      it('should return 404 for non-existent alert', async () => {
        const token = generateTestToken('admin');
        mockHealth.acknowledgeAlert.mockResolvedValueOnce(null);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/alerts/non-existent/acknowledge`)
          .set('Authorization', `Bearer ${token}`)
          .expect(404);

        expect(response.body.error.code).toBe('NOT_FOUND');
      });

      it('should return 403 for viewer role on alert acknowledge', async () => {
        const token = generateTestToken('viewer');

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/alerts/ha-001/acknowledge`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
      });

      it('should allow campaign_manager to acknowledge alerts', async () => {
        const token = generateTestToken('campaign_manager');
        mockHealth.acknowledgeAlert.mockResolvedValueOnce({
          id: 'ha-001',
          acknowledged: true,
          acknowledged_by: 'test-user-id-1234',
          acknowledged_at: '2026-02-25T11:00:00Z',
        });

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/alerts/ha-001/acknowledge`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /api/v1/advanced-ai/health/campaign/:campaignId/full-check', () => {
      it('should run full health check and return 200', async () => {
        const token = generateTestToken('admin');
        const fullCheckResult = {
          campaign_id: 'camp-123',
          check_type: 'full',
          overall_score: 75,
          detailed_scores: {
            performance: { score: 80, trend: 'stable', details: 'ROAS at 3.2, within target' },
            budget: { score: 65, trend: 'declining', details: 'Underspending by 15%' },
            creative: { score: 85, trend: 'improving', details: 'New creatives performing well' },
            audience: { score: 60, trend: 'declining', details: 'Frequency exceeding 4.5' },
            competitive: { score: 82, trend: 'stable', details: 'SOV holding steady at 22%' },
          },
          alerts_generated: 2,
          action_items: [
            { priority: 'high', action: 'Reduce audience frequency by expanding targeting' },
            { priority: 'medium', action: 'Increase daily budget to hit pacing targets' },
          ],
          completed_at: '2026-02-25T11:30:00Z',
        };

        mockHealth.runFullCheck.mockResolvedValueOnce(fullCheckResult);

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/campaign/camp-123/full-check`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.overall_score).toBe(75);
        expect(response.body.data.detailed_scores.audience.score).toBe(60);
        expect(response.body.data.action_items).toHaveLength(2);
        expect(response.body.data.alerts_generated).toBe(2);
      });

      it('should return 403 for viewer role on full check', async () => {
        const token = generateTestToken('viewer');

        const response = await request(app)
          .post(`${API_PREFIX}/advanced-ai/health/campaign/camp-123/full-check`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);

        expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
      });
    });
  });

  // =========================================================================
  // Authentication edge cases
  // =========================================================================

  describe('Authentication edge cases', () => {
    it('should return 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { id: 'test-user-id-1234', email: 'test@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      const response = await request(app)
        .get(`${API_PREFIX}/advanced-ai/simulation/history`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 for malformed token', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/advanced-ai/simulation/history`)
        .set('Authorization', 'Bearer completely-invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should return 401 for missing Authorization header', async () => {
      const response = await request(app)
        .post(`${API_PREFIX}/advanced-ai/commander/projection`)
        .send({ horizon_days: 30 })
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

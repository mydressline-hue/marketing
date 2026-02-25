/**
 * Integration tests for Agent API endpoints.
 *
 * Tests the full HTTP request/response cycle for agent-related routes,
 * with all database, Redis, and AI service dependencies mocked via the
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

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import { authenticate } from '../../../src/middleware/auth';
import { requirePermission } from '../../../src/middleware/rbac';
import { asyncHandler, errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

import type { AgentType, AgentStatus, AgentState, AgentDecision } from '../../../src/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// All 20 agent types
// ---------------------------------------------------------------------------

const ALL_AGENT_TYPES: AgentType[] = [
  'market_intelligence',
  'country_strategy',
  'paid_ads',
  'organic_social',
  'content_blog',
  'creative_generation',
  'performance_analytics',
  'budget_optimization',
  'ab_testing',
  'conversion_optimization',
  'shopify_integration',
  'localization',
  'compliance',
  'competitive_intelligence',
  'fraud_detection',
  'brand_consistency',
  'data_engineering',
  'enterprise_security',
  'revenue_forecasting',
  'master_orchestrator',
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function createMockAgentState(agentType: AgentType, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: `agent-${agentType}-uuid`,
    agent_type: agentType,
    status: 'idle' as AgentStatus,
    last_run_at: '2026-02-20T10:00:00Z',
    next_run_at: '2026-02-20T11:00:00Z',
    config: { schedule: '0 * * * *', enabled: true },
    metrics: { total_runs: 42, avg_duration_ms: 1500 },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
    ...overrides,
  };
}

function createMockDecision(agentType: AgentType, overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    id: `decision-${agentType}-uuid`,
    agent_type: agentType,
    decision_type: 'recommendation',
    input_data: { market: 'US', channel: 'google' },
    output_data: { action: 'increase_budget', amount: 5000 },
    confidence_score: 0.87,
    reasoning: 'Performance metrics indicate 15% ROAS improvement potential.',
    is_approved: false,
    created_at: '2026-02-20T10:05:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Build test Express app with agent routes
// ---------------------------------------------------------------------------

function buildAgentTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();

  // All agent routes require authentication
  router.use(authenticate);

  // GET /agents - list all agents
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const result = await (pool as any).query(
        'SELECT * FROM agent_states ORDER BY agent_type',
      );
      res.json({ success: true, data: result.rows });
    }),
  );

  // GET /agents/costs - return cost summary
  router.get(
    '/costs',
    asyncHandler(async (_req, res) => {
      const result = await (pool as any).query(
        'SELECT agent_type, SUM(cost) as total_cost, COUNT(*) as total_runs FROM agent_runs GROUP BY agent_type',
      );
      const totalResult = await (pool as any).query(
        'SELECT SUM(cost) as total_cost FROM agent_runs',
      );
      res.json({
        success: true,
        data: {
          agents: result.rows,
          total_cost: parseFloat(totalResult.rows[0]?.total_cost || '0'),
        },
      });
    }),
  );

  // GET /agents/:type - get specific agent
  router.get(
    '/:type',
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      const result = await (pool as any).query(
        'SELECT * FROM agent_states WHERE agent_type = $1',
        [type],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Agent '${type}' not found`, statusCode: 404 },
        });
      }
      res.json({ success: true, data: result.rows[0] });
    }),
  );

  // POST /agents/:type/run - trigger agent run (write operation)
  router.post(
    '/:type/run',
    requirePermission('write:agents'),
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      const agentResult = await (pool as any).query(
        'SELECT * FROM agent_states WHERE agent_type = $1',
        [type],
      );
      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Agent '${type}' not found`, statusCode: 404 },
        });
      }
      const agent = agentResult.rows[0];
      if (agent.status === 'running') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Agent is already running', statusCode: 400 },
        });
      }
      // Update agent status to running
      const updated = await (pool as any).query(
        'UPDATE agent_states SET status = $1, last_run_at = NOW() WHERE agent_type = $2 RETURNING *',
        ['running', type],
      );
      // Insert a decision record
      await (pool as any).query(
        'INSERT INTO agent_decisions (id, agent_type, decision_type, input_data, output_data, confidence_score, reasoning) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['test-uuid-generated', type, 'auto_run', req.body.input || {}, {}, 0, 'Triggered via API'],
      );
      res.json({ success: true, data: updated.rows[0] });
    }),
  );

  // POST /agents/:type/pause - pause agent (write operation)
  router.post(
    '/:type/pause',
    requirePermission('write:agents'),
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      const agentResult = await (pool as any).query(
        'SELECT * FROM agent_states WHERE agent_type = $1',
        [type],
      );
      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Agent '${type}' not found`, statusCode: 404 },
        });
      }
      const agent = agentResult.rows[0];
      if (agent.status === 'paused') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Agent is already paused', statusCode: 400 },
        });
      }
      const updated = await (pool as any).query(
        'UPDATE agent_states SET status = $1 WHERE agent_type = $2 RETURNING *',
        ['paused', type],
      );
      res.json({ success: true, data: updated.rows[0] });
    }),
  );

  // GET /agents/:type/decisions - paginated decisions
  router.get(
    '/:type/decisions',
    asyncHandler(async (req, res) => {
      const { type } = req.params;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const offset = (page - 1) * limit;

      const countResult = await (pool as any).query(
        'SELECT COUNT(*) as count FROM agent_decisions WHERE agent_type = $1',
        [type],
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await (pool as any).query(
        'SELECT * FROM agent_decisions WHERE agent_type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [type, limit, offset],
      );

      res.json({
        success: true,
        data: dataResult.rows,
        meta: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      });
    }),
  );

  // POST /agents/orchestrate - trigger orchestration (write operation)
  router.post(
    '/orchestrate',
    requirePermission('write:agents'),
    asyncHandler(async (_req, res) => {
      // Fetch all agent states
      const agentsResult = await (pool as any).query(
        'SELECT * FROM agent_states ORDER BY agent_type',
      );
      // Insert orchestration record
      const orchestrationResult = await (pool as any).query(
        'INSERT INTO orchestration_runs (id, status, agents_involved, output) VALUES ($1, $2, $3, $4) RETURNING *',
        [
          'test-uuid-generated',
          'completed',
          agentsResult.rows.map((a: AgentState) => a.agent_type),
          { summary: 'Orchestration complete', decisions: agentsResult.rows.length },
        ],
      );
      res.json({ success: true, data: orchestrationResult.rows[0] });
    }),
  );

  app.use(`${API_PREFIX}/agents`, router);
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

describe('Agent API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildAgentTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /api/v1/agents
  // =========================================================================

  describe('GET /api/v1/agents', () => {
    it('returns 200 with list of all agents', async () => {
      const token = generateTestToken('admin');
      const mockAgents = [
        createMockAgentState('market_intelligence'),
        createMockAgentState('country_strategy'),
        createMockAgentState('paid_ads'),
      ];

      mockPool.query.mockResolvedValueOnce({
        rows: mockAgents,
        rowCount: mockAgents.length,
      });

      const response = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].agent_type).toBe('market_intelligence');
      expect(response.body.data[1].agent_type).toBe('country_strategy');
      expect(response.body.data[2].agent_type).toBe('paid_ads');
    });

    it('returns 200 with empty list when no agents are registered', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('returns 401 without authentication token', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/agents/:type
  // =========================================================================

  describe('GET /api/v1/agents/:type', () => {
    it('returns 200 with specific agent data', async () => {
      const token = generateTestToken('admin');
      const mockAgent = createMockAgentState('performance_analytics');

      mockPool.query.mockResolvedValueOnce({
        rows: [mockAgent],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/v1/agents/performance_analytics')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent_type).toBe('performance_analytics');
      expect(response.body.data.status).toBe('idle');
      expect(response.body.data.config).toBeDefined();
      expect(response.body.data.metrics).toBeDefined();
    });

    it('returns 404 for non-existent agent type', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/v1/agents/nonexistent_agent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('allows viewer role to read agent data', async () => {
      const token = generateTestToken('viewer');
      const mockAgent = createMockAgentState('market_intelligence');

      mockPool.query.mockResolvedValueOnce({
        rows: [mockAgent],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/v1/agents/market_intelligence')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agent_type).toBe('market_intelligence');
    });
  });

  // =========================================================================
  // POST /api/v1/agents/:type/run
  // =========================================================================

  describe('POST /api/v1/agents/:type/run', () => {
    it('returns 200 when admin triggers an agent run', async () => {
      const token = generateTestToken('admin');
      const idleAgent = createMockAgentState('paid_ads', { status: 'idle' });
      const runningAgent = createMockAgentState('paid_ads', { status: 'running' });

      // SELECT agent
      mockPool.query.mockResolvedValueOnce({ rows: [idleAgent], rowCount: 1 });
      // UPDATE status to running
      mockPool.query.mockResolvedValueOnce({ rows: [runningAgent], rowCount: 1 });
      // INSERT decision
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const response = await request(app)
        .post('/api/v1/agents/paid_ads/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ input: { campaign_id: 'camp-123' } })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('running');
      expect(response.body.data.agent_type).toBe('paid_ads');
    });

    it('returns 400 when agent is already running', async () => {
      const token = generateTestToken('admin');
      const runningAgent = createMockAgentState('paid_ads', { status: 'running' });

      mockPool.query.mockResolvedValueOnce({ rows: [runningAgent], rowCount: 1 });

      const response = await request(app)
        .post('/api/v1/agents/paid_ads/run')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('already running');
    });

    it('returns 403 for viewer role on run operation', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post('/api/v1/agents/paid_ads/run')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 404 when triggering run for non-existent agent', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post('/api/v1/agents/nonexistent_agent/run')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // POST /api/v1/agents/:type/pause
  // =========================================================================

  describe('POST /api/v1/agents/:type/pause', () => {
    it('returns 200 when admin pauses a running agent', async () => {
      const token = generateTestToken('admin');
      const runningAgent = createMockAgentState('budget_optimization', { status: 'running' });
      const pausedAgent = createMockAgentState('budget_optimization', { status: 'paused' });

      mockPool.query.mockResolvedValueOnce({ rows: [runningAgent], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [pausedAgent], rowCount: 1 });

      const response = await request(app)
        .post('/api/v1/agents/budget_optimization/pause')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paused');
    });

    it('returns 400 when agent is already paused', async () => {
      const token = generateTestToken('admin');
      const pausedAgent = createMockAgentState('budget_optimization', { status: 'paused' });

      mockPool.query.mockResolvedValueOnce({ rows: [pausedAgent], rowCount: 1 });

      const response = await request(app)
        .post('/api/v1/agents/budget_optimization/pause')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('already paused');
    });

    it('returns 403 for viewer role on pause operation', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post('/api/v1/agents/budget_optimization/pause')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/agents/:type/decisions
  // =========================================================================

  describe('GET /api/v1/agents/:type/decisions', () => {
    it('returns 200 with paginated decisions', async () => {
      const token = generateTestToken('admin');
      const decisions = [
        createMockDecision('market_intelligence'),
        createMockDecision('market_intelligence', {
          id: 'decision-mi-2',
          confidence_score: 0.92,
        }),
      ];

      // COUNT query
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      // SELECT decisions
      mockPool.query.mockResolvedValueOnce({ rows: decisions, rowCount: 2 });

      const response = await request(app)
        .get('/api/v1/agents/market_intelligence/decisions?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.totalPages).toBe(1);
    });

    it('returns 200 with empty list when no decisions exist', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .get('/api/v1/agents/market_intelligence/decisions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });

    it('handles pagination parameters correctly', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .get('/api/v1/agents/market_intelligence/decisions?page=3&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.meta.total).toBe(50);
      expect(response.body.meta.page).toBe(3);
      expect(response.body.meta.totalPages).toBe(5);

      // Verify offset calculation: (page - 1) * limit = 20
      const selectCall = mockPool.query.mock.calls[1];
      expect(selectCall[1]).toContain(10); // limit
      expect(selectCall[1]).toContain(20); // offset
    });
  });

  // =========================================================================
  // POST /api/v1/agents/orchestrate
  // =========================================================================

  describe('POST /api/v1/agents/orchestrate', () => {
    it('returns 200 when admin triggers orchestration', async () => {
      const token = generateTestToken('admin');
      const agents = ALL_AGENT_TYPES.slice(0, 5).map((type) => createMockAgentState(type));
      const orchestrationResult = {
        id: 'test-uuid-generated',
        status: 'completed',
        agents_involved: agents.map((a) => a.agent_type),
        output: { summary: 'Orchestration complete', decisions: 5 },
      };

      // SELECT all agent states
      mockPool.query.mockResolvedValueOnce({ rows: agents, rowCount: agents.length });
      // INSERT orchestration run
      mockPool.query.mockResolvedValueOnce({ rows: [orchestrationResult], rowCount: 1 });

      const response = await request(app)
        .post('/api/v1/agents/orchestrate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.agents_involved).toHaveLength(5);
    });

    it('returns 403 for viewer role on orchestrate', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post('/api/v1/agents/orchestrate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/agents/orchestrate')
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // =========================================================================
  // GET /api/v1/agents/costs
  // =========================================================================

  describe('GET /api/v1/agents/costs', () => {
    it('returns 200 with cost summary', async () => {
      const token = generateTestToken('admin');
      const costRows = [
        { agent_type: 'market_intelligence', total_cost: '12.50', total_runs: '25' },
        { agent_type: 'paid_ads', total_cost: '45.00', total_runs: '100' },
        { agent_type: 'compliance', total_cost: '8.75', total_runs: '15' },
      ];

      // Per-agent cost query
      mockPool.query.mockResolvedValueOnce({ rows: costRows, rowCount: 3 });
      // Total cost query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ total_cost: '66.25' }],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/v1/agents/costs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toHaveLength(3);
      expect(response.body.data.total_cost).toBe(66.25);
    });

    it('returns 200 with zero cost when no runs exist', async () => {
      const token = generateTestToken('admin');

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ total_cost: null }], rowCount: 1 });

      const response = await request(app)
        .get('/api/v1/agents/costs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toHaveLength(0);
      expect(response.body.data.total_cost).toBe(0);
    });
  });

  // =========================================================================
  // Authentication edge cases
  // =========================================================================

  describe('Authentication edge cases', () => {
    it('returns 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { id: 'test-user-id-1234', email: 'test@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      const response = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for malformed token', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', 'Bearer not-a-valid-jwt-token')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

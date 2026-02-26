/**
 * End-to-end workflow tests for the 90-Day Execution Roadmap.
 *
 * Tests the complete workflow from API request through service layer to
 * response, validating the entire data pipeline including phase building,
 * milestone generation, critical path, resource requirements, and KPI targets.
 * Database and Redis are mocked to isolate from external dependencies.
 */

// ---------------------------------------------------------------------------
// Mocks
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

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import finalOutputsRoadmapRoutes from '../../../src/routes/final-outputs-roadmap.routes';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/final-outputs', finalOutputsRoadmapRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

function generateTestToken(role = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Comprehensive fixture data simulating a realistic orchestrator state
// ---------------------------------------------------------------------------

const REALISTIC_ORCHESTRATION = {
  id: 'orch-e2e-1',
  request_id: 'req-e2e-1',
  overall_confidence: 82.5,
  contradictions_found: 4,
  contradictions_resolved: 3,
  challenge_cycles_run: 2,
  actions_assigned: 8,
  reasoning: 'Orchestration aggregated 19 of 19 agents. Average confidence: 76.3. Detected 4 contradictions (1 critical). 3 resolved via 6 cross-challenges.',
  completed_at: '2026-02-20T12:00:00Z',
};

const REALISTIC_ACTIONS = [
  {
    id: 'act-e2e-1',
    type: 'compliance_enforcement',
    description: 'Enforce GDPR and CCPA data handling across all campaigns',
    assigned_agent: 'compliance',
    priority: 'critical',
    deadline: null,
    dependencies: '[]',
    status: 'pending',
    source_entry_agent: 'compliance',
    confidence_score: 92,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-2',
    type: 'security_action',
    description: 'Implement API security audit and key rotation schedule',
    assigned_agent: 'enterprise_security',
    priority: 'critical',
    deadline: null,
    dependencies: '[]',
    status: 'pending',
    source_entry_agent: 'enterprise_security',
    confidence_score: 88,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-3',
    type: 'analytics_review',
    description: 'Set up cross-country analytics dashboards and KPI tracking',
    assigned_agent: 'performance_analytics',
    priority: 'high',
    deadline: null,
    dependencies: '["act-e2e-2"]',
    status: 'pending',
    source_entry_agent: 'performance_analytics',
    confidence_score: 81,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-4',
    type: 'campaign_management',
    description: 'Launch Google Ads campaigns in DE, FR, and US markets',
    assigned_agent: 'paid_ads',
    priority: 'high',
    deadline: null,
    dependencies: '["act-e2e-1", "act-e2e-3"]',
    status: 'pending',
    source_entry_agent: 'paid_ads',
    confidence_score: 76,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-5',
    type: 'content_creation',
    description: 'Create localized blog content for top 5 target markets',
    assigned_agent: 'content_blog',
    priority: 'medium',
    deadline: null,
    dependencies: '["act-e2e-1"]',
    status: 'pending',
    source_entry_agent: 'content_blog',
    confidence_score: 70,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-6',
    type: 'localization_task',
    description: 'Localize ad copy and landing pages for DE, FR, JP markets',
    assigned_agent: 'localization',
    priority: 'medium',
    deadline: null,
    dependencies: '["act-e2e-5"]',
    status: 'pending',
    source_entry_agent: 'localization',
    confidence_score: 67,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-7',
    type: 'experiment_management',
    description: 'A/B test landing page variants across markets',
    assigned_agent: 'ab_testing',
    priority: 'low',
    deadline: null,
    dependencies: '["act-e2e-4"]',
    status: 'pending',
    source_entry_agent: 'ab_testing',
    confidence_score: 58,
    created_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 'act-e2e-8',
    type: 'budget_reallocation',
    description: 'Optimize budget allocation based on initial campaign performance',
    assigned_agent: 'budget_optimization',
    priority: 'low',
    deadline: null,
    dependencies: '["act-e2e-3", "act-e2e-4"]',
    status: 'pending',
    source_entry_agent: 'budget_optimization',
    confidence_score: 62,
    created_at: '2026-02-20T12:00:00Z',
  },
];

const REALISTIC_MATRIX = {
  id: 'matrix-e2e-1',
  overall_confidence: 80.2,
  generated_by: 'master_orchestrator',
  request_id: 'req-e2e-1',
  entries: JSON.stringify([
    { agent: 'compliance', decision: 'Enforce GDPR and CCPA across all markets', confidence: 92, approved: true, action: 'Implement compliance framework', priority: 1 },
    { agent: 'enterprise_security', decision: 'Secure all API endpoints and rotate keys', confidence: 88, approved: true, action: 'Security audit', priority: 1 },
    { agent: 'performance_analytics', decision: 'Deploy analytics dashboards for all markets', confidence: 81, approved: true, action: 'Analytics setup', priority: 2 },
    { agent: 'paid_ads', decision: 'Launch multi-market Google Ads campaigns', confidence: 76, approved: true, action: 'Ad campaigns in DE, FR, US', priority: 3 },
    { agent: 'content_blog', decision: 'Create localized content for priority markets', confidence: 70, approved: true, action: 'Localized blog posts', priority: 5 },
    { agent: 'localization', decision: 'Localize marketing materials for DE, FR, JP', confidence: 67, approved: true, action: 'Translation and localization', priority: 5 },
    { agent: 'ab_testing', decision: 'Run landing page experiments', confidence: 58, approved: false, action: 'A/B tests', priority: 7 },
    { agent: 'budget_optimization', decision: 'Reallocate budget based on performance', confidence: 62, approved: false, action: 'Budget reallocation', priority: 8 },
  ]),
  created_at: '2026-02-20T12:00:00Z',
};

const REALISTIC_COUNTRIES = [
  { code: 'DE', name: 'Germany', is_active: true },
  { code: 'FR', name: 'France', is_active: true },
  { code: 'US', name: 'United States', is_active: true },
  { code: 'JP', name: 'Japan', is_active: true },
  { code: 'GB', name: 'United Kingdom', is_active: true },
];

const REALISTIC_KPIS = [
  { name: 'ROAS', value: 3.2, previous_value: 2.8, change_percent: 14.3, trend: 'up', period: '2026-02' },
  { name: 'CPA', value: 25.50, previous_value: 30.00, change_percent: -15.0, trend: 'down', period: '2026-02' },
  { name: 'CTR', value: 2.1, previous_value: 1.9, change_percent: 10.5, trend: 'up', period: '2026-02' },
  { name: 'Conversion Rate', value: 3.8, previous_value: 3.5, change_percent: 8.6, trend: 'up', period: '2026-02' },
];

function setupRealisticDBResponses() {
  mockQuery
    .mockResolvedValueOnce({ rows: [REALISTIC_ORCHESTRATION] })
    .mockResolvedValueOnce({ rows: REALISTIC_ACTIONS })
    .mockResolvedValueOnce({ rows: [REALISTIC_MATRIX] })
    .mockResolvedValueOnce({ rows: REALISTIC_COUNTRIES })
    .mockResolvedValueOnce({ rows: REALISTIC_KPIS });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Execution Roadmap Workflow (E2E)', () => {
  let app: express.Express;
  let token: string;

  beforeAll(() => {
    app = createTestApp();
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // Full workflow: generate roadmap and validate all components
  // -----------------------------------------------------------------------

  it('generates a complete roadmap from realistic orchestrator data', async () => {
    setupRealisticDBResponses();

    const res = await request(app)
      .get('/api/v1/final-outputs/execution-roadmap')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;

    // Validate top-level structure
    expect(data.roadmap.phase_1_days_1_30.name).toContain('Foundation');
    expect(data.roadmap.phase_2_days_31_60.name).toContain('Execution');
    expect(data.roadmap.phase_3_days_61_90.name).toContain('Optimization');

    // Milestones should cover all 8 actions
    expect(data.milestones.length).toBe(8);

    // Critical path should include critical and high priority items
    expect(data.critical_path.length).toBeGreaterThan(0);
    expect(data.critical_path.length).toBeLessThanOrEqual(4);

    // Resource requirements
    expect(data.resource_requirements.agents_required).toBeGreaterThanOrEqual(6);
    expect(data.resource_requirements.api_integrations.length).toBeGreaterThan(0);

    // KPI targets
    expect(data.kpi_targets.length).toBe(4);
    expect(data.kpi_targets[0].kpi).toBe('ROAS');

    // Confidence should reflect the orchestration data
    expect(data.confidence_score).toBeGreaterThan(50);
    expect(data.confidence_score).toBeLessThanOrEqual(100);
  });

  // -----------------------------------------------------------------------
  // Phase-by-phase validation
  // -----------------------------------------------------------------------

  it('phase 1 contains critical and high-priority actions for foundation', async () => {
    setupRealisticDBResponses();

    const res = await request(app)
      .get('/api/v1/final-outputs/execution-roadmap/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const phase = res.body.data;

    expect(phase.name).toContain('Foundation');
    // Phase 1 should include compliance and security (critical) and analytics (high)
    const agentTypes = phase.key_actions.map((a: any) => a.responsible_agent);
    expect(agentTypes).toContain('compliance');
    expect(agentTypes).toContain('enterprise_security');

    // Country scope should include our active countries
    for (const action of phase.key_actions) {
      expect(action.country_scope.length).toBeGreaterThan(0);
    }
  });

  it('phase 2 contains execution and growth actions', async () => {
    setupRealisticDBResponses();

    const res = await request(app)
      .get('/api/v1/final-outputs/execution-roadmap/2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const phase = res.body.data;
    expect(phase.name).toContain('Execution');
    // Phase 2 should include campaign and content actions
    const actionTypes = phase.key_actions.map((a: any) => a.responsible_agent);
    // paid_ads is high priority and campaign_management type -> included in phase 2
    expect(actionTypes).toContain('paid_ads');
  });

  // -----------------------------------------------------------------------
  // Milestone workflow with completion tracking
  // -----------------------------------------------------------------------

  it('returns milestone status with completion tracking', async () => {
    setupRealisticDBResponses();
    // Mock completed milestones query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          title: 'compliance enforcement - compliance',
          completed_at: '2026-02-25T15:00:00Z',
        },
      ],
    });

    const res = await request(app)
      .get('/api/v1/final-outputs/execution-roadmap/milestones')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;

    expect(data.total).toBe(8);
    expect(data.completed).toBe(1);
    expect(data.completion_percentage).toBeGreaterThan(0);
    expect(typeof data.in_progress).toBe('number');
    expect(typeof data.pending).toBe('number');

    // Check the completed milestone
    const completedMilestone = data.milestones.find(
      (m: any) => m.completed === true,
    );
    expect(completedMilestone).toBeDefined();
    expect(completedMilestone.completed_at).toBe('2026-02-25T15:00:00Z');
  });

  // -----------------------------------------------------------------------
  // Data integrity: no hardcoded values
  // -----------------------------------------------------------------------

  it('roadmap data is derived from DB inputs, not hardcoded', async () => {
    // Use a different set of data to verify no hardcoding
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'orch-alt',
          request_id: 'req-alt',
          overall_confidence: 55,
          contradictions_found: 0,
          contradictions_resolved: 0,
          challenge_cycles_run: 0,
          actions_assigned: 1,
          reasoning: 'Single agent responded.',
          completed_at: '2026-02-22T08:00:00Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'act-alt-1',
          type: 'market_research',
          description: 'Analyze LATAM market opportunities',
          assigned_agent: 'market_intelligence',
          priority: 'high',
          deadline: null,
          dependencies: '[]',
          status: 'pending',
          source_entry_agent: 'market_intelligence',
          confidence_score: 60,
          created_at: '2026-02-22T08:00:00Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'matrix-alt',
          overall_confidence: 60,
          generated_by: 'master_orchestrator',
          request_id: 'req-alt',
          entries: JSON.stringify([
            { agent: 'market_intelligence', decision: 'LATAM shows promise', confidence: 60, approved: false, action: 'LATAM analysis', priority: 6 },
          ]),
          created_at: '2026-02-22T08:00:00Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ code: 'BR', name: 'Brazil', is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ name: 'Market Share', value: 1.5, previous_value: 1.2, change_percent: 25, trend: 'up', period: '2026-02' }],
      });

    const res = await request(app)
      .get('/api/v1/final-outputs/execution-roadmap')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data = res.body.data;

    // Milestones should reflect the single action
    expect(data.milestones.length).toBe(1);
    expect(data.milestones[0].description).toContain('LATAM');
    expect(data.milestones[0].owner_agent).toBe('market_intelligence');

    // KPI should be Market Share, not ROAS
    expect(data.kpi_targets.length).toBe(1);
    expect(data.kpi_targets[0].kpi).toBe('Market Share');

    // Resource requirements should reflect single agent
    expect(data.resource_requirements.agents_required).toBe(1);

    // Country scope should be Brazil
    const phase1 = data.roadmap.phase_1_days_1_30;
    if (phase1.key_actions.length > 0) {
      expect(phase1.key_actions[0].country_scope).toContain('BR');
    }
  });
});

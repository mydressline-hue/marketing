/**
 * E2E tests for System-Wide Confidence Score workflow.
 *
 * Tests full confidence score workflows including:
 *   - System score computation from simulated agent states
 *   - Low-confidence alert generation
 *   - Category score aggregation
 *   - Historical trend computation
 *   - Per-agent detailed breakdown
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';
import {
  ConfidenceScoreOutputService,
  scoreToGrade,
} from '../../../src/services/final-outputs/ConfidenceScoreOutputService';
import type { AgentType } from '../../../src/types';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Simulator: builds realistic DB query responses
// ---------------------------------------------------------------------------

const ALL_AGENTS: AgentType[] = [
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

interface SimulatedAgent {
  type: AgentType;
  confidence: number;
  dataQuality: number;
  decisionCount: number;
  uncertainties: string[];
  warnings: string[];
}

function buildSimulation(agents: SimulatedAgent[]) {
  const now = '2026-02-25T12:00:00Z';

  const decisionRows = agents.map((a) => ({
    agent_type: a.type,
    confidence_score: String(a.confidence),
    last_updated: now,
    decision_count: String(a.decisionCount),
  }));

  const stateRows = agents.map((a) => ({
    agent_type: a.type,
    metrics: { data_quality_score: a.dataQuality },
    updated_at: now,
  }));

  const uncertaintyRows = agents
    .filter((a) => a.uncertainties.length > 0 || a.warnings.length > 0)
    .map((a) => ({
      agent_type: a.type,
      output_data: { uncertainties: a.uncertainties, warnings: a.warnings },
    }));

  return { decisionRows, stateRows, uncertaintyRows };
}

function setupQueryMocks(
  decisionRows: unknown[],
  stateRows: unknown[],
  uncertaintyRows: unknown[],
  trendRows: unknown[] = [],
) {
  mockQuery
    .mockResolvedValueOnce({ rows: decisionRows })
    .mockResolvedValueOnce({ rows: stateRows })
    .mockResolvedValueOnce({ rows: uncertaintyRows })
    .mockResolvedValueOnce({ rows: trendRows });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Confidence Score E2E Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  describe('Full system score computation with all 20 agents', () => {
    it('should compute system score when all agents report high confidence', async () => {
      const highConfidenceAgents: SimulatedAgent[] = ALL_AGENTS.map((type) => ({
        type,
        confidence: 85 + Math.floor(Math.random() * 10), // 85-94
        dataQuality: 90,
        decisionCount: 10,
        uncertainties: [],
        warnings: [],
      }));
      // Fix randomness for determinism
      highConfidenceAgents.forEach((a, i) => {
        a.confidence = 85 + (i % 10);
      });

      const { decisionRows, stateRows, uncertaintyRows } =
        buildSimulation(highConfidenceAgents);

      setupQueryMocks(decisionRows, stateRows, uncertaintyRows, [
        { date: '2026-02-24', avg_score: '88' },
        { date: '2026-02-25', avg_score: '90' },
      ]);

      const result =
        await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      // With scores 85-94, weighted average should be in that range
      expect(result.system_score).toBeGreaterThanOrEqual(85);
      expect(result.system_score).toBeLessThanOrEqual(95);
      expect(result.system_grade).toMatch(/^[AB]$/);
      expect(result.agent_scores).toHaveLength(20);
      expect(result.low_confidence_alerts).toHaveLength(0);
    });
  });

  describe('Low-confidence alert generation', () => {
    it('should generate alerts for agents below the threshold', async () => {
      const mixedAgents: SimulatedAgent[] = ALL_AGENTS.map((type, i) => ({
        type,
        confidence: i < 5 ? 30 + i * 2 : 75, // first 5 agents: 30-38 (below 50)
        dataQuality: i < 5 ? 35 : 80,
        decisionCount: 5,
        uncertainties: i < 3 ? ['Insufficient data'] : [],
        warnings: i === 0 ? ['Data source offline'] : [],
      }));

      const { decisionRows, stateRows, uncertaintyRows } =
        buildSimulation(mixedAgents);

      setupQueryMocks(decisionRows, stateRows, uncertaintyRows);

      const result =
        await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      // At least the first 5 agents should trigger alerts
      expect(result.low_confidence_alerts.length).toBeGreaterThanOrEqual(5);

      for (const alert of result.low_confidence_alerts) {
        expect(alert.score).toBeLessThan(50);
        expect(alert.reason).toBeTruthy();
        expect(alert.recommended_action).toBeTruthy();
      }
    });
  });

  describe('Category score aggregation', () => {
    it('should correctly aggregate scores into categories', async () => {
      const categorizedAgents: SimulatedAgent[] = [
        // market_intelligence category
        { type: 'market_intelligence', confidence: 80, dataQuality: 85, decisionCount: 5, uncertainties: [], warnings: [] },
        { type: 'country_strategy', confidence: 70, dataQuality: 75, decisionCount: 5, uncertainties: [], warnings: [] },
        { type: 'competitive_intelligence', confidence: 90, dataQuality: 90, decisionCount: 5, uncertainties: [], warnings: [] },
        // advertising category
        { type: 'paid_ads', confidence: 60, dataQuality: 65, decisionCount: 5, uncertainties: [], warnings: [] },
        { type: 'organic_social', confidence: 50, dataQuality: 55, decisionCount: 5, uncertainties: [], warnings: [] },
        // orchestration
        { type: 'master_orchestrator', confidence: 95, dataQuality: 98, decisionCount: 20, uncertainties: [], warnings: [] },
      ];

      // Fill remaining agents
      const coveredTypes = new Set(categorizedAgents.map((a) => a.type));
      for (const type of ALL_AGENTS) {
        if (!coveredTypes.has(type)) {
          categorizedAgents.push({
            type,
            confidence: 70,
            dataQuality: 75,
            decisionCount: 3,
            uncertainties: [],
            warnings: [],
          });
        }
      }

      const { decisionRows, stateRows, uncertaintyRows } =
        buildSimulation(categorizedAgents);

      setupQueryMocks(decisionRows, stateRows, uncertaintyRows);

      const result =
        await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      // market_intelligence category: avg of 80, 70, 90 = 80
      expect(result.category_scores.market_intelligence).toBe(80);

      // advertising category: avg of 60, 50 = 55
      expect(result.category_scores.advertising).toBe(55);

      // orchestration: just master_orchestrator = 95
      expect(result.category_scores.orchestration).toBe(95);

      // All categories should have values
      for (const [_cat, val] of Object.entries(result.category_scores)) {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Historical trend computation', () => {
    it('should compute min, max, and average from trend data', async () => {
      const trendRows = [
        { date: '2026-02-20', avg_score: '60' },
        { date: '2026-02-21', avg_score: '65' },
        { date: '2026-02-22', avg_score: '70' },
        { date: '2026-02-23', avg_score: '55' },
        { date: '2026-02-24', avg_score: '80' },
        { date: '2026-02-25', avg_score: '75' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: trendRows });

      const result =
        await ConfidenceScoreOutputService.getConfidenceTrend(7);

      expect(result.days).toBe(7);
      expect(result.trend).toHaveLength(6);
      expect(result.min_score).toBe(55);
      expect(result.max_score).toBe(80);
      // Average: (60+65+70+55+80+75)/6 = 67.5
      expect(result.average_score).toBe(67.5);
    });
  });

  describe('Per-agent detailed breakdown', () => {
    it('should return full decision history and quality metrics', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'dec-1',
              decision_type: 'bid_optimization',
              confidence_score: '82',
              created_at: '2026-02-25T12:00:00Z',
              output_data: {
                uncertainties: ['Market shift detected'],
                warnings: ['Budget nearing limit'],
              },
            },
            {
              id: 'dec-2',
              decision_type: 'audience_targeting',
              confidence_score: '75',
              created_at: '2026-02-24T12:00:00Z',
              output_data: { uncertainties: [], warnings: [] },
            },
            {
              id: 'dec-3',
              decision_type: 'creative_refresh',
              confidence_score: '90',
              created_at: '2026-02-23T12:00:00Z',
              output_data: { uncertainties: [], warnings: [] },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              metrics: { data_quality_score: 85, runs_last_24h: 3 },
              updated_at: '2026-02-25T11:00:00Z',
            },
          ],
        });

      const result =
        await ConfidenceScoreOutputService.getAgentConfidence('paid_ads');

      expect(result.agent_id).toBe('paid_ads');
      expect(result.agent_name).toBe('Paid Ads');
      expect(result.confidence_score).toBe(82); // latest decision
      expect(result.data_quality_score).toBe(85);
      expect(result.decision_count).toBe(3);
      expect(result.recent_decisions).toHaveLength(3);
      expect(result.uncertainty_flags).toContain('Market shift detected');
      expect(result.uncertainty_flags).toContain('Budget nearing limit');

      // Verify decision ordering (most recent first)
      expect(result.recent_decisions[0].id).toBe('dec-1');
      expect(result.recent_decisions[0].confidence_score).toBe(82);
      expect(result.recent_decisions[2].confidence_score).toBe(90);
    });

    it('should handle agent with no state record gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'dec-1',
              decision_type: 'analysis',
              confidence_score: '60',
              created_at: '2026-02-25T12:00:00Z',
              output_data: { uncertainties: [], warnings: [] },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // no state record

      const result =
        await ConfidenceScoreOutputService.getAgentConfidence('data_engineering');

      expect(result.agent_id).toBe('data_engineering');
      expect(result.confidence_score).toBe(60);
      expect(result.data_quality_score).toBe(0); // no state means no quality score
      expect(result.decision_count).toBe(1);
    });
  });
});

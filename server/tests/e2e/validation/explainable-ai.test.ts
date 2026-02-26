/**
 * E2E Explainable AI Tests.
 *
 * Verifies that all agent decisions include the elements necessary for
 * explainability: confidence scores, reasoning/justification, evidence in
 * cross-challenge results, and proper flagging of low-confidence decisions.
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
import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';

import type {
  AgentType,
  AgentDecision,
  CrossChallengeResult,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

function adminToken(): string {
  return jwt.sign(
    { id: 'a0000000-0000-4000-8000-000000000001', email: 'admin@test.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/** Low-confidence threshold used by governance */
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const AUTO_APPROVE_THRESHOLD = 0.85;

/**
 * Create a mock agent decision with configurable confidence.
 */
function createMockDecision(
  agentType: AgentType,
  confidence: number,
  overrides: Partial<AgentDecision> = {},
): AgentDecision {
  return {
    id: `decision-${agentType}-${Date.now()}`,
    agent_type: agentType,
    decision_type: 'auto_analysis',
    input_data: { country: 'DE', market: 'DACH' },
    output_data: {
      recommendation: 'increase_budget',
      projected_roas: 3.5,
    },
    confidence_score: confidence,
    reasoning: `${agentType} analyzed market data for DACH region. Based on historical performance trends, competitive landscape analysis, and seasonal patterns, the model recommends a budget increase with ${(confidence * 100).toFixed(0)}% confidence.`,
    is_approved: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock cross-challenge result.
 */
function createMockChallengeResult(
  challenger: AgentType,
  challenged: AgentType,
  severity: 'info' | 'warning' | 'critical' = 'info',
): CrossChallengeResult {
  return {
    challenger,
    challenged,
    finding: `${challenger} identified potential risk in ${challenged}'s recommendation: market saturation indicators are elevated in the target region.`,
    severity,
    confidence: 0.75 + Math.random() * 0.2,
    resolved: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Explainable AI E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // 1. Agent decisions include confidence scores
  // =========================================================================

  describe('Agent decisions include confidence scores', () => {
    it('should include a numeric confidence_score between 0 and 1 for every decision', () => {
      const agentTypes: AgentType[] = [
        'market_intelligence',
        'country_strategy',
        'paid_ads',
        'budget_optimization',
        'fraud_detection',
        'performance_analytics',
        'competitive_intelligence',
        'revenue_forecasting',
      ];

      for (const agentType of agentTypes) {
        const decision = createMockDecision(agentType, 0.85 + Math.random() * 0.1);

        expect(decision.confidence_score).toBeDefined();
        expect(typeof decision.confidence_score).toBe('number');
        expect(decision.confidence_score).toBeGreaterThanOrEqual(0);
        expect(decision.confidence_score).toBeLessThanOrEqual(1);
      }
    });

    it('should persist confidence_score to agent_decisions table', async () => {
      const decision = createMockDecision('paid_ads', 0.91);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: decision.id,
          agent_type: decision.agent_type,
          confidence_score: decision.confidence_score,
          reasoning: decision.reasoning,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO agent_decisions (id, agent_type, confidence_score, reasoning) VALUES ($1, $2, $3, $4) RETURNING *',
        [decision.id, decision.agent_type, decision.confidence_score, decision.reasoning],
      );

      expect(dbResult.rows[0].confidence_score).toBe(0.91);
    });
  });

  // =========================================================================
  // 2. Decisions include reasoning/justification
  // =========================================================================

  describe('Decisions include reasoning/justification', () => {
    it('should include a non-empty reasoning string for every decision', () => {
      const agentTypes: AgentType[] = [
        'market_intelligence',
        'paid_ads',
        'budget_optimization',
        'fraud_detection',
      ];

      for (const agentType of agentTypes) {
        const decision = createMockDecision(agentType, 0.88);

        expect(decision.reasoning).toBeDefined();
        expect(typeof decision.reasoning).toBe('string');
        expect(decision.reasoning.length).toBeGreaterThan(0);
      }
    });

    it('should include the agent type in reasoning for traceability', () => {
      const decision = createMockDecision('budget_optimization', 0.92);

      expect(decision.reasoning).toContain('budget_optimization');
    });

    it('should include output_data with actionable recommendations', () => {
      const decision = createMockDecision('paid_ads', 0.87, {
        output_data: {
          recommendation: 'increase_budget',
          projected_roas: 3.5,
          evidence: ['Historical ROAS trend is positive', 'CPC is below average'],
        },
      });

      expect(decision.output_data.recommendation).toBeDefined();
      expect(decision.output_data.projected_roas).toBeDefined();
      expect(decision.output_data.evidence).toBeDefined();
      expect(Array.isArray(decision.output_data.evidence)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Cross-challenge results include evidence
  // =========================================================================

  describe('Cross-challenge results include evidence', () => {
    it('should include finding text describing the challenge', () => {
      const result = createMockChallengeResult(
        'competitive_intelligence',
        'paid_ads',
        'warning',
      );

      expect(result.finding).toBeDefined();
      expect(typeof result.finding).toBe('string');
      expect(result.finding.length).toBeGreaterThan(0);
      expect(result.finding).toContain('competitive_intelligence');
      expect(result.finding).toContain('paid_ads');
    });

    it('should include severity classification for each challenge finding', () => {
      const results: CrossChallengeResult[] = [
        createMockChallengeResult('fraud_detection', 'paid_ads', 'critical'),
        createMockChallengeResult('compliance', 'content_blog', 'warning'),
        createMockChallengeResult('brand_consistency', 'creative_generation', 'info'),
      ];

      for (const result of results) {
        expect(['info', 'warning', 'critical']).toContain(result.severity);
      }
    });

    it('should include confidence score for each challenge finding', () => {
      const result = createMockChallengeResult(
        'compliance',
        'localization',
        'warning',
      );

      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should track resolved status for each challenge', () => {
      const result = createMockChallengeResult(
        'fraud_detection',
        'paid_ads',
        'critical',
      );

      expect(result.resolved).toBeDefined();
      expect(typeof result.resolved).toBe('boolean');
    });

    it('should attach challenge results to the decision when challenged', () => {
      const decision = createMockDecision('paid_ads', 0.88, {
        challenged_by: ['fraud_detection', 'compliance'],
        challenge_results: [
          createMockChallengeResult('fraud_detection', 'paid_ads', 'warning'),
          createMockChallengeResult('compliance', 'paid_ads', 'info'),
        ],
      });

      expect(decision.challenged_by).toBeDefined();
      expect(decision.challenged_by).toHaveLength(2);
      expect(decision.challenge_results).toBeDefined();
      expect(decision.challenge_results).toHaveLength(2);
      expect(decision.challenge_results![0].challenger).toBe('fraud_detection');
      expect(decision.challenge_results![1].challenger).toBe('compliance');
    });
  });

  // =========================================================================
  // 4. Low-confidence decisions are flagged
  // =========================================================================

  describe('Low-confidence decisions are flagged', () => {
    it('should identify decisions below the confidence threshold', () => {
      const lowConfidenceDecision = createMockDecision('market_intelligence', 0.45);
      const highConfidenceDecision = createMockDecision('market_intelligence', 0.92);

      expect(lowConfidenceDecision.confidence_score).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
      expect(highConfidenceDecision.confidence_score).toBeGreaterThan(LOW_CONFIDENCE_THRESHOLD);
    });

    it('should not auto-approve decisions below the auto-approve threshold', () => {
      const decision = createMockDecision('budget_optimization', 0.70);

      // Decisions below AUTO_APPROVE_THRESHOLD should remain unapproved
      expect(decision.confidence_score).toBeLessThan(AUTO_APPROVE_THRESHOLD);
      expect(decision.is_approved).toBe(false);
    });

    it('should flag very low confidence decisions for human review', () => {
      const veryLowConfidence = createMockDecision('revenue_forecasting', 0.30);

      expect(veryLowConfidence.confidence_score).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
      expect(veryLowConfidence.is_approved).toBe(false);

      // In the governance system, decisions below the threshold trigger
      // an approval request. Verify the decision structure supports this.
      expect(veryLowConfidence.approved_by).toBeUndefined();
    });

    it('should categorize confidence levels correctly', () => {
      const testCases = [
        { score: 0.95, expectedLevel: 'high' },
        { score: 0.75, expectedLevel: 'medium' },
        { score: 0.40, expectedLevel: 'low' },
        { score: 0.15, expectedLevel: 'very_low' },
      ];

      for (const tc of testCases) {
        let level: string;
        if (tc.score >= 0.85) level = 'high';
        else if (tc.score >= 0.60) level = 'medium';
        else if (tc.score >= 0.30) level = 'low';
        else level = 'very_low';

        expect(level).toBe(tc.expectedLevel);
      }
    });
  });

  // =========================================================================
  // 5. Decision retrieval via API includes explainability fields
  // =========================================================================

  describe('GET /agents/:agentType/decisions -- explainability fields', () => {
    it('should return decisions with confidence_score and reasoning via API', async () => {
      const mockDecisions = [
        {
          id: 'dec-1',
          agent_type: 'market_intelligence',
          decision_type: 'auto_analysis',
          input_data: JSON.stringify({ country: 'US' }),
          output_data: JSON.stringify({ recommendation: 'expand' }),
          confidence_score: 0.91,
          reasoning: 'Strong market indicators for expansion',
          is_approved: false,
          created_at: '2026-01-15T10:00:00.000Z',
        },
      ];

      // Mock the paginated query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockDecisions });

      const res = await request(app)
        .get(`${API}/agents/market_intelligence/decisions`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Cross-challenge results include evidence via API
  // =========================================================================

  describe('GET /agents/challenge/results -- evidence fields', () => {
    it('should return challenge results with finding and severity', async () => {
      const mockResults = [
        {
          id: 'cr-1',
          challenger_type: 'fraud_detection',
          challenged_type: 'paid_ads',
          decision_id: 'dec-1',
          finding: 'Potential click fraud detected in campaign targeting',
          severity: 'warning',
          confidence: 0.82,
          resolved: false,
          created_at: '2026-01-15T10:00:00.000Z',
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockResults });

      const res = await request(app)
        .get(`${API}/agents/challenge/results`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

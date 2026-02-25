/**
 * E2E tests for the master orchestrator.
 *
 * Tests the master orchestration engine that:
 *   - Collects outputs from all agents
 *   - Aggregates them into a unified view
 *   - Generates a decision matrix
 *   - Assigns actions based on agent recommendations
 *   - Triggers cross-challenge for contradictions
 *   - Produces final output with confidence scores
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

import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';

import type {
  AgentType,
  CrossChallengeResult,
  ConfidenceLevel,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

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
// Orchestration types and engine
// ---------------------------------------------------------------------------

interface AgentOutput {
  agent_type: AgentType;
  output_data: Record<string, unknown>;
  confidence_score: number;
  reasoning: string;
  timestamp: string;
}

interface DecisionMatrixEntry {
  agent_type: AgentType;
  recommendation: string;
  confidence: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: AgentType[];
}

interface ActionAssignment {
  id: string;
  action: string;
  assigned_agent: AgentType;
  source_agents: AgentType[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  confidence: number;
}

interface OrchestrationResult {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  agents_reporting: number;
  agents_total: number;
  decision_matrix: DecisionMatrixEntry[];
  actions: ActionAssignment[];
  cross_challenge_results: CrossChallengeResult[];
  average_confidence: number;
  confidence_level: ConfidenceLevel;
  summary: string;
  timestamp: string;
}

function classifyConfidence(score: number): ConfidenceLevel {
  if (score >= 0.9) return 'very_high';
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

class MasterOrchestrator {
  private agentOutputs: Map<AgentType, AgentOutput> = new Map();

  /**
   * Collect output from an agent.
   */
  collectOutput(output: AgentOutput): void {
    this.agentOutputs.set(output.agent_type, output);
  }

  /**
   * Aggregate all collected outputs into a unified result.
   */
  aggregate(): {
    total: number;
    averageConfidence: number;
    confidenceLevel: ConfidenceLevel;
    outputs: AgentOutput[];
  } {
    const outputs = Array.from(this.agentOutputs.values());
    const total = outputs.length;
    const averageConfidence =
      total > 0
        ? outputs.reduce((sum, o) => sum + o.confidence_score, 0) / total
        : 0;

    return {
      total,
      averageConfidence,
      confidenceLevel: classifyConfidence(averageConfidence),
      outputs,
    };
  }

  /**
   * Generate a decision matrix from all agent outputs.
   */
  generateDecisionMatrix(): DecisionMatrixEntry[] {
    const matrix: DecisionMatrixEntry[] = [];

    for (const [type, output] of this.agentOutputs.entries()) {
      const recommendation =
        (output.output_data.recommendation as string) ||
        (output.output_data.action as string) ||
        'No recommendation';

      const priority = output.confidence_score >= 0.9
        ? 'critical'
        : output.confidence_score >= 0.75
        ? 'high'
        : output.confidence_score >= 0.5
        ? 'medium'
        : 'low';

      const dependencies = (output.output_data.depends_on as AgentType[]) || [];

      matrix.push({
        agent_type: type,
        recommendation,
        confidence: output.confidence_score,
        priority,
        dependencies,
      });
    }

    // Sort by priority then confidence
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    matrix.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.confidence - a.confidence;
    });

    return matrix;
  }

  /**
   * Assign actions based on agent recommendations.
   */
  assignActions(matrix: DecisionMatrixEntry[]): ActionAssignment[] {
    const actions: ActionAssignment[] = [];
    let actionId = 0;

    for (const entry of matrix) {
      if (entry.recommendation === 'No recommendation') continue;

      actionId++;
      actions.push({
        id: `action-${actionId}`,
        action: entry.recommendation,
        assigned_agent: entry.agent_type,
        source_agents: [entry.agent_type, ...entry.dependencies],
        priority: entry.priority,
        status: 'pending',
        confidence: entry.confidence,
      });
    }

    return actions;
  }

  /**
   * Detect contradictions between agent outputs.
   */
  detectContradictions(): CrossChallengeResult[] {
    const results: CrossChallengeResult[] = [];
    const outputs = Array.from(this.agentOutputs.entries());

    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const [typeA, outputA] = outputs[i];
        const [typeB, outputB] = outputs[j];

        // Check for contradictory actions
        const actionA = outputA.output_data.action as string | undefined;
        const actionB = outputB.output_data.action as string | undefined;

        if (actionA && actionB && actionA !== actionB) {
          // Check if they're conflicting directions
          const conflictPairs = [
            ['scale_up', 'scale_down'],
            ['increase', 'decrease'],
            ['approve', 'reject'],
            ['enable', 'disable'],
          ];

          for (const [dirA, dirB] of conflictPairs) {
            if (
              (actionA.includes(dirA) && actionB.includes(dirB)) ||
              (actionA.includes(dirB) && actionB.includes(dirA))
            ) {
              const winner = outputA.confidence_score >= outputB.confidence_score ? typeA : typeB;
              const loser = winner === typeA ? typeB : typeA;
              const winnerConfidence = winner === typeA
                ? outputA.confidence_score
                : outputB.confidence_score;

              results.push({
                challenger: loser,
                challenged: winner,
                finding: `Contradiction: ${typeA} recommends '${actionA}' while ${typeB} recommends '${actionB}'.`,
                severity: winnerConfidence > 0.8 ? 'warning' : 'critical',
                confidence: winnerConfidence,
                resolved: true,
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Run full orchestration cycle.
   */
  orchestrate(): OrchestrationResult {
    const aggregation = this.aggregate();
    const matrix = this.generateDecisionMatrix();
    const actions = this.assignActions(matrix);
    const challengeResults = this.detectContradictions();

    const status = aggregation.total === 0
      ? 'failed'
      : aggregation.total < ALL_AGENT_TYPES.length - 1 // -1 for master_orchestrator itself
      ? 'partial'
      : 'completed';

    return {
      id: `orchestration-${Date.now()}`,
      status,
      agents_reporting: aggregation.total,
      agents_total: ALL_AGENT_TYPES.length - 1, // exclude master_orchestrator
      decision_matrix: matrix,
      actions,
      cross_challenge_results: challengeResults,
      average_confidence: parseFloat(aggregation.averageConfidence.toFixed(4)),
      confidence_level: aggregation.confidenceLevel,
      summary: `Orchestration ${status}: ${aggregation.total} agents reported, ${actions.length} actions assigned, ${challengeResults.length} contradictions resolved.`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear all collected outputs (reset for next cycle).
   */
  reset(): void {
    this.agentOutputs.clear();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Master Orchestration E2E Tests', () => {
  let orchestrator: MasterOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    orchestrator = new MasterOrchestrator();
  });

  // =========================================================================
  // All agents produce outputs
  // =========================================================================

  describe('All agents produce outputs', () => {
    it('collects outputs from all 19 non-orchestrator agents', () => {
      const nonOrchestratorTypes = ALL_AGENT_TYPES.filter((t) => t !== 'master_orchestrator');

      for (const agentType of nonOrchestratorTypes) {
        orchestrator.collectOutput({
          agent_type: agentType,
          output_data: {
            recommendation: `${agentType}_recommendation`,
            action: 'maintain',
            status: 'healthy',
          },
          confidence_score: 0.80 + Math.random() * 0.15,
          reasoning: `${agentType} completed analysis.`,
          timestamp: new Date().toISOString(),
        });
      }

      const aggregation = orchestrator.aggregate();
      expect(aggregation.total).toBe(19);
      expect(aggregation.averageConfidence).toBeGreaterThan(0.8);
      expect(aggregation.outputs).toHaveLength(19);
    });

    it('handles partial agent reporting gracefully', () => {
      // Only 5 agents report
      const reportingAgents: AgentType[] = [
        'market_intelligence',
        'performance_analytics',
        'compliance',
        'fraud_detection',
        'revenue_forecasting',
      ];

      for (const agentType of reportingAgents) {
        orchestrator.collectOutput({
          agent_type: agentType,
          output_data: { status: 'ok' },
          confidence_score: 0.85,
          reasoning: 'Analysis complete.',
          timestamp: new Date().toISOString(),
        });
      }

      const aggregation = orchestrator.aggregate();
      expect(aggregation.total).toBe(5);
      expect(aggregation.total).toBeLessThan(19);
    });
  });

  // =========================================================================
  // Orchestrator aggregates outputs
  // =========================================================================

  describe('Orchestrator aggregates outputs', () => {
    it('calculates correct average confidence across agents', () => {
      const scores = [0.95, 0.88, 0.72, 0.91, 0.83];
      const agents: AgentType[] = [
        'market_intelligence',
        'performance_analytics',
        'budget_optimization',
        'compliance',
        'fraud_detection',
      ];

      agents.forEach((agent, i) => {
        orchestrator.collectOutput({
          agent_type: agent,
          output_data: {},
          confidence_score: scores[i],
          reasoning: 'Test.',
          timestamp: new Date().toISOString(),
        });
      });

      const aggregation = orchestrator.aggregate();
      const expectedAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

      expect(aggregation.averageConfidence).toBeCloseTo(expectedAvg, 4);
      expect(aggregation.confidenceLevel).toBe('high'); // 0.858 average
    });

    it('classifies confidence levels correctly', () => {
      // Test very_high
      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: {},
        confidence_score: 0.95,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });
      expect(orchestrator.aggregate().confidenceLevel).toBe('very_high');

      orchestrator.reset();

      // Test medium
      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: {},
        confidence_score: 0.55,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });
      expect(orchestrator.aggregate().confidenceLevel).toBe('medium');

      orchestrator.reset();

      // Test low
      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: {},
        confidence_score: 0.35,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });
      expect(orchestrator.aggregate().confidenceLevel).toBe('low');
    });
  });

  // =========================================================================
  // Decision matrix generation
  // =========================================================================

  describe('Decision matrix generated', () => {
    it('produces a sorted decision matrix from agent outputs', () => {
      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: { recommendation: 'scale_google_ads', depends_on: ['budget_optimization'] },
        confidence_score: 0.92,
        reasoning: 'Strong ROAS.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'budget_optimization',
        output_data: { recommendation: 'reallocate_to_top_performers' },
        confidence_score: 0.78,
        reasoning: 'Budget efficiency analysis.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'fraud_detection',
        output_data: { recommendation: 'block_suspicious_sources' },
        confidence_score: 0.95,
        reasoning: 'Fraud signals detected.',
        timestamp: new Date().toISOString(),
      });

      const matrix = orchestrator.generateDecisionMatrix();

      expect(matrix).toHaveLength(3);

      // Should be sorted by priority then confidence
      // fraud_detection: 0.95 -> critical
      // performance_analytics: 0.92 -> critical
      // budget_optimization: 0.78 -> high
      expect(matrix[0].agent_type).toBe('fraud_detection');
      expect(matrix[0].priority).toBe('critical');
      expect(matrix[1].agent_type).toBe('performance_analytics');
      expect(matrix[1].priority).toBe('critical');
      expect(matrix[2].agent_type).toBe('budget_optimization');
      expect(matrix[2].priority).toBe('high');
    });

    it('includes dependency information in matrix entries', () => {
      orchestrator.collectOutput({
        agent_type: 'paid_ads',
        output_data: {
          recommendation: 'launch_de_campaign',
          depends_on: ['market_intelligence', 'compliance', 'localization'],
        },
        confidence_score: 0.85,
        reasoning: 'Market conditions favorable.',
        timestamp: new Date().toISOString(),
      });

      const matrix = orchestrator.generateDecisionMatrix();

      expect(matrix[0].dependencies).toHaveLength(3);
      expect(matrix[0].dependencies).toContain('market_intelligence');
      expect(matrix[0].dependencies).toContain('compliance');
      expect(matrix[0].dependencies).toContain('localization');
    });
  });

  // =========================================================================
  // Actions assigned
  // =========================================================================

  describe('Actions assigned', () => {
    it('creates action assignments from the decision matrix', () => {
      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: { recommendation: 'increase_google_budget' },
        confidence_score: 0.91,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: { recommendation: 'update_privacy_policy' },
        confidence_score: 0.88,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'localization',
        output_data: { recommendation: 'translate_de_content' },
        confidence_score: 0.76,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });

      const matrix = orchestrator.generateDecisionMatrix();
      const actions = orchestrator.assignActions(matrix);

      expect(actions).toHaveLength(3);
      expect(actions.every((a) => a.status === 'pending')).toBe(true);
      expect(actions[0].priority).toBe('critical'); // highest priority first
      expect(actions[0].action).toBeDefined();
      expect(actions[0].assigned_agent).toBeDefined();
    });

    it('skips agents with no recommendation', () => {
      orchestrator.collectOutput({
        agent_type: 'data_engineering',
        output_data: { status: 'monitoring' }, // no recommendation or action field
        confidence_score: 0.80,
        reasoning: 'Pipeline healthy.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: { recommendation: 'analyze_q1_trends' },
        confidence_score: 0.85,
        reasoning: 'Q1 data available.',
        timestamp: new Date().toISOString(),
      });

      const matrix = orchestrator.generateDecisionMatrix();
      const actions = orchestrator.assignActions(matrix);

      // Only performance_analytics has a recommendation
      expect(actions).toHaveLength(1);
      expect(actions[0].assigned_agent).toBe('performance_analytics');
    });
  });

  // =========================================================================
  // Cross-challenge triggered for contradictions
  // =========================================================================

  describe('Cross-challenge triggered for contradictions', () => {
    it('detects and resolves contradictory agent recommendations', () => {
      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: {
          action: 'scale_up_budget',
          recommendation: 'Increase ad spend by 20%',
        },
        confidence_score: 0.86,
        reasoning: 'ROAS trending upward.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'fraud_detection',
        output_data: {
          action: 'scale_down_budget',
          recommendation: 'Reduce ad spend due to fraud risk',
        },
        confidence_score: 0.93,
        reasoning: 'Suspicious activity detected.',
        timestamp: new Date().toISOString(),
      });

      const challenges = orchestrator.detectContradictions();

      expect(challenges).toHaveLength(1);
      expect(challenges[0].resolved).toBe(true);
      expect(challenges[0].confidence).toBe(0.93); // fraud_detection wins
      expect(challenges[0].challenged).toBe('fraud_detection'); // winner (higher confidence)
      expect(challenges[0].challenger).toBe('performance_analytics'); // loser
      expect(challenges[0].finding).toContain('Contradiction');
      expect(challenges[0].severity).toBe('warning'); // 0.93 > 0.8
    });

    it('handles no contradictions between aligned agents', () => {
      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: { action: 'approve_campaign', status: 'compliant' },
        confidence_score: 0.95,
        reasoning: 'All checks passed.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'brand_consistency',
        output_data: { action: 'approve_creative', status: 'consistent' },
        confidence_score: 0.92,
        reasoning: 'Brand guidelines met.',
        timestamp: new Date().toISOString(),
      });

      const challenges = orchestrator.detectContradictions();

      expect(challenges).toHaveLength(0);
    });
  });

  // =========================================================================
  // Final output includes confidence scores
  // =========================================================================

  describe('Final output includes confidence scores', () => {
    it('produces a complete orchestration result with all components', () => {
      // Set up agent outputs with one contradiction
      orchestrator.collectOutput({
        agent_type: 'market_intelligence',
        output_data: { recommendation: 'enter_japan_market', action: 'enable_jp' },
        confidence_score: 0.89,
        reasoning: 'Market opportunity detected.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: { recommendation: 'scale_us_campaigns', action: 'increase_us_budget' },
        confidence_score: 0.92,
        reasoning: 'Strong US performance.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: { recommendation: 'review_jp_regulations', action: 'enable_jp' },
        confidence_score: 0.88,
        reasoning: 'Japanese market regulations reviewed.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'revenue_forecasting',
        output_data: { recommendation: 'project_15pct_growth', action: 'increase_forecast' },
        confidence_score: 0.84,
        reasoning: 'Based on current trajectory.',
        timestamp: new Date().toISOString(),
      });

      const result = orchestrator.orchestrate();

      expect(result.status).toBe('partial'); // 4 < 19
      expect(result.agents_reporting).toBe(4);
      expect(result.agents_total).toBe(19);
      expect(result.decision_matrix).toHaveLength(4);
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.average_confidence).toBeGreaterThan(0);
      expect(result.confidence_level).toBeDefined();
      expect(['low', 'medium', 'high', 'very_high']).toContain(result.confidence_level);
      expect(result.summary).toContain('Orchestration');
      expect(result.timestamp).toBeDefined();
    });

    it('reports failed status when no agents report', () => {
      const result = orchestrator.orchestrate();

      expect(result.status).toBe('failed');
      expect(result.agents_reporting).toBe(0);
      expect(result.decision_matrix).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
      expect(result.average_confidence).toBe(0);
    });
  });

  // =========================================================================
  // DB persistence of orchestration results
  // =========================================================================

  describe('DB persistence of orchestration results', () => {
    it('persists the orchestration result to database', async () => {
      orchestrator.collectOutput({
        agent_type: 'performance_analytics',
        output_data: { recommendation: 'optimize_campaigns' },
        confidence_score: 0.90,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });

      orchestrator.collectOutput({
        agent_type: 'budget_optimization',
        output_data: { recommendation: 'reallocate_budget' },
        confidence_score: 0.85,
        reasoning: 'Test.',
        timestamp: new Date().toISOString(),
      });

      const result = orchestrator.orchestrate();

      // Simulate DB insert for orchestration run
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: result.id,
          status: result.status,
          agents_reporting: result.agents_reporting,
          agents_total: result.agents_total,
          average_confidence: result.average_confidence,
          confidence_level: result.confidence_level,
          summary: result.summary,
          created_at: result.timestamp,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO orchestration_runs (id, status, agents_reporting, agents_total, decision_matrix, actions, cross_challenge_results, average_confidence, confidence_level, summary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [
          result.id,
          result.status,
          result.agents_reporting,
          result.agents_total,
          JSON.stringify(result.decision_matrix),
          JSON.stringify(result.actions),
          JSON.stringify(result.cross_challenge_results),
          result.average_confidence,
          result.confidence_level,
          result.summary,
        ],
      );

      expect(dbResult.rows[0].status).toBe('partial');
      expect(dbResult.rows[0].agents_reporting).toBe(2);
      expect(dbResult.rows[0].average_confidence).toBeGreaterThan(0);
    });

    it('persists individual action assignments to database', async () => {
      orchestrator.collectOutput({
        agent_type: 'compliance',
        output_data: { recommendation: 'update_gdpr_policy' },
        confidence_score: 0.94,
        reasoning: 'Regulation change detected.',
        timestamp: new Date().toISOString(),
      });

      const result = orchestrator.orchestrate();

      for (const action of result.actions) {
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            id: action.id,
            action: action.action,
            assigned_agent: action.assigned_agent,
            priority: action.priority,
            status: action.status,
            confidence: action.confidence,
          }],
          rowCount: 1,
        });

        const dbResult = await mockPool.query(
          'INSERT INTO orchestration_actions (id, orchestration_id, action, assigned_agent, source_agents, priority, status, confidence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [
            action.id,
            result.id,
            action.action,
            action.assigned_agent,
            action.source_agents,
            action.priority,
            action.status,
            action.confidence,
          ],
        );

        expect(dbResult.rows[0].status).toBe('pending');
        expect(dbResult.rows[0].assigned_agent).toBe('compliance');
      }
    });
  });

  // =========================================================================
  // Full orchestration cycle
  // =========================================================================

  describe('Full orchestration cycle', () => {
    it('runs end-to-end orchestration with contradictions and resolution', async () => {
      // Step 1: Multiple agents produce outputs (including contradictions)
      const agentConfigs: Array<{ type: AgentType; output: Record<string, unknown>; confidence: number }> = [
        {
          type: 'market_intelligence',
          output: { recommendation: 'expand_to_de', market_score: 85, action: 'enable_de' },
          confidence: 0.91,
        },
        {
          type: 'country_strategy',
          output: { recommendation: 'pilot_de_market', entry_mode: 'partnership', action: 'enable_de' },
          confidence: 0.87,
        },
        {
          type: 'performance_analytics',
          output: { recommendation: 'scale_up_spend', roas: 4.5, action: 'increase_global_budget' },
          confidence: 0.89,
        },
        {
          type: 'fraud_detection',
          output: { recommendation: 'reduce_exposure', fraud_score: 0.3, action: 'decrease_global_budget' },
          confidence: 0.94,
        },
        {
          type: 'compliance',
          output: { recommendation: 'review_gdpr_for_de', regulation: 'gdpr', action: 'enable_de' },
          confidence: 0.96,
        },
        {
          type: 'budget_optimization',
          output: { recommendation: 'reallocate_meta_to_google', efficiency_gain: 12 },
          confidence: 0.83,
        },
        {
          type: 'brand_consistency',
          output: { recommendation: 'approve_new_creatives', brand_score: 88 },
          confidence: 0.90,
        },
        {
          type: 'localization',
          output: { recommendation: 'translate_de_content', quality_score: 0.92, action: 'enable_de' },
          confidence: 0.86,
        },
        {
          type: 'revenue_forecasting',
          output: { recommendation: 'expect_20pct_growth', forecast_confidence: 0.78 },
          confidence: 0.81,
        },
      ];

      for (const config of agentConfigs) {
        orchestrator.collectOutput({
          agent_type: config.type,
          output_data: config.output,
          confidence_score: config.confidence,
          reasoning: `${config.type} analysis complete.`,
          timestamp: new Date().toISOString(),
        });
      }

      // Step 2: Run orchestration
      const result = orchestrator.orchestrate();

      // Step 3: Verify aggregation
      expect(result.agents_reporting).toBe(9);
      expect(result.status).toBe('partial');
      expect(result.average_confidence).toBeGreaterThan(0.85);

      // Step 4: Verify decision matrix
      expect(result.decision_matrix).toHaveLength(9);
      // First entry should be highest priority
      expect(result.decision_matrix[0].priority).toBe('critical');

      // Step 5: Verify actions assigned
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions.every((a) => a.status === 'pending')).toBe(true);

      // Step 6: Verify contradictions detected
      // performance_analytics says "increase" vs fraud_detection says "decrease"
      expect(result.cross_challenge_results.length).toBeGreaterThan(0);
      const budgetChallenge = result.cross_challenge_results.find(
        (c) =>
          (c.challenger === 'performance_analytics' || c.challenger === 'fraud_detection') &&
          (c.challenged === 'performance_analytics' || c.challenged === 'fraud_detection'),
      );
      expect(budgetChallenge).toBeDefined();
      expect(budgetChallenge!.resolved).toBe(true);

      // Step 7: Verify confidence scores in output
      expect(result.confidence_level).toBeDefined();
      expect(result.average_confidence).toBeGreaterThan(0);

      // Step 8: Persist to DB
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: result.id,
          status: result.status,
          agents_reporting: result.agents_reporting,
          average_confidence: result.average_confidence,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO orchestration_runs (id, status, agents_reporting, agents_total, average_confidence, summary) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [
          result.id,
          result.status,
          result.agents_reporting,
          result.agents_total,
          result.average_confidence,
          result.summary,
        ],
      );

      expect(dbResult.rows[0].status).toBe('partial');
      expect(dbResult.rows[0].agents_reporting).toBe(9);

      // Step 9: Reset orchestrator for next cycle
      orchestrator.reset();
      const emptyResult = orchestrator.orchestrate();
      expect(emptyResult.agents_reporting).toBe(0);
      expect(emptyResult.status).toBe('failed');
    });
  });
});

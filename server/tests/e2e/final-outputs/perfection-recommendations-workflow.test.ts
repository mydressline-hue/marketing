/**
 * E2E tests for Perfection Recommendations workflow lifecycle.
 *
 * Tests the full recommendation generation workflow including:
 *   - End-to-end report generation from DB data
 *   - Maturity assessment progression through different data scenarios
 *   - Score/grade transitions based on agent health changes
 *   - Recommendation prioritisation across multiple categories
 *   - Benchmark percentile computation accuracy
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
  generateId: jest.fn().mockReturnValue('e2e-test-id'),
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
import {
  PerfectionRecommendationsOutputService,
} from '../../../src/services/final-outputs/PerfectionRecommendationsOutputService';
import type {
  PerfectionRecommendationsOutput,
  RecommendationCategory,
} from '../../../src/services/final-outputs/PerfectionRecommendationsOutputService';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Workflow Simulator
// ---------------------------------------------------------------------------

class PerfectionWorkflowSimulator {
  private orchestratorRow: Record<string, unknown> | null = null;
  private agentDecisionRows: Record<string, unknown>[] = [];
  private crossChallengeRows: Record<string, unknown>[] = [];
  private benchmarkRow: Record<string, unknown> | null = null;

  /**
   * All 19 agent types in the system.
   */
  private static readonly ALL_AGENTS = [
    'data_engineering', 'performance_analytics',
    'creative_generation', 'ab_testing', 'conversion_optimization',
    'paid_ads', 'organic_social', 'content_blog', 'budget_optimization',
    'compliance', 'brand_consistency',
    'enterprise_security', 'fraud_detection',
    'shopify_integration', 'localization',
    'market_intelligence', 'country_strategy', 'competitive_intelligence',
    'revenue_forecasting',
  ];

  /**
   * Sets up an orchestrator result with the given confidence and stats.
   */
  withOrchestrator(
    confidence: number,
    contradictions: number = 0,
    resolved: number = 0,
  ): this {
    this.orchestratorRow = {
      id: 'orch-e2e',
      overall_confidence: String(confidence),
      confidence_score: String(confidence),
      contradictions_count: String(contradictions),
      resolved_count: String(resolved),
      agent_coverage: '19',
      reasoning: 'E2E orchestration result',
      actions_count: '10',
      output_data: JSON.stringify({}),
      created_at: '2025-06-01T00:00:00Z',
    };
    return this;
  }

  /**
   * Adds all 19 agents with the specified base confidence.
   */
  withAllAgents(baseConfidence: number): this {
    this.agentDecisionRows = PerfectionWorkflowSimulator.ALL_AGENTS.map(
      (agentType, idx) => ({
        id: `decision-e2e-${idx}`,
        agent_type: agentType,
        decision_type: 'analysis',
        confidence_score: String(baseConfidence + (idx % 5)),
        reasoning: `E2E analysis for ${agentType}`,
        output_data: JSON.stringify({
          recommendations: [`Optimise ${agentType} pipeline`],
          warnings: baseConfidence < 60 ? [`Quality issue in ${agentType}`] : [],
          uncertainties: [],
        }),
        input_data: '{}',
        created_at: '2025-06-01T00:00:00Z',
      }),
    );
    return this;
  }

  /**
   * Adds only a subset of agents (simulating partial coverage).
   */
  withPartialAgents(agentTypes: string[], confidence: number): this {
    this.agentDecisionRows = agentTypes.map((agentType, idx) => ({
      id: `decision-e2e-${idx}`,
      agent_type: agentType,
      decision_type: 'analysis',
      confidence_score: String(confidence),
      reasoning: `E2E analysis for ${agentType}`,
      output_data: JSON.stringify({
        recommendations: [`Improve ${agentType}`],
        warnings: [],
        uncertainties: [],
      }),
      input_data: '{}',
      created_at: '2025-06-01T00:00:00Z',
    }));
    return this;
  }

  /**
   * Adds cross-challenge findings.
   */
  withCrossChallenges(
    findings: Array<{
      challenger: string;
      challenged: string;
      severity: string;
      resolved: boolean;
    }>,
  ): this {
    this.crossChallengeRows = findings.map((f, idx) => ({
      id: `cc-e2e-${idx}`,
      challenger: f.challenger,
      challenged: f.challenged,
      finding: `Cross-challenge finding: ${f.challenger} vs ${f.challenged}`,
      severity: f.severity,
      confidence: '70',
      resolved: f.resolved,
      created_at: '2025-06-01T00:00:00Z',
    }));
    return this;
  }

  /**
   * Sets industry benchmark data.
   */
  withBenchmarks(industryAvg: number, topPerformer: number): this {
    this.benchmarkRow = {
      industry_average_score: String(industryAvg),
      top_performer_score: String(topPerformer),
      sample_size: '200',
      created_at: '2025-06-01T00:00:00Z',
    };
    return this;
  }

  /**
   * Configures all pool.query mocks in the order the service calls them.
   */
  applyMocks(): void {
    mockQuery
      .mockResolvedValueOnce({
        rows: this.orchestratorRow ? [this.orchestratorRow] : [],
      })
      .mockResolvedValueOnce({ rows: this.agentDecisionRows })
      .mockResolvedValueOnce({ rows: this.crossChallengeRows })
      .mockResolvedValueOnce({
        rows: this.benchmarkRow ? [this.benchmarkRow] : [],
      });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Perfection Recommendations Workflow (E2E)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Healthy system with all agents at high confidence
  // -----------------------------------------------------------------------

  describe('Scenario: Healthy enterprise system', () => {
    it('generates a high readiness score and A/B grade when all agents are confident', async () => {
      new PerfectionWorkflowSimulator()
        .withOrchestrator(85, 1, 1)
        .withAllAgents(80)
        .withBenchmarks(55, 92)
        .applyMocks();

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(result.enterprise_readiness_score).toBeGreaterThanOrEqual(70);
      expect(['A+', 'A', 'B']).toContain(result.grade);
      expect(result.benchmarks.percentile).toBeGreaterThan(50);

      // All maturity domains should be at level 4+
      const maturityValues = Object.values(result.maturity_assessment);
      for (const domain of maturityValues) {
        expect(domain.level).toBeGreaterThanOrEqual(4);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Degraded system with low confidence agents
  // -----------------------------------------------------------------------

  describe('Scenario: Degraded system with low-confidence agents', () => {
    it('generates critical recommendations and low grade', async () => {
      new PerfectionWorkflowSimulator()
        .withOrchestrator(35, 8, 2)
        .withAllAgents(25)
        .withCrossChallenges([
          { challenger: 'compliance', challenged: 'paid_ads', severity: 'critical', resolved: false },
          { challenger: 'enterprise_security', challenged: 'data_engineering', severity: 'critical', resolved: false },
        ])
        .withBenchmarks(55, 92)
        .applyMocks();

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(result.enterprise_readiness_score).toBeLessThan(40);
      expect(['D', 'F']).toContain(result.grade);

      // Should have many critical recommendations
      const criticalRecs = result.recommendations.filter((r) => r.priority === 'critical');
      expect(criticalRecs.length).toBeGreaterThan(0);

      // Recommendations should include cross-challenge resolution items
      const challengeRecs = result.recommendations.filter(
        (r) => r.title.includes('cross-challenge'),
      );
      expect(challengeRecs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Partial agent coverage
  // -----------------------------------------------------------------------

  describe('Scenario: Partial agent coverage', () => {
    it('generates deployment recommendations for missing agents', async () => {
      new PerfectionWorkflowSimulator()
        .withOrchestrator(50, 0, 0)
        .withPartialAgents(['data_engineering', 'compliance', 'paid_ads'], 70)
        .withBenchmarks(55, 92)
        .applyMocks();

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      // Should recommend deploying missing agents
      const deploymentRecs = result.recommendations.filter(
        (r) => r.title.toLowerCase().includes('deploy'),
      );
      expect(deploymentRecs.length).toBeGreaterThan(0);
      expect(deploymentRecs[0].priority).toBe('critical');

      // Score should be lower due to missing agents
      expect(result.enterprise_readiness_score).toBeLessThan(70);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Category filtering workflow
  // -----------------------------------------------------------------------

  describe('Scenario: Category-based recommendation filtering', () => {
    it('filters recommendations correctly by category', async () => {
      new PerfectionWorkflowSimulator()
        .withOrchestrator(60, 2, 1)
        .withAllAgents(50)
        .withCrossChallenges([
          { challenger: 'compliance', challenged: 'paid_ads', severity: 'warning', resolved: false },
        ])
        .withBenchmarks(55, 92)
        .applyMocks();

      const fullResult = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      const categories: RecommendationCategory[] = [
        'strategy', 'technology', 'operations', 'data', 'compliance', 'scaling',
      ];

      for (const category of categories) {
        const filtered = fullResult.recommendations.filter((r) => r.category === category);
        // Each category that has agents should have at least some recommendations
        // We just verify the filtering is consistent
        const serviceFiltered = await PerfectionRecommendationsOutputService.getRecommendationsByCategory(category);
        expect(serviceFiltered.length).toBe(filtered.length);
        for (const rec of serviceFiltered) {
          expect(rec.category).toBe(category);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Score progression from F to A
  // -----------------------------------------------------------------------

  describe('Scenario: Score progression validates grade transitions', () => {
    it('correctly transitions grades as agent confidence improves', async () => {
      // Simulate improving confidence levels and verify grade transitions
      const scenarios: Array<{ confidence: number; expectedGrades: string[] }> = [
        { confidence: 15, expectedGrades: ['F', 'D'] },
        { confidence: 45, expectedGrades: ['D', 'C'] },
        { confidence: 65, expectedGrades: ['C', 'B'] },
        { confidence: 85, expectedGrades: ['A', 'A+', 'B'] },
      ];

      for (const scenario of scenarios) {
        jest.clearAllMocks();

        new PerfectionWorkflowSimulator()
          .withOrchestrator(scenario.confidence)
          .withAllAgents(scenario.confidence)
          .withBenchmarks(55, 92)
          .applyMocks();

        const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

        expect(scenario.expectedGrades).toContain(result.grade);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Benchmark percentile accuracy
  // -----------------------------------------------------------------------

  describe('Scenario: Benchmark percentile computation', () => {
    it('computes accurate percentile relative to industry', async () => {
      new PerfectionWorkflowSimulator()
        .withOrchestrator(75, 0, 0)
        .withAllAgents(75)
        .withBenchmarks(50, 90)
        .applyMocks();

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      // Score should be around 75-ish, which is above 50 avg
      expect(result.benchmarks.current_score).toBeGreaterThan(result.benchmarks.industry_average_score);
      expect(result.benchmarks.percentile).toBeGreaterThan(50);
      expect(result.benchmarks.percentile).toBeLessThan(99);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Empty DB produces complete but minimal output
  // -----------------------------------------------------------------------

  describe('Scenario: Empty database', () => {
    it('produces valid output structure with zero data', async () => {
      new PerfectionWorkflowSimulator()
        .applyMocks();

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      // Should still produce a valid structure
      expect(result.enterprise_readiness_score).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.generated_at).toBeDefined();
      expect(typeof result.generated_at).toBe('string');

      // Should still have maturity assessment (all level 1)
      expect(result.maturity_assessment.data_infrastructure.level).toBe(1);
      expect(result.maturity_assessment.ai_capabilities.level).toBe(1);

      // Should have maturity gap recommendations
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});

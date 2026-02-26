/**
 * Unit tests for PerfectionRecommendationsOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (maturity computation, scoring, recommendations).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  PerfectionRecommendationsOutputService,
} from '../../../../src/services/final-outputs/PerfectionRecommendationsOutputService';
import type {
  MaturityAssessment,
  PerfectionRecommendation,
} from '../../../../src/services/final-outputs/PerfectionRecommendationsOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeAgentDecision = (overrides: Record<string, unknown> = {}) => ({
  id: 'decision-uuid-1',
  agent_type: 'data_engineering',
  decision_type: 'analysis',
  confidence_score: '78',
  reasoning: 'Based on data analysis',
  output_data: JSON.stringify({
    recommendations: ['Improve data pipeline throughput'],
    warnings: ['Data freshness below threshold'],
    uncertainties: ['External API reliability unknown'],
  }),
  input_data: '{}',
  created_at: '2025-06-01T00:00:00Z',
  ...overrides,
});

const makeOrchestratorResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'orch-uuid-1',
  overall_confidence: '72',
  confidence_score: '72',
  contradictions_count: '3',
  resolved_count: '2',
  agent_coverage: '18',
  reasoning: 'Orchestration completed with minor issues',
  actions_count: '15',
  output_data: JSON.stringify({}),
  created_at: '2025-06-01T00:00:00Z',
  ...overrides,
});

const makeCrossChallenge = (overrides: Record<string, unknown> = {}) => ({
  id: 'challenge-uuid-1',
  challenger: 'compliance',
  challenged: 'paid_ads',
  finding: 'Ad targeting may violate GDPR in certain regions',
  severity: 'warning',
  confidence: '65',
  resolved: false,
  created_at: '2025-06-01T00:00:00Z',
  ...overrides,
});

const makeBenchmark = (overrides: Record<string, unknown> = {}) => ({
  industry_average_score: '55',
  top_performer_score: '92',
  sample_size: '150',
  created_at: '2025-06-01T00:00:00Z',
  ...overrides,
});

/**
 * Builds a mock agent_decisions result set that covers all agents used by
 * MATURITY_DOMAIN_AGENTS with a given confidence range.
 */
function buildAgentDecisionsRows(baseConfidence: number): Record<string, unknown>[] {
  const agents = [
    'data_engineering', 'performance_analytics',
    'creative_generation', 'ab_testing', 'conversion_optimization',
    'paid_ads', 'organic_social', 'content_blog', 'budget_optimization',
    'compliance', 'brand_consistency',
    'enterprise_security', 'fraud_detection',
    'shopify_integration', 'localization',
    'market_intelligence', 'country_strategy', 'competitive_intelligence',
    'revenue_forecasting',
  ];

  return agents.map((agentType, idx) =>
    makeAgentDecision({
      id: `decision-${idx}`,
      agent_type: agentType,
      confidence_score: String(baseConfidence + (idx % 10)),
      output_data: JSON.stringify({
        recommendations: [`Improve ${agentType} performance`],
        warnings: baseConfidence < 60 ? [`Low quality in ${agentType}`] : [],
        uncertainties: [],
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PerfectionRecommendationsOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // scoreToMaturityLevel
  // -----------------------------------------------------------------------

  describe('scoreToMaturityLevel', () => {
    it('returns level 5 for scores >= 85', () => {
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(85)).toBe(5);
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(100)).toBe(5);
    });

    it('returns level 4 for scores 70-84', () => {
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(70)).toBe(4);
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(84)).toBe(4);
    });

    it('returns level 3 for scores 50-69', () => {
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(50)).toBe(3);
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(69)).toBe(3);
    });

    it('returns level 2 for scores 30-49', () => {
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(30)).toBe(2);
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(49)).toBe(2);
    });

    it('returns level 1 for scores below 30', () => {
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(0)).toBe(1);
      expect(PerfectionRecommendationsOutputService.scoreToMaturityLevel(29)).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // scoreToGrade
  // -----------------------------------------------------------------------

  describe('scoreToGrade', () => {
    it('returns A+ for scores >= 95', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(95)).toBe('A+');
      expect(PerfectionRecommendationsOutputService.scoreToGrade(100)).toBe('A+');
    });

    it('returns A for scores 85-94', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(85)).toBe('A');
      expect(PerfectionRecommendationsOutputService.scoreToGrade(94)).toBe('A');
    });

    it('returns B for scores 70-84', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(70)).toBe('B');
    });

    it('returns C for scores 55-69', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(55)).toBe('C');
    });

    it('returns D for scores 40-54', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(40)).toBe('D');
    });

    it('returns F for scores below 40', () => {
      expect(PerfectionRecommendationsOutputService.scoreToGrade(0)).toBe('F');
      expect(PerfectionRecommendationsOutputService.scoreToGrade(39)).toBe('F');
    });
  });

  // -----------------------------------------------------------------------
  // computeMaturityAssessment
  // -----------------------------------------------------------------------

  describe('computeMaturityAssessment', () => {
    it('computes maturity from agent decisions map', () => {
      const decisions = new Map<string, Record<string, unknown>>();
      decisions.set('data_engineering', {
        confidence_score: 80,
        warnings: ['Stale data detected'],
        uncertainties: [],
      });
      decisions.set('performance_analytics', {
        confidence_score: 75,
        warnings: [],
        uncertainties: ['Model drift possible'],
      });

      const maturity = PerfectionRecommendationsOutputService.computeMaturityAssessment(decisions);

      expect(maturity.data_infrastructure).toBeDefined();
      expect(maturity.data_infrastructure.score).toBe(77.5);
      expect(maturity.data_infrastructure.level).toBe(4);
      expect(maturity.data_infrastructure.improvements_needed.length).toBeGreaterThan(0);
    });

    it('assigns level 1 when no agent data is available', () => {
      const emptyDecisions = new Map<string, Record<string, unknown>>();

      const maturity = PerfectionRecommendationsOutputService.computeMaturityAssessment(emptyDecisions);

      // All domains should have level 1 (0 score)
      for (const domain of Object.values(maturity)) {
        const d = domain as { level: number; score: number };
        expect(d.level).toBe(1);
        expect(d.score).toBe(0);
      }
    });

    it('includes improvements from warnings and uncertainties', () => {
      const decisions = new Map<string, Record<string, unknown>>();
      decisions.set('compliance', {
        confidence_score: 60,
        warnings: ['GDPR gap identified', 'CCPA coverage incomplete'],
        uncertainties: ['Regional laws unclear'],
      });
      decisions.set('brand_consistency', {
        confidence_score: 55,
        warnings: [],
        uncertainties: [],
      });

      const maturity = PerfectionRecommendationsOutputService.computeMaturityAssessment(decisions);

      expect(maturity.compliance_governance.improvements_needed).toContain(
        '[compliance] GDPR gap identified',
      );
      expect(maturity.compliance_governance.improvements_needed).toContain(
        '[compliance] CCPA coverage incomplete',
      );
      expect(maturity.compliance_governance.improvements_needed).toContain(
        '[compliance] Address uncertainty: Regional laws unclear',
      );
    });
  });

  // -----------------------------------------------------------------------
  // computeReadinessScore
  // -----------------------------------------------------------------------

  describe('computeReadinessScore', () => {
    it('computes weighted average of maturity domain scores', () => {
      const maturity: MaturityAssessment = {
        data_infrastructure: { level: 4, description: 'Managed', score: 75, improvements_needed: [] },
        ai_capabilities: { level: 3, description: 'Defined', score: 60, improvements_needed: [] },
        marketing_operations: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        compliance_governance: { level: 3, description: 'Defined', score: 65, improvements_needed: [] },
        security_posture: { level: 3, description: 'Defined', score: 55, improvements_needed: [] },
        integration_ecosystem: { level: 2, description: 'Developing', score: 40, improvements_needed: [] },
      };

      const score = PerfectionRecommendationsOutputService.computeReadinessScore(maturity, null);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      // Weighted: 75*0.2 + 60*0.15 + 80*0.2 + 65*0.2 + 55*0.15 + 40*0.1 = 15+9+16+13+8.25+4 = 65.25
      expect(score).toBeCloseTo(65.25, 1);
    });

    it('blends orchestrator confidence when available', () => {
      const maturity: MaturityAssessment = {
        data_infrastructure: { level: 4, description: 'Managed', score: 75, improvements_needed: [] },
        ai_capabilities: { level: 3, description: 'Defined', score: 60, improvements_needed: [] },
        marketing_operations: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        compliance_governance: { level: 3, description: 'Defined', score: 65, improvements_needed: [] },
        security_posture: { level: 3, description: 'Defined', score: 55, improvements_needed: [] },
        integration_ecosystem: { level: 2, description: 'Developing', score: 40, improvements_needed: [] },
      };

      const orchestratorResult = {
        overall_confidence: 90,
        contradictions_count: 0,
        resolved_count: 0,
      };

      const scoreWithOrch = PerfectionRecommendationsOutputService.computeReadinessScore(
        maturity,
        orchestratorResult,
      );
      const scoreWithout = PerfectionRecommendationsOutputService.computeReadinessScore(
        maturity,
        null,
      );

      // With 90 orchestrator confidence blended at 20%, score should be higher
      expect(scoreWithOrch).toBeGreaterThan(scoreWithout);
    });

    it('applies contradiction penalty to the score', () => {
      const maturity: MaturityAssessment = {
        data_infrastructure: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        ai_capabilities: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        marketing_operations: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        compliance_governance: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        security_posture: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
        integration_ecosystem: { level: 4, description: 'Managed', score: 80, improvements_needed: [] },
      };

      const noConflict = { overall_confidence: 80, contradictions_count: 0, resolved_count: 0 };
      const highConflict = { overall_confidence: 80, contradictions_count: 10, resolved_count: 2 };

      const scoreNoConflict = PerfectionRecommendationsOutputService.computeReadinessScore(
        maturity, noConflict,
      );
      const scoreHighConflict = PerfectionRecommendationsOutputService.computeReadinessScore(
        maturity, highConflict,
      );

      expect(scoreHighConflict).toBeLessThan(scoreNoConflict);
    });
  });

  // -----------------------------------------------------------------------
  // generateRecommendations
  // -----------------------------------------------------------------------

  describe('generateRecommendations', () => {
    it('creates recommendations for missing agents', () => {
      const decisions = new Map<string, Record<string, unknown>>();
      // Only provide one agent, many are missing

      const recs = PerfectionRecommendationsOutputService.generateRecommendations(
        decisions, [], null,
        {
          data_infrastructure: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          ai_capabilities: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          marketing_operations: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          compliance_governance: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          security_posture: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          integration_ecosystem: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
        },
      );

      // Should have critical recommendations for missing agents
      const criticalRecs = recs.filter((r) => r.priority === 'critical');
      expect(criticalRecs.length).toBeGreaterThan(0);

      // Each should have proper structure
      for (const rec of recs) {
        expect(rec).toHaveProperty('id');
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('title');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('implementation_steps');
        expect(rec.implementation_steps.length).toBeGreaterThan(0);
      }
    });

    it('creates recommendations for low-confidence agents', () => {
      const decisions = new Map<string, Record<string, unknown>>();
      decisions.set('data_engineering', {
        confidence_score: 25,
        warnings: ['Severe data quality issues'],
        uncertainties: ['Pipeline unreliable'],
        recommendations: [],
      });

      const recs = PerfectionRecommendationsOutputService.generateRecommendations(
        decisions, [], null,
        {
          data_infrastructure: { level: 1, description: 'Initial', score: 25, improvements_needed: [] },
          ai_capabilities: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          marketing_operations: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          compliance_governance: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          security_posture: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          integration_ecosystem: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
        },
      );

      const dataRecs = recs.filter(
        (r) => r.title.includes('data engineering') && r.title.includes('confidence'),
      );
      expect(dataRecs.length).toBeGreaterThan(0);
      expect(dataRecs[0].priority).toBe('critical'); // Below 30 = critical
    });

    it('creates recommendations from unresolved cross-challenge findings', () => {
      const findings = [
        {
          challenger: 'compliance',
          challenged: 'paid_ads',
          finding: 'Ad targeting violates GDPR',
          severity: 'critical',
          confidence: 80,
          resolved: false,
        },
      ];

      const recs = PerfectionRecommendationsOutputService.generateRecommendations(
        new Map(), findings, null,
        {
          data_infrastructure: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
          ai_capabilities: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
          marketing_operations: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
          compliance_governance: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
          security_posture: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
          integration_ecosystem: { level: 3, description: 'Defined', score: 50, improvements_needed: [] },
        },
      );

      const challengeRecs = recs.filter((r) => r.title.includes('cross-challenge'));
      expect(challengeRecs.length).toBeGreaterThan(0);
      expect(challengeRecs[0].priority).toBe('critical');
    });

    it('creates recommendations for maturity gaps below level 4', () => {
      const maturity: MaturityAssessment = {
        data_infrastructure: { level: 2, description: 'Developing', score: 35, improvements_needed: ['Improve pipeline'] },
        ai_capabilities: { level: 5, description: 'Optimised', score: 90, improvements_needed: [] },
        marketing_operations: { level: 3, description: 'Defined', score: 55, improvements_needed: ['Automate workflows'] },
        compliance_governance: { level: 4, description: 'Managed', score: 75, improvements_needed: [] },
        security_posture: { level: 1, description: 'Initial', score: 10, improvements_needed: ['Deploy security agent'] },
        integration_ecosystem: { level: 4, description: 'Managed', score: 70, improvements_needed: [] },
      };

      const recs = PerfectionRecommendationsOutputService.generateRecommendations(
        new Map(), [], null, maturity,
      );

      // Should have maturity recommendations for data_infrastructure (2), marketing_ops (3), security (1)
      const maturityRecs = recs.filter((r) => r.title.includes('maturity'));
      expect(maturityRecs.length).toBe(3);

      // Security (level 1) should be critical
      const securityRec = maturityRecs.find((r) => r.title.includes('security posture'));
      expect(securityRec).toBeDefined();
      expect(securityRec!.priority).toBe('critical');

      // AI capabilities (level 5) should NOT generate a recommendation
      const aiRec = maturityRecs.find((r) => r.title.includes('ai capabilities'));
      expect(aiRec).toBeUndefined();
    });

    it('sorts recommendations by priority then impact', () => {
      const decisions = new Map<string, Record<string, unknown>>();
      decisions.set('data_engineering', {
        confidence_score: 20,
        warnings: [],
        uncertainties: [],
        recommendations: ['Rec 1'],
      });
      decisions.set('performance_analytics', {
        confidence_score: 90,
        warnings: [],
        uncertainties: [],
        recommendations: ['Rec 2'],
      });

      const recs = PerfectionRecommendationsOutputService.generateRecommendations(
        decisions, [], null,
        {
          data_infrastructure: { level: 1, description: 'Initial', score: 20, improvements_needed: [] },
          ai_capabilities: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          marketing_operations: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          compliance_governance: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          security_posture: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
          integration_ecosystem: { level: 1, description: 'Initial', score: 0, improvements_needed: [] },
        },
      );

      // Critical recommendations should come before medium
      const firstCriticalIdx = recs.findIndex((r) => r.priority === 'critical');
      const firstMediumIdx = recs.findIndex((r) => r.priority === 'medium');
      if (firstCriticalIdx >= 0 && firstMediumIdx >= 0) {
        expect(firstCriticalIdx).toBeLessThan(firstMediumIdx);
      }
    });
  });

  // -----------------------------------------------------------------------
  // deriveNextSteps
  // -----------------------------------------------------------------------

  describe('deriveNextSteps', () => {
    it('derives next steps from top recommendations', () => {
      const recs: PerfectionRecommendation[] = [
        {
          id: 'REC-0001',
          category: 'strategy',
          priority: 'critical',
          title: 'Deploy market intelligence agent',
          description: 'Deploy the agent',
          current_state: 'Not operational',
          target_state: 'Fully operational',
          gap_analysis: 'Complete gap',
          implementation_steps: ['Verify deployment', 'Configure inputs'],
          estimated_impact_pct: 15,
          estimated_timeline_weeks: 2,
          dependencies: [],
          confidence: 90,
        },
        {
          id: 'REC-0002',
          category: 'data',
          priority: 'high',
          title: 'Improve data pipeline',
          description: 'Improve pipeline throughput',
          current_state: 'Below threshold',
          target_state: 'Above threshold',
          gap_analysis: 'Performance gap',
          implementation_steps: ['Audit pipeline', 'Optimise queries'],
          estimated_impact_pct: 10,
          estimated_timeline_weeks: 4,
          dependencies: [],
          confidence: 80,
        },
      ];

      const steps = PerfectionRecommendationsOutputService.deriveNextSteps(recs);

      expect(steps).toHaveLength(2);
      expect(steps[0].step).toBe('Step 1');
      expect(steps[0].priority).toBe('critical');
      expect(steps[0].owner).toBe('Strategy Team');
      expect(steps[1].step).toBe('Step 2');
      expect(steps[1].owner).toBe('Data Engineering Team');
    });

    it('limits next steps to at most 10', () => {
      const recs: PerfectionRecommendation[] = Array.from({ length: 15 }, (_, i) => ({
        id: `REC-${String(i + 1).padStart(4, '0')}`,
        category: 'operations' as const,
        priority: 'medium' as const,
        title: `Recommendation ${i + 1}`,
        description: `Description ${i + 1}`,
        current_state: 'Current',
        target_state: 'Target',
        gap_analysis: 'Gap',
        implementation_steps: ['Step 1'],
        estimated_impact_pct: 5,
        estimated_timeline_weeks: 2,
        dependencies: [],
        confidence: 70,
      }));

      const steps = PerfectionRecommendationsOutputService.deriveNextSteps(recs);

      expect(steps).toHaveLength(10);
    });
  });

  // -----------------------------------------------------------------------
  // buildBenchmarks
  // -----------------------------------------------------------------------

  describe('buildBenchmarks', () => {
    it('computes benchmarks from DB data', () => {
      const benchmarkData = {
        industry_average_score: 55,
        top_performer_score: 92,
      };

      const benchmarks = PerfectionRecommendationsOutputService.buildBenchmarks(72, benchmarkData);

      expect(benchmarks.current_score).toBe(72);
      expect(benchmarks.industry_average_score).toBe(55);
      expect(benchmarks.top_performer_score).toBe(92);
      expect(benchmarks.percentile).toBeGreaterThan(50);
      expect(benchmarks.percentile).toBeLessThan(95);
    });

    it('returns zero percentile when no benchmark data', () => {
      const benchmarks = PerfectionRecommendationsOutputService.buildBenchmarks(60, null);

      expect(benchmarks.current_score).toBe(60);
      expect(benchmarks.industry_average_score).toBe(0);
      expect(benchmarks.top_performer_score).toBe(0);
      expect(benchmarks.percentile).toBe(0);
    });

    it('returns 99th percentile when score exceeds top performer', () => {
      const benchmarkData = {
        industry_average_score: 55,
        top_performer_score: 92,
      };

      const benchmarks = PerfectionRecommendationsOutputService.buildBenchmarks(95, benchmarkData);

      expect(benchmarks.percentile).toBe(99);
    });
  });

  // -----------------------------------------------------------------------
  // generatePerfectionRecommendations (integration with DB mocks)
  // -----------------------------------------------------------------------

  describe('generatePerfectionRecommendations', () => {
    it('returns cached result when available', async () => {
      const cachedResult = {
        enterprise_readiness_score: 72,
        grade: 'B',
        recommendations: [],
        maturity_assessment: {},
        next_steps: [],
        benchmarks: { industry_average_score: 55, top_performer_score: 92, current_score: 72, percentile: 60 },
        generated_at: '2025-06-01T00:00:00Z',
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns complete output structure from DB data', async () => {
      // Mock orchestrator result
      mockQuery
        .mockResolvedValueOnce({ rows: [makeOrchestratorResult()] })
        // Mock agent decisions
        .mockResolvedValueOnce({ rows: buildAgentDecisionsRows(70) })
        // Mock cross-challenge findings
        .mockResolvedValueOnce({ rows: [makeCrossChallenge()] })
        // Mock benchmark data
        .mockResolvedValueOnce({ rows: [makeBenchmark()] });

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(result).toHaveProperty('enterprise_readiness_score');
      expect(result).toHaveProperty('grade');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('maturity_assessment');
      expect(result).toHaveProperty('next_steps');
      expect(result).toHaveProperty('benchmarks');
      expect(result).toHaveProperty('generated_at');

      expect(typeof result.enterprise_readiness_score).toBe('number');
      expect(result.enterprise_readiness_score).toBeGreaterThanOrEqual(0);
      expect(result.enterprise_readiness_score).toBeLessThanOrEqual(100);
      expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(result.grade);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(Array.isArray(result.next_steps)).toBe(true);
    });

    it('caches the generated result', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeOrchestratorResult()] })
        .mockResolvedValueOnce({ rows: buildAgentDecisionsRows(70) })
        .mockResolvedValueOnce({ rows: [makeCrossChallenge()] })
        .mockResolvedValueOnce({ rows: [makeBenchmark()] });

      await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(mockCacheSet).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('perfection_recommendations'),
        expect.objectContaining({ enterprise_readiness_score: expect.any(Number) }),
        300,
      );
    });

    it('handles empty database gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no orchestrator
        .mockResolvedValueOnce({ rows: [] }) // no agents
        .mockResolvedValueOnce({ rows: [] }) // no challenges
        .mockResolvedValueOnce({ rows: [] }); // no benchmarks

      const result = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();

      expect(result.enterprise_readiness_score).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.recommendations.length).toBeGreaterThan(0); // maturity gap recommendations
    });
  });

  // -----------------------------------------------------------------------
  // agentToCategory / domainToCategory / categoryToOwner
  // -----------------------------------------------------------------------

  describe('utility mappings', () => {
    it('maps known agents to correct categories', () => {
      expect(PerfectionRecommendationsOutputService.agentToCategory('compliance')).toBe('compliance');
      expect(PerfectionRecommendationsOutputService.agentToCategory('paid_ads')).toBe('operations');
      expect(PerfectionRecommendationsOutputService.agentToCategory('data_engineering')).toBe('technology');
      expect(PerfectionRecommendationsOutputService.agentToCategory('market_intelligence')).toBe('strategy');
    });

    it('maps domains to correct categories', () => {
      expect(PerfectionRecommendationsOutputService.domainToCategory('data_infrastructure')).toBe('data');
      expect(PerfectionRecommendationsOutputService.domainToCategory('security_posture')).toBe('compliance');
      expect(PerfectionRecommendationsOutputService.domainToCategory('ai_capabilities')).toBe('technology');
    });

    it('maps categories to correct owners', () => {
      expect(PerfectionRecommendationsOutputService.categoryToOwner('strategy')).toBe('Strategy Team');
      expect(PerfectionRecommendationsOutputService.categoryToOwner('technology')).toBe('Engineering Team');
      expect(PerfectionRecommendationsOutputService.categoryToOwner('compliance')).toBe('Compliance & Legal');
    });
  });

  // -----------------------------------------------------------------------
  // truncate
  // -----------------------------------------------------------------------

  describe('truncate', () => {
    it('does not truncate short strings', () => {
      expect(PerfectionRecommendationsOutputService.truncate('short', 80)).toBe('short');
    });

    it('truncates long strings with ellipsis', () => {
      const long = 'A'.repeat(100);
      const result = PerfectionRecommendationsOutputService.truncate(long, 50);
      expect(result).toHaveLength(50);
      expect(result.endsWith('...')).toBe(true);
    });
  });
});

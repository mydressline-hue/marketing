/**
 * Unit tests for ExecutionRoadmapOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (phase building, milestone generation, critical path,
 * resource requirements, KPI targets, confidence scoring).
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

import { ExecutionRoadmapOutputService } from '../../../../src/services/final-outputs/ExecutionRoadmapOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeOrchestrationRun = (overrides: Record<string, unknown> = {}) => ({
  id: 'orch-run-1',
  request_id: 'req-1',
  overall_confidence: 78.5,
  contradictions_found: 3,
  contradictions_resolved: 2,
  challenge_cycles_run: 2,
  actions_assigned: 5,
  reasoning: 'Orchestration completed with high confidence.',
  completed_at: '2026-02-20T10:00:00Z',
  ...overrides,
});

const makeAction = (overrides: Record<string, unknown> = {}) => ({
  id: 'action-1',
  type: 'compliance_enforcement',
  description: 'Enforce GDPR compliance for EU markets',
  assigned_agent: 'compliance',
  priority: 'critical',
  deadline: null,
  dependencies: '[]',
  status: 'pending',
  source_entry_agent: 'compliance',
  confidence_score: 85,
  created_at: '2026-02-20T10:00:00Z',
  ...overrides,
});

const makeMatrixRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'matrix-1',
  overall_confidence: 80,
  generated_by: 'master_orchestrator',
  request_id: 'req-1',
  entries: JSON.stringify([
    {
      agent: 'compliance',
      decision: 'Enforce GDPR compliance across all EU markets',
      confidence: 90,
      approved: true,
      action: 'Implement GDPR data handling procedures',
      priority: 1,
    },
    {
      agent: 'paid_ads',
      decision: 'Launch Google Ads campaigns in DE and FR',
      confidence: 75,
      approved: true,
      action: 'Create and launch paid ad campaigns',
      priority: 3,
    },
    {
      agent: 'content_blog',
      decision: 'Create localized blog content for target markets',
      confidence: 68,
      approved: true,
      action: 'Produce 20 localized blog posts',
      priority: 5,
    },
  ]),
  created_at: '2026-02-20T10:00:00Z',
  ...overrides,
});

const makeCountryRow = (overrides: Record<string, unknown> = {}) => ({
  code: 'DE',
  name: 'Germany',
  is_active: true,
  ...overrides,
});

const makeKPIRow = (overrides: Record<string, unknown> = {}) => ({
  name: 'ROAS',
  value: 3.2,
  previous_value: 2.8,
  change_percent: 14.3,
  trend: 'up',
  period: '2026-02',
  ...overrides,
});

const SAMPLE_ACTIONS = [
  makeAction(),
  makeAction({
    id: 'action-2',
    type: 'campaign_management',
    description: 'Launch Google Ads in Germany',
    assigned_agent: 'paid_ads',
    priority: 'high',
    confidence_score: 75,
    dependencies: JSON.stringify(['action-1']),
  }),
  makeAction({
    id: 'action-3',
    type: 'content_creation',
    description: 'Create localized blog content',
    assigned_agent: 'content_blog',
    priority: 'medium',
    confidence_score: 68,
  }),
  makeAction({
    id: 'action-4',
    type: 'experiment_management',
    description: 'Set up A/B tests for landing pages',
    assigned_agent: 'ab_testing',
    priority: 'low',
    confidence_score: 55,
  }),
];

const SAMPLE_COUNTRIES = [
  makeCountryRow(),
  makeCountryRow({ code: 'FR', name: 'France' }),
  makeCountryRow({ code: 'US', name: 'United States' }),
];

const SAMPLE_KPIS = [
  makeKPIRow(),
  makeKPIRow({ name: 'CPA', value: 25, previous_value: 30, change_percent: -16.7, trend: 'down' }),
  makeKPIRow({ name: 'CTR', value: 2.1, previous_value: 1.9, change_percent: 10.5, trend: 'up' }),
];

// ---------------------------------------------------------------------------
// Helper to set up mock DB responses for generateExecutionRoadmap
// ---------------------------------------------------------------------------

function setupMockDBResponses(
  orchRun: unknown = makeOrchestrationRun(),
  actions: unknown[] = SAMPLE_ACTIONS,
  matrix: unknown = makeMatrixRow(),
  countries: unknown[] = SAMPLE_COUNTRIES,
  kpis: unknown[] = SAMPLE_KPIS,
) {
  // The service makes 5 parallel queries
  mockQuery
    .mockResolvedValueOnce({ rows: orchRun ? [orchRun] : [] }) // orchestration_runs
    .mockResolvedValueOnce({ rows: actions }) // marketing_actions
    .mockResolvedValueOnce({ rows: matrix ? [matrix] : [] }) // decision_matrices
    .mockResolvedValueOnce({ rows: countries }) // countries
    .mockResolvedValueOnce({ rows: kpis }); // kpi_metrics
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionRoadmapOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // generateExecutionRoadmap
  // -----------------------------------------------------------------------

  describe('generateExecutionRoadmap', () => {
    it('returns a complete roadmap with correct top-level structure', async () => {
      setupMockDBResponses();

      const result = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

      expect(result).toHaveProperty('roadmap');
      expect(result).toHaveProperty('milestones');
      expect(result).toHaveProperty('critical_path');
      expect(result).toHaveProperty('resource_requirements');
      expect(result).toHaveProperty('kpi_targets');
      expect(result).toHaveProperty('generated_at');
      expect(result).toHaveProperty('confidence_score');
      expect(typeof result.generated_at).toBe('string');
      expect(typeof result.confidence_score).toBe('number');
    });

    it('returns three phases in the roadmap', async () => {
      setupMockDBResponses();

      const result = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

      expect(result.roadmap).toHaveProperty('phase_1_days_1_30');
      expect(result.roadmap).toHaveProperty('phase_2_days_31_60');
      expect(result.roadmap).toHaveProperty('phase_3_days_61_90');
      expect(result.roadmap.phase_1_days_1_30).toHaveProperty('name');
      expect(result.roadmap.phase_1_days_1_30).toHaveProperty('objectives');
      expect(result.roadmap.phase_1_days_1_30).toHaveProperty('key_actions');
      expect(result.roadmap.phase_1_days_1_30).toHaveProperty('expected_outcomes');
      expect(result.roadmap.phase_1_days_1_30).toHaveProperty('risks');
    });

    it('returns cached result when available', async () => {
      const cachedRoadmap = {
        roadmap: { phase_1_days_1_30: {}, phase_2_days_31_60: {}, phase_3_days_61_90: {} },
        milestones: [],
        critical_path: [],
        resource_requirements: { agents_required: 5, api_integrations: [], estimated_api_calls: 0, estimated_cost: 0 },
        kpi_targets: [],
        generated_at: '2026-02-20T10:00:00Z',
        confidence_score: 75,
      };
      mockCacheGet.mockResolvedValueOnce(cachedRoadmap);

      const result = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

      expect(result).toEqual(cachedRoadmap);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches the generated roadmap', async () => {
      setupMockDBResponses();

      await ExecutionRoadmapOutputService.generateExecutionRoadmap();

      expect(mockCacheSet).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('final_output:execution_roadmap'),
        expect.objectContaining({ confidence_score: expect.any(Number) }),
        300,
      );
    });

    it('handles empty database results gracefully', async () => {
      setupMockDBResponses(null, [], null, [], []);

      const result = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

      expect(result.milestones).toHaveLength(0);
      expect(result.critical_path).toHaveLength(0);
      expect(result.kpi_targets).toHaveLength(0);
      expect(result.confidence_score).toBe(0);
      // Phases should still exist with default objectives
      expect(result.roadmap.phase_1_days_1_30.name).toBeDefined();
      expect(result.roadmap.phase_1_days_1_30.objectives.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // getRoadmapByPhase
  // -----------------------------------------------------------------------

  describe('getRoadmapByPhase', () => {
    it('returns phase 1 details', async () => {
      setupMockDBResponses();

      const phase = await ExecutionRoadmapOutputService.getRoadmapByPhase(1);

      expect(phase).toHaveProperty('name');
      expect(phase.name).toContain('Days 1-30');
      expect(phase).toHaveProperty('objectives');
      expect(phase).toHaveProperty('key_actions');
      expect(phase).toHaveProperty('expected_outcomes');
      expect(phase).toHaveProperty('risks');
    });

    it('throws for invalid phase number', async () => {
      setupMockDBResponses();

      await expect(
        ExecutionRoadmapOutputService.getRoadmapByPhase(4),
      ).rejects.toThrow('Invalid phase number: 4');
    });
  });

  // -----------------------------------------------------------------------
  // buildPhase
  // -----------------------------------------------------------------------

  describe('buildPhase', () => {
    const matrixEntries = [
      {
        agent: 'compliance' as const,
        decision: 'Enforce GDPR compliance',
        confidence: 90,
        approved: true,
        action: 'Implement GDPR procedures',
        priority: 1,
      },
      {
        agent: 'paid_ads' as const,
        decision: 'Launch ads in DE',
        confidence: 75,
        approved: true,
        action: 'Create ad campaigns',
        priority: 3,
      },
    ];

    it('builds phase 1 with critical/high priority actions', () => {
      const phase = ExecutionRoadmapOutputService.buildPhase(
        1,
        SAMPLE_ACTIONS as any,
        matrixEntries,
        ['DE', 'FR'],
      );

      expect(phase.name).toContain('Foundation');
      // Phase 1 should include the critical compliance action
      const complianceAction = phase.key_actions.find(
        (a) => a.responsible_agent === 'compliance',
      );
      expect(complianceAction).toBeDefined();
      expect(complianceAction!.priority).toBe('critical');
    });

    it('builds phase 2 with execution/growth actions', () => {
      const phase = ExecutionRoadmapOutputService.buildPhase(
        2,
        SAMPLE_ACTIONS as any,
        matrixEntries,
        ['DE', 'FR'],
      );

      expect(phase.name).toContain('Execution');
    });

    it('builds phase 3 with optimization/scaling actions', () => {
      const phase = ExecutionRoadmapOutputService.buildPhase(
        3,
        SAMPLE_ACTIONS as any,
        matrixEntries,
        ['DE'],
      );

      expect(phase.name).toContain('Optimization');
    });

    it('assigns country scope from provided countries', () => {
      const phase = ExecutionRoadmapOutputService.buildPhase(
        1,
        SAMPLE_ACTIONS as any,
        matrixEntries,
        ['DE', 'FR', 'US'],
      );

      for (const action of phase.key_actions) {
        expect(action.country_scope).toEqual(expect.arrayContaining(['DE', 'FR', 'US']));
      }
    });

    it('uses "global" when no countries provided', () => {
      const phase = ExecutionRoadmapOutputService.buildPhase(
        1,
        SAMPLE_ACTIONS as any,
        matrixEntries,
        [],
      );

      for (const action of phase.key_actions) {
        expect(action.country_scope).toEqual(['global']);
      }
    });
  });

  // -----------------------------------------------------------------------
  // buildMilestones
  // -----------------------------------------------------------------------

  describe('buildMilestones', () => {
    const matrixEntries = [
      {
        agent: 'compliance' as const,
        decision: 'Enforce GDPR',
        confidence: 90,
        approved: true,
        action: 'GDPR implementation',
        priority: 1,
      },
    ];

    it('creates milestones from actions', () => {
      const milestones = ExecutionRoadmapOutputService.buildMilestones(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      expect(milestones.length).toBe(SAMPLE_ACTIONS.length);
    });

    it('assigns earlier days to higher-priority milestones', () => {
      const milestones = ExecutionRoadmapOutputService.buildMilestones(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      // Critical action should have earliest day
      const criticalMilestone = milestones.find(
        (m) => m.owner_agent === 'compliance',
      );
      const lowMilestone = milestones.find(
        (m) => m.owner_agent === 'ab_testing',
      );

      expect(criticalMilestone).toBeDefined();
      expect(lowMilestone).toBeDefined();
      expect(criticalMilestone!.day).toBeLessThan(lowMilestone!.day);
    });

    it('milestones are sorted by day ascending', () => {
      const milestones = ExecutionRoadmapOutputService.buildMilestones(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      for (let i = 1; i < milestones.length; i++) {
        expect(milestones[i].day).toBeGreaterThanOrEqual(milestones[i - 1].day);
      }
    });

    it('includes success criteria from matrix entries when available', () => {
      const milestones = ExecutionRoadmapOutputService.buildMilestones(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      const complianceMilestone = milestones.find(
        (m) => m.owner_agent === 'compliance',
      );
      expect(complianceMilestone).toBeDefined();
      expect(complianceMilestone!.success_criteria).toContain('90%');
    });

    it('returns empty array when no actions provided', () => {
      const milestones = ExecutionRoadmapOutputService.buildMilestones([], []);
      expect(milestones).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // buildCriticalPath
  // -----------------------------------------------------------------------

  describe('buildCriticalPath', () => {
    it('builds critical path from high-priority actions', () => {
      const criticalPath = ExecutionRoadmapOutputService.buildCriticalPath(
        SAMPLE_ACTIONS as any,
      );

      // Only critical and high priority actions are included
      expect(criticalPath.length).toBeGreaterThan(0);
      expect(criticalPath.length).toBeLessThanOrEqual(
        SAMPLE_ACTIONS.filter(
          (a) => a.priority === 'critical' || a.priority === 'high',
        ).length,
      );
    });

    it('assigns sequential start/end days', () => {
      const criticalPath = ExecutionRoadmapOutputService.buildCriticalPath(
        SAMPLE_ACTIONS as any,
      );

      for (let i = 0; i < criticalPath.length; i++) {
        expect(criticalPath[i].start_day).toBeLessThanOrEqual(criticalPath[i].end_day);
        if (i > 0) {
          expect(criticalPath[i].start_day).toBeGreaterThan(
            criticalPath[i - 1].start_day,
          );
        }
      }
    });

    it('marks tasks with dependencies as blocking', () => {
      const criticalPath = ExecutionRoadmapOutputService.buildCriticalPath(
        SAMPLE_ACTIONS as any,
      );

      // action-2 has dependencies so should be blocking
      const blockingTask = criticalPath.find(
        (t) => t.task === 'Launch Google Ads in Germany',
      );
      if (blockingTask) {
        expect(blockingTask.blocking).toBe(true);
      }
    });

    it('returns empty array when no actions', () => {
      const criticalPath = ExecutionRoadmapOutputService.buildCriticalPath([]);
      expect(criticalPath).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // buildResourceRequirements
  // -----------------------------------------------------------------------

  describe('buildResourceRequirements', () => {
    const matrixEntries = [
      { agent: 'compliance' as const, decision: '', confidence: 90, approved: true, action: '', priority: 1 },
      { agent: 'paid_ads' as const, decision: '', confidence: 75, approved: true, action: '', priority: 3 },
    ];

    it('counts unique agents required', () => {
      const resources = ExecutionRoadmapOutputService.buildResourceRequirements(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      // 4 agents from actions + 2 from matrix entries (compliance overlaps)
      expect(resources.agents_required).toBeGreaterThanOrEqual(4);
    });

    it('collects API integrations from involved agents', () => {
      const resources = ExecutionRoadmapOutputService.buildResourceRequirements(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      // paid_ads agent should bring Google Ads API, Meta Ads API, etc.
      expect(resources.api_integrations.length).toBeGreaterThan(0);
      expect(resources.api_integrations).toEqual(
        expect.arrayContaining([expect.stringContaining('API')]),
      );
    });

    it('estimates positive API call count', () => {
      const resources = ExecutionRoadmapOutputService.buildResourceRequirements(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      expect(resources.estimated_api_calls).toBeGreaterThan(0);
    });

    it('estimates positive cost', () => {
      const resources = ExecutionRoadmapOutputService.buildResourceRequirements(
        SAMPLE_ACTIONS as any,
        matrixEntries,
      );

      expect(resources.estimated_cost).toBeGreaterThan(0);
    });

    it('returns zeroes for empty inputs', () => {
      const resources = ExecutionRoadmapOutputService.buildResourceRequirements([], []);

      expect(resources.agents_required).toBe(0);
      expect(resources.api_integrations).toHaveLength(0);
      expect(resources.estimated_api_calls).toBe(0);
      expect(resources.estimated_cost).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // buildKPITargets
  // -----------------------------------------------------------------------

  describe('buildKPITargets', () => {
    it('builds targets from KPI data', () => {
      const targets = ExecutionRoadmapOutputService.buildKPITargets(SAMPLE_KPIS as any);

      expect(targets.length).toBe(3);
    });

    it('includes current and projected values for each KPI', () => {
      const targets = ExecutionRoadmapOutputService.buildKPITargets(SAMPLE_KPIS as any);

      for (const target of targets) {
        expect(target).toHaveProperty('kpi');
        expect(target).toHaveProperty('current_value');
        expect(target).toHaveProperty('target_30d');
        expect(target).toHaveProperty('target_60d');
        expect(target).toHaveProperty('target_90d');
        expect(typeof target.current_value).toBe('number');
        expect(typeof target.target_30d).toBe('number');
        expect(typeof target.target_60d).toBe('number');
        expect(typeof target.target_90d).toBe('number');
      }
    });

    it('projects growth for upward-trending KPIs', () => {
      const roasKPI = [makeKPIRow({ name: 'ROAS', value: 3.0, change_percent: 10, trend: 'up' })];
      const targets = ExecutionRoadmapOutputService.buildKPITargets(roasKPI as any);

      expect(targets[0].target_30d).toBeGreaterThan(targets[0].current_value);
      expect(targets[0].target_60d).toBeGreaterThan(targets[0].target_30d);
      expect(targets[0].target_90d).toBeGreaterThan(targets[0].target_60d);
    });

    it('returns empty array when no KPIs', () => {
      const targets = ExecutionRoadmapOutputService.buildKPITargets([]);
      expect(targets).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // computeConfidenceScore
  // -----------------------------------------------------------------------

  describe('computeConfidenceScore', () => {
    it('computes score from orchestration, matrix, and actions', () => {
      const score = ExecutionRoadmapOutputService.computeConfidenceScore(
        makeOrchestrationRun() as any,
        makeMatrixRow() as any,
        SAMPLE_ACTIONS as any,
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('returns 0 when all inputs are null/empty', () => {
      const score = ExecutionRoadmapOutputService.computeConfidenceScore(null, null, []);
      expect(score).toBe(0);
    });

    it('returns score within 0-100 range', () => {
      const score = ExecutionRoadmapOutputService.computeConfidenceScore(
        makeOrchestrationRun({ overall_confidence: 95 }) as any,
        makeMatrixRow({ overall_confidence: 92 }) as any,
        [makeAction({ confidence_score: 90 })] as any,
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // -----------------------------------------------------------------------
  // deriveRiskLevel
  // -----------------------------------------------------------------------

  describe('deriveRiskLevel', () => {
    it('returns "low" for high confidence critical actions', () => {
      const level = ExecutionRoadmapOutputService.deriveRiskLevel(85, 'critical');
      expect(level).toBe('low');
    });

    it('returns "medium" for moderate confidence', () => {
      const level = ExecutionRoadmapOutputService.deriveRiskLevel(65, 'medium');
      expect(level).toBe('medium');
    });

    it('returns "high" for low confidence', () => {
      const level = ExecutionRoadmapOutputService.deriveRiskLevel(45, 'low');
      expect(level).toBe('high');
    });

    it('returns "critical" for very low confidence', () => {
      const level = ExecutionRoadmapOutputService.deriveRiskLevel(30, 'low');
      expect(level).toBe('critical');
    });
  });

  // -----------------------------------------------------------------------
  // parseMatrixEntries
  // -----------------------------------------------------------------------

  describe('parseMatrixEntries', () => {
    it('parses JSON string entries', () => {
      const entries = JSON.stringify([
        { agent: 'compliance', decision: 'test', confidence: 90, approved: true, action: 'test', priority: 1 },
      ]);

      const result = ExecutionRoadmapOutputService.parseMatrixEntries(entries);
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('compliance');
    });

    it('returns array entries as-is', () => {
      const entries = [
        { agent: 'paid_ads' as const, decision: 'test', confidence: 75, approved: true, action: 'test', priority: 3 },
      ];

      const result = ExecutionRoadmapOutputService.parseMatrixEntries(entries);
      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('paid_ads');
    });

    it('returns empty array for invalid JSON string', () => {
      const result = ExecutionRoadmapOutputService.parseMatrixEntries('not-valid-json');
      expect(result).toHaveLength(0);
    });
  });
});

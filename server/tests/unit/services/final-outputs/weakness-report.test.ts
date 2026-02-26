/**
 * Unit tests for WeaknessReportOutputService.
 *
 * Database pool, helpers, and logger are fully mocked so tests exercise
 * only the service logic (weakness extraction, contradiction analysis,
 * health assessment, confidence scoring, and improvement roadmap building).
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-weakness-id'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { WeaknessReportOutputService } from '../../../../src/services/final-outputs/WeaknessReportOutputService';
import { pool } from '../../../../src/config/database';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChallengeRoundRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cr-001',
    round_number: 1,
    challenges_json: JSON.stringify([
      {
        challengerId: 'market_intelligence',
        challengedId: 'country_strategy',
        findings: [
          {
            area: 'confidence',
            issue: 'Agent country_strategy has very low confidence (25/100)',
            severity: 'critical',
            evidence: 'Confidence score: 25',
            suggestedFix: 'Flag for manual review',
          },
          {
            area: 'data_completeness',
            issue: 'Agent country_strategy output does not address focus area: risk_assessment',
            severity: 'warning',
            evidence: 'Focus area not found in output',
            suggestedFix: 'Include risk_assessment data',
          },
        ],
        overallSeverity: 'critical',
        confidence: 72,
      },
    ]),
    inconsistencies_json: JSON.stringify([]),
    gaps_json: JSON.stringify([]),
    created_at: '2026-02-25T10:00:00Z',
    ...overrides,
  };
}

function makeContradictionResolutionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'res-001',
    inconsistency_json: JSON.stringify({
      agents: ['paid_ads', 'budget_optimization'],
      area: 'budget:total_spend',
      description: 'Budget figure diverges by 45% between agents',
      severity: 'critical',
    }),
    resolution: 'Accepted position of budget_optimization based on higher confidence',
    method: 'confidence_based',
    winning_agent: 'budget_optimization',
    reasoning: 'budget_optimization has confidence 85 vs paid_ads at 60',
    created_at: '2026-02-25T10:00:00Z',
    ...overrides,
  };
}

function makeGapReportRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'gap-001',
    summary: 'Gap analysis found 3 gaps',
    critical_gaps_json: JSON.stringify([
      {
        reportedBy: 'performance_analytics',
        area: 'data_completeness',
        description: 'Agent performance_analytics is missing 3/5 expected data fields',
        dataNeeded: ['kpi_dashboard', 'attribution_model', 'conversion_funnel'],
        impact: 'High: more than half of expected data fields are missing',
      },
    ]),
    recommendations_json: JSON.stringify([
      'Improve data pipelines for performance_analytics',
    ]),
    created_at: '2026-02-25T10:00:00Z',
    ...overrides,
  };
}

function makeAgentDecisionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dec-001',
    agent_type: 'country_strategy',
    decision: 'Expand to Germany market',
    reasoning: 'Strong market signals and competitive opportunity',
    confidence_score: 75,
    warnings_json: JSON.stringify([]),
    data_json: JSON.stringify({ target_markets: ['DE'] }),
    country: 'DE',
    created_at: '2026-02-25T10:00:00Z',
    ...overrides,
  };
}

/** Sets up mock query responses for a standard report generation scenario. */
function setupStandardMocks(options: {
  challengeRounds?: unknown[];
  contradictions?: unknown[];
  gapReports?: unknown[];
  agentDecisions?: unknown[];
} = {}) {
  const {
    challengeRounds = [makeChallengeRoundRow()],
    contradictions = [makeContradictionResolutionRow()],
    gapReports = [makeGapReportRow()],
    agentDecisions = [makeAgentDecisionRow()],
  } = options;

  // The service issues 4 parallel queries in this order:
  // 1. challenge_rounds
  // 2. contradiction_resolutions
  // 3. gap_reports
  // 4. agent_decisions
  mockQuery
    .mockResolvedValueOnce({ rows: challengeRounds })
    .mockResolvedValueOnce({ rows: contradictions })
    .mockResolvedValueOnce({ rows: gapReports })
    .mockResolvedValueOnce({ rows: agentDecisions });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WeaknessReportOutputService', () => {
  let service: WeaknessReportOutputService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeaknessReportOutputService();
  });

  // =========================================================================
  // generateWeaknessReport
  // =========================================================================

  describe('generateWeaknessReport', () => {
    it('returns a complete report structure with all required fields', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      expect(report).toHaveProperty('overall_health');
      expect(report).toHaveProperty('weaknesses');
      expect(report).toHaveProperty('contradictions_found');
      expect(report).toHaveProperty('data_gaps');
      expect(report).toHaveProperty('improvement_roadmap');
      expect(report).toHaveProperty('cross_challenge_summary');
      expect(report).toHaveProperty('generated_at');
      expect(report).toHaveProperty('confidence_score');
      expect(typeof report.generated_at).toBe('string');
      expect(typeof report.confidence_score).toBe('number');
    });

    it('extracts weaknesses from challenge round critical findings', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      // We have 2 findings (critical + warning) from the challenge round,
      // plus 1 critical gap from gap report = at least 3 weaknesses
      expect(report.weaknesses.length).toBeGreaterThanOrEqual(3);

      const confidenceWeakness = report.weaknesses.find(
        (w) => w.category === 'confidence',
      );
      expect(confidenceWeakness).toBeDefined();
      expect(confidenceWeakness!.severity).toBe('critical');
      expect(confidenceWeakness!.affected_agents).toContain('country_strategy');
    });

    it('extracts contradictions from contradiction resolution rows', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      expect(report.contradictions_found).toHaveLength(1);
      expect(report.contradictions_found[0].agents_involved).toEqual([
        'paid_ads',
        'budget_optimization',
      ]);
      expect(report.contradictions_found[0].resolution_status).toBe('resolved');
      expect(report.contradictions_found[0].resolution_method).toBe('confidence_based');
    });

    it('extracts data gaps from gap report rows', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      expect(report.data_gaps).toHaveLength(1);
      expect(report.data_gaps[0].area).toBe('data_completeness');
      expect(report.data_gaps[0].impact).toContain('High');
    });

    it('builds cross-challenge summary from DB data', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      expect(report.cross_challenge_summary.total_challenges_run).toBe(1);
      expect(report.cross_challenge_summary.contradictions_found).toBe(1);
      expect(report.cross_challenge_summary.contradictions_resolved).toBe(1);
      expect(report.cross_challenge_summary.avg_resolution_confidence).toBe(72);
    });

    it('assesses overall health as needs_improvement when critical weaknesses exist', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      // We have at least one critical weakness from the challenge findings
      expect(['needs_improvement', 'critical']).toContain(report.overall_health);
    });

    it('assesses overall health as excellent when no issues found', async () => {
      setupStandardMocks({
        challengeRounds: [makeChallengeRoundRow({
          challenges_json: JSON.stringify([{
            challengerId: 'market_intelligence',
            challengedId: 'country_strategy',
            findings: [],
            overallSeverity: 'info',
            confidence: 90,
          }]),
        })],
        contradictions: [],
        gapReports: [makeGapReportRow({
          critical_gaps_json: JSON.stringify([]),
        })],
        agentDecisions: [makeAgentDecisionRow({ confidence_score: 85 })],
      });

      const report = await service.generateWeaknessReport();

      expect(report.overall_health).toBe('excellent');
    });

    it('handles empty database results gracefully', async () => {
      setupStandardMocks({
        challengeRounds: [],
        contradictions: [],
        gapReports: [],
        agentDecisions: [],
      });

      const report = await service.generateWeaknessReport();

      expect(report.overall_health).toBe('needs_improvement');
      expect(report.weaknesses).toHaveLength(0);
      expect(report.contradictions_found).toHaveLength(0);
      expect(report.data_gaps).toHaveLength(0);
      expect(report.improvement_roadmap).toHaveLength(0);
      expect(report.confidence_score).toBe(0);
    });

    it('includes unresolved contradictions as weaknesses', async () => {
      setupStandardMocks({
        contradictions: [
          makeContradictionResolutionRow({
            method: 'manual_review',
            winning_agent: null,
            resolution: 'Flagged for manual review',
          }),
        ],
      });

      const report = await service.generateWeaknessReport();

      const unresolvedWeakness = report.weaknesses.find(
        (w) => w.category === 'unresolved_contradiction',
      );
      expect(unresolvedWeakness).toBeDefined();
      expect(unresolvedWeakness!.description).toContain('Unresolved contradiction');
    });

    it('includes low-confidence agent decisions as weaknesses', async () => {
      setupStandardMocks({
        challengeRounds: [],
        contradictions: [],
        gapReports: [makeGapReportRow({ critical_gaps_json: JSON.stringify([]) })],
        agentDecisions: [
          makeAgentDecisionRow({
            confidence_score: 15,
            agent_type: 'fraud_detection',
            warnings_json: JSON.stringify(['Data stale', 'Model outdated']),
          }),
        ],
      });

      const report = await service.generateWeaknessReport();

      const lowConfWeakness = report.weaknesses.find(
        (w) => w.category === 'low_confidence',
      );
      expect(lowConfWeakness).toBeDefined();
      expect(lowConfWeakness!.severity).toBe('critical');
      expect(lowConfWeakness!.affected_agents).toContain('fraud_detection');
    });

    it('queries the correct database tables', async () => {
      setupStandardMocks();

      await service.generateWeaknessReport();

      expect(mockQuery).toHaveBeenCalledTimes(4);

      const queries = mockQuery.mock.calls.map(
        (call: unknown[]) => (call[0] as string).trim(),
      );

      expect(queries[0]).toContain('challenge_rounds');
      expect(queries[1]).toContain('contradiction_resolutions');
      expect(queries[2]).toContain('gap_reports');
      expect(queries[3]).toContain('agent_decisions');
    });

    it('sorts weaknesses by severity then priority rank', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      if (report.weaknesses.length >= 2) {
        const severityOrder: Record<string, number> = {
          critical: 0, high: 1, medium: 2, low: 3,
        };

        for (let i = 0; i < report.weaknesses.length - 1; i++) {
          const a = report.weaknesses[i];
          const b = report.weaknesses[i + 1];
          const aOrder = severityOrder[a.severity] ?? 3;
          const bOrder = severityOrder[b.severity] ?? 3;
          expect(aOrder).toBeLessThanOrEqual(bOrder);
        }
      }
    });

    it('generates improvement roadmap with critical items first', async () => {
      setupStandardMocks();

      const report = await service.generateWeaknessReport();

      expect(report.improvement_roadmap.length).toBeGreaterThan(0);

      // Verify priority ordering
      for (let i = 0; i < report.improvement_roadmap.length - 1; i++) {
        expect(report.improvement_roadmap[i].priority).toBeLessThan(
          report.improvement_roadmap[i + 1].priority,
        );
      }
    });
  });

  // =========================================================================
  // getWeaknessByCategory
  // =========================================================================

  describe('getWeaknessByCategory', () => {
    it('returns only weaknesses matching the specified category', async () => {
      setupStandardMocks();

      const result = await service.getWeaknessByCategory('confidence');

      expect(result.length).toBeGreaterThan(0);
      for (const w of result) {
        expect(w.category).toBe('confidence');
      }
    });

    it('returns empty array for non-existent category', async () => {
      setupStandardMocks();

      const result = await service.getWeaknessByCategory('nonexistent_category');

      expect(result).toHaveLength(0);
    });

    it('performs case-insensitive category matching', async () => {
      setupStandardMocks();

      const lower = await service.getWeaknessByCategory('confidence');

      // Re-setup mocks for second call
      setupStandardMocks();
      const upper = await service.getWeaknessByCategory('CONFIDENCE');

      expect(lower.length).toBe(upper.length);
    });
  });

  // =========================================================================
  // getImprovementPriorities
  // =========================================================================

  describe('getImprovementPriorities', () => {
    it('returns improvement actions sorted by ascending priority', async () => {
      setupStandardMocks();

      const priorities = await service.getImprovementPriorities();

      expect(priorities.length).toBeGreaterThan(0);

      for (let i = 0; i < priorities.length - 1; i++) {
        expect(priorities[i].priority).toBeLessThanOrEqual(
          priorities[i + 1].priority,
        );
      }
    });

    it('includes required fields in each improvement action', async () => {
      setupStandardMocks();

      const priorities = await service.getImprovementPriorities();

      for (const action of priorities) {
        expect(action).toHaveProperty('priority');
        expect(action).toHaveProperty('action');
        expect(action).toHaveProperty('expected_impact');
        expect(action).toHaveProperty('timeline_weeks');
        expect(action).toHaveProperty('responsible_agent');
        expect(typeof action.priority).toBe('number');
        expect(typeof action.timeline_weeks).toBe('number');
      }
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('handles database query failures gracefully', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'));

      const report = await service.generateWeaknessReport();

      // Should still return a valid report structure with empty data
      expect(report.weaknesses).toHaveLength(0);
      expect(report.contradictions_found).toHaveLength(0);
      expect(report.data_gaps).toHaveLength(0);
      expect(report.overall_health).toBe('needs_improvement');
    });

    it('handles malformed JSON in challenge rounds gracefully', async () => {
      setupStandardMocks({
        challengeRounds: [{
          id: 'cr-bad',
          round_number: 1,
          challenges_json: '{invalid json',
          inconsistencies_json: '{invalid json',
          gaps_json: '{invalid json',
          created_at: '2026-02-25T10:00:00Z',
        }],
      });

      const report = await service.generateWeaknessReport();

      // Should not throw, just produce empty results for that round
      expect(report).toBeDefined();
      expect(report.generated_at).toBeDefined();
    });
  });
});

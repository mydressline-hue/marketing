/**
 * E2E tests for Weakness & Improvement Report workflow lifecycle.
 *
 * Tests the full weakness report workflow including:
 *   - Report generation with various data scenarios
 *   - Health assessment transitions based on weakness severity
 *   - Improvement roadmap prioritisation logic
 *   - Contradiction detection and categorisation
 *   - Confidence score calculation from DB data
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
import { WeaknessReportOutputService } from '../../../src/services/final-outputs/WeaknessReportOutputService';
import type {
  WeaknessReport,
  OverallHealth,
} from '../../../src/services/final-outputs/WeaknessReportOutputService';

const mockQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Workflow Simulator -- builds DB scenarios for the service to consume
// ---------------------------------------------------------------------------

class WeaknessReportWorkflowSimulator {
  private challengeRounds: unknown[] = [];
  private contradictions: unknown[] = [];
  private gapReports: unknown[] = [];
  private agentDecisions: unknown[] = [];

  addChallengeRound(overrides: {
    findings?: Array<{
      area: string;
      issue: string;
      severity: string;
      evidence: string;
      suggestedFix?: string;
    }>;
    challengerId?: string;
    challengedId?: string;
    confidence?: number;
  } = {}): this {
    const {
      findings = [],
      challengerId = 'market_intelligence',
      challengedId = 'country_strategy',
      confidence = 70,
    } = overrides;

    this.challengeRounds.push({
      id: `cr-${this.challengeRounds.length + 1}`,
      round_number: this.challengeRounds.length + 1,
      challenges_json: JSON.stringify([
        {
          challengerId,
          challengedId,
          findings,
          overallSeverity: findings.some((f) => f.severity === 'critical')
            ? 'critical'
            : findings.some((f) => f.severity === 'warning')
              ? 'warning'
              : 'info',
          confidence,
        },
      ]),
      inconsistencies_json: JSON.stringify([]),
      gaps_json: JSON.stringify([]),
      created_at: new Date().toISOString(),
    });

    return this;
  }

  addContradiction(overrides: {
    agents?: string[];
    area?: string;
    description?: string;
    severity?: string;
    method?: string;
    winningAgent?: string | null;
  } = {}): this {
    const {
      agents = ['paid_ads', 'budget_optimization'],
      area = 'budget:total_spend',
      description = 'Budget diverges between agents',
      severity = 'critical',
      method = 'confidence_based',
      winningAgent = 'budget_optimization',
    } = overrides;

    this.contradictions.push({
      id: `res-${this.contradictions.length + 1}`,
      inconsistency_json: JSON.stringify({ agents, area, description, severity }),
      resolution: `Resolved via ${method}`,
      method,
      winning_agent: winningAgent,
      reasoning: `Resolution reasoning for ${area}`,
      created_at: new Date().toISOString(),
    });

    return this;
  }

  addGapReport(overrides: {
    criticalGaps?: Array<{
      reportedBy: string;
      area: string;
      description: string;
      dataNeeded: string[];
      impact: string;
    }>;
  } = {}): this {
    const { criticalGaps = [] } = overrides;

    this.gapReports.push({
      id: `gap-${this.gapReports.length + 1}`,
      summary: `Gap report with ${criticalGaps.length} critical gaps`,
      critical_gaps_json: JSON.stringify(criticalGaps),
      recommendations_json: JSON.stringify(
        criticalGaps.map((g) => `Address gaps in ${g.area}`),
      ),
      created_at: new Date().toISOString(),
    });

    return this;
  }

  addAgentDecision(overrides: {
    agentType?: string;
    confidenceScore?: number;
    country?: string;
    warnings?: string[];
  } = {}): this {
    const {
      agentType = 'country_strategy',
      confidenceScore = 75,
      country = 'DE',
      warnings = [],
    } = overrides;

    this.agentDecisions.push({
      id: `dec-${this.agentDecisions.length + 1}`,
      agent_type: agentType,
      decision: `Decision by ${agentType}`,
      reasoning: `Reasoning for ${agentType} decision in ${country}`,
      confidence_score: confidenceScore,
      warnings_json: JSON.stringify(warnings),
      data_json: JSON.stringify({}),
      country,
      created_at: new Date().toISOString(),
    });

    return this;
  }

  applyMocks(): void {
    mockQuery
      .mockResolvedValueOnce({ rows: this.challengeRounds })
      .mockResolvedValueOnce({ rows: this.contradictions })
      .mockResolvedValueOnce({ rows: this.gapReports })
      .mockResolvedValueOnce({ rows: this.agentDecisions });
  }

  reset(): void {
    this.challengeRounds = [];
    this.contradictions = [];
    this.gapReports = [];
    this.agentDecisions = [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Weakness Report Workflow E2E Tests', () => {
  let service: WeaknessReportOutputService;
  let simulator: WeaknessReportWorkflowSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeaknessReportOutputService();
    simulator = new WeaknessReportWorkflowSimulator();
  });

  // =========================================================================
  // Healthy system workflow
  // =========================================================================

  describe('Healthy system with no critical issues', () => {
    it('should produce excellent health when all agents are performing well', async () => {
      simulator
        .addChallengeRound({
          findings: [],
          confidence: 90,
        })
        .addAgentDecision({ confidenceScore: 88, agentType: 'market_intelligence' })
        .addAgentDecision({ confidenceScore: 85, agentType: 'paid_ads' })
        .addGapReport({ criticalGaps: [] });

      simulator.applyMocks();

      const report = await service.generateWeaknessReport();

      expect(report.overall_health).toBe('excellent');
      expect(report.weaknesses).toHaveLength(0);
      expect(report.contradictions_found).toHaveLength(0);
      expect(report.data_gaps).toHaveLength(0);
      expect(report.confidence_score).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Degraded system workflow
  // =========================================================================

  describe('System degradation with multiple weaknesses', () => {
    it('should escalate to needs_improvement with critical findings', async () => {
      simulator
        .addChallengeRound({
          findings: [
            {
              area: 'confidence',
              issue: 'Very low confidence in country_strategy (20/100)',
              severity: 'critical',
              evidence: 'Confidence: 20',
              suggestedFix: 'Review data inputs',
            },
          ],
          confidence: 55,
        })
        .addContradiction({
          method: 'manual_review',
          winningAgent: null,
        })
        .addGapReport({
          criticalGaps: [{
            reportedBy: 'performance_analytics',
            area: 'data_completeness',
            description: 'Missing KPI dashboard data',
            dataNeeded: ['kpi_dashboard'],
            impact: 'High: critical data missing',
          }],
        })
        .addAgentDecision({ confidenceScore: 70 });

      simulator.applyMocks();

      const report = await service.generateWeaknessReport();

      expect(['needs_improvement', 'critical']).toContain(report.overall_health);
      expect(report.weaknesses.length).toBeGreaterThanOrEqual(2);
      expect(report.improvement_roadmap.length).toBeGreaterThan(0);

      // Unresolved contradiction should appear
      const unresolvedContradictions = report.contradictions_found.filter(
        (c) => c.resolution_status === 'unresolved',
      );
      expect(unresolvedContradictions.length).toBe(1);
    });

    it('should escalate to critical with many severe issues', async () => {
      // Add multiple critical findings across multiple rounds
      for (let i = 0; i < 5; i++) {
        simulator.addChallengeRound({
          findings: [
            {
              area: 'confidence',
              issue: `Critical issue ${i}`,
              severity: 'critical',
              evidence: `Evidence ${i}`,
            },
          ],
          challengedId: ['country_strategy', 'paid_ads', 'budget_optimization', 'compliance', 'fraud_detection'][i],
          confidence: 40,
        });
      }

      // Add many unresolved contradictions
      for (let i = 0; i < 6; i++) {
        simulator.addContradiction({
          method: 'manual_review',
          winningAgent: null,
          area: `area_${i}`,
          description: `Unresolved issue ${i}`,
        });
      }

      simulator
        .addGapReport({ criticalGaps: [] })
        .addAgentDecision({ confidenceScore: 50 });

      simulator.applyMocks();

      const report = await service.generateWeaknessReport();

      expect(report.overall_health).toBe('critical');
      expect(report.weaknesses.length).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // Improvement roadmap prioritisation
  // =========================================================================

  describe('Improvement roadmap reflects correct priority ordering', () => {
    it('should place critical weakness fixes before data gap fills', async () => {
      simulator
        .addChallengeRound({
          findings: [
            {
              area: 'confidence',
              issue: 'Critical confidence failure',
              severity: 'critical',
              evidence: 'Score: 10',
              suggestedFix: 'Fix confidence pipeline',
            },
          ],
          confidence: 60,
        })
        .addContradiction({ method: 'confidence_based', winningAgent: 'paid_ads' })
        .addGapReport({
          criticalGaps: [{
            reportedBy: 'data_engineering',
            area: 'data_completeness',
            description: 'Missing pipeline data',
            dataNeeded: ['pipeline_health'],
            impact: 'Medium: some data missing',
          }],
        })
        .addAgentDecision({ confidenceScore: 80 });

      simulator.applyMocks();

      const priorities = await service.getImprovementPriorities();

      expect(priorities.length).toBeGreaterThan(0);

      // First item should be the critical weakness fix
      const firstAction = priorities[0];
      expect(firstAction.priority).toBe(1);

      // Verify ascending priority ordering
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i].priority).toBeGreaterThanOrEqual(priorities[i - 1].priority);
      }
    });
  });

  // =========================================================================
  // Category filtering workflow
  // =========================================================================

  describe('Category filtering returns correct subsets', () => {
    it('should return only confidence-related weaknesses when filtering by confidence', async () => {
      simulator
        .addChallengeRound({
          findings: [
            {
              area: 'confidence',
              issue: 'Low confidence in decision',
              severity: 'critical',
              evidence: 'Score: 15',
            },
            {
              area: 'data_completeness',
              issue: 'Missing required data fields',
              severity: 'warning',
              evidence: 'Fields missing',
            },
          ],
          confidence: 65,
        })
        .addGapReport({ criticalGaps: [] })
        .addAgentDecision({ confidenceScore: 80 });

      simulator.applyMocks();

      const confidenceWeaknesses = await service.getWeaknessByCategory('confidence');

      expect(confidenceWeaknesses.length).toBeGreaterThan(0);
      for (const w of confidenceWeaknesses) {
        expect(w.category).toBe('confidence');
      }

      // There should be no data_completeness items
      const hasDataCompleteness = confidenceWeaknesses.some(
        (w) => w.category === 'data_completeness',
      );
      expect(hasDataCompleteness).toBe(false);
    });
  });

  // =========================================================================
  // Confidence score calculation
  // =========================================================================

  describe('Confidence score reflects data availability', () => {
    it('should produce higher confidence with more challenge rounds and decisions', async () => {
      // Scenario 1: minimal data
      const minimalSimulator = new WeaknessReportWorkflowSimulator();
      minimalSimulator
        .addChallengeRound({ findings: [], confidence: 50 })
        .addGapReport({ criticalGaps: [] })
        .addAgentDecision({ confidenceScore: 60 });
      minimalSimulator.applyMocks();

      const minimalReport = await service.generateWeaknessReport();

      // Scenario 2: rich data
      jest.clearAllMocks();
      const richSimulator = new WeaknessReportWorkflowSimulator();
      for (let i = 0; i < 15; i++) {
        richSimulator.addChallengeRound({ findings: [], confidence: 80 });
      }
      richSimulator.addGapReport({ criticalGaps: [] });
      for (let i = 0; i < 150; i++) {
        richSimulator.addAgentDecision({ confidenceScore: 85, agentType: 'paid_ads' });
      }
      richSimulator.applyMocks();

      const richReport = await service.generateWeaknessReport();

      expect(richReport.confidence_score).toBeGreaterThan(minimalReport.confidence_score);
    });
  });

  // =========================================================================
  // Cross-challenge summary accuracy
  // =========================================================================

  describe('Cross-challenge summary reflects actual DB data', () => {
    it('should count challenges, contradictions, and resolutions from DB rows', async () => {
      simulator
        .addChallengeRound({
          findings: [{ area: 'risk', issue: 'Risk issue 1', severity: 'warning', evidence: 'E1' }],
          confidence: 75,
        })
        .addChallengeRound({
          findings: [],
          confidence: 80,
        })
        .addContradiction({ method: 'confidence_based', winningAgent: 'paid_ads' })
        .addContradiction({ method: 'data_backed', winningAgent: 'market_intelligence' })
        .addContradiction({ method: 'manual_review', winningAgent: null })
        .addGapReport({ criticalGaps: [] })
        .addAgentDecision({ confidenceScore: 70 });

      simulator.applyMocks();

      const report = await service.generateWeaknessReport();

      expect(report.cross_challenge_summary.total_challenges_run).toBe(2);
      expect(report.cross_challenge_summary.contradictions_found).toBe(3);
      expect(report.cross_challenge_summary.contradictions_resolved).toBe(2);
      expect(report.cross_challenge_summary.avg_resolution_confidence).toBeGreaterThan(0);
    });
  });
});

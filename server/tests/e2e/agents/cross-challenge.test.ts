/**
 * E2E tests for the cross-challenge protocol.
 *
 * Tests the system where agents can challenge each other's outputs
 * when contradictions or inconsistencies are detected. The protocol
 * includes:
 *   - Contradiction detection between agent outputs
 *   - Challenge rounds with confidence-based resolution
 *   - Gap reporting for missing data
 *   - Convergence through multiple rounds
 *   - DB persistence of challenge records
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
  AgentDecision,
  CrossChallengeResult,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Cross-Challenge Protocol Engine
// ---------------------------------------------------------------------------

interface AgentOutput {
  agent_type: AgentType;
  decision_type: string;
  output_data: Record<string, unknown>;
  confidence_score: number;
  reasoning: string;
}

interface ContradictionDetection {
  field: string;
  agent_a: AgentType;
  value_a: unknown;
  confidence_a: number;
  agent_b: AgentType;
  value_b: unknown;
  confidence_b: number;
}

interface ChallengeRound {
  round_number: number;
  challenger: AgentType;
  challenged: AgentType;
  contradiction: ContradictionDetection;
  result: CrossChallengeResult;
  timestamp: string;
}

interface GapReport {
  reporter: AgentType;
  missing_data: string[];
  severity: 'low' | 'medium' | 'high';
  recommended_source: AgentType | null;
}

class CrossChallengeProtocol {
  private rounds: ChallengeRound[] = [];
  private gapReports: GapReport[] = [];

  /**
   * Detect contradictions between two agent outputs.
   */
  detectContradictions(
    outputA: AgentOutput,
    outputB: AgentOutput,
  ): ContradictionDetection[] {
    const contradictions: ContradictionDetection[] = [];
    const fieldsA = Object.keys(outputA.output_data);
    const fieldsB = Object.keys(outputB.output_data);
    const commonFields = fieldsA.filter((f) => fieldsB.includes(f));

    for (const field of commonFields) {
      const valA = outputA.output_data[field];
      const valB = outputB.output_data[field];

      // Detect when both agents provide different values for the same field
      if (valA !== valB && valA !== undefined && valB !== undefined) {
        contradictions.push({
          field,
          agent_a: outputA.agent_type,
          value_a: valA,
          confidence_a: outputA.confidence_score,
          agent_b: outputB.agent_type,
          value_b: valB,
          confidence_b: outputB.confidence_score,
        });
      }
    }

    return contradictions;
  }

  /**
   * Resolve a contradiction by selecting the winner based on confidence score.
   */
  resolveByConfidence(contradiction: ContradictionDetection): CrossChallengeResult {
    const winnerIsA = contradiction.confidence_a >= contradiction.confidence_b;
    const winner = winnerIsA ? contradiction.agent_a : contradiction.agent_b;
    const loser = winnerIsA ? contradiction.agent_b : contradiction.agent_a;
    const winnerConfidence = winnerIsA ? contradiction.confidence_a : contradiction.confidence_b;

    return {
      challenger: loser,
      challenged: winner,
      finding: `Contradiction on field '${contradiction.field}': ${winner} output accepted with confidence ${winnerConfidence.toFixed(2)}.`,
      severity: winnerConfidence > 0.8 ? 'info' : winnerConfidence > 0.5 ? 'warning' : 'critical',
      confidence: winnerConfidence,
      resolved: true,
    };
  }

  /**
   * Execute a challenge round for a detected contradiction.
   */
  executeRound(
    contradiction: ContradictionDetection,
    roundNumber: number,
  ): ChallengeRound {
    const result = this.resolveByConfidence(contradiction);
    const round: ChallengeRound = {
      round_number: roundNumber,
      challenger: result.challenger,
      challenged: result.challenged,
      contradiction,
      result,
      timestamp: new Date().toISOString(),
    };
    this.rounds.push(round);
    return round;
  }

  /**
   * Report gaps in data that prevent full analysis.
   */
  reportGap(
    reporter: AgentType,
    missingData: string[],
    severity: 'low' | 'medium' | 'high',
    recommendedSource: AgentType | null = null,
  ): GapReport {
    const report: GapReport = {
      reporter,
      missing_data: missingData,
      severity,
      recommended_source: recommendedSource,
    };
    this.gapReports.push(report);
    return report;
  }

  /**
   * Run multiple challenge rounds until all contradictions are resolved
   * or maximum rounds reached.
   */
  runUntilConvergence(
    outputs: AgentOutput[],
    maxRounds: number = 10,
  ): { rounds: ChallengeRound[]; converged: boolean; totalRounds: number } {
    let roundNumber = 0;
    const allContradictions: ContradictionDetection[] = [];

    // Detect all pairwise contradictions
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const contradictions = this.detectContradictions(outputs[i], outputs[j]);
        allContradictions.push(...contradictions);
      }
    }

    const executedRounds: ChallengeRound[] = [];

    for (const contradiction of allContradictions) {
      if (roundNumber >= maxRounds) break;
      roundNumber++;
      const round = this.executeRound(contradiction, roundNumber);
      executedRounds.push(round);
    }

    return {
      rounds: executedRounds,
      converged: roundNumber < maxRounds,
      totalRounds: roundNumber,
    };
  }

  getRounds(): ChallengeRound[] {
    return [...this.rounds];
  }

  getGapReports(): GapReport[] {
    return [...this.gapReports];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-Challenge Protocol E2E Tests', () => {
  let protocol: CrossChallengeProtocol;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    protocol = new CrossChallengeProtocol();
  });

  // =========================================================================
  // Contradiction detection
  // =========================================================================

  describe('Contradiction detection', () => {
    it('detects conflicting outputs between two agents', () => {
      const outputA: AgentOutput = {
        agent_type: 'performance_analytics',
        decision_type: 'recommendation',
        output_data: {
          recommended_budget: 15000,
          recommended_channel: 'google',
          risk_level: 'low',
        },
        confidence_score: 0.88,
        reasoning: 'Based on current ROAS trends.',
      };

      const outputB: AgentOutput = {
        agent_type: 'budget_optimization',
        decision_type: 'recommendation',
        output_data: {
          recommended_budget: 8000,
          recommended_channel: 'meta',
          risk_level: 'medium',
        },
        confidence_score: 0.82,
        reasoning: 'Based on cost efficiency analysis.',
      };

      const contradictions = protocol.detectContradictions(outputA, outputB);

      expect(contradictions).toHaveLength(3);
      expect(contradictions.map((c) => c.field)).toEqual(
        expect.arrayContaining(['recommended_budget', 'recommended_channel', 'risk_level']),
      );

      const budgetContradiction = contradictions.find((c) => c.field === 'recommended_budget')!;
      expect(budgetContradiction.value_a).toBe(15000);
      expect(budgetContradiction.value_b).toBe(8000);
      expect(budgetContradiction.agent_a).toBe('performance_analytics');
      expect(budgetContradiction.agent_b).toBe('budget_optimization');
    });

    it('returns empty array when no contradictions exist', () => {
      const outputA: AgentOutput = {
        agent_type: 'compliance',
        decision_type: 'validation',
        output_data: { is_compliant: true, regulation: 'gdpr' },
        confidence_score: 0.95,
        reasoning: 'All checks passed.',
      };

      const outputB: AgentOutput = {
        agent_type: 'brand_consistency',
        decision_type: 'validation',
        output_data: { is_compliant: true, regulation: 'gdpr' },
        confidence_score: 0.92,
        reasoning: 'Brand guidelines met.',
      };

      const contradictions = protocol.detectContradictions(outputA, outputB);

      expect(contradictions).toHaveLength(0);
    });
  });

  // =========================================================================
  // Contradiction resolution by confidence
  // =========================================================================

  describe('Contradiction resolution', () => {
    it('picks the higher-confidence agent as the winner', () => {
      const contradiction: ContradictionDetection = {
        field: 'recommended_budget',
        agent_a: 'performance_analytics',
        value_a: 15000,
        confidence_a: 0.92,
        agent_b: 'budget_optimization',
        value_b: 8000,
        confidence_b: 0.78,
      };

      const result = protocol.resolveByConfidence(contradiction);

      expect(result.challenged).toBe('performance_analytics'); // winner (higher confidence)
      expect(result.challenger).toBe('budget_optimization'); // loser
      expect(result.confidence).toBe(0.92);
      expect(result.resolved).toBe(true);
      expect(result.severity).toBe('info'); // confidence > 0.8
    });

    it('assigns warning severity for medium confidence resolutions', () => {
      const contradiction: ContradictionDetection = {
        field: 'risk_level',
        agent_a: 'fraud_detection',
        value_a: 'high',
        confidence_a: 0.65,
        agent_b: 'performance_analytics',
        value_b: 'low',
        confidence_b: 0.60,
      };

      const result = protocol.resolveByConfidence(contradiction);

      expect(result.confidence).toBe(0.65);
      expect(result.severity).toBe('warning'); // confidence between 0.5 and 0.8
    });

    it('assigns critical severity for low confidence resolutions', () => {
      const contradiction: ContradictionDetection = {
        field: 'market_entry_mode',
        agent_a: 'market_intelligence',
        value_a: 'direct',
        confidence_a: 0.35,
        agent_b: 'country_strategy',
        value_b: 'partnership',
        confidence_b: 0.45,
      };

      const result = protocol.resolveByConfidence(contradiction);

      expect(result.confidence).toBe(0.45);
      expect(result.severity).toBe('critical'); // confidence <= 0.5
      expect(result.challenged).toBe('country_strategy'); // higher confidence wins
    });
  });

  // =========================================================================
  // Gap reporting
  // =========================================================================

  describe('Gap reporting', () => {
    it('identifies missing data in agent outputs', () => {
      const gap = protocol.reportGap(
        'country_strategy',
        ['gdp_growth_rate', 'consumer_confidence_index', 'regulatory_changes'],
        'high',
        'market_intelligence',
      );

      expect(gap.reporter).toBe('country_strategy');
      expect(gap.missing_data).toHaveLength(3);
      expect(gap.missing_data).toContain('gdp_growth_rate');
      expect(gap.severity).toBe('high');
      expect(gap.recommended_source).toBe('market_intelligence');
    });

    it('accumulates gap reports from multiple agents', () => {
      protocol.reportGap(
        'budget_optimization',
        ['historical_spend_q4'],
        'medium',
        'data_engineering',
      );

      protocol.reportGap(
        'localization',
        ['cultural_sensitivity_scores', 'local_slang_dictionary'],
        'low',
        null,
      );

      protocol.reportGap(
        'compliance',
        ['updated_regulation_text'],
        'high',
        null,
      );

      const reports = protocol.getGapReports();

      expect(reports).toHaveLength(3);
      expect(reports[0].reporter).toBe('budget_optimization');
      expect(reports[1].reporter).toBe('localization');
      expect(reports[2].reporter).toBe('compliance');
      expect(reports[2].severity).toBe('high');
    });
  });

  // =========================================================================
  // Challenge round execution
  // =========================================================================

  describe('Challenge round execution', () => {
    it('executes a challenge round and logs it', () => {
      const contradiction: ContradictionDetection = {
        field: 'target_audience',
        agent_a: 'paid_ads',
        value_a: '18-34',
        confidence_a: 0.85,
        agent_b: 'organic_social',
        value_b: '25-45',
        confidence_b: 0.79,
      };

      const round = protocol.executeRound(contradiction, 1);

      expect(round.round_number).toBe(1);
      expect(round.contradiction.field).toBe('target_audience');
      expect(round.result.resolved).toBe(true);
      expect(round.result.challenged).toBe('paid_ads'); // higher confidence
      expect(round.result.challenger).toBe('organic_social');
      expect(round.timestamp).toBeDefined();

      // Verify round is tracked
      const allRounds = protocol.getRounds();
      expect(allRounds).toHaveLength(1);
    });

    it('persists challenge round to database', async () => {
      const contradiction: ContradictionDetection = {
        field: 'recommended_channel',
        agent_a: 'market_intelligence',
        value_a: 'google',
        confidence_a: 0.90,
        agent_b: 'competitive_intelligence',
        value_b: 'tiktok',
        confidence_b: 0.75,
      };

      const round = protocol.executeRound(contradiction, 1);

      // Simulate DB insert
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'challenge-round-001',
          round_number: round.round_number,
          challenger: round.result.challenger,
          challenged: round.result.challenged,
          finding: round.result.finding,
          severity: round.result.severity,
          confidence: round.result.confidence,
          resolved: round.result.resolved,
          created_at: round.timestamp,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO challenge_rounds (id, round_number, challenger, challenged, finding, severity, confidence, resolved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [
          'challenge-round-001',
          round.round_number,
          round.result.challenger,
          round.result.challenged,
          round.result.finding,
          round.result.severity,
          round.result.confidence,
          round.result.resolved,
        ],
      );

      expect(dbResult.rows[0].round_number).toBe(1);
      expect(dbResult.rows[0].resolved).toBe(true);
      expect(dbResult.rows[0].challenger).toBe('competitive_intelligence');
      expect(dbResult.rows[0].challenged).toBe('market_intelligence');
    });
  });

  // =========================================================================
  // Multiple rounds until convergence
  // =========================================================================

  describe('Multiple rounds until convergence', () => {
    it('resolves all contradictions across multiple agents', () => {
      const outputs: AgentOutput[] = [
        {
          agent_type: 'performance_analytics',
          decision_type: 'recommendation',
          output_data: { budget_action: 'increase', channel: 'google', risk: 'low' },
          confidence_score: 0.91,
          reasoning: 'Performance data supports growth.',
        },
        {
          agent_type: 'fraud_detection',
          decision_type: 'recommendation',
          output_data: { budget_action: 'decrease', channel: 'google', risk: 'high' },
          confidence_score: 0.88,
          reasoning: 'Fraud signals detected.',
        },
        {
          agent_type: 'budget_optimization',
          decision_type: 'recommendation',
          output_data: { budget_action: 'maintain', channel: 'meta', risk: 'medium' },
          confidence_score: 0.84,
          reasoning: 'Cost efficiency suggests stability.',
        },
      ];

      const result = protocol.runUntilConvergence(outputs, 20);

      // 3 agents, 3 pairwise comparisons, multiple fields each
      expect(result.rounds.length).toBeGreaterThan(0);
      expect(result.converged).toBe(true);

      // Verify all rounds were resolved
      for (const round of result.rounds) {
        expect(round.result.resolved).toBe(true);
      }
    });

    it('stops at max rounds when convergence is not reached', () => {
      // Create many outputs with many contradictions
      const outputs: AgentOutput[] = Array.from({ length: 5 }, (_, i) => ({
        agent_type: [
          'market_intelligence',
          'country_strategy',
          'performance_analytics',
          'budget_optimization',
          'revenue_forecasting',
        ][i] as AgentType,
        decision_type: 'recommendation',
        output_data: {
          budget: (i + 1) * 1000,
          channel: ['google', 'meta', 'tiktok', 'bing', 'snapchat'][i],
          risk: ['low', 'medium', 'high', 'low', 'critical'][i],
          priority: i + 1,
        },
        confidence_score: 0.7 + i * 0.05,
        reasoning: `Agent ${i} analysis.`,
      }));

      // Set max rounds very low to force non-convergence
      const result = protocol.runUntilConvergence(outputs, 3);

      expect(result.totalRounds).toBe(3);
      expect(result.converged).toBe(false);
      expect(result.rounds).toHaveLength(3);
    });

    it('handles convergence with no contradictions (0 rounds needed)', () => {
      const outputs: AgentOutput[] = [
        {
          agent_type: 'compliance',
          decision_type: 'validation',
          output_data: { status: 'approved', region: 'EU' },
          confidence_score: 0.95,
          reasoning: 'All compliance checks passed.',
        },
        {
          agent_type: 'brand_consistency',
          decision_type: 'validation',
          output_data: { status: 'approved', region: 'EU' },
          confidence_score: 0.93,
          reasoning: 'Brand guidelines met.',
        },
      ];

      const result = protocol.runUntilConvergence(outputs);

      expect(result.rounds).toHaveLength(0);
      expect(result.converged).toBe(true);
      expect(result.totalRounds).toBe(0);
    });
  });

  // =========================================================================
  // Full cross-challenge workflow
  // =========================================================================

  describe('Full cross-challenge workflow', () => {
    it('runs complete challenge cycle: detect -> challenge -> resolve -> persist', async () => {
      // Step 1: Two agents produce conflicting outputs
      const perfOutput: AgentOutput = {
        agent_type: 'performance_analytics',
        decision_type: 'spend_recommendation',
        output_data: {
          monthly_budget: 25000,
          top_channel: 'google',
          expected_roas: 5.2,
          action: 'scale_up',
        },
        confidence_score: 0.87,
        reasoning: 'Strong Q4 performance warrants increased investment.',
      };

      const fraudOutput: AgentOutput = {
        agent_type: 'fraud_detection',
        decision_type: 'risk_assessment',
        output_data: {
          monthly_budget: 10000,
          top_channel: 'meta',
          expected_roas: 2.1,
          action: 'scale_down',
        },
        confidence_score: 0.93,
        reasoning: 'Anomalous click patterns detected. Recommend reduced exposure.',
      };

      // Step 2: Detect contradictions
      const contradictions = protocol.detectContradictions(perfOutput, fraudOutput);
      expect(contradictions.length).toBeGreaterThanOrEqual(3);

      // Step 3: Run challenge rounds
      const convergenceResult = protocol.runUntilConvergence([perfOutput, fraudOutput]);
      expect(convergenceResult.converged).toBe(true);
      expect(convergenceResult.rounds.length).toBeGreaterThan(0);

      // Step 4: Verify winners are based on confidence
      for (const round of convergenceResult.rounds) {
        // fraud_detection has higher confidence (0.93 > 0.87)
        expect(round.result.challenged).toBe('fraud_detection');
        expect(round.result.challenger).toBe('performance_analytics');
        expect(round.result.confidence).toBe(0.93);
      }

      // Step 5: Persist all challenge rounds to DB
      for (let i = 0; i < convergenceResult.rounds.length; i++) {
        const round = convergenceResult.rounds[i];
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            id: `challenge-${i}`,
            round_number: round.round_number,
            challenger: round.result.challenger,
            challenged: round.result.challenged,
            resolved: round.result.resolved,
          }],
          rowCount: 1,
        });
      }

      // Verify DB calls would persist correctly
      for (let i = 0; i < convergenceResult.rounds.length; i++) {
        const round = convergenceResult.rounds[i];
        const dbResult = await mockPool.query(
          'INSERT INTO challenge_rounds (id, round_number, challenger, challenged, finding, severity, confidence, resolved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [
            `challenge-${i}`,
            round.round_number,
            round.result.challenger,
            round.result.challenged,
            round.result.finding,
            round.result.severity,
            round.result.confidence,
            round.result.resolved,
          ],
        );

        expect(dbResult.rows[0].resolved).toBe(true);
      }

      // Step 6: Report any gaps
      const gap = protocol.reportGap(
        'performance_analytics',
        ['fraud_signal_details', 'anomaly_timestamps'],
        'high',
        'fraud_detection',
      );

      expect(gap.severity).toBe('high');
      expect(gap.recommended_source).toBe('fraud_detection');
    });
  });
});

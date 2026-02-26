/**
 * Unit tests for ConfidenceScoreOutputService.
 *
 * Database pool, Redis cache utilities, and logger are fully mocked so
 * tests exercise only the service logic (aggregation, weighting, grading,
 * alerting, and caching).
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
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
  ConfidenceScoreOutputService,
  scoreToGrade,
} from '../../../../src/services/final-outputs/ConfidenceScoreOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecisionRow(
  agentType: string,
  confidenceScore: number,
  createdAt: string = '2026-02-25T12:00:00Z',
  decisionCount: number = 5,
) {
  return {
    agent_type: agentType,
    confidence_score: String(confidenceScore),
    last_updated: createdAt,
    decision_count: String(decisionCount),
  };
}

function makeStateRow(
  agentType: string,
  dataQualityScore: number = 75,
  updatedAt: string = '2026-02-25T12:00:00Z',
) {
  return {
    agent_type: agentType,
    metrics: { data_quality_score: dataQualityScore },
    updated_at: updatedAt,
  };
}

function makeUncertaintyRow(
  agentType: string,
  uncertainties: string[] = [],
  warnings: string[] = [],
) {
  return {
    agent_type: agentType,
    output_data: { uncertainties, warnings },
  };
}

function makeTrendRow(date: string, avgScore: number) {
  return {
    date,
    avg_score: String(avgScore),
  };
}

/**
 * Sets up mock query responses for the standard generateSystemConfidenceScore flow.
 */
function setupStandardMocks(overrides?: {
  decisionRows?: ReturnType<typeof makeDecisionRow>[];
  stateRows?: ReturnType<typeof makeStateRow>[];
  uncertaintyRows?: ReturnType<typeof makeUncertaintyRow>[];
  trendRows?: ReturnType<typeof makeTrendRow>[];
}) {
  const decisionRows = overrides?.decisionRows ?? [
    makeDecisionRow('master_orchestrator', 85),
    makeDecisionRow('market_intelligence', 78),
    makeDecisionRow('paid_ads', 72),
    makeDecisionRow('compliance', 90),
    makeDecisionRow('fraud_detection', 45),
  ];

  const stateRows = overrides?.stateRows ?? [
    makeStateRow('master_orchestrator', 90),
    makeStateRow('market_intelligence', 80),
    makeStateRow('paid_ads', 70),
    makeStateRow('compliance', 95),
    makeStateRow('fraud_detection', 40),
  ];

  const uncertaintyRows = overrides?.uncertaintyRows ?? [
    makeUncertaintyRow('fraud_detection', ['Limited data for region X'], ['High false positive rate']),
  ];

  const trendRows = overrides?.trendRows ?? [
    makeTrendRow('2026-02-23', 70),
    makeTrendRow('2026-02-24', 72),
    makeTrendRow('2026-02-25', 75),
  ];

  // The service makes 4 queries in generateSystemConfidenceScore:
  // 1. Latest decisions per agent (joined with count)
  // 2. Agent states
  // 3. Uncertainty data from latest decisions
  // 4. Trend data (via fetchTrendFromDb)
  mockQuery
    .mockResolvedValueOnce({ rows: decisionRows })    // query 1: latest decisions
    .mockResolvedValueOnce({ rows: stateRows })         // query 2: agent states
    .mockResolvedValueOnce({ rows: uncertaintyRows })   // query 3: uncertainties
    .mockResolvedValueOnce({ rows: trendRows });        // query 4: trend
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfidenceScoreOutputService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null); // no cache by default
    mockCacheSet.mockResolvedValue(undefined);
  });

  // ---- scoreToGrade helper ----

  describe('scoreToGrade', () => {
    it('should return A for scores >= 90', () => {
      expect(scoreToGrade(90)).toBe('A');
      expect(scoreToGrade(100)).toBe('A');
      expect(scoreToGrade(95.5)).toBe('A');
    });

    it('should return B for scores >= 80 and < 90', () => {
      expect(scoreToGrade(80)).toBe('B');
      expect(scoreToGrade(89.99)).toBe('B');
    });

    it('should return C for scores >= 70 and < 80', () => {
      expect(scoreToGrade(70)).toBe('C');
      expect(scoreToGrade(79)).toBe('C');
    });

    it('should return D for scores >= 60 and < 70', () => {
      expect(scoreToGrade(60)).toBe('D');
      expect(scoreToGrade(69)).toBe('D');
    });

    it('should return F for scores < 60', () => {
      expect(scoreToGrade(59)).toBe('F');
      expect(scoreToGrade(0)).toBe('F');
      expect(scoreToGrade(30)).toBe('F');
    });
  });

  // ---- generateSystemConfidenceScore ----

  describe('generateSystemConfidenceScore', () => {
    it('should return cached result when available', async () => {
      const cachedResult = {
        system_score: 75,
        system_grade: 'C' as const,
        agent_scores: [],
        category_scores: {
          market_intelligence: 0,
          advertising: 0,
          content_creative: 0,
          analytics_budget: 0,
          testing_conversion: 0,
          integrations: 0,
          compliance_security: 0,
          infrastructure: 0,
          orchestration: 0,
        },
        score_trend: [],
        low_confidence_alerts: [],
        methodology: 'test',
        generated_at: '2026-02-25T12:00:00Z',
      };

      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should compute weighted system score from agent decisions', async () => {
      setupStandardMocks();

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(result.system_score).toBeGreaterThanOrEqual(0);
      expect(result.system_score).toBeLessThanOrEqual(100);
      expect(typeof result.system_score).toBe('number');
    });

    it('should assign correct grade based on system score', async () => {
      setupStandardMocks();

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.system_grade);
      expect(result.system_grade).toBe(scoreToGrade(result.system_score));
    });

    it('should include agent scores for all 20 agent types', async () => {
      setupStandardMocks();

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(result.agent_scores).toHaveLength(20);

      // Check structure of each entry
      for (const entry of result.agent_scores) {
        expect(entry).toHaveProperty('agent_id');
        expect(entry).toHaveProperty('agent_name');
        expect(entry).toHaveProperty('confidence_score');
        expect(entry).toHaveProperty('last_updated');
        expect(entry).toHaveProperty('data_quality_score');
        expect(entry).toHaveProperty('decision_count');
        expect(entry).toHaveProperty('uncertainty_flags');
        expect(typeof entry.confidence_score).toBe('number');
      }
    });

    it('should compute category scores', async () => {
      setupStandardMocks();

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      const categories = result.category_scores;
      expect(categories).toHaveProperty('market_intelligence');
      expect(categories).toHaveProperty('advertising');
      expect(categories).toHaveProperty('content_creative');
      expect(categories).toHaveProperty('analytics_budget');
      expect(categories).toHaveProperty('testing_conversion');
      expect(categories).toHaveProperty('integrations');
      expect(categories).toHaveProperty('compliance_security');
      expect(categories).toHaveProperty('infrastructure');
      expect(categories).toHaveProperty('orchestration');

      for (const val of Object.values(categories)) {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    });

    it('should generate low-confidence alerts for agents below threshold', async () => {
      setupStandardMocks({
        decisionRows: [
          makeDecisionRow('fraud_detection', 35, '2026-02-25T12:00:00Z', 3),
          makeDecisionRow('master_orchestrator', 85),
        ],
        stateRows: [
          makeStateRow('fraud_detection', 40),
          makeStateRow('master_orchestrator', 90),
        ],
        uncertaintyRows: [
          makeUncertaintyRow('fraud_detection', ['Insufficient data']),
        ],
        trendRows: [],
      });

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      const fraudAlert = result.low_confidence_alerts.find(
        (a) => a.agent_id === 'fraud_detection',
      );
      expect(fraudAlert).toBeDefined();
      expect(fraudAlert!.score).toBe(35);
      expect(fraudAlert!.reason).toContain('below threshold');
      expect(fraudAlert!.recommended_action).toBeTruthy();
    });

    it('should include score_trend from database', async () => {
      const trendRows = [
        makeTrendRow('2026-02-23', 70),
        makeTrendRow('2026-02-24', 72),
        makeTrendRow('2026-02-25', 75),
      ];

      setupStandardMocks({ trendRows });

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(result.score_trend).toHaveLength(3);
      expect(result.score_trend[0].date).toBe('2026-02-23');
      expect(result.score_trend[0].score).toBe(70);
    });

    it('should include methodology description and generated_at timestamp', async () => {
      setupStandardMocks();

      const result = await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(result.methodology).toBeTruthy();
      expect(result.methodology).toContain('Weighted average');
      expect(result.generated_at).toBeTruthy();
    });

    it('should cache the result after computation', async () => {
      setupStandardMocks();

      await ConfidenceScoreOutputService.generateSystemConfidenceScore();

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('confidence'),
        expect.objectContaining({ system_score: expect.any(Number) }),
        expect.any(Number),
      );
    });
  });

  // ---- getAgentConfidence ----

  describe('getAgentConfidence', () => {
    it('should return cached result when available', async () => {
      const cachedAgent = {
        agent_id: 'paid_ads',
        agent_name: 'Paid Ads',
        agent_type: 'paid_ads',
        confidence_score: 78,
        data_quality_score: 80,
        decision_count: 10,
        recent_decisions: [],
        uncertainty_flags: [],
        last_updated: '2026-02-25T12:00:00Z',
      };

      mockCacheGet.mockResolvedValueOnce(cachedAgent);

      const result = await ConfidenceScoreOutputService.getAgentConfidence('paid_ads');

      expect(result).toEqual(cachedAgent);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return detailed breakdown for a specific agent', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'dec-1',
              decision_type: 'bid_adjustment',
              confidence_score: '78',
              created_at: '2026-02-25T12:00:00Z',
              output_data: { uncertainties: ['Market volatility'], warnings: [] },
            },
            {
              id: 'dec-2',
              decision_type: 'targeting_update',
              confidence_score: '82',
              created_at: '2026-02-24T12:00:00Z',
              output_data: { uncertainties: [], warnings: [] },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              metrics: { data_quality_score: 80 },
              updated_at: '2026-02-25T11:00:00Z',
            },
          ],
        });

      const result = await ConfidenceScoreOutputService.getAgentConfidence('paid_ads');

      expect(result.agent_id).toBe('paid_ads');
      expect(result.agent_name).toBe('Paid Ads');
      expect(result.confidence_score).toBe(78);
      expect(result.data_quality_score).toBe(80);
      expect(result.decision_count).toBe(2);
      expect(result.recent_decisions).toHaveLength(2);
      expect(result.uncertainty_flags).toContain('Market volatility');
    });

    it('should handle agent with no decisions gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no decisions
        .mockResolvedValueOnce({
          rows: [{ metrics: {}, updated_at: '2026-02-25T10:00:00Z' }],
        });

      const result = await ConfidenceScoreOutputService.getAgentConfidence('localization');

      expect(result.confidence_score).toBe(0);
      expect(result.decision_count).toBe(0);
      expect(result.recent_decisions).toHaveLength(0);
    });
  });

  // ---- getConfidenceTrend ----

  describe('getConfidenceTrend', () => {
    it('should return trend data for the specified number of days', async () => {
      const trendRows = [
        makeTrendRow('2026-02-20', 65),
        makeTrendRow('2026-02-21', 68),
        makeTrendRow('2026-02-22', 70),
        makeTrendRow('2026-02-23', 72),
        makeTrendRow('2026-02-24', 74),
      ];

      mockQuery.mockResolvedValueOnce({ rows: trendRows });

      const result = await ConfidenceScoreOutputService.getConfidenceTrend(7);

      expect(result.days).toBe(7);
      expect(result.trend).toHaveLength(5);
      expect(result.average_score).toBeGreaterThan(0);
      expect(result.min_score).toBe(65);
      expect(result.max_score).toBe(74);
    });

    it('should return empty trend when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ConfidenceScoreOutputService.getConfidenceTrend(30);

      expect(result.trend).toHaveLength(0);
      expect(result.average_score).toBe(0);
      expect(result.min_score).toBe(0);
      expect(result.max_score).toBe(0);
    });

    it('should clamp days to valid range (1-365)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ConfidenceScoreOutputService.getConfidenceTrend(999);

      expect(result.days).toBe(365);
    });

    it('should cache the trend result', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeTrendRow('2026-02-25', 75)],
      });

      await ConfidenceScoreOutputService.getConfidenceTrend(14);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('trend:14'),
        expect.objectContaining({ days: 14 }),
        expect.any(Number),
      );
    });
  });
});

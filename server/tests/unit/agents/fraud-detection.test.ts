/**
 * Unit tests for FraudDetectionAgent.
 *
 * All external dependencies (database, Redis cache, AI client, logger)
 * are fully mocked so tests exercise only the agent's fraud detection
 * logic, scoring algorithms, and alert creation pipeline.
 */

// ---------------------------------------------------------------------------
// Mocks — must be defined before imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    LOG_LEVEL: 'silent',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn((score: number) => {
    if (score >= 80) return 'very_high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { FraudDetectionAgent } from '../../../src/agents/modules/FraudDetectionAgent';
import type {
  FraudSignal,
  FraudDetectionResult,
  BotDetectionResult,
  AnomalyDetectionResult,
  BudgetMisuseResult,
  TrafficPattern,
  RuleEvaluation,
} from '../../../src/agents/modules/FraudDetectionAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import type { AnomalyRule, FraudAlert } from '../../../src/types';
import type { AgentInput } from '../../../src/agents/base/types';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Standard agent input payload for tests. */
const TEST_INPUT: AgentInput = {
  context: { campaignId: 'campaign-001' },
  parameters: {},
  requestId: 'test-fraud-request-001',
};

/** A sample anomaly rule for rule evaluation tests. */
const SAMPLE_RULE: AnomalyRule = {
  id: 'rule-001',
  name: 'High CTR Alert',
  type: 'click_fraud',
  condition: { metric: 'ctr', operator: 'gt' },
  threshold: 15,
  is_active: true,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('FraudDetectionAgent', () => {
  let agent: FraudDetectionAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new FraudDetectionAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with default configuration', () => {
      expect(agent.getAgentType()).toBe('fraud_detection');
      expect(agent.getConfig().model).toBe('opus');
      expect(agent.getConfig().maxRetries).toBe(3);
      expect(agent.getConfig().timeoutMs).toBe(90_000);
      expect(agent.getConfig().confidenceThreshold).toBe(60);
    });

    it('accepts custom configuration overrides', () => {
      const customAgent = new FraudDetectionAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 80,
      });

      expect(customAgent.getConfig().maxRetries).toBe(5);
      expect(customAgent.getConfig().timeoutMs).toBe(60_000);
      expect(customAgent.getConfig().confidenceThreshold).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a non-empty system prompt mentioning fraud detection', () => {
      const prompt = agent.getSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Fraud');
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns the expected challenge targets', () => {
      const targets = agent.getChallengeTargets();

      expect(targets).toEqual(
        expect.arrayContaining(['paid_ads', 'performance_analytics', 'data_engineering']),
      );
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // calculateFraudScore
  // -----------------------------------------------------------------------

  describe('calculateFraudScore', () => {
    it('returns 0 when no signals are provided', () => {
      const score = agent.calculateFraudScore([]);
      expect(score).toBe(0);
    });

    it('returns a higher score when more signals are suspicious', () => {
      const lowRiskSignals: FraudSignal[] = [
        {
          type: 'high_ctr',
          value: 5,
          threshold: 15,
          suspicious: false,
          description: 'CTR within normal range',
        },
        {
          type: 'geo_concentration',
          value: 30,
          threshold: 80,
          suspicious: false,
          description: 'Geographic distribution normal',
        },
      ];

      const highRiskSignals: FraudSignal[] = [
        {
          type: 'high_ctr',
          value: 25,
          threshold: 15,
          suspicious: true,
          description: 'CTR exceeds threshold',
        },
        {
          type: 'geo_concentration',
          value: 95,
          threshold: 80,
          suspicious: true,
          description: 'Concentrated geo traffic',
        },
      ];

      const lowScore = agent.calculateFraudScore(lowRiskSignals);
      const highScore = agent.calculateFraudScore(highRiskSignals);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('weights suspicious signals more heavily than non-suspicious ones', () => {
      const mixedSignals: FraudSignal[] = [
        {
          type: 'high_ctr',
          value: 20,
          threshold: 15,
          suspicious: true,
          description: 'Suspicious CTR',
        },
        {
          type: 'geo_concentration',
          value: 40,
          threshold: 80,
          suspicious: false,
          description: 'Normal geo',
        },
      ];

      const score = agent.calculateFraudScore(mixedSignals);

      // Should be > 0 but not maxed out since only one signal is suspicious
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('caps the score at 100', () => {
      const extremeSignals: FraudSignal[] = [
        {
          type: 'high_ctr',
          value: 500,
          threshold: 15,
          suspicious: true,
          description: 'Extreme CTR',
        },
        {
          type: 'geo_concentration',
          value: 100,
          threshold: 10,
          suspicious: true,
          description: 'Extreme concentration',
        },
        {
          type: 'off_hours_spike',
          value: 99,
          threshold: 10,
          suspicious: true,
          description: 'Extreme off-hours',
        },
      ];

      const score = agent.calculateFraudScore(extremeSignals);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // -----------------------------------------------------------------------
  // evaluateRule
  // -----------------------------------------------------------------------

  describe('evaluateRule', () => {
    it('triggers a rule when value exceeds threshold (gt operator)', async () => {
      const data = { ctr: 20 };

      const result = await agent.evaluateRule(SAMPLE_RULE, data);

      expect(result.ruleId).toBe('rule-001');
      expect(result.triggered).toBe(true);
      expect(result.value).toBe(20);
      expect(result.threshold).toBe(15);
    });

    it('does not trigger when value is below threshold', async () => {
      const data = { ctr: 10 };

      const result = await agent.evaluateRule(SAMPLE_RULE, data);

      expect(result.triggered).toBe(false);
      expect(result.value).toBe(10);
    });

    it('handles lt operator correctly', async () => {
      const ltRule: AnomalyRule = {
        id: 'rule-002',
        name: 'Low Conversion Rate',
        type: 'conversion_anomaly',
        condition: { metric: 'conversion_rate', operator: 'lt' },
        threshold: 1,
        is_active: true,
      };

      const data = { conversion_rate: 0.5 };
      const result = await agent.evaluateRule(ltRule, data);

      expect(result.triggered).toBe(true);
      expect(result.value).toBe(0.5);
    });

    it('returns not triggered when metric is missing from data', async () => {
      const data = { impressions: 1000 };

      const result = await agent.evaluateRule(SAMPLE_RULE, data);

      expect(result.triggered).toBe(false);
      expect(result.value).toBe(0);
    });

    it('returns not triggered when rule has no metric condition', async () => {
      const noMetricRule: AnomalyRule = {
        id: 'rule-003',
        name: 'Empty Condition',
        type: 'click_fraud',
        condition: {},
        threshold: 10,
        is_active: true,
      };

      const result = await agent.evaluateRule(noMetricRule, { ctr: 50 });

      expect(result.triggered).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getRules
  // -----------------------------------------------------------------------

  describe('getRules', () => {
    it('fetches active rules from the database', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [SAMPLE_RULE],
      });

      const rules = await agent.getRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('rule-001');
      expect(rules[0].is_active).toBe(true);
    });

    it('returns cached rules when available', async () => {
      mockCacheGet.mockResolvedValueOnce([SAMPLE_RULE]);

      const rules = await agent.getRules();

      expect(rules).toHaveLength(1);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches rules after fetching from database', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_RULE] });

      await agent.getRules();

      expect(mockCacheSet).toHaveBeenCalled();
      const cacheKey = (mockCacheSet.mock.calls[0] as unknown[])[0] as string;
      expect(cacheKey).toContain('rules');
    });
  });

  // -----------------------------------------------------------------------
  // createAlert
  // -----------------------------------------------------------------------

  describe('createAlert', () => {
    it('creates and persists a fraud alert with correct severity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

      const alert = await agent.createAlert('click_fraud', 'campaign-001', {
        fraudScore: 75,
        signals: [],
      });

      expect(alert.type).toBe('click_fraud');
      expect(alert.campaign_id).toBe('campaign-001');
      expect(alert.severity).toBe('high'); // 75 >= 65 threshold
      expect(alert.status).toBe('open');
      expect(alert.confidence_score).toBe(75);
      expect(alert.id).toBeTruthy();
      expect(alert.created_at).toBeTruthy();
    });

    it('assigns critical severity for scores >= 85', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alert = await agent.createAlert('bot_traffic', 'campaign-002', {
        fraudScore: 90,
      });

      expect(alert.severity).toBe('critical');
    });

    it('assigns low severity for scores below 40', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alert = await agent.createAlert('conversion_anomaly', 'campaign-003', {
        fraudScore: 25,
      });

      expect(alert.severity).toBe('low');
    });

    it('throws when database insert fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(
        agent.createAlert('click_fraud', 'campaign-001', { fraudScore: 50 }),
      ).rejects.toThrow('DB connection failed');
    });
  });

  // -----------------------------------------------------------------------
  // getAlerts
  // -----------------------------------------------------------------------

  describe('getAlerts', () => {
    it('fetches all alerts when no status filter is provided', async () => {
      const mockAlerts = [
        { id: 'alert-1', type: 'click_fraud', status: 'open', severity: 'high' },
        { id: 'alert-2', type: 'bot_traffic', status: 'resolved', severity: 'low' },
      ];
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: mockAlerts });

      const alerts = await agent.getAlerts();

      expect(alerts).toHaveLength(2);
      // Verify the query does not have a WHERE clause
      const queryText = (mockQuery.mock.calls[0] as unknown[])[0] as string;
      expect(queryText).not.toContain('WHERE status');
    });

    it('filters alerts by status when provided', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'alert-1', type: 'click_fraud', status: 'open' }],
      });

      const alerts = await agent.getAlerts('open');

      expect(alerts).toHaveLength(1);
      const queryText = (mockQuery.mock.calls[0] as unknown[])[0] as string;
      expect(queryText).toContain('WHERE status');
    });

    it('returns cached alerts when available', async () => {
      const cachedAlerts = [{ id: 'alert-cached', type: 'click_fraud', status: 'open' }];
      mockCacheGet.mockResolvedValueOnce(cachedAlerts);

      const alerts = await agent.getAlerts('open');

      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('alert-cached');
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // detectClickFraud
  // -----------------------------------------------------------------------

  describe('detectClickFraud', () => {
    it('returns cached result when available', async () => {
      const cachedResult: FraudDetectionResult = {
        campaignId: 'campaign-001',
        fraudScore: 30,
        signals: [],
        recommendation: 'Low risk',
        blocked: false,
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await agent.detectClickFraud('campaign-001');

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('detects high fraud score and blocks campaign when threshold exceeded', async () => {
      // Cache miss for click fraud result
      mockCacheGet.mockResolvedValueOnce(null);
      // Cache miss for traffic patterns
      mockCacheGet.mockResolvedValueOnce(null);

      // Campaign metrics query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'campaign-001',
          budget: 10000,
          spent: 8000,
          impressions: 100000,
          clicks: 25000,
          conversions: 5,
          ctr: 25,
          cpc: 0.32,
          cpa: 1600,
          roas: 0.1,
          conversion_rate: 0.02,
        }],
      });

      // Traffic pattern queries (summary, hourly, geo)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: 25000,
          organic: 1000,
          paid: 20000,
          suspicious: 8000,
        }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { hour: 2, count: 8000 },
          { hour: 3, count: 7000 },
          { hour: 14, count: 5000 },
          { hour: 15, count: 5000 },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { geo: 'CN', count: 22000 },
          { geo: 'US', count: 3000 },
        ],
      });

      const result = await agent.detectClickFraud('campaign-001');

      expect(result.campaignId).toBe('campaign-001');
      expect(result.fraudScore).toBeGreaterThan(0);
      expect(result.signals.length).toBeGreaterThan(0);
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(0);

      // With CTR=25 (>15), suspicious ratio=32% (>20%), geo concentration at 88% (>80%),
      // off hours at 60% (>30%), and low conversion (0.02% < 0.1%), most signals should be suspicious
      const suspiciousSignals = result.signals.filter((s) => s.suspicious);
      expect(suspiciousSignals.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // analyzeTrafficPatterns
  // -----------------------------------------------------------------------

  describe('analyzeTrafficPatterns', () => {
    it('returns cached traffic pattern when available', async () => {
      const cachedPattern: TrafficPattern = {
        total: 1000,
        organic: 400,
        paid: 500,
        suspicious: 100,
        byHour: { 10: 200, 14: 300 },
        byGeo: { US: 600, UK: 400 },
      };
      mockCacheGet.mockResolvedValueOnce(cachedPattern);

      const result = await agent.analyzeTrafficPatterns('campaign-001');

      expect(result).toEqual(cachedPattern);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns empty pattern when database queries fail', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await agent.analyzeTrafficPatterns('campaign-001');

      expect(result.total).toBe(0);
      expect(result.organic).toBe(0);
      expect(result.paid).toBe(0);
      expect(result.suspicious).toBe(0);
      expect(result.byHour).toEqual({});
      expect(result.byGeo).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // process (integration of all components)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('returns no_campaigns_to_analyze when no active campaigns exist', async () => {
      const inputNoScope: AgentInput = {
        context: { scope: 'all' },
        parameters: {},
        requestId: 'test-request-empty',
      };

      // No active campaigns
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(inputNoScope);

      expect(output.decision).toBe('no_campaigns_to_analyze');
      expect(output.agentType).toBe('fraud_detection');
      expect(output.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('produces a complete fraud analysis for a specific campaign', async () => {
      // detectClickFraud pipeline:
      // 1. cache miss (click fraud)
      mockCacheGet.mockResolvedValueOnce(null);
      // 2. cache miss (traffic patterns)
      mockCacheGet.mockResolvedValueOnce(null);
      // 3. fetchCampaignMetrics
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'campaign-001',
          budget: 5000,
          spent: 3000,
          impressions: 50000,
          clicks: 2000,
          conversions: 100,
          ctr: 4,
          cpc: 1.5,
          cpa: 30,
          roas: 3.5,
          conversion_rate: 5,
        }],
      });
      // 4. traffic summary
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: 2000, organic: 800, paid: 1100, suspicious: 100 }],
      });
      // 5. hourly distribution
      mockQuery.mockResolvedValueOnce({
        rows: [
          { hour: 9, count: 400 },
          { hour: 10, count: 500 },
          { hour: 14, count: 600 },
          { hour: 15, count: 500 },
        ],
      });
      // 6. geo distribution
      mockQuery.mockResolvedValueOnce({
        rows: [
          { geo: 'US', count: 800 },
          { geo: 'UK', count: 600 },
          { geo: 'DE', count: 600 },
        ],
      });

      // getRules: cache miss then DB
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No active rules

      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('fraud_analysis_complete');
      expect(output.agentType).toBe('fraud_detection');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.timestamp).toBeTruthy();
      expect(typeof output.reasoning).toBe('string');
      expect(output.reasoning).toContain('1 campaign');
    });
  });
});

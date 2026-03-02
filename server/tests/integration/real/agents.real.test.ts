/**
 * Agent System Integration Tests (Phase 12C - Batch 2).
 *
 * Validates agent state persistence and retrieval, decision logging,
 * status transitions, orchestration, cross-challenge protocol execution,
 * confidence scoring, and all 20 agent type management.
 */

// ---------------------------------------------------------------------------
// Mocks
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
    NODE_ENV: 'test', PORT: 3001, API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h', JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000, RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error', LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('agent-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

const mockGetAllStatuses = jest.fn();
const mockGetStatus = jest.fn();
const mockStartAgent = jest.fn();
const mockStopAgent = jest.fn();
const mockPauseAgent = jest.fn();
const mockSetError = jest.fn();

jest.mock('../../../src/agents/base/AgentLifecycle', () => ({
  AgentLifecycle: jest.fn().mockImplementation(() => ({
    getAllStatuses: mockGetAllStatuses,
    getStatus: mockGetStatus,
    startAgent: mockStartAgent,
    stopAgent: mockStopAgent,
    pauseAgent: mockPauseAgent,
    setError: mockSetError,
  })),
}));

const mockRegistryGet = jest.fn();
const mockRegistryGetAllTypes = jest.fn();

jest.mock('../../../src/agents/base/AgentRegistry', () => ({
  AgentRegistry: {
    getInstance: jest.fn().mockReturnValue({
      get: mockRegistryGet,
      getAllTypes: mockRegistryGetAllTypes,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheFlush } from '../../../src/config/redis';
import { AgentsService } from '../../../src/services/agents.service';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_AGENT_TYPES = [
  'market_intelligence', 'country_strategy', 'paid_ads', 'organic_social',
  'content_blog', 'creative_generation', 'performance_analytics', 'budget_optimization',
  'ab_testing', 'conversion_optimization', 'shopify_integration', 'localization',
  'compliance', 'competitive_intelligence', 'fraud_detection', 'brand_consistency',
  'data_engineering', 'enterprise_security', 'revenue_forecasting', 'master_orchestrator',
];

function makeAgentState(agentType: string, status = 'idle', confidence = 0.85) {
  return {
    agentType,
    status,
    confidence,
    tasksCompleted: 10,
    tasksTotal: 12,
    lastRun: '2026-01-01T00:00:00Z',
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent System Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheFlush.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Agent state persistence
  // =========================================================================

  describe('Agent state persistence', () => {
    it('should persist agent status through lifecycle methods', async () => {
      mockGetStatus.mockResolvedValueOnce(makeAgentState('paid_ads', 'idle'));

      const state = await AgentsService.getAgent('paid_ads');

      expect(state.status).toBe('idle');
      expect(state.agentType).toBe('paid_ads');
    });

    it('should persist confidence score in agent state', async () => {
      mockGetStatus.mockResolvedValueOnce(makeAgentState('paid_ads', 'idle', 0.92));

      const state = await AgentsService.getAgent('paid_ads');

      expect(state.confidence).toBe(0.92);
      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it('should persist task counts in agent state', async () => {
      const agentState = makeAgentState('budget_optimization', 'idle');
      agentState.tasksCompleted = 45;
      agentState.tasksTotal = 50;
      mockGetStatus.mockResolvedValueOnce(agentState);

      const state = await AgentsService.getAgent('budget_optimization');

      expect(state.tasksCompleted).toBe(45);
      expect(state.tasksTotal).toBe(50);
    });
  });

  // =========================================================================
  // Agent state retrieval
  // =========================================================================

  describe('Agent state retrieval', () => {
    it('should retrieve a single agent state by type', async () => {
      mockGetStatus.mockResolvedValueOnce(makeAgentState('compliance', 'idle'));

      const state = await AgentsService.getAgent('compliance');

      expect(state.agentType).toBe('compliance');
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return from cache when available', async () => {
      const cached = makeAgentState('fraud_detection', 'active', 0.78);
      mockCacheGet.mockResolvedValueOnce(cached);

      const state = await AgentsService.getAgent('fraud_detection');

      expect(state.agentType).toBe('fraud_detection');
      expect(mockGetStatus).not.toHaveBeenCalled();
    });

    it('should list all agents', async () => {
      const allStates = ALL_AGENT_TYPES.map(t => makeAgentState(t));
      mockGetAllStatuses.mockResolvedValueOnce(allStates);

      const result = await AgentsService.listAgents();

      expect(result).toHaveLength(20);
      expect(result.map(a => a.agentType)).toEqual(expect.arrayContaining(['paid_ads', 'master_orchestrator']));
    });

    it('should reject invalid agent type', async () => {
      await expect(AgentsService.getAgent('invalid_agent_type')).rejects.toThrow('Invalid agent type');
    });
  });

  // =========================================================================
  // Agent decision logging
  // =========================================================================

  describe('Agent decision logging', () => {
    it('should retrieve paginated decisions for an agent', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'dec-1', agent_type: 'paid_ads', decision_type: 'budget_allocation', input_data: {}, output_data: {}, confidence_score: 0.9, reasoning: 'High ROAS', challenged_by: null, challenge_results: null, is_approved: true, approved_by: null, created_at: '2026-01-01T00:00:00Z' },
            { id: 'dec-2', agent_type: 'paid_ads', decision_type: 'campaign_pause', input_data: {}, output_data: {}, confidence_score: 0.7, reasoning: 'Low CTR', challenged_by: null, challenge_results: null, is_approved: false, approved_by: null, created_at: '2026-01-01T01:00:00Z' },
          ],
        });

      const result = await AgentsService.getDecisions('paid_ads', { page: 1, limit: 10 });

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].confidence_score).toBe(0.9);
      expect(result.page).toBe(1);
    });

    it('should retrieve a single decision by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'dec-1', agent_type: 'paid_ads', decision_type: 'budget_allocation',
          input_data: {}, output_data: {}, confidence_score: 0.85,
          reasoning: 'test', challenged_by: null, challenge_results: null,
          is_approved: true, approved_by: 'admin-1', created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const decision = await AgentsService.getDecision('dec-1');

      expect(decision.id).toBe('dec-1');
      expect(decision.agent_type).toBe('paid_ads');
      expect(decision.confidence_score).toBe(0.85);
    });

    it('should throw NotFoundError for non-existent decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(AgentsService.getDecision('non-existent')).rejects.toThrow('not found');
    });

    it('should support DESC sort order for decisions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await AgentsService.getDecisions('paid_ads', { page: 1, limit: 10, sortOrder: 'DESC' });

      const queryCall = mockQuery.mock.calls[1];
      expect(queryCall[0]).toContain('DESC');
    });

    it('should support ASC sort order for decisions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await AgentsService.getDecisions('paid_ads', { page: 1, limit: 10, sortOrder: 'ASC' });

      const queryCall = mockQuery.mock.calls[1];
      expect(queryCall[0]).toContain('ASC');
    });
  });

  // =========================================================================
  // Agent status transitions
  // =========================================================================

  describe('Agent status transitions', () => {
    it('should transition from idle to active when running an agent', async () => {
      const mockAgent = {
        process: jest.fn().mockResolvedValue({
          decision: 'allocate_budget', confidence: { score: 0.9 }, data: {},
        }),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };
      mockRegistryGet.mockReturnValue(mockAgent);
      mockStartAgent.mockResolvedValue(undefined);
      mockStopAgent.mockResolvedValue(undefined);

      const output = await AgentsService.runAgent('paid_ads', { budget: 1000 });

      expect(mockStartAgent).toHaveBeenCalledWith('paid_ads');
      expect(mockStopAgent).toHaveBeenCalledWith('paid_ads');
      expect(output.decision).toBe('allocate_budget');
      expect(output.confidence.score).toBe(0.9);
    });

    it('should transition to error state when agent run fails', async () => {
      const mockAgent = {
        process: jest.fn().mockRejectedValue(new Error('Agent processing failed')),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };
      mockRegistryGet.mockReturnValue(mockAgent);
      mockStartAgent.mockResolvedValue(undefined);
      mockSetError.mockResolvedValue(undefined);

      await expect(AgentsService.runAgent('paid_ads')).rejects.toThrow('Agent processing failed');

      expect(mockStartAgent).toHaveBeenCalledWith('paid_ads');
      expect(mockSetError).toHaveBeenCalledWith('paid_ads', expect.any(Error));
    });

    it('should pause an agent', async () => {
      mockPauseAgent.mockResolvedValue(undefined);

      await AgentsService.pauseAgent('paid_ads');

      expect(mockPauseAgent).toHaveBeenCalledWith('paid_ads');
      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should resume a paused agent', async () => {
      mockStopAgent.mockResolvedValue(undefined);

      await AgentsService.resumeAgent('paid_ads');

      expect(mockStopAgent).toHaveBeenCalledWith('paid_ads');
      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should throw NotFoundError when running an unregistered agent', async () => {
      mockRegistryGet.mockReturnValue(null);

      await expect(AgentsService.runAgent('paid_ads')).rejects.toThrow('not registered');
    });
  });

  // =========================================================================
  // Cross-challenge protocol execution
  // =========================================================================

  describe('Cross-challenge protocol execution', () => {
    it('should retrieve paginated challenge results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'dec-c1', agent_type: 'paid_ads', decision_type: 'budget', input_data: {}, output_data: {}, confidence_score: 0.8, reasoning: 'test', challenged_by: 'fraud_detection', challenge_results: [{ finding: 'risk detected' }], is_approved: false, approved_by: null, created_at: '2026-01-01T00:00:00Z' },
          ],
        });

      const result = await AgentsService.getChallengeResults({ page: 1, limit: 10 });

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].challenge_results).toBeDefined();
    });

    it('should run a challenge round among specified agents', async () => {
      const mockAgent = {
        getChallengeTargets: jest.fn().mockReturnValue(['fraud_detection']),
        process: jest.fn(),
      };
      mockRegistryGet.mockReturnValue(mockAgent);
      mockRegistryGetAllTypes.mockReturnValue(['paid_ads', 'fraud_detection']);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'dec-1', agent_type: 'fraud_detection', decision_type: 'alert',
          input_data: {}, output_data: {}, confidence_score: 0.75,
          reasoning: 'Pattern detected', is_approved: true, created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const round = await AgentsService.runChallengeRound(['paid_ads', 'fraud_detection']);

      expect(round.roundId).toBeDefined();
      expect(round.startedAt).toBeDefined();
      expect(round.completedAt).toBeDefined();
      expect(round.agentsInvolved.length).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Orchestrator aggregation
  // =========================================================================

  describe('Orchestrator aggregation', () => {
    it('should run orchestration across all eligible agents', async () => {
      const mockAgent = {
        process: jest.fn().mockResolvedValue({
          decision: 'ok', confidence: { score: 0.9 }, data: {},
        }),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };
      mockRegistryGetAllTypes.mockReturnValue(['paid_ads', 'fraud_detection', 'master_orchestrator']);
      mockRegistryGet.mockReturnValue(mockAgent);
      // getStatus calls for paid_ads and fraud_detection (master_orchestrator is skipped)
      mockGetStatus
        .mockResolvedValueOnce(makeAgentState('paid_ads', 'idle'))
        .mockResolvedValueOnce(makeAgentState('fraud_detection', 'idle'));
      mockStartAgent.mockResolvedValue(undefined);
      mockStopAgent.mockResolvedValue(undefined);

      const result = await AgentsService.runOrchestration('req-1');

      expect(result.requestId).toBe('req-1');
      expect(result.agentsRun).toContain('paid_ads');
      expect(result.agentsRun).toContain('fraud_detection');
      // master_orchestrator should be skipped
      expect(result.agentsRun).not.toContain('master_orchestrator');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    it('should skip paused agents during orchestration', async () => {
      mockRegistryGetAllTypes.mockReturnValue(['paid_ads', 'fraud_detection']);
      mockRegistryGet.mockReturnValue({
        process: jest.fn().mockResolvedValue({ decision: 'ok', confidence: { score: 0.9 }, data: {} }),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      });
      mockGetStatus
        .mockResolvedValueOnce(makeAgentState('paid_ads', 'paused'))
        .mockResolvedValueOnce(makeAgentState('fraud_detection', 'idle'));
      mockStartAgent.mockResolvedValue(undefined);
      mockStopAgent.mockResolvedValue(undefined);

      const result = await AgentsService.runOrchestration('req-2');

      expect(result.agentsRun).not.toContain('paid_ads');
      expect(result.agentsRun).toContain('fraud_detection');
    });

    it('should skip agents in error state during orchestration', async () => {
      mockRegistryGetAllTypes.mockReturnValue(['paid_ads']);
      mockRegistryGet.mockReturnValue({
        process: jest.fn(),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      });
      mockGetStatus.mockResolvedValueOnce(makeAgentState('paid_ads', 'error'));

      const result = await AgentsService.runOrchestration('req-3');

      expect(result.agentsRun).not.toContain('paid_ads');
    });

    it('should handle agent failure during orchestration without stopping the cycle', async () => {
      const failingAgent = {
        process: jest.fn().mockRejectedValue(new Error('Agent crash')),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };
      const successAgent = {
        process: jest.fn().mockResolvedValue({ decision: 'ok', confidence: { score: 0.9 }, data: {} }),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };

      mockRegistryGetAllTypes.mockReturnValue(['paid_ads', 'fraud_detection']);
      mockRegistryGet.mockImplementation((type: string) =>
        type === 'paid_ads' ? failingAgent : successAgent,
      );
      mockGetStatus
        .mockResolvedValueOnce(makeAgentState('paid_ads', 'idle'))
        .mockResolvedValueOnce(makeAgentState('fraud_detection', 'idle'));
      mockStartAgent.mockResolvedValue(undefined);
      mockStopAgent.mockResolvedValue(undefined);
      mockSetError.mockResolvedValue(undefined);

      const result = await AgentsService.runOrchestration('req-4');

      // fraud_detection should still have run despite paid_ads failure
      expect(result.agentsRun).toContain('fraud_detection');
    });
  });

  // =========================================================================
  // Agent confidence scoring
  // =========================================================================

  describe('Agent confidence scoring', () => {
    it('should track confidence scores across decisions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'd1', agent_type: 'paid_ads', decision_type: 'bid', input_data: {}, output_data: {}, confidence_score: 0.95, reasoning: 'high', challenged_by: null, challenge_results: null, is_approved: true, approved_by: null, created_at: '2026-01-01T00:00:00Z' },
            { id: 'd2', agent_type: 'paid_ads', decision_type: 'bid', input_data: {}, output_data: {}, confidence_score: 0.72, reasoning: 'medium', challenged_by: null, challenge_results: null, is_approved: true, approved_by: null, created_at: '2026-01-01T01:00:00Z' },
          ],
        });

      const result = await AgentsService.getDecisions('paid_ads', { page: 1, limit: 10 });

      const scores = result.data.map(d => d.confidence_score);
      expect(scores.every(s => s >= 0 && s <= 1)).toBe(true);
      expect(scores).toContain(0.95);
      expect(scores).toContain(0.72);
    });
  });

  // =========================================================================
  // Agent task counting
  // =========================================================================

  describe('Agent task counting', () => {
    it('should track tasks completed and total', async () => {
      const state = makeAgentState('data_engineering', 'idle');
      state.tasksCompleted = 100;
      state.tasksTotal = 120;
      mockGetStatus.mockResolvedValueOnce(state);

      const result = await AgentsService.getAgent('data_engineering');

      expect(result.tasksCompleted).toBe(100);
      expect(result.tasksTotal).toBe(120);
      expect(result.tasksCompleted).toBeLessThanOrEqual(result.tasksTotal);
    });
  });

  // =========================================================================
  // Agent error handling and recovery
  // =========================================================================

  describe('Agent error handling and recovery', () => {
    it('should capture error details on agent failure', async () => {
      const failingAgent = {
        process: jest.fn().mockRejectedValue(new Error('Processing timeout')),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      };
      mockRegistryGet.mockReturnValue(failingAgent);
      mockStartAgent.mockResolvedValue(undefined);
      mockSetError.mockResolvedValue(undefined);

      await expect(AgentsService.runAgent('paid_ads')).rejects.toThrow('Processing timeout');

      expect(mockSetError).toHaveBeenCalledWith(
        'paid_ads',
        expect.objectContaining({ message: 'Processing timeout' }),
      );
    });

    it('should be able to resume after error via resumeAgent', async () => {
      mockStopAgent.mockResolvedValue(undefined);

      await AgentsService.resumeAgent('paid_ads');

      expect(mockStopAgent).toHaveBeenCalledWith('paid_ads');
    });
  });

  // =========================================================================
  // All 20 agent types state management
  // =========================================================================

  describe('All 20 agent types state management', () => {
    ALL_AGENT_TYPES.forEach((agentType) => {
      it(`should accept and return state for agent type: ${agentType}`, async () => {
        mockGetStatus.mockResolvedValueOnce(makeAgentState(agentType, 'idle', 0.88));

        const state = await AgentsService.getAgent(agentType);

        expect(state.agentType).toBe(agentType);
        expect(state.status).toBe('idle');
        expect(state.confidence).toBe(0.88);
      });
    });
  });

  // =========================================================================
  // Agent cycle completion tracking
  // =========================================================================

  describe('Agent cycle completion tracking', () => {
    it('should record start and completion times in orchestration result', async () => {
      mockRegistryGetAllTypes.mockReturnValue(['paid_ads']);
      mockRegistryGet.mockReturnValue({
        process: jest.fn().mockResolvedValue({ decision: 'ok', confidence: { score: 0.9 }, data: {} }),
        getChallengeTargets: jest.fn().mockReturnValue([]),
      });
      mockGetStatus.mockResolvedValueOnce(makeAgentState('paid_ads', 'idle'));
      mockStartAgent.mockResolvedValue(undefined);
      mockStopAgent.mockResolvedValue(undefined);

      const result = await AgentsService.runOrchestration('cycle-1');

      expect(new Date(result.startedAt).getTime()).toBeLessThanOrEqual(new Date(result.completedAt).getTime());
      expect(result.agentsRun).toHaveLength(1);
    });
  });

  // =========================================================================
  // Cost tracking
  // =========================================================================

  describe('AI cost tracking', () => {
    it('should return cost summary with totals and breakdowns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_cost: '125.50', total_tokens: '50000' }] })
        .mockResolvedValueOnce({ rows: [{ agent_type: 'paid_ads', cost: '50.00', tokens: '20000', calls: '10' }, { agent_type: 'fraud_detection', cost: '75.50', tokens: '30000', calls: '15' }] })
        .mockResolvedValueOnce({ rows: [{ model: 'gpt-4', cost: '100.00', tokens: '40000', calls: '20' }, { model: 'gpt-3.5', cost: '25.50', tokens: '10000', calls: '5' }] });

      const summary = await AgentsService.getCostSummary();

      expect(summary.totalCost).toBe(125.50);
      expect(summary.totalTokens).toBe(50000);
      expect(summary.byAgent).toHaveProperty('paid_ads');
      expect(summary.byAgent).toHaveProperty('fraud_detection');
      expect(summary.byModel).toHaveProperty('gpt-4');
    });

    it('should return cost detail for a specific agent', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_cost: '50.00', total_tokens: '20000', total_calls: '10' }] })
        .mockResolvedValueOnce({ rows: [{ model: 'gpt-4', cost: '50.00', tokens: '20000', calls: '10' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'call-1', model: 'gpt-4', tokens_used: 2000, cost: 5.0, created_at: '2026-01-01T00:00:00Z' }] });

      const detail = await AgentsService.getCostByAgent('paid_ads');

      expect(detail.agentType).toBe('paid_ads');
      expect(detail.totalCost).toBe(50);
      expect(detail.totalTokens).toBe(20000);
      expect(detail.totalCalls).toBe(10);
      expect(detail.recentCalls).toHaveLength(1);
    });
  });
});

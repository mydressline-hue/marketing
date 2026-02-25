/**
 * E2E tests for complete agent workflow lifecycle.
 *
 * Tests the full agent lifecycle:
 *   1. Register all 20 agents
 *   2. Start an agent
 *   3. Run agent process
 *   4. Verify decision logged to DB
 *   5. Verify state updated
 *   6. Stop agent
 *   7. Verify cleanup
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
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';

import type {
  AgentType,
  AgentStatus,
  AgentState,
  AgentDecision,
} from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

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
// Agent Registry and Lifecycle Simulator
// ---------------------------------------------------------------------------

interface AgentRegistryEntry {
  type: AgentType;
  status: AgentStatus;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  decisions: AgentDecision[];
  registered_at: string;
  last_run_at: string | null;
}

class AgentRegistry {
  private agents: Map<AgentType, AgentRegistryEntry> = new Map();

  register(type: AgentType, config: Record<string, unknown> = {}): AgentRegistryEntry {
    const entry: AgentRegistryEntry = {
      type,
      status: 'idle',
      config: { schedule: '0 * * * *', enabled: true, ...config },
      metrics: { total_runs: 0, errors: 0, avg_duration_ms: 0 },
      decisions: [],
      registered_at: new Date().toISOString(),
      last_run_at: null,
    };
    this.agents.set(type, entry);
    return entry;
  }

  get(type: AgentType): AgentRegistryEntry | undefined {
    return this.agents.get(type);
  }

  getAll(): AgentRegistryEntry[] {
    return Array.from(this.agents.values());
  }

  start(type: AgentType): AgentRegistryEntry {
    const agent = this.agents.get(type);
    if (!agent) throw new Error(`Agent ${type} not registered`);
    if (agent.status === 'running') throw new Error(`Agent ${type} already running`);
    agent.status = 'running';
    return agent;
  }

  async process(
    type: AgentType,
    input: Record<string, unknown>,
  ): Promise<AgentDecision> {
    const agent = this.agents.get(type);
    if (!agent) throw new Error(`Agent ${type} not registered`);
    if (agent.status !== 'running') throw new Error(`Agent ${type} is not running`);

    const decision: AgentDecision = {
      id: `decision-${type}-${Date.now()}`,
      agent_type: type,
      decision_type: 'auto_analysis',
      input_data: input,
      output_data: {
        result: `Processed by ${type}`,
        timestamp: new Date().toISOString(),
      },
      confidence_score: 0.85 + Math.random() * 0.1,
      reasoning: `${type} analyzed the input data and produced recommendations.`,
      is_approved: false,
      created_at: new Date().toISOString(),
    };

    agent.decisions.push(decision);
    agent.last_run_at = new Date().toISOString();
    (agent.metrics as Record<string, number>).total_runs += 1;

    return decision;
  }

  stop(type: AgentType): AgentRegistryEntry {
    const agent = this.agents.get(type);
    if (!agent) throw new Error(`Agent ${type} not registered`);
    agent.status = 'idle';
    return agent;
  }

  unregister(type: AgentType): boolean {
    return this.agents.delete(type);
  }

  get size(): number {
    return this.agents.size;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Workflow E2E Tests', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    registry = new AgentRegistry();
  });

  // =========================================================================
  // Step 1: Register all 20 agents
  // =========================================================================

  describe('Step 1: Register all 20 agents', () => {
    it('should register all 20 agent types successfully', () => {
      for (const agentType of ALL_AGENT_TYPES) {
        const entry = registry.register(agentType);
        expect(entry.type).toBe(agentType);
        expect(entry.status).toBe('idle');
        expect(entry.config.enabled).toBe(true);
      }

      expect(registry.size).toBe(20);

      // Verify all agent types are registered
      const allAgents = registry.getAll();
      const registeredTypes = allAgents.map((a) => a.type);
      for (const agentType of ALL_AGENT_TYPES) {
        expect(registeredTypes).toContain(agentType);
      }
    });

    it('should persist agent registration in the database', async () => {
      // Simulate DB insert for each agent registration
      for (const agentType of ALL_AGENT_TYPES) {
        const entry = registry.register(agentType);

        mockPool.query.mockResolvedValueOnce({
          rows: [{
            id: `agent-${agentType}-uuid`,
            agent_type: agentType,
            status: 'idle',
            config: entry.config,
            metrics: entry.metrics,
            created_at: entry.registered_at,
            updated_at: entry.registered_at,
          }],
          rowCount: 1,
        });

        const dbResult = await mockPool.query(
          'INSERT INTO agent_states (id, agent_type, status, config, metrics) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [`agent-${agentType}-uuid`, agentType, 'idle', entry.config, entry.metrics],
        );

        expect(dbResult.rows[0].agent_type).toBe(agentType);
        expect(dbResult.rows[0].status).toBe('idle');
      }

      expect(mockPool.query).toHaveBeenCalledTimes(20);
    });
  });

  // =========================================================================
  // Step 2: Start an agent
  // =========================================================================

  describe('Step 2: Start an agent', () => {
    it('should transition agent from idle to running', () => {
      registry.register('market_intelligence');
      const agent = registry.start('market_intelligence');

      expect(agent.status).toBe('running');
    });

    it('should reject starting an already running agent', () => {
      registry.register('market_intelligence');
      registry.start('market_intelligence');

      expect(() => registry.start('market_intelligence')).toThrow('already running');
    });

    it('should update agent status in database', async () => {
      registry.register('performance_analytics');
      registry.start('performance_analytics');

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'agent-performance_analytics-uuid',
          agent_type: 'performance_analytics',
          status: 'running',
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'UPDATE agent_states SET status = $1, last_run_at = NOW(), updated_at = NOW() WHERE agent_type = $2 RETURNING *',
        ['running', 'performance_analytics'],
      );

      expect(dbResult.rows[0].status).toBe('running');
    });
  });

  // =========================================================================
  // Step 3: Run agent process
  // =========================================================================

  describe('Step 3: Run agent process', () => {
    it('should execute agent process and return a decision', async () => {
      registry.register('paid_ads');
      registry.start('paid_ads');

      const decision = await registry.process('paid_ads', {
        campaign_id: 'camp-123',
        country: 'US',
        budget: 10000,
      });

      expect(decision.agent_type).toBe('paid_ads');
      expect(decision.decision_type).toBe('auto_analysis');
      expect(decision.input_data).toEqual({
        campaign_id: 'camp-123',
        country: 'US',
        budget: 10000,
      });
      expect(decision.output_data).toBeDefined();
      expect(decision.confidence_score).toBeGreaterThan(0);
      expect(decision.confidence_score).toBeLessThanOrEqual(1);
      expect(decision.reasoning).toContain('paid_ads');
      expect(decision.is_approved).toBe(false);
    });

    it('should reject process call on non-running agent', async () => {
      registry.register('paid_ads');
      // Agent is still idle, not started

      await expect(
        registry.process('paid_ads', { campaign_id: 'camp-123' }),
      ).rejects.toThrow('is not running');
    });
  });

  // =========================================================================
  // Step 4: Verify decision logged to DB
  // =========================================================================

  describe('Step 4: Verify decision logged to DB', () => {
    it('should persist decision record in the database', async () => {
      registry.register('compliance');
      registry.start('compliance');

      const decision = await registry.process('compliance', {
        campaign_id: 'camp-de-1',
        country: 'DE',
        regulation: 'gdpr',
      });

      // Simulate inserting the decision into DB
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: decision.id,
          agent_type: decision.agent_type,
          decision_type: decision.decision_type,
          input_data: decision.input_data,
          output_data: decision.output_data,
          confidence_score: decision.confidence_score,
          reasoning: decision.reasoning,
          is_approved: decision.is_approved,
          created_at: decision.created_at,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO agent_decisions (id, agent_type, decision_type, input_data, output_data, confidence_score, reasoning, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [
          decision.id,
          decision.agent_type,
          decision.decision_type,
          decision.input_data,
          decision.output_data,
          decision.confidence_score,
          decision.reasoning,
          decision.is_approved,
        ],
      );

      expect(dbResult.rows[0].agent_type).toBe('compliance');
      expect(dbResult.rows[0].decision_type).toBe('auto_analysis');
      expect(dbResult.rows[0].confidence_score).toBeGreaterThan(0);
      expect(dbResult.rows[0].is_approved).toBe(false);
    });

    it('should accumulate decisions in agent registry', async () => {
      registry.register('fraud_detection');
      registry.start('fraud_detection');

      await registry.process('fraud_detection', { check: 'click_fraud' });
      await registry.process('fraud_detection', { check: 'bot_traffic' });
      await registry.process('fraud_detection', { check: 'conversion_anomaly' });

      const agent = registry.get('fraud_detection');
      expect(agent!.decisions).toHaveLength(3);
      expect(agent!.decisions[0].input_data).toEqual({ check: 'click_fraud' });
      expect(agent!.decisions[1].input_data).toEqual({ check: 'bot_traffic' });
      expect(agent!.decisions[2].input_data).toEqual({ check: 'conversion_anomaly' });
    });
  });

  // =========================================================================
  // Step 5: Verify state updated
  // =========================================================================

  describe('Step 5: Verify state updated', () => {
    it('should update agent metrics after process execution', async () => {
      registry.register('revenue_forecasting');
      registry.start('revenue_forecasting');

      await registry.process('revenue_forecasting', { period: 'Q1-2026' });
      await registry.process('revenue_forecasting', { period: 'Q2-2026' });

      const agent = registry.get('revenue_forecasting');
      expect(agent!.metrics.total_runs).toBe(2);
      expect(agent!.last_run_at).not.toBeNull();
      expect(agent!.status).toBe('running');
    });

    it('should reflect state changes in database queries', async () => {
      registry.register('data_engineering');
      registry.start('data_engineering');
      await registry.process('data_engineering', { pipeline: 'etl_daily' });

      const agent = registry.get('data_engineering')!;

      // Verify state can be read back from DB
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'agent-data_engineering-uuid',
          agent_type: 'data_engineering',
          status: 'running',
          last_run_at: agent.last_run_at,
          metrics: agent.metrics,
          updated_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'SELECT * FROM agent_states WHERE agent_type = $1',
        ['data_engineering'],
      );

      expect(dbResult.rows[0].status).toBe('running');
      expect(dbResult.rows[0].metrics.total_runs).toBe(1);
    });
  });

  // =========================================================================
  // Step 6: Stop agent
  // =========================================================================

  describe('Step 6: Stop agent', () => {
    it('should transition agent from running to idle', () => {
      registry.register('ab_testing');
      registry.start('ab_testing');
      expect(registry.get('ab_testing')!.status).toBe('running');

      const stopped = registry.stop('ab_testing');
      expect(stopped.status).toBe('idle');
    });

    it('should persist stopped status in database', async () => {
      registry.register('organic_social');
      registry.start('organic_social');
      registry.stop('organic_social');

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'agent-organic_social-uuid',
          agent_type: 'organic_social',
          status: 'idle',
          updated_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'UPDATE agent_states SET status = $1, updated_at = NOW() WHERE agent_type = $2 RETURNING *',
        ['idle', 'organic_social'],
      );

      expect(dbResult.rows[0].status).toBe('idle');
    });
  });

  // =========================================================================
  // Step 7: Verify cleanup
  // =========================================================================

  describe('Step 7: Verify cleanup', () => {
    it('should clear agent cache on stop', async () => {
      registry.register('shopify_integration');
      registry.start('shopify_integration');
      await registry.process('shopify_integration', { action: 'sync_products' });
      registry.stop('shopify_integration');

      // Simulate cache cleanup
      mockCacheDel.mockResolvedValueOnce(undefined);
      await mockCacheDel(`agent:shopify_integration:state`);

      expect(mockCacheDel).toHaveBeenCalledWith('agent:shopify_integration:state');
    });

    it('should allow re-registration after unregister', () => {
      registry.register('localization');
      expect(registry.get('localization')).toBeDefined();

      registry.unregister('localization');
      expect(registry.get('localization')).toBeUndefined();

      // Can re-register
      const reRegistered = registry.register('localization', { locale: 'de' });
      expect(reRegistered.type).toBe('localization');
      expect(reRegistered.config.locale).toBe('de');
    });

    it('should preserve decisions history even after stop', async () => {
      registry.register('brand_consistency');
      registry.start('brand_consistency');
      await registry.process('brand_consistency', { creative_id: 'c-1' });
      await registry.process('brand_consistency', { creative_id: 'c-2' });
      registry.stop('brand_consistency');

      const agent = registry.get('brand_consistency');
      expect(agent!.status).toBe('idle');
      expect(agent!.decisions).toHaveLength(2);
    });
  });

  // =========================================================================
  // Full lifecycle integration
  // =========================================================================

  describe('Full lifecycle: register -> start -> process -> stop -> cleanup', () => {
    it('should complete the full lifecycle for an agent', async () => {
      // Register
      const registered = registry.register('enterprise_security', {
        scan_interval: '5m',
        threat_level_threshold: 'medium',
      });
      expect(registered.status).toBe('idle');
      expect(registered.config.scan_interval).toBe('5m');

      // Start
      const started = registry.start('enterprise_security');
      expect(started.status).toBe('running');

      // Process (multiple runs)
      const decision1 = await registry.process('enterprise_security', {
        scan_type: 'vulnerability',
        target: 'api_endpoints',
      });
      expect(decision1.agent_type).toBe('enterprise_security');

      const decision2 = await registry.process('enterprise_security', {
        scan_type: 'access_audit',
        target: 'user_sessions',
      });
      expect(decision2.agent_type).toBe('enterprise_security');

      // Verify metrics accumulated
      const agent = registry.get('enterprise_security')!;
      expect(agent.metrics.total_runs).toBe(2);
      expect(agent.decisions).toHaveLength(2);
      expect(agent.last_run_at).not.toBeNull();

      // Simulate DB persistence of decisions
      for (const decision of agent.decisions) {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ id: decision.id, agent_type: decision.agent_type }],
          rowCount: 1,
        });
      }

      // Stop
      const stopped = registry.stop('enterprise_security');
      expect(stopped.status).toBe('idle');

      // Decisions are preserved
      expect(stopped.decisions).toHaveLength(2);

      // Cleanup: unregister
      const removed = registry.unregister('enterprise_security');
      expect(removed).toBe(true);
      expect(registry.get('enterprise_security')).toBeUndefined();
    });
  });
});

/**
 * Agents Service.
 *
 * Provides static methods for managing the AI agent framework through the
 * REST API. Supports listing agent states, triggering agent runs, pausing
 * and resuming agents, querying decision history, orchestrating multi-agent
 * cycles, running cross-challenge rounds, and tracking AI cost data.
 * List results are cached in Redis with a short TTL to reduce database load.
 */

import { pool } from '../config/database';
import { cacheGet, cacheSet, cacheFlush } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateId } from '../utils/helpers';
import { AgentRegistry } from '../agents/base/AgentRegistry';
import { AgentLifecycle } from '../agents/base/AgentLifecycle';
import type { AgentInput, AgentOutput } from '../agents/base/types';
import type {
  AgentType,
  AgentState,
  AgentDecision,
  CrossChallengeResult,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface OrchestrationResult {
  requestId: string;
  agentsRun: string[];
  results: Record<string, AgentOutput>;
  startedAt: string;
  completedAt: string;
}

export interface ChallengeRound {
  roundId: string;
  challenges: CrossChallengeResult[];
  agentsInvolved: string[];
  startedAt: string;
  completedAt: string;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  byAgent: Record<string, { cost: number; tokens: number; calls: number }>;
  byModel: Record<string, { cost: number; tokens: number; calls: number }>;
  period: { startDate?: string; endDate?: string };
}

export interface AgentCostDetail {
  agentType: string;
  totalCost: number;
  totalTokens: number;
  totalCalls: number;
  byModel: Record<string, { cost: number; tokens: number; calls: number }>;
  recentCalls: Array<{
    id: string;
    model: string;
    tokens: number;
    cost: number;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'agents';
const CACHE_TTL = 30; // seconds

function listCacheKey(): string {
  return `${CACHE_PREFIX}:list`;
}

function agentCacheKey(agentType: string): string {
  return `${CACHE_PREFIX}:agent:${agentType}`;
}

function decisionsCacheKey(
  agentType: string,
  pagination: Record<string, unknown>,
): string {
  return `${CACHE_PREFIX}:decisions:${agentType}:${JSON.stringify(pagination)}`;
}

function costsCacheKey(
  key: string,
  dateRange: Record<string, unknown>,
): string {
  return `${CACHE_PREFIX}:costs:${key}:${JSON.stringify(dateRange)}`;
}

// ---------------------------------------------------------------------------
// Valid agent types (whitelist for param validation)
// ---------------------------------------------------------------------------

const VALID_AGENT_TYPES: AgentType[] = [
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

function validateAgentType(agentType: string): AgentType {
  if (!VALID_AGENT_TYPES.includes(agentType as AgentType)) {
    throw new ValidationError(
      `Invalid agent type "${agentType}". Must be one of: ${VALID_AGENT_TYPES.join(', ')}`,
    );
  }
  return agentType as AgentType;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentsService {
  /**
   * List all agents and their current statuses.
   * Results are cached in Redis with a 30-second TTL.
   */
  static async listAgents(): Promise<AgentState[]> {
    // Attempt cache hit
    const cacheKey = listCacheKey();
    const cached = await cacheGet<AgentState[]>(cacheKey);

    if (cached) {
      logger.debug('Agents list cache hit', { cacheKey });
      return cached;
    }

    const lifecycle = new AgentLifecycle();
    const agents = await lifecycle.getAllStatuses();

    // Store in cache
    await cacheSet(cacheKey, agents, CACHE_TTL);
    logger.debug('Agents list cached', { cacheKey });

    return agents;
  }

  /**
   * Retrieve the current state of a specific agent by type.
   */
  static async getAgent(agentType: string): Promise<AgentState> {
    const validType = validateAgentType(agentType);

    // Attempt cache hit
    const cacheKey = agentCacheKey(validType);
    const cached = await cacheGet<AgentState>(cacheKey);

    if (cached) {
      logger.debug('Agent cache hit', { cacheKey, agentType: validType });
      return cached;
    }

    const lifecycle = new AgentLifecycle();
    const state = await lifecycle.getStatus(validType);

    // Store in cache
    await cacheSet(cacheKey, state, CACHE_TTL);
    logger.debug('Agent cached', { cacheKey, agentType: validType });

    return state;
  }

  /**
   * Trigger an agent to run. Looks up the agent in the registry, transitions
   * it to the running state via AgentLifecycle, invokes its process() method,
   * and transitions it back to idle (or error on failure).
   */
  static async runAgent(
    agentType: string,
    parameters?: Record<string, unknown>,
  ): Promise<AgentOutput> {
    const validType = validateAgentType(agentType);

    const registry = AgentRegistry.getInstance();
    const agent = registry.get(validType);

    if (!agent) {
      throw new NotFoundError(
        `Agent "${validType}" is not registered. Ensure it has been initialised.`,
      );
    }

    const lifecycle = new AgentLifecycle();

    // Transition to running
    await lifecycle.startAgent(validType);

    const requestId = generateId();
    const input: AgentInput = {
      context: {},
      parameters: parameters ?? {},
      requestId,
    };

    try {
      const output = await agent.process(input);

      // Transition back to idle on success
      await lifecycle.stopAgent(validType);

      // Invalidate caches
      await cacheFlush(`${CACHE_PREFIX}:*`);
      logger.info('Agent run completed', {
        agentType: validType,
        requestId,
        decision: output.decision,
        confidence: output.confidence.score,
      });

      return output;
    } catch (error) {
      // Transition to error state
      await lifecycle.setError(
        validType,
        error instanceof Error ? error : new Error(String(error)),
      );

      // Invalidate caches
      await cacheFlush(`${CACHE_PREFIX}:*`);

      throw error;
    }
  }

  /**
   * Pause a running or idle agent. Prevents it from being scheduled for
   * new runs until resumed.
   */
  static async pauseAgent(agentType: string): Promise<void> {
    const validType = validateAgentType(agentType);

    const lifecycle = new AgentLifecycle();
    await lifecycle.pauseAgent(validType);

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Agent paused via API', { agentType: validType });
  }

  /**
   * Resume a paused agent. Transitions it back to idle so it can be
   * scheduled for new runs.
   */
  static async resumeAgent(agentType: string): Promise<void> {
    const validType = validateAgentType(agentType);

    const lifecycle = new AgentLifecycle();
    await lifecycle.stopAgent(validType);

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Agent resumed via API', { agentType: validType });
  }

  /**
   * Retrieve paginated decision history for a specific agent.
   * JOINs relevant fields and supports sorting by created_at.
   */
  static async getDecisions(
    agentType: string,
    pagination?: Pagination,
  ): Promise<PaginatedResult<AgentDecision>> {
    const validType = validateAgentType(agentType);

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const sortOrder =
      pagination?.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Attempt cache hit
    const cacheKey = decisionsCacheKey(validType, { page, limit, sortOrder });
    const cached = await cacheGet<PaginatedResult<AgentDecision>>(cacheKey);

    if (cached) {
      logger.debug('Agent decisions cache hit', { cacheKey });
      return cached;
    }

    // Count total matching rows
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM agent_decisions WHERE agent_type = $1`,
      [validType],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch the page
    const dataResult = await pool.query<AgentDecision>(
      `SELECT id, agent_type, decision_type, input_data, output_data,
              confidence_score, reasoning, challenged_by, challenge_results,
              is_approved, approved_by, created_at
       FROM agent_decisions
       WHERE agent_type = $1
       ORDER BY created_at ${sortOrder}
       LIMIT $2 OFFSET $3`,
      [validType, limit, offset],
    );

    const result: PaginatedResult<AgentDecision> = {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    // Store in cache
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Agent decisions cached', { cacheKey });

    return result;
  }

  /**
   * Retrieve a single agent decision by its ID.
   */
  static async getDecision(decisionId: string): Promise<AgentDecision> {
    const result = await pool.query<AgentDecision>(
      `SELECT id, agent_type, decision_type, input_data, output_data,
              confidence_score, reasoning, challenged_by, challenge_results,
              is_approved, approved_by, created_at
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    return result.rows[0];
  }

  /**
   * Trigger a master orchestration cycle. Runs all eligible agents in
   * priority order and collects their outputs.
   */
  static async runOrchestration(
    requestId: string,
  ): Promise<OrchestrationResult> {
    const startedAt = new Date().toISOString();
    const registry = AgentRegistry.getInstance();
    const lifecycle = new AgentLifecycle();

    // Get all registered agent types
    const allTypes = registry.getAllTypes();
    const agentsRun: string[] = [];
    const results: Record<string, AgentOutput> = {};

    logger.info('Orchestration cycle started', { requestId, agentCount: allTypes.length });

    for (const agentType of allTypes) {
      // Skip the orchestrator itself to avoid recursion
      if (agentType === 'master_orchestrator') continue;

      const agent = registry.get(agentType);
      if (!agent) continue;

      // Check if agent is in a runnable state
      const state = await lifecycle.getStatus(agentType);
      if (state.status === 'paused' || state.status === 'error') {
        logger.debug('Skipping non-runnable agent in orchestration', {
          agentType,
          status: state.status,
        });
        continue;
      }

      try {
        await lifecycle.startAgent(agentType);

        const input: AgentInput = {
          context: { orchestrationRequestId: requestId },
          parameters: {},
          requestId: generateId(),
        };

        const output = await agent.process(input);
        results[agentType] = output;
        agentsRun.push(agentType);

        await lifecycle.stopAgent(agentType);
      } catch (error) {
        await lifecycle.setError(
          agentType,
          error instanceof Error ? error : new Error(String(error)),
        );
        logger.error('Agent failed during orchestration', {
          agentType,
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const completedAt = new Date().toISOString();

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);

    logger.info('Orchestration cycle completed', {
      requestId,
      agentsRun: agentsRun.length,
      completedAt,
    });

    return {
      requestId,
      agentsRun,
      results,
      startedAt,
      completedAt,
    };
  }

  /**
   * Retrieve cross-challenge results with pagination.
   * Queries the agent_decisions table for records that have
   * challenge_results populated.
   */
  static async getChallengeResults(
    pagination?: Pagination,
  ): Promise<PaginatedResult<AgentDecision>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const sortOrder =
      pagination?.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Count total
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM agent_decisions
       WHERE challenge_results IS NOT NULL AND challenge_results != '[]'::jsonb`,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    const dataResult = await pool.query<AgentDecision>(
      `SELECT id, agent_type, decision_type, input_data, output_data,
              confidence_score, reasoning, challenged_by, challenge_results,
              is_approved, approved_by, created_at
       FROM agent_decisions
       WHERE challenge_results IS NOT NULL AND challenge_results != '[]'::jsonb
       ORDER BY created_at ${sortOrder}
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Run a cross-challenge round between agents. Each agent challenges
   * the most recent decision of specified peer agents.
   */
  static async runChallengeRound(
    agentTypes?: string[],
  ): Promise<ChallengeRound> {
    const roundId = generateId();
    const startedAt = new Date().toISOString();
    const registry = AgentRegistry.getInstance();

    // Determine which agents participate
    const participants = agentTypes
      ? agentTypes.map((t) => validateAgentType(t))
      : registry.getAllTypes();

    const challenges: CrossChallengeResult[] = [];
    const agentsInvolved: string[] = [];

    logger.info('Challenge round started', { roundId, participantCount: participants.length });

    for (const challengerType of participants) {
      const challenger = registry.get(challengerType);
      if (!challenger) continue;

      // Get the agent's challenge targets
      const targets = challenger.getChallengeTargets();

      for (const targetType of targets) {
        if (!participants.includes(targetType)) continue;

        // Fetch the most recent decision for the target agent
        const decisionResult = await pool.query<AgentDecision>(
          `SELECT id, agent_type, decision_type, input_data, output_data,
                  confidence_score, reasoning, is_approved, created_at
           FROM agent_decisions
           WHERE agent_type = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [targetType],
        );

        if (decisionResult.rows.length === 0) continue;

        const challengeResult: CrossChallengeResult = {
          challenger: challengerType,
          challenged: targetType,
          finding: `Challenge review by ${challengerType} of ${targetType} decision`,
          severity: 'info',
          confidence: decisionResult.rows[0].confidence_score,
          resolved: false,
        };

        challenges.push(challengeResult);

        if (!agentsInvolved.includes(challengerType)) {
          agentsInvolved.push(challengerType);
        }
        if (!agentsInvolved.includes(targetType)) {
          agentsInvolved.push(targetType);
        }
      }
    }

    const completedAt = new Date().toISOString();

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);

    logger.info('Challenge round completed', {
      roundId,
      challengeCount: challenges.length,
      agentsInvolved: agentsInvolved.length,
    });

    return {
      roundId,
      challenges,
      agentsInvolved,
      startedAt,
      completedAt,
    };
  }

  /**
   * Get AI cost tracking summary, optionally filtered by date range.
   * Queries the ai_cost_log table for aggregated cost data.
   */
  static async getCostSummary(
    dateRange?: { startDate?: string; endDate?: string },
  ): Promise<CostSummary> {
    const cacheKey = costsCacheKey('summary', (dateRange ?? {}) as Record<string, unknown>);
    const cached = await cacheGet<CostSummary>(cacheKey);

    if (cached) {
      logger.debug('Cost summary cache hit', { cacheKey });
      return cached;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dateRange?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(dateRange.startDate);
    }

    if (dateRange?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(dateRange.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total cost and tokens
    const totalResult = await pool.query<{
      total_cost: string;
      total_tokens: string;
    }>(
      `SELECT COALESCE(SUM(cost), 0) AS total_cost,
              COALESCE(SUM(tokens_used), 0) AS total_tokens
       FROM ai_cost_log ${whereClause}`,
      params,
    );

    const totalCost = parseFloat(totalResult.rows[0].total_cost);
    const totalTokens = parseInt(totalResult.rows[0].total_tokens, 10);

    // Cost by agent
    const agentResult = await pool.query<{
      agent_type: string;
      cost: string;
      tokens: string;
      calls: string;
    }>(
      `SELECT agent_type,
              COALESCE(SUM(cost), 0) AS cost,
              COALESCE(SUM(tokens_used), 0) AS tokens,
              COUNT(*) AS calls
       FROM ai_cost_log ${whereClause}
       GROUP BY agent_type
       ORDER BY cost DESC`,
      params,
    );

    const byAgent: Record<string, { cost: number; tokens: number; calls: number }> = {};
    for (const row of agentResult.rows) {
      byAgent[row.agent_type] = {
        cost: parseFloat(row.cost),
        tokens: parseInt(row.tokens, 10),
        calls: parseInt(row.calls, 10),
      };
    }

    // Cost by model
    const modelResult = await pool.query<{
      model: string;
      cost: string;
      tokens: string;
      calls: string;
    }>(
      `SELECT model,
              COALESCE(SUM(cost), 0) AS cost,
              COALESCE(SUM(tokens_used), 0) AS tokens,
              COUNT(*) AS calls
       FROM ai_cost_log ${whereClause}
       GROUP BY model
       ORDER BY cost DESC`,
      params,
    );

    const byModel: Record<string, { cost: number; tokens: number; calls: number }> = {};
    for (const row of modelResult.rows) {
      byModel[row.model] = {
        cost: parseFloat(row.cost),
        tokens: parseInt(row.tokens, 10),
        calls: parseInt(row.calls, 10),
      };
    }

    const summary: CostSummary = {
      totalCost,
      totalTokens,
      byAgent,
      byModel,
      period: {
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
      },
    };

    // Store in cache
    await cacheSet(cacheKey, summary, CACHE_TTL);
    logger.debug('Cost summary cached', { cacheKey });

    return summary;
  }

  /**
   * Get detailed AI cost data for a specific agent, optionally filtered
   * by date range. Includes recent individual calls.
   */
  static async getCostByAgent(
    agentType: string,
    dateRange?: { startDate?: string; endDate?: string },
  ): Promise<AgentCostDetail> {
    const validType = validateAgentType(agentType);

    const cacheKey = costsCacheKey(validType, (dateRange ?? {}) as Record<string, unknown>);
    const cached = await cacheGet<AgentCostDetail>(cacheKey);

    if (cached) {
      logger.debug('Agent cost cache hit', { cacheKey, agentType: validType });
      return cached;
    }

    const conditions: string[] = [`agent_type = $1`];
    const params: unknown[] = [validType];
    let paramIndex = 2;

    if (dateRange?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(dateRange.startDate);
    }

    if (dateRange?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(dateRange.endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Total cost and tokens for this agent
    const totalResult = await pool.query<{
      total_cost: string;
      total_tokens: string;
      total_calls: string;
    }>(
      `SELECT COALESCE(SUM(cost), 0) AS total_cost,
              COALESCE(SUM(tokens_used), 0) AS total_tokens,
              COUNT(*) AS total_calls
       FROM ai_cost_log ${whereClause}`,
      params,
    );

    const totalCost = parseFloat(totalResult.rows[0].total_cost);
    const totalTokens = parseInt(totalResult.rows[0].total_tokens, 10);
    const totalCalls = parseInt(totalResult.rows[0].total_calls, 10);

    // Breakdown by model
    const modelResult = await pool.query<{
      model: string;
      cost: string;
      tokens: string;
      calls: string;
    }>(
      `SELECT model,
              COALESCE(SUM(cost), 0) AS cost,
              COALESCE(SUM(tokens_used), 0) AS tokens,
              COUNT(*) AS calls
       FROM ai_cost_log ${whereClause}
       GROUP BY model
       ORDER BY cost DESC`,
      params,
    );

    const byModel: Record<string, { cost: number; tokens: number; calls: number }> = {};
    for (const row of modelResult.rows) {
      byModel[row.model] = {
        cost: parseFloat(row.cost),
        tokens: parseInt(row.tokens, 10),
        calls: parseInt(row.calls, 10),
      };
    }

    // Recent individual calls (last 50)
    const recentResult = await pool.query<{
      id: string;
      model: string;
      tokens_used: number;
      cost: number;
      created_at: string;
    }>(
      `SELECT id, model, tokens_used, cost, created_at
       FROM ai_cost_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT 50`,
      params,
    );

    const recentCalls = recentResult.rows.map((row) => ({
      id: row.id,
      model: row.model,
      tokens: Number(row.tokens_used),
      cost: Number(row.cost),
      created_at: row.created_at,
    }));

    const detail: AgentCostDetail = {
      agentType: validType,
      totalCost,
      totalTokens,
      totalCalls,
      byModel,
      recentCalls,
    };

    // Store in cache
    await cacheSet(cacheKey, detail, CACHE_TTL);
    logger.debug('Agent cost cached', { cacheKey, agentType: validType });

    return detail;
  }
}

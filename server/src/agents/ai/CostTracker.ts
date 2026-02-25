// ============================================================
// AI Integration Layer - Cost Tracker
// Phase 3B: Token usage cost tracking with PostgreSQL persistence
// ============================================================

import { query } from '../../config/database';
import { createChildLogger } from '../../utils/logger';
import { DatabaseError } from '../../utils/errors';
import { generateId } from '../../utils/helpers';
import type {
  AIModelType,
  TokenUsage,
  CostRecord,
  CostSummary,
  ModelPricing,
} from './types';

/**
 * Per-model pricing configuration (USD per million tokens).
 *
 * Centralized pricing table -- update here when Anthropic changes rates.
 * Stored as a configuration object rather than hardcoded inline.
 */
const MODEL_PRICING: Record<AIModelType, ModelPricing> = {
  opus: {
    inputPerMTok: 15,
    outputPerMTok: 75,
  },
  sonnet: {
    inputPerMTok: 3,
    outputPerMTok: 15,
  },
};

/**
 * SQL to ensure the cost tracking table exists.
 * Uses IF NOT EXISTS so it's safe to call on every startup.
 */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ai_cost_tracking (
    id UUID PRIMARY KEY,
    agent_type VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost NUMERIC(12, 8) NOT NULL DEFAULT 0,
    request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_agent_type
    ON ai_cost_tracking (agent_type);

  CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_created_at
    ON ai_cost_tracking (created_at);

  CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_request_id
    ON ai_cost_tracking (request_id);
`;

/**
 * Tracks and persists the cost of every AI API call to PostgreSQL.
 *
 * Provides methods to:
 * - Record usage and compute cost for each request
 * - Query cost aggregations by agent, model, and date range
 * - Generate cost breakdowns for reporting and budgeting
 *
 * Pricing is stored in a configuration object (`MODEL_PRICING`) and is
 * never hardcoded inline.
 */
export class CostTracker {
  private readonly log;
  private initialized: boolean = false;

  constructor() {
    this.log = createChildLogger({ component: 'CostTracker' });
  }

  /**
   * Ensures the cost tracking table exists in the database.
   * Safe to call multiple times (uses IF NOT EXISTS).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await query(CREATE_TABLE_SQL);
      this.initialized = true;
      this.log.info('Cost tracking table initialized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to initialize cost tracking table', { error: message });
      throw new DatabaseError(`Failed to initialize cost tracking table: ${message}`);
    }
  }

  /**
   * Records token usage and computed cost for a single AI API call.
   *
   * Computes cost based on the configured pricing for the model tier,
   * persists the record to PostgreSQL, and logs the cost.
   *
   * @param agentType - The agent type that initiated the request (e.g. 'market_intelligence').
   * @param model - The model tier used ('opus' or 'sonnet').
   * @param usage - Token usage breakdown from the API response.
   * @param requestId - The unique request ID for correlation.
   * @returns The persisted CostRecord.
   */
  async recordUsage(
    agentType: string,
    model: AIModelType,
    usage: TokenUsage,
    requestId: string,
  ): Promise<CostRecord> {
    await this.initialize();

    const cost = this.computeCost(model, usage);
    const id = generateId();
    const timestamp = new Date().toISOString();

    const record: CostRecord = {
      id,
      agentType,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost,
      requestId,
      timestamp,
    };

    try {
      await query(
        `INSERT INTO ai_cost_tracking (id, agent_type, model, input_tokens, output_tokens, cost, request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, agentType, model, usage.inputTokens, usage.outputTokens, cost, requestId, timestamp],
      );

      this.log.info('Cost recorded', {
        requestId,
        agentType,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: cost.toFixed(6),
      });

      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to record cost', { error: message, requestId });
      throw new DatabaseError(`Failed to record AI cost: ${message}`);
    }
  }

  /**
   * Retrieves an aggregated cost summary for a specific agent type.
   *
   * @param agentType - The agent type to query costs for.
   * @param dateRange - Optional date range filter ({ startDate, endDate } as ISO strings).
   * @returns Aggregated CostSummary for the specified agent.
   */
  async getCostByAgent(
    agentType: string,
    dateRange?: { startDate: string; endDate: string },
  ): Promise<CostSummary> {
    await this.initialize();

    try {
      let sql = `
        SELECT
          model,
          COUNT(*)::integer AS requests,
          COALESCE(SUM(input_tokens), 0)::integer AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0)::integer AS total_output_tokens,
          COALESCE(SUM(cost), 0)::numeric AS total_cost
        FROM ai_cost_tracking
        WHERE agent_type = $1
      `;
      const params: unknown[] = [agentType];

      if (dateRange) {
        sql += ` AND created_at >= $2 AND created_at <= $3`;
        params.push(dateRange.startDate, dateRange.endDate);
      }

      sql += ` GROUP BY model`;

      const result = await query<{
        model: string;
        requests: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost: string;
      }>(sql, params);

      return this.buildCostSummary(result.rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to get cost by agent', { error: message, agentType });
      throw new DatabaseError(`Failed to query cost by agent: ${message}`);
    }
  }

  /**
   * Retrieves the total cost across all agents and models.
   *
   * @param dateRange - Optional date range filter ({ startDate, endDate } as ISO strings).
   * @returns Total cost in USD.
   */
  async getTotalCost(
    dateRange?: { startDate: string; endDate: string },
  ): Promise<number> {
    await this.initialize();

    try {
      let sql = `SELECT COALESCE(SUM(cost), 0)::numeric AS total FROM ai_cost_tracking`;
      const params: unknown[] = [];

      if (dateRange) {
        sql += ` WHERE created_at >= $1 AND created_at <= $2`;
        params.push(dateRange.startDate, dateRange.endDate);
      }

      const result = await query<{ total: string }>(sql, params);
      return parseFloat(result.rows[0]?.total ?? '0');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to get total cost', { error: message });
      throw new DatabaseError(`Failed to query total cost: ${message}`);
    }
  }

  /**
   * Retrieves a full cost breakdown grouped by agent type.
   *
   * @returns A record mapping each agent type to its CostSummary.
   */
  async getCostBreakdown(): Promise<Record<string, CostSummary>> {
    await this.initialize();

    try {
      const result = await query<{
        agent_type: string;
        model: string;
        requests: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost: string;
      }>(`
        SELECT
          agent_type,
          model,
          COUNT(*)::integer AS requests,
          COALESCE(SUM(input_tokens), 0)::integer AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0)::integer AS total_output_tokens,
          COALESCE(SUM(cost), 0)::numeric AS total_cost
        FROM ai_cost_tracking
        GROUP BY agent_type, model
        ORDER BY agent_type, model
      `);

      // Group rows by agent_type
      const grouped: Record<string, Array<typeof result.rows[0]>> = {};
      for (const row of result.rows) {
        if (!grouped[row.agent_type]) {
          grouped[row.agent_type] = [];
        }
        grouped[row.agent_type].push(row);
      }

      // Build CostSummary for each agent
      const breakdown: Record<string, CostSummary> = {};
      for (const [agentType, rows] of Object.entries(grouped)) {
        breakdown[agentType] = this.buildCostSummary(rows);
      }

      return breakdown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Failed to get cost breakdown', { error: message });
      throw new DatabaseError(`Failed to query cost breakdown: ${message}`);
    }
  }

  /**
   * Returns the pricing configuration for a given model tier.
   *
   * @param model - The model tier.
   * @returns The ModelPricing for the requested tier.
   */
  getPricing(model: AIModelType): ModelPricing {
    return MODEL_PRICING[model];
  }

  /**
   * Computes the USD cost for a given token usage based on model pricing.
   *
   * @param model - The model tier ('opus' or 'sonnet').
   * @param usage - The token usage breakdown.
   * @returns The computed cost in USD.
   */
  private computeCost(model: AIModelType, usage: TokenUsage): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      this.log.warn('Unknown model for pricing, defaulting to sonnet rates', { model });
      const fallback = MODEL_PRICING.sonnet;
      return (
        (usage.inputTokens / 1_000_000) * fallback.inputPerMTok +
        (usage.outputTokens / 1_000_000) * fallback.outputPerMTok
      );
    }

    return (
      (usage.inputTokens / 1_000_000) * pricing.inputPerMTok +
      (usage.outputTokens / 1_000_000) * pricing.outputPerMTok
    );
  }

  /**
   * Builds a CostSummary from aggregated database rows.
   */
  private buildCostSummary(
    rows: Array<{
      model: string;
      requests: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost: string;
    }>,
  ): CostSummary {
    let totalCost = 0;
    let totalRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const byModel: CostSummary['byModel'] = {};

    for (const row of rows) {
      const cost = parseFloat(row.total_cost);
      totalCost += cost;
      totalRequests += row.requests;
      totalInputTokens += row.total_input_tokens;
      totalOutputTokens += row.total_output_tokens;

      byModel[row.model] = {
        cost,
        requests: row.requests,
        inputTokens: row.total_input_tokens,
        outputTokens: row.total_output_tokens,
      };
    }

    return {
      totalCost,
      totalRequests,
      totalInputTokens,
      totalOutputTokens,
      byModel,
    };
  }
}

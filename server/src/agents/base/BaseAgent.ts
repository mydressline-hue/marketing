// ============================================================
// AI International Growth Engine - Base Agent Abstract Class
// Foundation that all 20 agent modules extend
// ============================================================

import type winston from 'winston';
import { pool } from '../../config/database';
import { createChildLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import type { AgentType } from '../../types';
import type {
  AgentInput,
  AgentOutput,
  AgentConfig,
  AgentConfidenceScore,
  ConfidenceLevelLabel,
} from './types';
import { getConfidenceLevel } from './ConfidenceScoring';

/**
 * Abstract base class for every agent in the 20-agent framework.
 *
 * Provides:
 * - A structured lifecycle (process, persist, log)
 * - Confidence scoring utilities
 * - Database-backed state persistence and decision auditing
 * - A child logger scoped to the agent type
 * - A placeholder for AI model invocation
 *
 * Subclasses **must** implement:
 * - `process(input)` — the core domain logic
 * - `getSystemPrompt()` — the Claude system prompt for this agent
 * - `getChallengeTargets()` — which peer agents this agent can challenge
 */
export abstract class BaseAgent {
  /** Static configuration for this agent instance */
  protected readonly config: AgentConfig;

  /** Child logger pre-tagged with the agent type */
  protected readonly log: winston.Logger;

  /** Unique instance identifier (stable across restarts if persisted) */
  protected readonly instanceId: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.instanceId = generateId();
    this.log = createChildLogger({
      agent: config.agentType,
      instanceId: this.instanceId,
    });
    this.log.info('Agent instance created', {
      model: config.model,
      maxRetries: config.maxRetries,
      timeoutMs: config.timeoutMs,
      confidenceThreshold: config.confidenceThreshold,
    });
  }

  // ------------------------------------------------------------------
  // Abstract methods — must be implemented by every agent subclass
  // ------------------------------------------------------------------

  /**
   * Core processing logic for the agent.
   * Receives a standardised input and must return a standardised output
   * containing the decision, confidence score, reasoning, and any warnings.
   *
   * @param input - The agent input payload with context, parameters, and request ID.
   * @returns A promise resolving to the agent's structured output.
   */
  abstract process(input: AgentInput): Promise<AgentOutput>;

  /**
   * Returns the Claude system prompt that shapes this agent's AI persona,
   * domain expertise, and response format requirements.
   */
  abstract getSystemPrompt(): string;

  /**
   * Returns the list of peer agent types whose decisions this agent is
   * qualified to challenge through the cross-challenge protocol.
   */
  abstract getChallengeTargets(): AgentType[];

  // ------------------------------------------------------------------
  // Protected helpers — available to all subclasses
  // ------------------------------------------------------------------

  /**
   * Calculates a confidence score from a set of named factors.
   * Each factor value should be in the range 0-100. The overall score
   * is the arithmetic mean of all factor values, clamped to [0, 100].
   *
   * @param factors - A record of factor names to their numeric scores (0-100).
   * @returns An {@link AgentConfidenceScore} with the computed score, level, and factors.
   */
  protected calculateConfidence(
    factors: Record<string, number>,
  ): AgentConfidenceScore {
    const entries = Object.entries(factors);
    if (entries.length === 0) {
      return { score: 0, level: 'low', factors };
    }

    const sum = entries.reduce((acc, [, value]) => acc + value, 0);
    const raw = sum / entries.length;
    const score = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
    const level: ConfidenceLevelLabel = getConfidenceLevel(score);

    return { score, level, factors };
  }

  /**
   * Persists the agent's current state to the `agent_states` table.
   * Uses an upsert so the row is created on first call and updated thereafter.
   *
   * @param state - Arbitrary state data to persist (serialised as JSONB).
   */
  protected async persistState(
    state: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO agent_states (id, agent_type, status, config, metrics, created_at, updated_at)
         VALUES ($1, $2, 'running', $3, $4, $5, $5)
         ON CONFLICT (agent_type)
         DO UPDATE SET config = $3, metrics = $4, updated_at = $5`,
        [
          generateId(),
          this.config.agentType,
          JSON.stringify(this.config),
          JSON.stringify(state),
          now,
        ],
      );
      this.log.debug('Agent state persisted');
    } catch (error) {
      this.log.error('Failed to persist agent state', { error });
      throw error;
    }
  }

  /**
   * Loads the agent's most recent persisted state from the `agent_states` table.
   *
   * @returns The stored metrics object, or `null` if no state exists yet.
   */
  protected async loadState(): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        `SELECT metrics FROM agent_states WHERE agent_type = $1 LIMIT 1`,
        [this.config.agentType],
      );

      if (result.rows.length === 0) {
        this.log.debug('No persisted state found');
        return null;
      }

      return result.rows[0].metrics as Record<string, unknown>;
    } catch (error) {
      this.log.error('Failed to load agent state', { error });
      throw error;
    }
  }

  /**
   * Records an agent decision in the `agent_decisions` audit table.
   * Every call to `process()` should be followed by a call to `logDecision()`
   * so that the full decision history is available for review and replay.
   *
   * @param input  - The input that was provided to the agent.
   * @param output - The output the agent produced.
   */
  protected async logDecision(
    input: AgentInput,
    output: AgentOutput,
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          generateId(),
          this.config.agentType,
          output.decision,
          JSON.stringify(input),
          JSON.stringify(output.data),
          output.confidence.score,
          output.reasoning,
          output.confidence.score >= this.config.confidenceThreshold,
          now,
        ],
      );
      this.log.info('Decision logged', {
        requestId: input.requestId,
        decision: output.decision,
        confidence: output.confidence.score,
        autoApproved:
          output.confidence.score >= this.config.confidenceThreshold,
      });
    } catch (error) {
      this.log.error('Failed to log agent decision', { error });
      throw error;
    }
  }

  /**
   * Flags an uncertainty that the agent encountered during processing.
   * Returns a formatted uncertainty string suitable for inclusion in
   * {@link AgentOutput.uncertainties} and also logs it for observability.
   *
   * @param area   - The domain area where uncertainty exists (e.g. 'market_data', 'pricing').
   * @param reason - A human-readable explanation of why certainty is lacking.
   * @returns A formatted uncertainty string: `[area] reason`.
   */
  protected flagUncertainty(area: string, reason: string): string {
    const uncertainty = `[${area}] ${reason}`;
    this.log.warn('Uncertainty flagged', { area, reason });
    return uncertainty;
  }

  /**
   * Invokes a Claude AI model via the AnthropicClient.
   *
   * Delegates to `AnthropicClient.sendMessage()` which handles retries,
   * token tracking, and error mapping internally.
   *
   * @param systemPrompt - The system-level prompt defining the AI's persona.
   * @param userPrompt   - The user-level prompt with the specific task or question.
   * @param model        - Optional model override ('opus' | 'sonnet'). Defaults to the agent's configured model.
   * @returns The raw text response from the AI model.
   */
  protected async callAI(
    systemPrompt: string,
    userPrompt: string,
    model?: 'opus' | 'sonnet',
  ): Promise<string> {
    const resolvedModel = model ?? this.config.model;
    this.log.debug('Calling AI model', { model: resolvedModel });

    try {
      const { AnthropicClient } = await import('../ai/AnthropicClient');
      const client = new AnthropicClient();
      const response = await client.sendMessage({
        model: resolvedModel,
        systemPrompt,
        userPrompt,
        metadata: { agentType: this.config.agentType },
      });
      return response.content;
    } catch (error) {
      // If the AI module doesn't exist yet, provide a clear error
      const message =
        error instanceof Error ? error.message : String(error);
      if (
        message.includes('Cannot find module') ||
        message.includes('MODULE_NOT_FOUND')
      ) {
        throw new Error(
          `AnthropicClient module not yet available. ` +
            `Ensure ../ai/AnthropicClient is implemented before calling callAI(). ` +
            `Agent: ${this.config.agentType}, Model: ${resolvedModel}`,
        );
      }
      throw error;
    }
  }

  /**
   * Convenience method for assembling a standards-compliant {@link AgentOutput}.
   * Ensures the timestamp is set and the agent type is correct regardless of
   * what the caller provides.
   *
   * @param decision        - The primary decision string.
   * @param data            - Supporting structured data.
   * @param confidence      - Confidence assessment for the decision.
   * @param reasoning       - Human-readable explanation of the decision.
   * @param recommendations - Actionable recommendations.
   * @param warnings        - Identified risks or issues.
   * @param uncertainties   - Areas lacking sufficient data or certainty.
   * @returns A fully populated {@link AgentOutput}.
   */
  protected buildOutput(
    decision: string,
    data: Record<string, unknown>,
    confidence: AgentConfidenceScore,
    reasoning: string,
    recommendations: string[],
    warnings: string[],
    uncertainties: string[],
  ): AgentOutput {
    return {
      agentType: this.config.agentType,
      decision,
      data,
      confidence,
      reasoning,
      recommendations,
      warnings,
      uncertainties,
      timestamp: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------
  // Public accessors
  // ------------------------------------------------------------------

  /** Returns the agent type identifier. */
  public getAgentType(): AgentType {
    return this.config.agentType;
  }

  /** Returns the agent's static configuration (read-only copy). */
  public getConfig(): Readonly<AgentConfig> {
    return Object.freeze({ ...this.config });
  }

  /** Returns the unique instance identifier for this agent. */
  public getInstanceId(): string {
    return this.instanceId;
  }
}

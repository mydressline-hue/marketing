// ============================================================
// AI International Growth Engine - Agent Lifecycle Manager
// Manages agent startup, running, pausing, and error states
// ============================================================

import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import type { AgentType, AgentStatus, AgentState } from '../../types';

/**
 * Manages the lifecycle state transitions for every agent in the framework.
 *
 * State is persisted in the `agent_states` database table so that agent
 * status survives server restarts and can be queried by the dashboard,
 * orchestrator, and monitoring systems.
 *
 * Valid transitions:
 * ```
 *  idle ──> running ──> idle
 *   │         │           ▲
 *   │         ▼           │
 *   │      paused ────────┘
 *   │         │
 *   │         ▼
 *   └──── error
 * ```
 */
export class AgentLifecycle {
  /**
   * Transitions an agent to the 'running' state.
   * Updates `last_run_at` to the current timestamp.
   * If no row exists for the agent, one is created.
   *
   * @param agentType - The agent type to start.
   */
  public async startAgent(agentType: AgentType): Promise<void> {
    const now = new Date().toISOString();
    try {
      const result = await pool.query(
        `UPDATE agent_states
         SET status = 'running', last_run_at = $1, updated_at = $1
         WHERE agent_type = $2`,
        [now, agentType],
      );

      if (result.rowCount === 0) {
        // No existing row — create one
        await pool.query(
          `INSERT INTO agent_states
             (id, agent_type, status, last_run_at, config, metrics, created_at, updated_at)
           VALUES ($1, $2, 'running', $3, '{}', '{}', $3, $3)`,
          [generateId(), agentType, now],
        );
      }

      logger.info('Agent started', { agentType, status: 'running' });
    } catch (error) {
      logger.error('Failed to start agent', { agentType, error });
      throw error;
    }
  }

  /**
   * Transitions an agent to the 'idle' state.
   * Typically called after a successful processing run completes.
   *
   * @param agentType - The agent type to stop.
   */
  public async stopAgent(agentType: AgentType): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `UPDATE agent_states
         SET status = 'idle', updated_at = $1
         WHERE agent_type = $2`,
        [now, agentType],
      );
      logger.info('Agent stopped', { agentType, status: 'idle' });
    } catch (error) {
      logger.error('Failed to stop agent', { agentType, error });
      throw error;
    }
  }

  /**
   * Transitions an agent to the 'paused' state.
   * A paused agent will not be scheduled for new runs until resumed.
   *
   * @param agentType - The agent type to pause.
   */
  public async pauseAgent(agentType: AgentType): Promise<void> {
    const now = new Date().toISOString();
    try {
      await pool.query(
        `UPDATE agent_states
         SET status = 'paused', updated_at = $1
         WHERE agent_type = $2`,
        [now, agentType],
      );
      logger.info('Agent paused', { agentType, status: 'paused' });
    } catch (error) {
      logger.error('Failed to pause agent', { agentType, error });
      throw error;
    }
  }

  /**
   * Transitions an agent to the 'error' state and records the error
   * details in the metrics column for diagnostics.
   *
   * @param agentType - The agent type that encountered an error.
   * @param error     - The error that occurred (Error instance or string).
   */
  public async setError(
    agentType: AgentType,
    error: Error | string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    try {
      const result = await pool.query(
        `UPDATE agent_states
         SET status = 'error',
             metrics = metrics || $1::jsonb,
             updated_at = $2
         WHERE agent_type = $3`,
        [
          JSON.stringify({
            last_error: errorMessage,
            last_error_stack: errorStack,
            last_error_at: now,
          }),
          now,
          agentType,
        ],
      );

      if (result.rowCount === 0) {
        // No existing row — create one with the error state
        await pool.query(
          `INSERT INTO agent_states
             (id, agent_type, status, config, metrics, created_at, updated_at)
           VALUES ($1, $2, 'error', '{}', $3, $4, $4)`,
          [
            generateId(),
            agentType,
            JSON.stringify({
              last_error: errorMessage,
              last_error_stack: errorStack,
              last_error_at: now,
            }),
            now,
          ],
        );
      }

      logger.error('Agent entered error state', {
        agentType,
        error: errorMessage,
      });
    } catch (dbError) {
      logger.error('Failed to set agent error state', {
        agentType,
        originalError: errorMessage,
        dbError,
      });
      throw dbError;
    }
  }

  /**
   * Retrieves the current state of a specific agent from the database.
   *
   * @param agentType - The agent type to query.
   * @returns The agent's full state record.
   * @throws If no state record exists for the given agent type.
   */
  public async getStatus(agentType: AgentType): Promise<AgentState> {
    try {
      const result = await pool.query(
        `SELECT id, agent_type, status, last_run_at, next_run_at,
                config, metrics, created_at, updated_at
         FROM agent_states
         WHERE agent_type = $1
         LIMIT 1`,
        [agentType],
      );

      if (result.rows.length === 0) {
        // Return a default idle state if no record exists
        const now = new Date().toISOString();
        return {
          id: '',
          agent_type: agentType,
          status: 'idle' as AgentStatus,
          config: {},
          metrics: {},
          created_at: now,
          updated_at: now,
        };
      }

      return result.rows[0] as AgentState;
    } catch (error) {
      logger.error('Failed to get agent status', { agentType, error });
      throw error;
    }
  }

  /**
   * Retrieves the current state of all agents from the database.
   * Returns one row per agent that has a state record.
   *
   * @returns An array of agent state records.
   */
  public async getAllStatuses(): Promise<AgentState[]> {
    try {
      const result = await pool.query(
        `SELECT id, agent_type, status, last_run_at, next_run_at,
                config, metrics, created_at, updated_at
         FROM agent_states
         ORDER BY agent_type ASC`,
      );

      return result.rows as AgentState[];
    } catch (error) {
      logger.error('Failed to get all agent statuses', { error });
      throw error;
    }
  }

  /**
   * Schedules the next run time for an agent.
   * The orchestrator uses this to implement periodic execution schedules
   * and priority-based run ordering.
   *
   * @param agentType - The agent type to schedule.
   * @param nextRunAt - ISO-8601 timestamp for the next scheduled run.
   */
  public async scheduleNextRun(
    agentType: AgentType,
    nextRunAt: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      const result = await pool.query(
        `UPDATE agent_states
         SET next_run_at = $1, updated_at = $2
         WHERE agent_type = $3`,
        [nextRunAt, now, agentType],
      );

      if (result.rowCount === 0) {
        // No existing row — create one with the schedule
        await pool.query(
          `INSERT INTO agent_states
             (id, agent_type, status, next_run_at, config, metrics, created_at, updated_at)
           VALUES ($1, $2, 'idle', $3, '{}', '{}', $4, $4)`,
          [generateId(), agentType, nextRunAt, now],
        );
      }

      logger.info('Agent next run scheduled', { agentType, nextRunAt });
    } catch (error) {
      logger.error('Failed to schedule agent next run', {
        agentType,
        nextRunAt,
        error,
      });
      throw error;
    }
  }
}

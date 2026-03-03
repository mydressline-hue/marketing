// ============================================================
// AI International Growth Engine - Action Assigner
// Phase 3D: Master Orchestrator - Marketing Action Assignment
// ============================================================

import type { AgentType } from '../../types';
import type { DecisionMatrix } from './DecisionMatrix';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

// ---- Interfaces ----

/**
 * Priority levels for marketing actions.
 * Critical actions are executed immediately; low actions are queued.
 */
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Lifecycle status of a marketing action.
 */
export type ActionStatus = 'pending' | 'approved' | 'executing' | 'completed';

/**
 * Represents a concrete marketing action derived from an agent's
 * decision and assigned to that agent for execution.
 */
export interface MarketingAction {
  /** Unique identifier for this action */
  id: string;
  /** Category of the action (e.g. 'budget_reallocation', 'campaign_launch') */
  type: string;
  /** Human-readable description of what needs to be done */
  description: string;
  /** The agent type responsible for executing this action */
  assignedAgent: AgentType;
  /** Execution priority */
  priority: ActionPriority;
  /** Optional ISO-8601 deadline for completion */
  deadline?: string;
  /** IDs of other actions that must complete before this one can start */
  dependencies: string[];
  /** Current lifecycle status */
  status: ActionStatus;
  /** The matrix entry that produced this action */
  sourceEntryAgent: AgentType;
  /** Confidence score from the originating decision */
  confidenceScore: number;
  /** ISO-8601 timestamp of creation */
  createdAt: string;
}

// ---- Action Type Classification ----

/**
 * Maps agent types to their typical action categories.
 * Used to derive the `type` field on MarketingAction.
 */
const AGENT_ACTION_TYPES: Partial<Record<AgentType, string>> = {
  market_intelligence: 'market_research',
  country_strategy: 'strategy_update',
  paid_ads: 'campaign_management',
  organic_social: 'social_content',
  content_blog: 'content_creation',
  creative_generation: 'creative_production',
  performance_analytics: 'analytics_review',
  budget_optimization: 'budget_reallocation',
  ab_testing: 'experiment_management',
  conversion_optimization: 'conversion_action',
  shopify_integration: 'store_update',
  localization: 'localization_task',
  compliance: 'compliance_enforcement',
  competitive_intelligence: 'competitive_analysis',
  fraud_detection: 'fraud_mitigation',
  brand_consistency: 'brand_enforcement',
  data_engineering: 'data_pipeline',
  enterprise_security: 'security_action',
  revenue_forecasting: 'forecast_update',
};

const DEFAULT_ACTION_TYPE = 'general_action';

// ---- Dependency Graph Rules ----

/**
 * Defines which action types must complete before others can start.
 * Key = action type that has a dependency; Value = action types it depends on.
 */
const ACTION_DEPENDENCY_RULES: Record<string, string[]> = {
  campaign_management: ['compliance_enforcement', 'budget_reallocation'],
  social_content: ['compliance_enforcement', 'brand_enforcement'],
  content_creation: ['compliance_enforcement', 'brand_enforcement', 'localization_task'],
  creative_production: ['compliance_enforcement', 'brand_enforcement'],
  store_update: ['compliance_enforcement', 'security_action'],
  localization_task: ['brand_enforcement'],
  budget_reallocation: ['analytics_review', 'fraud_mitigation'],
  experiment_management: ['analytics_review'],
  conversion_action: ['analytics_review'],
};

// ---- Priority Mapping ----

/**
 * Converts a numeric matrix priority + confidence into an ActionPriority.
 */
function deriveActionPriority(matrixPriority: number, confidence: number): ActionPriority {
  // Critical: priority 1-2 and high confidence
  if (matrixPriority <= 2 && confidence >= 70) return 'critical';
  // High: priority 1-4 or very high confidence
  if (matrixPriority <= 4 || confidence >= 85) return 'high';
  // Medium: priority 5-7
  if (matrixPriority <= 7) return 'medium';
  // Low: everything else
  return 'low';
}

// ============================================================
// ActionAssigner
// ============================================================

export class ActionAssigner {
  // ----------------------------------------------------------
  // Action assignment
  // ----------------------------------------------------------

  /**
   * Derives a set of `MarketingAction` items from an approved decision matrix.
   *
   * Steps:
   *  1. Iterate approved entries and create an action for each.
   *  2. Classify action type from agent type.
   *  3. Compute priority from matrix priority + confidence.
   *  4. Wire up dependencies based on ACTION_DEPENDENCY_RULES.
   *
   * @param matrix - The decision matrix whose approved entries become actions.
   * @returns The complete list of marketing actions.
   */
  assignActions(matrix: DecisionMatrix): MarketingAction[] {
    logger.info('ActionAssigner: assigning actions from matrix', {
      matrixId: matrix.id,
      entries: matrix.entries.length,
    });

    const now = new Date().toISOString();

    // Phase 1: create actions (without dependencies)
    const actions: MarketingAction[] = [];
    const actionsByType = new Map<string, MarketingAction>();

    for (const entry of matrix.entries) {
      if (!entry.approved) {
        continue;
      }

      const actionType = AGENT_ACTION_TYPES[entry.agent] ?? DEFAULT_ACTION_TYPE;
      const priority = deriveActionPriority(entry.priority, entry.confidence);

      const action: MarketingAction = {
        id: generateId(),
        type: actionType,
        description: entry.action,
        assignedAgent: entry.agent,
        priority,
        dependencies: [],
        status: 'pending',
        sourceEntryAgent: entry.agent,
        confidenceScore: entry.confidence,
        createdAt: now,
      };

      actions.push(action);
      actionsByType.set(actionType, action);
    }

    // Phase 2: wire dependencies
    for (const action of actions) {
      const depTypes = ACTION_DEPENDENCY_RULES[action.type];
      if (!depTypes) continue;

      for (const depType of depTypes) {
        const depAction = actionsByType.get(depType);
        if (depAction) {
          action.dependencies.push(depAction.id);
        }
      }
    }

    logger.info('ActionAssigner: actions assigned', {
      total: actions.length,
      critical: actions.filter((a) => a.priority === 'critical').length,
      high: actions.filter((a) => a.priority === 'high').length,
      medium: actions.filter((a) => a.priority === 'medium').length,
      low: actions.filter((a) => a.priority === 'low').length,
    });

    return actions;
  }

  // ----------------------------------------------------------
  // Prioritisation
  // ----------------------------------------------------------

  /**
   * Sorts actions by priority (critical > high > medium > low)
   * and then by confidence descending within each priority tier.
   */
  prioritizeActions(actions: MarketingAction[]): MarketingAction[] {
    const priorityOrder: Record<ActionPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...actions].sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.confidenceScore - a.confidenceScore;
    });
  }

  // ----------------------------------------------------------
  // Dependency checking
  // ----------------------------------------------------------

  /**
   * Checks whether a single action's dependencies have all been
   * satisfied (status === 'completed').
   *
   * @param action     - The action to check.
   * @param allActions - The full set of actions to resolve dependency IDs against.
   * @returns `true` if all dependencies are completed or the action has none.
   */
  checkDependencies(action: MarketingAction, allActions: MarketingAction[]): boolean {
    if (action.dependencies.length === 0) {
      return true;
    }

    const actionMap = new Map(allActions.map((a) => [a.id, a]));

    for (const depId of action.dependencies) {
      const dep = actionMap.get(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns only those actions that are ready to execute:
   * - Status is 'pending' or 'approved'
   * - All dependencies are 'completed'
   *
   * Results are sorted by priority.
   */
  getExecutableActions(actions: MarketingAction[]): MarketingAction[] {
    const executable = actions.filter((action) => {
      if (action.status !== 'pending' && action.status !== 'approved') {
        return false;
      }
      return this.checkDependencies(action, actions);
    });

    return this.prioritizeActions(executable);
  }

  // ----------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------

  /**
   * Persists an array of marketing actions to the database.
   * Uses a single transaction to ensure atomicity.
   */
  async persistActions(actions: MarketingAction[]): Promise<void> {
    if (actions.length === 0) {
      logger.debug('ActionAssigner: no actions to persist');
      return;
    }

    logger.info('ActionAssigner: persisting actions', { count: actions.length });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const action of actions) {
        await client.query(
          `INSERT INTO marketing_actions
             (id, type, description, assigned_agent, priority, deadline,
              dependencies, status, source_entry_agent, confidence_score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE
           SET status = EXCLUDED.status,
               priority = EXCLUDED.priority,
               description = EXCLUDED.description`,
          [
            action.id,
            action.type,
            action.description,
            action.assignedAgent,
            action.priority,
            action.deadline ?? null,
            JSON.stringify(action.dependencies),
            action.status,
            action.sourceEntryAgent,
            action.confidenceScore,
            action.createdAt,
          ],
        );
      }

      await client.query('COMMIT');

      logger.info('ActionAssigner: actions persisted successfully', {
        count: actions.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      logger.error('ActionAssigner: failed to persist actions', { error: message });
      throw error;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------------
  // Query helpers
  // ----------------------------------------------------------

  /**
   * Loads all actions for a given matrix's request ID from the database.
   */
  async loadActionsByRequestId(requestId: string): Promise<MarketingAction[]> {
    const result = await pool.query(
      `SELECT ma.*
       FROM marketing_actions ma
       INNER JOIN decision_matrices dm ON dm.request_id = $1
       WHERE ma.created_at >= dm.created_at
       ORDER BY ma.created_at DESC`,
      [requestId],
    );

    return result.rows.map((row) => this.rowToAction(row));
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private rowToAction(row: Record<string, unknown>): MarketingAction {
    return {
      id: row.id as string,
      type: row.type as string,
      description: row.description as string,
      assignedAgent: row.assigned_agent as AgentType,
      priority: row.priority as ActionPriority,
      deadline: (row.deadline as string) ?? undefined,
      dependencies:
        typeof row.dependencies === 'string'
          ? JSON.parse(row.dependencies)
          : (row.dependencies as string[]) ?? [],
      status: row.status as ActionStatus,
      sourceEntryAgent: row.source_entry_agent as AgentType,
      confidenceScore: parseFloat(row.confidence_score as string),
      createdAt: row.created_at as string,
    };
  }
}

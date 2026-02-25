// ============================================================
// AI International Growth Engine - Decision Matrix
// Phase 3D: Master Orchestrator - Decision Matrix Generation
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

// ---- Interfaces ----

/**
 * A single row in the decision matrix representing one agent's
 * decision, its confidence, approval status, assigned action,
 * and execution priority.
 */
export interface DecisionMatrixEntry {
  /** Which agent produced this entry */
  agent: AgentType;
  /** The primary decision or recommendation text */
  decision: string;
  /** Numeric confidence score (0-100) */
  confidence: number;
  /** Whether the decision has been approved for execution */
  approved: boolean;
  /** The concrete marketing action derived from this decision */
  action: string;
  /** Execution priority (1 = highest) */
  priority: number;
}

/**
 * The complete decision matrix produced by the orchestrator.
 * Contains every agent's entry, an overall confidence metric,
 * and metadata about generation.
 */
export interface DecisionMatrix {
  /** Unique identifier for this matrix instance */
  id: string;
  /** Individual agent decision entries */
  entries: DecisionMatrixEntry[];
  /** Weighted-average confidence across all entries */
  overallConfidence: number;
  /** ISO-8601 timestamp of generation */
  timestamp: string;
  /** Identifier of the system/agent that produced this matrix */
  generatedBy: string;
  /** The request ID that triggered generation */
  requestId: string;
}

// ---- Cache key ----
const MATRIX_CACHE_KEY = 'orchestrator:decision_matrix:latest';
const MATRIX_CACHE_TTL_SECONDS = 300; // 5 minutes

// ---- Priority Mapping ----

/**
 * Base priority weights by agent type.  Lower values = higher priority.
 * Compliance and security agents get highest priority because their
 * decisions can block other actions.
 */
const AGENT_PRIORITY_WEIGHTS: Partial<Record<AgentType, number>> = {
  compliance: 1,
  enterprise_security: 1,
  fraud_detection: 2,
  brand_consistency: 3,
  budget_optimization: 4,
  revenue_forecasting: 4,
  performance_analytics: 5,
  conversion_optimization: 5,
  market_intelligence: 6,
  country_strategy: 6,
  competitive_intelligence: 6,
  paid_ads: 7,
  organic_social: 7,
  content_blog: 8,
  creative_generation: 8,
  ab_testing: 8,
  shopify_integration: 9,
  localization: 9,
  data_engineering: 10,
};

const DEFAULT_PRIORITY_WEIGHT = 10;

/** Confidence threshold below which a decision is NOT auto-approved */
const AUTO_APPROVAL_THRESHOLD = 65;

// ============================================================
// DecisionMatrixGenerator
// ============================================================

export class DecisionMatrixGenerator {
  // ----------------------------------------------------------
  // Matrix generation
  // ----------------------------------------------------------

  /**
   * Builds a `DecisionMatrix` from the collected agent outputs.
   *
   * For each agent output the generator:
   *  1. Derives the action text from the decision + recommendations.
   *  2. Computes priority from a combination of agent weight and confidence.
   *  3. Determines auto-approval based on the confidence threshold.
   *
   * @param outputs   - Map of agent type to its latest output.
   * @param requestId - The orchestration request ID.
   * @returns A fully populated DecisionMatrix.
   */
  generateMatrix(
    outputs: Map<AgentType, AgentOutput>,
    requestId: string,
  ): DecisionMatrix {
    logger.info('DecisionMatrix: generating matrix', {
      agentCount: outputs.size,
      requestId,
    });

    const entries: DecisionMatrixEntry[] = [];

    for (const [agentType, output] of outputs) {
      const baseWeight = AGENT_PRIORITY_WEIGHTS[agentType] ?? DEFAULT_PRIORITY_WEIGHT;
      // Priority is inversely proportional to confidence: higher confidence = lower (better) priority number
      const adjustedPriority = Math.max(
        1,
        Math.round(baseWeight * (1 - output.confidence.score / 200)),
      );

      const action = this.deriveAction(output);
      const approved = output.confidence.score >= AUTO_APPROVAL_THRESHOLD;

      entries.push({
        agent: agentType,
        decision: output.decision,
        confidence: output.confidence.score,
        approved,
        action,
        priority: adjustedPriority,
      });
    }

    const overallConfidence = this.computeOverallConfidence(entries);

    const matrix: DecisionMatrix = {
      id: generateId(),
      entries,
      overallConfidence,
      timestamp: new Date().toISOString(),
      generatedBy: 'master_orchestrator',
      requestId,
    };

    logger.info('DecisionMatrix: matrix generated', {
      entryCount: entries.length,
      overallConfidence: matrix.overallConfidence,
      approvedCount: entries.filter((e) => e.approved).length,
    });

    return matrix;
  }

  // ----------------------------------------------------------
  // Prioritisation
  // ----------------------------------------------------------

  /**
   * Returns a copy of the matrix with entries sorted by an effective
   * score: `confidence * (1 / priority)`.  Entries with higher confidence
   * and lower (better) priority numbers float to the top.
   */
  prioritizeDecisions(matrix: DecisionMatrix): DecisionMatrix {
    const sorted = [...matrix.entries].sort((a, b) => {
      const scoreA = a.confidence * (1 / a.priority);
      const scoreB = b.confidence * (1 / b.priority);
      return scoreB - scoreA;
    });

    return { ...matrix, entries: sorted };
  }

  // ----------------------------------------------------------
  // Filtering
  // ----------------------------------------------------------

  /**
   * Returns only the entries that have been approved for execution.
   */
  getApprovedActions(matrix: DecisionMatrix): DecisionMatrixEntry[] {
    return matrix.entries.filter((e) => e.approved);
  }

  /**
   * Returns entries that were NOT approved, ordered by confidence
   * descending (closest to the threshold first).
   */
  getPendingReview(matrix: DecisionMatrix): DecisionMatrixEntry[] {
    return matrix.entries
      .filter((e) => !e.approved)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // ----------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------

  /**
   * Persists the decision matrix to the database and writes a
   * cached copy to Redis for fast retrieval.
   */
  async persistMatrix(matrix: DecisionMatrix): Promise<void> {
    logger.info('DecisionMatrix: persisting matrix', { id: matrix.id });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Persist main matrix record
      await client.query(
        `INSERT INTO decision_matrices (id, overall_confidence, generated_by, request_id, entries, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET overall_confidence = EXCLUDED.overall_confidence,
             entries = EXCLUDED.entries,
             created_at = EXCLUDED.created_at`,
        [
          matrix.id,
          matrix.overallConfidence,
          matrix.generatedBy,
          matrix.requestId,
          JSON.stringify(matrix.entries),
          matrix.timestamp,
        ],
      );

      // Persist individual entries for queryability
      for (const entry of matrix.entries) {
        await client.query(
          `INSERT INTO decision_matrix_entries
             (id, matrix_id, agent_type, decision, confidence, approved, action, priority, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            generateId(),
            matrix.id,
            entry.agent,
            entry.decision,
            entry.confidence,
            entry.approved,
            entry.action,
            entry.priority,
            matrix.timestamp,
          ],
        );
      }

      await client.query('COMMIT');

      // Update cache
      await cacheSet(MATRIX_CACHE_KEY, matrix, MATRIX_CACHE_TTL_SECONDS);

      logger.info('DecisionMatrix: matrix persisted successfully', {
        id: matrix.id,
        entries: matrix.entries.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : String(error);
      logger.error('DecisionMatrix: failed to persist matrix', {
        id: matrix.id,
        error: message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Loads the most recent decision matrix, checking the Redis cache
   * first and falling back to the database.
   */
  async getLatestMatrix(): Promise<DecisionMatrix | null> {
    // Try cache first
    const cached = await cacheGet<DecisionMatrix>(MATRIX_CACHE_KEY);
    if (cached) {
      logger.debug('DecisionMatrix: loaded latest matrix from cache', {
        id: cached.id,
      });
      return cached;
    }

    // Fall back to database
    const result = await pool.query(
      `SELECT id, overall_confidence, generated_by, request_id, entries, created_at
       FROM decision_matrices
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    if (result.rows.length === 0) {
      logger.debug('DecisionMatrix: no matrix found in database');
      return null;
    }

    const row = result.rows[0];
    const matrix: DecisionMatrix = {
      id: row.id,
      entries: typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries,
      overallConfidence: parseFloat(row.overall_confidence),
      timestamp: row.created_at,
      generatedBy: row.generated_by,
      requestId: row.request_id,
    };

    // Warm the cache
    await cacheSet(MATRIX_CACHE_KEY, matrix, MATRIX_CACHE_TTL_SECONDS);

    logger.debug('DecisionMatrix: loaded latest matrix from database', {
      id: matrix.id,
    });

    return matrix;
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  /**
   * Derives a concise action string from an agent's output.
   * Prefers the first recommendation if available; otherwise
   * uses a truncated form of the decision itself.
   */
  private deriveAction(output: AgentOutput): string {
    if (output.recommendations.length > 0) {
      return output.recommendations[0];
    }

    // Truncate long decisions to a manageable action description
    const maxLength = 200;
    if (output.decision.length > maxLength) {
      return output.decision.substring(0, maxLength) + '...';
    }
    return output.decision;
  }

  /**
   * Computes a weighted-average overall confidence.
   * Higher-priority (lower number) entries contribute more.
   */
  private computeOverallConfidence(entries: DecisionMatrixEntry[]): number {
    if (entries.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const entry of entries) {
      // Invert priority so priority=1 has weight=10, priority=10 has weight=1
      const weight = Math.max(1, 11 - entry.priority);
      weightedSum += entry.confidence * weight;
      totalWeight += weight;
    }

    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }
}

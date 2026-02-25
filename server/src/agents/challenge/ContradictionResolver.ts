// ============================================================
// AI International Growth Engine - Contradiction Resolver
// Resolves inconsistencies between agent decisions using
// confidence-based, data-backed, and manual-review methods.
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';
import type {
  Inconsistency,
  ContradictionResolution,
  ResolutionMethod,
  ContradictionResolutionRow,
} from './types';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

/**
 * Confidence score threshold below which automatic resolution
 * is not trustworthy and manual review is required.
 */
const MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 40;

/**
 * Minimum difference in confidence scores between two agents
 * required to declare one a winner via confidence-based resolution.
 * If the gap is smaller, the decision is too close to call automatically.
 */
const CONFIDENCE_WINNER_MIN_GAP = 10;

/**
 * Data evidence keys that carry high weight in data-backed resolution.
 * When an agent's output contains these keys with substantive values,
 * its position is given more credibility.
 */
const HIGH_WEIGHT_EVIDENCE_KEYS = [
  'data_sources',
  'dataSources',
  'sample_size',
  'sampleSize',
  'historical_data',
  'historicalData',
  'external_validation',
  'externalValidation',
  'statistical_significance',
  'statisticalSignificance',
  'source_count',
  'sourceCount',
];

// ---- ContradictionResolver Class ----

/**
 * Resolves inconsistencies and contradictions detected between agent outputs.
 *
 * Provides three resolution strategies:
 * 1. **Confidence-based** - The agent with the higher confidence score wins,
 *    provided the gap is large enough to be meaningful.
 * 2. **Data-backed** - The agent with stronger data evidence (more sources,
 *    larger samples, external validation) wins.
 * 3. **Manual review** - When neither automatic method can produce a clear
 *    winner, the inconsistency is flagged for human review.
 *
 * The resolver also applies resolutions back to the output map, updating
 * the losing agent's output to reflect the winning position.
 *
 * @example
 * ```typescript
 * const resolver = new ContradictionResolver();
 * const resolution = resolver.resolveContradiction(inconsistency, outputs);
 * const updatedOutputs = resolver.applyResolution(resolution, outputs);
 * ```
 */
export class ContradictionResolver {
  /**
   * Resolves a single inconsistency by attempting resolution methods in order:
   * 1. Data-backed resolution (preferred - decisions should be evidence-driven)
   * 2. Confidence-based resolution (fallback - trust the more confident agent)
   * 3. Manual review (last resort - humans must decide)
   *
   * @param inconsistency - The inconsistency to resolve
   * @param outputs - Map of all agent outputs for context
   * @returns A ContradictionResolution describing the outcome
   */
  resolveContradiction(
    inconsistency: Inconsistency,
    outputs: Map<AgentType, AgentOutput>,
  ): ContradictionResolution {
    logger.info('Resolving contradiction', {
      agents: inconsistency.agents,
      area: inconsistency.area,
      severity: inconsistency.severity,
    });

    // For critical severity, attempt data-backed resolution first
    if (inconsistency.severity === 'critical') {
      const dataResolution = this.resolveByDataEvidence(inconsistency, outputs);
      if (dataResolution.method === 'data_backed') {
        logger.info('Resolved critical inconsistency via data evidence', {
          area: inconsistency.area,
          winningAgent: dataResolution.winningAgent,
        });
        return dataResolution;
      }
    }

    // Attempt confidence-based resolution
    const confidenceResolution = this.resolveByConfidence(inconsistency, outputs);
    if (confidenceResolution.method === 'confidence_based') {
      logger.info('Resolved inconsistency via confidence comparison', {
        area: inconsistency.area,
        winningAgent: confidenceResolution.winningAgent,
      });
      return confidenceResolution;
    }

    // Attempt data-backed resolution for non-critical (if not already tried)
    if (inconsistency.severity !== 'critical') {
      const dataResolution = this.resolveByDataEvidence(inconsistency, outputs);
      if (dataResolution.method === 'data_backed') {
        logger.info('Resolved inconsistency via data evidence', {
          area: inconsistency.area,
          winningAgent: dataResolution.winningAgent,
        });
        return dataResolution;
      }
    }

    // Fall back to manual review
    logger.warn('Inconsistency requires manual review', {
      area: inconsistency.area,
      agents: inconsistency.agents,
    });
    return this.flagForManualReview(inconsistency);
  }

  /**
   * Resolves a contradiction by comparing the confidence scores of the
   * involved agents. The agent with the higher confidence wins, but only
   * if the gap between scores exceeds the minimum threshold.
   *
   * @param inconsistency - The inconsistency to resolve
   * @param outputs - Map of all agent outputs
   * @returns A ContradictionResolution; method will be 'manual_review' if
   *          confidence scores are too close to determine a winner
   */
  resolveByConfidence(
    inconsistency: Inconsistency,
    outputs: Map<AgentType, AgentOutput>,
  ): ContradictionResolution {
    const agentConfidences: Array<{ agent: AgentType; score: number }> = [];

    for (const agent of inconsistency.agents) {
      const output = outputs.get(agent);
      if (output && output.confidence) {
        agentConfidences.push({
          agent,
          score: output.confidence.score,
        });
      }
    }

    // Not enough data to compare
    if (agentConfidences.length < 2) {
      return this.flagForManualReview(inconsistency);
    }

    // Sort by confidence score descending
    agentConfidences.sort((a, b) => b.score - a.score);

    const highest = agentConfidences[0];
    const secondHighest = agentConfidences[1];

    // Check if both are below the manual review threshold
    if (highest.score < MANUAL_REVIEW_CONFIDENCE_THRESHOLD) {
      return {
        inconsistency,
        resolution: `All involved agents have confidence below ${MANUAL_REVIEW_CONFIDENCE_THRESHOLD}; automatic resolution not trustworthy`,
        method: 'manual_review',
        reasoning: `Highest confidence is ${highest.score} (${highest.agent}), which is below the auto-resolve threshold of ${MANUAL_REVIEW_CONFIDENCE_THRESHOLD}`,
      };
    }

    // Check if the gap is large enough to declare a winner
    const gap = highest.score - secondHighest.score;
    if (gap < CONFIDENCE_WINNER_MIN_GAP) {
      return {
        inconsistency,
        resolution: `Confidence scores are too close to determine a clear winner (gap: ${gap})`,
        method: 'manual_review',
        reasoning: `${highest.agent} (${highest.score}) vs ${secondHighest.agent} (${secondHighest.score}); gap of ${gap} is below minimum threshold of ${CONFIDENCE_WINNER_MIN_GAP}`,
      };
    }

    return {
      inconsistency,
      resolution: `Accepted position of ${highest.agent} based on higher confidence score`,
      method: 'confidence_based',
      winningAgent: highest.agent,
      reasoning: `${highest.agent} has confidence ${highest.score} vs ${secondHighest.agent} at ${secondHighest.score} (gap: ${gap}). The ${gap}-point advantage exceeds the minimum threshold of ${CONFIDENCE_WINNER_MIN_GAP}.`,
    };
  }

  /**
   * Flags an inconsistency for manual human review.
   *
   * Used when automatic resolution methods cannot produce a clear winner.
   * The resolution includes detailed context about why automatic resolution
   * failed, helping reviewers make an informed decision.
   *
   * @param inconsistency - The inconsistency to flag
   * @returns A ContradictionResolution with method 'manual_review'
   */
  flagForManualReview(inconsistency: Inconsistency): ContradictionResolution {
    const agentList = inconsistency.agents.join(', ');

    return {
      inconsistency,
      resolution: `Flagged for manual review: inconsistency between [${agentList}] in area "${inconsistency.area}" could not be automatically resolved`,
      method: 'manual_review',
      reasoning: `Automatic resolution methods (confidence-based and data-backed) could not determine a clear winner. Severity: ${inconsistency.severity}. Description: ${inconsistency.description}. A human reviewer should examine the conflicting values and determine the correct position.`,
    };
  }

  /**
   * Resolves a contradiction by evaluating the data evidence backing each
   * agent's position. Agents with more data sources, larger sample sizes,
   * or external validation are favoured.
   *
   * @param inconsistency - The inconsistency to resolve
   * @param outputs - Map of all agent outputs
   * @returns A ContradictionResolution; method will be 'manual_review' if
   *          evidence strength is too similar between agents
   */
  resolveByDataEvidence(
    inconsistency: Inconsistency,
    outputs: Map<AgentType, AgentOutput>,
  ): ContradictionResolution {
    const agentEvidence: Array<{ agent: AgentType; evidenceScore: number; details: string[] }> = [];

    for (const agent of inconsistency.agents) {
      const output = outputs.get(agent);
      if (!output) {
        continue;
      }

      const { score, details } = this.calculateEvidenceScore(output);
      agentEvidence.push({ agent, evidenceScore: score, details });
    }

    if (agentEvidence.length < 2) {
      return this.flagForManualReview(inconsistency);
    }

    // Sort by evidence score descending
    agentEvidence.sort((a, b) => b.evidenceScore - a.evidenceScore);

    const strongest = agentEvidence[0];
    const secondStrongest = agentEvidence[1];

    // Evidence scores must have a meaningful gap
    const evidenceGap = strongest.evidenceScore - secondStrongest.evidenceScore;
    if (evidenceGap < 2) {
      return {
        inconsistency,
        resolution: `Data evidence is too similar between agents to determine a winner`,
        method: 'manual_review',
        reasoning: `${strongest.agent} evidence score: ${strongest.evidenceScore} (${strongest.details.join(', ')}). ${secondStrongest.agent} evidence score: ${secondStrongest.evidenceScore} (${secondStrongest.details.join(', ')}). Gap of ${evidenceGap} is insufficient for automatic resolution.`,
      };
    }

    return {
      inconsistency,
      resolution: `Accepted position of ${strongest.agent} based on stronger data evidence`,
      method: 'data_backed',
      winningAgent: strongest.agent,
      reasoning: `${strongest.agent} has evidence score ${strongest.evidenceScore} (${strongest.details.join(', ')}) vs ${secondStrongest.agent} at ${secondStrongest.evidenceScore} (${secondStrongest.details.join(', ')}). The stronger data backing supports ${strongest.agent}'s position.`,
    };
  }

  /**
   * Applies a contradiction resolution by updating the losing agent's output.
   *
   * When a resolution has a winning agent, the losing agent's output is
   * annotated with a warning indicating that its position on the contested
   * area was overridden. The actual data values are not modified (to preserve
   * audit trail), but the warnings array is updated.
   *
   * @param resolution - The resolution to apply
   * @param outputs - The current map of agent outputs
   * @returns A new map with the resolution applied
   */
  applyResolution(
    resolution: ContradictionResolution,
    outputs: Map<AgentType, AgentOutput>,
  ): Map<AgentType, AgentOutput> {
    const updatedOutputs = new Map(outputs);

    if (!resolution.winningAgent) {
      // Manual review - annotate all involved agents
      for (const agent of resolution.inconsistency.agents) {
        const output = updatedOutputs.get(agent);
        if (output) {
          const updatedOutput: AgentOutput = {
            ...output,
            warnings: [
              ...output.warnings,
              `[PENDING REVIEW] Inconsistency in "${resolution.inconsistency.area}": ${resolution.resolution}`,
            ],
          };
          updatedOutputs.set(agent, updatedOutput);
        }
      }
    } else {
      // Apply winning agent's position - annotate losing agents
      const losingAgents = resolution.inconsistency.agents.filter(
        (a) => a !== resolution.winningAgent,
      );

      for (const loserAgent of losingAgents) {
        const output = updatedOutputs.get(loserAgent);
        if (output) {
          const updatedOutput: AgentOutput = {
            ...output,
            warnings: [
              ...output.warnings,
              `[OVERRIDDEN] Position on "${resolution.inconsistency.area}" superseded by ${resolution.winningAgent} (${resolution.method}): ${resolution.reasoning}`,
            ],
          };
          updatedOutputs.set(loserAgent, updatedOutput);
        }
      }

      logger.info('Resolution applied', {
        area: resolution.inconsistency.area,
        winningAgent: resolution.winningAgent,
        losingAgents,
        method: resolution.method,
      });
    }

    return updatedOutputs;
  }

  /**
   * Persists a contradiction resolution to the database for audit purposes.
   *
   * @param resolution - The resolution to persist
   */
  async persistResolution(resolution: ContradictionResolution): Promise<void> {
    const id = generateId();

    try {
      await pool.query<ContradictionResolutionRow>(
        `INSERT INTO contradiction_resolutions (id, inconsistency_json, resolution, method, winning_agent, reasoning, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          JSON.stringify(resolution.inconsistency),
          resolution.resolution,
          resolution.method,
          resolution.winningAgent ?? null,
          resolution.reasoning,
          new Date().toISOString(),
        ],
      );

      logger.info('Contradiction resolution persisted', {
        id,
        method: resolution.method,
        winningAgent: resolution.winningAgent,
      });
    } catch (err) {
      logger.error('Failed to persist contradiction resolution', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ---- Private Helper Methods ----

  /**
   * Calculates an evidence score for an agent's output based on
   * the presence and quality of data-backing indicators.
   *
   * @param output - The agent output to evaluate
   * @returns An object with the numeric score and human-readable details
   */
  private calculateEvidenceScore(
    output: AgentOutput,
  ): { score: number; details: string[] } {
    let score = 0;
    const details: string[] = [];

    if (!output.data) {
      return { score: 0, details: ['no data provided'] };
    }

    // Check for high-weight evidence keys
    for (const key of HIGH_WEIGHT_EVIDENCE_KEYS) {
      const value = this.deepExtractValue(output.data, key);
      if (value !== undefined && value !== null) {
        if (Array.isArray(value) && value.length > 0) {
          score += 3;
          details.push(`${key}: ${value.length} items`);
        } else if (typeof value === 'number' && value > 0) {
          score += 3;
          details.push(`${key}: ${value}`);
        } else if (typeof value === 'string' && value.length > 0) {
          score += 2;
          details.push(`${key}: present`);
        } else if (typeof value === 'boolean' && value) {
          score += 2;
          details.push(`${key}: true`);
        }
      }
    }

    // Data richness: more keys = more evidence
    const dataKeyCount = Object.keys(output.data).length;
    if (dataKeyCount > 10) {
      score += 3;
      details.push(`rich data: ${dataKeyCount} fields`);
    } else if (dataKeyCount > 5) {
      score += 2;
      details.push(`moderate data: ${dataKeyCount} fields`);
    } else if (dataKeyCount > 0) {
      score += 1;
      details.push(`sparse data: ${dataKeyCount} fields`);
    }

    // Reasoning depth
    if (output.reasoning && output.reasoning.length > 500) {
      score += 2;
      details.push('detailed reasoning');
    } else if (output.reasoning && output.reasoning.length > 200) {
      score += 1;
      details.push('moderate reasoning');
    }

    // Recommendations indicate thorough analysis
    if (output.recommendations && output.recommendations.length > 3) {
      score += 1;
      details.push(`${output.recommendations.length} recommendations`);
    }

    if (details.length === 0) {
      details.push('minimal evidence');
    }

    return { score, details };
  }

  /**
   * Extracts a value from a data object, searching both top-level
   * and one level of nesting. Supports normalized key matching.
   */
  private deepExtractValue(data: Record<string, unknown>, key: string): unknown {
    if (!data) {
      return undefined;
    }

    // Direct match
    if (key in data) {
      return data[key];
    }

    // Normalized match
    const normalizedKey = key.toLowerCase().replace(/_/g, '');
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase().replace(/_/g, '') === normalizedKey) {
        return v;
      }
    }

    // One level deep
    for (const v of Object.values(data)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const nested = v as Record<string, unknown>;
        if (key in nested) {
          return nested[key];
        }
        for (const [nk, nv] of Object.entries(nested)) {
          if (nk.toLowerCase().replace(/_/g, '') === normalizedKey) {
            return nv;
          }
        }
      }
    }

    return undefined;
  }
}

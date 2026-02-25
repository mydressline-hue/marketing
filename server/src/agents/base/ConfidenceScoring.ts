// ============================================================
// AI International Growth Engine - Confidence Scoring Utilities
// Shared confidence calculation and comparison functions
// ============================================================

import type { AgentConfidenceScore, ConfidenceLevelLabel } from './types';

/**
 * Maps a numeric confidence score (0-100) to a categorical level.
 *
 * | Range   | Level     |
 * |---------|-----------|
 * | 0-39    | low       |
 * | 40-59   | medium    |
 * | 60-79   | high      |
 * | 80-100  | very_high |
 *
 * @param score - A numeric score in the range [0, 100].
 * @returns The corresponding confidence level label.
 */
export function getConfidenceLevel(score: number): ConfidenceLevelLabel {
  if (score < 40) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'very_high';
}

/**
 * Calculates a weighted confidence score from a set of named factors.
 *
 * Each factor's contribution is scaled by its corresponding weight.
 * If no weights are provided, all factors are weighted equally (weight = 1).
 * Factors without a matching weight entry are assigned a default weight of 1.
 *
 * The final score is clamped to the range [0, 100].
 *
 * @param factors - A record mapping factor names to their raw scores (each 0-100).
 * @param weights - An optional record mapping factor names to their relative weights.
 *                  Higher weights increase a factor's influence on the overall score.
 * @returns A fully populated {@link AgentConfidenceScore}.
 *
 * @example
 * ```ts
 * const score = calculateWeightedConfidence(
 *   { data_quality: 85, sample_size: 60, recency: 90 },
 *   { data_quality: 2, sample_size: 1, recency: 1.5 },
 * );
 * // score.score ≈ 80.56 (weighted average), score.level = 'very_high'
 * ```
 */
export function calculateWeightedConfidence(
  factors: Record<string, number>,
  weights?: Record<string, number>,
): AgentConfidenceScore {
  const entries = Object.entries(factors);

  if (entries.length === 0) {
    return { score: 0, level: 'low', factors };
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [name, value] of entries) {
    const weight = weights?.[name] ?? 1;
    const clampedValue = Math.max(0, Math.min(100, value));
    weightedSum += clampedValue * weight;
    totalWeight += weight;
  }

  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));
  const level = getConfidenceLevel(score);

  return { score, level, factors };
}

/**
 * Determines whether a confidence score meets or exceeds a required threshold.
 *
 * @param score     - The confidence score to evaluate.
 * @param threshold - The minimum acceptable score (0-100).
 * @returns `true` if the score meets or exceeds the threshold.
 */
export function meetsThreshold(
  score: AgentConfidenceScore,
  threshold: number,
): boolean {
  return score.score >= threshold;
}

/**
 * Aggregates multiple confidence scores into a single summary score.
 *
 * The aggregated score is the arithmetic mean of the individual scores.
 * The factors map merges all input factors; when two scores contain the
 * same factor name the later value overwrites the earlier one.
 *
 * @param scores - An array of confidence scores to aggregate.
 * @returns A single {@link AgentConfidenceScore} representing the aggregate.
 * @throws If the input array is empty.
 */
export function aggregateConfidences(
  scores: AgentConfidenceScore[],
): AgentConfidenceScore {
  if (scores.length === 0) {
    return { score: 0, level: 'low', factors: {} };
  }

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const avgScore = Math.round((totalScore / scores.length) * 100) / 100;
  const clampedScore = Math.max(0, Math.min(100, avgScore));

  // Merge all factor maps; later entries overwrite earlier ones for
  // duplicate keys. Prefix factor names with an index to preserve provenance
  // when detailed traceability is needed.
  const mergedFactors: Record<string, number> = {};
  for (let i = 0; i < scores.length; i++) {
    for (const [key, value] of Object.entries(scores[i].factors)) {
      // If key already exists, average the values rather than overwriting
      if (key in mergedFactors) {
        mergedFactors[key] = (mergedFactors[key] + value) / 2;
      } else {
        mergedFactors[key] = value;
      }
    }
  }

  return {
    score: clampedScore,
    level: getConfidenceLevel(clampedScore),
    factors: mergedFactors,
  };
}

/**
 * Comparator function for sorting confidence scores.
 * Returns a negative number if `a` is less confident than `b`,
 * a positive number if `a` is more confident, and zero if equal.
 *
 * Suitable for use with `Array.prototype.sort()`.
 *
 * @param a - The first confidence score.
 * @param b - The second confidence score.
 * @returns The numeric difference `a.score - b.score`.
 *
 * @example
 * ```ts
 * const sorted = scores.sort(compareConfidences); // ascending
 * const descending = scores.sort((a, b) => compareConfidences(b, a));
 * ```
 */
export function compareConfidences(
  a: AgentConfidenceScore,
  b: AgentConfidenceScore,
): number {
  return a.score - b.score;
}

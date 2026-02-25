// ============================================================
// AI International Growth Engine - Agent Aggregator
// Phase 3D: Master Orchestrator - Agent Output Aggregation
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput, AgentConfidenceScore } from '../base/types';
import { logger } from '../../utils/logger';

// ---- Aggregated Result Interfaces ----

/**
 * A detected conflict between two or more agents whose outputs
 * contradict each other in a specific area.
 */
export interface AgentConflict {
  /** The agents whose outputs are in tension */
  agents: AgentType[];
  /** The domain or topic area where the conflict exists */
  area: string;
  /** Human-readable description of the conflict */
  conflict: string;
}

/**
 * The result of aggregating all agent outputs into a single summary.
 * Provides high-level statistics, merged recommendations/warnings,
 * and any detected contradictions across agents.
 */
export interface AggregatedResult {
  /** Total number of agents expected in the system (excluding orchestrator) */
  totalAgents: number;
  /** Number of agents that actually produced an output for this cycle */
  responding: number;
  /** Mean confidence score (0-100) across all responding agents */
  averageConfidence: number;
  /** The agent with the highest confidence score */
  highestConfidence: AgentType;
  /** The agent with the lowest confidence score */
  lowestConfidence: AgentType;
  /** Merged set of unique recommendations from all agents */
  recommendations: string[];
  /** Merged set of unique warnings from all agents */
  warnings: string[];
  /** Merged set of unique uncertainties from all agents */
  uncertainties: string[];
  /** Textual descriptions of contradictions detected across agents */
  contradictions: string[];
  /** Structured conflict objects for programmatic use */
  conflicts: AgentConflict[];
}

/**
 * Agents categorised by their functional domain.
 * Used for grouped analysis and reporting.
 */
export interface CategorisedOutputs {
  strategy: AgentOutput[];
  execution: AgentOutput[];
  analytics: AgentOutput[];
  compliance: AgentOutput[];
}

// ---- Category Mapping ----

const STRATEGY_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>([
  'market_intelligence',
  'country_strategy',
  'competitive_intelligence',
  'revenue_forecasting',
]);

const EXECUTION_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>([
  'paid_ads',
  'organic_social',
  'content_blog',
  'creative_generation',
  'shopify_integration',
  'localization',
  'ab_testing',
]);

const ANALYTICS_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>([
  'performance_analytics',
  'budget_optimization',
  'conversion_optimization',
  'data_engineering',
  'fraud_detection',
]);

const COMPLIANCE_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>([
  'compliance',
  'brand_consistency',
  'enterprise_security',
]);

/** Total non-orchestrator agents in the system */
const TOTAL_AGENTS = 19;

// ---- Contradiction Detection Pairs ----

/**
 * Defines pairs of agents and the keywords / areas where their outputs
 * are likely to conflict.  Used by `identifyConflicts` to surface
 * actionable contradictions rather than relying solely on AI inference.
 */
interface ConflictCheckRule {
  agentA: AgentType;
  agentB: AgentType;
  area: string;
  /** Keywords that, when present in both agents' decisions, suggest a potential conflict */
  conflictKeywords: string[];
}

const CONFLICT_RULES: ConflictCheckRule[] = [
  {
    agentA: 'budget_optimization',
    agentB: 'paid_ads',
    area: 'budget_allocation',
    conflictKeywords: ['increase', 'decrease', 'reduce', 'expand', 'cut'],
  },
  {
    agentA: 'budget_optimization',
    agentB: 'revenue_forecasting',
    area: 'spend_projection',
    conflictKeywords: ['conservative', 'aggressive', 'risk', 'growth'],
  },
  {
    agentA: 'compliance',
    agentB: 'creative_generation',
    area: 'content_compliance',
    conflictKeywords: ['restrict', 'block', 'approve', 'allow', 'prohibit'],
  },
  {
    agentA: 'compliance',
    agentB: 'paid_ads',
    area: 'ad_compliance',
    conflictKeywords: ['restrict', 'block', 'target', 'audience', 'prohibit'],
  },
  {
    agentA: 'brand_consistency',
    agentB: 'localization',
    area: 'brand_localization',
    conflictKeywords: ['adapt', 'preserve', 'modify', 'maintain', 'change'],
  },
  {
    agentA: 'fraud_detection',
    agentB: 'performance_analytics',
    area: 'traffic_quality',
    conflictKeywords: ['suspicious', 'legitimate', 'anomaly', 'normal', 'fraud'],
  },
  {
    agentA: 'market_intelligence',
    agentB: 'country_strategy',
    area: 'market_entry',
    conflictKeywords: ['enter', 'avoid', 'expand', 'withdraw', 'postpone'],
  },
  {
    agentA: 'organic_social',
    agentB: 'paid_ads',
    area: 'channel_priority',
    conflictKeywords: ['prioritize', 'reduce', 'shift', 'increase', 'focus'],
  },
  {
    agentA: 'conversion_optimization',
    agentB: 'ab_testing',
    area: 'conversion_strategy',
    conflictKeywords: ['variant', 'winner', 'control', 'change', 'keep'],
  },
];

// ============================================================
// AgentAggregator
// ============================================================

export class AgentAggregator {
  // ----------------------------------------------------------
  // Core aggregation
  // ----------------------------------------------------------

  /**
   * Aggregates a map of agent outputs into a single `AggregatedResult`.
   *
   * Steps:
   *  1. Compute basic statistics (responding count, confidence avg/min/max).
   *  2. Merge recommendations, warnings, and uncertainties.
   *  3. Detect inter-agent contradictions.
   *
   * @param outputs - Map of AgentType to its latest AgentOutput.
   * @returns The aggregated summary.
   */
  aggregateOutputs(outputs: Map<AgentType, AgentOutput>): AggregatedResult {
    logger.info('AgentAggregator: aggregating outputs', {
      agentCount: outputs.size,
    });

    if (outputs.size === 0) {
      return this.buildEmptyResult();
    }

    // --- Statistics ---
    let totalConfidence = 0;
    let highestScore = -1;
    let lowestScore = 101;
    let highestAgent: AgentType = 'master_orchestrator';
    let lowestAgent: AgentType = 'master_orchestrator';

    const allRecommendations = new Set<string>();
    const allWarnings = new Set<string>();
    const allUncertainties = new Set<string>();

    for (const [agentType, output] of outputs) {
      const score = output.confidence.score;
      totalConfidence += score;

      if (score > highestScore) {
        highestScore = score;
        highestAgent = agentType;
      }
      if (score < lowestScore) {
        lowestScore = score;
        lowestAgent = agentType;
      }

      for (const rec of output.recommendations) {
        allRecommendations.add(rec);
      }
      for (const warn of output.warnings) {
        allWarnings.add(warn);
      }
      for (const unc of output.uncertainties) {
        allUncertainties.add(unc);
      }
    }

    const averageConfidence = totalConfidence / outputs.size;

    // --- Conflicts ---
    const conflicts = this.identifyConflicts(outputs);
    const contradictions = conflicts.map(
      (c) =>
        `[${c.agents.join(' vs ')}] ${c.area}: ${c.conflict}`,
    );

    const result: AggregatedResult = {
      totalAgents: TOTAL_AGENTS,
      responding: outputs.size,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      highestConfidence: highestAgent,
      lowestConfidence: lowestAgent,
      recommendations: Array.from(allRecommendations),
      warnings: Array.from(allWarnings),
      uncertainties: Array.from(allUncertainties),
      contradictions,
      conflicts,
    };

    logger.info('AgentAggregator: aggregation complete', {
      responding: result.responding,
      averageConfidence: result.averageConfidence,
      conflictCount: conflicts.length,
    });

    return result;
  }

  // ----------------------------------------------------------
  // Category summarisation
  // ----------------------------------------------------------

  /**
   * Splits agent outputs into four functional categories:
   * strategy, execution, analytics, and compliance.
   *
   * @param outputs - Map of AgentType to its latest AgentOutput.
   * @returns Categorised output buckets.
   */
  summarizeByCategory(outputs: Map<AgentType, AgentOutput>): CategorisedOutputs {
    const result: CategorisedOutputs = {
      strategy: [],
      execution: [],
      analytics: [],
      compliance: [],
    };

    for (const [agentType, output] of outputs) {
      if (STRATEGY_AGENTS.has(agentType)) {
        result.strategy.push(output);
      } else if (EXECUTION_AGENTS.has(agentType)) {
        result.execution.push(output);
      } else if (ANALYTICS_AGENTS.has(agentType)) {
        result.analytics.push(output);
      } else if (COMPLIANCE_AGENTS.has(agentType)) {
        result.compliance.push(output);
      }
    }

    logger.debug('AgentAggregator: categorised outputs', {
      strategy: result.strategy.length,
      execution: result.execution.length,
      analytics: result.analytics.length,
      compliance: result.compliance.length,
    });

    return result;
  }

  // ----------------------------------------------------------
  // Unified recommendations
  // ----------------------------------------------------------

  /**
   * Produces a single prioritised list of unique recommendations
   * drawn from every responding agent.  Recommendations from
   * higher-confidence agents appear first.
   *
   * @param outputs - Map of AgentType to its latest AgentOutput.
   * @returns Deduplicated, confidence-sorted recommendation list.
   */
  getUnifiedRecommendations(outputs: Map<AgentType, AgentOutput>): string[] {
    // Build tuples of (recommendation, confidence) to allow sorting
    const scored: { text: string; confidence: number }[] = [];
    const seen = new Set<string>();

    // Sort agents by confidence descending so higher-confidence recs come first
    const sortedOutputs = Array.from(outputs.entries()).sort(
      (a, b) => b[1].confidence.score - a[1].confidence.score,
    );

    for (const [, output] of sortedOutputs) {
      for (const rec of output.recommendations) {
        const normalised = rec.trim();
        if (normalised && !seen.has(normalised)) {
          seen.add(normalised);
          scored.push({ text: normalised, confidence: output.confidence.score });
        }
      }
    }

    // Already sorted by insertion order (highest-confidence agents first)
    return scored.map((s) => s.text);
  }

  // ----------------------------------------------------------
  // Conflict identification
  // ----------------------------------------------------------

  /**
   * Scans agent outputs for contradictions using predefined rules.
   *
   * A conflict is flagged when two agents whose outputs are expected
   * to potentially clash both use opposing directional keywords in
   * their decisions (e.g. one says "increase budget" while the other
   * says "decrease budget").
   *
   * @param outputs - Map of AgentType to its latest AgentOutput.
   * @returns Array of detected conflicts.
   */
  identifyConflicts(outputs: Map<AgentType, AgentOutput>): AgentConflict[] {
    const conflicts: AgentConflict[] = [];

    for (const rule of CONFLICT_RULES) {
      const outputA = outputs.get(rule.agentA);
      const outputB = outputs.get(rule.agentB);

      if (!outputA || !outputB) {
        continue;
      }

      const decisionA = outputA.decision.toLowerCase();
      const decisionB = outputB.decision.toLowerCase();
      const reasoningA = outputA.reasoning.toLowerCase();
      const reasoningB = outputB.reasoning.toLowerCase();

      const textA = `${decisionA} ${reasoningA}`;
      const textB = `${decisionB} ${reasoningB}`;

      // Find keywords present in each agent's text
      const keywordsA = rule.conflictKeywords.filter((kw) => textA.includes(kw));
      const keywordsB = rule.conflictKeywords.filter((kw) => textB.includes(kw));

      if (keywordsA.length === 0 || keywordsB.length === 0) {
        continue;
      }

      // Check for directional opposition (e.g. A says "increase", B says "decrease")
      const opposingPairs: [string, string][] = [
        ['increase', 'decrease'],
        ['expand', 'reduce'],
        ['expand', 'cut'],
        ['aggressive', 'conservative'],
        ['approve', 'restrict'],
        ['approve', 'block'],
        ['allow', 'prohibit'],
        ['allow', 'restrict'],
        ['enter', 'avoid'],
        ['enter', 'withdraw'],
        ['enter', 'postpone'],
        ['legitimate', 'suspicious'],
        ['normal', 'anomaly'],
        ['normal', 'fraud'],
        ['prioritize', 'reduce'],
        ['adapt', 'preserve'],
        ['change', 'maintain'],
        ['change', 'keep'],
        ['winner', 'control'],
      ];

      let conflictDescription: string | null = null;

      for (const [positive, negative] of opposingPairs) {
        const aHasPositive = textA.includes(positive);
        const aHasNegative = textA.includes(negative);
        const bHasPositive = textB.includes(positive);
        const bHasNegative = textB.includes(negative);

        if ((aHasPositive && bHasNegative) || (aHasNegative && bHasPositive)) {
          const dirA = aHasPositive ? positive : negative;
          const dirB = bHasPositive ? positive : negative;
          conflictDescription =
            `${rule.agentA} indicates "${dirA}" while ${rule.agentB} indicates "${dirB}" in ${rule.area}`;
          break;
        }
      }

      // Also flag significant confidence divergence as a soft conflict
      if (!conflictDescription) {
        const confidenceDelta = Math.abs(
          outputA.confidence.score - outputB.confidence.score,
        );
        if (confidenceDelta >= 40) {
          conflictDescription =
            `Large confidence divergence (${confidenceDelta.toFixed(1)} points) between ` +
            `${rule.agentA} (${outputA.confidence.score}) and ` +
            `${rule.agentB} (${outputB.confidence.score}) in ${rule.area}`;
        }
      }

      if (conflictDescription) {
        conflicts.push({
          agents: [rule.agentA, rule.agentB],
          area: rule.area,
          conflict: conflictDescription,
        });
      }
    }

    if (conflicts.length > 0) {
      logger.warn('AgentAggregator: conflicts detected', {
        count: conflicts.length,
        areas: conflicts.map((c) => c.area),
      });
    }

    return conflicts;
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private buildEmptyResult(): AggregatedResult {
    return {
      totalAgents: TOTAL_AGENTS,
      responding: 0,
      averageConfidence: 0,
      highestConfidence: 'master_orchestrator',
      lowestConfidence: 'master_orchestrator',
      recommendations: [],
      warnings: [],
      uncertainties: [],
      contradictions: [],
      conflicts: [],
    };
  }
}

// ============================================================
// AI International Growth Engine - Inconsistency Detector
// Detects contradictions and inconsistencies between agent outputs.
// Covers budget, strategy, and metric dimensions.
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';
import type { Inconsistency, ChallengeSeverity } from './types';
import { logger } from '../../utils/logger';

// ---- Agent Domain Groups ----

/** Agents whose outputs contain budget or spend related data */
const BUDGET_AGENTS: AgentType[] = [
  'budget_optimization',
  'paid_ads',
  'revenue_forecasting',
  'shopify_integration',
];

/** Agents whose outputs contain strategic or market-level data */
const STRATEGY_AGENTS: AgentType[] = [
  'country_strategy',
  'market_intelligence',
  'competitive_intelligence',
  'localization',
  'brand_consistency',
];

/** Agents whose outputs contain quantitative metrics */
const METRIC_AGENTS: AgentType[] = [
  'performance_analytics',
  'revenue_forecasting',
  'ab_testing',
  'conversion_optimization',
  'fraud_detection',
];

/**
 * Keys commonly found in budget-related agent output data.
 * Used to locate and compare budget figures across agents.
 */
const BUDGET_KEYS = [
  'total_budget',
  'totalBudget',
  'budget',
  'total_spend',
  'totalSpend',
  'spend',
  'allocated_budget',
  'allocatedBudget',
  'daily_budget',
  'dailyBudget',
  'monthly_budget',
  'monthlyBudget',
];

/**
 * Keys commonly found in strategy-related agent output data.
 * Used to locate and compare strategic recommendations across agents.
 */
const STRATEGY_KEYS = [
  'target_markets',
  'targetMarkets',
  'priority_countries',
  'priorityCountries',
  'entry_strategy',
  'entryStrategy',
  'market_approach',
  'marketApproach',
  'growth_strategy',
  'growthStrategy',
  'channel_strategy',
  'channelStrategy',
];

/**
 * Keys commonly found in metric-related agent output data.
 * Used to locate and compare quantitative metrics across agents.
 */
const METRIC_KEYS = [
  'roas',
  'cpa',
  'cpc',
  'ctr',
  'conversion_rate',
  'conversionRate',
  'revenue',
  'projected_revenue',
  'projectedRevenue',
  'growth_rate',
  'growthRate',
  'forecast',
];

/**
 * Tolerance thresholds for numeric comparisons.
 * Values diverging more than these thresholds are flagged as inconsistencies.
 */
const NUMERIC_TOLERANCE = {
  /** Percentage difference allowed for budget figures (15%) */
  budget: 0.15,
  /** Percentage difference allowed for metric values (20%) */
  metric: 0.20,
  /** Percentage difference allowed for strategy scores (25%) */
  strategy: 0.25,
};

// ---- InconsistencyDetector Class ----

/**
 * Detects inconsistencies and contradictions between agent outputs.
 *
 * Performs three categories of analysis:
 * 1. **Budget inconsistencies** - conflicting budget/spend figures across financial agents
 * 2. **Strategy inconsistencies** - conflicting strategic recommendations across market agents
 * 3. **Metric inconsistencies** - conflicting quantitative metrics across analytics agents
 *
 * Each detected inconsistency is scored for severity to help the ContradictionResolver
 * prioritize resolution.
 *
 * @example
 * ```typescript
 * const detector = new InconsistencyDetector();
 * const inconsistencies = detector.detectInconsistencies(agentOutputs);
 * console.log(`Found ${inconsistencies.length} inconsistencies`);
 * ```
 */
export class InconsistencyDetector {
  /**
   * Runs the full inconsistency detection pipeline across all agent outputs.
   *
   * Combines budget, strategy, and metric inconsistency checks, then
   * scores each finding for severity. Results are sorted by severity
   * score in descending order (most critical first).
   *
   * @param outputs - Map of all agent outputs keyed by agent type
   * @returns Array of detected inconsistencies, sorted by severity (critical first)
   */
  detectInconsistencies(outputs: Map<AgentType, AgentOutput>): Inconsistency[] {
    logger.info('Running inconsistency detection', { agentCount: outputs.size });

    const inconsistencies: Inconsistency[] = [];

    const budgetInconsistencies = this.detectBudgetInconsistencies(outputs);
    inconsistencies.push(...budgetInconsistencies);

    const strategyInconsistencies = this.detectStrategyInconsistencies(outputs);
    inconsistencies.push(...strategyInconsistencies);

    const metricInconsistencies = this.detectMetricInconsistencies(outputs);
    inconsistencies.push(...metricInconsistencies);

    // Sort by severity score (higher = more severe = first)
    inconsistencies.sort((a, b) => this.scoreInconsistency(b) - this.scoreInconsistency(a));

    logger.info('Inconsistency detection completed', {
      total: inconsistencies.length,
      budget: budgetInconsistencies.length,
      strategy: strategyInconsistencies.length,
      metric: metricInconsistencies.length,
    });

    return inconsistencies;
  }

  /**
   * Compares two specific agent outputs across the given areas to find inconsistencies.
   *
   * Performs pairwise comparison of data values in the specified areas.
   * Useful for targeted comparison between two specific agents outside
   * of the full detection pipeline.
   *
   * @param output1 - First agent's output
   * @param output2 - Second agent's output
   * @param areas - The data areas (keys) to compare between the two outputs
   * @returns Array of inconsistencies found between the two outputs
   */
  compareOutputs(
    output1: AgentOutput,
    output2: AgentOutput,
    areas: string[],
  ): Inconsistency[] {
    const inconsistencies: Inconsistency[] = [];

    for (const area of areas) {
      const value1 = this.extractValue(output1.data, area);
      const value2 = this.extractValue(output2.data, area);

      // Skip if neither output has data for this area
      if (value1 === undefined && value2 === undefined) {
        continue;
      }

      // One has data, the other does not
      if (value1 === undefined || value2 === undefined) {
        inconsistencies.push({
          agents: [output1.agentType, output2.agentType],
          area,
          values: {
            [output1.agentType]: value1 ?? 'NOT_PROVIDED',
            [output2.agentType]: value2 ?? 'NOT_PROVIDED',
          },
          severity: 'warning',
          description: `Agent ${value1 === undefined ? output1.agentType : output2.agentType} does not provide data for "${area}" while the other does`,
        });
        continue;
      }

      // Both have data - compare
      const divergence = this.compareValues(value1, value2);
      if (divergence !== null) {
        const severity = this.divergenceToSeverity(divergence, 'general');
        if (severity) {
          inconsistencies.push({
            agents: [output1.agentType, output2.agentType],
            area,
            values: {
              [output1.agentType]: value1,
              [output2.agentType]: value2,
            },
            severity,
            description: `Agents ${output1.agentType} and ${output2.agentType} diverge on "${area}" by ${(divergence * 100).toFixed(1)}%`,
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * Detects budget-related inconsistencies across financial agents.
   *
   * Compares budget, spend, and allocation figures reported by
   * budget_optimization, paid_ads, revenue_forecasting, and shopify_integration.
   * Flags cases where agents report significantly different budget numbers.
   *
   * @param outputs - Map of all agent outputs
   * @returns Budget-specific inconsistencies
   */
  detectBudgetInconsistencies(
    outputs: Map<AgentType, AgentOutput>,
  ): Inconsistency[] {
    const inconsistencies: Inconsistency[] = [];

    // Collect budget-related outputs
    const budgetOutputs = this.filterOutputsByAgents(outputs, BUDGET_AGENTS);
    if (budgetOutputs.size < 2) {
      return inconsistencies;
    }

    // Compare each budget key across all budget agents
    for (const key of BUDGET_KEYS) {
      const agentValues = new Map<AgentType, unknown>();

      for (const [agentType, output] of budgetOutputs) {
        const value = this.extractValue(output.data, key);
        if (value !== undefined) {
          agentValues.set(agentType, value);
        }
      }

      if (agentValues.size < 2) {
        continue;
      }

      // Check for numeric divergence among all pairs
      const agents = Array.from(agentValues.keys());
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const val1 = agentValues.get(agents[i]);
          const val2 = agentValues.get(agents[j]);

          const divergence = this.compareValues(val1, val2);
          if (divergence !== null && divergence > NUMERIC_TOLERANCE.budget) {
            const severity = this.divergenceToSeverity(divergence, 'budget');
            if (severity) {
              inconsistencies.push({
                agents: [agents[i], agents[j]],
                area: `budget:${key}`,
                values: {
                  [agents[i]]: val1,
                  [agents[j]]: val2,
                },
                severity,
                description: `Budget figure "${key}" diverges by ${(divergence * 100).toFixed(1)}% between ${agents[i]} (${val1}) and ${agents[j]} (${val2})`,
              });
            }
          }
        }
      }
    }

    // Check total budget vs sum of channel allocations
    const budgetOptOutput = outputs.get('budget_optimization');
    const paidAdsOutput = outputs.get('paid_ads');

    if (budgetOptOutput && paidAdsOutput) {
      const totalBudget = this.extractNumeric(budgetOptOutput.data, 'total_budget') ??
        this.extractNumeric(budgetOptOutput.data, 'totalBudget');
      const adSpend = this.extractNumeric(paidAdsOutput.data, 'total_spend') ??
        this.extractNumeric(paidAdsOutput.data, 'totalSpend') ??
        this.extractNumeric(paidAdsOutput.data, 'spend');

      if (totalBudget !== null && adSpend !== null && totalBudget > 0) {
        if (adSpend > totalBudget) {
          inconsistencies.push({
            agents: ['paid_ads', 'budget_optimization'],
            area: 'budget:overspend',
            values: {
              budget_optimization: totalBudget,
              paid_ads: adSpend,
            },
            severity: 'critical',
            description: `Paid ads spend (${adSpend}) exceeds total budget allocation (${totalBudget})`,
          });
        }
      }
    }

    logger.debug('Budget inconsistency detection completed', {
      found: inconsistencies.length,
    });

    return inconsistencies;
  }

  /**
   * Detects strategy-related inconsistencies across market-facing agents.
   *
   * Compares strategic direction, target markets, and priorities across
   * country_strategy, market_intelligence, competitive_intelligence,
   * localization, and brand_consistency.
   *
   * @param outputs - Map of all agent outputs
   * @returns Strategy-specific inconsistencies
   */
  detectStrategyInconsistencies(
    outputs: Map<AgentType, AgentOutput>,
  ): Inconsistency[] {
    const inconsistencies: Inconsistency[] = [];

    const strategyOutputs = this.filterOutputsByAgents(outputs, STRATEGY_AGENTS);
    if (strategyOutputs.size < 2) {
      return inconsistencies;
    }

    // Compare strategy keys across strategy agents
    for (const key of STRATEGY_KEYS) {
      const agentValues = new Map<AgentType, unknown>();

      for (const [agentType, output] of strategyOutputs) {
        const value = this.extractValue(output.data, key);
        if (value !== undefined) {
          agentValues.set(agentType, value);
        }
      }

      if (agentValues.size < 2) {
        continue;
      }

      // For array values (like target markets), check for divergence in lists
      const agents = Array.from(agentValues.keys());
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const val1 = agentValues.get(agents[i]);
          const val2 = agentValues.get(agents[j]);

          if (Array.isArray(val1) && Array.isArray(val2)) {
            const overlap = this.calculateArrayOverlap(val1, val2);
            if (overlap < 0.5 && (val1.length > 0 || val2.length > 0)) {
              inconsistencies.push({
                agents: [agents[i], agents[j]],
                area: `strategy:${key}`,
                values: {
                  [agents[i]]: val1,
                  [agents[j]]: val2,
                },
                severity: overlap < 0.25 ? 'critical' : 'warning',
                description: `Strategy lists for "${key}" have only ${(overlap * 100).toFixed(0)}% overlap between ${agents[i]} and ${agents[j]}`,
              });
            }
          } else if (typeof val1 === 'string' && typeof val2 === 'string') {
            // For string strategy values, check if they match
            if (val1.toLowerCase() !== val2.toLowerCase()) {
              inconsistencies.push({
                agents: [agents[i], agents[j]],
                area: `strategy:${key}`,
                values: {
                  [agents[i]]: val1,
                  [agents[j]]: val2,
                },
                severity: 'warning',
                description: `Strategy value "${key}" differs: ${agents[i]} says "${val1}" vs ${agents[j]} says "${val2}"`,
              });
            }
          } else {
            const divergence = this.compareValues(val1, val2);
            if (divergence !== null && divergence > NUMERIC_TOLERANCE.strategy) {
              const severity = this.divergenceToSeverity(divergence, 'strategy');
              if (severity) {
                inconsistencies.push({
                  agents: [agents[i], agents[j]],
                  area: `strategy:${key}`,
                  values: {
                    [agents[i]]: val1,
                    [agents[j]]: val2,
                  },
                  severity,
                  description: `Strategy metric "${key}" diverges by ${(divergence * 100).toFixed(1)}% between ${agents[i]} and ${agents[j]}`,
                });
              }
            }
          }
        }
      }
    }

    // Check for conflicting decisions between country_strategy and market_intelligence
    const countryOutput = outputs.get('country_strategy');
    const marketOutput = outputs.get('market_intelligence');

    if (countryOutput && marketOutput) {
      if (
        countryOutput.decision &&
        marketOutput.decision &&
        countryOutput.decision.toLowerCase().includes('deprioritize') &&
        marketOutput.decision.toLowerCase().includes('expand')
      ) {
        inconsistencies.push({
          agents: ['country_strategy', 'market_intelligence'],
          area: 'strategy:direction',
          values: {
            country_strategy: countryOutput.decision,
            market_intelligence: marketOutput.decision,
          },
          severity: 'critical',
          description: 'Country strategy suggests deprioritizing while market intelligence recommends expansion',
        });
      }
    }

    logger.debug('Strategy inconsistency detection completed', {
      found: inconsistencies.length,
    });

    return inconsistencies;
  }

  /**
   * Detects metric-related inconsistencies across analytics agents.
   *
   * Compares quantitative KPIs, rates, and forecasts across
   * performance_analytics, revenue_forecasting, ab_testing,
   * conversion_optimization, and fraud_detection.
   *
   * @param outputs - Map of all agent outputs
   * @returns Metric-specific inconsistencies
   */
  detectMetricInconsistencies(
    outputs: Map<AgentType, AgentOutput>,
  ): Inconsistency[] {
    const inconsistencies: Inconsistency[] = [];

    const metricOutputs = this.filterOutputsByAgents(outputs, METRIC_AGENTS);
    if (metricOutputs.size < 2) {
      return inconsistencies;
    }

    // Compare metric keys across metric agents
    for (const key of METRIC_KEYS) {
      const agentValues = new Map<AgentType, unknown>();

      for (const [agentType, output] of metricOutputs) {
        const value = this.extractValue(output.data, key);
        if (value !== undefined) {
          agentValues.set(agentType, value);
        }
      }

      if (agentValues.size < 2) {
        continue;
      }

      const agents = Array.from(agentValues.keys());
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const val1 = agentValues.get(agents[i]);
          const val2 = agentValues.get(agents[j]);

          const divergence = this.compareValues(val1, val2);
          if (divergence !== null && divergence > NUMERIC_TOLERANCE.metric) {
            const severity = this.divergenceToSeverity(divergence, 'metric');
            if (severity) {
              inconsistencies.push({
                agents: [agents[i], agents[j]],
                area: `metric:${key}`,
                values: {
                  [agents[i]]: val1,
                  [agents[j]]: val2,
                },
                severity,
                description: `Metric "${key}" diverges by ${(divergence * 100).toFixed(1)}% between ${agents[i]} (${val1}) and ${agents[j]} (${val2})`,
              });
            }
          }
        }
      }
    }

    // Check for analytics vs forecasting alignment on revenue
    const analyticsOutput = outputs.get('performance_analytics');
    const forecastOutput = outputs.get('revenue_forecasting');

    if (analyticsOutput && forecastOutput) {
      const actualRevenue = this.extractNumeric(analyticsOutput.data, 'revenue');
      const forecastedRevenue = this.extractNumeric(forecastOutput.data, 'projected_revenue') ??
        this.extractNumeric(forecastOutput.data, 'projectedRevenue') ??
        this.extractNumeric(forecastOutput.data, 'forecast');

      if (actualRevenue !== null && forecastedRevenue !== null && forecastedRevenue > 0) {
        const deviation = Math.abs(actualRevenue - forecastedRevenue) / forecastedRevenue;
        if (deviation > NUMERIC_TOLERANCE.metric) {
          inconsistencies.push({
            agents: ['performance_analytics', 'revenue_forecasting'],
            area: 'metric:revenue_alignment',
            values: {
              performance_analytics: actualRevenue,
              revenue_forecasting: forecastedRevenue,
            },
            severity: deviation > 0.5 ? 'critical' : 'warning',
            description: `Actual revenue (${actualRevenue}) deviates from forecast (${forecastedRevenue}) by ${(deviation * 100).toFixed(1)}%`,
          });
        }
      }
    }

    logger.debug('Metric inconsistency detection completed', {
      found: inconsistencies.length,
    });

    return inconsistencies;
  }

  /**
   * Scores an inconsistency based on its attributes.
   *
   * Higher scores indicate more severe inconsistencies. The score
   * combines severity level, number of agents involved, and domain weight.
   *
   * @param inconsistency - The inconsistency to score
   * @returns Numeric severity score (0-100)
   */
  scoreInconsistency(inconsistency: Inconsistency): number {
    let score = 0;

    // Base score from severity level
    switch (inconsistency.severity) {
      case 'critical':
        score += 60;
        break;
      case 'warning':
        score += 30;
        break;
      case 'info':
        score += 10;
        break;
    }

    // More agents involved = more severe
    score += Math.min(inconsistency.agents.length * 5, 20);

    // Domain weight: budget inconsistencies are more impactful than strategy
    if (inconsistency.area.startsWith('budget:')) {
      score += 15;
    } else if (inconsistency.area.startsWith('metric:')) {
      score += 10;
    } else if (inconsistency.area.startsWith('strategy:')) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  // ---- Private Helper Methods ----

  /**
   * Filters the outputs map to include only agents from the specified list.
   */
  private filterOutputsByAgents(
    outputs: Map<AgentType, AgentOutput>,
    agents: AgentType[],
  ): Map<AgentType, AgentOutput> {
    const filtered = new Map<AgentType, AgentOutput>();
    for (const agent of agents) {
      const output = outputs.get(agent);
      if (output) {
        filtered.set(agent, output);
      }
    }
    return filtered;
  }

  /**
   * Extracts a value from a nested data object by key.
   * Supports both snake_case and camelCase keys via a normalized search.
   */
  private extractValue(data: Record<string, unknown>, key: string): unknown {
    if (!data) {
      return undefined;
    }

    // Direct match
    if (key in data) {
      return data[key];
    }

    // Normalized match (ignore case and underscores)
    const normalizedKey = key.toLowerCase().replace(/_/g, '');
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase().replace(/_/g, '') === normalizedKey) {
        return v;
      }
    }

    // Search one level deep in nested objects
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

  /**
   * Extracts a numeric value from a data object by key.
   * Returns null if the value is not numeric.
   */
  private extractNumeric(data: Record<string, unknown>, key: string): number | null {
    const value = this.extractValue(data, key);
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  /**
   * Compares two values and returns a fractional divergence score.
   * Returns null if the values are not comparable numerically.
   * A return of 0 means identical; 1.0 means 100% divergence.
   */
  private compareValues(val1: unknown, val2: unknown): number | null {
    const num1 = typeof val1 === 'number' ? val1 : (typeof val1 === 'string' ? parseFloat(val1) : NaN);
    const num2 = typeof val2 === 'number' ? val2 : (typeof val2 === 'string' ? parseFloat(val2) : NaN);

    if (isNaN(num1) || isNaN(num2)) {
      return null;
    }

    const denominator = Math.max(Math.abs(num1), Math.abs(num2));
    if (denominator === 0) {
      return 0;
    }

    return Math.abs(num1 - num2) / denominator;
  }

  /**
   * Calculates the overlap ratio between two arrays.
   * Returns 1.0 for identical arrays, 0.0 for no overlap.
   */
  private calculateArrayOverlap(arr1: unknown[], arr2: unknown[]): number {
    if (arr1.length === 0 && arr2.length === 0) {
      return 1.0;
    }

    const set1 = new Set(arr1.map((v) => String(v).toLowerCase()));
    const set2 = new Set(arr2.map((v) => String(v).toLowerCase()));

    let intersectionCount = 0;
    for (const item of set1) {
      if (set2.has(item)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...set1, ...set2]).size;
    return unionCount > 0 ? intersectionCount / unionCount : 0;
  }

  /**
   * Maps a numeric divergence value and domain to a severity level.
   * Returns null if the divergence is below the threshold for that domain.
   */
  private divergenceToSeverity(
    divergence: number,
    domain: 'budget' | 'metric' | 'strategy' | 'general',
  ): ChallengeSeverity | null {
    const threshold = domain === 'general'
      ? NUMERIC_TOLERANCE.metric
      : NUMERIC_TOLERANCE[domain as keyof typeof NUMERIC_TOLERANCE] ?? NUMERIC_TOLERANCE.metric;

    if (divergence <= threshold) {
      return null;
    }

    if (divergence > threshold * 3) {
      return 'critical';
    }

    if (divergence > threshold * 1.5) {
      return 'warning';
    }

    return 'info';
  }
}

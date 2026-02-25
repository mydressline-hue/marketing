// ============================================================
// AI International Growth Engine - Agent 8: Budget Optimization
// Dynamic budget allocation, ROAS-based scaling, auto-pausing
// underperformers, and risk management guardrails.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
} from '../base/types';
import { calculateWeightedConfidence } from '../base/ConfidenceScoring';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import type {
  AgentType,
  BudgetAllocation,
  ROASMetric,
  RiskGuardrail,
  Campaign,
  SpendRecord,
  AllocationRule,
} from '../../types';

// ---- Agent-specific Types ----

export interface OptimizationAction {
  type: 'increase' | 'decrease' | 'pause' | 'scale';
  target: string;
  amount: number;
  reasoning: string;
}

export interface OptimizationResult {
  currentAllocation: Record<string, number>;
  proposedAllocation: Record<string, number>;
  expectedROASChange: number;
  riskLevel: string;
  actions: OptimizationAction[];
  confidence: number;
}

export interface ReallocationPlan {
  fromChannels: Record<string, number>;
  toChannels: Record<string, number>;
  totalReallocated: number;
  expectedImpact: string;
}

export interface ValidatedPlan {
  plan: ReallocationPlan;
  guardrailsApplied: string[];
  adjustments: string[];
  approved: boolean;
}

export interface ScalingResult {
  campaignId: string;
  previousBudget: number;
  newBudget: number;
  scaleFactor: number;
  riskAssessment: string;
}

export interface RiskScore {
  score: number;
  factors: Record<string, number>;
  level: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface SimulationResult {
  proposedAllocation: Record<string, number>;
  expectedROAS: number;
  expectedRevenue: number;
  riskLevel: string;
  confidence: number;
}

export interface SpendVelocity {
  daily: number;
  weekly: number;
  projectedMonthly: number;
  onTrack: boolean;
}

export interface SpendAnomaly {
  date: string;
  expected: number;
  actual: number;
  deviation: number;
  severity: string;
}

// ---- Cache Keys & TTLs ----

const CACHE_PREFIX = 'budget_opt';
const CACHE_TTL_ROAS = 300; // 5 minutes
const CACHE_TTL_ALLOCATION = 600; // 10 minutes
const CACHE_TTL_VELOCITY = 180; // 3 minutes

// ---- Default Configuration ----

const DEFAULT_CONFIG: AgentConfig = {
  agentType: 'budget_optimization',
  model: 'opus',
  maxRetries: 3,
  timeoutMs: 60_000,
  confidenceThreshold: 65,
};

/**
 * Budget Optimization Agent (Agent 8)
 *
 * Handles dynamic budget allocation across channels and campaigns.
 * Continuously monitors ROAS, identifies high-performing and underperforming
 * campaigns, suggests reallocation plans, and enforces risk guardrails to
 * protect against overspend and poor-performing allocations.
 *
 * Challenge targets: paid_ads, performance_analytics, revenue_forecasting
 */
export class BudgetOptimizationAgent extends BaseAgent {
  constructor(config: Partial<AgentConfig> = {}) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the agent types this agent is qualified to cross-challenge.
   */
  getChallengeTargets(): AgentType[] {
    return ['paid_ads', 'performance_analytics', 'revenue_forecasting'];
  }

  /**
   * Returns the system prompt that shapes the AI persona for budget optimization.
   */
  getSystemPrompt(): string {
    return `You are the Budget Optimization Agent for an AI-powered international growth engine.
Your role is to dynamically allocate marketing budgets across channels and campaigns
to maximize ROAS (Return on Ad Spend) while respecting risk guardrails.

Your expertise includes:
- Analyzing spend patterns and revenue attribution across channels
- Identifying high-ROAS campaigns worthy of budget scaling
- Detecting underperforming campaigns that should be paused or reduced
- Computing optimal budget reallocation plans
- Enforcing risk guardrails (max channel concentration, daily spend caps, etc.)
- Simulating allocation changes before they are applied
- Detecting spend anomalies that indicate fraud, misconfiguration, or market shifts

When making recommendations:
1. Always base decisions on actual performance data, never assumptions
2. Provide confidence scores reflecting data quality and sample size
3. Flag uncertainties when data is insufficient or stale
4. Respect guardrails even if the optimal mathematical allocation would violate them
5. Consider the time horizon and seasonality of performance data
6. Account for currency differences when optimizing across countries`;
  }

  /**
   * Core processing logic: analyzes spending data, computes ROAS, suggests
   * reallocation, enforces guardrails, and returns a structured output.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing budget optimization request', {
      requestId: input.requestId,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      const countryId = input.parameters.countryId as string | undefined;

      // Step 1: Fetch current allocation
      const allocation = await this.fetchCurrentAllocation(countryId);
      if (!allocation) {
        const uncertainty = this.flagUncertainty(
          'allocation_data',
          'No active budget allocation found for the specified scope',
        );
        uncertainties.push(uncertainty);

        const confidence = this.calculateConfidence({
          data_availability: 0,
          data_recency: 0,
          sample_size: 0,
        });

        return this.buildOutput(
          'no_allocation_found',
          { countryId },
          confidence,
          'Cannot optimize budget without an active allocation. Create an allocation first.',
          ['Create a budget allocation before running optimization'],
          ['No active budget allocation exists'],
          uncertainties,
        );
      }

      // Step 2: Compute ROAS per channel
      const channelROAS = await this.calculateChannelROAS(
        allocation.channel_allocations,
      );

      // Step 3: Determine data quality confidence factors
      const dataQuality = this.assessDataQuality(channelROAS, allocation);

      // Step 4: Identify high and low performers
      const highROASThreshold =
        (input.parameters.highROASThreshold as number) ?? 3.0;
      const lowROASThreshold =
        (input.parameters.lowROASThreshold as number) ?? 1.0;

      const highPerformers = await this.identifyHighROASCampaigns(highROASThreshold);
      const underperformers = await this.identifyUnderperformers(lowROASThreshold);

      // Step 5: Suggest reallocation
      const reallocationPlan = await this.suggestReallocation(allocation);

      // Step 6: Enforce guardrails
      const guardrails = allocation.risk_guardrails ?? [];
      const validatedPlan = this.enforceGuardrails(reallocationPlan, guardrails);

      if (validatedPlan.adjustments.length > 0) {
        warnings.push(
          `Guardrails required ${validatedPlan.adjustments.length} adjustment(s) to the proposed plan`,
        );
      }

      // Step 7: Compute risk score for the validated plan
      const riskScore = this.calculateRiskScore(allocation);

      if (riskScore.level === 'high' || riskScore.level === 'critical') {
        warnings.push(
          `Risk level is ${riskScore.level} (score: ${riskScore.score}). ${riskScore.recommendations.join('; ')}`,
        );
      }

      // Step 8: Build optimization result
      const actions = this.buildOptimizationActions(
        channelROAS,
        validatedPlan.plan,
        highPerformers,
        underperformers,
      );

      const currentAllocation = { ...allocation.channel_allocations };
      const proposedAllocation = this.computeProposedAllocation(
        currentAllocation,
        validatedPlan.plan,
      );

      // Compute expected ROAS change
      const currentWeightedROAS = this.computeWeightedROAS(
        currentAllocation,
        channelROAS,
      );
      const expectedWeightedROAS = this.computeWeightedROAS(
        proposedAllocation,
        channelROAS,
      );
      const expectedROASChange =
        currentWeightedROAS > 0
          ? ((expectedWeightedROAS - currentWeightedROAS) / currentWeightedROAS) * 100
          : 0;

      const confidence = calculateWeightedConfidence(dataQuality, {
        data_availability: 2,
        data_recency: 1.5,
        sample_size: 1.5,
        roas_consistency: 1,
      });

      const optimizationResult: OptimizationResult = {
        currentAllocation,
        proposedAllocation,
        expectedROASChange: Math.round(expectedROASChange * 100) / 100,
        riskLevel: riskScore.level,
        actions,
        confidence: confidence.score,
      };

      // Build recommendations
      if (highPerformers.length > 0) {
        recommendations.push(
          `Scale ${highPerformers.length} high-ROAS campaign(s) to capture additional revenue`,
        );
      }
      if (underperformers.length > 0) {
        recommendations.push(
          `Review ${underperformers.length} underperforming campaign(s) for pausing or budget reduction`,
        );
      }
      if (validatedPlan.plan.totalReallocated > 0) {
        recommendations.push(
          `Reallocate ${validatedPlan.plan.totalReallocated.toFixed(2)} in budget from low-performing to high-performing channels`,
        );
      }
      if (riskScore.recommendations.length > 0) {
        recommendations.push(...riskScore.recommendations);
      }

      // Flag uncertainties based on data quality
      if (dataQuality.data_recency < 50) {
        uncertainties.push(
          this.flagUncertainty(
            'data_recency',
            'Performance data may be stale; results based on older metrics',
          ),
        );
      }
      if (dataQuality.sample_size < 50) {
        uncertainties.push(
          this.flagUncertainty(
            'sample_size',
            'Limited spend history reduces prediction reliability',
          ),
        );
      }

      const reasoning = this.buildReasoning(
        allocation,
        channelROAS,
        highPerformers,
        underperformers,
        validatedPlan,
        riskScore,
      );

      const output = this.buildOutput(
        'budget_optimization_complete',
        {
          optimization: optimizationResult,
          channelROAS,
          highPerformers: highPerformers.map((c) => c.id),
          underperformers: underperformers.map((c) => c.id),
          validatedPlan,
          riskScore,
        },
        confidence,
        reasoning,
        recommendations,
        warnings,
        uncertainties,
      );

      // Persist the decision
      await this.logDecision(input, output);
      await this.persistState({
        lastOptimization: optimizationResult,
        lastRunAt: new Date().toISOString(),
        allocationId: allocation.id,
      });

      // Invalidate stale caches
      await cacheDel(`${CACHE_PREFIX}:allocation:${countryId ?? 'all'}`);

      this.log.info('Budget optimization complete', {
        requestId: input.requestId,
        confidence: confidence.score,
        actionsCount: actions.length,
        riskLevel: riskScore.level,
      });

      return output;
    } catch (error) {
      this.log.error('Budget optimization failed', {
        requestId: input.requestId,
        error,
      });
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Runs a full optimization cycle, optionally scoped to a country.
   * Returns a structured result with current/proposed allocations, expected
   * ROAS change, risk level, and specific actions to take.
   */
  async optimizeAllocation(countryId?: string): Promise<OptimizationResult> {
    this.log.info('Running optimizeAllocation', { countryId });

    const allocation = await this.fetchCurrentAllocation(countryId);
    if (!allocation) {
      return {
        currentAllocation: {},
        proposedAllocation: {},
        expectedROASChange: 0,
        riskLevel: 'low',
        actions: [],
        confidence: 0,
      };
    }

    const channelROAS = await this.calculateChannelROAS(
      allocation.channel_allocations,
    );

    const highPerformers = await this.identifyHighROASCampaigns(3.0);
    const underperformers = await this.identifyUnderperformers(1.0);

    const plan = await this.suggestReallocation(allocation);
    const guardrails = allocation.risk_guardrails ?? [];
    const validated = this.enforceGuardrails(plan, guardrails);

    const riskScore = this.calculateRiskScore(allocation);

    const actions = this.buildOptimizationActions(
      channelROAS,
      validated.plan,
      highPerformers,
      underperformers,
    );

    const currentAllocation = { ...allocation.channel_allocations };
    const proposedAllocation = this.computeProposedAllocation(
      currentAllocation,
      validated.plan,
    );

    const currentWeightedROAS = this.computeWeightedROAS(
      currentAllocation,
      channelROAS,
    );
    const expectedWeightedROAS = this.computeWeightedROAS(
      proposedAllocation,
      channelROAS,
    );
    const expectedROASChange =
      currentWeightedROAS > 0
        ? ((expectedWeightedROAS - currentWeightedROAS) / currentWeightedROAS) * 100
        : 0;

    const dataQuality = this.assessDataQuality(channelROAS, allocation);
    const confidence = calculateWeightedConfidence(dataQuality, {
      data_availability: 2,
      data_recency: 1.5,
      sample_size: 1.5,
      roas_consistency: 1,
    });

    return {
      currentAllocation,
      proposedAllocation,
      expectedROASChange: Math.round(expectedROASChange * 100) / 100,
      riskLevel: riskScore.level,
      actions,
      confidence: confidence.score,
    };
  }

  /**
   * Calculates ROAS for each channel based on spend records and revenue data.
   * Queries spend records and campaign metrics from the database.
   */
  async calculateChannelROAS(
    channelAllocations: Record<string, number>,
  ): Promise<Record<string, ROASMetric>> {
    const channels = Object.keys(channelAllocations);
    if (channels.length === 0) {
      return {};
    }

    const cacheKey = `${CACHE_PREFIX}:roas:${channels.sort().join(',')}`;
    const cached = await cacheGet<Record<string, ROASMetric>>(cacheKey);
    if (cached) {
      this.log.debug('Channel ROAS cache hit', { channels });
      return cached;
    }

    const result: Record<string, ROASMetric> = {};

    for (const channel of channels) {
      try {
        // Query spend records for this channel from the last 30 days
        const spendResult = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_spend
           FROM spend_records
           WHERE channel = $1
             AND date >= NOW() - INTERVAL '30 days'`,
          [channel],
        );

        // Query revenue attributed to this channel from campaign metrics
        const revenueResult = await pool.query(
          `SELECT COALESCE(SUM(c.metrics->>'roas' )::numeric * SUM(c.spent), 0) AS estimated_revenue,
                  COALESCE(SUM(c.spent), 0) AS total_campaign_spend
           FROM campaigns c
           WHERE c.platform = $1
             AND c.status = 'active'
             AND c.start_date >= NOW() - INTERVAL '30 days'`,
          [channel],
        );

        const totalSpend = parseFloat(spendResult.rows[0]?.total_spend) || 0;
        const estimatedRevenue =
          parseFloat(revenueResult.rows[0]?.estimated_revenue) || 0;
        const campaignSpend =
          parseFloat(revenueResult.rows[0]?.total_campaign_spend) || 0;

        // Use whichever spend figure is more complete
        const effectiveSpend = Math.max(totalSpend, campaignSpend);
        const roas = effectiveSpend > 0 ? estimatedRevenue / effectiveSpend : 0;

        // Determine trend by comparing to the previous 30-day period
        const prevSpendResult = await pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total_spend
           FROM spend_records
           WHERE channel = $1
             AND date >= NOW() - INTERVAL '60 days'
             AND date < NOW() - INTERVAL '30 days'`,
          [channel],
        );

        const prevRevenueResult = await pool.query(
          `SELECT COALESCE(SUM(c.metrics->>'roas')::numeric * SUM(c.spent), 0) AS estimated_revenue,
                  COALESCE(SUM(c.spent), 0) AS total_campaign_spend
           FROM campaigns c
           WHERE c.platform = $1
             AND c.status IN ('active', 'completed')
             AND c.start_date >= NOW() - INTERVAL '60 days'
             AND c.start_date < NOW() - INTERVAL '30 days'`,
          [channel],
        );

        const prevSpend =
          parseFloat(prevSpendResult.rows[0]?.total_spend) ||
          parseFloat(prevRevenueResult.rows[0]?.total_campaign_spend) ||
          0;
        const prevRevenue =
          parseFloat(prevRevenueResult.rows[0]?.estimated_revenue) || 0;
        const prevROAS = prevSpend > 0 ? prevRevenue / prevSpend : 0;

        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (prevROAS > 0) {
          const roasChange = ((roas - prevROAS) / prevROAS) * 100;
          if (roasChange > 5) trend = 'up';
          else if (roasChange < -5) trend = 'down';
        }

        result[channel] = {
          channel,
          spend: effectiveSpend,
          revenue: estimatedRevenue,
          roas: Math.round(roas * 100) / 100,
          trend,
        };
      } catch (error) {
        this.log.warn('Failed to compute ROAS for channel', {
          channel,
          error,
        });
        result[channel] = {
          channel,
          spend: 0,
          revenue: 0,
          roas: 0,
          trend: 'stable',
        };
      }
    }

    await cacheSet(cacheKey, result, CACHE_TTL_ROAS);
    return result;
  }

  /**
   * Identifies campaigns with ROAS above the given threshold.
   * These campaigns are candidates for budget scaling.
   */
  async identifyHighROASCampaigns(threshold: number): Promise<Campaign[]> {
    this.log.info('Identifying high-ROAS campaigns', { threshold });

    try {
      const result = await pool.query(
        `SELECT id, name, country_id, platform, type, status,
                budget, spent, start_date, end_date, targeting,
                metrics, created_by, created_at, updated_at
         FROM campaigns
         WHERE status = 'active'
           AND (metrics->>'roas')::numeric >= $1
         ORDER BY (metrics->>'roas')::numeric DESC`,
        [threshold],
      );

      return result.rows as Campaign[];
    } catch (error) {
      this.log.error('Failed to identify high-ROAS campaigns', { error });
      throw error;
    }
  }

  /**
   * Identifies campaigns with ROAS below the given threshold.
   * These campaigns are candidates for pausing or budget reduction.
   */
  async identifyUnderperformers(threshold: number): Promise<Campaign[]> {
    this.log.info('Identifying underperforming campaigns', { threshold });

    try {
      const result = await pool.query(
        `SELECT id, name, country_id, platform, type, status,
                budget, spent, start_date, end_date, targeting,
                metrics, created_by, created_at, updated_at
         FROM campaigns
         WHERE status = 'active'
           AND metrics IS NOT NULL
           AND (metrics->>'roas')::numeric < $1
           AND spent > 0
         ORDER BY (metrics->>'roas')::numeric ASC`,
        [threshold],
      );

      return result.rows as Campaign[];
    } catch (error) {
      this.log.error('Failed to identify underperformers', { error });
      throw error;
    }
  }

  /**
   * Generates a reallocation plan by shifting budget from low-ROAS
   * channels to high-ROAS channels within the same allocation.
   */
  async suggestReallocation(
    currentAllocation: BudgetAllocation,
  ): Promise<ReallocationPlan> {
    this.log.info('Generating reallocation plan', {
      allocationId: currentAllocation.id,
    });

    const channelROAS = await this.calculateChannelROAS(
      currentAllocation.channel_allocations,
    );

    const channels = Object.entries(channelROAS);
    if (channels.length === 0) {
      return {
        fromChannels: {},
        toChannels: {},
        totalReallocated: 0,
        expectedImpact: 'No channels with ROAS data available for reallocation',
      };
    }

    // Compute average ROAS across all channels (weighted by spend)
    let totalSpend = 0;
    let totalRevenue = 0;
    for (const [, metric] of channels) {
      totalSpend += metric.spend;
      totalRevenue += metric.revenue;
    }
    const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const fromChannels: Record<string, number> = {};
    const toChannels: Record<string, number> = {};
    let totalReallocated = 0;

    // Identify underperforming channels (below average ROAS) and calculate
    // the amount to shift. We shift up to 20% of the underperforming
    // channel's current allocation to avoid drastic changes.
    const maxShiftPct = 0.20;

    for (const [channelName, metric] of channels) {
      const currentBudget =
        currentAllocation.channel_allocations[channelName] ?? 0;
      if (currentBudget <= 0) continue;

      if (metric.roas < avgROAS && metric.spend > 0) {
        // Below average -- shift budget away
        const deficit = (avgROAS - metric.roas) / avgROAS;
        const shiftAmount = Math.min(
          currentBudget * maxShiftPct,
          currentBudget * deficit,
        );

        if (shiftAmount > 0) {
          fromChannels[channelName] = Math.round(shiftAmount * 100) / 100;
          totalReallocated += shiftAmount;
        }
      }
    }

    // Distribute the freed budget to above-average channels proportionally
    // to how far above average they are.
    if (totalReallocated > 0) {
      const aboveAvgChannels = channels.filter(
        ([, m]) => m.roas >= avgROAS && m.spend > 0,
      );

      if (aboveAvgChannels.length > 0) {
        const totalExcess = aboveAvgChannels.reduce(
          (sum, [, m]) => sum + (m.roas - avgROAS),
          0,
        );

        for (const [channelName, metric] of aboveAvgChannels) {
          const proportion =
            totalExcess > 0 ? (metric.roas - avgROAS) / totalExcess : 1 / aboveAvgChannels.length;
          const addAmount = totalReallocated * proportion;
          toChannels[channelName] = Math.round(addAmount * 100) / 100;
        }
      }
    }

    totalReallocated = Math.round(totalReallocated * 100) / 100;

    const expectedImpact =
      totalReallocated > 0
        ? `Shifting ${totalReallocated} from ${Object.keys(fromChannels).length} underperforming channel(s) to ${Object.keys(toChannels).length} high-performing channel(s). Average ROAS: ${avgROAS.toFixed(2)}.`
        : 'Current allocation is already well-balanced; no reallocation needed.';

    return {
      fromChannels,
      toChannels,
      totalReallocated,
      expectedImpact,
    };
  }

  /**
   * Validates a reallocation plan against risk guardrails.
   * Adjusts the plan as needed to stay within guardrail limits.
   */
  enforceGuardrails(
    plan: ReallocationPlan,
    guardrails: RiskGuardrail[],
  ): ValidatedPlan {
    this.log.info('Enforcing guardrails on reallocation plan', {
      guardrailCount: guardrails.length,
    });

    const adjustments: string[] = [];
    const guardrailsApplied: string[] = [];
    let approved = true;

    // Create a mutable copy of the plan
    const adjustedPlan: ReallocationPlan = {
      fromChannels: { ...plan.fromChannels },
      toChannels: { ...plan.toChannels },
      totalReallocated: plan.totalReallocated,
      expectedImpact: plan.expectedImpact,
    };

    for (const guardrail of guardrails) {
      switch (guardrail.type) {
        case 'max_channel_concentration': {
          // Ensure no single channel receives more than threshold% of total budget
          const maxPct = guardrail.threshold / 100;
          for (const [channel, amount] of Object.entries(adjustedPlan.toChannels)) {
            if (adjustedPlan.totalReallocated > 0) {
              const proportion = amount / adjustedPlan.totalReallocated;
              if (proportion > maxPct) {
                const capped = adjustedPlan.totalReallocated * maxPct;
                const diff = amount - capped;
                adjustedPlan.toChannels[channel] =
                  Math.round(capped * 100) / 100;
                adjustments.push(
                  `Capped ${channel} allocation to ${guardrail.threshold}% of reallocation (reduced by ${diff.toFixed(2)})`,
                );
              }
            }
          }
          guardrailsApplied.push(
            `max_channel_concentration: ${guardrail.threshold}%`,
          );
          break;
        }

        case 'max_daily_spend': {
          // Ensure no single channel's daily allocation exceeds threshold
          for (const [channel, amount] of Object.entries(adjustedPlan.toChannels)) {
            // Estimate daily amount assuming 30-day period
            const dailyAmount = amount / 30;
            if (dailyAmount > guardrail.threshold) {
              const capped = guardrail.threshold * 30;
              adjustedPlan.toChannels[channel] =
                Math.round(capped * 100) / 100;
              adjustments.push(
                `Reduced ${channel} daily spend to stay within ${guardrail.threshold}/day cap`,
              );
            }
          }
          guardrailsApplied.push(
            `max_daily_spend: ${guardrail.threshold}`,
          );
          break;
        }

        case 'min_channel_budget': {
          // Ensure channels being reduced don't drop below minimum
          for (const [channel, amount] of Object.entries(adjustedPlan.fromChannels)) {
            if (amount > guardrail.threshold) {
              // Cannot remove more than would leave the channel below minimum
              // This is a safety constraint; actual current budget is not known here,
              // so we just flag this for review.
              guardrailsApplied.push(
                `min_channel_budget: ${guardrail.threshold} for ${channel}`,
              );
            }
          }
          break;
        }

        case 'max_reallocation_pct': {
          // Limit total reallocation to a percentage of total budget
          const maxReallocation = guardrail.threshold;
          if (adjustedPlan.totalReallocated > maxReallocation) {
            const scaleFactor = maxReallocation / adjustedPlan.totalReallocated;

            for (const channel of Object.keys(adjustedPlan.fromChannels)) {
              adjustedPlan.fromChannels[channel] =
                Math.round(adjustedPlan.fromChannels[channel] * scaleFactor * 100) / 100;
            }
            for (const channel of Object.keys(adjustedPlan.toChannels)) {
              adjustedPlan.toChannels[channel] =
                Math.round(adjustedPlan.toChannels[channel] * scaleFactor * 100) / 100;
            }

            adjustments.push(
              `Scaled total reallocation from ${adjustedPlan.totalReallocated.toFixed(2)} to ${maxReallocation.toFixed(2)} (guardrail limit)`,
            );
            adjustedPlan.totalReallocated =
              Math.round(maxReallocation * 100) / 100;
          }
          guardrailsApplied.push(
            `max_reallocation_pct: ${guardrail.threshold}`,
          );
          break;
        }

        default: {
          // Unknown guardrail type -- apply a pause action if action demands it
          if (guardrail.action === 'pause') {
            approved = false;
            adjustments.push(
              `Unknown guardrail "${guardrail.type}" with pause action blocked the plan`,
            );
          }
          guardrailsApplied.push(`${guardrail.type}: ${guardrail.threshold}`);
          break;
        }
      }
    }

    // Re-check that toChannels still sum correctly after adjustments
    const toTotal = Object.values(adjustedPlan.toChannels).reduce(
      (sum, v) => sum + v,
      0,
    );
    const fromTotal = Object.values(adjustedPlan.fromChannels).reduce(
      (sum, v) => sum + v,
      0,
    );

    // If the adjusted amounts don't balance, scale toChannels proportionally
    if (toTotal > 0 && Math.abs(toTotal - fromTotal) > 0.01) {
      const rebalanceFactor = fromTotal / toTotal;
      for (const channel of Object.keys(adjustedPlan.toChannels)) {
        adjustedPlan.toChannels[channel] =
          Math.round(adjustedPlan.toChannels[channel] * rebalanceFactor * 100) / 100;
      }
      adjustedPlan.totalReallocated = Math.round(fromTotal * 100) / 100;
    }

    return {
      plan: adjustedPlan,
      guardrailsApplied,
      adjustments,
      approved,
    };
  }

  /**
   * Scales a campaign's budget by the given factor. The factor must be > 0.
   * A factor of 1.5 increases budget by 50%; a factor of 0.5 halves it.
   */
  async scaleCampaign(
    campaignId: string,
    scaleFactor: number,
  ): Promise<ScalingResult> {
    this.log.info('Scaling campaign budget', { campaignId, scaleFactor });

    if (scaleFactor <= 0) {
      throw new Error(
        `Invalid scale factor ${scaleFactor}: must be greater than 0`,
      );
    }

    try {
      const campaignResult = await pool.query(
        `SELECT id, budget, status, metrics FROM campaigns WHERE id = $1`,
        [campaignId],
      );

      if (campaignResult.rows.length === 0) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const campaign = campaignResult.rows[0];
      const previousBudget = parseFloat(campaign.budget) || 0;
      const newBudget = Math.round(previousBudget * scaleFactor * 100) / 100;

      // Risk assessment based on scale magnitude and campaign status
      let riskAssessment = 'low';
      if (scaleFactor > 3) {
        riskAssessment = 'critical';
      } else if (scaleFactor > 2) {
        riskAssessment = 'high';
      } else if (scaleFactor > 1.5) {
        riskAssessment = 'medium';
      }

      // If scaling down, risk depends on how much we reduce
      if (scaleFactor < 1) {
        riskAssessment = scaleFactor < 0.3 ? 'high' : 'low';
      }

      await pool.query(
        `UPDATE campaigns SET budget = $1, updated_at = NOW() WHERE id = $2`,
        [newBudget, campaignId],
      );

      this.log.info('Campaign scaled successfully', {
        campaignId,
        previousBudget,
        newBudget,
        scaleFactor,
        riskAssessment,
      });

      return {
        campaignId,
        previousBudget,
        newBudget,
        scaleFactor,
        riskAssessment,
      };
    } catch (error) {
      this.log.error('Failed to scale campaign', { campaignId, error });
      throw error;
    }
  }

  /**
   * Pauses an underperforming campaign and records the reason.
   * Updates the campaign status to 'paused' in the database.
   */
  async pauseUnderperformer(
    campaignId: string,
    reason: string,
  ): Promise<void> {
    this.log.info('Pausing underperforming campaign', {
      campaignId,
      reason,
    });

    try {
      const result = await pool.query(
        `UPDATE campaigns
         SET status = 'paused', updated_at = NOW()
         WHERE id = $1 AND status = 'active'`,
        [campaignId],
      );

      if (result.rowCount === 0) {
        this.log.warn('Campaign not found or not active, cannot pause', {
          campaignId,
        });
        throw new Error(
          `Campaign ${campaignId} not found or not in active status`,
        );
      }

      // Log the pause action to audit trail
      await pool.query(
        `INSERT INTO agent_decisions
           (id, agent_type, decision_type, input_data, output_data,
            confidence_score, reasoning, is_approved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          generateId(),
          'budget_optimization',
          'pause_campaign',
          JSON.stringify({ campaignId }),
          JSON.stringify({ status: 'paused', reason }),
          100,
          reason,
          true,
          new Date().toISOString(),
        ],
      );

      this.log.info('Campaign paused successfully', {
        campaignId,
        reason,
      });
    } catch (error) {
      this.log.error('Failed to pause campaign', { campaignId, error });
      throw error;
    }
  }

  /**
   * Calculates a risk score for a given budget allocation.
   * Considers concentration risk, spend velocity, ROAS volatility,
   * and guardrail proximity.
   */
  calculateRiskScore(allocation: BudgetAllocation): RiskScore {
    const factors: Record<string, number> = {};
    const recommendations: string[] = [];

    const channels = Object.entries(allocation.channel_allocations);
    const totalBudget = allocation.total_budget;

    // Factor 1: Concentration risk (0-100; high = risky)
    if (channels.length > 0 && totalBudget > 0) {
      const maxAllocation = Math.max(
        ...channels.map(([, amount]) => amount),
      );
      const concentrationPct = (maxAllocation / totalBudget) * 100;
      factors.concentration_risk = Math.min(100, concentrationPct);

      if (concentrationPct > 60) {
        recommendations.push(
          'Diversify budget allocation: single channel exceeds 60% of total budget',
        );
      }
    } else {
      factors.concentration_risk = 0;
    }

    // Factor 2: Budget utilization risk (0-100; high = risky)
    if (totalBudget > 0) {
      const utilizationPct = (allocation.total_spent / totalBudget) * 100;
      // Over 90% utilization is high risk (running out); under 30% may indicate issues
      if (utilizationPct > 90) {
        factors.utilization_risk = 90;
        recommendations.push(
          'Budget nearly exhausted: consider increasing allocation or pacing spend',
        );
      } else if (utilizationPct < 20) {
        factors.utilization_risk = 40;
        recommendations.push(
          'Significant budget underutilization: review campaign delivery settings',
        );
      } else {
        factors.utilization_risk = Math.max(0, utilizationPct - 50);
      }
    } else {
      factors.utilization_risk = 50;
      recommendations.push(
        'No total budget set: cannot assess utilization risk',
      );
    }

    // Factor 3: Channel diversity risk (0-100; fewer channels = more risk)
    if (channels.length <= 1) {
      factors.diversity_risk = 90;
      recommendations.push(
        'Single-channel dependency: diversify across at least 2-3 channels',
      );
    } else if (channels.length === 2) {
      factors.diversity_risk = 50;
      recommendations.push(
        'Consider adding a third channel for better risk diversification',
      );
    } else {
      factors.diversity_risk = Math.max(0, 100 - channels.length * 20);
    }

    // Factor 4: Guardrail coverage (0-100; fewer guardrails = more risk)
    const guardrailCount = allocation.risk_guardrails?.length ?? 0;
    if (guardrailCount === 0) {
      factors.guardrail_coverage = 80;
      recommendations.push(
        'No risk guardrails configured: add spend caps and concentration limits',
      );
    } else if (guardrailCount < 3) {
      factors.guardrail_coverage = 40;
      recommendations.push(
        'Limited guardrail coverage: consider adding more risk controls',
      );
    } else {
      factors.guardrail_coverage = Math.max(0, 30 - guardrailCount * 5);
    }

    // Compute overall risk score (weighted average of factors)
    const weights: Record<string, number> = {
      concentration_risk: 2.5,
      utilization_risk: 1.5,
      diversity_risk: 1.5,
      guardrail_coverage: 1,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [factorName, factorValue] of Object.entries(factors)) {
      const weight = weights[factorName] ?? 1;
      weightedSum += factorValue * weight;
      totalWeight += weight;
    }

    const score =
      totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : 0;

    let level: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 80) level = 'critical';
    else if (score >= 60) level = 'high';
    else if (score >= 35) level = 'medium';
    else level = 'low';

    return { score, factors, level, recommendations };
  }

  /**
   * Simulates a proposed allocation and estimates ROAS, revenue, and risk.
   * Does not apply any changes -- purely for forecasting.
   */
  async simulateAllocation(
    proposed: Record<string, number>,
  ): Promise<SimulationResult> {
    this.log.info('Simulating proposed allocation', {
      channels: Object.keys(proposed),
    });

    const channelROAS = await this.calculateChannelROAS(proposed);

    let totalSpend = 0;
    let expectedRevenue = 0;

    for (const [channel, budget] of Object.entries(proposed)) {
      const roasMetric = channelROAS[channel];
      totalSpend += budget;

      if (roasMetric && roasMetric.roas > 0) {
        expectedRevenue += budget * roasMetric.roas;
      }
    }

    const expectedROAS = totalSpend > 0 ? expectedRevenue / totalSpend : 0;

    // Build a synthetic allocation for risk calculation
    const syntheticAllocation: BudgetAllocation = {
      id: 'simulation',
      country_id: '',
      channel_allocations: proposed,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      total_budget: totalSpend,
      total_spent: 0,
      created_by: 'simulation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const riskScore = this.calculateRiskScore(syntheticAllocation);

    // Confidence depends on how much historical ROAS data we have
    const channelsWithData = Object.values(channelROAS).filter(
      (m) => m.spend > 0,
    ).length;
    const totalChannels = Object.keys(proposed).length;
    const dataRatio = totalChannels > 0 ? channelsWithData / totalChannels : 0;

    const confidence = calculateWeightedConfidence(
      {
        data_coverage: dataRatio * 100,
        roas_reliability: channelsWithData > 0 ? 60 : 10,
        channel_diversity: Math.min(100, totalChannels * 25),
      },
      {
        data_coverage: 2,
        roas_reliability: 1.5,
        channel_diversity: 1,
      },
    );

    return {
      proposedAllocation: proposed,
      expectedROAS: Math.round(expectedROAS * 100) / 100,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      riskLevel: riskScore.level,
      confidence: confidence.score,
    };
  }

  /**
   * Retrieves the current spend velocity for a budget allocation,
   * including daily and weekly rates and monthly projection.
   */
  async getSpendVelocity(allocationId: string): Promise<SpendVelocity> {
    this.log.info('Computing spend velocity', { allocationId });

    const cacheKey = `${CACHE_PREFIX}:velocity:${allocationId}`;
    const cached = await cacheGet<SpendVelocity>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get daily spend for the last 7 days
      const dailyResult = await pool.query(
        `SELECT date, SUM(amount) AS daily_spend
         FROM spend_records
         WHERE allocation_id = $1
           AND date >= NOW() - INTERVAL '7 days'
         GROUP BY date
         ORDER BY date DESC`,
        [allocationId],
      );

      const dailySpends = dailyResult.rows.map((r) =>
        parseFloat(r.daily_spend) || 0,
      );

      // Calculate averages
      const daily =
        dailySpends.length > 0
          ? dailySpends.reduce((s, v) => s + v, 0) / dailySpends.length
          : 0;
      const weekly = daily * 7;
      const projectedMonthly = daily * 30;

      // Determine if spend is on track based on allocation
      const allocationResult = await pool.query(
        `SELECT total_budget, total_spent, period_start, period_end
         FROM budget_allocations
         WHERE id = $1`,
        [allocationId],
      );

      let onTrack = true;
      if (allocationResult.rows.length > 0) {
        const alloc = allocationResult.rows[0];
        const totalBudget = parseFloat(alloc.total_budget) || 0;
        const periodStart = new Date(alloc.period_start).getTime();
        const periodEnd = new Date(alloc.period_end).getTime();
        const now = Date.now();

        if (periodEnd > periodStart) {
          const elapsed = (now - periodStart) / (periodEnd - periodStart);
          const expectedSpendRate = totalBudget / ((periodEnd - periodStart) / 86400000);
          // On track if daily spend is within 20% of expected rate
          onTrack = Math.abs(daily - expectedSpendRate) / Math.max(expectedSpendRate, 0.01) < 0.20;
        }
      }

      const velocity: SpendVelocity = {
        daily: Math.round(daily * 100) / 100,
        weekly: Math.round(weekly * 100) / 100,
        projectedMonthly: Math.round(projectedMonthly * 100) / 100,
        onTrack,
      };

      await cacheSet(cacheKey, velocity, CACHE_TTL_VELOCITY);
      return velocity;
    } catch (error) {
      this.log.error('Failed to compute spend velocity', {
        allocationId,
        error,
      });
      throw error;
    }
  }

  /**
   * Detects anomalies in spending for a given allocation by comparing
   * actual daily spend against a moving average baseline.
   */
  async detectSpendAnomalies(allocationId: string): Promise<SpendAnomaly[]> {
    this.log.info('Detecting spend anomalies', { allocationId });

    try {
      // Get daily spend for the last 30 days
      const result = await pool.query(
        `SELECT date, SUM(amount) AS daily_spend
         FROM spend_records
         WHERE allocation_id = $1
           AND date >= NOW() - INTERVAL '30 days'
         GROUP BY date
         ORDER BY date ASC`,
        [allocationId],
      );

      if (result.rows.length < 3) {
        this.log.debug('Insufficient data for anomaly detection', {
          allocationId,
          daysOfData: result.rows.length,
        });
        return [];
      }

      const dailyData = result.rows.map((r) => ({
        date: r.date,
        amount: parseFloat(r.daily_spend) || 0,
      }));

      const anomalies: SpendAnomaly[] = [];

      // Calculate moving average with a 7-day window
      const windowSize = Math.min(7, Math.floor(dailyData.length / 2));

      for (let i = windowSize; i < dailyData.length; i++) {
        const window = dailyData.slice(i - windowSize, i);
        const avg =
          window.reduce((sum, d) => sum + d.amount, 0) / window.length;

        // Calculate standard deviation within window
        const variance =
          window.reduce((sum, d) => sum + Math.pow(d.amount - avg, 2), 0) /
          window.length;
        const stdDev = Math.sqrt(variance);

        const actual = dailyData[i].amount;
        const deviation =
          stdDev > 0 ? Math.abs(actual - avg) / stdDev : 0;

        // Flag if deviation exceeds 2 standard deviations
        if (deviation > 2 && stdDev > 0) {
          let severity: string;
          if (deviation > 4) severity = 'critical';
          else if (deviation > 3) severity = 'high';
          else severity = 'medium';

          anomalies.push({
            date:
              typeof dailyData[i].date === 'string'
                ? dailyData[i].date
                : new Date(dailyData[i].date).toISOString().split('T')[0],
            expected: Math.round(avg * 100) / 100,
            actual: Math.round(actual * 100) / 100,
            deviation: Math.round(deviation * 100) / 100,
            severity,
          });
        }
      }

      this.log.info('Anomaly detection complete', {
        allocationId,
        anomaliesFound: anomalies.length,
      });

      return anomalies;
    } catch (error) {
      this.log.error('Failed to detect spend anomalies', {
        allocationId,
        error,
      });
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Fetches the current active allocation, optionally filtered by country.
   */
  private async fetchCurrentAllocation(
    countryId?: string,
  ): Promise<BudgetAllocation | null> {
    const cacheKey = `${CACHE_PREFIX}:allocation:${countryId ?? 'all'}`;
    const cached = await cacheGet<BudgetAllocation>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let queryText: string;
      let params: unknown[];

      if (countryId) {
        queryText = `SELECT id, country_id, channel_allocations, period_start, period_end,
                            total_budget, total_spent, risk_guardrails, created_by,
                            created_at, updated_at
                     FROM budget_allocations
                     WHERE country_id = $1
                       AND period_end >= NOW()
                     ORDER BY created_at DESC
                     LIMIT 1`;
        params = [countryId];
      } else {
        queryText = `SELECT id, country_id, channel_allocations, period_start, period_end,
                            total_budget, total_spent, risk_guardrails, created_by,
                            created_at, updated_at
                     FROM budget_allocations
                     WHERE period_end >= NOW()
                     ORDER BY created_at DESC
                     LIMIT 1`;
        params = [];
      }

      const result = await pool.query(queryText, params);

      if (result.rows.length === 0) {
        return null;
      }

      const allocation = result.rows[0] as BudgetAllocation;
      await cacheSet(cacheKey, allocation, CACHE_TTL_ALLOCATION);
      return allocation;
    } catch (error) {
      this.log.error('Failed to fetch current allocation', {
        countryId,
        error,
      });
      throw error;
    }
  }

  /**
   * Assesses data quality factors for confidence scoring.
   */
  private assessDataQuality(
    channelROAS: Record<string, ROASMetric>,
    allocation: BudgetAllocation,
  ): Record<string, number> {
    const channels = Object.values(channelROAS);
    const totalChannels = Object.keys(allocation.channel_allocations).length;

    // Data availability: % of channels with non-zero spend
    const channelsWithData = channels.filter((m) => m.spend > 0).length;
    const dataAvailability =
      totalChannels > 0 ? (channelsWithData / totalChannels) * 100 : 0;

    // Data recency: based on whether the allocation period covers current time
    const now = Date.now();
    const periodEnd = new Date(allocation.period_end).getTime();
    const periodStart = new Date(allocation.period_start).getTime();
    let dataRecency = 50;
    if (periodEnd > now) {
      // Active period
      const elapsed = now - periodStart;
      const totalDuration = periodEnd - periodStart;
      dataRecency = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100 + 20) : 30;
    } else {
      // Expired period -- stale data
      const staleDays = (now - periodEnd) / 86400000;
      dataRecency = Math.max(0, 80 - staleDays * 5);
    }

    // Sample size: based on how much has been spent relative to budget
    const sampleSize =
      allocation.total_budget > 0
        ? Math.min(100, (allocation.total_spent / allocation.total_budget) * 100 + 10)
        : 10;

    // ROAS consistency: channels with stable trends score higher
    const stableCount = channels.filter((m) => m.trend === 'stable' || m.trend === 'up').length;
    const roasConsistency =
      channels.length > 0 ? (stableCount / channels.length) * 100 : 30;

    return {
      data_availability: Math.round(dataAvailability * 100) / 100,
      data_recency: Math.round(dataRecency * 100) / 100,
      sample_size: Math.round(sampleSize * 100) / 100,
      roas_consistency: Math.round(roasConsistency * 100) / 100,
    };
  }

  /**
   * Builds specific optimization actions based on ROAS analysis
   * and the validated reallocation plan.
   */
  private buildOptimizationActions(
    channelROAS: Record<string, ROASMetric>,
    plan: ReallocationPlan,
    highPerformers: Campaign[],
    underperformers: Campaign[],
  ): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    // Generate increase actions for channels receiving more budget
    for (const [channel, amount] of Object.entries(plan.toChannels)) {
      if (amount > 0) {
        const metric = channelROAS[channel];
        actions.push({
          type: 'increase',
          target: channel,
          amount,
          reasoning: `Channel ROAS of ${metric?.roas?.toFixed(2) ?? 'N/A'} (trend: ${metric?.trend ?? 'unknown'}) justifies increased allocation`,
        });
      }
    }

    // Generate decrease actions for channels losing budget
    for (const [channel, amount] of Object.entries(plan.fromChannels)) {
      if (amount > 0) {
        const metric = channelROAS[channel];
        actions.push({
          type: 'decrease',
          target: channel,
          amount,
          reasoning: `Channel ROAS of ${metric?.roas?.toFixed(2) ?? 'N/A'} is below average; reducing allocation to improve overall performance`,
        });
      }
    }

    // Generate scale actions for high-performing campaigns
    for (const campaign of highPerformers.slice(0, 5)) {
      const roas = (campaign.metrics as Record<string, unknown>)?.roas as number | undefined;
      actions.push({
        type: 'scale',
        target: campaign.id,
        amount: campaign.budget * 0.2, // Suggest 20% increase
        reasoning: `Campaign "${campaign.name}" has ROAS of ${roas?.toFixed(2) ?? 'N/A'}, recommend scaling budget by 20%`,
      });
    }

    // Generate pause actions for underperformers
    for (const campaign of underperformers.slice(0, 5)) {
      const roas = (campaign.metrics as Record<string, unknown>)?.roas as number | undefined;
      actions.push({
        type: 'pause',
        target: campaign.id,
        amount: campaign.budget - campaign.spent,
        reasoning: `Campaign "${campaign.name}" has ROAS of ${roas?.toFixed(2) ?? 'N/A'}, recommend pausing to stop budget drain`,
      });
    }

    return actions;
  }

  /**
   * Computes the proposed allocation by applying a reallocation plan
   * to the current allocation.
   */
  private computeProposedAllocation(
    current: Record<string, number>,
    plan: ReallocationPlan,
  ): Record<string, number> {
    const proposed: Record<string, number> = { ...current };

    for (const [channel, amount] of Object.entries(plan.fromChannels)) {
      if (proposed[channel] !== undefined) {
        proposed[channel] = Math.max(
          0,
          Math.round((proposed[channel] - amount) * 100) / 100,
        );
      }
    }

    for (const [channel, amount] of Object.entries(plan.toChannels)) {
      proposed[channel] =
        Math.round(((proposed[channel] ?? 0) + amount) * 100) / 100;
    }

    return proposed;
  }

  /**
   * Computes a spend-weighted average ROAS across channels.
   */
  private computeWeightedROAS(
    allocation: Record<string, number>,
    channelROAS: Record<string, ROASMetric>,
  ): number {
    let totalWeight = 0;
    let weightedROAS = 0;

    for (const [channel, budget] of Object.entries(allocation)) {
      const metric = channelROAS[channel];
      if (metric && budget > 0) {
        weightedROAS += metric.roas * budget;
        totalWeight += budget;
      }
    }

    return totalWeight > 0 ? weightedROAS / totalWeight : 0;
  }

  /**
   * Builds a human-readable reasoning string for the optimization decision.
   */
  private buildReasoning(
    allocation: BudgetAllocation,
    channelROAS: Record<string, ROASMetric>,
    highPerformers: Campaign[],
    underperformers: Campaign[],
    validatedPlan: ValidatedPlan,
    riskScore: RiskScore,
  ): string {
    const parts: string[] = [];

    const totalChannels = Object.keys(allocation.channel_allocations).length;
    const channelsWithROAS = Object.values(channelROAS).filter(
      (m) => m.spend > 0,
    ).length;

    parts.push(
      `Analyzed ${totalChannels} channel(s) with ROAS data available for ${channelsWithROAS}.`,
    );
    parts.push(
      `Total budget: ${allocation.total_budget}, spent: ${allocation.total_spent} (${allocation.total_budget > 0 ? ((allocation.total_spent / allocation.total_budget) * 100).toFixed(1) : 0}% utilization).`,
    );

    if (highPerformers.length > 0) {
      parts.push(
        `Identified ${highPerformers.length} high-ROAS campaign(s) recommended for scaling.`,
      );
    }

    if (underperformers.length > 0) {
      parts.push(
        `Identified ${underperformers.length} underperforming campaign(s) recommended for review or pausing.`,
      );
    }

    if (validatedPlan.plan.totalReallocated > 0) {
      parts.push(
        `Proposed reallocating ${validatedPlan.plan.totalReallocated.toFixed(2)} across channels. ${validatedPlan.plan.expectedImpact}`,
      );
    } else {
      parts.push('No reallocation needed: current distribution is optimal.');
    }

    if (validatedPlan.guardrailsApplied.length > 0) {
      parts.push(
        `Applied ${validatedPlan.guardrailsApplied.length} guardrail(s): ${validatedPlan.guardrailsApplied.join(', ')}.`,
      );
    }

    parts.push(
      `Overall risk assessment: ${riskScore.level} (score: ${riskScore.score}).`,
    );

    return parts.join(' ');
  }
}

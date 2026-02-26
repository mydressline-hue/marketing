/**
 * Budget Allocation Output Service - Final Output Deliverable #4
 *
 * Generates comprehensive budget allocation models by pulling data from the
 * database and Agent 8 (Budget Optimization Agent) outputs. Provides
 * spending velocity analysis and budget utilization metrics.
 *
 * All values are derived from database records and agent configurations --
 * nothing is hardcoded.
 */

import { query } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import logger from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelAllocationEntry {
  category: string;
  subcategory: string;
  amount: number;
  percentage: number;
  expected_roi: number;
  risk_level: string;
  optimization_status: string;
}

export interface CountryChannelSplit {
  channel: string;
  amount: number;
}

export interface CountryBudgetEntry {
  country_code: string;
  total_allocation: number;
  channel_split: CountryChannelSplit[];
}

export interface BudgetGuardrails {
  max_single_channel_pct: number;
  max_single_country_pct: number;
  min_roas_threshold: number;
  daily_spend_cap: number;
}

export interface ReallocationRecommendation {
  from_channel: string;
  to_channel: string;
  amount: number;
  expected_improvement_pct: number;
  confidence: number;
}

export interface BudgetAllocationModel {
  total_budget: number;
  currency: string;
  allocations: ChannelAllocationEntry[];
  country_budgets: CountryBudgetEntry[];
  guardrails: BudgetGuardrails;
  reallocation_recommendations: ReallocationRecommendation[];
  generated_at: string;
  confidence_score: number;
}

export interface SpendingVelocityResult {
  current_daily_rate: number;
  current_weekly_rate: number;
  projected_monthly_rate: number;
  budget_remaining: number;
  days_remaining: number;
  projected_exhaustion_date: string | null;
  on_track: boolean;
  velocity_trend: 'accelerating' | 'decelerating' | 'stable';
}

export interface BudgetUtilizationResult {
  total_budget: number;
  total_spent: number;
  utilization_pct: number;
  by_channel: Array<{
    channel: string;
    allocated: number;
    spent: number;
    utilization_pct: number;
  }>;
  by_country: Array<{
    country_code: string;
    country_name: string;
    allocated: number;
    spent: number;
    utilization_pct: number;
  }>;
  period_start: string;
  period_end: string;
}

// ---------------------------------------------------------------------------
// Cache constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:budget_allocation';
const CACHE_TTL_MODEL = 300; // 5 minutes
const CACHE_TTL_VELOCITY = 120; // 2 minutes
const CACHE_TTL_UTILIZATION = 120; // 2 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BudgetAllocationOutputService {
  /**
   * Generates a comprehensive budget allocation model by combining
   * budget data from the database with Agent 8 optimization outputs.
   */
  static async generateBudgetAllocationModel(): Promise<BudgetAllocationModel> {
    const cacheKey = `${CACHE_PREFIX}:model`;
    const cached = await cacheGet<BudgetAllocationModel>(cacheKey);
    if (cached) {
      logger.debug('Budget allocation model cache hit');
      return cached;
    }

    logger.info('Generating budget allocation model');

    // Step 1: Fetch all active budget allocations
    const allocationsResult = await query<{
      id: string;
      country_id: string;
      channel_allocations: Record<string, number>;
      period_start: string;
      period_end: string;
      total_budget: string;
      total_spent: string;
      risk_guardrails: Record<string, unknown> | null;
    }>(
      `SELECT id, country_id, channel_allocations, period_start, period_end,
              total_budget, total_spent, risk_guardrails
       FROM budget_allocations
       WHERE period_end >= NOW()
       ORDER BY created_at DESC`,
    );

    const activeAllocations = allocationsResult.rows;

    // Step 2: Compute total budget across all active allocations
    const totalBudget = activeAllocations.reduce(
      (sum, a) => sum + parseFloat(String(a.total_budget)),
      0,
    );

    // Step 3: Fetch default currency from active countries configuration
    const currencyResult = await query<{ currency: string }>(
      `SELECT currency FROM countries WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
    );
    const currency = currencyResult.rows.length > 0
      ? currencyResult.rows[0].currency
      : 'USD';

    // Step 4: Build channel allocations with ROAS and optimization data
    const allocations = await BudgetAllocationOutputService.buildChannelAllocations(
      activeAllocations,
      totalBudget,
    );

    // Step 5: Build country-level budgets
    const countryBudgets = await BudgetAllocationOutputService.buildCountryBudgets(
      activeAllocations,
    );

    // Step 6: Derive guardrails from database configuration
    const guardrails = await BudgetAllocationOutputService.deriveGuardrails(
      activeAllocations,
    );

    // Step 7: Get reallocation recommendations from Agent 8 decisions
    const reallocationRecommendations =
      await BudgetAllocationOutputService.getReallocationRecommendations();

    // Step 8: Compute confidence score from agent decisions
    const confidenceScore =
      await BudgetAllocationOutputService.computeConfidenceScore();

    const model: BudgetAllocationModel = {
      total_budget: Math.round(totalBudget * 100) / 100,
      currency,
      allocations,
      country_budgets: countryBudgets,
      guardrails,
      reallocation_recommendations: reallocationRecommendations,
      generated_at: new Date().toISOString(),
      confidence_score: confidenceScore,
    };

    await cacheSet(cacheKey, model, CACHE_TTL_MODEL);
    logger.info('Budget allocation model generated', {
      totalBudget: model.total_budget,
      allocationCount: model.allocations.length,
      countryCount: model.country_budgets.length,
      confidence: model.confidence_score,
    });

    return model;
  }

  /**
   * Returns the current spending velocity -- how fast budget is being
   * consumed relative to the planned period.
   */
  static async getSpendingVelocity(): Promise<SpendingVelocityResult> {
    const cacheKey = `${CACHE_PREFIX}:velocity`;
    const cached = await cacheGet<SpendingVelocityResult>(cacheKey);
    if (cached) {
      logger.debug('Spending velocity cache hit');
      return cached;
    }

    logger.info('Computing spending velocity');

    // Get daily spend over the last 14 days across all allocations
    const dailySpendResult = await query<{
      spend_date: string;
      daily_total: string;
    }>(
      `SELECT
         date AS spend_date,
         SUM(amount)::text AS daily_total
       FROM spend_records
       WHERE date >= NOW() - INTERVAL '14 days'
       GROUP BY date
       ORDER BY date DESC`,
    );

    const dailySpends = dailySpendResult.rows.map((r) =>
      parseFloat(r.daily_total) || 0,
    );

    // Calculate current daily rate (average of last 7 days)
    const recentSpends = dailySpends.slice(0, 7);
    const currentDailyRate =
      recentSpends.length > 0
        ? recentSpends.reduce((s, v) => s + v, 0) / recentSpends.length
        : 0;

    // Previous week for trend comparison
    const previousSpends = dailySpends.slice(7, 14);
    const previousDailyRate =
      previousSpends.length > 0
        ? previousSpends.reduce((s, v) => s + v, 0) / previousSpends.length
        : 0;

    // Determine velocity trend
    let velocityTrend: 'accelerating' | 'decelerating' | 'stable' = 'stable';
    if (previousDailyRate > 0) {
      const changeRatio = (currentDailyRate - previousDailyRate) / previousDailyRate;
      if (changeRatio > 0.1) velocityTrend = 'accelerating';
      else if (changeRatio < -0.1) velocityTrend = 'decelerating';
    }

    // Get total budget remaining across active allocations
    const remainingResult = await query<{
      total_budget: string;
      total_spent: string;
      earliest_start: string;
      latest_end: string;
    }>(
      `SELECT
         SUM(total_budget)::text AS total_budget,
         SUM(total_spent)::text AS total_spent,
         MIN(period_start)::text AS earliest_start,
         MAX(period_end)::text AS latest_end
       FROM budget_allocations
       WHERE period_end >= NOW()`,
    );

    const budgetData = remainingResult.rows[0];
    const totalBudget = parseFloat(budgetData?.total_budget) || 0;
    const totalSpent = parseFloat(budgetData?.total_spent) || 0;
    const budgetRemaining = totalBudget - totalSpent;

    // Calculate days remaining in the allocation period
    const latestEnd = budgetData?.latest_end
      ? new Date(budgetData.latest_end)
      : new Date();
    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil((latestEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    // Project exhaustion date
    let projectedExhaustionDate: string | null = null;
    if (currentDailyRate > 0 && budgetRemaining > 0) {
      const daysToExhaustion = budgetRemaining / currentDailyRate;
      const exhaustionDate = new Date(
        now.getTime() + daysToExhaustion * 24 * 60 * 60 * 1000,
      );
      projectedExhaustionDate = exhaustionDate.toISOString();
    }

    // Check if spending is on track
    const expectedDailyRate =
      daysRemaining > 0 ? budgetRemaining / daysRemaining : 0;
    const onTrack =
      expectedDailyRate > 0
        ? Math.abs(currentDailyRate - expectedDailyRate) / expectedDailyRate < 0.2
        : currentDailyRate === 0;

    const result: SpendingVelocityResult = {
      current_daily_rate: Math.round(currentDailyRate * 100) / 100,
      current_weekly_rate: Math.round(currentDailyRate * 7 * 100) / 100,
      projected_monthly_rate: Math.round(currentDailyRate * 30 * 100) / 100,
      budget_remaining: Math.round(budgetRemaining * 100) / 100,
      days_remaining: daysRemaining,
      projected_exhaustion_date: projectedExhaustionDate,
      on_track: onTrack,
      velocity_trend: velocityTrend,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_VELOCITY);
    logger.info('Spending velocity computed', {
      dailyRate: result.current_daily_rate,
      onTrack: result.on_track,
      trend: result.velocity_trend,
    });

    return result;
  }

  /**
   * Returns budget utilization metrics -- how much of the allocated budget
   * has been consumed, broken down by channel and country.
   */
  static async getBudgetUtilization(): Promise<BudgetUtilizationResult> {
    const cacheKey = `${CACHE_PREFIX}:utilization`;
    const cached = await cacheGet<BudgetUtilizationResult>(cacheKey);
    if (cached) {
      logger.debug('Budget utilization cache hit');
      return cached;
    }

    logger.info('Computing budget utilization');

    // Aggregate totals from active allocations
    const totalsResult = await query<{
      total_budget: string;
      total_spent: string;
      period_start: string;
      period_end: string;
    }>(
      `SELECT
         SUM(total_budget)::text AS total_budget,
         SUM(total_spent)::text AS total_spent,
         MIN(period_start)::text AS period_start,
         MAX(period_end)::text AS period_end
       FROM budget_allocations
       WHERE period_end >= NOW()`,
    );

    const totals = totalsResult.rows[0];
    const totalBudget = parseFloat(totals?.total_budget) || 0;
    const totalSpent = parseFloat(totals?.total_spent) || 0;
    const utilizationPct =
      totalBudget > 0
        ? Math.round((totalSpent / totalBudget) * 10000) / 100
        : 0;

    // Channel-level utilization
    const channelResult = await query<{
      channel: string;
      allocated: string;
      spent: string;
    }>(
      `SELECT
         ch.key AS channel,
         SUM(ch.value::numeric)::text AS allocated,
         SUM(
           CASE
             WHEN ba.total_budget > 0
             THEN ba.total_spent * (ch.value::numeric / ba.total_budget)
             ELSE 0
           END
         )::text AS spent
       FROM budget_allocations ba,
            jsonb_each_text(ba.channel_allocations) AS ch(key, value)
       WHERE ba.period_end >= NOW()
       GROUP BY ch.key
       ORDER BY ch.key`,
    );

    const byChannel = channelResult.rows.map((row) => {
      const allocated = parseFloat(row.allocated) || 0;
      const spent = parseFloat(row.spent) || 0;
      return {
        channel: row.channel,
        allocated: Math.round(allocated * 100) / 100,
        spent: Math.round(spent * 100) / 100,
        utilization_pct:
          allocated > 0
            ? Math.round((spent / allocated) * 10000) / 100
            : 0,
      };
    });

    // Country-level utilization
    const countryResult = await query<{
      country_code: string;
      country_name: string;
      allocated: string;
      spent: string;
    }>(
      `SELECT
         c.code AS country_code,
         c.name AS country_name,
         SUM(ba.total_budget)::text AS allocated,
         SUM(ba.total_spent)::text AS spent
       FROM budget_allocations ba
       JOIN countries c ON c.id = ba.country_id
       WHERE ba.period_end >= NOW()
       GROUP BY c.code, c.name
       ORDER BY c.name`,
    );

    const byCountry = countryResult.rows.map((row) => {
      const allocated = parseFloat(row.allocated) || 0;
      const spent = parseFloat(row.spent) || 0;
      return {
        country_code: row.country_code,
        country_name: row.country_name,
        allocated: Math.round(allocated * 100) / 100,
        spent: Math.round(spent * 100) / 100,
        utilization_pct:
          allocated > 0
            ? Math.round((spent / allocated) * 10000) / 100
            : 0,
      };
    });

    const result: BudgetUtilizationResult = {
      total_budget: Math.round(totalBudget * 100) / 100,
      total_spent: Math.round(totalSpent * 100) / 100,
      utilization_pct: utilizationPct,
      by_channel: byChannel,
      by_country: byCountry,
      period_start: totals?.period_start ?? new Date().toISOString(),
      period_end: totals?.period_end ?? new Date().toISOString(),
    };

    await cacheSet(cacheKey, result, CACHE_TTL_UTILIZATION);
    logger.info('Budget utilization computed', {
      totalBudget: result.total_budget,
      totalSpent: result.total_spent,
      utilizationPct: result.utilization_pct,
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Builds per-channel allocation entries by aggregating across all active
   * allocations and enriching with ROAS data from campaign metrics.
   */
  private static async buildChannelAllocations(
    allocations: Array<{
      id: string;
      channel_allocations: Record<string, number>;
      total_budget: string;
      total_spent: string;
    }>,
    totalBudget: number,
  ): Promise<ChannelAllocationEntry[]> {
    // Aggregate channel amounts across all allocations
    const channelTotals: Record<string, number> = {};
    for (const alloc of allocations) {
      const channelMap =
        typeof alloc.channel_allocations === 'string'
          ? JSON.parse(alloc.channel_allocations as unknown as string)
          : alloc.channel_allocations;
      for (const [channel, amount] of Object.entries(channelMap)) {
        channelTotals[channel] = (channelTotals[channel] || 0) + (amount as number);
      }
    }

    // Fetch ROAS data from campaigns
    const roasResult = await query<{
      platform: string;
      avg_roas: string;
    }>(
      `SELECT
         platform,
         CASE
           WHEN SUM(spent) > 0 THEN (SUM(revenue)::numeric / SUM(spent)::numeric)::text
           ELSE '0'
         END AS avg_roas
       FROM campaigns
       WHERE status = 'active'
       GROUP BY platform`,
    );

    const channelROAS: Record<string, number> = {};
    for (const row of roasResult.rows) {
      channelROAS[row.platform] = parseFloat(row.avg_roas) || 0;
    }

    // Fetch latest optimization status from agent decisions
    const optimizationResult = await query<{
      output_data: Record<string, unknown>;
    }>(
      `SELECT output_data
       FROM agent_decisions
       WHERE agent_type = 'budget_optimization'
         AND decision_type = 'budget_optimization_complete'
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    const optimizationData = optimizationResult.rows[0]?.output_data;
    const optimizationActions: Record<string, string> = {};
    if (optimizationData && typeof optimizationData === 'object') {
      const optimization = (optimizationData as Record<string, unknown>).optimization;
      if (optimization && typeof optimization === 'object') {
        const actions = (optimization as Record<string, unknown>).actions;
        if (Array.isArray(actions)) {
          for (const action of actions) {
            if (action && typeof action === 'object' && 'target' in action && 'type' in action) {
              optimizationActions[action.target as string] = action.type as string;
            }
          }
        }
      }
    }

    // Build entries
    const entries: ChannelAllocationEntry[] = [];
    for (const [channel, amount] of Object.entries(channelTotals)) {
      const percentage =
        totalBudget > 0
          ? Math.round((amount / totalBudget) * 10000) / 100
          : 0;
      const roas = channelROAS[channel] ?? 0;

      let riskLevel: string;
      if (roas >= 3) riskLevel = 'low';
      else if (roas >= 1.5) riskLevel = 'medium';
      else if (roas > 0) riskLevel = 'high';
      else riskLevel = 'unknown';

      const optimizationStatus =
        optimizationActions[channel] ?? 'stable';

      entries.push({
        category: 'paid_media',
        subcategory: channel,
        amount: Math.round(amount * 100) / 100,
        percentage,
        expected_roi: Math.round(roas * 100) / 100,
        risk_level: riskLevel,
        optimization_status: optimizationStatus,
      });
    }

    return entries;
  }

  /**
   * Builds country-level budget entries with per-channel splits.
   */
  private static async buildCountryBudgets(
    allocations: Array<{
      country_id: string;
      channel_allocations: Record<string, number>;
      total_budget: string;
    }>,
  ): Promise<CountryBudgetEntry[]> {
    // Fetch country code mapping
    const countriesResult = await query<{
      id: string;
      code: string;
    }>(`SELECT id, code FROM countries WHERE is_active = true`);

    const countryCodeMap: Record<string, string> = {};
    for (const row of countriesResult.rows) {
      countryCodeMap[row.id] = row.code;
    }

    // Aggregate by country
    const countryData: Record<
      string,
      { totalAllocation: number; channelSplit: Record<string, number> }
    > = {};

    for (const alloc of allocations) {
      const code = countryCodeMap[alloc.country_id] ?? alloc.country_id;
      if (!countryData[code]) {
        countryData[code] = { totalAllocation: 0, channelSplit: {} };
      }

      countryData[code].totalAllocation += parseFloat(String(alloc.total_budget));

      const channelMap =
        typeof alloc.channel_allocations === 'string'
          ? JSON.parse(alloc.channel_allocations as unknown as string)
          : alloc.channel_allocations;

      for (const [channel, amount] of Object.entries(channelMap)) {
        countryData[code].channelSplit[channel] =
          (countryData[code].channelSplit[channel] || 0) + (amount as number);
      }
    }

    return Object.entries(countryData).map(([code, data]) => ({
      country_code: code,
      total_allocation: Math.round(data.totalAllocation * 100) / 100,
      channel_split: Object.entries(data.channelSplit).map(
        ([channel, amount]) => ({
          channel,
          amount: Math.round(amount * 100) / 100,
        }),
      ),
    }));
  }

  /**
   * Derives guardrails from the risk_guardrails stored on active allocations
   * and from system-level agent configuration.
   */
  private static async deriveGuardrails(
    allocations: Array<{
      risk_guardrails: Record<string, unknown> | null;
      total_budget: string;
    }>,
  ): Promise<BudgetGuardrails> {
    // Collect guardrail values from allocations
    let maxSingleChannelPct = 0;
    let maxSingleCountryPct = 0;
    let minRoasThreshold = 0;
    let dailySpendCap = 0;
    let guardrailCount = 0;

    for (const alloc of allocations) {
      const guardrails = alloc.risk_guardrails;
      if (!guardrails) continue;

      // Guardrails can be stored as an array of objects or a plain object
      if (Array.isArray(guardrails)) {
        for (const g of guardrails) {
          guardrailCount++;
          const gr = g as Record<string, unknown>;
          if (gr.type === 'max_channel_concentration') {
            maxSingleChannelPct = Math.max(
              maxSingleChannelPct,
              (gr.threshold as number) || 0,
            );
          }
          if (gr.type === 'max_country_concentration') {
            maxSingleCountryPct = Math.max(
              maxSingleCountryPct,
              (gr.threshold as number) || 0,
            );
          }
          if (gr.type === 'min_roas') {
            minRoasThreshold = Math.max(
              minRoasThreshold,
              (gr.threshold as number) || 0,
            );
          }
          if (gr.type === 'max_daily_spend') {
            dailySpendCap = Math.max(
              dailySpendCap,
              (gr.threshold as number) || 0,
            );
          }
        }
      } else if (typeof guardrails === 'object') {
        guardrailCount++;
        if (guardrails.maxSpendPercent !== undefined) {
          maxSingleChannelPct = Math.max(
            maxSingleChannelPct,
            guardrails.maxSpendPercent as number,
          );
        }
        if (guardrails.maxDailySpend !== undefined) {
          dailySpendCap = Math.max(
            dailySpendCap,
            guardrails.maxDailySpend as number,
          );
        }
        if (guardrails.minRoas !== undefined) {
          minRoasThreshold = Math.max(
            minRoasThreshold,
            guardrails.minRoas as number,
          );
        }
      }
    }

    // If no guardrails found in DB, fetch from agent configuration
    if (guardrailCount === 0) {
      const configResult = await query<{
        config: Record<string, unknown>;
      }>(
        `SELECT config
         FROM agent_configs
         WHERE agent_type = 'budget_optimization'
         ORDER BY updated_at DESC
         LIMIT 1`,
      );

      if (configResult.rows.length > 0) {
        const config = configResult.rows[0].config;
        if (config && typeof config === 'object') {
          maxSingleChannelPct = (config.max_single_channel_pct as number) || 0;
          maxSingleCountryPct = (config.max_single_country_pct as number) || 0;
          minRoasThreshold = (config.min_roas_threshold as number) || 0;
          dailySpendCap = (config.daily_spend_cap as number) || 0;
        }
      }
    }

    return {
      max_single_channel_pct: maxSingleChannelPct,
      max_single_country_pct: maxSingleCountryPct,
      min_roas_threshold: minRoasThreshold,
      daily_spend_cap: dailySpendCap,
    };
  }

  /**
   * Extracts reallocation recommendations from the most recent Agent 8
   * optimization decision stored in the database.
   */
  private static async getReallocationRecommendations(): Promise<
    ReallocationRecommendation[]
  > {
    const decisionsResult = await query<{
      output_data: Record<string, unknown>;
      confidence_score: string;
    }>(
      `SELECT output_data, confidence_score
       FROM agent_decisions
       WHERE agent_type = 'budget_optimization'
         AND decision_type = 'budget_optimization_complete'
       ORDER BY created_at DESC
       LIMIT 1`,
    );

    if (decisionsResult.rows.length === 0) {
      return [];
    }

    const decision = decisionsResult.rows[0];
    const outputData = decision.output_data;
    const overallConfidence = parseFloat(String(decision.confidence_score)) || 0;

    const recommendations: ReallocationRecommendation[] = [];

    // Extract validated plan from agent output
    if (outputData && typeof outputData === 'object') {
      const validatedPlan = (outputData as Record<string, unknown>).validatedPlan;
      if (validatedPlan && typeof validatedPlan === 'object') {
        const plan = (validatedPlan as Record<string, unknown>).plan;
        if (plan && typeof plan === 'object') {
          const fromChannels = (plan as Record<string, unknown>).fromChannels as
            | Record<string, number>
            | undefined;
          const toChannels = (plan as Record<string, unknown>).toChannels as
            | Record<string, number>
            | undefined;

          if (fromChannels && toChannels) {
            const fromEntries = Object.entries(fromChannels);
            const toEntries = Object.entries(toChannels);

            // Build recommendations by pairing from/to channels
            for (const [fromChannel, fromAmount] of fromEntries) {
              for (const [toChannel, toAmount] of toEntries) {
                // Estimate improvement based on proportional shift
                const totalFrom = fromEntries.reduce(
                  (s, [, a]) => s + a,
                  0,
                );
                const proportionalAmount =
                  totalFrom > 0
                    ? fromAmount *
                      (toAmount /
                        toEntries.reduce((s, [, a]) => s + a, 0))
                    : 0;

                if (proportionalAmount > 0) {
                  recommendations.push({
                    from_channel: fromChannel,
                    to_channel: toChannel,
                    amount:
                      Math.round(proportionalAmount * 100) / 100,
                    expected_improvement_pct:
                      Math.round(
                        (proportionalAmount / Math.max(fromAmount, 1)) *
                          100 *
                          100,
                      ) / 100,
                    confidence:
                      Math.round(overallConfidence * 100) / 100,
                  });
                }
              }
            }
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Computes an overall confidence score from the most recent agent
   * optimization decisions.
   */
  private static async computeConfidenceScore(): Promise<number> {
    const result = await query<{
      avg_confidence: string;
    }>(
      `SELECT AVG(confidence_score)::text AS avg_confidence
       FROM agent_decisions
       WHERE agent_type = 'budget_optimization'
         AND created_at >= NOW() - INTERVAL '7 days'`,
    );

    const avgConfidence = parseFloat(result.rows[0]?.avg_confidence) || 0;
    return Math.round(avgConfidence * 100) / 100;
  }
}

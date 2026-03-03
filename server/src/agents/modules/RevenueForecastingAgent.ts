// ============================================================
// AI International Growth Engine - Revenue Forecasting Agent
// Agent 19: Revenue Forecasting & Financial Modeling
//
// Performs predictive revenue modeling (via Opus), LTV/CAC
// analysis, break-even calculations, and scenario simulations
// (conservative / base / aggressive). Projects ROI, payback
// periods, and sensitivity analyses for investment planning.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/types';
import type { AgentType } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { retryWithBackoff } from '../../utils/helpers';

// ---- Cache Configuration ----

/** Cache key prefix for revenue forecasting data */
const CACHE_PREFIX = 'revenue_forecasting';

/** Cache TTL in seconds (5 minutes — financial data refreshes frequently) */
const CACHE_TTL = 300;

// ---- Scenario Growth Multipliers ----

/**
 * Default growth rate multipliers applied to each scenario tier.
 * These are applied against the base growth rate derived from historical data.
 */
const SCENARIO_MULTIPLIERS = {
  conservative: 0.6,
  base: 1.0,
  aggressive: 1.5,
} as const;

/**
 * Default probability weights for each scenario.
 * Used when historical data is insufficient to derive custom probabilities.
 */
const SCENARIO_PROBABILITIES = {
  conservative: 0.25,
  base: 0.50,
  aggressive: 0.25,
} as const;

// ---- Local Type Definitions ----

/** A single period within a revenue forecast timeline */
export interface ForecastPeriod {
  /** Label for the period (e.g. "2026-Q1", "Month 3") */
  period: string;
  /** Projected revenue for this period */
  revenue: number;
  /** Growth rate relative to the previous period (decimal, e.g. 0.05 = 5%) */
  growth: number;
  /** Confidence in this period's projection (0-100) */
  confidence: number;
  /** Key revenue drivers for this period */
  drivers: string[];
}

/** Complete revenue forecast over a given horizon */
export interface RevenueForecast {
  /** Number of periods in the forecast */
  horizon: number;
  /** Individual period projections */
  periods: ForecastPeriod[];
  /** Sum of projected revenue across all periods */
  totalProjected: number;
  /** Overall confidence in the forecast (0-100) */
  confidence: number;
  /** Assumptions underpinning the forecast */
  assumptions: string[];
  /** Identified risks that could affect outcomes */
  risks: string[];
}

/** Lifetime Value model output */
export interface LTVModel {
  /** Average customer lifetime value across all segments */
  averageLTV: number;
  /** LTV broken down by customer segment */
  bySegment: Record<string, number>;
  /** Ratio of average LTV to average CAC */
  ltvToCAC: number;
  /** Projected growth rate of LTV over next period */
  projectedGrowth: number;
  /** Description of the calculation methodology used */
  methodology: string;
  /** Confidence in the model (0-100) */
  confidence: number;
}

/** Customer Acquisition Cost model output */
export interface CACModel {
  /** Average CAC across all channels */
  averageCAC: number;
  /** CAC broken down by acquisition channel */
  byChannel: Record<string, number>;
  /** Directional trend of CAC over recent periods */
  trend: 'increasing' | 'decreasing' | 'stable';
  /** Projected CAC for the next period */
  projectedCAC: number;
  /** Efficiency rating (0-100) where higher is more cost-efficient */
  efficiency: number;
}

/** Break-even analysis output */
export interface BreakEvenAnalysis {
  /** Revenue amount at which the business breaks even */
  breakEvenPoint: number;
  /** Estimated calendar time to reach break-even (e.g. "6 months") */
  timeToBreakEven: string;
  /** Total fixed costs used in the calculation */
  fixedCosts: number;
  /** Variable cost per unit/customer */
  variableCostPerUnit: number;
  /** Average revenue generated per unit/customer */
  averageRevPerUnit: number;
  /** Number of units/customers needed to break even */
  unitsToBreakEven: number;
  /** Sensitivity of break-even point to changes in key variables */
  sensitivity: Record<string, number>;
}

/** Configuration for a scenario simulation */
export interface ScenarioConfig {
  /** Which scenario tier to simulate */
  name: 'conservative' | 'base' | 'aggressive';
  /** Assumptions expressed as key-value numeric overrides */
  assumptions: Record<string, number>;
  /** Number of periods to simulate */
  horizon: number;
}

/** Result of a single scenario simulation */
export interface ScenarioResult {
  /** Scenario name */
  name: string;
  /** Total projected revenue */
  revenue: number;
  /** Total projected profit */
  profit: number;
  /** Return on investment (decimal, e.g. 1.5 = 150%) */
  roi: number;
  /** Period-by-period breakdown */
  timeline: ForecastPeriod[];
  /** Risks specific to this scenario */
  risks: string[];
  /** Probability of this scenario materializing (0-1) */
  probability: number;
}

/** Comparison across all three scenario tiers */
export interface ScenarioComparison {
  conservative: ScenarioResult;
  base: ScenarioResult;
  aggressive: ScenarioResult;
  /** Strategic recommendation based on the comparison */
  recommendation: string;
  /** Confidence in the comparison (0-100) */
  confidence: number;
}

/** ROI projection for a specific investment */
export interface ROIProjection {
  /** The investment amount being evaluated */
  investment: number;
  /** The channel the investment targets */
  channel: string;
  /** Projected revenue from this investment */
  projectedRevenue: number;
  /** Projected ROI (decimal, e.g. 2.0 = 200%) */
  projectedROI: number;
  /** Estimated months until investment pays for itself */
  paybackMonths: number;
  /** Confidence in the projection (0-100) */
  confidence: number;
}

/** Payback period analysis result */
export interface PaybackResult {
  /** Total months to recoup the investment */
  months: number;
  /** Cumulative revenue at the end of each month */
  cumulativeRevenue: number[];
  /** The month in which cumulative revenue exceeds investment */
  breakEvenMonth: number;
  /** Confidence in the estimate (0-100) */
  confidence: number;
}

/** Trend analysis result for a given metric */
export interface TrendResult {
  /** The metric being analyzed */
  metric: string;
  /** Overall trend direction */
  direction: 'up' | 'down' | 'stable';
  /** Magnitude of the trend (absolute rate of change per period) */
  magnitude: number;
  /** Historical data points used */
  periods: { period: string; value: number }[];
  /** Projected future values */
  projection: number[];
}

/** Sensitivity analysis result for a given variable */
export interface SensitivityResult {
  /** The variable being tested */
  variable: string;
  /** The base value of the variable */
  baseValue: number;
  /** Impact of different changes on revenue and ROI */
  impacts: { change: number; revenueImpact: number; roiImpact: number }[];
}

// ---- Agent Implementation ----

/**
 * Revenue Forecasting Agent (Agent 19).
 *
 * Handles predictive financial modeling using Opus for complex reasoning.
 * Provides revenue forecasts, LTV/CAC modeling, break-even analysis,
 * scenario simulations (conservative / base / aggressive), ROI projections,
 * payback period calculations, trend analysis, and sensitivity analysis.
 *
 * All calculations are driven by real data fetched from the database.
 * When data is missing or sparse, the agent flags uncertainties and
 * adjusts confidence scores accordingly.
 *
 * @extends BaseAgent
 */
export class RevenueForecastingAgent extends BaseAgent {
  constructor(config?: Partial<{
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
  }>) {
    super({
      agentType: 'revenue_forecasting' as AgentType,
      model: 'opus',
      maxRetries: config?.maxRetries ?? 3,
      timeoutMs: config?.timeoutMs ?? 180_000,
      confidenceThreshold: config?.confidenceThreshold ?? 60,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the Claude system prompt that defines this agent's AI persona
   * for revenue forecasting and financial modeling tasks.
   */
  public getSystemPrompt(): string {
    return `You are the Revenue Forecasting Agent for an AI-powered international growth engine.
Your role is to generate accurate financial projections, model customer economics,
and simulate business scenarios for international market expansion.

You will be provided with structured financial data including:
- Historical revenue data by country and channel
- Campaign spend and performance metrics
- Customer acquisition costs and lifetime values
- Market-specific growth rates and conversion data

Your responsibilities:
1. Generate revenue forecasts grounded in historical data and market signals.
2. Model LTV/CAC ratios and their projected trajectories.
3. Calculate break-even points accounting for fixed and variable costs.
4. Simulate conservative, base, and aggressive scenarios with quantified assumptions.
5. Project ROI and payback periods for proposed investments.
6. Perform trend analysis and sensitivity testing on key financial variables.
7. Provide confidence levels for every projection; flag data gaps explicitly.

Output format: Respond with valid JSON matching the requested schema.
Never invent data points that were not provided. When data is missing,
note it as an uncertainty and adjust confidence scores downward.
Base all projections on the provided historical data and stated assumptions.`;
  }

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Revenue Forecasting can challenge performance analytics, budget
   * optimization, and market intelligence since it holds the financial
   * modeling perspective.
   */
  public getChallengeTargets(): AgentType[] {
    return ['performance_analytics', 'budget_optimization', 'market_intelligence'];
  }

  /**
   * Core processing method. Fetches historical revenue data, generates
   * a forecast, computes LTV/CAC models, runs all three scenarios, and
   * returns a comprehensive financial analysis.
   *
   * @param input - Standard agent input with context and parameters.
   * @returns Structured agent output with financial projections.
   */
  public async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting revenue forecasting analysis', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];

    const horizon = (input.parameters.horizon as number) ?? 12;
    const countryId = input.parameters.countryId as string | undefined;

    // Step 1: Fetch historical revenue data
    const historicalData = await this.fetchHistoricalRevenue(countryId);

    if (historicalData.length === 0) {
      uncertainties.push(
        this.flagUncertainty('data', 'No historical revenue data available'),
      );
    }

    // Step 2: Fetch campaign spend data for CAC modeling
    const spendData = await this.fetchCampaignSpendData(countryId);

    if (spendData.length === 0) {
      uncertainties.push(
        this.flagUncertainty('data', 'No campaign spend data available for CAC modeling'),
      );
    }

    // Step 3: Generate revenue forecast
    let forecast: RevenueForecast;
    try {
      forecast = await this.generateForecast(horizon, countryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Forecast generation encountered issues: ${message}`);
      forecast = this.buildEmptyForecast(horizon);
    }

    // Step 4: Model LTV and CAC
    let ltvModel: LTVModel;
    let cacModel: CACModel;
    try {
      ltvModel = await this.modelLTV();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`LTV modeling failed: ${message}`);
      ltvModel = this.buildEmptyLTVModel();
    }

    try {
      cacModel = await this.modelCAC();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`CAC modeling failed: ${message}`);
      cacModel = this.buildEmptyCACModel();
    }

    // Step 5: Run scenario comparison
    let scenarioComparison: ScenarioComparison;
    try {
      scenarioComparison = await this.runAllScenarios(countryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Scenario simulation failed: ${message}`);
      scenarioComparison = this.buildEmptyScenarioComparison();
    }

    // Step 6: Calculate break-even
    let breakEven: BreakEvenAnalysis;
    try {
      breakEven = await this.calculateBreakEven(countryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Break-even analysis failed: ${message}`);
      breakEven = this.buildEmptyBreakEven();
    }

    // Step 7: Generate AI-powered recommendations
    let recommendations: string[] = [];
    try {
      recommendations = await this.generateAIRecommendations(
        forecast,
        ltvModel,
        cacModel,
        scenarioComparison,
        breakEven,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`AI recommendation generation failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('ai_analysis', 'Could not generate AI-powered recommendations'),
      );
      recommendations = this.generateFallbackRecommendations(
        forecast,
        ltvModel,
        cacModel,
      );
    }

    // Step 8: Build confidence score
    const confidence = this.calculateConfidence({
      dataAvailability: historicalData.length > 0 ? Math.min(100, historicalData.length * 10) : 10,
      spendDataCoverage: spendData.length > 0 ? Math.min(100, spendData.length * 15) : 10,
      forecastHorizonPenalty: Math.max(20, 100 - horizon * 5),
      modelConsistency: ltvModel.confidence > 0 && cacModel.efficiency > 0 ? 75 : 30,
      scenarioConvergence: scenarioComparison.confidence,
    });

    // Step 9: Assemble output data
    const analysisData = {
      forecast,
      ltvModel,
      cacModel,
      breakEven,
      scenarioComparison,
      generatedAt: new Date().toISOString(),
    };

    // Step 10: Cache the analysis
    await this.cacheAnalysis(analysisData, input.requestId);

    // Step 11: Persist agent state
    await this.persistState({
      lastAnalysis: analysisData.generatedAt,
      horizon,
      totalProjectedRevenue: forecast.totalProjected,
      forecastConfidence: forecast.confidence,
      ltvToCACRatio: ltvModel.ltvToCAC,
      scenarioRecommendation: scenarioComparison.recommendation,
    });

    // Step 12: Build output
    const output = this.buildOutput(
      'revenue_forecast_complete',
      analysisData as unknown as Record<string, unknown>,
      confidence,
      `Generated ${horizon}-period revenue forecast projecting $${forecast.totalProjected.toLocaleString()} total revenue. ` +
        `LTV/CAC ratio: ${ltvModel.ltvToCAC.toFixed(2)}. ` +
        `Break-even estimated at ${breakEven.timeToBreakEven}. ` +
        `Scenario analysis recommends: ${scenarioComparison.recommendation}.`,
      recommendations,
      warnings,
      uncertainties,
    );

    // Step 13: Audit the decision
    await this.logDecision(input, output);

    this.log.info('Revenue forecasting analysis complete', {
      requestId: input.requestId,
      totalProjected: forecast.totalProjected,
      confidence: confidence.score,
      ltvToCAC: ltvModel.ltvToCAC,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public financial modeling methods
  // ------------------------------------------------------------------

  /**
   * Generates a multi-period revenue forecast based on historical data,
   * growth trends, and AI-powered projections.
   *
   * @param horizon - Number of future periods to forecast.
   * @param countryId - Optional country filter.
   * @returns A complete revenue forecast with period breakdowns.
   */
  public async generateForecast(
    horizon: number,
    countryId?: string,
  ): Promise<RevenueForecast> {
    const cacheKey = `${CACHE_PREFIX}:forecast:${horizon}:${countryId ?? 'global'}`;
    const cached = await cacheGet<RevenueForecast>(cacheKey);
    if (cached) {
      this.log.debug('Forecast cache hit', { horizon, countryId });
      return cached;
    }

    const historicalData = await this.fetchHistoricalRevenue(countryId);
    const assumptions: string[] = [];
    const risks: string[] = [];

    if (historicalData.length === 0) {
      return this.buildEmptyForecast(horizon);
    }

    // Calculate base growth rate from historical data
    const baseGrowthRate = this.calculateGrowthRate(historicalData);
    const latestRevenue = historicalData[historicalData.length - 1]?.revenue ?? 0;

    assumptions.push(
      `Base growth rate of ${(baseGrowthRate * 100).toFixed(1)}% derived from ${historicalData.length} historical periods`,
    );
    assumptions.push(
      `Starting from latest observed revenue of $${latestRevenue.toLocaleString()}`,
    );

    if (historicalData.length < 6) {
      risks.push('Limited historical data (fewer than 6 periods) reduces forecast reliability');
      assumptions.push('Small sample size; forecast confidence decreases for later periods');
    }

    // Attempt AI-enhanced forecast generation
    let aiEnhancedPeriods: ForecastPeriod[] | null = null;
    try {
      aiEnhancedPeriods = await this.generateAIForecastPeriods(
        historicalData,
        horizon,
        baseGrowthRate,
        countryId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.warn('AI-enhanced forecast generation failed, using statistical model', {
        error: message,
      });
      risks.push('AI-enhanced projections unavailable; using statistical extrapolation only');
    }

    const periods: ForecastPeriod[] = aiEnhancedPeriods ??
      this.generateStatisticalForecastPeriods(
        latestRevenue,
        baseGrowthRate,
        horizon,
        historicalData.length,
      );

    const totalProjected = periods.reduce((sum, p) => sum + p.revenue, 0);

    // Confidence decays with longer horizons and less data
    const dataFactor = Math.min(100, historicalData.length * 12);
    const horizonDecay = Math.max(20, 100 - horizon * 4);
    const overallConfidence = Math.round(((dataFactor + horizonDecay) / 2) * 100) / 100;

    if (horizon > 12) {
      risks.push('Long forecast horizon (>12 periods) significantly increases uncertainty');
    }

    const forecast: RevenueForecast = {
      horizon,
      periods,
      totalProjected: Math.round(totalProjected * 100) / 100,
      confidence: overallConfidence,
      assumptions,
      risks,
    };

    await cacheSet(cacheKey, forecast, CACHE_TTL);
    return forecast;
  }

  /**
   * Models customer Lifetime Value based on historical revenue and
   * customer data from the database.
   *
   * @param segment - Optional customer segment filter.
   * @returns LTV model with per-segment breakdown.
   */
  public async modelLTV(segment?: string): Promise<LTVModel> {
    const cacheKey = `${CACHE_PREFIX}:ltv:${segment ?? 'all'}`;
    const cached = await cacheGet<LTVModel>(cacheKey);
    if (cached) {
      this.log.debug('LTV model cache hit', { segment });
      return cached;
    }

    const revenueData = await this.fetchHistoricalRevenue();
    const campaignData = await this.fetchCampaignSpendData();

    if (revenueData.length === 0) {
      return this.buildEmptyLTVModel();
    }

    // Calculate total revenue and derive average LTV from conversion data
    const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const totalConversions = campaignData.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );

    // Guard against zero conversions
    const averageLTV = totalConversions > 0
      ? Math.round((totalRevenue / totalConversions) * 100) / 100
      : 0;

    // Build segment breakdown from campaign platform data
    const bySegment: Record<string, number> = {};
    const platformGroups = this.groupByPlatform(campaignData);

    for (const [platform, campaigns] of Object.entries(platformGroups)) {
      const segRevenue = campaigns.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
      const segConversions = campaigns.reduce(
        (sum, c) => sum + (c.conversions ?? 0),
        0,
      );
      bySegment[platform] = segConversions > 0
        ? Math.round((segRevenue / segConversions) * 100) / 100
        : 0;
    }

    // Filter by segment if requested
    if (segment && bySegment[segment] !== undefined) {
      const segmentLTV = bySegment[segment];
      const filteredSegment: Record<string, number> = { [segment]: segmentLTV };

      const avgCAC = this.computeAverageCAC(campaignData);
      const ltvToCAC = avgCAC > 0 ? Math.round((segmentLTV / avgCAC) * 100) / 100 : 0;

      const model: LTVModel = {
        averageLTV: segmentLTV,
        bySegment: filteredSegment,
        ltvToCAC,
        projectedGrowth: this.calculateGrowthRate(revenueData),
        methodology: 'Revenue per conversion segmented by platform channel, filtered by segment',
        confidence: this.computeLTVConfidence(revenueData.length, totalConversions),
      };

      await cacheSet(cacheKey, model, CACHE_TTL);
      return model;
    }

    const avgCAC = this.computeAverageCAC(campaignData);
    const ltvToCAC = avgCAC > 0 ? Math.round((averageLTV / avgCAC) * 100) / 100 : 0;

    const growthRate = this.calculateGrowthRate(revenueData);

    const model: LTVModel = {
      averageLTV,
      bySegment,
      ltvToCAC,
      projectedGrowth: growthRate,
      methodology: 'Revenue per conversion derived from historical campaign and revenue data, segmented by platform channel',
      confidence: this.computeLTVConfidence(revenueData.length, totalConversions),
    };

    await cacheSet(cacheKey, model, CACHE_TTL);
    return model;
  }

  /**
   * Models Customer Acquisition Cost based on campaign spend and
   * conversion data from the database.
   *
   * @param channel - Optional channel filter (e.g. 'google', 'meta').
   * @returns CAC model with per-channel breakdown.
   */
  public async modelCAC(channel?: string): Promise<CACModel> {
    const cacheKey = `${CACHE_PREFIX}:cac:${channel ?? 'all'}`;
    const cached = await cacheGet<CACModel>(cacheKey);
    if (cached) {
      this.log.debug('CAC model cache hit', { channel });
      return cached;
    }

    const campaignData = await this.fetchCampaignSpendData();

    if (campaignData.length === 0) {
      return this.buildEmptyCACModel();
    }

    const totalSpend = campaignData.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const totalConversions = campaignData.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );
    const averageCAC = totalConversions > 0
      ? Math.round((totalSpend / totalConversions) * 100) / 100
      : 0;

    // Per-channel breakdown
    const byChannel: Record<string, number> = {};
    const platformGroups = this.groupByPlatform(campaignData);

    for (const [platform, campaigns] of Object.entries(platformGroups)) {
      const chSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);
      const chConversions = campaigns.reduce(
        (sum, c) => sum + (c.conversions ?? 0),
        0,
      );
      byChannel[platform] = chConversions > 0
        ? Math.round((chSpend / chConversions) * 100) / 100
        : 0;
    }

    // Determine trend from time-ordered data
    const trend = this.determineCACTrend(campaignData);

    // Project next period CAC based on trend
    const trendMultiplier = trend === 'increasing' ? 1.05
      : trend === 'decreasing' ? 0.95
      : 1.0;
    const projectedCAC = Math.round(averageCAC * trendMultiplier * 100) / 100;

    // Efficiency score: lower CAC relative to historical average is better
    const channelCACValues = Object.values(byChannel).filter((v) => v > 0);
    const maxObservedCAC = channelCACValues.length > 0
      ? Math.max(...channelCACValues, averageCAC)
      : averageCAC;
    const efficiency = maxObservedCAC > 0
      ? Math.round(Math.max(0, Math.min(100, (1 - averageCAC / (maxObservedCAC * 2)) * 100)) * 100) / 100
      : 50;

    let model: CACModel = {
      averageCAC,
      byChannel,
      trend,
      projectedCAC,
      efficiency,
    };

    // Filter by channel if requested
    if (channel) {
      const channelCAC = byChannel[channel];
      if (channelCAC !== undefined) {
        model = {
          averageCAC: channelCAC,
          byChannel: { [channel]: channelCAC },
          trend,
          projectedCAC: Math.round(channelCAC * trendMultiplier * 100) / 100,
          efficiency,
        };
      }
    }

    await cacheSet(cacheKey, model, CACHE_TTL);
    return model;
  }

  /**
   * Calculates the break-even point based on fixed costs, variable
   * costs per unit, and average revenue per unit derived from DB data.
   *
   * @param countryId - Optional country filter.
   * @returns Break-even analysis with sensitivity data.
   */
  public async calculateBreakEven(
    countryId?: string,
  ): Promise<BreakEvenAnalysis> {
    const cacheKey = `${CACHE_PREFIX}:breakeven:${countryId ?? 'global'}`;
    const cached = await cacheGet<BreakEvenAnalysis>(cacheKey);
    if (cached) {
      this.log.debug('Break-even cache hit', { countryId });
      return cached;
    }

    const spendData = await this.fetchCampaignSpendData(countryId);
    const revenueData = await this.fetchHistoricalRevenue(countryId);

    if (spendData.length === 0 || revenueData.length === 0) {
      return this.buildEmptyBreakEven();
    }

    // Derive fixed costs from total budget allocations
    const fixedCosts = await this.fetchFixedCosts(countryId);

    // Variable cost per unit = average CAC (cost per acquisition)
    const totalSpend = spendData.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const totalConversions = spendData.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );
    const variableCostPerUnit = totalConversions > 0
      ? Math.round((totalSpend / totalConversions) * 100) / 100
      : 0;

    // Average revenue per unit = total revenue / conversions
    const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const averageRevPerUnit = totalConversions > 0
      ? Math.round((totalRevenue / totalConversions) * 100) / 100
      : 0;

    // Break-even units = fixedCosts / (avgRevPerUnit - variableCostPerUnit)
    const contributionMargin = averageRevPerUnit - variableCostPerUnit;
    const unitsToBreakEven = contributionMargin > 0
      ? Math.ceil(fixedCosts / contributionMargin)
      : 0;

    const breakEvenPoint = contributionMargin > 0
      ? Math.round((fixedCosts / (1 - variableCostPerUnit / averageRevPerUnit)) * 100) / 100
      : 0;

    // Estimate time to break-even based on monthly conversion rate
    const periodsOfData = revenueData.length;
    const avgConversionsPerPeriod = periodsOfData > 0
      ? totalConversions / periodsOfData
      : 0;
    const periodsToBreakEven = avgConversionsPerPeriod > 0
      ? Math.ceil(unitsToBreakEven / avgConversionsPerPeriod)
      : 0;
    const timeToBreakEven = periodsToBreakEven > 0
      ? `${periodsToBreakEven} month${periodsToBreakEven !== 1 ? 's' : ''}`
      : 'Unable to determine';

    // Sensitivity: how break-even shifts with +/- 10% changes in key variables
    const sensitivity: Record<string, number> = {};
    if (contributionMargin > 0) {
      const revUp10 = averageRevPerUnit * 1.1;
      const revDown10 = averageRevPerUnit * 0.9;
      const costUp10 = variableCostPerUnit * 1.1;
      const costDown10 = variableCostPerUnit * 0.9;

      sensitivity['revenue_up_10pct'] = Math.ceil(
        fixedCosts / (revUp10 - variableCostPerUnit),
      );
      sensitivity['revenue_down_10pct'] = (revDown10 - variableCostPerUnit) > 0
        ? Math.ceil(fixedCosts / (revDown10 - variableCostPerUnit))
        : 0;
      sensitivity['cost_up_10pct'] = (averageRevPerUnit - costUp10) > 0
        ? Math.ceil(fixedCosts / (averageRevPerUnit - costUp10))
        : 0;
      sensitivity['cost_down_10pct'] = Math.ceil(
        fixedCosts / (averageRevPerUnit - costDown10),
      );
      sensitivity['fixed_costs_up_10pct'] = Math.ceil(
        (fixedCosts * 1.1) / contributionMargin,
      );
      sensitivity['fixed_costs_down_10pct'] = Math.ceil(
        (fixedCosts * 0.9) / contributionMargin,
      );
    }

    const analysis: BreakEvenAnalysis = {
      breakEvenPoint,
      timeToBreakEven,
      fixedCosts,
      variableCostPerUnit,
      averageRevPerUnit,
      unitsToBreakEven,
      sensitivity,
    };

    await cacheSet(cacheKey, analysis, CACHE_TTL);
    return analysis;
  }

  /**
   * Simulates a specific scenario (conservative/base/aggressive)
   * using historical data and the scenario's growth assumptions.
   *
   * @param scenario - The scenario configuration to simulate.
   * @returns The scenario's projected financial outcomes.
   */
  public async simulateScenario(
    scenario: ScenarioConfig,
  ): Promise<ScenarioResult> {
    const historicalData = await this.fetchHistoricalRevenue();
    const spendData = await this.fetchCampaignSpendData();

    const baseGrowthRate = this.calculateGrowthRate(historicalData);
    const latestRevenue = historicalData.length > 0
      ? historicalData[historicalData.length - 1].revenue
      : 0;

    const growthMultiplier = scenario.assumptions.growthMultiplier
      ?? SCENARIO_MULTIPLIERS[scenario.name];
    const scenarioGrowthRate = baseGrowthRate * growthMultiplier;

    const costMultiplier = scenario.assumptions.costMultiplier ?? 1.0;
    const totalSpend = spendData.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const avgMonthlySpend = spendData.length > 0
      ? totalSpend / spendData.length
      : 0;

    // Generate period-by-period timeline
    const timeline: ForecastPeriod[] = [];
    let currentRevenue = latestRevenue;
    let totalRevenue = 0;
    let totalCost = 0;

    for (let i = 1; i <= scenario.horizon; i++) {
      const periodGrowth = scenarioGrowthRate;
      currentRevenue = currentRevenue * (1 + periodGrowth);
      totalRevenue += currentRevenue;
      totalCost += avgMonthlySpend * costMultiplier;

      // Confidence decays over time
      const periodConfidence = Math.max(
        15,
        Math.round((90 - (i / scenario.horizon) * 50) * 100) / 100,
      );

      const drivers = this.identifyScenarioDrivers(scenario.name, i, scenario.horizon);

      timeline.push({
        period: `Period ${i}`,
        revenue: Math.round(currentRevenue * 100) / 100,
        growth: Math.round(periodGrowth * 10000) / 10000,
        confidence: periodConfidence,
        drivers,
      });
    }

    const profit = totalRevenue - totalCost;
    const roi = totalCost > 0
      ? Math.round((profit / totalCost) * 100) / 100
      : 0;

    const risks = this.identifyScenarioRisks(scenario.name, historicalData.length);
    const probability = scenario.assumptions.probability
      ?? SCENARIO_PROBABILITIES[scenario.name];

    return {
      name: scenario.name,
      revenue: Math.round(totalRevenue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      roi,
      timeline,
      risks,
      probability,
    };
  }

  /**
   * Runs all three scenario tiers (conservative, base, aggressive) and
   * compares them to produce a strategic recommendation.
   *
   * @param countryId - Optional country filter.
   * @returns Comparison of all three scenarios with a recommendation.
   */
  public async runAllScenarios(
    countryId?: string,
  ): Promise<ScenarioComparison> {
    const cacheKey = `${CACHE_PREFIX}:scenarios:${countryId ?? 'global'}`;
    const cached = await cacheGet<ScenarioComparison>(cacheKey);
    if (cached) {
      this.log.debug('Scenario comparison cache hit', { countryId });
      return cached;
    }

    const defaultHorizon = 12;

    const [conservative, base, aggressive] = await Promise.all([
      this.simulateScenario({
        name: 'conservative',
        assumptions: { growthMultiplier: SCENARIO_MULTIPLIERS.conservative },
        horizon: defaultHorizon,
      }),
      this.simulateScenario({
        name: 'base',
        assumptions: { growthMultiplier: SCENARIO_MULTIPLIERS.base },
        horizon: defaultHorizon,
      }),
      this.simulateScenario({
        name: 'aggressive',
        assumptions: { growthMultiplier: SCENARIO_MULTIPLIERS.aggressive },
        horizon: defaultHorizon,
      }),
    ]);

    // Generate recommendation based on scenario outcomes
    let recommendation: string;
    try {
      recommendation = await this.generateScenarioRecommendation(
        conservative,
        base,
        aggressive,
      );
    } catch {
      recommendation = this.generateFallbackScenarioRecommendation(
        conservative,
        base,
        aggressive,
      );
    }

    // Confidence is influenced by data availability and scenario convergence
    const revRange = aggressive.revenue - conservative.revenue;
    const baseRev = base.revenue || 1;
    const divergence = revRange / baseRev;
    // Lower divergence between scenarios = higher confidence
    const convergenceScore = Math.max(
      20,
      Math.round(Math.min(100, 100 - divergence * 50) * 100) / 100,
    );

    const comparison: ScenarioComparison = {
      conservative,
      base,
      aggressive,
      recommendation,
      confidence: convergenceScore,
    };

    await cacheSet(cacheKey, comparison, CACHE_TTL);
    return comparison;
  }

  /**
   * Projects the ROI for a specific investment in a given channel
   * over a defined time horizon.
   *
   * @param investment - The investment amount.
   * @param channel - The target channel.
   * @param horizon - Number of periods to project.
   * @returns ROI projection with payback timeline.
   */
  public async projectROI(
    investment: number,
    channel: string,
    horizon: number,
  ): Promise<ROIProjection> {
    const campaignData = await this.fetchCampaignSpendData();

    // Filter to specified channel
    const channelData = campaignData.filter(
      (c) => c.platform?.toLowerCase() === channel.toLowerCase(),
    );

    if (channelData.length === 0) {
      return {
        investment,
        channel,
        projectedRevenue: 0,
        projectedROI: 0,
        paybackMonths: 0,
        confidence: 10,
      };
    }

    // Calculate historical ROAS for this channel
    const channelSpend = channelData.reduce((sum, c) => sum + (c.spend ?? 0), 0);
    const channelRevenue = channelData.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const historicalROAS = channelSpend > 0 ? channelRevenue / channelSpend : 0;

    const projectedRevenue = Math.round(investment * historicalROAS * 100) / 100;
    const projectedROI = investment > 0
      ? Math.round(((projectedRevenue - investment) / investment) * 100) / 100
      : 0;

    // Estimate payback: how many months until cumulative revenue >= investment
    const monthlyRevenueEstimate = horizon > 0 ? projectedRevenue / horizon : 0;
    const paybackMonths = monthlyRevenueEstimate > 0
      ? Math.ceil(investment / monthlyRevenueEstimate)
      : 0;

    const confidence = Math.min(
      85,
      Math.round(Math.min(100, channelData.length * 10 + (historicalROAS > 1 ? 20 : 0)) * 100) / 100,
    );

    return {
      investment,
      channel,
      projectedRevenue,
      projectedROI,
      paybackMonths: Math.min(paybackMonths, horizon),
      confidence,
    };
  }

  /**
   * Calculates the payback period for an investment in a given channel.
   *
   * @param investment - The investment amount.
   * @param channel - The target channel.
   * @returns Payback analysis with monthly cumulative revenue.
   */
  public async calculatePaybackPeriod(
    investment: number,
    channel: string,
  ): Promise<PaybackResult> {
    const campaignData = await this.fetchCampaignSpendData();

    const channelData = campaignData.filter(
      (c) => c.platform?.toLowerCase() === channel.toLowerCase(),
    );

    if (channelData.length === 0 || investment <= 0) {
      return {
        months: 0,
        cumulativeRevenue: [],
        breakEvenMonth: 0,
        confidence: 10,
      };
    }

    // Monthly revenue estimate from historical channel performance
    const channelRevenue = channelData.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const channelSpend = channelData.reduce((sum, c) => sum + (c.spend ?? 0), 0);
    const historicalROAS = channelSpend > 0 ? channelRevenue / channelSpend : 0;

    // Scale projected monthly revenue to the investment
    const totalProjectedRevenue = investment * historicalROAS;
    const periodsOfData = Math.max(1, channelData.length);
    const monthlyRevenue = totalProjectedRevenue / periodsOfData;

    const cumulativeRevenue: number[] = [];
    let cumulative = 0;
    let breakEvenMonth = 0;
    const maxMonths = 36; // cap at 3 years

    for (let month = 1; month <= maxMonths; month++) {
      cumulative += monthlyRevenue;
      cumulativeRevenue.push(Math.round(cumulative * 100) / 100);

      if (breakEvenMonth === 0 && cumulative >= investment) {
        breakEvenMonth = month;
      }
    }

    const months = breakEvenMonth > 0 ? breakEvenMonth : maxMonths;
    const confidence = Math.min(
      80,
      Math.round(Math.min(100, channelData.length * 12) * 100) / 100,
    );

    return {
      months,
      cumulativeRevenue,
      breakEvenMonth,
      confidence,
    };
  }

  /**
   * Analyzes the trend of a specified metric over a number of periods.
   *
   * @param metric - The metric name to analyze (e.g. 'revenue', 'cac', 'roas').
   * @param periods - Number of historical periods to include.
   * @returns Trend analysis with projections.
   */
  public async trendAnalysis(
    metric: string,
    periods: number,
  ): Promise<TrendResult> {
    const dataPoints = await this.fetchMetricTimeSeries(metric, periods);

    if (dataPoints.length < 2) {
      return {
        metric,
        direction: 'stable',
        magnitude: 0,
        periods: dataPoints,
        projection: [],
      };
    }

    // Calculate linear regression slope
    const values = dataPoints.map((d) => d.value);
    const slope = this.calculateLinearSlope(values);

    const direction: 'up' | 'down' | 'stable' =
      slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'stable';

    const magnitude = Math.round(Math.abs(slope) * 10000) / 10000;

    // Project forward using linear extrapolation
    const lastValue = values[values.length - 1];
    const projectionCount = Math.min(periods, 6);
    const projection: number[] = [];

    for (let i = 1; i <= projectionCount; i++) {
      const projected = lastValue + slope * i;
      projection.push(Math.round(Math.max(0, projected) * 100) / 100);
    }

    return {
      metric,
      direction,
      magnitude,
      periods: dataPoints,
      projection,
    };
  }

  /**
   * Performs sensitivity analysis on a specified variable, measuring
   * how changes in that variable impact revenue and ROI.
   *
   * @param variable - The variable to test (e.g. 'cac', 'conversion_rate', 'spend').
   * @param range - A [min, max] pair defining the percentage change range to test.
   * @returns Sensitivity analysis with impact measurements.
   */
  public async sensitivityAnalysis(
    variable: string,
    range: [number, number],
  ): Promise<SensitivityResult> {
    const revenueData = await this.fetchHistoricalRevenue();
    const campaignData = await this.fetchCampaignSpendData();

    const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const totalSpend = campaignData.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const totalConversions = campaignData.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );
    const totalClicks = campaignData.reduce(
      (sum, d) => sum + (d.clicks ?? 0),
      0,
    );

    // Derive base value depending on variable
    let baseValue: number;
    switch (variable) {
      case 'cac':
        baseValue = totalConversions > 0 ? totalSpend / totalConversions : 0;
        break;
      case 'conversion_rate':
        baseValue = totalClicks > 0 ? totalConversions / totalClicks : 0;
        break;
      case 'spend':
        baseValue = totalSpend;
        break;
      case 'revenue':
        baseValue = totalRevenue;
        break;
      default:
        baseValue = totalRevenue;
    }

    const baseROI = totalSpend > 0
      ? (totalRevenue - totalSpend) / totalSpend
      : 0;

    // Generate impact points across the range
    const [minChange, maxChange] = range;
    const steps = 5;
    const stepSize = steps > 0 ? (maxChange - minChange) / steps : 0;
    const impacts: SensitivityResult['impacts'] = [];

    for (let i = 0; i <= steps; i++) {
      const change = minChange + stepSize * i;
      const adjustedValue = baseValue * (1 + change);

      // Calculate the downstream impact on revenue and ROI
      let revenueImpact: number;
      let roiImpact: number;

      switch (variable) {
        case 'cac': {
          // Higher CAC means lower profit and ROI
          const newTotalCost = adjustedValue * totalConversions;
          const newProfit = totalRevenue - newTotalCost;
          revenueImpact = 0; // CAC does not directly change revenue
          roiImpact = newTotalCost > 0
            ? Math.round(((newProfit / newTotalCost) - baseROI) * 10000) / 10000
            : 0;
          break;
        }
        case 'conversion_rate': {
          // Higher conversion rate means more revenue
          const adjustedConversions = totalConversions * (1 + change);
          const avgRevPerConversion = totalConversions > 0
            ? totalRevenue / totalConversions
            : 0;
          const newRevenue = adjustedConversions * avgRevPerConversion;
          revenueImpact = Math.round((newRevenue - totalRevenue) * 100) / 100;
          roiImpact = totalSpend > 0
            ? Math.round(((newRevenue - totalSpend) / totalSpend - baseROI) * 10000) / 10000
            : 0;
          break;
        }
        case 'spend': {
          // Assume linear relationship between spend and revenue (based on ROAS)
          const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
          const newSpend = adjustedValue;
          const newRev = newSpend * roas;
          revenueImpact = Math.round((newRev - totalRevenue) * 100) / 100;
          roiImpact = 0; // ROI stays same if ROAS is constant
          break;
        }
        default: {
          revenueImpact = Math.round((adjustedValue - totalRevenue) * 100) / 100;
          roiImpact = totalSpend > 0
            ? Math.round(((adjustedValue - totalSpend) / totalSpend - baseROI) * 10000) / 10000
            : 0;
        }
      }

      impacts.push({
        change: Math.round(change * 10000) / 10000,
        revenueImpact,
        roiImpact,
      });
    }

    return {
      variable,
      baseValue: Math.round(baseValue * 100) / 100,
      impacts,
    };
  }

  // ------------------------------------------------------------------
  // Private helper methods — data fetching
  // ------------------------------------------------------------------

  /**
   * Fetches historical revenue data from campaigns table.
   * Revenue is derived from campaign metrics (spend * ROAS).
   */
  private async fetchHistoricalRevenue(
    countryId?: string,
  ): Promise<Array<{ period: string; revenue: number }>> {
    const cacheKey = `${CACHE_PREFIX}:historical_revenue:${countryId ?? 'global'}`;
    const cached = await cacheGet<Array<{ period: string; revenue: number }>>(cacheKey);
    if (cached) return cached;

    try {
      let queryText: string;
      let params: unknown[];

      if (countryId) {
        queryText = `
          SELECT
            TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
            COALESCE(SUM(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1)), 0) AS revenue
          FROM campaigns c
          WHERE c.country_id = $1 AND c.status IN ('active', 'completed')
          GROUP BY DATE_TRUNC('month', c.start_date::date)
          ORDER BY period ASC
        `;
        params = [countryId];
      } else {
        queryText = `
          SELECT
            TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
            COALESCE(SUM(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1)), 0) AS revenue
          FROM campaigns c
          WHERE c.status IN ('active', 'completed')
          GROUP BY DATE_TRUNC('month', c.start_date::date)
          ORDER BY period ASC
        `;
        params = [];
      }

      const result = await pool.query(queryText, params);
      const data = result.rows.map((row) => ({
        period: row.period as string,
        revenue: parseFloat(row.revenue) || 0,
      }));

      await cacheSet(cacheKey, data, CACHE_TTL);
      return data;
    } catch (error) {
      this.log.error('Failed to fetch historical revenue data', { countryId, error });
      return [];
    }
  }

  /**
   * Fetches campaign spend and performance data for CAC/ROI calculations.
   */
  private async fetchCampaignSpendData(
    countryId?: string,
  ): Promise<Array<{
    platform: string;
    spend: number;
    conversions: number;
    revenue: number;
    clicks: number;
  }>> {
    const cacheKey = `${CACHE_PREFIX}:spend_data:${countryId ?? 'global'}`;
    const cached = await cacheGet<Array<{
      platform: string;
      spend: number;
      conversions: number;
      revenue: number;
      clicks: number;
    }>>(cacheKey);
    if (cached) return cached;

    try {
      let queryText: string;
      let params: unknown[];

      if (countryId) {
        queryText = `
          SELECT
            c.platform,
            COALESCE(c.spent, 0) AS spend,
            COALESCE((c.metrics->>'conversions')::numeric, 0) AS conversions,
            COALESCE(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1), 0) AS revenue,
            COALESCE((c.metrics->>'clicks')::numeric, 0) AS clicks
          FROM campaigns c
          WHERE c.country_id = $1 AND c.status IN ('active', 'completed')
          ORDER BY c.start_date ASC
        `;
        params = [countryId];
      } else {
        queryText = `
          SELECT
            c.platform,
            COALESCE(c.spent, 0) AS spend,
            COALESCE((c.metrics->>'conversions')::numeric, 0) AS conversions,
            COALESCE(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1), 0) AS revenue,
            COALESCE((c.metrics->>'clicks')::numeric, 0) AS clicks
          FROM campaigns c
          WHERE c.status IN ('active', 'completed')
          ORDER BY c.start_date ASC
        `;
        params = [];
      }

      const result = await pool.query(queryText, params);
      const data = result.rows.map((row) => ({
        platform: row.platform as string,
        spend: parseFloat(row.spend) || 0,
        conversions: parseFloat(row.conversions) || 0,
        revenue: parseFloat(row.revenue) || 0,
        clicks: parseFloat(row.clicks) || 0,
      }));

      await cacheSet(cacheKey, data, CACHE_TTL);
      return data;
    } catch (error) {
      this.log.error('Failed to fetch campaign spend data', { countryId, error });
      return [];
    }
  }

  /**
   * Fetches fixed costs from budget allocations table.
   */
  private async fetchFixedCosts(countryId?: string): Promise<number> {
    try {
      let queryText: string;
      let params: unknown[];

      if (countryId) {
        queryText = `
          SELECT COALESCE(SUM(total_budget), 0) AS fixed_costs
          FROM budget_allocations
          WHERE country_id = $1
        `;
        params = [countryId];
      } else {
        queryText = `
          SELECT COALESCE(SUM(total_budget), 0) AS fixed_costs
          FROM budget_allocations
        `;
        params = [];
      }

      const result = await pool.query(queryText, params);
      return parseFloat(result.rows[0]?.fixed_costs) || 0;
    } catch (error) {
      this.log.error('Failed to fetch fixed costs', { countryId, error });
      return 0;
    }
  }

  /**
   * Fetches time-series data for a specific metric.
   */
  private async fetchMetricTimeSeries(
    metric: string,
    periods: number,
  ): Promise<Array<{ period: string; value: number }>> {
    try {
      let queryText: string;

      switch (metric) {
        case 'revenue':
          queryText = `
            SELECT
              TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
              COALESCE(SUM(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1)), 0) AS value
            FROM campaigns c
            WHERE c.status IN ('active', 'completed')
            GROUP BY DATE_TRUNC('month', c.start_date::date)
            ORDER BY period DESC
            LIMIT $1
          `;
          break;
        case 'cac':
          queryText = `
            SELECT
              TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
              CASE
                WHEN SUM(COALESCE((c.metrics->>'conversions')::numeric, 0)) > 0
                THEN SUM(COALESCE(c.spent, 0)) / SUM(COALESCE((c.metrics->>'conversions')::numeric, 0))
                ELSE 0
              END AS value
            FROM campaigns c
            WHERE c.status IN ('active', 'completed')
            GROUP BY DATE_TRUNC('month', c.start_date::date)
            ORDER BY period DESC
            LIMIT $1
          `;
          break;
        case 'roas':
          queryText = `
            SELECT
              TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
              CASE
                WHEN SUM(COALESCE(c.spent, 0)) > 0
                THEN SUM(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1)) / SUM(c.spent)
                ELSE 0
              END AS value
            FROM campaigns c
            WHERE c.status IN ('active', 'completed')
            GROUP BY DATE_TRUNC('month', c.start_date::date)
            ORDER BY period DESC
            LIMIT $1
          `;
          break;
        default:
          queryText = `
            SELECT
              TO_CHAR(DATE_TRUNC('month', c.start_date::date), 'YYYY-MM') AS period,
              COALESCE(SUM(c.spent * COALESCE((c.metrics->>'roas')::numeric, 1)), 0) AS value
            FROM campaigns c
            WHERE c.status IN ('active', 'completed')
            GROUP BY DATE_TRUNC('month', c.start_date::date)
            ORDER BY period DESC
            LIMIT $1
          `;
      }

      const result = await pool.query(queryText, [periods]);
      return result.rows
        .map((row) => ({
          period: row.period as string,
          value: parseFloat(row.value) || 0,
        }))
        .reverse(); // Return in ascending chronological order
    } catch (error) {
      this.log.error('Failed to fetch metric time series', { metric, periods, error });
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Private helper methods — calculations
  // ------------------------------------------------------------------

  /**
   * Computes the average growth rate from historical revenue data.
   * Uses period-over-period growth and returns the arithmetic mean.
   */
  private calculateGrowthRate(
    data: Array<{ period: string; revenue: number }>,
  ): number {
    if (data.length < 2) return 0;

    let totalGrowth = 0;
    let growthPeriods = 0;

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1].revenue;
      const curr = data[i].revenue;

      if (prev > 0) {
        totalGrowth += (curr - prev) / prev;
        growthPeriods++;
      }
    }

    if (growthPeriods === 0) return 0;
    return Math.round((totalGrowth / growthPeriods) * 10000) / 10000;
  }

  /**
   * Computes the linear regression slope for a series of values.
   * The slope indicates the average change per period.
   */
  private calculateLinearSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Computes average CAC from campaign data.
   */
  private computeAverageCAC(
    campaignData: Array<{ spend: number; conversions: number }>,
  ): number {
    const totalSpend = campaignData.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const totalConversions = campaignData.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );

    return totalConversions > 0
      ? Math.round((totalSpend / totalConversions) * 100) / 100
      : 0;
  }

  /**
   * Computes confidence for LTV model based on data availability.
   */
  private computeLTVConfidence(dataPeriods: number, totalConversions: number): number {
    const dataScore = Math.min(100, dataPeriods * 12);
    const conversionScore = Math.min(100, totalConversions * 0.5);
    return Math.round(((dataScore + conversionScore) / 2) * 100) / 100;
  }

  /**
   * Determines the directional trend of CAC from campaign data.
   */
  private determineCACTrend(
    campaignData: Array<{ spend: number; conversions: number }>,
  ): 'increasing' | 'decreasing' | 'stable' {
    if (campaignData.length < 3) return 'stable';

    // Split into halves and compare average CAC
    const midpoint = Math.floor(campaignData.length / 2);
    const firstHalf = campaignData.slice(0, midpoint);
    const secondHalf = campaignData.slice(midpoint);

    const firstCAC = this.computeGroupCAC(firstHalf);
    const secondCAC = this.computeGroupCAC(secondHalf);

    if (firstCAC === 0 || secondCAC === 0) return 'stable';

    const changePercent = (secondCAC - firstCAC) / firstCAC;

    if (changePercent > 0.05) return 'increasing';
    if (changePercent < -0.05) return 'decreasing';
    return 'stable';
  }

  /**
   * Computes CAC for a group of campaign data entries.
   */
  private computeGroupCAC(
    data: Array<{ spend: number; conversions: number }>,
  ): number {
    const spend = data.reduce((sum, d) => sum + (d.spend ?? 0), 0);
    const conversions = data.reduce(
      (sum, d) => sum + (d.conversions ?? 0),
      0,
    );
    return conversions > 0 ? spend / conversions : 0;
  }

  /**
   * Groups campaign data by platform.
   */
  private groupByPlatform<
    T extends { platform: string },
  >(data: T[]): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of data) {
      const key = item.platform?.toLowerCase() ?? 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }

  /**
   * Generates statistical forecast periods using growth rate extrapolation.
   */
  private generateStatisticalForecastPeriods(
    latestRevenue: number,
    growthRate: number,
    horizon: number,
    dataPointCount: number,
  ): ForecastPeriod[] {
    const periods: ForecastPeriod[] = [];
    let currentRevenue = latestRevenue;

    for (let i = 1; i <= horizon; i++) {
      currentRevenue = currentRevenue * (1 + growthRate);

      // Confidence decays with distance from last observed data
      const periodConfidence = Math.max(
        10,
        Math.round(
          (Math.min(100, dataPointCount * 10) - (i / horizon) * 40) * 100,
        ) / 100,
      );

      periods.push({
        period: `Period ${i}`,
        revenue: Math.round(currentRevenue * 100) / 100,
        growth: growthRate,
        confidence: periodConfidence,
        drivers: ['Statistical extrapolation from historical growth rate'],
      });
    }

    return periods;
  }

  /**
   * Generates AI-enhanced forecast periods using the Opus model.
   */
  private async generateAIForecastPeriods(
    historicalData: Array<{ period: string; revenue: number }>,
    horizon: number,
    baseGrowthRate: number,
    countryId?: string,
  ): Promise<ForecastPeriod[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Generate a ${horizon}-period revenue forecast based on the following historical data.

Historical Revenue Data:
${historicalData.map((d) => `${d.period}: $${d.revenue.toLocaleString()}`).join('\n')}

Base Growth Rate: ${(baseGrowthRate * 100).toFixed(2)}%
${countryId ? `Country Filter: ${countryId}` : 'Scope: Global'}

For each period, provide:
- period: label (e.g. "Period 1")
- revenue: projected revenue (number)
- growth: growth rate for this period (decimal)
- confidence: confidence in this projection (0-100)
- drivers: array of 1-2 key revenue drivers

Respond with a JSON array of period objects. Base projections on the historical trend.
Do not invent data; extrapolate from what is provided.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: Record<string, unknown>, idx: number) => ({
          period: (p.period as string) ?? `Period ${idx + 1}`,
          revenue: typeof p.revenue === 'number' ? Math.round(p.revenue * 100) / 100 : 0,
          growth: typeof p.growth === 'number' ? p.growth : baseGrowthRate,
          confidence: typeof p.confidence === 'number' ? p.confidence : 50,
          drivers: Array.isArray(p.drivers) ? p.drivers.map(String) : ['AI-projected'],
        }));
      }
    } catch {
      this.log.warn('Failed to parse AI forecast response', {
        responseLength: response.length,
      });
    }

    throw new Error('AI forecast response could not be parsed');
  }

  /**
   * Identifies key drivers for a scenario period.
   */
  private identifyScenarioDrivers(
    scenario: string,
    period: number,
    totalPeriods: number,
  ): string[] {
    const drivers: string[] = [];
    const phase = period / totalPeriods;

    switch (scenario) {
      case 'conservative':
        drivers.push('Organic growth from existing channels');
        if (phase > 0.5) drivers.push('Gradual market expansion');
        break;
      case 'base':
        drivers.push('Balanced growth across paid and organic channels');
        if (phase > 0.3) drivers.push('Market penetration deepening');
        if (phase > 0.7) drivers.push('Brand recognition effects');
        break;
      case 'aggressive':
        drivers.push('Accelerated paid acquisition scaling');
        if (phase > 0.2) drivers.push('New market entry');
        if (phase > 0.5) drivers.push('Network effects and viral growth');
        break;
    }

    return drivers;
  }

  /**
   * Identifies risks specific to a scenario tier.
   */
  private identifyScenarioRisks(
    scenario: string,
    dataPointCount: number,
  ): string[] {
    const risks: string[] = [];

    if (dataPointCount < 6) {
      risks.push('Limited historical data reduces projection reliability');
    }

    switch (scenario) {
      case 'conservative':
        risks.push('May underestimate growth if market conditions improve');
        risks.push('Opportunity cost of under-investment');
        break;
      case 'base':
        risks.push('Assumes continuation of current market conditions');
        risks.push('External disruptions could invalidate baseline assumptions');
        break;
      case 'aggressive':
        risks.push('Relies on successfully scaling acquisition channels');
        risks.push('Market saturation could limit achievable growth');
        risks.push('Higher spend increases exposure if ROAS deteriorates');
        break;
    }

    return risks;
  }

  // ------------------------------------------------------------------
  // Private helper methods — AI recommendation generation
  // ------------------------------------------------------------------

  /**
   * Generates AI-powered recommendations from the complete financial analysis.
   */
  private async generateAIRecommendations(
    forecast: RevenueForecast,
    ltvModel: LTVModel,
    cacModel: CACModel,
    scenarios: ScenarioComparison,
    breakEven: BreakEvenAnalysis,
  ): Promise<string[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Based on the following financial analysis, provide 3-5 strategic recommendations.

Revenue Forecast:
- Horizon: ${forecast.horizon} periods
- Total Projected: $${forecast.totalProjected.toLocaleString()}
- Confidence: ${forecast.confidence}%

LTV/CAC Model:
- Average LTV: $${ltvModel.averageLTV.toLocaleString()}
- Average CAC: $${cacModel.averageCAC.toLocaleString()}
- LTV/CAC Ratio: ${ltvModel.ltvToCAC}
- CAC Trend: ${cacModel.trend}

Break-Even Analysis:
- Break-Even Point: $${breakEven.breakEvenPoint.toLocaleString()}
- Time to Break-Even: ${breakEven.timeToBreakEven}
- Units Required: ${breakEven.unitsToBreakEven}

Scenario Comparison:
- Conservative Revenue: $${scenarios.conservative.revenue.toLocaleString()}
- Base Revenue: $${scenarios.base.revenue.toLocaleString()}
- Aggressive Revenue: $${scenarios.aggressive.revenue.toLocaleString()}

Respond with a JSON array of recommendation strings. Be specific and actionable.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      this.log.warn('Failed to parse AI recommendations', {
        responseLength: response.length,
      });
    }

    return [response.trim()];
  }

  /**
   * Generates a scenario recommendation using the AI model.
   */
  private async generateScenarioRecommendation(
    conservative: ScenarioResult,
    base: ScenarioResult,
    aggressive: ScenarioResult,
  ): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Compare these three scenarios and recommend a strategy.

Conservative: Revenue $${conservative.revenue.toLocaleString()}, ROI ${conservative.roi}, Probability ${conservative.probability}
Base: Revenue $${base.revenue.toLocaleString()}, ROI ${base.roi}, Probability ${base.probability}
Aggressive: Revenue $${aggressive.revenue.toLocaleString()}, ROI ${aggressive.roi}, Probability ${aggressive.probability}

Provide a single concise recommendation (2-3 sentences) as plain text.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    return response.trim();
  }

  /**
   * Generates a deterministic fallback scenario recommendation.
   */
  private generateFallbackScenarioRecommendation(
    conservative: ScenarioResult,
    base: ScenarioResult,
    aggressive: ScenarioResult,
  ): string {
    if (conservative.roi > 0.5 && aggressive.roi > 1.0) {
      return `All scenarios show positive ROI. Recommend pursuing the base scenario (ROI: ${base.roi}) with optionality to scale toward aggressive if early metrics confirm growth assumptions.`;
    }

    if (base.roi > 0 && aggressive.roi > 0) {
      return `Base and aggressive scenarios show positive returns. Start with the base scenario and monitor KPIs for 2-3 periods before committing to aggressive scaling.`;
    }

    if (conservative.roi > 0) {
      return `Only the conservative scenario shows reliable positive ROI (${conservative.roi}). Recommend conservative approach until more data validates growth assumptions.`;
    }

    return `All scenarios carry significant risk. Recommend limiting investment and gathering more market data before committing to a growth strategy.`;
  }

  /**
   * Generates rule-based fallback recommendations when AI is unavailable.
   */
  private generateFallbackRecommendations(
    forecast: RevenueForecast,
    ltvModel: LTVModel,
    cacModel: CACModel,
  ): string[] {
    const recommendations: string[] = [];

    if (ltvModel.ltvToCAC >= 3) {
      recommendations.push(
        `Strong LTV/CAC ratio of ${ltvModel.ltvToCAC.toFixed(2)} supports increased acquisition spending. Consider scaling top-performing channels.`,
      );
    } else if (ltvModel.ltvToCAC >= 1) {
      recommendations.push(
        `LTV/CAC ratio of ${ltvModel.ltvToCAC.toFixed(2)} is positive but below the 3:1 benchmark. Focus on improving conversion rates and reducing CAC before scaling.`,
      );
    } else if (ltvModel.ltvToCAC > 0) {
      recommendations.push(
        `LTV/CAC ratio of ${ltvModel.ltvToCAC.toFixed(2)} is below break-even. Urgently review acquisition strategy and focus on higher-LTV segments.`,
      );
    }

    if (cacModel.trend === 'increasing') {
      recommendations.push(
        'CAC is trending upward. Investigate channel efficiency and consider diversifying acquisition sources to reduce cost pressure.',
      );
    } else if (cacModel.trend === 'decreasing') {
      recommendations.push(
        'CAC is trending downward, indicating improving efficiency. Maintain current optimization strategies.',
      );
    }

    if (forecast.totalProjected > 0) {
      recommendations.push(
        `Revenue forecast of $${forecast.totalProjected.toLocaleString()} over ${forecast.horizon} periods. Monitor actual vs. projected performance monthly and adjust forecasts accordingly.`,
      );
    }

    recommendations.push(
      'Establish monthly forecast review cadence comparing projections to actuals to continuously improve forecast accuracy.',
    );

    return recommendations;
  }

  // ------------------------------------------------------------------
  // Private helper methods — empty/default builders
  // ------------------------------------------------------------------

  /** Builds an empty forecast when no data is available */
  private buildEmptyForecast(horizon: number): RevenueForecast {
    return {
      horizon,
      periods: [],
      totalProjected: 0,
      confidence: 0,
      assumptions: ['No historical data available for forecasting'],
      risks: ['Forecast cannot be generated without historical revenue data'],
    };
  }

  /** Builds an empty LTV model when no data is available */
  private buildEmptyLTVModel(): LTVModel {
    return {
      averageLTV: 0,
      bySegment: {},
      ltvToCAC: 0,
      projectedGrowth: 0,
      methodology: 'Insufficient data to compute LTV model',
      confidence: 0,
    };
  }

  /** Builds an empty CAC model when no data is available */
  private buildEmptyCACModel(): CACModel {
    return {
      averageCAC: 0,
      byChannel: {},
      trend: 'stable',
      projectedCAC: 0,
      efficiency: 0,
    };
  }

  /** Builds an empty break-even analysis */
  private buildEmptyBreakEven(): BreakEvenAnalysis {
    return {
      breakEvenPoint: 0,
      timeToBreakEven: 'Unable to determine',
      fixedCosts: 0,
      variableCostPerUnit: 0,
      averageRevPerUnit: 0,
      unitsToBreakEven: 0,
      sensitivity: {},
    };
  }

  /** Builds an empty scenario comparison */
  private buildEmptyScenarioComparison(): ScenarioComparison {
    const emptyResult: ScenarioResult = {
      name: '',
      revenue: 0,
      profit: 0,
      roi: 0,
      timeline: [],
      risks: ['Insufficient data for scenario simulation'],
      probability: 0,
    };

    return {
      conservative: { ...emptyResult, name: 'conservative', probability: SCENARIO_PROBABILITIES.conservative },
      base: { ...emptyResult, name: 'base', probability: SCENARIO_PROBABILITIES.base },
      aggressive: { ...emptyResult, name: 'aggressive', probability: SCENARIO_PROBABILITIES.aggressive },
      recommendation: 'Insufficient data to generate scenario comparison. Collect more historical data.',
      confidence: 0,
    };
  }

  // ------------------------------------------------------------------
  // Private helper methods — caching
  // ------------------------------------------------------------------

  /**
   * Caches the full analysis result.
   */
  private async cacheAnalysis(
    analysis: Record<string, unknown>,
    requestId: string,
  ): Promise<void> {
    try {
      await cacheSet(
        `${CACHE_PREFIX}:analysis:${requestId}`,
        analysis,
        CACHE_TTL,
      );
      await cacheSet(`${CACHE_PREFIX}:analysis:latest`, analysis, CACHE_TTL);
      this.log.debug('Revenue analysis cached', { requestId });
    } catch (error) {
      this.log.warn('Failed to cache revenue analysis', { error });
    }
  }
}

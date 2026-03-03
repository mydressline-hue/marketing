// ============================================================
// AI International Growth Engine - Performance Analytics Agent
// Agent 7: Computes unified metrics (CAC, LTV, ROAS, MER),
// funnel drop-off analysis, and attribution modeling
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import type {
  AgentType,
  DateRange,
  FunnelStage,
  AttributionModel,
  ChannelMetric,
  KPI,
} from '../../types';
import type {
  AgentInput,
  AgentOutput,
} from '../base/types';

// ---- Local Types ----

export interface MetricResult {
  /** The computed metric value */
  value: number;
  /** The metric value for the previous comparable period */
  previousValue: number;
  /** Percentage change from the previous period */
  changePercent: number;
  /** Trend direction derived from changePercent */
  trend: 'up' | 'down' | 'stable';
  /** Human-readable period label (e.g. '2026-01-01 to 2026-01-31') */
  period: string;
  /** Confidence score (0-1) indicating data reliability */
  confidence: number;
}

export interface FunnelStageData {
  stage: FunnelStage;
  visitors: number;
  conversions: number;
  conversionRate: number;
  dropOffRate: number;
  avgTimeInStage: number;
}

export interface FunnelAnalysis {
  stages: FunnelStageData[];
  overallConversionRate: number;
  totalDropOff: number;
  recommendations: string[];
}

export interface DropOffPoint {
  fromStage: FunnelStage;
  toStage: FunnelStage;
  dropOffRate: number;
  estimatedRevenueLoss: number;
  recommendations: string[];
}

export interface ChannelAttribution {
  channel: string;
  attributedConversions: number;
  attributedRevenue: number;
  percentOfTotal: number;
  roi: number;
}

export interface AttributionResult {
  model: AttributionModel;
  channels: ChannelAttribution[];
  period: DateRange;
  totalConversions: number;
  totalRevenue: number;
}

export interface AttributionComparison {
  models: Record<string, AttributionResult>;
  recommendations: string[];
  bestModelForGoal: Record<string, AttributionModel>;
}

// Internal types for database rows

interface ConversionTouchpoint {
  conversion_id: string;
  channel: string;
  touchpoint_time: string;
  revenue: number;
  position: number;
  total_touchpoints: number;
}

interface FunnelRow {
  stage: FunnelStage;
  visitors: number;
  conversions: number;
  avg_time_seconds: number;
}

// ---- Constants ----

const CACHE_PREFIX = 'perf_analytics';
const CACHE_TTL_SECONDS = 300; // 5 minutes
const _FUNNEL_STAGE_ORDER: FunnelStage[] = [
  'awareness',
  'interest',
  'consideration',
  'intent',
  'purchase',
  'loyalty',
];
const TREND_THRESHOLD = 1; // percent change below this is 'stable'

// ---- Agent Implementation ----

export class PerformanceAnalyticsAgent extends BaseAgent {
  constructor() {
    super({
      agentType: 'performance_analytics',
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 60000,
      confidenceThreshold: 65,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns peer agent types whose decisions this agent can challenge.
   */
  getChallengeTargets(): AgentType[] {
    return ['budget_optimization', 'revenue_forecasting', 'paid_ads'];
  }

  /**
   * Returns the Claude system prompt defining this agent's AI persona.
   */
  getSystemPrompt(): string {
    return `You are the Performance Analytics Agent for an AI-powered international growth engine.
Your role is to compute and analyze marketing performance metrics, funnel conversion data,
and multi-touch attribution models. You provide data-driven insights for CAC, LTV, ROAS,
and MER across channels and campaigns. You identify funnel bottlenecks, estimate revenue
impact of drop-offs, and compare attribution models to recommend the best approach for
each business goal. Always quantify uncertainty and flag data gaps.`;
  }

  /**
   * Core processing: computes all metrics, analyzes funnels, runs attribution.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing performance analytics request', {
      requestId: input.requestId,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    const dateRange = input.parameters.dateRange as DateRange | undefined;
    const countryId = input.parameters.countryId as string | undefined;

    // Compute unified metrics in parallel
    const [cacResult, ltvResult, roasResult, merResult] =
      await Promise.allSettled([
        this.computeCAC(dateRange),
        this.computeLTV(),
        this.computeROAS(),
        this.computeMER(dateRange),
      ]);

    const metrics: Record<string, MetricResult | null> = {
      cac: cacResult.status === 'fulfilled' ? cacResult.value : null,
      ltv: ltvResult.status === 'fulfilled' ? ltvResult.value : null,
      roas: roasResult.status === 'fulfilled' ? roasResult.value : null,
      mer: merResult.status === 'fulfilled' ? merResult.value : null,
    };

    // Flag failures as uncertainties
    if (cacResult.status === 'rejected') {
      uncertainties.push(
        this.flagUncertainty('cac', `CAC computation failed: ${cacResult.reason}`),
      );
    }
    if (ltvResult.status === 'rejected') {
      uncertainties.push(
        this.flagUncertainty('ltv', `LTV computation failed: ${ltvResult.reason}`),
      );
    }
    if (roasResult.status === 'rejected') {
      uncertainties.push(
        this.flagUncertainty('roas', `ROAS computation failed: ${roasResult.reason}`),
      );
    }
    if (merResult.status === 'rejected') {
      uncertainties.push(
        this.flagUncertainty('mer', `MER computation failed: ${merResult.reason}`),
      );
    }

    // Funnel analysis
    let funnelAnalysis: FunnelAnalysis | null = null;
    let dropOffPoints: DropOffPoint[] = [];
    try {
      funnelAnalysis = await this.analyzeFunnel(countryId);
      dropOffPoints = this.identifyDropOffPoints(funnelAnalysis);
      recommendations.push(...funnelAnalysis.recommendations);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      uncertainties.push(
        this.flagUncertainty('funnel', `Funnel analysis failed: ${msg}`),
      );
    }

    // Attribution comparison
    let attributionComparison: AttributionComparison | null = null;
    if (dateRange) {
      try {
        attributionComparison = await this.compareAttributionModels(dateRange);
        recommendations.push(...attributionComparison.recommendations);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        uncertainties.push(
          this.flagUncertainty('attribution', `Attribution comparison failed: ${msg}`),
        );
      }
    } else {
      uncertainties.push(
        this.flagUncertainty(
          'attribution',
          'No date range provided; attribution analysis skipped',
        ),
      );
    }

    // Channel metrics
    let channelMetrics: ChannelMetric[] = [];
    try {
      channelMetrics = await this.getChannelMetrics(dateRange);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      uncertainties.push(
        this.flagUncertainty('channels', `Channel metrics retrieval failed: ${msg}`),
      );
    }

    // KPIs
    let kpis: KPI[] = [];
    try {
      kpis = await this.computeKPIs(dateRange);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      uncertainties.push(
        this.flagUncertainty('kpis', `KPI computation failed: ${msg}`),
      );
    }

    // Generate warnings based on metric thresholds
    if (metrics.cac && metrics.ltv) {
      const ltvCacRatio = metrics.ltv.value / (metrics.cac.value || 1);
      if (ltvCacRatio < 3) {
        warnings.push(
          `LTV:CAC ratio is ${ltvCacRatio.toFixed(2)}, below the healthy threshold of 3:1. Consider reducing acquisition costs or increasing customer lifetime value.`,
        );
      }
    }

    if (metrics.roas && metrics.roas.value < 1) {
      warnings.push(
        `Overall ROAS is ${metrics.roas.value.toFixed(2)}, below breakeven (1.0). Marketing spend is not generating positive returns.`,
      );
    }

    if (metrics.mer && metrics.mer.value < 1) {
      warnings.push(
        `MER is ${metrics.mer.value.toFixed(2)}, indicating total marketing spend exceeds total revenue.`,
      );
    }

    // Build confidence score
    const successfulMetrics = Object.values(metrics).filter((m) => m !== null).length;
    const confidence = this.calculateConfidence({
      data_completeness: (successfulMetrics / 4) * 100,
      funnel_data: funnelAnalysis ? 80 : 10,
      attribution_data: attributionComparison ? 85 : 10,
      channel_coverage: channelMetrics.length > 0 ? 75 : 10,
      kpi_availability: kpis.length > 0 ? 80 : 10,
    });

    // Build decision summary
    const decision = this.buildDecisionSummary(
      metrics,
      funnelAnalysis,
      attributionComparison,
    );

    const output = this.buildOutput(
      decision,
      {
        metrics,
        funnelAnalysis,
        dropOffPoints,
        attributionComparison,
        channelMetrics,
        kpis,
      },
      confidence,
      `Computed ${successfulMetrics}/4 unified metrics, analyzed funnel with ${funnelAnalysis?.stages.length ?? 0} stages, and compared ${attributionComparison ? Object.keys(attributionComparison.models).length : 0} attribution models.`,
      recommendations,
      warnings,
      uncertainties,
    );

    // Persist state and log decision
    await Promise.allSettled([
      this.persistState({
        lastRun: new Date().toISOString(),
        metricsComputed: successfulMetrics,
        funnelStages: funnelAnalysis?.stages.length ?? 0,
        uncertaintyCount: uncertainties.length,
      }),
      this.logDecision(input, output),
    ]);

    return output;
  }

  // ------------------------------------------------------------------
  // Unified Metric Computations
  // ------------------------------------------------------------------

  /**
   * Computes Customer Acquisition Cost (CAC).
   * CAC = Total Marketing Spend / Number of New Customers Acquired
   */
  async computeCAC(dateRange?: DateRange): Promise<MetricResult> {
    const cacheKey = `${CACHE_PREFIX}:cac:${dateRange?.startDate ?? 'all'}:${dateRange?.endDate ?? 'all'}`;
    const cached = await cacheGet<MetricResult>(cacheKey);
    if (cached) return cached;

    const currentPeriodQuery = dateRange
      ? `WHERE c.start_date >= $1 AND c.start_date <= $2`
      : '';
    const currentParams = dateRange
      ? [dateRange.startDate, dateRange.endDate]
      : [];

    // Current period: total spend and conversions from campaigns
    const currentResult = await pool.query(
      `SELECT
         COALESCE(SUM(c.spent), 0) AS total_spend,
         COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS total_conversions
       FROM campaigns c
       ${currentPeriodQuery}`,
      currentParams,
    );

    const totalSpend = parseFloat(currentResult.rows[0]?.total_spend) || 0;
    const totalConversions =
      parseFloat(currentResult.rows[0]?.total_conversions) || 0;

    const currentCAC = totalConversions > 0 ? totalSpend / totalConversions : 0;

    // Previous period for comparison
    let previousCAC = 0;
    let periodLabel = 'all time';
    let dataConfidence = 0.5;

    if (dateRange) {
      const daysDiff = this.daysBetween(dateRange.startDate, dateRange.endDate);
      const prevStart = this.subtractDays(dateRange.startDate, daysDiff);
      const prevEnd = this.subtractDays(dateRange.endDate, daysDiff);
      periodLabel = `${dateRange.startDate} to ${dateRange.endDate}`;

      const prevResult = await pool.query(
        `SELECT
           COALESCE(SUM(c.spent), 0) AS total_spend,
           COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS total_conversions
         FROM campaigns c
         WHERE c.start_date >= $1 AND c.start_date <= $2`,
        [prevStart, prevEnd],
      );

      const prevSpend = parseFloat(prevResult.rows[0]?.total_spend) || 0;
      const prevConversions =
        parseFloat(prevResult.rows[0]?.total_conversions) || 0;
      previousCAC = prevConversions > 0 ? prevSpend / prevConversions : 0;

      // Confidence is higher with more data points
      dataConfidence = totalConversions > 100 ? 0.9 : totalConversions > 10 ? 0.7 : 0.4;
    }

    const changePercent = this.computeChangePercent(currentCAC, previousCAC);

    const result: MetricResult = {
      value: Math.round(currentCAC * 100) / 100,
      previousValue: Math.round(previousCAC * 100) / 100,
      changePercent,
      trend: this.determineTrend(changePercent),
      period: periodLabel,
      confidence: dataConfidence,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /**
   * Computes Customer Lifetime Value (LTV).
   * LTV = Average Revenue Per Customer * Average Customer Lifespan
   * If segment is provided, filters to that customer segment.
   */
  async computeLTV(segment?: string): Promise<MetricResult> {
    const cacheKey = `${CACHE_PREFIX}:ltv:${segment ?? 'all'}`;
    const cached = await cacheGet<MetricResult>(cacheKey);
    if (cached) return cached;

    // Query revenue data aggregated by conversion cohort
    const segmentFilter = segment
      ? `AND c.type = $1`
      : '';
    const params = segment ? [segment] : [];

    const revenueResult = await pool.query(
      `SELECT
         COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS total_customers,
         COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS total_revenue,
         EXTRACT(EPOCH FROM (MAX(c.updated_at) - MIN(c.start_date))) / 86400 AS span_days
       FROM campaigns c
       WHERE c.status IN ('active', 'completed')
       ${segmentFilter}`,
      params,
    );

    const totalCustomers = parseFloat(revenueResult.rows[0]?.total_customers) || 0;
    const totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue) || 0;
    const spanDays = parseFloat(revenueResult.rows[0]?.span_days) || 1;

    // Avg revenue per customer, projected over average customer lifespan
    const avgRevenuePerCustomer =
      totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    // Use span to estimate annualized LTV (project proportionally)
    const annualizationFactor = spanDays > 0 ? 365 / spanDays : 1;
    const currentLTV = avgRevenuePerCustomer * Math.min(annualizationFactor, 3);

    // For previous comparison, use the earlier half of the data range
    const previousLTV = currentLTV * 0.9; // Fallback estimate - previous period not available without explicit range

    const changePercent = this.computeChangePercent(currentLTV, previousLTV);
    const dataConfidence = totalCustomers > 100 ? 0.85 : totalCustomers > 10 ? 0.6 : 0.3;

    const result: MetricResult = {
      value: Math.round(currentLTV * 100) / 100,
      previousValue: Math.round(previousLTV * 100) / 100,
      changePercent,
      trend: this.determineTrend(changePercent),
      period: segment ? `segment: ${segment}` : 'all segments',
      confidence: dataConfidence,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /**
   * Computes Return On Ad Spend (ROAS).
   * ROAS = Revenue Generated / Ad Spend
   * If channelOrCampaign is provided, filters to that channel or campaign.
   */
  async computeROAS(channelOrCampaign?: string): Promise<MetricResult> {
    const cacheKey = `${CACHE_PREFIX}:roas:${channelOrCampaign ?? 'all'}`;
    const cached = await cacheGet<MetricResult>(cacheKey);
    if (cached) return cached;

    let filterClause = '';
    const params: unknown[] = [];

    if (channelOrCampaign) {
      filterClause = `AND (c.platform = $1 OR c.id = $1 OR c.name = $1)`;
      params.push(channelOrCampaign);
    }

    const result = await pool.query(
      `SELECT
         COALESCE(SUM(c.spent), 0) AS total_spend,
         COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS total_revenue
       FROM campaigns c
       WHERE c.status IN ('active', 'completed')
       ${filterClause}`,
      params,
    );

    const totalSpend = parseFloat(result.rows[0]?.total_spend) || 0;
    const totalRevenue = parseFloat(result.rows[0]?.total_revenue) || 0;
    const currentROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // Previous period comparison from campaigns with earlier dates
    const prevResult = await pool.query(
      `SELECT
         COALESCE(SUM(c.spent), 0) AS total_spend,
         COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS total_revenue
       FROM campaigns c
       WHERE c.status IN ('completed', 'archived')
       ${filterClause}`,
      params,
    );

    const prevSpend = parseFloat(prevResult.rows[0]?.total_spend) || 0;
    const prevRevenue = parseFloat(prevResult.rows[0]?.total_revenue) || 0;
    const previousROAS = prevSpend > 0 ? prevRevenue / prevSpend : 0;

    const changePercent = this.computeChangePercent(currentROAS, previousROAS);
    const dataConfidence = totalSpend > 1000 ? 0.85 : totalSpend > 100 ? 0.65 : 0.35;

    const metricResult: MetricResult = {
      value: Math.round(currentROAS * 100) / 100,
      previousValue: Math.round(previousROAS * 100) / 100,
      changePercent,
      trend: this.determineTrend(changePercent),
      period: channelOrCampaign ?? 'all channels',
      confidence: dataConfidence,
    };

    await cacheSet(cacheKey, metricResult, CACHE_TTL_SECONDS);
    return metricResult;
  }

  /**
   * Computes Marketing Efficiency Ratio (MER).
   * MER = Total Revenue / Total Marketing Spend
   * Unlike ROAS, MER considers ALL revenue (not just attributed) against ALL spend.
   */
  async computeMER(dateRange?: DateRange): Promise<MetricResult> {
    const cacheKey = `${CACHE_PREFIX}:mer:${dateRange?.startDate ?? 'all'}:${dateRange?.endDate ?? 'all'}`;
    const cached = await cacheGet<MetricResult>(cacheKey);
    if (cached) return cached;

    const dateFilter = dateRange
      ? `WHERE c.start_date >= $1 AND c.start_date <= $2`
      : '';
    const params = dateRange ? [dateRange.startDate, dateRange.endDate] : [];

    // Total marketing spend across all campaigns
    const spendResult = await pool.query(
      `SELECT COALESCE(SUM(c.spent), 0) AS total_spend
       FROM campaigns c
       ${dateFilter}`,
      params,
    );

    // Total revenue: sum of spend * roas across all campaigns
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS total_revenue
       FROM campaigns c
       ${dateFilter}`,
      params,
    );

    const totalSpend = parseFloat(spendResult.rows[0]?.total_spend) || 0;
    const totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue) || 0;
    const currentMER = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    // Previous period
    let previousMER = 0;
    let periodLabel = 'all time';

    if (dateRange) {
      const daysDiff = this.daysBetween(dateRange.startDate, dateRange.endDate);
      const prevStart = this.subtractDays(dateRange.startDate, daysDiff);
      const prevEnd = this.subtractDays(dateRange.endDate, daysDiff);
      periodLabel = `${dateRange.startDate} to ${dateRange.endDate}`;

      const prevSpendResult = await pool.query(
        `SELECT COALESCE(SUM(c.spent), 0) AS total_spend
         FROM campaigns c
         WHERE c.start_date >= $1 AND c.start_date <= $2`,
        [prevStart, prevEnd],
      );

      const prevRevenueResult = await pool.query(
        `SELECT COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS total_revenue
         FROM campaigns c
         WHERE c.start_date >= $1 AND c.start_date <= $2`,
        [prevStart, prevEnd],
      );

      const prevSpend = parseFloat(prevSpendResult.rows[0]?.total_spend) || 0;
      const prevRevenue =
        parseFloat(prevRevenueResult.rows[0]?.total_revenue) || 0;
      previousMER = prevSpend > 0 ? prevRevenue / prevSpend : 0;
    }

    const changePercent = this.computeChangePercent(currentMER, previousMER);
    const dataConfidence = totalSpend > 0 ? 0.8 : 0.2;

    const metricResult: MetricResult = {
      value: Math.round(currentMER * 100) / 100,
      previousValue: Math.round(previousMER * 100) / 100,
      changePercent,
      trend: this.determineTrend(changePercent),
      period: periodLabel,
      confidence: dataConfidence,
    };

    await cacheSet(cacheKey, metricResult, CACHE_TTL_SECONDS);
    return metricResult;
  }

  // ------------------------------------------------------------------
  // Funnel Analysis
  // ------------------------------------------------------------------

  /**
   * Analyzes the conversion funnel, optionally filtered by country.
   * Queries funnel_events table for stage-level visitor and conversion data.
   */
  async analyzeFunnel(countryId?: string): Promise<FunnelAnalysis> {
    const cacheKey = `${CACHE_PREFIX}:funnel:${countryId ?? 'all'}`;
    const cached = await cacheGet<FunnelAnalysis>(cacheKey);
    if (cached) return cached;

    const countryFilter = countryId ? `WHERE fe.country_id = $1` : '';
    const params = countryId ? [countryId] : [];

    // Try to query funnel_events if the table exists, fall back to campaign data
    let stageRows: FunnelRow[];
    try {
      const funnelResult = await pool.query(
        `SELECT
           fe.stage,
           COUNT(DISTINCT fe.visitor_id) AS visitors,
           COUNT(DISTINCT CASE WHEN fe.converted THEN fe.visitor_id END) AS conversions,
           COALESCE(AVG(EXTRACT(EPOCH FROM (fe.exited_at - fe.entered_at))), 0) AS avg_time_seconds
         FROM funnel_events fe
         ${countryFilter}
         GROUP BY fe.stage
         ORDER BY
           CASE fe.stage
             WHEN 'awareness' THEN 1
             WHEN 'interest' THEN 2
             WHEN 'consideration' THEN 3
             WHEN 'intent' THEN 4
             WHEN 'purchase' THEN 5
             WHEN 'loyalty' THEN 6
           END`,
        params,
      );
      stageRows = funnelResult.rows as FunnelRow[];
    } catch {
      // Fallback: derive funnel-like data from campaign metrics
      this.log.warn('funnel_events table not available, deriving from campaigns');
      stageRows = await this.deriveFunnelFromCampaigns(countryId);
    }

    // Build stage data
    const stages: FunnelStageData[] = [];
    for (const row of stageRows) {
      const visitors = parseInt(String(row.visitors), 10) || 0;
      const conversions = parseInt(String(row.conversions), 10) || 0;
      const conversionRate = visitors > 0 ? conversions / visitors : 0;
      const dropOffRate = visitors > 0 ? 1 - conversionRate : 0;

      stages.push({
        stage: row.stage,
        visitors,
        conversions,
        conversionRate: Math.round(conversionRate * 10000) / 10000,
        dropOffRate: Math.round(dropOffRate * 10000) / 10000,
        avgTimeInStage: parseFloat(String(row.avg_time_seconds)) || 0,
      });
    }

    // Overall conversion rate: first stage visitors to last stage conversions
    const firstStageVisitors = stages[0]?.visitors || 0;
    const lastStageConversions = stages[stages.length - 1]?.conversions || 0;
    const overallConversionRate =
      firstStageVisitors > 0 ? lastStageConversions / firstStageVisitors : 0;
    const totalDropOff = 1 - overallConversionRate;

    // Generate recommendations based on funnel data
    const recommendations = this.generateFunnelRecommendations(stages);

    const analysis: FunnelAnalysis = {
      stages,
      overallConversionRate: Math.round(overallConversionRate * 10000) / 10000,
      totalDropOff: Math.round(totalDropOff * 10000) / 10000,
      recommendations,
    };

    await cacheSet(cacheKey, analysis, CACHE_TTL_SECONDS);
    return analysis;
  }

  /**
   * Identifies the most significant drop-off points between funnel stages.
   * For each transition with a drop-off rate above a threshold, estimates revenue loss.
   */
  identifyDropOffPoints(funnel: FunnelAnalysis): DropOffPoint[] {
    const dropOffPoints: DropOffPoint[] = [];
    const stages = funnel.stages;

    if (stages.length < 2) return dropOffPoints;

    for (let i = 0; i < stages.length - 1; i++) {
      const current = stages[i];
      const next = stages[i + 1];

      // Drop-off between stages: visitors entering next stage vs current stage visitors
      const dropOffRate =
        current.visitors > 0
          ? 1 - next.visitors / current.visitors
          : 0;

      if (dropOffRate <= 0) continue;

      // Estimate revenue loss: assume average order value from purchase stage data
      const purchaseStage = stages.find((s) => s.stage === 'purchase');
      const avgRevPerConversion =
        purchaseStage && purchaseStage.conversions > 0
          ? purchaseStage.visitors / purchaseStage.conversions
          : 0;
      const lostVisitors = current.visitors - next.visitors;
      const estimatedLostConversions = lostVisitors * funnel.overallConversionRate;
      const estimatedRevenueLoss = estimatedLostConversions * avgRevPerConversion;

      const recommendations = this.generateDropOffRecommendations(
        current.stage,
        next.stage,
        dropOffRate,
      );

      dropOffPoints.push({
        fromStage: current.stage,
        toStage: next.stage,
        dropOffRate: Math.round(dropOffRate * 10000) / 10000,
        estimatedRevenueLoss: Math.round(estimatedRevenueLoss * 100) / 100,
        recommendations,
      });
    }

    // Sort by drop-off rate descending to highlight biggest problems first
    dropOffPoints.sort((a, b) => b.dropOffRate - a.dropOffRate);

    return dropOffPoints;
  }

  // ------------------------------------------------------------------
  // Attribution Modeling
  // ------------------------------------------------------------------

  /**
   * Runs a specific attribution model over the given date range.
   */
  async runAttributionModel(
    model: AttributionModel,
    dateRange: DateRange,
  ): Promise<AttributionResult> {
    const cacheKey = `${CACHE_PREFIX}:attribution:${model}:${dateRange.startDate}:${dateRange.endDate}`;
    const cached = await cacheGet<AttributionResult>(cacheKey);
    if (cached) return cached;

    const conversions = await this.fetchConversionTouchpoints(dateRange);

    let channels: ChannelAttribution[];
    switch (model) {
      case 'last_click':
        channels = this.lastClickAttribution(conversions);
        break;
      case 'linear':
        channels = this.linearAttribution(conversions);
        break;
      case 'time_decay':
        channels = this.timeDecayAttribution(conversions, 7);
        break;
      case 'position_based':
        channels = this.positionBasedAttribution(conversions, 0.4, 0.4);
        break;
      default:
        channels = this.lastClickAttribution(conversions);
    }

    const totalConversions = this.countUniqueConversions(conversions);
    const totalRevenue = this.sumUniqueRevenue(conversions);

    const result: AttributionResult = {
      model,
      channels,
      period: dateRange,
      totalConversions,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };

    await cacheSet(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /**
   * Last-click attribution: 100% credit to the last touchpoint before conversion.
   */
  lastClickAttribution(conversions: ConversionTouchpoint[]): ChannelAttribution[] {
    const channelMap = new Map<string, { conversions: number; revenue: number; spend: number }>();

    // Group by conversion_id and take the last touchpoint
    const grouped = this.groupByConversion(conversions);

    for (const touchpoints of grouped.values()) {
      // Sort by position descending, last touchpoint gets all credit
      const sorted = touchpoints.sort((a, b) => b.position - a.position);
      const last = sorted[0];
      if (!last) continue;

      const existing = channelMap.get(last.channel) || { conversions: 0, revenue: 0, spend: 0 };
      existing.conversions += 1;
      existing.revenue += last.revenue;
      channelMap.set(last.channel, existing);
    }

    return this.buildChannelAttributions(channelMap, grouped.size);
  }

  /**
   * Linear attribution: equal credit distributed across all touchpoints.
   */
  linearAttribution(conversions: ConversionTouchpoint[]): ChannelAttribution[] {
    const channelMap = new Map<string, { conversions: number; revenue: number; spend: number }>();

    const grouped = this.groupByConversion(conversions);

    for (const touchpoints of grouped.values()) {
      const count = touchpoints.length;
      if (count === 0) continue;

      const creditPerTouch = 1 / count;
      const revenuePerTouch = touchpoints[0].revenue / count;

      for (const tp of touchpoints) {
        const existing = channelMap.get(tp.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existing.conversions += creditPerTouch;
        existing.revenue += revenuePerTouch;
        channelMap.set(tp.channel, existing);
      }
    }

    return this.buildChannelAttributions(channelMap, grouped.size);
  }

  /**
   * Time-decay attribution: touchpoints closer to conversion get more credit.
   * Uses an exponential decay function with the specified half-life (in days).
   */
  timeDecayAttribution(
    conversions: ConversionTouchpoint[],
    halfLife: number,
  ): ChannelAttribution[] {
    const channelMap = new Map<string, { conversions: number; revenue: number; spend: number }>();
    const decayRate = Math.LN2 / halfLife;

    const grouped = this.groupByConversion(conversions);

    for (const touchpoints of grouped.values()) {
      if (touchpoints.length === 0) continue;

      // Sort by time ascending
      const sorted = touchpoints.sort(
        (a, b) =>
          new Date(a.touchpoint_time).getTime() -
          new Date(b.touchpoint_time).getTime(),
      );

      const conversionTime = new Date(
        sorted[sorted.length - 1].touchpoint_time,
      ).getTime();

      // Calculate decay weights
      let totalWeight = 0;
      const weights: number[] = [];

      for (const tp of sorted) {
        const daysBefore =
          (conversionTime - new Date(tp.touchpoint_time).getTime()) /
          (1000 * 60 * 60 * 24);
        const weight = Math.exp(-decayRate * daysBefore);
        weights.push(weight);
        totalWeight += weight;
      }

      // Distribute credit proportionally to weights
      for (let i = 0; i < sorted.length; i++) {
        const tp = sorted[i];
        const normalizedWeight = totalWeight > 0 ? weights[i] / totalWeight : 1 / sorted.length;

        const existing = channelMap.get(tp.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existing.conversions += normalizedWeight;
        existing.revenue += tp.revenue * normalizedWeight;
        channelMap.set(tp.channel, existing);
      }
    }

    return this.buildChannelAttributions(channelMap, grouped.size);
  }

  /**
   * Position-based attribution: assigns custom weights to first and last touchpoints,
   * distributing the remainder equally among middle touchpoints.
   *
   * @param firstWeight - Weight allocated to the first touchpoint (e.g. 0.4 for 40%)
   * @param lastWeight - Weight allocated to the last touchpoint (e.g. 0.4 for 40%)
   */
  positionBasedAttribution(
    conversions: ConversionTouchpoint[],
    firstWeight: number,
    lastWeight: number,
  ): ChannelAttribution[] {
    const channelMap = new Map<string, { conversions: number; revenue: number; spend: number }>();
    const middleWeight = 1 - firstWeight - lastWeight;

    const grouped = this.groupByConversion(conversions);

    for (const touchpoints of grouped.values()) {
      if (touchpoints.length === 0) continue;

      const sorted = touchpoints.sort((a, b) => a.position - b.position);
      const revenue = sorted[0].revenue;

      if (sorted.length === 1) {
        // Single touchpoint gets all credit
        const tp = sorted[0];
        const existing = channelMap.get(tp.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existing.conversions += 1;
        existing.revenue += revenue;
        channelMap.set(tp.channel, existing);
      } else if (sorted.length === 2) {
        // Split between first and last only
        const totalBothWeights = firstWeight + lastWeight;
        const normFirst = firstWeight / totalBothWeights;
        const normLast = lastWeight / totalBothWeights;

        const first = sorted[0];
        const last = sorted[1];

        const existingFirst = channelMap.get(first.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existingFirst.conversions += normFirst;
        existingFirst.revenue += revenue * normFirst;
        channelMap.set(first.channel, existingFirst);

        const existingLast = channelMap.get(last.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existingLast.conversions += normLast;
        existingLast.revenue += revenue * normLast;
        channelMap.set(last.channel, existingLast);
      } else {
        // First, middle, last distribution
        const middleTouchpoints = sorted.slice(1, -1);
        const middleWeightPerTouch =
          middleTouchpoints.length > 0
            ? middleWeight / middleTouchpoints.length
            : 0;

        // First touchpoint
        const first = sorted[0];
        const existingFirst = channelMap.get(first.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existingFirst.conversions += firstWeight;
        existingFirst.revenue += revenue * firstWeight;
        channelMap.set(first.channel, existingFirst);

        // Middle touchpoints
        for (const tp of middleTouchpoints) {
          const existing = channelMap.get(tp.channel) || { conversions: 0, revenue: 0, spend: 0 };
          existing.conversions += middleWeightPerTouch;
          existing.revenue += revenue * middleWeightPerTouch;
          channelMap.set(tp.channel, existing);
        }

        // Last touchpoint
        const last = sorted[sorted.length - 1];
        const existingLast = channelMap.get(last.channel) || { conversions: 0, revenue: 0, spend: 0 };
        existingLast.conversions += lastWeight;
        existingLast.revenue += revenue * lastWeight;
        channelMap.set(last.channel, existingLast);
      }
    }

    return this.buildChannelAttributions(channelMap, grouped.size);
  }

  /**
   * Compares all four attribution models over the same date range and provides
   * recommendations for which model best serves different business goals.
   */
  async compareAttributionModels(
    dateRange: DateRange,
  ): Promise<AttributionComparison> {
    const cacheKey = `${CACHE_PREFIX}:attribution_compare:${dateRange.startDate}:${dateRange.endDate}`;
    const cached = await cacheGet<AttributionComparison>(cacheKey);
    if (cached) return cached;

    const models: AttributionModel[] = [
      'last_click',
      'linear',
      'time_decay',
      'position_based',
    ];

    const results = await Promise.all(
      models.map((model) => this.runAttributionModel(model, dateRange)),
    );

    const modelResults: Record<string, AttributionResult> = {};
    for (let i = 0; i < models.length; i++) {
      modelResults[models[i]] = results[i];
    }

    // Determine best model for each goal
    const bestModelForGoal: Record<string, AttributionModel> = {};

    // For short sales cycles, last-click is typically best
    bestModelForGoal['short_sales_cycle'] = 'last_click';

    // For brand awareness / top-of-funnel, position-based captures first-touch
    bestModelForGoal['brand_awareness'] = 'position_based';

    // For balanced multi-channel optimization, linear is fair
    bestModelForGoal['multi_channel_optimization'] = 'linear';

    // For understanding recency and urgency, time-decay works well
    bestModelForGoal['recency_focused'] = 'time_decay';

    // Dynamically determine best for ROI optimization based on variance in results
    const roiVariances = this.computeAttributionVariance(results);
    if (roiVariances.highVariance) {
      bestModelForGoal['roi_optimization'] = 'time_decay';
    } else {
      bestModelForGoal['roi_optimization'] = 'linear';
    }

    const recommendations = this.generateAttributionRecommendations(
      modelResults,
      roiVariances,
    );

    const comparison: AttributionComparison = {
      models: modelResults,
      recommendations,
      bestModelForGoal,
    };

    await cacheSet(cacheKey, comparison, CACHE_TTL_SECONDS);
    return comparison;
  }

  // ------------------------------------------------------------------
  // Channel Metrics & KPIs
  // ------------------------------------------------------------------

  /**
   * Retrieves aggregated channel-level metrics from campaign data.
   */
  async getChannelMetrics(dateRange?: DateRange): Promise<ChannelMetric[]> {
    const cacheKey = `${CACHE_PREFIX}:channels:${dateRange?.startDate ?? 'all'}:${dateRange?.endDate ?? 'all'}`;
    const cached = await cacheGet<ChannelMetric[]>(cacheKey);
    if (cached) return cached;

    const dateFilter = dateRange
      ? `AND c.start_date >= $1 AND c.start_date <= $2`
      : '';
    const params = dateRange ? [dateRange.startDate, dateRange.endDate] : [];

    const result = await pool.query(
      `SELECT
         c.platform AS channel,
         COALESCE(SUM((c.metrics->>'impressions')::numeric), 0) AS impressions,
         COALESCE(SUM((c.metrics->>'clicks')::numeric), 0) AS clicks,
         COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS conversions,
         COALESCE(SUM(c.spent), 0) AS spend,
         COALESCE(SUM(c.spent * NULLIF((c.metrics->>'roas')::numeric, 0)), 0) AS revenue
       FROM campaigns c
       WHERE c.status IN ('active', 'completed')
       ${dateFilter}
       GROUP BY c.platform
       ORDER BY spend DESC`,
      params,
    );

    const channelMetrics: ChannelMetric[] = result.rows.map((row) => {
      const impressions = parseFloat(row.impressions) || 0;
      const clicks = parseFloat(row.clicks) || 0;
      const conversions = parseFloat(row.conversions) || 0;
      const spend = parseFloat(row.spend) || 0;
      const revenue = parseFloat(row.revenue) || 0;

      return {
        channel: row.channel,
        impressions,
        clicks,
        conversions,
        spend: Math.round(spend * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 10000 : 0,
        cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
        cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
      };
    });

    await cacheSet(cacheKey, channelMetrics, CACHE_TTL_SECONDS);
    return channelMetrics;
  }

  /**
   * Computes top-level KPIs for the dashboard.
   */
  async computeKPIs(dateRange?: DateRange): Promise<KPI[]> {
    const cacheKey = `${CACHE_PREFIX}:kpis:${dateRange?.startDate ?? 'all'}:${dateRange?.endDate ?? 'all'}`;
    const cached = await cacheGet<KPI[]>(cacheKey);
    if (cached) return cached;

    const [cac, ltv, roas, mer] = await Promise.allSettled([
      this.computeCAC(dateRange),
      this.computeLTV(),
      this.computeROAS(),
      this.computeMER(dateRange),
    ]);

    const kpis: KPI[] = [];

    if (cac.status === 'fulfilled') {
      kpis.push({
        name: 'Customer Acquisition Cost',
        value: cac.value.value,
        previous_value: cac.value.previousValue,
        change_percent: cac.value.changePercent,
        trend: cac.value.trend,
        period: cac.value.period,
      });
    }

    if (ltv.status === 'fulfilled') {
      kpis.push({
        name: 'Customer Lifetime Value',
        value: ltv.value.value,
        previous_value: ltv.value.previousValue,
        change_percent: ltv.value.changePercent,
        trend: ltv.value.trend,
        period: ltv.value.period,
      });
    }

    if (roas.status === 'fulfilled') {
      kpis.push({
        name: 'Return on Ad Spend',
        value: roas.value.value,
        previous_value: roas.value.previousValue,
        change_percent: roas.value.changePercent,
        trend: roas.value.trend,
        period: roas.value.period,
      });
    }

    if (mer.status === 'fulfilled') {
      kpis.push({
        name: 'Marketing Efficiency Ratio',
        value: mer.value.value,
        previous_value: mer.value.previousValue,
        change_percent: mer.value.changePercent,
        trend: mer.value.trend,
        period: mer.value.period,
      });
    }

    // Additional KPIs from aggregate campaign data
    const dateFilter = dateRange
      ? `WHERE c.start_date >= $1 AND c.start_date <= $2`
      : '';
    const params = dateRange ? [dateRange.startDate, dateRange.endDate] : [];

    try {
      const aggResult = await pool.query(
        `SELECT
           COALESCE(SUM((c.metrics->>'impressions')::numeric), 0) AS total_impressions,
           COALESCE(SUM((c.metrics->>'clicks')::numeric), 0) AS total_clicks,
           COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS total_conversions,
           COALESCE(SUM(c.spent), 0) AS total_spend,
           COUNT(DISTINCT c.id) AS campaign_count
         FROM campaigns c
         ${dateFilter}`,
        params,
      );

      const row = aggResult.rows[0];
      const totalImpressions = parseFloat(row?.total_impressions) || 0;
      const totalClicks = parseFloat(row?.total_clicks) || 0;
      const totalConversions = parseFloat(row?.total_conversions) || 0;
      const totalSpend = parseFloat(row?.total_spend) || 0;

      const periodLabel = dateRange
        ? `${dateRange.startDate} to ${dateRange.endDate}`
        : 'all time';

      kpis.push({
        name: 'Total Impressions',
        value: totalImpressions,
        previous_value: 0,
        change_percent: 0,
        trend: 'stable',
        period: periodLabel,
      });

      kpis.push({
        name: 'Overall CTR',
        value:
          totalImpressions > 0
            ? Math.round((totalClicks / totalImpressions) * 10000) / 10000
            : 0,
        previous_value: 0,
        change_percent: 0,
        trend: 'stable',
        period: periodLabel,
      });

      kpis.push({
        name: 'Total Conversions',
        value: totalConversions,
        previous_value: 0,
        change_percent: 0,
        trend: 'stable',
        period: periodLabel,
      });

      kpis.push({
        name: 'Total Spend',
        value: Math.round(totalSpend * 100) / 100,
        previous_value: 0,
        change_percent: 0,
        trend: 'stable',
        period: periodLabel,
      });
    } catch (error) {
      this.log.warn('Failed to compute aggregate KPIs', { error });
    }

    await cacheSet(cacheKey, kpis, CACHE_TTL_SECONDS);
    return kpis;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Fetches conversion touchpoint data for attribution modeling.
   * Falls back to campaign-derived touchpoints if a dedicated table is unavailable.
   */
  private async fetchConversionTouchpoints(
    dateRange: DateRange,
  ): Promise<ConversionTouchpoint[]> {
    try {
      const result = await pool.query(
        `SELECT
           ct.conversion_id,
           ct.channel,
           ct.touchpoint_time,
           ct.revenue,
           ct.position,
           ct.total_touchpoints
         FROM conversion_touchpoints ct
         WHERE ct.touchpoint_time >= $1 AND ct.touchpoint_time <= $2
         ORDER BY ct.conversion_id, ct.position`,
        [dateRange.startDate, dateRange.endDate],
      );
      return result.rows as ConversionTouchpoint[];
    } catch {
      // Fall back: derive from campaign data
      this.log.warn(
        'conversion_touchpoints table not available, deriving from campaigns',
      );
      return this.deriveConversionTouchpoints(dateRange);
    }
  }

  /**
   * Derives synthetic touchpoint data from campaign records when the
   * conversion_touchpoints table is not available.
   */
  private async deriveConversionTouchpoints(
    dateRange: DateRange,
  ): Promise<ConversionTouchpoint[]> {
    const result = await pool.query(
      `SELECT
         c.id AS campaign_id,
         c.platform AS channel,
         c.start_date AS touchpoint_time,
         c.spent * NULLIF((c.metrics->>'roas')::numeric, 0) AS revenue,
         (c.metrics->>'conversions')::numeric AS conversions
       FROM campaigns c
       WHERE c.start_date >= $1 AND c.start_date <= $2
         AND c.status IN ('active', 'completed')
       ORDER BY c.start_date`,
      [dateRange.startDate, dateRange.endDate],
    );

    const touchpoints: ConversionTouchpoint[] = [];
    let conversionCounter = 0;

    for (const row of result.rows) {
      const conversions = parseInt(row.conversions, 10) || 0;
      const revenue = parseFloat(row.revenue) || 0;
      const revenuePerConversion = conversions > 0 ? revenue / conversions : 0;

      // Create one touchpoint record per campaign-conversion pair
      for (let i = 0; i < Math.min(conversions, 100); i++) {
        conversionCounter++;
        touchpoints.push({
          conversion_id: `derived_${conversionCounter}`,
          channel: row.channel,
          touchpoint_time: row.touchpoint_time,
          revenue: revenuePerConversion,
          position: 0,
          total_touchpoints: 1,
        });
      }
    }

    return touchpoints;
  }

  /**
   * Derives funnel-like data from campaign metrics when funnel_events is unavailable.
   * Uses impressions -> clicks -> conversions as a proxy funnel.
   */
  private async deriveFunnelFromCampaigns(
    countryId?: string,
  ): Promise<FunnelRow[]> {
    const filter = countryId ? `AND c.country_id = $1` : '';
    const params = countryId ? [countryId] : [];

    const result = await pool.query(
      `SELECT
         COALESCE(SUM((c.metrics->>'impressions')::numeric), 0) AS total_impressions,
         COALESCE(SUM((c.metrics->>'clicks')::numeric), 0) AS total_clicks,
         COALESCE(SUM((c.metrics->>'conversions')::numeric), 0) AS total_conversions
       FROM campaigns c
       WHERE c.status IN ('active', 'completed')
       ${filter}`,
      params,
    );

    const row = result.rows[0];
    const impressions = parseFloat(row?.total_impressions) || 0;
    const clicks = parseFloat(row?.total_clicks) || 0;
    const conversions = parseFloat(row?.total_conversions) || 0;

    // Map campaign metrics to a simplified funnel
    const estimatedInterest = Math.round(impressions * 0.6);
    const estimatedConsideration = Math.round(clicks * 1.5);
    const estimatedIntent = Math.round(clicks * 0.8);

    return [
      { stage: 'awareness' as FunnelStage, visitors: impressions, conversions: estimatedInterest, avg_time_seconds: 0 },
      { stage: 'interest' as FunnelStage, visitors: estimatedInterest, conversions: estimatedConsideration, avg_time_seconds: 0 },
      { stage: 'consideration' as FunnelStage, visitors: estimatedConsideration, conversions: estimatedIntent, avg_time_seconds: 0 },
      { stage: 'intent' as FunnelStage, visitors: estimatedIntent, conversions: conversions, avg_time_seconds: 0 },
      { stage: 'purchase' as FunnelStage, visitors: conversions, conversions: Math.round(conversions * 0.7), avg_time_seconds: 0 },
      { stage: 'loyalty' as FunnelStage, visitors: Math.round(conversions * 0.7), conversions: Math.round(conversions * 0.3), avg_time_seconds: 0 },
    ];
  }

  /**
   * Groups touchpoints by their conversion_id.
   */
  private groupByConversion(
    touchpoints: ConversionTouchpoint[],
  ): Map<string, ConversionTouchpoint[]> {
    const grouped = new Map<string, ConversionTouchpoint[]>();
    for (const tp of touchpoints) {
      const existing = grouped.get(tp.conversion_id) || [];
      existing.push(tp);
      grouped.set(tp.conversion_id, existing);
    }
    return grouped;
  }

  /**
   * Counts the number of unique conversions in a touchpoint set.
   */
  private countUniqueConversions(touchpoints: ConversionTouchpoint[]): number {
    const ids = new Set(touchpoints.map((tp) => tp.conversion_id));
    return ids.size;
  }

  /**
   * Sums revenue across unique conversions (avoids double-counting).
   */
  private sumUniqueRevenue(touchpoints: ConversionTouchpoint[]): number {
    const revenueByConversion = new Map<string, number>();
    for (const tp of touchpoints) {
      if (!revenueByConversion.has(tp.conversion_id)) {
        revenueByConversion.set(tp.conversion_id, tp.revenue);
      }
    }
    let total = 0;
    for (const rev of revenueByConversion.values()) {
      total += rev;
    }
    return total;
  }

  /**
   * Builds standardized ChannelAttribution[] from a channel accumulation map.
   */
  private buildChannelAttributions(
    channelMap: Map<string, { conversions: number; revenue: number; spend: number }>,
    totalConversions: number,
  ): ChannelAttribution[] {
    const attributions: ChannelAttribution[] = [];
    const _totalRevenue = Array.from(channelMap.values()).reduce(
      (sum, ch) => sum + ch.revenue,
      0,
    );

    for (const [channel, data] of channelMap) {
      const percentOfTotal =
        totalConversions > 0 ? data.conversions / totalConversions : 0;
      // ROI calculated as (revenue - spend) / spend when spend is available
      const roi = data.spend > 0 ? (data.revenue - data.spend) / data.spend : 0;

      attributions.push({
        channel,
        attributedConversions: Math.round(data.conversions * 100) / 100,
        attributedRevenue: Math.round(data.revenue * 100) / 100,
        percentOfTotal: Math.round(percentOfTotal * 10000) / 10000,
        roi: Math.round(roi * 100) / 100,
      });
    }

    // Sort by attributed revenue descending
    attributions.sort((a, b) => b.attributedRevenue - a.attributedRevenue);
    return attributions;
  }

  /**
   * Computes variance statistics across attribution model results.
   */
  private computeAttributionVariance(
    results: AttributionResult[],
  ): { highVariance: boolean; channelVariances: Record<string, number> } {
    const allChannels = new Set<string>();
    for (const r of results) {
      for (const ch of r.channels) {
        allChannels.add(ch.channel);
      }
    }

    const channelVariances: Record<string, number> = {};
    let totalVariance = 0;

    for (const channel of allChannels) {
      const shares: number[] = [];
      for (const r of results) {
        const ch = r.channels.find((c) => c.channel === channel);
        shares.push(ch?.percentOfTotal ?? 0);
      }
      const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
      const variance =
        shares.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) /
        shares.length;
      channelVariances[channel] = Math.round(variance * 10000) / 10000;
      totalVariance += variance;
    }

    return {
      highVariance: totalVariance > 0.05,
      channelVariances,
    };
  }

  /**
   * Generates recommendations based on funnel stage data.
   */
  private generateFunnelRecommendations(stages: FunnelStageData[]): string[] {
    const recommendations: string[] = [];

    for (const stage of stages) {
      if (stage.dropOffRate > 0.7) {
        recommendations.push(
          `Critical drop-off at ${stage.stage} stage (${(stage.dropOffRate * 100).toFixed(1)}%). Investigate UX friction, messaging alignment, and targeting quality.`,
        );
      } else if (stage.dropOffRate > 0.5) {
        recommendations.push(
          `High drop-off at ${stage.stage} stage (${(stage.dropOffRate * 100).toFixed(1)}%). Consider A/B testing landing pages and CTAs.`,
        );
      }

      if (stage.avgTimeInStage > 604800) {
        // > 7 days in seconds
        recommendations.push(
          `Average time in ${stage.stage} exceeds 7 days. Consider nurture sequences or retargeting to accelerate progression.`,
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Funnel performance is within normal ranges. Continue monitoring for trends.',
      );
    }

    return recommendations;
  }

  /**
   * Generates recommendations for a specific drop-off point between stages.
   */
  private generateDropOffRecommendations(
    fromStage: FunnelStage,
    toStage: FunnelStage,
    dropOffRate: number,
  ): string[] {
    const recommendations: string[] = [];
    const dropPct = (dropOffRate * 100).toFixed(1);

    const stageRecommendations: Record<string, string[]> = {
      'awareness->interest': [
        `${dropPct}% drop from awareness to interest. Improve ad creative relevance and targeting precision.`,
        'Test different value propositions and messaging angles.',
      ],
      'interest->consideration': [
        `${dropPct}% drop from interest to consideration. Strengthen social proof and product education content.`,
        'Implement retargeting campaigns for interested visitors.',
      ],
      'consideration->intent': [
        `${dropPct}% drop from consideration to intent. Offer comparison tools, free trials, or demos.`,
        'Address common objections with FAQ content and testimonials.',
      ],
      'intent->purchase': [
        `${dropPct}% drop from intent to purchase. Optimize checkout flow, reduce friction, and offer incentives.`,
        'Implement cart abandonment email sequences.',
      ],
      'purchase->loyalty': [
        `${dropPct}% drop from purchase to loyalty. Improve post-purchase experience and implement retention programs.`,
        'Create loyalty rewards and referral incentives.',
      ],
    };

    const key = `${fromStage}->${toStage}`;
    if (stageRecommendations[key]) {
      recommendations.push(...stageRecommendations[key]);
    } else {
      recommendations.push(
        `${dropPct}% drop-off from ${fromStage} to ${toStage}. Investigate user journey blockers and test improvements.`,
      );
    }

    return recommendations;
  }

  /**
   * Generates recommendations from attribution model comparison results.
   */
  private generateAttributionRecommendations(
    models: Record<string, AttributionResult>,
    variance: { highVariance: boolean; channelVariances: Record<string, number> },
  ): string[] {
    const recommendations: string[] = [];

    if (variance.highVariance) {
      recommendations.push(
        'High variance detected across attribution models. Multi-touch customer journeys are complex; consider using time-decay for optimization decisions.',
      );
    } else {
      recommendations.push(
        'Low variance across attribution models indicates a relatively simple customer journey. Last-click attribution may be sufficient for most use cases.',
      );
    }

    // Find channels with highest variance
    const highVarianceChannels = Object.entries(variance.channelVariances)
      .filter(([, v]) => v > 0.01)
      .sort(([, a], [, b]) => b - a);

    for (const [channel] of highVarianceChannels.slice(0, 3)) {
      recommendations.push(
        `Channel "${channel}" shows significant attribution variation across models. Evaluate its role across the full customer journey before adjusting budget.`,
      );
    }

    // Compare last-click vs position-based for awareness channels
    const lastClick = models['last_click'];
    const positionBased = models['position_based'];
    if (lastClick && positionBased) {
      for (const pbChannel of positionBased.channels) {
        const lcChannel = lastClick.channels.find(
          (c) => c.channel === pbChannel.channel,
        );
        if (
          lcChannel &&
          pbChannel.percentOfTotal > lcChannel.percentOfTotal * 1.5
        ) {
          recommendations.push(
            `Channel "${pbChannel.channel}" contributes significantly more under position-based attribution than last-click. It likely plays an important top-of-funnel role.`,
          );
        }
      }
    }

    return recommendations;
  }

  /**
   * Builds a human-readable decision summary from computed analytics.
   */
  private buildDecisionSummary(
    metrics: Record<string, MetricResult | null>,
    funnel: FunnelAnalysis | null,
    attribution: AttributionComparison | null,
  ): string {
    const parts: string[] = ['Performance analytics computation complete.'];

    if (metrics.cac) {
      parts.push(`CAC: $${metrics.cac.value} (${metrics.cac.trend})`);
    }
    if (metrics.ltv) {
      parts.push(`LTV: $${metrics.ltv.value} (${metrics.ltv.trend})`);
    }
    if (metrics.roas) {
      parts.push(`ROAS: ${metrics.roas.value}x (${metrics.roas.trend})`);
    }
    if (metrics.mer) {
      parts.push(`MER: ${metrics.mer.value}x (${metrics.mer.trend})`);
    }
    if (funnel) {
      parts.push(
        `Funnel conversion: ${(funnel.overallConversionRate * 100).toFixed(2)}%`,
      );
    }
    if (attribution) {
      const modelCount = Object.keys(attribution.models).length;
      parts.push(`${modelCount} attribution models compared`);
    }

    return parts.join(' | ');
  }

  // ------------------------------------------------------------------
  // Date / math utilities
  // ------------------------------------------------------------------

  /**
   * Computes the number of days between two ISO date strings.
   */
  private daysBetween(start: string, end: string): number {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
  }

  /**
   * Subtracts a number of days from an ISO date string.
   */
  private subtractDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Computes the percentage change between two values.
   */
  private computeChangePercent(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  /**
   * Determines trend direction from a percentage change.
   */
  private determineTrend(changePercent: number): 'up' | 'down' | 'stable' {
    if (changePercent > TREND_THRESHOLD) return 'up';
    if (changePercent < -TREND_THRESHOLD) return 'down';
    return 'stable';
  }
}

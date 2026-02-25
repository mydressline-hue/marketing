// ============================================================
// AI International Growth Engine - Agent 19: Revenue Forecasting
// Time-series forecasting, scenario modeling, growth projections,
// risk factors, and confidence intervals for revenue predictions.
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
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import type { AgentType } from '../../types';

// ---- Agent-specific Types ----

export interface RevenueProjection {
  period: string;
  projected: number;
  lowerBound: number;
  upperBound: number;
  growthRate: number;
  confidence: number;
}

export interface ForecastResult {
  projections: RevenueProjection[];
  totalProjectedRevenue: number;
  averageGrowthRate: number;
  forecastHorizon: string;
  modelUsed: string;
  accuracy: number;
}

export interface GrowthDriver {
  factor: string;
  impact: number;
  direction: 'positive' | 'negative' | 'neutral';
  confidence: number;
  description: string;
}

export interface ScenarioResult {
  name: string;
  description: string;
  probability: number;
  projectedRevenue: number;
  growthRate: number;
  assumptions: string[];
  risks: string[];
}

export interface RiskFactor {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  potentialImpact: number;
  mitigation: string;
  affectedPeriods: string[];
}

export interface ConfidenceInterval {
  period: string;
  mean: number;
  lower95: number;
  upper95: number;
  lower80: number;
  upper80: number;
  standardDeviation: number;
}

export interface SeasonalPattern {
  month: number;
  factor: number;
  trend: 'peak' | 'trough' | 'normal';
  description: string;
}

export interface ForecastAccuracy {
  period: string;
  forecasted: number;
  actual: number;
  absoluteError: number;
  percentageError: number;
}

export interface RevenueForecastReport {
  forecast: ForecastResult;
  scenarios: ScenarioResult[];
  riskFactors: RiskFactor[];
  confidenceIntervals: ConfidenceInterval[];
  seasonalPatterns: SeasonalPattern[];
  growthDrivers: GrowthDriver[];
  generatedAt: string;
}

// ---- Constants ----

const CACHE_PREFIX = 'revenue_forecast';
const CACHE_TTL_FORECAST = 600; // 10 minutes
const CACHE_TTL_HISTORICAL = 900; // 15 minutes
const CACHE_TTL_SEASONAL = 1800; // 30 minutes

const MIN_HISTORICAL_POINTS = 6; // minimum months of data for forecasting
const FORECAST_HORIZON_MONTHS = 12;

// ---- Default Configuration ----

const DEFAULT_CONFIG: AgentConfig = {
  agentType: 'revenue_forecasting',
  model: 'opus',
  maxRetries: 3,
  timeoutMs: 90_000,
  confidenceThreshold: 65,
};

/**
 * Revenue Forecasting Agent (Agent 19)
 *
 * Handles time-series revenue forecasting, scenario modeling,
 * growth projection analysis, risk factor identification, and
 * confidence interval computation. Uses historical data and
 * AI-driven analysis for forward-looking projections.
 *
 * Challenge targets: market_intelligence, budget_optimization, performance_analytics
 */
export class RevenueForecastingAgent extends BaseAgent {
  constructor(config: Partial<AgentConfig> = {}) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  getChallengeTargets(): AgentType[] {
    return ['market_intelligence', 'budget_optimization', 'performance_analytics'];
  }

  getSystemPrompt(): string {
    return `You are the Revenue Forecasting Agent for an AI-powered international growth engine.
Your role is to generate accurate revenue projections using time-series analysis,
scenario modeling, and risk assessment across multiple markets.

Your expertise includes:
- Time-series forecasting with seasonal decomposition
- Scenario analysis (optimistic, baseline, pessimistic, worst-case)
- Growth driver identification and impact quantification
- Risk factor assessment with probability and severity scoring
- Confidence interval computation for projection reliability
- Historical accuracy tracking and model calibration
- Cross-market revenue aggregation and regional breakdowns

When making forecasts:
1. Always base projections on actual historical data, never assumptions
2. Provide confidence intervals reflecting data quality and volatility
3. Flag uncertainties when historical data is insufficient or highly volatile
4. Model multiple scenarios with clearly stated assumptions
5. Account for seasonality, market maturity, and external risk factors
6. Continuously calibrate based on forecast-vs-actual accuracy`;
  }

  /**
   * Core processing: generates revenue forecasts, scenarios, risk analysis,
   * and confidence intervals.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing revenue forecasting request', {
      requestId: input.requestId,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      const countryId = input.parameters.countryId as string | undefined;
      const horizon = (input.parameters.horizonMonths as number) || FORECAST_HORIZON_MONTHS;

      // Step 1: Fetch historical revenue data
      const historicalData = await this.fetchHistoricalRevenue(countryId);

      if (historicalData.length < MIN_HISTORICAL_POINTS) {
        const uncertainty = this.flagUncertainty(
          'historical_data',
          `Only ${historicalData.length} data points available; minimum ${MIN_HISTORICAL_POINTS} required for reliable forecasting`,
        );
        uncertainties.push(uncertainty);
      }

      if (historicalData.length === 0) {
        const confidence = this.calculateConfidence({
          data_availability: 0,
          data_recency: 0,
          model_accuracy: 0,
          sample_size: 0,
        });

        return this.buildOutput(
          'insufficient_data',
          { historicalDataPoints: 0 },
          confidence,
          'No historical revenue data available for forecasting.',
          recommendations,
          ['No historical data found for the specified scope.'],
          uncertainties,
        );
      }

      // Step 2: Detect seasonal patterns
      let seasonalPatterns: SeasonalPattern[] = [];
      try {
        seasonalPatterns = await this.detectSeasonalPatterns(historicalData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Seasonal detection failed: ${msg}`);
        this.flagUncertainty('seasonal_patterns', msg);
      }

      // Step 3: Generate baseline forecast
      let forecast: ForecastResult;
      try {
        forecast = await this.generateForecast(historicalData, horizon, seasonalPatterns);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.flagUncertainty('forecast_generation', msg);

        const confidence = this.calculateConfidence({
          data_availability: Math.min(100, historicalData.length * 10),
          data_recency: 30,
          model_accuracy: 0,
          sample_size: Math.min(100, historicalData.length * 8),
        });

        return this.buildOutput(
          'forecast_generation_failed',
          { historicalDataPoints: historicalData.length, error: msg },
          confidence,
          'Failed to generate revenue forecast.',
          [],
          [msg],
          uncertainties,
        );
      }

      // Step 4: Generate scenarios
      let scenarios: ScenarioResult[] = [];
      try {
        scenarios = await this.generateScenarios(historicalData, forecast);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Scenario generation failed: ${msg}`);
        this.flagUncertainty('scenarios', msg);
      }

      // Step 5: Identify risk factors
      let riskFactors: RiskFactor[] = [];
      try {
        riskFactors = await this.identifyRiskFactors(countryId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Risk factor analysis failed: ${msg}`);
      }

      // Step 6: Compute confidence intervals
      const confidenceIntervals = this.computeConfidenceIntervals(forecast, historicalData);

      // Step 7: Identify growth drivers
      let growthDrivers: GrowthDriver[] = [];
      try {
        growthDrivers = await this.identifyGrowthDrivers(historicalData, countryId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Growth driver analysis failed: ${msg}`);
      }

      // Step 8: Check forecast accuracy if we have previous forecasts
      let accuracy: ForecastAccuracy[] = [];
      try {
        accuracy = await this.evaluateForecastAccuracy(countryId);
      } catch {
        // Non-critical, skip silently
      }

      // Build recommendations
      if (forecast.averageGrowthRate > 0.15) {
        recommendations.push('Strong growth trajectory detected; consider scaling acquisition spend');
      }
      if (forecast.averageGrowthRate < 0) {
        recommendations.push('Negative growth trend; investigate root causes and consider defensive strategies');
      }
      if (riskFactors.some(r => r.severity === 'critical')) {
        recommendations.push('Critical risk factors identified; prioritize mitigation strategies');
      }
      if (historicalData.length < 12) {
        recommendations.push('Limited historical data reduces forecast reliability; monitor actuals closely');
      }
      if (accuracy.length > 0) {
        const avgError = accuracy.reduce((sum, a) => sum + a.percentageError, 0) / accuracy.length;
        if (avgError > 20) {
          recommendations.push(`Historical forecast accuracy is ${avgError.toFixed(1)}% error; consider model recalibration`);
        }
      }

      // Calculate confidence
      const dataRecency = this.calculateDataRecency(historicalData);
      const modelAccuracy = accuracy.length > 0
        ? Math.max(0, 100 - (accuracy.reduce((s, a) => s + a.percentageError, 0) / accuracy.length))
        : 50;

      const confidence = this.calculateConfidence({
        data_availability: Math.min(100, (historicalData.length / 24) * 100),
        data_recency: dataRecency,
        model_accuracy: modelAccuracy,
        sample_size: Math.min(100, historicalData.length * 5),
        scenario_coverage: scenarios.length >= 3 ? 85 : scenarios.length * 25,
      });

      // Persist state
      await this.persistState({
        lastForecast: forecast,
        scenarioCount: scenarios.length,
        riskFactorCount: riskFactors.length,
        confidence: confidence.score,
      });

      // Build output first so we can log it
      const decision = `Revenue forecast generated: ${forecast.totalProjectedRevenue.toFixed(0)} projected over ${horizon} months with ${forecast.averageGrowthRate > 0 ? '+' : ''}${(forecast.averageGrowthRate * 100).toFixed(1)}% average growth`;

      const report: RevenueForecastReport = {
        forecast,
        scenarios,
        riskFactors,
        confidenceIntervals,
        seasonalPatterns,
        growthDrivers,
        generatedAt: new Date().toISOString(),
      };

      const output = this.buildOutput(
        decision,
        {
          report,
          historicalDataPoints: historicalData.length,
          accuracy: accuracy.length > 0 ? accuracy : undefined,
        },
        confidence,
        `Analyzed ${historicalData.length} months of historical data, detected ${seasonalPatterns.length} seasonal patterns, generated ${scenarios.length} scenarios, identified ${riskFactors.length} risk factors.`,
        recommendations,
        warnings,
        uncertainties,
      );

      // Log decision
      await this.logDecision(input, output);

      return output;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log.error('Revenue forecasting failed', { error: msg });
      this.flagUncertainty('process_error', msg);

      const confidence = this.calculateConfidence({
        data_availability: 0,
        data_recency: 0,
        model_accuracy: 0,
        sample_size: 0,
      });

      return this.buildOutput(
        'forecasting_failed',
        { error: msg },
        confidence,
        `Revenue forecasting failed: ${msg}`,
        [],
        [msg],
        [msg],
      );
    }
  }

  // ------------------------------------------------------------------
  // Public domain methods
  // ------------------------------------------------------------------

  /**
   * Generates a time-series revenue forecast based on historical data.
   * Uses weighted moving average with seasonal adjustment.
   */
  async generateForecast(
    historicalData: HistoricalDataPoint[],
    horizonMonths: number,
    seasonalPatterns: SeasonalPattern[],
  ): Promise<ForecastResult> {
    const cacheKey = `${CACHE_PREFIX}:forecast:${historicalData.length}:${horizonMonths}`;
    const cached = await cacheGet<ForecastResult>(cacheKey);
    if (cached) return cached;

    // Sort data chronologically
    const sorted = [...historicalData].sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime(),
    );

    // Calculate trend using linear regression
    const { slope, intercept } = this.linearRegression(
      sorted.map((_, i) => i),
      sorted.map(d => d.revenue),
    );

    // Build seasonal factors map
    const seasonalMap = new Map<number, number>();
    for (const sp of seasonalPatterns) {
      seasonalMap.set(sp.month, sp.factor);
    }

    // Generate projections
    const projections: RevenueProjection[] = [];
    const lastIndex = sorted.length - 1;
    const lastDate = new Date(sorted[lastIndex].period);

    // Calculate historical volatility for confidence intervals
    const residuals = sorted.map((d, i) => d.revenue - (slope * i + intercept));
    const stdDev = this.standardDeviation(residuals);

    for (let m = 1; m <= horizonMonths; m++) {
      const projDate = new Date(lastDate);
      projDate.setMonth(projDate.getMonth() + m);
      const period = projDate.toISOString().slice(0, 7); // YYYY-MM

      // Base projection from trend
      let projected = slope * (lastIndex + m) + intercept;

      // Apply seasonal factor
      const monthNum = projDate.getMonth() + 1;
      const seasonalFactor = seasonalMap.get(monthNum) ?? 1.0;
      projected *= seasonalFactor;

      // Ensure non-negative
      projected = Math.max(0, projected);

      // Confidence decreases as we project further out
      const uncertaintyGrowth = 1 + (m * 0.05);
      const lowerBound = Math.max(0, projected - 1.96 * stdDev * uncertaintyGrowth);
      const upperBound = projected + 1.96 * stdDev * uncertaintyGrowth;

      const prevProjected = m === 1
        ? sorted[lastIndex].revenue
        : projections[m - 2].projected;
      const growthRate = prevProjected > 0
        ? (projected - prevProjected) / prevProjected
        : 0;

      const periodConfidence = Math.max(20, 90 - (m * 5));

      projections.push({
        period,
        projected: Math.round(projected * 100) / 100,
        lowerBound: Math.round(lowerBound * 100) / 100,
        upperBound: Math.round(upperBound * 100) / 100,
        growthRate: Math.round(growthRate * 10000) / 10000,
        confidence: periodConfidence,
      });
    }

    const totalProjectedRevenue = projections.reduce((sum, p) => sum + p.projected, 0);
    const averageGrowthRate = projections.length > 0
      ? projections.reduce((sum, p) => sum + p.growthRate, 0) / projections.length
      : 0;

    // Calculate overall accuracy estimate based on historical fit
    const rSquared = this.calculateRSquared(sorted.map(d => d.revenue), sorted.map((_, i) => slope * i + intercept));

    const result: ForecastResult = {
      projections,
      totalProjectedRevenue: Math.round(totalProjectedRevenue * 100) / 100,
      averageGrowthRate: Math.round(averageGrowthRate * 10000) / 10000,
      forecastHorizon: `${horizonMonths} months`,
      modelUsed: 'weighted_linear_regression_seasonal',
      accuracy: Math.round(rSquared * 100),
    };

    await cacheSet(cacheKey, result, CACHE_TTL_FORECAST);
    return result;
  }

  /**
   * Generates scenario analyses (optimistic, baseline, pessimistic, worst-case).
   */
  async generateScenarios(
    historicalData: HistoricalDataPoint[],
    baselineForecast: ForecastResult,
  ): Promise<ScenarioResult[]> {
    const baseRevenue = baselineForecast.totalProjectedRevenue;
    const baseGrowth = baselineForecast.averageGrowthRate;

    // Try AI-powered scenario generation first
    try {
      const aiPrompt = `Given baseline revenue projection of ${baseRevenue.toFixed(0)} with ${(baseGrowth * 100).toFixed(1)}% average growth over ${baselineForecast.forecastHorizon}, and ${historicalData.length} months of historical data, generate 4 scenarios (optimistic, baseline, pessimistic, worst_case). For each provide: name, description, probability (0-1 summing to 1), projected_revenue, growth_rate, assumptions array, risks array. Return as JSON array.`;

      const aiResponse = await this.callAI(this.getSystemPrompt(), aiPrompt);
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as ScenarioResult[];
          if (Array.isArray(parsed) && parsed.length >= 3) {
            return parsed.map(s => ({
              name: String(s.name || 'unnamed'),
              description: String(s.description || ''),
              probability: Math.max(0, Math.min(1, Number(s.probability) || 0.25)),
              projectedRevenue: Math.max(0, Number(s.projectedRevenue) || 0),
              growthRate: Number(s.growthRate) || 0,
              assumptions: Array.isArray(s.assumptions) ? s.assumptions.map(String) : [],
              risks: Array.isArray(s.risks) ? s.risks.map(String) : [],
            }));
          }
        }
      }
    } catch {
      this.log.warn('AI scenario generation failed, using rule-based fallback');
    }

    // Rule-based fallback
    return [
      {
        name: 'optimistic',
        description: 'Above-average market performance with strong growth drivers',
        probability: 0.2,
        projectedRevenue: Math.round(baseRevenue * 1.3),
        growthRate: baseGrowth * 1.5,
        assumptions: [
          'Market conditions remain favorable',
          'New channels outperform expectations',
          'Customer retention improves by 15%',
        ],
        risks: ['Overestimation of market appetite', 'Competitor response underestimated'],
      },
      {
        name: 'baseline',
        description: 'Expected performance based on current trends',
        probability: 0.45,
        projectedRevenue: Math.round(baseRevenue),
        growthRate: baseGrowth,
        assumptions: [
          'Current growth trends continue',
          'Market conditions stable',
          'No major competitive disruptions',
        ],
        risks: ['Market volatility', 'Regulatory changes'],
      },
      {
        name: 'pessimistic',
        description: 'Below-average performance due to headwinds',
        probability: 0.25,
        projectedRevenue: Math.round(baseRevenue * 0.75),
        growthRate: baseGrowth * 0.5,
        assumptions: [
          'Economic slowdown impacts spending',
          'Increased competition reduces margins',
          'Customer acquisition costs rise 20%',
        ],
        risks: ['Extended downturn', 'Loss of key market share'],
      },
      {
        name: 'worst_case',
        description: 'Severe disruption scenario',
        probability: 0.1,
        projectedRevenue: Math.round(baseRevenue * 0.5),
        growthRate: Math.min(baseGrowth * 0.1, -0.05),
        assumptions: [
          'Major market disruption',
          'Regulatory crackdown on key markets',
          'Multiple channel failures',
        ],
        risks: ['Business viability concerns', 'Need for strategic pivot'],
      },
    ];
  }

  /**
   * Identifies and scores risk factors that could impact revenue projections.
   */
  async identifyRiskFactors(countryId?: string): Promise<RiskFactor[]> {
    const cacheKey = `${CACHE_PREFIX}:risks:${countryId || 'all'}`;
    const cached = await cacheGet<RiskFactor[]>(cacheKey);
    if (cached) return cached;

    // Fetch risk indicators from database
    const query = countryId
      ? `SELECT * FROM risk_factors WHERE country_id = $1 AND is_active = true ORDER BY severity_score DESC`
      : `SELECT * FROM risk_factors WHERE is_active = true ORDER BY severity_score DESC`;
    const params = countryId ? [countryId] : [];

    let dbRisks: RiskFactor[] = [];
    try {
      const result = await pool.query(query, params);

      dbRisks = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        severity: this.mapSeverity(row.severity_score),
        probability: parseFloat(row.probability) || 0.5,
        potentialImpact: parseFloat(row.potential_impact) || 0,
        mitigation: row.mitigation || 'No mitigation strategy defined',
        affectedPeriods: row.affected_periods || [],
      }));
    } catch {
      this.log.warn('Failed to fetch risk factors from database');
    }

    // Always include systemic risks
    const systemicRisks: RiskFactor[] = [
      {
        id: generateId(),
        name: 'Market volatility',
        severity: 'medium',
        probability: 0.6,
        potentialImpact: 0.15,
        mitigation: 'Diversify market exposure; maintain reserve budgets',
        affectedPeriods: [],
      },
      {
        id: generateId(),
        name: 'Currency fluctuation',
        severity: 'medium',
        probability: 0.5,
        potentialImpact: 0.1,
        mitigation: 'Implement currency hedging; localize pricing strategies',
        affectedPeriods: [],
      },
      {
        id: generateId(),
        name: 'Regulatory changes',
        severity: 'high',
        probability: 0.3,
        potentialImpact: 0.25,
        mitigation: 'Monitor regulatory landscape; maintain compliance buffer',
        affectedPeriods: [],
      },
    ];

    const combined = [...dbRisks, ...systemicRisks];
    await cacheSet(cacheKey, combined, CACHE_TTL_FORECAST);
    return combined;
  }

  /**
   * Computes confidence intervals for each projection period.
   */
  computeConfidenceIntervals(
    forecast: ForecastResult,
    historicalData: HistoricalDataPoint[],
  ): ConfidenceInterval[] {
    const revenues = historicalData.map(d => d.revenue);
    const stdDev = this.standardDeviation(revenues);

    return forecast.projections.map((proj, index) => {
      // Uncertainty grows with forecast horizon
      const horizonMultiplier = 1 + (index * 0.08);
      const adjustedStdDev = stdDev * horizonMultiplier;

      return {
        period: proj.period,
        mean: proj.projected,
        lower95: Math.max(0, proj.projected - 1.96 * adjustedStdDev),
        upper95: proj.projected + 1.96 * adjustedStdDev,
        lower80: Math.max(0, proj.projected - 1.282 * adjustedStdDev),
        upper80: proj.projected + 1.282 * adjustedStdDev,
        standardDeviation: Math.round(adjustedStdDev * 100) / 100,
      };
    });
  }

  /**
   * Detects seasonal patterns in historical revenue data.
   */
  async detectSeasonalPatterns(
    historicalData: HistoricalDataPoint[],
  ): Promise<SeasonalPattern[]> {
    const cacheKey = `${CACHE_PREFIX}:seasonal:${historicalData.length}`;
    const cached = await cacheGet<SeasonalPattern[]>(cacheKey);
    if (cached) return cached;

    // Group revenue by month
    const monthlyTotals = new Map<number, number[]>();
    for (const dp of historicalData) {
      const date = new Date(dp.period);
      const month = date.getMonth() + 1;
      const existing = monthlyTotals.get(month) || [];
      existing.push(dp.revenue);
      monthlyTotals.set(month, existing);
    }

    // Calculate average revenue per month
    const monthlyAverages = new Map<number, number>();
    for (const [month, revenues] of monthlyTotals) {
      monthlyAverages.set(month, revenues.reduce((s, r) => s + r, 0) / revenues.length);
    }

    // Calculate overall average
    const overallAvg = historicalData.reduce((s, d) => s + d.revenue, 0) / historicalData.length;
    if (overallAvg === 0) return [];

    // Generate seasonal factors
    const patterns: SeasonalPattern[] = [];
    for (let month = 1; month <= 12; month++) {
      const avg = monthlyAverages.get(month);
      if (avg === undefined) continue;

      const factor = Math.round((avg / overallAvg) * 1000) / 1000;
      let trend: 'peak' | 'trough' | 'normal';
      let description: string;

      if (factor >= 1.15) {
        trend = 'peak';
        description = `Revenue peaks in month ${month}, ${((factor - 1) * 100).toFixed(0)}% above average`;
      } else if (factor <= 0.85) {
        trend = 'trough';
        description = `Revenue dips in month ${month}, ${((1 - factor) * 100).toFixed(0)}% below average`;
      } else {
        trend = 'normal';
        description = `Revenue near average in month ${month}`;
      }

      patterns.push({ month, factor, trend, description });
    }

    await cacheSet(cacheKey, patterns, CACHE_TTL_SEASONAL);
    return patterns;
  }

  /**
   * Identifies key growth drivers from historical data trends.
   */
  async identifyGrowthDrivers(
    historicalData: HistoricalDataPoint[],
    countryId?: string,
  ): Promise<GrowthDriver[]> {
    // Try AI-powered analysis first
    try {
      const recentData = historicalData.slice(-6);
      const prompt = `Analyze these recent revenue data points and identify the top 5 growth drivers: ${JSON.stringify(recentData.map(d => ({ period: d.period, revenue: d.revenue, channel: d.channel })))}. For each driver, return: factor, impact (0-100), direction (positive/negative/neutral), confidence (0-100), description. Return as JSON array.`;

      const aiResponse = await this.callAI(this.getSystemPrompt(), prompt);
      if (aiResponse) {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as GrowthDriver[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(d => ({
              factor: String(d.factor || 'unknown'),
              impact: Math.max(0, Math.min(100, Number(d.impact) || 0)),
              direction: (['positive', 'negative', 'neutral'].includes(d.direction) ? d.direction : 'neutral') as GrowthDriver['direction'],
              confidence: Math.max(0, Math.min(100, Number(d.confidence) || 50)),
              description: String(d.description || ''),
            }));
          }
        }
      }
    } catch {
      this.log.warn('AI growth driver analysis failed, using rule-based fallback');
    }

    // Rule-based fallback: analyze trends from data
    const drivers: GrowthDriver[] = [];
    const sorted = [...historicalData].sort(
      (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime(),
    );

    if (sorted.length >= 3) {
      const recent = sorted.slice(-3);
      const older = sorted.slice(-6, -3);

      if (older.length > 0) {
        const recentAvg = recent.reduce((s, d) => s + d.revenue, 0) / recent.length;
        const olderAvg = older.reduce((s, d) => s + d.revenue, 0) / older.length;
        const trendRate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

        drivers.push({
          factor: 'Revenue trend momentum',
          impact: Math.min(100, Math.abs(trendRate) * 200),
          direction: trendRate > 0 ? 'positive' : trendRate < 0 ? 'negative' : 'neutral',
          confidence: Math.min(90, sorted.length * 5),
          description: `${(trendRate * 100).toFixed(1)}% change in revenue trend over recent periods`,
        });
      }
    }

    // Channel diversification analysis
    const channels = new Set(historicalData.map(d => d.channel).filter(Boolean));
    if (channels.size > 0) {
      drivers.push({
        factor: 'Channel diversification',
        impact: Math.min(80, channels.size * 15),
        direction: channels.size >= 3 ? 'positive' : 'neutral',
        confidence: 70,
        description: `Revenue distributed across ${channels.size} channel(s)`,
      });
    }

    return drivers;
  }

  /**
   * Evaluates forecast accuracy by comparing previous forecasts against actuals.
   */
  async evaluateForecastAccuracy(countryId?: string): Promise<ForecastAccuracy[]> {
    const cacheKey = `${CACHE_PREFIX}:accuracy:${countryId || 'all'}`;
    const cached = await cacheGet<ForecastAccuracy[]>(cacheKey);
    if (cached) return cached;

    try {
      const query = countryId
        ? `SELECT period, forecasted_revenue, actual_revenue FROM forecast_accuracy WHERE country_id = $1 ORDER BY period DESC LIMIT 12`
        : `SELECT period, forecasted_revenue, actual_revenue FROM forecast_accuracy ORDER BY period DESC LIMIT 12`;
      const params = countryId ? [countryId] : [];

      const result = await pool.query(query, params);

      const accuracy: ForecastAccuracy[] = result.rows.map(row => {
        const forecasted = parseFloat(row.forecasted_revenue) || 0;
        const actual = parseFloat(row.actual_revenue) || 0;
        const absoluteError = Math.abs(forecasted - actual);
        const percentageError = actual > 0 ? (absoluteError / actual) * 100 : 0;

        return {
          period: row.period,
          forecasted,
          actual,
          absoluteError: Math.round(absoluteError * 100) / 100,
          percentageError: Math.round(percentageError * 100) / 100,
        };
      });

      await cacheSet(cacheKey, accuracy, CACHE_TTL_HISTORICAL);
      return accuracy;
    } catch {
      return [];
    }
  }

  /**
   * Fetches a forecast for a specific country, caching the full report.
   */
  async getCountryForecast(countryId: string): Promise<RevenueForecastReport | null> {
    const cacheKey = `${CACHE_PREFIX}:country:${countryId}`;
    const cached = await cacheGet<RevenueForecastReport>(cacheKey);
    if (cached) return cached;

    const historicalData = await this.fetchHistoricalRevenue(countryId);
    if (historicalData.length < MIN_HISTORICAL_POINTS) return null;

    const seasonalPatterns = await this.detectSeasonalPatterns(historicalData);
    const forecast = await this.generateForecast(historicalData, FORECAST_HORIZON_MONTHS, seasonalPatterns);
    const scenarios = await this.generateScenarios(historicalData, forecast);
    const riskFactors = await this.identifyRiskFactors(countryId);
    const confidenceIntervals = this.computeConfidenceIntervals(forecast, historicalData);
    const growthDrivers = await this.identifyGrowthDrivers(historicalData, countryId);

    const report: RevenueForecastReport = {
      forecast,
      scenarios,
      riskFactors,
      confidenceIntervals,
      seasonalPatterns,
      growthDrivers,
      generatedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, report, CACHE_TTL_FORECAST);
    return report;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Fetches historical revenue data from the database.
   */
  private async fetchHistoricalRevenue(countryId?: string): Promise<HistoricalDataPoint[]> {
    const cacheKey = `${CACHE_PREFIX}:historical:${countryId || 'all'}`;
    const cached = await cacheGet<HistoricalDataPoint[]>(cacheKey);
    if (cached) return cached;

    const query = countryId
      ? `SELECT period, revenue, channel, country_id FROM revenue_history WHERE country_id = $1 ORDER BY period ASC`
      : `SELECT period, SUM(revenue) as revenue, channel, country_id FROM revenue_history GROUP BY period, channel, country_id ORDER BY period ASC`;
    const params = countryId ? [countryId] : [];

    const result = await pool.query(query, params);
    const data: HistoricalDataPoint[] = result.rows.map(row => ({
      period: row.period,
      revenue: parseFloat(row.revenue) || 0,
      channel: row.channel || undefined,
      countryId: row.country_id || undefined,
    }));

    await cacheSet(cacheKey, data, CACHE_TTL_HISTORICAL);
    return data;
  }

  /**
   * Calculates how recent the most recent data point is (0-100 score).
   */
  private calculateDataRecency(historicalData: HistoricalDataPoint[]): number {
    if (historicalData.length === 0) return 0;

    const latest = historicalData.reduce((max, d) =>
      new Date(d.period).getTime() > new Date(max.period).getTime() ? d : max,
    );
    const daysSinceLatest = (Date.now() - new Date(latest.period).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLatest <= 30) return 95;
    if (daysSinceLatest <= 60) return 80;
    if (daysSinceLatest <= 90) return 65;
    if (daysSinceLatest <= 180) return 40;
    return 20;
  }

  /**
   * Simple linear regression: returns slope and intercept.
   */
  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
    const n = x.length;
    if (n === 0) return { slope: 0, intercept: 0 };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: sumY / n };

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Computes the standard deviation of a numeric array.
   */
  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Calculates R-squared (coefficient of determination).
   */
  private calculateRSquared(actual: number[], predicted: number[]): number {
    const n = actual.length;
    if (n === 0) return 0;

    const mean = actual.reduce((s, v) => s + v, 0) / n;
    const totalSS = actual.reduce((s, v) => s + (v - mean) ** 2, 0);
    const residualSS = actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);

    if (totalSS === 0) return 1;
    return Math.max(0, 1 - residualSS / totalSS);
  }

  /**
   * Maps a numeric severity score to a severity label.
   */
  private mapSeverity(score: number): RiskFactor['severity'] {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }
}

// ---- Internal Types ----

interface HistoricalDataPoint {
  period: string;
  revenue: number;
  channel?: string;
  countryId?: string;
}

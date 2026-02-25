// ============================================================
// AI International Growth Engine - Conversion Optimization Agent (Agent 10)
// Handles funnel analysis, UX recommendations, and checkout optimization
// Uses Opus model for deep UX analysis
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput, AgentConfidenceScore, AgentConfig } from '../base/types';
import type { AgentType, DateRange, FunnelStage } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';

// ============================================================
// Type Definitions
// ============================================================

export interface FunnelStageData {
  stage: string;
  visitors: number;
  exits: number;
  conversionRate: number;
  avgTime: number;
}

export interface Bottleneck {
  stage: string;
  dropOffRate: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  possibleCauses: string[];
  estimatedImpact: number;
}

export interface FunnelAnalysis {
  stages: FunnelStageData[];
  overallRate: number;
  bottlenecks: Bottleneck[];
  estimatedRevenueLoss: number;
}

export interface UXRecommendation {
  id: string;
  area: string;
  issue: string;
  recommendation: string;
  expectedLift: number;
  effort: 'low' | 'medium' | 'high';
  priority: number;
  evidence: string;
}

export interface CheckoutSuggestion {
  step: string;
  issue: string;
  fix: string;
  expectedImpact: number;
}

export interface CheckoutOptimization {
  currentSteps: number;
  recommendedSteps: number;
  suggestions: CheckoutSuggestion[];
  expectedConversionLift: number;
}

export interface PageAnalysis {
  url: string;
  loadTime: number;
  bounceRate: number;
  exitRate: number;
  scrollDepth: number;
  issues: string[];
  recommendations: string[];
}

export interface UserSegment {
  id: string;
  name: string;
  size: number;
  conversionRate: number;
  avgOrderValue: number;
  characteristics: Record<string, string>;
}

export interface PersonalizationSuggestion {
  segment: string;
  contentChanges: string[];
  layoutChanges: string[];
  offerChanges: string[];
  expectedLift: number;
}

export interface RevenueLiftEstimate {
  totalEstimatedLift: number;
  byRecommendation: Record<string, number>;
  confidence: number;
  timeframe: string;
}

// ============================================================
// Constants
// ============================================================

const CACHE_PREFIX = 'conversion_optimization';
const FUNNEL_CACHE_TTL = 300; // 5 minutes
const PAGE_ANALYSIS_CACHE_TTL = 600; // 10 minutes
const SEGMENT_CACHE_TTL = 900; // 15 minutes

const FUNNEL_STAGES_ORDERED: FunnelStage[] = [
  'awareness',
  'interest',
  'consideration',
  'intent',
  'purchase',
  'loyalty',
];

const SEVERITY_THRESHOLDS = {
  critical: 0.5,
  high: 0.35,
  medium: 0.2,
  low: 0,
} as const;

// ============================================================
// Agent Implementation
// ============================================================

export class ConversionOptimizationAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'conversion_optimization',
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 120000,
      confidenceThreshold: 65,
      ...config,
    });
  }

  /**
   * Returns the list of peer agent types whose decisions this agent
   * is qualified to challenge through the cross-challenge protocol.
   */
  getChallengeTargets(): AgentType[] {
    return ['ab_testing', 'performance_analytics', 'shopify_integration'];
  }

  /**
   * Returns the Claude system prompt that shapes this agent's AI persona.
   */
  getSystemPrompt(): string {
    return `You are an expert conversion rate optimization (CRO) analyst for an international e-commerce growth engine.

Your responsibilities:
- Analyze conversion funnels across different countries and segments
- Identify UX bottlenecks and friction points in the customer journey
- Generate evidence-based recommendations for improving conversion rates
- Optimize checkout flows for international audiences
- Estimate revenue impact of proposed changes

Guidelines:
- Always ground recommendations in data and industry benchmarks
- Consider cultural and regional differences when analyzing international funnels
- Prioritize recommendations by expected impact and implementation effort
- Flag uncertainty when data is insufficient or patterns are ambiguous
- Never fabricate metrics or data; use only what is available from the database
- Express confidence levels honestly and provide reasoning for each recommendation
- Consider mobile vs desktop experiences in all analyses
- Account for payment method preferences by region in checkout optimization

Output format: Provide structured JSON responses with clear reasoning for each recommendation.`;
  }

  /**
   * Core processing logic for the conversion optimization agent.
   * Analyzes conversion funnels, identifies bottlenecks, generates UX
   * recommendations, and suggests checkout optimizations.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing conversion optimization request', {
      requestId: input.requestId,
      parameters: input.parameters,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];

    const countryId = input.parameters.countryId as string | undefined;
    const segment = input.parameters.segment as string | undefined;
    const dateRange = input.parameters.dateRange as DateRange | undefined;

    // Step 1: Analyze the funnel
    let funnelAnalysis: FunnelAnalysis;
    try {
      funnelAnalysis = await this.analyzeFunnel(countryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Funnel analysis failed', { error: message });
      uncertainties.push(
        this.flagUncertainty('funnel_data', `Funnel analysis encountered an error: ${message}`),
      );
      funnelAnalysis = {
        stages: [],
        overallRate: 0,
        bottlenecks: [],
        estimatedRevenueLoss: 0,
      };
    }

    // Step 2: Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(funnelAnalysis);

    if (bottlenecks.length === 0 && funnelAnalysis.stages.length > 0) {
      warnings.push('No significant bottlenecks detected. Funnel may be performing well or data may be insufficient.');
    }

    // Step 3: Generate UX recommendations via Opus
    let recommendations: UXRecommendation[] = [];
    try {
      recommendations = await this.generateUXRecommendations(bottlenecks);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('UX recommendation generation failed', { error: message });
      uncertainties.push(
        this.flagUncertainty('ux_analysis', `AI-powered UX analysis unavailable: ${message}`),
      );
    }

    // Step 4: Calculate conversion rate
    let conversionRate = 0;
    try {
      conversionRate = await this.calculateConversionRate(segment, dateRange);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      uncertainties.push(
        this.flagUncertainty('conversion_rate', `Could not compute conversion rate: ${message}`),
      );
    }

    // Step 5: Identify high-value segments
    let segments: UserSegment[] = [];
    try {
      segments = await this.identifyHighValueSegments();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      uncertainties.push(
        this.flagUncertainty('segmentation', `Segment identification failed: ${message}`),
      );
    }

    // Step 6: Estimate revenue lift
    let revenueLift: RevenueLiftEstimate | null = null;
    if (recommendations.length > 0) {
      try {
        revenueLift = await this.estimateRevenueLift(recommendations);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        uncertainties.push(
          this.flagUncertainty('revenue_lift', `Revenue lift estimation failed: ${message}`),
        );
      }
    }

    // Build confidence score
    const confidence = this.calculateConfidence({
      data_completeness: funnelAnalysis.stages.length > 0 ? 75 : 10,
      bottleneck_detection: bottlenecks.length > 0 ? 80 : 30,
      recommendation_quality: recommendations.length > 0 ? 85 : 15,
      segment_coverage: segments.length > 0 ? 70 : 20,
      revenue_estimation: revenueLift ? 65 : 10,
    });

    // Check for insufficient data
    if (funnelAnalysis.stages.length === 0) {
      warnings.push('No funnel stage data available. Ensure analytics tracking is configured.');
    }

    // Build recommendations list
    const actionableRecommendations = recommendations.map(
      (r) => `[${r.area}] ${r.recommendation} (expected lift: ${(r.expectedLift * 100).toFixed(1)}%, effort: ${r.effort})`,
    );

    if (countryId) {
      actionableRecommendations.push(
        'Consider running country-specific checkout optimization for localized improvements.',
      );
    }

    const criticalBottlenecks = bottlenecks.filter((b) => b.severity === 'critical');
    if (criticalBottlenecks.length > 0) {
      warnings.push(
        `${criticalBottlenecks.length} critical bottleneck(s) detected requiring immediate attention.`,
      );
    }

    const decision = this.buildDecisionSummary(funnelAnalysis, bottlenecks, recommendations, conversionRate);

    const output = this.buildOutput(
      decision,
      {
        funnelAnalysis,
        bottlenecks,
        recommendations,
        conversionRate,
        segments,
        revenueLift,
        countryId: countryId ?? null,
      },
      confidence,
      this.buildReasoning(funnelAnalysis, bottlenecks, recommendations, conversionRate),
      actionableRecommendations,
      warnings,
      uncertainties,
    );

    // Persist and audit
    try {
      await this.persistState({
        lastAnalysis: new Date().toISOString(),
        funnelStages: funnelAnalysis.stages.length,
        bottlenecksFound: bottlenecks.length,
        recommendationsGenerated: recommendations.length,
        overallConversionRate: conversionRate,
      });
      await this.logDecision(input, output);
    } catch (error) {
      this.log.error('Failed to persist state or log decision', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return output;
  }

  // ================================================================
  // Public Methods
  // ================================================================

  /**
   * Analyzes the conversion funnel, optionally filtered by country.
   * Queries analytics data from the database and computes stage-by-stage
   * metrics including drop-off rates, average time, and overall conversion.
   */
  async analyzeFunnel(countryId?: string): Promise<FunnelAnalysis> {
    const cacheKey = `${CACHE_PREFIX}:funnel:${countryId ?? 'global'}`;
    const cached = await cacheGet<FunnelAnalysis>(cacheKey);
    if (cached) {
      this.log.debug('Funnel analysis cache hit', { countryId });
      return cached;
    }

    this.log.info('Analyzing conversion funnel', { countryId });

    let queryText: string;
    let queryParams: unknown[];

    if (countryId) {
      queryText = `
        SELECT
          stage,
          COALESCE(SUM(visitors), 0) AS visitors,
          COALESCE(SUM(exits), 0) AS exits,
          COALESCE(AVG(avg_time_seconds), 0) AS avg_time
        FROM funnel_analytics
        WHERE country_id = $1
        GROUP BY stage
        ORDER BY stage_order ASC
      `;
      queryParams = [countryId];
    } else {
      queryText = `
        SELECT
          stage,
          COALESCE(SUM(visitors), 0) AS visitors,
          COALESCE(SUM(exits), 0) AS exits,
          COALESCE(AVG(avg_time_seconds), 0) AS avg_time
        FROM funnel_analytics
        GROUP BY stage
        ORDER BY stage_order ASC
      `;
      queryParams = [];
    }

    const result = await pool.query(queryText, queryParams);
    const rows = result.rows;

    const stages: FunnelStageData[] = rows.map((row: Record<string, unknown>) => {
      const visitors = Number(row.visitors) || 0;
      const exits = Number(row.exits) || 0;
      const conversionRate = visitors > 0 ? (visitors - exits) / visitors : 0;

      return {
        stage: String(row.stage),
        visitors,
        exits,
        conversionRate,
        avgTime: Number(row.avg_time) || 0,
      };
    });

    // Calculate overall conversion rate across the entire funnel
    let overallRate = 0;
    if (stages.length >= 2) {
      const firstStageVisitors = stages[0].visitors;
      const lastStageVisitors = stages[stages.length - 1].visitors - stages[stages.length - 1].exits;
      overallRate = firstStageVisitors > 0 ? lastStageVisitors / firstStageVisitors : 0;
    } else if (stages.length === 1) {
      overallRate = stages[0].conversionRate;
    }

    const bottlenecks = this.identifyBottlenecks({ stages, overallRate, bottlenecks: [], estimatedRevenueLoss: 0 });

    // Estimate revenue loss from drop-offs
    let estimatedRevenueLoss = 0;
    try {
      const revenueResult = await pool.query(
        `SELECT COALESCE(AVG(order_value), 0) AS avg_order_value
         FROM orders
         WHERE created_at >= NOW() - INTERVAL '30 days'
         ${countryId ? 'AND country_id = $1' : ''}`,
        countryId ? [countryId] : [],
      );
      const avgOrderValue = Number(revenueResult.rows[0]?.avg_order_value) || 0;

      // Estimate lost revenue from total exits across all stages
      const totalExits = stages.reduce((sum, s) => sum + s.exits, 0);
      // Apply a weighted factor: not all exits would have converted
      estimatedRevenueLoss = totalExits * avgOrderValue * overallRate;
    } catch (error) {
      this.log.warn('Could not estimate revenue loss', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const analysis: FunnelAnalysis = {
      stages,
      overallRate,
      bottlenecks,
      estimatedRevenueLoss,
    };

    await cacheSet(cacheKey, analysis, FUNNEL_CACHE_TTL);
    return analysis;
  }

  /**
   * Identifies bottleneck stages in the funnel where drop-off rates
   * exceed severity thresholds. Assigns severity levels and suggests
   * possible causes based on the stage characteristics.
   */
  identifyBottlenecks(funnel: FunnelAnalysis): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    for (const stage of funnel.stages) {
      const dropOffRate = stage.visitors > 0 ? stage.exits / stage.visitors : 0;

      if (dropOffRate <= SEVERITY_THRESHOLDS.low) {
        continue;
      }

      const severity = this.classifyDropOffSeverity(dropOffRate);
      const possibleCauses = this.inferPossibleCauses(stage, dropOffRate);

      // Estimate impact as proportion of total funnel visitors lost at this stage
      const totalVisitors = funnel.stages.length > 0 ? funnel.stages[0].visitors : 0;
      const estimatedImpact = totalVisitors > 0 ? stage.exits / totalVisitors : 0;

      bottlenecks.push({
        stage: stage.stage,
        dropOffRate,
        severity,
        possibleCauses,
        estimatedImpact,
      });
    }

    // Sort by severity (critical first) then by drop-off rate descending
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    bottlenecks.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.dropOffRate - a.dropOffRate;
    });

    return bottlenecks;
  }

  /**
   * Uses the Opus AI model to generate UX recommendations based on
   * identified bottlenecks. Each recommendation includes expected lift,
   * effort level, and supporting evidence.
   */
  async generateUXRecommendations(bottlenecks: Bottleneck[]): Promise<UXRecommendation[]> {
    if (bottlenecks.length === 0) {
      this.log.info('No bottlenecks provided; skipping UX recommendation generation');
      return [];
    }

    this.log.info('Generating UX recommendations via Opus', {
      bottleneckCount: bottlenecks.length,
    });

    const userPrompt = `Analyze the following conversion funnel bottlenecks and generate specific, actionable UX recommendations.

Bottlenecks:
${JSON.stringify(bottlenecks, null, 2)}

For each recommendation, provide:
1. The area of the site/funnel affected
2. The specific issue identified
3. A concrete recommendation to fix it
4. Expected conversion lift (as a decimal, e.g., 0.05 for 5%)
5. Implementation effort (low/medium/high)
6. Priority score (1-10, where 10 is highest priority)
7. Evidence or reasoning supporting the recommendation

Respond with a JSON array of recommendation objects with keys: area, issue, recommendation, expectedLift, effort, priority, evidence.
Do not fabricate data. Base estimates on CRO industry benchmarks and the specific bottleneck data provided.`;

    const response = await this.callAI(this.getSystemPrompt(), userPrompt, 'opus');

    const recommendations = this.parseUXRecommendationsFromAI(response);
    return recommendations;
  }

  /**
   * Optimizes the checkout flow for a specific country by analyzing
   * current checkout steps, identifying friction points, and suggesting
   * improvements tailored to the country's payment and UX preferences.
   */
  async optimizeCheckout(countryId: string): Promise<CheckoutOptimization> {
    this.log.info('Optimizing checkout flow', { countryId });

    // Query current checkout configuration and performance data
    const checkoutResult = await pool.query(
      `SELECT
        COALESCE(step_count, 0) AS step_count,
        COALESCE(checkout_starts, 0) AS checkout_starts,
        COALESCE(checkout_completions, 0) AS checkout_completions,
        steps_data
       FROM checkout_analytics
       WHERE country_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [countryId],
    );

    if (checkoutResult.rows.length === 0) {
      this.log.warn('No checkout analytics data found', { countryId });
      return {
        currentSteps: 0,
        recommendedSteps: 0,
        suggestions: [],
        expectedConversionLift: 0,
      };
    }

    const row = checkoutResult.rows[0];
    const currentSteps = Number(row.step_count) || 0;
    const checkoutStarts = Number(row.checkout_starts) || 0;
    const checkoutCompletions = Number(row.checkout_completions) || 0;
    const stepsData = row.steps_data as Record<string, unknown>[] | null;

    // Get country-specific context for localized recommendations
    const countryResult = await pool.query(
      `SELECT name, currency, language, cultural_behavior
       FROM countries
       WHERE id = $1
       LIMIT 1`,
      [countryId],
    );

    const countryInfo = countryResult.rows[0] ?? {};
    const checkoutConversionRate =
      checkoutStarts > 0 ? checkoutCompletions / checkoutStarts : 0;

    // Use AI to generate checkout-specific suggestions
    const userPrompt = `Analyze this checkout flow and suggest optimizations:

Country: ${countryInfo.name ?? 'Unknown'} (Currency: ${countryInfo.currency ?? 'Unknown'}, Language: ${countryInfo.language ?? 'Unknown'})
Cultural context: ${JSON.stringify(countryInfo.cultural_behavior ?? {})}
Current steps: ${currentSteps}
Checkout starts: ${checkoutStarts}
Checkout completions: ${checkoutCompletions}
Checkout conversion rate: ${(checkoutConversionRate * 100).toFixed(2)}%
Steps data: ${JSON.stringify(stepsData ?? [])}

Provide a JSON object with:
- recommendedSteps: optimal number of checkout steps
- suggestions: array of {step, issue, fix, expectedImpact} objects
- expectedConversionLift: overall expected lift as a decimal

Base suggestions on the country's payment preferences, cultural norms, and the current performance data.
Do not fabricate data. Use industry benchmarks for checkout optimization.`;

    let suggestions: CheckoutSuggestion[] = [];
    let recommendedSteps = currentSteps;
    let expectedConversionLift = 0;

    try {
      const response = await this.callAI(this.getSystemPrompt(), userPrompt, 'opus');
      const parsed = this.parseCheckoutOptimizationFromAI(response);
      suggestions = parsed.suggestions;
      recommendedSteps = parsed.recommendedSteps;
      expectedConversionLift = parsed.expectedConversionLift;
    } catch (error) {
      this.log.warn('AI checkout optimization failed, using rule-based fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback: rule-based suggestions
      const fallback = this.generateRuleBasedCheckoutSuggestions(
        currentSteps,
        checkoutConversionRate,
        countryInfo,
      );
      suggestions = fallback.suggestions;
      recommendedSteps = fallback.recommendedSteps;
      expectedConversionLift = fallback.expectedConversionLift;
    }

    return {
      currentSteps,
      recommendedSteps,
      suggestions,
      expectedConversionLift,
    };
  }

  /**
   * Analyzes a specific page's performance metrics including load time,
   * bounce rate, exit rate, and scroll depth. Returns issues and recommendations.
   */
  async analyzePagePerformance(pageUrl: string): Promise<PageAnalysis> {
    const cacheKey = `${CACHE_PREFIX}:page:${Buffer.from(pageUrl).toString('base64').slice(0, 64)}`;
    const cached = await cacheGet<PageAnalysis>(cacheKey);
    if (cached) {
      this.log.debug('Page analysis cache hit', { pageUrl });
      return cached;
    }

    this.log.info('Analyzing page performance', { pageUrl });

    const result = await pool.query(
      `SELECT
        COALESCE(AVG(load_time_ms), 0) AS load_time,
        COALESCE(AVG(bounce_rate), 0) AS bounce_rate,
        COALESCE(AVG(exit_rate), 0) AS exit_rate,
        COALESCE(AVG(scroll_depth), 0) AS scroll_depth,
        COUNT(*) AS sample_count
       FROM page_analytics
       WHERE page_url = $1
         AND recorded_at >= NOW() - INTERVAL '30 days'`,
      [pageUrl],
    );

    const row = result.rows[0] ?? {};
    const sampleCount = Number(row.sample_count) || 0;
    const loadTime = Number(row.load_time) || 0;
    const bounceRate = Number(row.bounce_rate) || 0;
    const exitRate = Number(row.exit_rate) || 0;
    const scrollDepth = Number(row.scroll_depth) || 0;

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Analyze load time
    if (loadTime > 3000) {
      issues.push(`Page load time is ${(loadTime / 1000).toFixed(1)}s, exceeding the 3s threshold`);
      recommendations.push('Optimize images, enable compression, and review server response time');
    } else if (loadTime > 2000) {
      issues.push(`Page load time is ${(loadTime / 1000).toFixed(1)}s, approaching performance concerns`);
      recommendations.push('Consider lazy loading non-critical assets to improve perceived performance');
    }

    // Analyze bounce rate
    if (bounceRate > 0.7) {
      issues.push(`High bounce rate of ${(bounceRate * 100).toFixed(1)}% indicates content-visitor mismatch`);
      recommendations.push('Review page content relevance, improve above-the-fold messaging, and verify traffic source alignment');
    } else if (bounceRate > 0.5) {
      issues.push(`Bounce rate of ${(bounceRate * 100).toFixed(1)}% is above average`);
      recommendations.push('Test alternative headlines and CTAs to improve engagement');
    }

    // Analyze exit rate
    if (exitRate > 0.6) {
      issues.push(`Exit rate of ${(exitRate * 100).toFixed(1)}% suggests users are leaving the funnel at this page`);
      recommendations.push('Add clear next-step CTAs and reduce friction on this page');
    }

    // Analyze scroll depth
    if (scrollDepth < 0.3) {
      issues.push(`Low scroll depth of ${(scrollDepth * 100).toFixed(1)}% means most content is unseen`);
      recommendations.push('Move key content and CTAs above the fold; consider shorter page layout');
    }

    // Flag data quality
    if (sampleCount < 100) {
      issues.push(`Limited sample size (${sampleCount} sessions). Metrics may not be statistically reliable.`);
    }

    const analysis: PageAnalysis = {
      url: pageUrl,
      loadTime,
      bounceRate,
      exitRate,
      scrollDepth,
      issues,
      recommendations,
    };

    await cacheSet(cacheKey, analysis, PAGE_ANALYSIS_CACHE_TTL);
    return analysis;
  }

  /**
   * Calculates the conversion rate for a given segment and date range.
   * Returns the rate as a decimal (e.g., 0.035 for 3.5%).
   */
  async calculateConversionRate(segment?: string, dateRange?: DateRange): Promise<number> {
    this.log.info('Calculating conversion rate', { segment, dateRange });

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (segment) {
      conditions.push(`segment = $${paramIndex}`);
      params.push(segment);
      paramIndex++;
    }

    if (dateRange) {
      conditions.push(`recorded_at >= $${paramIndex}`);
      params.push(dateRange.startDate);
      paramIndex++;
      conditions.push(`recorded_at <= $${paramIndex}`);
      params.push(dateRange.endDate);
      paramIndex++;
    } else {
      // Default to last 30 days
      conditions.push(`recorded_at >= NOW() - INTERVAL '30 days'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(conversions), 0) AS total_conversions,
        COALESCE(SUM(visitors), 0) AS total_visitors
       FROM conversion_metrics
       ${whereClause}`,
      params,
    );

    const totalConversions = Number(result.rows[0]?.total_conversions) || 0;
    const totalVisitors = Number(result.rows[0]?.total_visitors) || 0;

    if (totalVisitors === 0) {
      this.log.warn('No visitor data found for conversion rate calculation', { segment, dateRange });
      return 0;
    }

    return totalConversions / totalVisitors;
  }

  /**
   * Identifies high-value user segments based on conversion rate and
   * average order value. Returns segments sorted by value (highest first).
   */
  async identifyHighValueSegments(): Promise<UserSegment[]> {
    const cacheKey = `${CACHE_PREFIX}:high_value_segments`;
    const cached = await cacheGet<UserSegment[]>(cacheKey);
    if (cached) {
      this.log.debug('High-value segments cache hit');
      return cached;
    }

    this.log.info('Identifying high-value user segments');

    const result = await pool.query(
      `SELECT
        segment_id,
        segment_name,
        COALESCE(user_count, 0) AS user_count,
        COALESCE(conversion_rate, 0) AS conversion_rate,
        COALESCE(avg_order_value, 0) AS avg_order_value,
        COALESCE(characteristics, '{}') AS characteristics
       FROM user_segments
       WHERE user_count > 0
       ORDER BY (conversion_rate * avg_order_value) DESC
       LIMIT 20`,
    );

    const segments: UserSegment[] = result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.segment_id),
      name: String(row.segment_name),
      size: Number(row.user_count) || 0,
      conversionRate: Number(row.conversion_rate) || 0,
      avgOrderValue: Number(row.avg_order_value) || 0,
      characteristics:
        typeof row.characteristics === 'object' && row.characteristics !== null
          ? (row.characteristics as Record<string, string>)
          : {},
    }));

    await cacheSet(cacheKey, segments, SEGMENT_CACHE_TTL);
    return segments;
  }

  /**
   * Generates personalization suggestions for a specific user segment
   * using the Opus model to analyze segment characteristics and recommend
   * targeted content, layout, and offer changes.
   */
  async suggestPersonalization(segment: UserSegment): Promise<PersonalizationSuggestion> {
    this.log.info('Generating personalization suggestions', {
      segmentId: segment.id,
      segmentName: segment.name,
    });

    const userPrompt = `Generate personalization suggestions for this user segment:

Segment: ${segment.name}
Size: ${segment.size} users
Conversion Rate: ${(segment.conversionRate * 100).toFixed(2)}%
Average Order Value: $${segment.avgOrderValue.toFixed(2)}
Characteristics: ${JSON.stringify(segment.characteristics)}

Provide a JSON object with:
- contentChanges: array of specific content modifications
- layoutChanges: array of layout/design changes
- offerChanges: array of promotional or pricing changes
- expectedLift: estimated conversion lift as a decimal

Base suggestions on the segment characteristics and industry best practices.
Do not fabricate data or make unsupported claims.`;

    try {
      const response = await this.callAI(this.getSystemPrompt(), userPrompt, 'opus');
      return this.parsePersonalizationFromAI(response, segment.name);
    } catch (error) {
      this.log.warn('AI personalization generation failed, using rule-based fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.generateRuleBasedPersonalization(segment);
    }
  }

  /**
   * Estimates the potential revenue lift from implementing a set of
   * UX recommendations. Uses current revenue data and expected lift
   * percentages to project total and per-recommendation impact.
   */
  async estimateRevenueLift(recommendations: UXRecommendation[]): Promise<RevenueLiftEstimate> {
    this.log.info('Estimating revenue lift', { recommendationCount: recommendations.length });

    // Get current monthly revenue baseline
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(order_value), 0) AS monthly_revenue
       FROM orders
       WHERE created_at >= NOW() - INTERVAL '30 days'`,
    );
    const monthlyRevenue = Number(revenueResult.rows[0]?.monthly_revenue) || 0;

    if (monthlyRevenue === 0) {
      this.log.warn('No revenue data available for lift estimation');
      return {
        totalEstimatedLift: 0,
        byRecommendation: {},
        confidence: 0,
        timeframe: '30 days',
      };
    }

    const byRecommendation: Record<string, number> = {};
    let combinedLiftMultiplier = 1;

    for (const rec of recommendations) {
      // Compound lift: each recommendation's lift applies to already-improved rate
      // Use a diminishing returns model: actual lift = expectedLift * (1 - overlap factor)
      const overlapFactor = Math.min(0.3, (recommendations.length - 1) * 0.05);
      const adjustedLift = rec.expectedLift * (1 - overlapFactor);
      const revenueImpact = monthlyRevenue * adjustedLift;

      byRecommendation[rec.id] = revenueImpact;
      combinedLiftMultiplier *= 1 + adjustedLift;
    }

    const totalEstimatedLift = monthlyRevenue * (combinedLiftMultiplier - 1);

    // Confidence is based on data quality and number of recommendations
    const confidenceFactors = {
      revenue_data: monthlyRevenue > 0 ? 70 : 10,
      recommendation_count: Math.min(90, recommendations.length * 15),
      estimation_model: 55, // Rule-based estimation has moderate confidence
    };
    const avgConfidence =
      Object.values(confidenceFactors).reduce((a, b) => a + b, 0) /
      Object.values(confidenceFactors).length;

    return {
      totalEstimatedLift,
      byRecommendation,
      confidence: avgConfidence,
      timeframe: '30 days',
    };
  }

  // ================================================================
  // Private Helpers
  // ================================================================

  /**
   * Classifies a drop-off rate into a severity category.
   */
  private classifyDropOffSeverity(dropOffRate: number): Bottleneck['severity'] {
    if (dropOffRate >= SEVERITY_THRESHOLDS.critical) return 'critical';
    if (dropOffRate >= SEVERITY_THRESHOLDS.high) return 'high';
    if (dropOffRate >= SEVERITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Infers possible causes for a drop-off based on stage characteristics.
   */
  private inferPossibleCauses(stage: FunnelStageData, dropOffRate: number): string[] {
    const causes: string[] = [];
    const stageLower = stage.stage.toLowerCase();

    // Time-based causes
    if (stage.avgTime > 120) {
      causes.push('Excessive time on page suggests user confusion or complex form requirements');
    } else if (stage.avgTime < 5) {
      causes.push('Very short time on page suggests content is not engaging or page loads incorrectly');
    }

    // Stage-specific heuristics
    if (stageLower === 'awareness' || stageLower === 'interest') {
      if (dropOffRate > 0.4) {
        causes.push('Poor traffic quality or misaligned messaging with audience expectations');
      }
      causes.push('Weak value proposition or unclear product benefits');
    }

    if (stageLower === 'consideration') {
      causes.push('Insufficient social proof, reviews, or trust signals');
      if (dropOffRate > 0.3) {
        causes.push('Pricing or product information may not be competitive or clear');
      }
    }

    if (stageLower === 'intent') {
      causes.push('Cart abandonment likely due to unexpected costs or complex checkout');
      if (dropOffRate > 0.35) {
        causes.push('Shipping costs, taxes, or fees revealed too late in the process');
      }
    }

    if (stageLower === 'purchase') {
      causes.push('Checkout friction, payment method limitations, or trust concerns');
      if (dropOffRate > 0.3) {
        causes.push('Missing preferred payment methods or overly complex checkout form');
      }
    }

    if (stageLower === 'loyalty') {
      causes.push('Poor post-purchase experience or lack of retention incentives');
    }

    if (causes.length === 0) {
      causes.push('Drop-off rate exceeds expected threshold for this stage');
    }

    return causes;
  }

  /**
   * Parses AI response into UX recommendations. Handles JSON extraction
   * from potentially wrapped text responses.
   */
  private parseUXRecommendationsFromAI(response: string): UXRecommendation[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.log.warn('Could not extract JSON array from AI response for UX recommendations');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
      return parsed.map((item) => ({
        id: generateId(),
        area: String(item.area ?? 'general'),
        issue: String(item.issue ?? ''),
        recommendation: String(item.recommendation ?? ''),
        expectedLift: this.clampNumber(Number(item.expectedLift) || 0, 0, 1),
        effort: this.validateEffort(String(item.effort ?? 'medium')),
        priority: this.clampNumber(Math.round(Number(item.priority) || 5), 1, 10),
        evidence: String(item.evidence ?? ''),
      }));
    } catch (error) {
      this.log.error('Failed to parse UX recommendations from AI', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Parses AI response into checkout optimization data.
   */
  private parseCheckoutOptimizationFromAI(
    response: string,
  ): { suggestions: CheckoutSuggestion[]; recommendedSteps: number; expectedConversionLift: number } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log.warn('Could not extract JSON from AI response for checkout optimization');
        return { suggestions: [], recommendedSteps: 0, expectedConversionLift: 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

      return {
        recommendedSteps: Number(parsed.recommendedSteps) || 0,
        expectedConversionLift: this.clampNumber(Number(parsed.expectedConversionLift) || 0, 0, 1),
        suggestions: rawSuggestions.map((s: Record<string, unknown>) => ({
          step: String(s.step ?? ''),
          issue: String(s.issue ?? ''),
          fix: String(s.fix ?? ''),
          expectedImpact: this.clampNumber(Number(s.expectedImpact) || 0, 0, 1),
        })),
      };
    } catch (error) {
      this.log.error('Failed to parse checkout optimization from AI', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { suggestions: [], recommendedSteps: 0, expectedConversionLift: 0 };
    }
  }

  /**
   * Parses AI response into personalization suggestion.
   */
  private parsePersonalizationFromAI(response: string, segmentName: string): PersonalizationSuggestion {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log.warn('Could not extract JSON from AI response for personalization');
        return { segment: segmentName, contentChanges: [], layoutChanges: [], offerChanges: [], expectedLift: 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        segment: segmentName,
        contentChanges: Array.isArray(parsed.contentChanges)
          ? parsed.contentChanges.map(String)
          : [],
        layoutChanges: Array.isArray(parsed.layoutChanges)
          ? parsed.layoutChanges.map(String)
          : [],
        offerChanges: Array.isArray(parsed.offerChanges)
          ? parsed.offerChanges.map(String)
          : [],
        expectedLift: this.clampNumber(Number(parsed.expectedLift) || 0, 0, 1),
      };
    } catch (error) {
      this.log.error('Failed to parse personalization from AI', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { segment: segmentName, contentChanges: [], layoutChanges: [], offerChanges: [], expectedLift: 0 };
    }
  }

  /**
   * Rule-based fallback for checkout suggestions when AI is unavailable.
   */
  private generateRuleBasedCheckoutSuggestions(
    currentSteps: number,
    checkoutConversionRate: number,
    countryInfo: Record<string, unknown>,
  ): { suggestions: CheckoutSuggestion[]; recommendedSteps: number; expectedConversionLift: number } {
    const suggestions: CheckoutSuggestion[] = [];
    let expectedLift = 0;

    // Step reduction
    if (currentSteps > 3) {
      suggestions.push({
        step: 'overall',
        issue: `Checkout has ${currentSteps} steps which creates friction`,
        fix: 'Consolidate to a 2-3 step checkout flow with clear progress indicators',
        expectedImpact: 0.05,
      });
      expectedLift += 0.05;
    }

    // Low conversion rate
    if (checkoutConversionRate < 0.3) {
      suggestions.push({
        step: 'payment',
        issue: 'Low checkout conversion suggests payment friction',
        fix: 'Add local payment methods and display trust badges prominently',
        expectedImpact: 0.08,
      });
      expectedLift += 0.08;
    }

    // Guest checkout
    suggestions.push({
      step: 'account',
      issue: 'Forced account creation increases abandonment',
      fix: 'Offer guest checkout as the default option with optional account creation post-purchase',
      expectedImpact: 0.03,
    });
    expectedLift += 0.03;

    const recommendedSteps = Math.min(currentSteps, 3);

    return {
      suggestions,
      recommendedSteps: recommendedSteps > 0 ? recommendedSteps : currentSteps,
      expectedConversionLift: Math.min(expectedLift, 0.25),
    };
  }

  /**
   * Rule-based fallback for personalization when AI is unavailable.
   */
  private generateRuleBasedPersonalization(segment: UserSegment): PersonalizationSuggestion {
    const contentChanges: string[] = [];
    const layoutChanges: string[] = [];
    const offerChanges: string[] = [];

    if (segment.conversionRate > 0.05) {
      contentChanges.push('Emphasize premium product features and exclusivity');
      offerChanges.push('Offer loyalty rewards or early access to new products');
    } else {
      contentChanges.push('Strengthen value proposition and social proof elements');
      offerChanges.push('Provide limited-time discount to encourage first purchase');
    }

    if (segment.avgOrderValue > 100) {
      layoutChanges.push('Feature product bundles and cross-sell widgets prominently');
      offerChanges.push('Offer free shipping threshold slightly above current AOV');
    } else {
      layoutChanges.push('Simplify product selection with curated collections');
      offerChanges.push('Display volume discounts and bundle savings prominently');
    }

    return {
      segment: segment.name,
      contentChanges,
      layoutChanges,
      offerChanges,
      expectedLift: 0.02, // Conservative estimate for rule-based approach
    };
  }

  /**
   * Builds a decision summary string from the analysis results.
   */
  private buildDecisionSummary(
    funnel: FunnelAnalysis,
    bottlenecks: Bottleneck[],
    recommendations: UXRecommendation[],
    conversionRate: number,
  ): string {
    const parts: string[] = [];

    parts.push(`Conversion funnel analysis complete.`);

    if (funnel.stages.length > 0) {
      parts.push(`Analyzed ${funnel.stages.length} funnel stages with overall rate of ${(funnel.overallRate * 100).toFixed(2)}%.`);
    }

    if (bottlenecks.length > 0) {
      const criticalCount = bottlenecks.filter((b) => b.severity === 'critical').length;
      const highCount = bottlenecks.filter((b) => b.severity === 'high').length;
      parts.push(
        `Identified ${bottlenecks.length} bottleneck(s): ${criticalCount} critical, ${highCount} high severity.`,
      );
    }

    if (recommendations.length > 0) {
      parts.push(`Generated ${recommendations.length} UX recommendation(s).`);
    }

    if (conversionRate > 0) {
      parts.push(`Current conversion rate: ${(conversionRate * 100).toFixed(2)}%.`);
    }

    if (funnel.estimatedRevenueLoss > 0) {
      parts.push(`Estimated monthly revenue loss from drop-offs: $${funnel.estimatedRevenueLoss.toFixed(2)}.`);
    }

    return parts.join(' ');
  }

  /**
   * Builds a detailed reasoning string explaining the analysis.
   */
  private buildReasoning(
    funnel: FunnelAnalysis,
    bottlenecks: Bottleneck[],
    recommendations: UXRecommendation[],
    conversionRate: number,
  ): string {
    const parts: string[] = [];

    parts.push('Conversion optimization analysis was performed using the following approach:');

    if (funnel.stages.length > 0) {
      parts.push(
        `1. Funnel analysis: Queried and analyzed ${funnel.stages.length} stages from the funnel_analytics table. ` +
        `Overall conversion rate is ${(funnel.overallRate * 100).toFixed(2)}%.`,
      );
    } else {
      parts.push('1. Funnel analysis: No stage data was available in the funnel_analytics table.');
    }

    if (bottlenecks.length > 0) {
      const topBottleneck = bottlenecks[0];
      parts.push(
        `2. Bottleneck detection: Found ${bottlenecks.length} bottleneck(s). ` +
        `The most critical is at the "${topBottleneck.stage}" stage with a ${(topBottleneck.dropOffRate * 100).toFixed(1)}% drop-off rate.`,
      );
    } else {
      parts.push('2. Bottleneck detection: No significant bottlenecks exceeded the severity thresholds.');
    }

    if (recommendations.length > 0) {
      parts.push(
        `3. UX recommendations: Generated ${recommendations.length} actionable recommendation(s) via Opus model analysis ` +
        `targeting the identified bottlenecks.`,
      );
    } else {
      parts.push('3. UX recommendations: No recommendations generated (either no bottlenecks or AI unavailable).');
    }

    if (conversionRate > 0) {
      parts.push(`4. Current segment conversion rate: ${(conversionRate * 100).toFixed(2)}%.`);
    }

    return parts.join(' ');
  }

  /**
   * Clamps a number to a given range.
   */
  private clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Validates and normalizes effort level strings.
   */
  private validateEffort(effort: string): 'low' | 'medium' | 'high' {
    const normalized = effort.toLowerCase().trim();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return normalized;
    }
    return 'medium';
  }
}

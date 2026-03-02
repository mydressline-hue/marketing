// ============================================================
// AI International Growth Engine - Fraud & Anomaly Detection Agent
// Agent 15: Fraud Detection & Anomaly Monitoring
//
// Detects click fraud, bot traffic, conversion anomalies, and
// budget misuse across campaigns. Evaluates configurable anomaly
// rules, calculates fraud scores from multi-signal analysis, and
// creates alerts with severity classifications.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput, AgentConfidenceScore } from '../base/types';
import type { AgentType, FraudAlert, FraudType, AnomalyRule, DateRange } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId, retryWithBackoff } from '../../utils/helpers';

// ---- Cache Configuration ----

/** Cache key prefix for fraud detection data */
const CACHE_PREFIX = 'fraud_detection';

/** Cache TTL in seconds (5 minutes — shorter than market intel due to urgency) */
const CACHE_TTL = 300;

// ---- Fraud Scoring Configuration ----

/** Fraud score threshold above which a campaign is auto-blocked */
const AUTO_BLOCK_THRESHOLD = 85;

/** Fraud score threshold above which an alert is created */
const ALERT_THRESHOLD = 50;

/** Severity thresholds mapped from fraud score ranges */
const SEVERITY_THRESHOLDS = {
  critical: 85,
  high: 65,
  medium: 40,
  low: 0,
} as const;

// ---- Local Type Definitions ----

/**
 * A single fraud indicator contributing to the overall fraud score.
 * Each signal captures a metric, its observed value, the expected threshold,
 * and whether it is considered suspicious.
 */
export interface FraudSignal {
  /** Type of fraud signal (e.g. 'high_ctr', 'geo_concentration', 'rapid_clicks') */
  type: string;
  /** Observed value for this signal */
  value: number;
  /** Threshold above which the signal is deemed suspicious */
  threshold: number;
  /** Whether this signal exceeded its threshold */
  suspicious: boolean;
  /** Human-readable description of the signal */
  description: string;
}

/**
 * Result of click fraud detection analysis for a campaign.
 */
export interface FraudDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Composite fraud score (0-100) */
  fraudScore: number;
  /** Individual fraud signals detected */
  signals: FraudSignal[];
  /** Actionable recommendation based on the fraud score */
  recommendation: string;
  /** Whether the campaign was auto-blocked due to high fraud score */
  blocked: boolean;
}

/**
 * Result of bot traffic detection analysis.
 */
export interface BotDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Estimated percentage of traffic attributed to bots (0-100) */
  botPercentage: number;
  /** Behavioral indicators suggesting bot activity */
  indicators: string[];
  /** Confidence in the bot detection result (0-100) */
  confidence: number;
}

/**
 * Result of conversion anomaly detection.
 */
export interface AnomalyDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Detected anomalies in conversion metrics */
  anomalies: Anomaly[];
  /** Overall severity of detected anomalies */
  severity: string;
}

/**
 * A single detected anomaly in a metric.
 */
export interface Anomaly {
  /** The metric that deviated (e.g. 'conversion_rate', 'cpa') */
  metric: string;
  /** Expected value based on historical patterns */
  expected: number;
  /** Actual observed value */
  actual: number;
  /** Standard deviations from expected (z-score) */
  deviation: number;
  /** ISO-8601 timestamp of the anomaly */
  timestamp: string;
}

/**
 * Result of budget misuse detection for an allocation.
 */
export interface BudgetMisuseResult {
  /** The budget allocation analyzed */
  allocationId: string;
  /** Specific misuse issues identified */
  issues: string[];
  /** Severity classification */
  severity: string;
  /** Supporting evidence for the findings */
  evidence: Record<string, unknown>;
}

/**
 * Traffic pattern breakdown for a campaign.
 */
export interface TrafficPattern {
  /** Total traffic volume */
  total: number;
  /** Organic traffic count */
  organic: number;
  /** Paid traffic count */
  paid: number;
  /** Suspicious traffic count */
  suspicious: number;
  /** Traffic distribution by hour of day (0-23) */
  byHour: Record<number, number>;
  /** Traffic distribution by geographic region */
  byGeo: Record<string, number>;
}

/**
 * Result of evaluating a single anomaly rule against data.
 */
export interface RuleEvaluation {
  /** ID of the rule evaluated */
  ruleId: string;
  /** Whether the rule's condition was triggered */
  triggered: boolean;
  /** The observed value for the rule's metric */
  value: number;
  /** The rule's threshold */
  threshold: number;
}

// ---- Agent Implementation ----

/**
 * Fraud & Anomaly Detection Agent (Agent 15).
 *
 * Monitors campaign traffic and financial metrics for signs of fraud
 * including click fraud, bot traffic, conversion anomalies, and budget
 * misuse. Uses a multi-signal scoring approach to calculate fraud risk,
 * evaluates configurable anomaly rules, and creates prioritized alerts.
 *
 * The agent employs both rule-based detection (threshold evaluation) and
 * AI-assisted pattern analysis to identify sophisticated fraud patterns
 * that rule-based systems alone might miss.
 *
 * @extends BaseAgent
 */
export class FraudDetectionAgent extends BaseAgent {
  constructor(config?: Partial<{
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
  }>) {
    super({
      agentType: 'fraud_detection' as AgentType,
      model: 'opus',
      maxRetries: config?.maxRetries ?? 3,
      timeoutMs: config?.timeoutMs ?? 90_000,
      confidenceThreshold: config?.confidenceThreshold ?? 60,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the Claude system prompt that defines this agent's AI persona
   * for fraud and anomaly detection tasks.
   */
  public getSystemPrompt(): string {
    return `You are the Fraud & Anomaly Detection Agent for an AI-powered international growth engine.
Your role is to analyze campaign traffic, conversion data, and budget flows to detect fraudulent
activity, bot traffic, conversion anomalies, and budget misuse.

You will be provided with structured data including:
- Click and traffic metrics with temporal and geographic distributions
- Conversion funnels and rate deviations from historical baselines
- Budget allocation and spend records
- Known fraud signal patterns and their observed values

Your responsibilities:
1. Evaluate fraud signals and calculate composite fraud scores.
2. Identify bot traffic patterns using behavioral indicators.
3. Detect statistically significant anomalies in conversion metrics.
4. Flag budget misuse by comparing spend patterns to allocations.
5. Provide confidence levels for all assessments.
6. Clearly flag uncertainty when data is insufficient for reliable detection.

Output format: Respond with valid JSON matching the requested schema. Be specific about
which signals triggered your assessment. Never fabricate data points — when data is missing,
note it as an uncertainty and adjust confidence downward accordingly.`;
  }

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Fraud Detection can challenge paid ads, performance analytics, and
   * data engineering decisions since fraudulent data may corrupt their outputs.
   */
  public getChallengeTargets(): AgentType[] {
    return ['paid_ads', 'performance_analytics', 'data_engineering'];
  }

  /**
   * Core processing method. Runs fraud detection across the specified campaign
   * or all active campaigns, aggregates signals, and returns a comprehensive
   * fraud assessment.
   *
   * @param input - Standard agent input. Expected context keys:
   *   - `campaignId` (optional): specific campaign to analyze
   *   - `scope` (optional): 'single' | 'all' (defaults to 'single' if campaignId present)
   * @returns Structured agent output with fraud detection results.
   */
  public async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting fraud detection analysis', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];

    const campaignId = input.context.campaignId as string | undefined;
    const scope = input.context.scope as string | undefined;

    // Determine which campaigns to analyze
    let campaignIds: string[] = [];
    if (campaignId && scope !== 'all') {
      campaignIds = [campaignId];
    } else {
      try {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE status = 'active'`,
        );
        campaignIds = result.rows.map((r) => r.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to fetch active campaigns: ${message}`);
      }
    }

    if (campaignIds.length === 0) {
      const output = this.buildOutput(
        'no_campaigns_to_analyze',
        { results: [] },
        this.calculateConfidence({ dataAvailability: 0 }),
        'No active campaigns found for fraud analysis.',
        ['Ensure campaigns are active before running fraud detection.'],
        ['No active campaigns available for analysis.'],
        [this.flagUncertainty('data', 'No campaign data available for fraud analysis')],
      );
      await this.logDecision(input, output);
      return output;
    }

    // Analyze each campaign
    const results: FraudDetectionResult[] = [];
    const allAlerts: FraudAlert[] = [];

    for (const cId of campaignIds) {
      try {
        const fraudResult = await this.detectClickFraud(cId);
        results.push(fraudResult);

        // Create alerts for campaigns exceeding the alert threshold
        if (fraudResult.fraudScore >= ALERT_THRESHOLD) {
          const alert = await this.createAlert('click_fraud', cId, {
            fraudScore: fraudResult.fraudScore,
            signals: fraudResult.signals,
            recommendation: fraudResult.recommendation,
            blocked: fraudResult.blocked,
          });
          allAlerts.push(alert);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Fraud analysis failed for campaign ${cId}: ${message}`);
        this.log.warn('Campaign fraud analysis failed', {
          campaignId: cId,
          error: message,
        });
      }
    }

    // Evaluate anomaly rules
    let ruleEvaluations: RuleEvaluation[] = [];
    let totalExpectedEvaluations = 0;
    let ruleEvaluationErrors = 0;
    try {
      const rules = await this.getRules();
      totalExpectedEvaluations = rules.length * campaignIds.length;
      for (const rule of rules) {
        for (const cId of campaignIds) {
          try {
            const campaignData = await this.fetchCampaignMetrics(cId);
            const evaluation = await this.evaluateRule(rule, campaignData);
            ruleEvaluations.push(evaluation);
            if (evaluation.triggered) {
              await this.createAlert(rule.type, cId, {
                ruleId: rule.id,
                ruleName: rule.name,
                value: evaluation.value,
                threshold: evaluation.threshold,
              });
            }
          } catch (error) {
            ruleEvaluationErrors++;
            const message = error instanceof Error ? error.message : String(error);
            this.log.warn('Rule evaluation failed', {
              ruleId: rule.id,
              campaignId: cId,
              error: message,
            });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Anomaly rule evaluation failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('rules', 'Could not evaluate anomaly rules — rule-based detection incomplete'),
      );
    }

    // Calculate confidence based on data quality
    const dataCompleteness = results.length > 0 ? (results.length / campaignIds.length) * 100 : 0;
    const signalDensity = results.length > 0
      ? Math.min(100, (results.reduce((sum, r) => sum + r.signals.length, 0) / results.length) * 20)
      : 0;

    // Calculate methodology consistency from actual evaluation data:
    // 1. Rule evaluation completeness — what fraction of expected evaluations succeeded
    const ruleCompleteness = totalExpectedEvaluations > 0
      ? ((totalExpectedEvaluations - ruleEvaluationErrors) / totalExpectedEvaluations) * 100
      : 0;
    // 2. Signal consistency — how much signals within each campaign agree (all suspicious or all clean)
    let signalConsistency = 100;
    if (results.length > 0) {
      const consistencyScores = results
        .filter((r) => r.signals.length > 0)
        .map((r) => {
          const suspiciousCount = r.signals.filter((s) => s.suspicious).length;
          const ratio = suspiciousCount / r.signals.length;
          // Score is highest (100) when signals fully agree (ratio near 0 or 1), lowest at 0.5
          return (1 - 2 * Math.abs(ratio - 0.5)) * 100;
        });
      signalConsistency = consistencyScores.length > 0
        ? consistencyScores.reduce((sum, s) => sum + s, 0) / consistencyScores.length
        : 50;
    }
    // 3. Step completion — did both campaign analysis and rule evaluation phases produce results
    const stepsCompleted = (results.length > 0 ? 50 : 0) + (ruleEvaluations.length > 0 ? 50 : 0);
    // Weighted combination: rule completeness 40%, signal consistency 30%, step completion 30%
    const methodologyConsistency = Math.round(
      ruleCompleteness * 0.4 + signalConsistency * 0.3 + stepsCompleted * 0.3,
    );

    const confidence = this.calculateConfidence({
      dataAvailability: dataCompleteness,
      signalDensity,
      rulesCoverage: ruleEvaluations.length > 0 ? 75 : 25,
      methodologyConsistency,
    });

    // Aggregate results
    const highRiskCampaigns = results.filter((r) => r.fraudScore >= SEVERITY_THRESHOLDS.high);
    const blockedCampaigns = results.filter((r) => r.blocked);

    const recommendations: string[] = [];
    if (highRiskCampaigns.length > 0) {
      recommendations.push(
        `${highRiskCampaigns.length} campaign(s) flagged as high-risk — review immediately.`,
      );
    }
    if (blockedCampaigns.length > 0) {
      recommendations.push(
        `${blockedCampaigns.length} campaign(s) auto-blocked due to fraud score exceeding ${AUTO_BLOCK_THRESHOLD}.`,
      );
    }
    if (results.length > 0 && highRiskCampaigns.length === 0) {
      recommendations.push('No high-risk fraud detected. Continue monitoring.');
    }

    // Cache results
    try {
      await cacheSet(
        `${CACHE_PREFIX}:analysis:${input.requestId}`,
        { results, alerts: allAlerts, ruleEvaluations },
        CACHE_TTL,
      );
      await cacheSet(`${CACHE_PREFIX}:analysis:latest`, { results, alerts: allAlerts }, CACHE_TTL);
    } catch (error) {
      this.log.warn('Failed to cache fraud analysis results', { error });
    }

    // Persist state
    await this.persistState({
      lastAnalysis: new Date().toISOString(),
      campaignsAnalyzed: campaignIds.length,
      highRiskCount: highRiskCampaigns.length,
      blockedCount: blockedCampaigns.length,
      alertsCreated: allAlerts.length,
    });

    const output = this.buildOutput(
      'fraud_analysis_complete',
      {
        results,
        alerts: allAlerts,
        ruleEvaluations,
        summary: {
          campaignsAnalyzed: campaignIds.length,
          highRiskCount: highRiskCampaigns.length,
          blockedCount: blockedCampaigns.length,
          alertsCreated: allAlerts.length,
        },
      },
      confidence,
      `Analyzed ${campaignIds.length} campaign(s). Found ${highRiskCampaigns.length} high-risk and ${blockedCampaigns.length} blocked campaign(s). Created ${allAlerts.length} alert(s).`,
      recommendations,
      warnings,
      uncertainties,
    );

    await this.logDecision(input, output);

    this.log.info('Fraud detection analysis complete', {
      requestId: input.requestId,
      campaignsAnalyzed: campaignIds.length,
      highRisk: highRiskCampaigns.length,
      blocked: blockedCampaigns.length,
      confidence: confidence.score,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public detection methods
  // ------------------------------------------------------------------

  /**
   * Detects click fraud for a specific campaign by analyzing click patterns,
   * CTR anomalies, geographic concentration, and temporal distribution.
   *
   * @param campaignId - The campaign to analyze.
   * @returns Detection result with fraud score, signals, and recommendation.
   */
  public async detectClickFraud(campaignId: string): Promise<FraudDetectionResult> {
    this.log.info('Detecting click fraud', { campaignId });

    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:click_fraud:${campaignId}`;
    const cached = await cacheGet<FraudDetectionResult>(cacheKey);
    if (cached) {
      this.log.debug('Click fraud result cache hit', { campaignId });
      return cached;
    }

    // Fetch campaign metrics
    const metrics = await this.fetchCampaignMetrics(campaignId);
    const trafficPattern = await this.analyzeTrafficPatterns(campaignId);

    // Build fraud signals
    const signals: FraudSignal[] = [];

    // Signal 1: Abnormally high CTR
    const ctr = metrics.ctr as number | undefined;
    if (ctr !== undefined && ctr !== null) {
      const ctrThreshold = 15; // CTR above 15% is suspicious for most ad types
      signals.push({
        type: 'high_ctr',
        value: ctr,
        threshold: ctrThreshold,
        suspicious: ctr > ctrThreshold,
        description: ctr > ctrThreshold
          ? `CTR of ${ctr}% significantly exceeds expected range`
          : `CTR of ${ctr}% is within normal range`,
      });
    }

    // Signal 2: Geographic concentration
    const geoEntries = Object.entries(trafficPattern.byGeo);
    if (geoEntries.length > 0) {
      const totalGeoTraffic = geoEntries.reduce((sum, [, count]) => sum + count, 0);
      const maxGeoShare = totalGeoTraffic > 0
        ? (Math.max(...geoEntries.map(([, count]) => count)) / totalGeoTraffic) * 100
        : 0;
      const geoThreshold = 80; // >80% from single geo is suspicious
      signals.push({
        type: 'geo_concentration',
        value: Math.round(maxGeoShare * 100) / 100,
        threshold: geoThreshold,
        suspicious: maxGeoShare > geoThreshold,
        description: maxGeoShare > geoThreshold
          ? `${maxGeoShare.toFixed(1)}% of traffic from a single region — potential click farm`
          : `Geographic distribution appears normal`,
      });
    }

    // Signal 3: Suspicious traffic ratio
    if (trafficPattern.total > 0) {
      const suspiciousRatio = (trafficPattern.suspicious / trafficPattern.total) * 100;
      const suspiciousThreshold = 20; // >20% suspicious traffic is concerning
      signals.push({
        type: 'suspicious_traffic_ratio',
        value: Math.round(suspiciousRatio * 100) / 100,
        threshold: suspiciousThreshold,
        suspicious: suspiciousRatio > suspiciousThreshold,
        description: suspiciousRatio > suspiciousThreshold
          ? `${suspiciousRatio.toFixed(1)}% of traffic flagged as suspicious`
          : `Suspicious traffic ratio within acceptable bounds`,
      });
    }

    // Signal 4: Off-hours traffic spike
    const hourEntries = Object.entries(trafficPattern.byHour);
    if (hourEntries.length > 0) {
      const totalHourlyTraffic = hourEntries.reduce((sum, [, count]) => sum + count, 0);
      // Off hours: 1AM-5AM
      const offHoursTraffic = hourEntries
        .filter(([hour]) => {
          const h = parseInt(hour, 10);
          return h >= 1 && h <= 5;
        })
        .reduce((sum, [, count]) => sum + count, 0);
      const offHoursRatio = totalHourlyTraffic > 0
        ? (offHoursTraffic / totalHourlyTraffic) * 100
        : 0;
      const offHoursThreshold = 30; // >30% during off-hours is suspicious
      signals.push({
        type: 'off_hours_spike',
        value: Math.round(offHoursRatio * 100) / 100,
        threshold: offHoursThreshold,
        suspicious: offHoursRatio > offHoursThreshold,
        description: offHoursRatio > offHoursThreshold
          ? `${offHoursRatio.toFixed(1)}% of traffic during off-hours (1AM-5AM)`
          : `Off-hours traffic distribution appears normal`,
      });
    }

    // Signal 5: Low conversion rate relative to clicks
    const conversionRate = metrics.conversion_rate as number | undefined;
    const clicks = metrics.clicks as number | undefined;
    if (conversionRate !== undefined && clicks !== undefined && clicks > 100) {
      const conversionThreshold = 0.1; // <0.1% conversion with high clicks is suspicious
      signals.push({
        type: 'low_conversion_high_clicks',
        value: conversionRate,
        threshold: conversionThreshold,
        suspicious: conversionRate < conversionThreshold,
        description: conversionRate < conversionThreshold
          ? `Conversion rate of ${conversionRate}% with ${clicks} clicks suggests non-genuine traffic`
          : `Conversion rate consistent with click volume`,
      });
    }

    // Calculate composite fraud score
    const fraudScore = this.calculateFraudScore(signals);
    const blocked = fraudScore >= AUTO_BLOCK_THRESHOLD;

    // Generate recommendation
    let recommendation: string;
    try {
      recommendation = await this.generateFraudRecommendation(campaignId, fraudScore, signals);
    } catch {
      recommendation = this.generateFallbackRecommendation(fraudScore, signals);
    }

    const result: FraudDetectionResult = {
      campaignId,
      fraudScore,
      signals,
      recommendation,
      blocked,
    };

    // Cache result
    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Click fraud detection complete', {
      campaignId,
      fraudScore,
      signalCount: signals.length,
      suspiciousCount: signals.filter((s) => s.suspicious).length,
      blocked,
    });

    return result;
  }

  /**
   * Detects bot traffic for a campaign by analyzing behavioral patterns
   * such as session duration, bounce rate, and mouse movement absence.
   *
   * @param campaignId - The campaign to analyze.
   * @returns Bot detection result with estimated bot percentage and indicators.
   */
  public async detectBotTraffic(campaignId: string): Promise<BotDetectionResult> {
    this.log.info('Detecting bot traffic', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:bot_traffic:${campaignId}`;
    const cached = await cacheGet<BotDetectionResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch traffic analytics
    const trafficData = await this.fetchTrafficAnalytics(campaignId);
    const indicators: string[] = [];
    let botSignalCount = 0;
    let totalSignals = 0;

    // Indicator 1: Extremely short session duration
    const avgSessionDuration = trafficData.avg_session_duration as number | undefined;
    if (avgSessionDuration !== undefined) {
      totalSignals++;
      if (avgSessionDuration < 2) { // Less than 2 seconds
        indicators.push(`Average session duration of ${avgSessionDuration}s suggests automated visits`);
        botSignalCount++;
      }
    }

    // Indicator 2: High bounce rate
    const bounceRate = trafficData.bounce_rate as number | undefined;
    if (bounceRate !== undefined) {
      totalSignals++;
      if (bounceRate > 95) {
        indicators.push(`Bounce rate of ${bounceRate}% indicates non-engaged or automated traffic`);
        botSignalCount++;
      }
    }

    // Indicator 3: No mouse movement / interaction events
    const interactionRate = trafficData.interaction_rate as number | undefined;
    if (interactionRate !== undefined) {
      totalSignals++;
      if (interactionRate < 5) {
        indicators.push(`Interaction rate of ${interactionRate}% suggests lack of human engagement`);
        botSignalCount++;
      }
    }

    // Indicator 4: Uniform user-agent strings
    const uniqueUserAgents = trafficData.unique_user_agents as number | undefined;
    const totalSessions = trafficData.total_sessions as number | undefined;
    if (uniqueUserAgents !== undefined && totalSessions !== undefined && totalSessions > 50) {
      totalSignals++;
      const uaRatio = uniqueUserAgents / totalSessions;
      if (uaRatio < 0.05) { // Less than 5% unique UAs
        indicators.push(`Only ${uniqueUserAgents} unique user-agents across ${totalSessions} sessions — bot fingerprint detected`);
        botSignalCount++;
      }
    }

    // Indicator 5: Datacenter IP ratio
    const datacenterIpRatio = trafficData.datacenter_ip_ratio as number | undefined;
    if (datacenterIpRatio !== undefined) {
      totalSignals++;
      if (datacenterIpRatio > 40) {
        indicators.push(`${datacenterIpRatio}% of traffic from datacenter IPs`);
        botSignalCount++;
      }
    }

    // Calculate bot percentage from signals
    const botPercentage = totalSignals > 0
      ? Math.round((botSignalCount / totalSignals) * 100 * 100) / 100
      : 0;

    // Confidence based on how much data we had available
    const confidence = totalSignals > 0
      ? Math.round(Math.min(100, (totalSignals / 5) * 100) * 100) / 100
      : 0;

    const result: BotDetectionResult = {
      campaignId,
      botPercentage,
      indicators,
      confidence,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Bot traffic detection complete', {
      campaignId,
      botPercentage,
      indicatorCount: indicators.length,
      confidence,
    });

    return result;
  }

  /**
   * Detects conversion anomalies for a campaign by comparing current metrics
   * against historical baselines and identifying statistically significant deviations.
   *
   * @param campaignId - The campaign to analyze.
   * @returns Anomaly detection result with identified anomalies and severity.
   */
  public async detectConversionAnomalies(campaignId: string): Promise<AnomalyDetectionResult> {
    this.log.info('Detecting conversion anomalies', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:conversion_anomalies:${campaignId}`;
    const cached = await cacheGet<AnomalyDetectionResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch historical and current metrics
    const currentMetrics = await this.fetchCampaignMetrics(campaignId);
    const historicalBaseline = await this.fetchHistoricalBaseline(campaignId);

    const anomalies: Anomaly[] = [];
    const metricsToCheck = ['conversion_rate', 'cpa', 'ctr', 'roas', 'cpc'] as const;
    const now = new Date().toISOString();

    for (const metric of metricsToCheck) {
      const current = currentMetrics[metric] as number | undefined;
      const baseline = historicalBaseline[metric] as { mean: number; stdDev: number } | undefined;

      if (current === undefined || baseline === undefined) {
        continue;
      }

      // Calculate z-score (standard deviations from mean)
      const deviation = baseline.stdDev > 0
        ? Math.abs(current - baseline.mean) / baseline.stdDev
        : 0;

      // Flag anomalies beyond 2 standard deviations
      if (deviation > 2) {
        anomalies.push({
          metric,
          expected: Math.round(baseline.mean * 100) / 100,
          actual: Math.round(current * 100) / 100,
          deviation: Math.round(deviation * 100) / 100,
          timestamp: now,
        });
      }
    }

    // Determine severity based on worst anomaly
    let severity = 'none';
    if (anomalies.length > 0) {
      const maxDeviation = Math.max(...anomalies.map((a) => a.deviation));
      if (maxDeviation > 4) {
        severity = 'critical';
      } else if (maxDeviation > 3) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
    }

    const result: AnomalyDetectionResult = {
      campaignId,
      anomalies,
      severity,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Conversion anomaly detection complete', {
      campaignId,
      anomalyCount: anomalies.length,
      severity,
    });

    return result;
  }

  /**
   * Detects budget misuse for a specific allocation by comparing actual
   * spend patterns to the approved allocation, checking for overspend,
   * unauthorized channel shifts, and suspicious spend velocity.
   *
   * @param allocationId - The budget allocation to analyze.
   * @returns Budget misuse result with identified issues and severity.
   */
  public async detectBudgetMisuse(allocationId: string): Promise<BudgetMisuseResult> {
    this.log.info('Detecting budget misuse', { allocationId });

    const cacheKey = `${CACHE_PREFIX}:budget_misuse:${allocationId}`;
    const cached = await cacheGet<BudgetMisuseResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch allocation and spend records
    const allocation = await this.fetchBudgetAllocation(allocationId);
    const spendRecords = await this.fetchSpendRecords(allocationId);

    const issues: string[] = [];
    const evidence: Record<string, unknown> = {};

    if (!allocation) {
      return {
        allocationId,
        issues: ['Budget allocation not found'],
        severity: 'high',
        evidence: { reason: 'missing_allocation' },
      };
    }

    const totalBudget = allocation.total_budget as number;
    const totalSpent = allocation.total_spent as number;
    const channelAllocations = allocation.channel_allocations as Record<string, number> | undefined;

    // Issue 1: Overspend
    if (totalBudget > 0 && totalSpent > totalBudget) {
      const overspendPercent = Math.round(((totalSpent - totalBudget) / totalBudget) * 100 * 100) / 100;
      issues.push(`Budget overspent by ${overspendPercent}% ($${(totalSpent - totalBudget).toFixed(2)} over allocation)`);
      evidence.overspend = {
        budget: totalBudget,
        spent: totalSpent,
        overspendPercent,
      };
    }

    // Issue 2: Channel allocation deviation
    if (channelAllocations && spendRecords.length > 0) {
      const spendByChannel: Record<string, number> = {};
      for (const record of spendRecords) {
        const channel = record.channel as string;
        const amount = record.amount as number;
        spendByChannel[channel] = (spendByChannel[channel] ?? 0) + amount;
      }

      for (const [channel, allocated] of Object.entries(channelAllocations)) {
        const spent = spendByChannel[channel] ?? 0;
        if (allocated > 0) {
          const deviationPercent = Math.abs(spent - allocated) / allocated * 100;
          if (deviationPercent > 50) {
            issues.push(`Channel "${channel}" spend deviates ${deviationPercent.toFixed(1)}% from allocation`);
            evidence[`channel_deviation_${channel}`] = {
              allocated,
              spent,
              deviationPercent: Math.round(deviationPercent * 100) / 100,
            };
          }
        }
      }
    }

    // Issue 3: Spend velocity anomaly — check if daily spend rate is accelerating abnormally
    if (spendRecords.length >= 2) {
      const sortedRecords = [...spendRecords].sort(
        (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime(),
      );
      const recentCount = Math.min(7, Math.floor(sortedRecords.length / 2));
      const recentRecords = sortedRecords.slice(-recentCount);
      const olderRecords = sortedRecords.slice(0, recentCount);

      const recentAvg = recentRecords.reduce((sum, r) => sum + (r.amount as number), 0) / recentRecords.length;
      const olderAvg = olderRecords.reduce((sum, r) => sum + (r.amount as number), 0) / olderRecords.length;

      if (olderAvg > 0) {
        const velocityChange = ((recentAvg - olderAvg) / olderAvg) * 100;
        if (velocityChange > 100) {
          issues.push(`Spend velocity increased ${velocityChange.toFixed(1)}% — potential budget drain`);
          evidence.velocityAnomaly = {
            recentDailyAvg: Math.round(recentAvg * 100) / 100,
            priorDailyAvg: Math.round(olderAvg * 100) / 100,
            changePercent: Math.round(velocityChange * 100) / 100,
          };
        }
      }
    }

    // Determine severity
    let severity = 'none';
    if (issues.length > 0) {
      const hasOverspend = issues.some((i) => i.includes('overspent'));
      const hasVelocity = issues.some((i) => i.includes('velocity'));
      if (hasOverspend && hasVelocity) {
        severity = 'critical';
      } else if (hasOverspend) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
    }

    const result: BudgetMisuseResult = {
      allocationId,
      issues,
      severity,
      evidence,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);

    this.log.info('Budget misuse detection complete', {
      allocationId,
      issueCount: issues.length,
      severity,
    });

    return result;
  }

  /**
   * Analyzes traffic patterns for a campaign, breaking down traffic by source,
   * hourly distribution, and geographic origin.
   *
   * @param campaignId - The campaign to analyze.
   * @returns Traffic pattern breakdown.
   */
  public async analyzeTrafficPatterns(campaignId: string): Promise<TrafficPattern> {
    this.log.info('Analyzing traffic patterns', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:traffic_patterns:${campaignId}`;
    const cached = await cacheGet<TrafficPattern>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Fetch aggregated traffic data from DB
      const trafficResult = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN details->>'source' = 'organic' THEN 1 ELSE 0 END), 0) AS organic,
           COALESCE(SUM(CASE WHEN details->>'source' = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
           COALESCE(SUM(CASE WHEN details->>'suspicious' = 'true' THEN 1 ELSE 0 END), 0) AS suspicious,
           COUNT(*) AS total
         FROM campaign_traffic
         WHERE campaign_id = $1`,
        [campaignId],
      );

      const row = trafficResult.rows[0] ?? { total: 0, organic: 0, paid: 0, suspicious: 0 };

      // Fetch hourly distribution
      const hourlyResult = await pool.query(
        `SELECT
           EXTRACT(HOUR FROM created_at) AS hour,
           COUNT(*) AS count
         FROM campaign_traffic
         WHERE campaign_id = $1
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour`,
        [campaignId],
      );

      const byHour: Record<number, number> = {};
      for (const hr of hourlyResult.rows) {
        byHour[parseInt(String(hr.hour), 10)] = parseInt(String(hr.count), 10);
      }

      // Fetch geo distribution
      const geoResult = await pool.query(
        `SELECT
           details->>'geo' AS geo,
           COUNT(*) AS count
         FROM campaign_traffic
         WHERE campaign_id = $1 AND details->>'geo' IS NOT NULL
         GROUP BY details->>'geo'
         ORDER BY count DESC`,
        [campaignId],
      );

      const byGeo: Record<string, number> = {};
      for (const g of geoResult.rows) {
        if (g.geo) {
          byGeo[g.geo as string] = parseInt(String(g.count), 10);
        }
      }

      const pattern: TrafficPattern = {
        total: parseInt(String(row.total), 10),
        organic: parseInt(String(row.organic), 10),
        paid: parseInt(String(row.paid), 10),
        suspicious: parseInt(String(row.suspicious), 10),
        byHour,
        byGeo,
      };

      await cacheSet(cacheKey, pattern, CACHE_TTL);
      return pattern;
    } catch (error) {
      this.log.warn('Failed to analyze traffic patterns, returning empty pattern', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        total: 0,
        organic: 0,
        paid: 0,
        suspicious: 0,
        byHour: {},
        byGeo: {},
      };
    }
  }

  /**
   * Calculates a composite fraud score (0-100) from an array of fraud signals.
   * Suspicious signals contribute more heavily to the score. The score is weighted
   * by the ratio of suspicious signals and the magnitude of their threshold violations.
   *
   * @param signals - Array of fraud signals to aggregate.
   * @returns Composite fraud score between 0 and 100.
   */
  public calculateFraudScore(signals: FraudSignal[]): number {
    if (signals.length === 0) {
      return 0;
    }

    let weightedScore = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      // Each signal contributes based on its suspiciousness and magnitude
      const weight = signal.suspicious ? 2 : 1;
      totalWeight += weight;

      if (signal.suspicious) {
        // Score based on how far the value exceeds the threshold
        const excessRatio = signal.threshold > 0
          ? Math.min(signal.value / signal.threshold, 3) // Cap at 3x threshold
          : 1;
        weightedScore += weight * Math.min(100, excessRatio * 40);
      } else {
        // Non-suspicious signals contribute a small baseline
        const proximityToThreshold = signal.threshold > 0
          ? Math.min(1, signal.value / signal.threshold)
          : 0;
        weightedScore += weight * (proximityToThreshold * 20);
      }
    }

    const rawScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    return Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));
  }

  /**
   * Fetches all active anomaly rules from the database.
   *
   * @returns Array of active anomaly rules.
   */
  public async getRules(): Promise<AnomalyRule[]> {
    const cacheKey = `${CACHE_PREFIX}:rules`;
    const cached = await cacheGet<AnomalyRule[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query<AnomalyRule>(
      `SELECT id, name, type, condition, threshold, is_active
       FROM anomaly_rules
       WHERE is_active = true
       ORDER BY name ASC`,
    );

    const rules = result.rows;
    await cacheSet(cacheKey, rules, CACHE_TTL);

    this.log.debug('Fetched active anomaly rules', { count: rules.length });
    return rules;
  }

  /**
   * Evaluates a single anomaly rule against a data record. Extracts the
   * metric specified in the rule's condition and compares it to the threshold.
   *
   * @param rule - The anomaly rule to evaluate.
   * @param data - The data record to evaluate against (typically campaign metrics).
   * @returns The evaluation result indicating whether the rule triggered.
   */
  public async evaluateRule(
    rule: AnomalyRule,
    data: Record<string, unknown>,
  ): Promise<RuleEvaluation> {
    const metricKey = rule.condition.metric as string | undefined;
    const operator = (rule.condition.operator as string) ?? 'gt';

    if (!metricKey) {
      return {
        ruleId: rule.id,
        triggered: false,
        value: 0,
        threshold: rule.threshold,
      };
    }

    const value = data[metricKey] as number | undefined;
    if (value === undefined || value === null) {
      return {
        ruleId: rule.id,
        triggered: false,
        value: 0,
        threshold: rule.threshold,
      };
    }

    let triggered = false;
    switch (operator) {
      case 'gt':
        triggered = value > rule.threshold;
        break;
      case 'gte':
        triggered = value >= rule.threshold;
        break;
      case 'lt':
        triggered = value < rule.threshold;
        break;
      case 'lte':
        triggered = value <= rule.threshold;
        break;
      case 'eq':
        triggered = value === rule.threshold;
        break;
      default:
        triggered = value > rule.threshold;
    }

    this.log.debug('Rule evaluated', {
      ruleId: rule.id,
      ruleName: rule.name,
      metric: metricKey,
      value,
      threshold: rule.threshold,
      operator,
      triggered,
    });

    return {
      ruleId: rule.id,
      triggered,
      value,
      threshold: rule.threshold,
    };
  }

  /**
   * Creates a fraud alert and persists it to the database.
   *
   * @param type - The fraud type classification.
   * @param campaignId - The affected campaign ID.
   * @param details - Additional details about the fraud detection.
   * @returns The created fraud alert record.
   */
  public async createAlert(
    type: FraudType,
    campaignId: string,
    details: Record<string, unknown>,
  ): Promise<FraudAlert> {
    const fraudScore = (details.fraudScore as number) ?? 0;
    const severity = this.scoreSeverity(fraudScore);
    const now = new Date().toISOString();
    const alertId = generateId();

    try {
      await pool.query(
        `INSERT INTO fraud_alerts (id, type, campaign_id, severity, confidence_score, details, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
        [
          alertId,
          type,
          campaignId,
          severity,
          fraudScore,
          JSON.stringify(details),
          now,
        ],
      );
    } catch (error) {
      this.log.error('Failed to persist fraud alert', {
        alertId,
        type,
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const alert: FraudAlert = {
      id: alertId,
      type,
      campaign_id: campaignId,
      severity,
      confidence_score: fraudScore,
      details,
      status: 'open',
      created_at: now,
    };

    this.log.info('Fraud alert created', {
      alertId,
      type,
      campaignId,
      severity,
      confidenceScore: fraudScore,
    });

    return alert;
  }

  /**
   * Retrieves fraud alerts from the database, optionally filtered by status.
   *
   * @param status - Optional status filter ('open', 'investigating', 'resolved', 'dismissed').
   * @returns Array of matching fraud alerts.
   */
  public async getAlerts(status?: string): Promise<FraudAlert[]> {
    const cacheKey = `${CACHE_PREFIX}:alerts:${status ?? 'all'}`;
    const cached = await cacheGet<FraudAlert[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let queryText = `SELECT id, type, campaign_id, severity, confidence_score, details, status, resolved_by, resolved_at, created_at
                     FROM fraud_alerts`;
    const params: unknown[] = [];

    if (status) {
      queryText += ` WHERE status = $1`;
      params.push(status);
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await pool.query<FraudAlert>(queryText, params);
    const alerts = result.rows;

    await cacheSet(cacheKey, alerts, CACHE_TTL);
    return alerts;
  }

  // ------------------------------------------------------------------
  // Private helper methods
  // ------------------------------------------------------------------

  /**
   * Fetches campaign metrics from the database.
   */
  private async fetchCampaignMetrics(campaignId: string): Promise<Record<string, unknown>> {
    try {
      const result = await pool.query(
        `SELECT
           c.id,
           c.budget,
           c.spent,
           m.impressions,
           m.clicks,
           m.conversions,
           m.ctr,
           m.cpc,
           m.cpa,
           m.roas,
           CASE WHEN m.clicks > 0 THEN (m.conversions::float / m.clicks) * 100 ELSE 0 END AS conversion_rate
         FROM campaigns c
         LEFT JOIN campaign_metrics m ON m.campaign_id = c.id
         WHERE c.id = $1`,
        [campaignId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0] as Record<string, unknown>;
    } catch (error) {
      this.log.warn('Failed to fetch campaign metrics', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Fetches traffic analytics data for bot detection.
   */
  private async fetchTrafficAnalytics(campaignId: string): Promise<Record<string, unknown>> {
    try {
      const result = await pool.query(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (session_end - session_start))) AS avg_session_duration,
           AVG(CASE WHEN page_views = 1 THEN 100 ELSE 0 END) AS bounce_rate,
           AVG(CASE WHEN interactions > 0 THEN 100 ELSE 0 END) AS interaction_rate,
           COUNT(DISTINCT user_agent) AS unique_user_agents,
           COUNT(*) AS total_sessions,
           AVG(CASE WHEN is_datacenter_ip = true THEN 100 ELSE 0 END) AS datacenter_ip_ratio
         FROM traffic_analytics
         WHERE campaign_id = $1`,
        [campaignId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      return result.rows[0] as Record<string, unknown>;
    } catch (error) {
      this.log.warn('Failed to fetch traffic analytics', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Fetches historical baseline statistics for a campaign's metrics.
   */
  private async fetchHistoricalBaseline(
    campaignId: string,
  ): Promise<Record<string, { mean: number; stdDev: number }>> {
    try {
      const result = await pool.query(
        `SELECT
           AVG(ctr) AS mean_ctr,
           STDDEV(ctr) AS stddev_ctr,
           AVG(cpc) AS mean_cpc,
           STDDEV(cpc) AS stddev_cpc,
           AVG(cpa) AS mean_cpa,
           STDDEV(cpa) AS stddev_cpa,
           AVG(roas) AS mean_roas,
           STDDEV(roas) AS stddev_roas,
           AVG(CASE WHEN clicks > 0 THEN (conversions::float / clicks) * 100 ELSE 0 END) AS mean_conversion_rate,
           STDDEV(CASE WHEN clicks > 0 THEN (conversions::float / clicks) * 100 ELSE 0 END) AS stddev_conversion_rate
         FROM campaign_metrics_history
         WHERE campaign_id = $1`,
        [campaignId],
      );

      if (result.rows.length === 0) {
        return {};
      }

      const row = result.rows[0];
      const baseline: Record<string, { mean: number; stdDev: number }> = {};

      const metrics = ['ctr', 'cpc', 'cpa', 'roas', 'conversion_rate'] as const;
      for (const metric of metrics) {
        const mean = parseFloat(String(row[`mean_${metric}`]));
        const stdDev = parseFloat(String(row[`stddev_${metric}`]));
        if (!isNaN(mean) && !isNaN(stdDev)) {
          baseline[metric] = { mean, stdDev };
        }
      }

      return baseline;
    } catch (error) {
      this.log.warn('Failed to fetch historical baseline', {
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Fetches a budget allocation record.
   */
  private async fetchBudgetAllocation(allocationId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        `SELECT id, country_id, channel_allocations, period_start, period_end,
                total_budget, total_spent, risk_guardrails, created_by, created_at, updated_at
         FROM budget_allocations
         WHERE id = $1`,
        [allocationId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as Record<string, unknown>;
    } catch (error) {
      this.log.error('Failed to fetch budget allocation', {
        allocationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetches spend records for a budget allocation.
   */
  private async fetchSpendRecords(allocationId: string): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        `SELECT id, allocation_id, channel, amount, date, created_at
         FROM spend_records
         WHERE allocation_id = $1
         ORDER BY date ASC`,
        [allocationId],
      );

      return result.rows as Record<string, unknown>[];
    } catch (error) {
      this.log.warn('Failed to fetch spend records', {
        allocationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Maps a fraud score to a severity level.
   */
  private scoreSeverity(fraudScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (fraudScore >= SEVERITY_THRESHOLDS.critical) return 'critical';
    if (fraudScore >= SEVERITY_THRESHOLDS.high) return 'high';
    if (fraudScore >= SEVERITY_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Uses AI to generate a contextual fraud recommendation.
   */
  private async generateFraudRecommendation(
    campaignId: string,
    fraudScore: number,
    signals: FraudSignal[],
  ): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    const suspiciousSignals = signals.filter((s) => s.suspicious);
    const userPrompt = `Based on the following fraud analysis, provide a concise recommendation (2-3 sentences).

Campaign ID: ${campaignId}
Fraud Score: ${fraudScore}/100
Suspicious Signals: ${suspiciousSignals.length}/${signals.length}
Signal Details:
${signals.map((s) => `- ${s.type}: value=${s.value}, threshold=${s.threshold}, suspicious=${s.suspicious}`).join('\n')}

Respond with plain text, not JSON.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    return response.trim();
  }

  /**
   * Generates a deterministic fallback recommendation when AI is unavailable.
   */
  private generateFallbackRecommendation(
    fraudScore: number,
    signals: FraudSignal[],
  ): string {
    const suspiciousCount = signals.filter((s) => s.suspicious).length;

    if (fraudScore >= AUTO_BLOCK_THRESHOLD) {
      return `Campaign auto-blocked: fraud score ${fraudScore}/100 with ${suspiciousCount} suspicious signal(s). Immediate investigation required — review click sources and disable suspicious placements.`;
    }
    if (fraudScore >= SEVERITY_THRESHOLDS.high) {
      return `High fraud risk detected (score: ${fraudScore}/100). Review ${suspiciousCount} suspicious signal(s) and consider pausing the campaign until investigation is complete.`;
    }
    if (fraudScore >= SEVERITY_THRESHOLDS.medium) {
      return `Moderate fraud indicators detected (score: ${fraudScore}/100). Monitor closely and investigate ${suspiciousCount} flagged signal(s).`;
    }
    return `Low fraud risk (score: ${fraudScore}/100). Continue monitoring; no immediate action required.`;
  }
}

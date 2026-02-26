/**
 * Final Output Deliverable #8: System-Wide Confidence Score (0-100).
 *
 * Aggregates confidence scores from all 20 agents into a single weighted
 * system-wide score, provides per-agent breakdowns, category rollups,
 * historical trend data, and low-confidence alerts.
 *
 * All data is sourced from the `agent_states` and `agent_decisions` tables --
 * no hardcoded values or fake data.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { AgentType } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SystemGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AgentScoreEntry {
  agent_id: string;
  agent_name: string;
  confidence_score: number;
  last_updated: string;
  data_quality_score: number;
  decision_count: number;
  uncertainty_flags: string[];
}

export interface CategoryScores {
  market_intelligence: number;
  advertising: number;
  content_creative: number;
  analytics_budget: number;
  testing_conversion: number;
  integrations: number;
  compliance_security: number;
  infrastructure: number;
  orchestration: number;
}

export interface ScoreTrendEntry {
  date: string;
  score: number;
}

export interface LowConfidenceAlert {
  agent_id: string;
  agent_name: string;
  score: number;
  reason: string;
  recommended_action: string;
}

export interface SystemConfidenceResult {
  system_score: number;
  system_grade: SystemGrade;
  agent_scores: AgentScoreEntry[];
  category_scores: CategoryScores;
  score_trend: ScoreTrendEntry[];
  low_confidence_alerts: LowConfidenceAlert[];
  methodology: string;
  generated_at: string;
}

export interface AgentConfidenceBreakdown {
  agent_id: string;
  agent_name: string;
  agent_type: AgentType;
  confidence_score: number;
  data_quality_score: number;
  decision_count: number;
  recent_decisions: Array<{
    id: string;
    decision_type: string;
    confidence_score: number;
    created_at: string;
  }>;
  uncertainty_flags: string[];
  last_updated: string;
}

export interface ConfidenceTrendResult {
  days: number;
  trend: ScoreTrendEntry[];
  average_score: number;
  min_score: number;
  max_score: number;
}

// ---------------------------------------------------------------------------
// Agent metadata: human-readable names + importance weights
// ---------------------------------------------------------------------------

/** Human-readable display names for each agent type */
const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  market_intelligence: 'Market Intelligence',
  country_strategy: 'Country Strategy',
  paid_ads: 'Paid Ads',
  organic_social: 'Organic Social',
  content_blog: 'Content & Blog',
  creative_generation: 'Creative Generation',
  performance_analytics: 'Performance Analytics',
  budget_optimization: 'Budget Optimization',
  ab_testing: 'A/B Testing',
  conversion_optimization: 'Conversion Optimization',
  shopify_integration: 'Shopify Integration',
  localization: 'Localization',
  compliance: 'Compliance',
  competitive_intelligence: 'Competitive Intelligence',
  fraud_detection: 'Fraud Detection',
  brand_consistency: 'Brand Consistency',
  data_engineering: 'Data Engineering',
  enterprise_security: 'Enterprise Security',
  revenue_forecasting: 'Revenue Forecasting',
  master_orchestrator: 'Master Orchestrator',
};

/**
 * Importance weights for the system-wide weighted average.
 * The orchestrator and core strategy agents carry more weight than
 * supporting / peripheral agents. All values are relative -- the code
 * normalises by the sum of active weights.
 */
const AGENT_WEIGHTS: Record<AgentType, number> = {
  master_orchestrator: 3.0,
  market_intelligence: 2.0,
  country_strategy: 2.0,
  performance_analytics: 2.0,
  budget_optimization: 2.0,
  revenue_forecasting: 2.0,
  paid_ads: 1.5,
  organic_social: 1.5,
  content_blog: 1.5,
  creative_generation: 1.5,
  ab_testing: 1.5,
  conversion_optimization: 1.5,
  competitive_intelligence: 1.5,
  compliance: 1.5,
  fraud_detection: 1.5,
  shopify_integration: 1.0,
  localization: 1.0,
  brand_consistency: 1.0,
  data_engineering: 1.0,
  enterprise_security: 1.0,
};

/**
 * Maps each agent type to one of the nine reporting categories.
 */
const CATEGORY_MAP: Record<AgentType, keyof CategoryScores> = {
  market_intelligence: 'market_intelligence',
  country_strategy: 'market_intelligence',
  competitive_intelligence: 'market_intelligence',
  paid_ads: 'advertising',
  organic_social: 'advertising',
  content_blog: 'content_creative',
  creative_generation: 'content_creative',
  localization: 'content_creative',
  performance_analytics: 'analytics_budget',
  budget_optimization: 'analytics_budget',
  revenue_forecasting: 'analytics_budget',
  ab_testing: 'testing_conversion',
  conversion_optimization: 'testing_conversion',
  shopify_integration: 'integrations',
  compliance: 'compliance_security',
  fraud_detection: 'compliance_security',
  enterprise_security: 'compliance_security',
  brand_consistency: 'infrastructure',
  data_engineering: 'infrastructure',
  master_orchestrator: 'orchestration',
};

/** Threshold below which an agent triggers a low-confidence alert */
const LOW_CONFIDENCE_THRESHOLD = 50;

/** Cache settings */
const CACHE_PREFIX = 'final-outputs:confidence';
const CACHE_TTL = 60; // 1 minute

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a numeric score (0-100) to a letter grade.
 */
export function scoreToGrade(score: number): SystemGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ConfidenceScoreOutputService {
  // -----------------------------------------------------------------------
  // 1. System-wide confidence score
  // -----------------------------------------------------------------------

  /**
   * Aggregates confidence scores from all 20 agents, computes a weighted
   * system-wide score (0-100), and returns the full breakdown.
   */
  static async generateSystemConfidenceScore(): Promise<SystemConfidenceResult> {
    const cacheKey = `${CACHE_PREFIX}:system`;
    const cached = await cacheGet<SystemConfidenceResult>(cacheKey);
    if (cached) {
      logger.debug('System confidence score cache hit');
      return cached;
    }

    logger.info('Generating system-wide confidence score');

    // ------ Fetch latest confidence per agent from agent_decisions ------
    const latestDecisionsResult = await pool.query<{
      agent_type: string;
      confidence_score: string;
      last_updated: string;
      decision_count: string;
    }>(`
      SELECT
        ad.agent_type,
        ad.confidence_score::text AS confidence_score,
        ad.created_at            AS last_updated,
        cnt.decision_count::text AS decision_count
      FROM agent_decisions ad
      INNER JOIN (
        SELECT agent_type, MAX(created_at) AS max_created_at, COUNT(*)::text AS decision_count
        FROM agent_decisions
        GROUP BY agent_type
      ) cnt ON cnt.agent_type = ad.agent_type AND cnt.max_created_at = ad.created_at
    `);

    // Build a map: agent_type -> row data
    const agentDataMap = new Map<
      string,
      { confidence_score: number; last_updated: string; decision_count: number }
    >();

    for (const row of latestDecisionsResult.rows) {
      agentDataMap.set(row.agent_type, {
        confidence_score: parseFloat(row.confidence_score) || 0,
        last_updated: row.last_updated,
        decision_count: parseInt(row.decision_count, 10) || 0,
      });
    }

    // ------ Fetch data quality from agent_states metrics ------
    const statesResult = await pool.query<{
      agent_type: string;
      metrics: Record<string, unknown>;
      updated_at: string;
    }>(`
      SELECT agent_type, metrics, updated_at
      FROM agent_states
    `);

    const stateMap = new Map<
      string,
      { metrics: Record<string, unknown>; updated_at: string }
    >();
    for (const row of statesResult.rows) {
      stateMap.set(row.agent_type, {
        metrics: row.metrics ?? {},
        updated_at: row.updated_at,
      });
    }

    // ------ Fetch uncertainty flags from recent decisions ------
    const uncertaintyResult = await pool.query<{
      agent_type: string;
      output_data: Record<string, unknown>;
    }>(`
      SELECT ad.agent_type, ad.output_data
      FROM agent_decisions ad
      INNER JOIN (
        SELECT agent_type, MAX(created_at) AS max_created_at
        FROM agent_decisions
        GROUP BY agent_type
      ) latest ON latest.agent_type = ad.agent_type AND latest.max_created_at = ad.created_at
    `);

    const uncertaintyMap = new Map<string, string[]>();
    for (const row of uncertaintyResult.rows) {
      const outputData = row.output_data ?? {};
      const flags: string[] = [];
      if (Array.isArray(outputData.uncertainties)) {
        flags.push(...(outputData.uncertainties as string[]));
      }
      if (Array.isArray(outputData.warnings)) {
        flags.push(...(outputData.warnings as string[]));
      }
      uncertaintyMap.set(row.agent_type, flags);
    }

    // ------ Build per-agent score entries ------
    const allAgentTypes = Object.keys(AGENT_DISPLAY_NAMES) as AgentType[];
    const agentScores: AgentScoreEntry[] = [];

    for (const agentType of allAgentTypes) {
      const decisionData = agentDataMap.get(agentType);
      const stateData = stateMap.get(agentType);
      const uncertainties = uncertaintyMap.get(agentType) ?? [];

      const confidenceScore = decisionData?.confidence_score ?? 0;
      const lastUpdated =
        decisionData?.last_updated ?? stateData?.updated_at ?? new Date().toISOString();
      const decisionCount = decisionData?.decision_count ?? 0;

      // Extract data_quality_score from agent state metrics if available
      const metrics = stateData?.metrics ?? {};
      const dataQualityScore =
        typeof metrics.data_quality_score === 'number'
          ? metrics.data_quality_score
          : typeof metrics.data_quality === 'number'
            ? metrics.data_quality
            : 0;

      agentScores.push({
        agent_id: agentType,
        agent_name: AGENT_DISPLAY_NAMES[agentType],
        confidence_score: Math.round(confidenceScore * 100) / 100,
        last_updated: lastUpdated,
        data_quality_score: Math.round(dataQualityScore * 100) / 100,
        decision_count: decisionCount,
        uncertainty_flags: uncertainties,
      });
    }

    // ------ Compute weighted system score ------
    let weightedSum = 0;
    let totalWeight = 0;

    for (const entry of agentScores) {
      const weight = AGENT_WEIGHTS[entry.agent_id as AgentType] ?? 1;
      weightedSum += entry.confidence_score * weight;
      totalWeight += weight;
    }

    const systemScore =
      totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : 0;

    // ------ Compute category scores ------
    const categoryAccumulators: Record<keyof CategoryScores, { sum: number; count: number }> = {
      market_intelligence: { sum: 0, count: 0 },
      advertising: { sum: 0, count: 0 },
      content_creative: { sum: 0, count: 0 },
      analytics_budget: { sum: 0, count: 0 },
      testing_conversion: { sum: 0, count: 0 },
      integrations: { sum: 0, count: 0 },
      compliance_security: { sum: 0, count: 0 },
      infrastructure: { sum: 0, count: 0 },
      orchestration: { sum: 0, count: 0 },
    };

    for (const entry of agentScores) {
      const category = CATEGORY_MAP[entry.agent_id as AgentType];
      if (category) {
        categoryAccumulators[category].sum += entry.confidence_score;
        categoryAccumulators[category].count += 1;
      }
    }

    const categoryScores: CategoryScores = {
      market_intelligence: 0,
      advertising: 0,
      content_creative: 0,
      analytics_budget: 0,
      testing_conversion: 0,
      integrations: 0,
      compliance_security: 0,
      infrastructure: 0,
      orchestration: 0,
    };

    for (const [cat, acc] of Object.entries(categoryAccumulators)) {
      (categoryScores as unknown as Record<string, number>)[cat] =
        acc.count > 0 ? Math.round((acc.sum / acc.count) * 100) / 100 : 0;
    }

    // ------ Fetch score trend (last 30 days) ------
    const scoreTrend = await ConfidenceScoreOutputService.fetchTrendFromDb(30);

    // ------ Low confidence alerts ------
    const lowConfidenceAlerts: LowConfidenceAlert[] = [];

    for (const entry of agentScores) {
      if (entry.confidence_score > 0 && entry.confidence_score < LOW_CONFIDENCE_THRESHOLD) {
        const reason =
          entry.decision_count === 0
            ? 'No decisions recorded'
            : `Confidence score ${entry.confidence_score} is below threshold of ${LOW_CONFIDENCE_THRESHOLD}`;

        const recommendedAction =
          entry.data_quality_score < 50
            ? 'Improve data quality inputs for this agent'
            : 'Review recent decisions and recalibrate agent parameters';

        lowConfidenceAlerts.push({
          agent_id: entry.agent_id,
          agent_name: entry.agent_name,
          score: entry.confidence_score,
          reason,
          recommended_action: recommendedAction,
        });
      }
    }

    // Also flag agents with zero decisions but present in states
    for (const entry of agentScores) {
      if (
        entry.confidence_score === 0 &&
        entry.decision_count === 0 &&
        stateMap.has(entry.agent_id)
      ) {
        const alreadyFlagged = lowConfidenceAlerts.some(
          (a) => a.agent_id === entry.agent_id,
        );
        if (!alreadyFlagged) {
          lowConfidenceAlerts.push({
            agent_id: entry.agent_id,
            agent_name: entry.agent_name,
            score: 0,
            reason: 'Agent has not produced any decisions yet',
            recommended_action: 'Trigger an initial agent run to establish baseline confidence',
          });
        }
      }
    }

    const result: SystemConfidenceResult = {
      system_score: systemScore,
      system_grade: scoreToGrade(systemScore),
      agent_scores: agentScores,
      category_scores: categoryScores,
      score_trend: scoreTrend,
      low_confidence_alerts: lowConfidenceAlerts,
      methodology:
        'Weighted average of all 20 agent confidence scores. Weights reflect agent importance: ' +
        'orchestrator (3.0), core strategy & analytics agents (2.0), execution agents (1.5), ' +
        'supporting agents (1.0). Individual agent scores are derived from the most recent ' +
        'agent_decisions confidence_score. Category scores are unweighted averages of member agents. ' +
        'Low-confidence alerts trigger when an agent score falls below 50.',
      generated_at: new Date().toISOString(),
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('System confidence score generated', {
      systemScore,
      grade: result.system_grade,
      agentCount: agentScores.length,
      alertCount: lowConfidenceAlerts.length,
    });

    return result;
  }

  // -----------------------------------------------------------------------
  // 2. Per-agent confidence breakdown
  // -----------------------------------------------------------------------

  /**
   * Returns a detailed confidence breakdown for a single agent.
   */
  static async getAgentConfidence(
    agentId: string,
  ): Promise<AgentConfidenceBreakdown> {
    const cacheKey = `${CACHE_PREFIX}:agent:${agentId}`;
    const cached = await cacheGet<AgentConfidenceBreakdown>(cacheKey);
    if (cached) {
      logger.debug('Agent confidence cache hit', { agentId });
      return cached;
    }

    const agentType = agentId as AgentType;
    const displayName =
      AGENT_DISPLAY_NAMES[agentType] ?? agentId;

    // Fetch recent decisions for this agent
    const decisionsResult = await pool.query<{
      id: string;
      decision_type: string;
      confidence_score: string;
      created_at: string;
      output_data: Record<string, unknown>;
    }>(
      `SELECT id, decision_type, confidence_score::text, created_at, output_data
       FROM agent_decisions
       WHERE agent_type = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [agentId],
    );

    const recentDecisions = decisionsResult.rows.map((row) => ({
      id: row.id,
      decision_type: row.decision_type,
      confidence_score: parseFloat(row.confidence_score) || 0,
      created_at: row.created_at,
    }));

    const latestDecision = decisionsResult.rows[0];
    const confidenceScore = latestDecision
      ? parseFloat(latestDecision.confidence_score) || 0
      : 0;

    // Extract uncertainty flags from latest decision
    const uncertaintyFlags: string[] = [];
    if (latestDecision?.output_data) {
      const od = latestDecision.output_data;
      if (Array.isArray(od.uncertainties)) {
        uncertaintyFlags.push(...(od.uncertainties as string[]));
      }
      if (Array.isArray(od.warnings)) {
        uncertaintyFlags.push(...(od.warnings as string[]));
      }
    }

    // Fetch state metrics for data quality
    const stateResult = await pool.query<{
      metrics: Record<string, unknown>;
      updated_at: string;
    }>(
      `SELECT metrics, updated_at FROM agent_states WHERE agent_type = $1`,
      [agentId],
    );

    const stateRow = stateResult.rows[0];
    const metrics = stateRow?.metrics ?? {};
    const dataQualityScore =
      typeof metrics.data_quality_score === 'number'
        ? metrics.data_quality_score
        : typeof metrics.data_quality === 'number'
          ? metrics.data_quality
          : 0;

    const lastUpdated =
      latestDecision?.created_at ?? stateRow?.updated_at ?? new Date().toISOString();

    const result: AgentConfidenceBreakdown = {
      agent_id: agentId,
      agent_name: displayName,
      agent_type: agentType,
      confidence_score: Math.round(confidenceScore * 100) / 100,
      data_quality_score: Math.round(dataQualityScore * 100) / 100,
      decision_count: decisionsResult.rows.length,
      recent_decisions: recentDecisions,
      uncertainty_flags: uncertaintyFlags,
      last_updated: lastUpdated,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Agent confidence breakdown generated', { agentId, confidenceScore });

    return result;
  }

  // -----------------------------------------------------------------------
  // 3. Historical confidence trend
  // -----------------------------------------------------------------------

  /**
   * Returns the historical system confidence trend over the specified
   * number of days.
   */
  static async getConfidenceTrend(
    days: number = 30,
  ): Promise<ConfidenceTrendResult> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(days)));

    const cacheKey = `${CACHE_PREFIX}:trend:${safeDays}`;
    const cached = await cacheGet<ConfidenceTrendResult>(cacheKey);
    if (cached) {
      logger.debug('Confidence trend cache hit', { days: safeDays });
      return cached;
    }

    const trend = await ConfidenceScoreOutputService.fetchTrendFromDb(safeDays);

    let avgScore = 0;
    let minScore = 100;
    let maxScore = 0;

    if (trend.length > 0) {
      let sum = 0;
      for (const entry of trend) {
        sum += entry.score;
        if (entry.score < minScore) minScore = entry.score;
        if (entry.score > maxScore) maxScore = entry.score;
      }
      avgScore = Math.round((sum / trend.length) * 100) / 100;
    } else {
      minScore = 0;
    }

    const result: ConfidenceTrendResult = {
      days: safeDays,
      trend,
      average_score: avgScore,
      min_score: minScore,
      max_score: maxScore,
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Confidence trend generated', { days: safeDays, dataPoints: trend.length });

    return result;
  }

  // -----------------------------------------------------------------------
  // Private: fetch daily average confidence from agent_decisions
  // -----------------------------------------------------------------------

  /**
   * Queries agent_decisions for daily average confidence scores over the
   * specified number of past days.
   */
  private static async fetchTrendFromDb(
    days: number,
  ): Promise<ScoreTrendEntry[]> {
    const trendResult = await pool.query<{
      date: string;
      avg_score: string;
    }>(
      `SELECT
         DATE(created_at) AS date,
         AVG(confidence_score)::text AS avg_score
       FROM agent_decisions
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [days],
    );

    return trendResult.rows.map((row) => ({
      date: row.date,
      score: Math.round(parseFloat(row.avg_score) * 100) / 100,
    }));
  }
}

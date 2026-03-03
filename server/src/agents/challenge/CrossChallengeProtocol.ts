// ============================================================
// AI International Growth Engine - Cross-Challenge Protocol
// Main orchestrator for agent cross-challenge system.
// Each agent challenges at least 3 others to ensure
// comprehensive validation of decisions across the 20-agent framework.
// ============================================================

import type { AgentType } from '../../types';
import type { AgentOutput } from '../base/types';
import type {
  ChallengeMapConfig,
  ChallengeMapEntry,
  ChallengeResponse,
  ChallengeRound,
  ChallengeFinding,
  ChallengeSeverity,
  ChallengeRoundRow,
} from './types';
import { InconsistencyDetector } from './InconsistencyDetector';
import { ContradictionResolver } from './ContradictionResolver';
import { GapReporter } from './GapReporter';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

// ---- Challenge Map Configuration ----

/**
 * Static challenge map defining which agents challenge which.
 * Every agent challenges at least 3 others, selected based on domain overlap
 * and cross-cutting concerns to maximize the value of peer review.
 *
 * The focus areas specify what each challenger should scrutinize about its targets.
 */
const CHALLENGE_MAP_CONFIG: ChallengeMapConfig = [
  {
    challenger: 'market_intelligence',
    targets: ['country_strategy', 'competitive_intelligence', 'revenue_forecasting'],
    focusAreas: {
      country_strategy: ['market_data_accuracy', 'demand_signals', 'risk_assessment'],
      competitive_intelligence: ['market_share_estimates', 'trend_validation', 'data_freshness'],
      revenue_forecasting: ['market_size_assumptions', 'growth_rate_basis', 'regional_accuracy'],
    },
  },
  {
    challenger: 'country_strategy',
    targets: ['market_intelligence', 'localization', 'compliance'],
    focusAreas: {
      market_intelligence: ['country_relevance', 'cultural_context', 'local_market_dynamics'],
      localization: ['strategy_alignment', 'cultural_accuracy', 'market_priority'],
      compliance: ['regulatory_completeness', 'country_specific_rules', 'risk_coverage'],
    },
  },
  {
    challenger: 'paid_ads',
    targets: ['budget_optimization', 'creative_generation', 'conversion_optimization'],
    focusAreas: {
      budget_optimization: ['budget_allocation_accuracy', 'channel_split', 'spend_efficiency'],
      creative_generation: ['ad_format_compatibility', 'platform_specs', 'cta_effectiveness'],
      conversion_optimization: ['funnel_alignment', 'landing_page_relevance', 'cpc_assumptions'],
    },
  },
  {
    challenger: 'organic_social',
    targets: ['content_blog', 'creative_generation', 'brand_consistency'],
    focusAreas: {
      content_blog: ['content_strategy_alignment', 'audience_overlap', 'posting_cadence'],
      creative_generation: ['platform_suitability', 'engagement_potential', 'visual_consistency'],
      brand_consistency: ['tone_alignment', 'visual_identity', 'messaging_coherence'],
    },
  },
  {
    challenger: 'content_blog',
    targets: ['organic_social', 'localization', 'brand_consistency'],
    focusAreas: {
      organic_social: ['content_repurpose_potential', 'audience_alignment', 'distribution_strategy'],
      localization: ['translation_quality', 'cultural_relevance', 'seo_preservation'],
      brand_consistency: ['editorial_guidelines', 'voice_consistency', 'content_standards'],
    },
  },
  {
    challenger: 'creative_generation',
    targets: ['paid_ads', 'organic_social', 'brand_consistency'],
    focusAreas: {
      paid_ads: ['creative_performance_data', 'format_utilization', 'fatigue_indicators'],
      organic_social: ['visual_engagement', 'platform_optimization', 'content_variety'],
      brand_consistency: ['brand_guideline_adherence', 'visual_identity_match', 'tone_accuracy'],
    },
  },
  {
    challenger: 'performance_analytics',
    targets: ['revenue_forecasting', 'paid_ads', 'ab_testing'],
    focusAreas: {
      revenue_forecasting: ['metric_accuracy', 'historical_trend_validation', 'prediction_basis'],
      paid_ads: ['kpi_tracking', 'attribution_accuracy', 'performance_benchmarks'],
      ab_testing: ['statistical_validity', 'sample_size_adequacy', 'metric_selection'],
    },
  },
  {
    challenger: 'budget_optimization',
    targets: ['paid_ads', 'revenue_forecasting', 'shopify_integration'],
    focusAreas: {
      paid_ads: ['spend_compliance', 'roas_targets', 'budget_pacing'],
      revenue_forecasting: ['revenue_assumptions', 'budget_return_correlation', 'spend_projections'],
      shopify_integration: ['revenue_tracking_accuracy', 'order_value_alignment', 'cost_attribution'],
    },
  },
  {
    challenger: 'ab_testing',
    targets: ['performance_analytics', 'conversion_optimization', 'creative_generation'],
    focusAreas: {
      performance_analytics: ['metric_definitions', 'data_collection_gaps', 'baseline_accuracy'],
      conversion_optimization: ['hypothesis_validity', 'test_isolation', 'variant_design'],
      creative_generation: ['creative_variant_diversity', 'test_asset_quality', 'iteration_cycle'],
    },
  },
  {
    challenger: 'conversion_optimization',
    targets: ['paid_ads', 'shopify_integration', 'ab_testing'],
    focusAreas: {
      paid_ads: ['landing_page_alignment', 'funnel_continuity', 'offer_consistency'],
      shopify_integration: ['checkout_flow', 'cart_abandonment_factors', 'ux_friction'],
      ab_testing: ['conversion_metric_selection', 'test_prioritization', 'impact_estimation'],
    },
  },
  {
    challenger: 'shopify_integration',
    targets: ['budget_optimization', 'conversion_optimization', 'data_engineering'],
    focusAreas: {
      budget_optimization: ['revenue_data_accuracy', 'order_attribution', 'ltv_calculations'],
      conversion_optimization: ['product_page_performance', 'inventory_impact', 'pricing_effects'],
      data_engineering: ['data_sync_reliability', 'schema_consistency', 'event_tracking'],
    },
  },
  {
    challenger: 'localization',
    targets: ['content_blog', 'country_strategy', 'creative_generation'],
    focusAreas: {
      content_blog: ['language_accuracy', 'cultural_adaptation', 'local_seo_impact'],
      country_strategy: ['cultural_sensitivity', 'local_market_nuance', 'language_market_fit'],
      creative_generation: ['visual_cultural_fit', 'copy_adaptation', 'color_symbolism'],
    },
  },
  {
    challenger: 'compliance',
    targets: ['paid_ads', 'content_blog', 'data_engineering'],
    focusAreas: {
      paid_ads: ['ad_policy_compliance', 'disclosure_requirements', 'targeting_restrictions'],
      content_blog: ['content_regulations', 'disclosure_requirements', 'privacy_compliance'],
      data_engineering: ['data_privacy_compliance', 'consent_management', 'data_retention'],
    },
  },
  {
    challenger: 'competitive_intelligence',
    targets: ['market_intelligence', 'paid_ads', 'content_blog'],
    focusAreas: {
      market_intelligence: ['competitor_coverage', 'market_positioning', 'threat_assessment'],
      paid_ads: ['competitive_spend_analysis', 'keyword_overlap', 'position_defense'],
      content_blog: ['content_gap_analysis', 'share_of_voice', 'topic_coverage'],
    },
  },
  {
    challenger: 'fraud_detection',
    targets: ['paid_ads', 'performance_analytics', 'enterprise_security'],
    focusAreas: {
      paid_ads: ['click_fraud_indicators', 'bot_traffic_signals', 'spend_anomalies'],
      performance_analytics: ['metric_manipulation', 'data_integrity', 'anomaly_flagging'],
      enterprise_security: ['threat_correlation', 'attack_vector_overlap', 'incident_coverage'],
    },
  },
  {
    challenger: 'brand_consistency',
    targets: ['creative_generation', 'content_blog', 'localization'],
    focusAreas: {
      creative_generation: ['brand_guideline_violations', 'visual_drift', 'tone_drift'],
      content_blog: ['editorial_consistency', 'brand_voice_adherence', 'messaging_alignment'],
      localization: ['brand_adaptation_accuracy', 'cross_market_consistency', 'core_message_retention'],
    },
  },
  {
    challenger: 'data_engineering',
    targets: ['performance_analytics', 'shopify_integration', 'enterprise_security'],
    focusAreas: {
      performance_analytics: ['data_pipeline_health', 'ingestion_completeness', 'transformation_accuracy'],
      shopify_integration: ['sync_reliability', 'data_freshness', 'schema_validation'],
      enterprise_security: ['data_access_controls', 'encryption_compliance', 'audit_trail_coverage'],
    },
  },
  {
    challenger: 'enterprise_security',
    targets: ['compliance', 'data_engineering', 'fraud_detection'],
    focusAreas: {
      compliance: ['security_regulation_coverage', 'incident_response_readiness', 'access_controls'],
      data_engineering: ['infrastructure_security', 'pipeline_vulnerability', 'secret_management'],
      fraud_detection: ['detection_coverage', 'false_positive_rate', 'response_time'],
    },
  },
  {
    challenger: 'revenue_forecasting',
    targets: ['market_intelligence', 'budget_optimization', 'performance_analytics'],
    focusAreas: {
      market_intelligence: ['demand_forecast_inputs', 'market_growth_assumptions', 'seasonality_data'],
      budget_optimization: ['roi_projection_alignment', 'spend_efficiency_forecast', 'budget_ceiling_impact'],
      performance_analytics: ['historical_trend_reliability', 'metric_forecast_alignment', 'data_recency'],
    },
  },
  {
    challenger: 'master_orchestrator',
    targets: ['revenue_forecasting', 'country_strategy', 'budget_optimization', 'compliance'],
    focusAreas: {
      revenue_forecasting: ['system_wide_projection_consistency', 'cross_agent_alignment', 'risk_factor_coverage'],
      country_strategy: ['global_strategy_coherence', 'priority_ranking_justification', 'resource_feasibility'],
      budget_optimization: ['overall_budget_coherence', 'cross_channel_balance', 'guardrail_adequacy'],
      compliance: ['global_compliance_coverage', 'cross_border_issues', 'regulation_update_currency'],
    },
  },
];

/**
 * Maximum number of challenge rounds before forcing convergence.
 * Prevents infinite loops when agents continue to find new issues.
 */
const MAX_CHALLENGE_ROUNDS = 5;

/**
 * Threshold below which a round is considered converged.
 * If the number of critical findings in a round drops to this count or lower,
 * the cycle stops.
 */
const CONVERGENCE_CRITICAL_THRESHOLD = 0;

// ---- CrossChallengeProtocol Class ----

/**
 * Main orchestrator for the cross-challenge system.
 *
 * Manages the lifecycle of challenge rounds, coordinating the InconsistencyDetector,
 * ContradictionResolver, and GapReporter to ensure that agent decisions are
 * thoroughly validated before execution.
 *
 * @example
 * ```typescript
 * const protocol = new CrossChallengeProtocol();
 * const outputs = new Map<AgentType, AgentOutput>();
 * // ... populate outputs from agent executions ...
 * const rounds = await protocol.executeFullCycle(outputs);
 * ```
 */
export class CrossChallengeProtocol {
  private readonly inconsistencyDetector: InconsistencyDetector;
  private readonly contradictionResolver: ContradictionResolver;
  private readonly gapReporter: GapReporter;
  private readonly challengeMap: Map<AgentType, ChallengeMapEntry>;

  constructor() {
    this.inconsistencyDetector = new InconsistencyDetector();
    this.contradictionResolver = new ContradictionResolver();
    this.gapReporter = new GapReporter();
    this.challengeMap = new Map();

    for (const entry of CHALLENGE_MAP_CONFIG) {
      this.challengeMap.set(entry.challenger, entry);
    }

    logger.info('CrossChallengeProtocol initialized', {
      agentCount: this.challengeMap.size,
      totalChallengeLinks: CHALLENGE_MAP_CONFIG.reduce((sum, e) => sum + e.targets.length, 0),
    });
  }

  /**
   * Returns the challenge map as a simple mapping of challenger to target agent types.
   * Each agent challenges at least 3 others.
   *
   * @returns Map where keys are challengers and values are arrays of agents they challenge
   */
  getChallengeMap(): Map<AgentType, AgentType[]> {
    const map = new Map<AgentType, AgentType[]>();
    for (const [challenger, entry] of this.challengeMap) {
      map.set(challenger, [...entry.targets]);
    }
    return map;
  }

  /**
   * Executes a single challenge round across all agents.
   *
   * For each challenger in the challenge map, this method invokes challengeAgent
   * against all of its targets (provided those targets have outputs). After all
   * challenges complete, it runs inconsistency detection and gap analysis.
   *
   * @param outputs - Map of all agent outputs from the current execution cycle
   * @param roundNumber - The sequential round number
   * @returns A complete ChallengeRound with all findings, inconsistencies, and gaps
   */
  async executeChallengeRound(
    outputs: Map<AgentType, AgentOutput>,
    roundNumber: number = 1,
  ): Promise<ChallengeRound> {
    logger.info('Executing challenge round', { roundNumber, agentOutputCount: outputs.size });

    const challenges: ChallengeResponse[] = [];

    // Run all challenges in parallel per challenger
    const challengePromises: Promise<ChallengeResponse | null>[] = [];

    for (const [challengerId, entry] of this.challengeMap) {
      // Skip challengers that did not produce output (they cannot review others)
      if (!outputs.has(challengerId)) {
        logger.warn('Challenger has no output, skipping', { challengerId });
        continue;
      }

      for (const targetId of entry.targets) {
        const targetOutput = outputs.get(targetId);
        if (!targetOutput) {
          logger.warn('Challenge target has no output, skipping', {
            challengerId,
            targetId,
          });
          continue;
        }

        challengePromises.push(
          this.challengeAgent(challengerId, targetId, targetOutput, entry.focusAreas[targetId] || [])
            .catch((err) => {
              logger.error('Challenge failed', {
                challengerId,
                targetId,
                error: err instanceof Error ? err.message : String(err),
              });
              return null;
            }),
        );
      }
    }

    const results = await Promise.all(challengePromises);
    for (const result of results) {
      if (result) {
        challenges.push(result);
      }
    }

    // Detect inconsistencies across all outputs
    const inconsistencies = this.inconsistencyDetector.detectInconsistencies(outputs);

    // Collect gaps across all outputs
    const gaps = this.gapReporter.collectGaps(outputs);

    const round: ChallengeRound = {
      roundNumber,
      challenges,
      inconsistencies,
      gaps,
      timestamp: new Date().toISOString(),
    };

    logger.info('Challenge round completed', {
      roundNumber,
      challengeCount: challenges.length,
      inconsistencyCount: inconsistencies.length,
      gapCount: gaps.length,
      criticalFindings: challenges.reduce(
        (count, c) => count + c.findings.filter((f) => f.severity === 'critical').length,
        0,
      ),
    });

    return round;
  }

  /**
   * Performs a challenge from one agent against another agent's output.
   *
   * Analyzes the target output through the lens of the challenger's domain,
   * looking for issues in the specified focus areas. This method evaluates
   * the output's data, confidence, reasoning, and recommendations.
   *
   * @param challengerId - The agent performing the challenge
   * @param challengedId - The agent being challenged
   * @param output - The output being challenged
   * @param focusAreas - Optional specific areas to focus the challenge on
   * @returns A ChallengeResponse with all findings
   */
  async challengeAgent(
    challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
    focusAreas: string[] = [],
  ): Promise<ChallengeResponse> {
    logger.debug('Challenging agent', { challengerId, challengedId, focusAreas });

    const findings: ChallengeFinding[] = [];

    // Evaluate confidence level
    const confidenceFindings = this.evaluateConfidence(challengerId, challengedId, output);
    findings.push(...confidenceFindings);

    // Evaluate reasoning completeness
    const reasoningFindings = this.evaluateReasoning(challengerId, challengedId, output);
    findings.push(...reasoningFindings);

    // Evaluate warnings and uncertainties
    const riskFindings = this.evaluateRisks(challengerId, challengedId, output);
    findings.push(...riskFindings);

    // Evaluate data completeness against focus areas
    const dataFindings = this.evaluateDataCompleteness(
      challengerId,
      challengedId,
      output,
      focusAreas,
    );
    findings.push(...dataFindings);

    // Evaluate recommendations feasibility
    const recommendationFindings = this.evaluateRecommendations(
      challengerId,
      challengedId,
      output,
    );
    findings.push(...recommendationFindings);

    // Determine overall severity
    const overallSeverity = this.determineOverallSeverity(findings);

    // Challenger confidence in its own review (based on how much data it had to work with)
    const reviewConfidence = this.calculateReviewConfidence(output, focusAreas);

    const response: ChallengeResponse = {
      challengerId,
      challengedId,
      findings,
      overallSeverity,
      confidence: reviewConfidence,
      resolved: findings.length === 0,
    };

    logger.debug('Challenge completed', {
      challengerId,
      challengedId,
      findingCount: findings.length,
      overallSeverity,
    });

    return response;
  }

  /**
   * Runs multiple challenge rounds until convergence or the maximum round limit.
   *
   * Convergence is reached when a round produces zero critical findings.
   * Between rounds, detected contradictions are resolved and the outputs
   * are updated with the resolutions, allowing subsequent rounds to validate
   * that issues have been addressed.
   *
   * @param outputs - Map of all agent outputs to challenge
   * @returns Array of all challenge rounds executed
   */
  async executeFullCycle(
    outputs: Map<AgentType, AgentOutput>,
  ): Promise<ChallengeRound[]> {
    logger.info('Starting full challenge cycle', { agentCount: outputs.size });

    const rounds: ChallengeRound[] = [];
    let currentOutputs = new Map(outputs);

    for (let roundNum = 1; roundNum <= MAX_CHALLENGE_ROUNDS; roundNum++) {
      const round = await this.executeChallengeRound(currentOutputs, roundNum);
      rounds.push(round);

      // Persist the round
      await this.logChallengeRound(round);

      // Check convergence: no critical findings remaining
      const criticalFindingCount = round.challenges.reduce(
        (count, c) => count + c.findings.filter((f) => f.severity === 'critical').length,
        0,
      );

      const criticalInconsistencyCount = round.inconsistencies.filter(
        (i) => i.severity === 'critical',
      ).length;

      if (
        criticalFindingCount <= CONVERGENCE_CRITICAL_THRESHOLD &&
        criticalInconsistencyCount <= CONVERGENCE_CRITICAL_THRESHOLD
      ) {
        logger.info('Challenge cycle converged', {
          roundNumber: roundNum,
          totalRounds: rounds.length,
        });
        break;
      }

      // Resolve contradictions and update outputs for next round
      if (round.inconsistencies.length > 0) {
        for (const inconsistency of round.inconsistencies) {
          const resolution = this.contradictionResolver.resolveContradiction(
            inconsistency,
            currentOutputs,
          );
          currentOutputs = this.contradictionResolver.applyResolution(
            resolution,
            currentOutputs,
          );
        }
      }

      if (roundNum === MAX_CHALLENGE_ROUNDS) {
        logger.warn('Challenge cycle reached maximum rounds without full convergence', {
          maxRounds: MAX_CHALLENGE_ROUNDS,
          remainingCriticalFindings: criticalFindingCount,
          remainingCriticalInconsistencies: criticalInconsistencyCount,
        });
      }
    }

    // Generate and persist gap report from the final round
    const finalRound = rounds[rounds.length - 1];
    if (finalRound && finalRound.gaps.length > 0) {
      const gapReport = this.gapReporter.generateGapReport(finalRound.gaps);
      await this.gapReporter.persistGapReport(gapReport);
    }

    logger.info('Full challenge cycle completed', {
      totalRounds: rounds.length,
      totalFindings: rounds.reduce(
        (sum, r) => sum + r.challenges.reduce((s, c) => s + c.findings.length, 0),
        0,
      ),
      totalInconsistencies: rounds.reduce((sum, r) => sum + r.inconsistencies.length, 0),
      totalGaps: rounds.reduce((sum, r) => sum + r.gaps.length, 0),
    });

    return rounds;
  }

  /**
   * Persists a challenge round to the database for audit trail and analysis.
   *
   * @param round - The challenge round to persist
   */
  async logChallengeRound(round: ChallengeRound): Promise<void> {
    const id = generateId();

    try {
      await pool.query<ChallengeRoundRow>(
        `INSERT INTO challenge_rounds (id, round_number, challenges_json, inconsistencies_json, gaps_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          round.roundNumber,
          JSON.stringify(round.challenges),
          JSON.stringify(round.inconsistencies),
          JSON.stringify(round.gaps),
          round.timestamp,
        ],
      );

      logger.info('Challenge round persisted', {
        id,
        roundNumber: round.roundNumber,
      });
    } catch (err) {
      logger.error('Failed to persist challenge round', {
        roundNumber: round.roundNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ---- Private Evaluation Methods ----

  /**
   * Evaluates the confidence level of a challenged output.
   * Flags low confidence scores and missing confidence factors.
   */
  private evaluateConfidence(
    _challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
  ): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    if (!output.confidence) {
      findings.push({
        area: 'confidence',
        issue: `Agent ${challengedId} produced output without a confidence score`,
        severity: 'critical',
        evidence: 'Missing confidence object in output',
        suggestedFix: 'Ensure agent always produces a confidence assessment with score and factors',
      });
      return findings;
    }

    if (output.confidence.score < 30) {
      findings.push({
        area: 'confidence',
        issue: `Agent ${challengedId} has very low confidence (${output.confidence.score}/100) in its decision`,
        severity: 'critical',
        evidence: `Confidence score: ${output.confidence.score}, level: ${output.confidence.level}`,
        suggestedFix: 'Decision should be flagged for manual review or re-processed with additional data',
      });
    } else if (output.confidence.score < 50) {
      findings.push({
        area: 'confidence',
        issue: `Agent ${challengedId} has low confidence (${output.confidence.score}/100) in its decision`,
        severity: 'warning',
        evidence: `Confidence score: ${output.confidence.score}, level: ${output.confidence.level}`,
        suggestedFix: 'Consider gathering additional data to improve decision confidence',
      });
    }

    // Check if confidence factors are present and non-empty
    if (
      !output.confidence.factors ||
      Object.keys(output.confidence.factors).length === 0
    ) {
      findings.push({
        area: 'confidence',
        issue: `Agent ${challengedId} lacks confidence factor breakdown`,
        severity: 'warning',
        evidence: 'Confidence factors are empty or missing',
        suggestedFix: 'Agent should provide individual factor scores that contribute to overall confidence',
      });
    }

    return findings;
  }

  /**
   * Evaluates the reasoning quality of a challenged output.
   * Checks for empty reasoning, overly short reasoning, and missing recommendations.
   */
  private evaluateReasoning(
    _challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
  ): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    if (!output.reasoning || output.reasoning.trim().length === 0) {
      findings.push({
        area: 'reasoning',
        issue: `Agent ${challengedId} provided no reasoning for its decision`,
        severity: 'critical',
        evidence: 'Reasoning field is empty or missing',
        suggestedFix: 'Agent must provide human-readable explanation for every decision',
      });
    } else if (output.reasoning.trim().length < 50) {
      findings.push({
        area: 'reasoning',
        issue: `Agent ${challengedId} provided insufficient reasoning (${output.reasoning.length} chars)`,
        severity: 'warning',
        evidence: `Reasoning: "${output.reasoning.substring(0, 100)}"`,
        suggestedFix: 'Reasoning should be detailed enough to justify the decision and enable review',
      });
    }

    if (!output.decision || output.decision.trim().length === 0) {
      findings.push({
        area: 'reasoning',
        issue: `Agent ${challengedId} produced output with no decision`,
        severity: 'critical',
        evidence: 'Decision field is empty or missing',
        suggestedFix: 'Every agent output must include a clear decision statement',
      });
    }

    return findings;
  }

  /**
   * Evaluates risk indicators in the challenged output.
   * Flags unaddressed warnings and high uncertainty counts.
   */
  private evaluateRisks(
    _challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
  ): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    // Flag outputs with many warnings
    if (output.warnings && output.warnings.length > 5) {
      findings.push({
        area: 'risk',
        issue: `Agent ${challengedId} raised ${output.warnings.length} warnings, indicating high risk`,
        severity: 'warning',
        evidence: `Warnings: ${output.warnings.slice(0, 3).join('; ')}${output.warnings.length > 3 ? '...' : ''}`,
        suggestedFix: 'Consider addressing warnings before executing decisions',
      });
    }

    // Flag outputs with many uncertainties
    if (output.uncertainties && output.uncertainties.length > 3) {
      findings.push({
        area: 'risk',
        issue: `Agent ${challengedId} reported ${output.uncertainties.length} uncertainties`,
        severity: 'warning',
        evidence: `Uncertainties: ${output.uncertainties.slice(0, 3).join('; ')}${output.uncertainties.length > 3 ? '...' : ''}`,
        suggestedFix: 'Gather data to reduce uncertainties before proceeding',
      });
    }

    // Flag outputs with warnings but high confidence (contradiction)
    if (
      output.warnings &&
      output.warnings.length > 2 &&
      output.confidence &&
      output.confidence.score > 85
    ) {
      findings.push({
        area: 'risk',
        issue: `Agent ${challengedId} claims high confidence (${output.confidence.score}) despite ${output.warnings.length} warnings`,
        severity: 'warning',
        evidence: `Confidence: ${output.confidence.score}, Warnings: ${output.warnings.length}`,
        suggestedFix: 'Re-evaluate confidence score to account for known warnings',
      });
    }

    return findings;
  }

  /**
   * Evaluates whether the output's data covers all specified focus areas.
   * Flags areas that have no corresponding data in the output.
   */
  private evaluateDataCompleteness(
    _challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
    focusAreas: string[],
  ): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    if (focusAreas.length === 0) {
      return findings;
    }

    const outputDataKeys = output.data ? Object.keys(output.data) : [];
    const outputDataStr = JSON.stringify(output.data || {}).toLowerCase();

    for (const area of focusAreas) {
      // Check if the focus area is represented in the output data
      const areaKey = area.toLowerCase().replace(/[_\s]/g, '');
      const hasDirectKey = outputDataKeys.some(
        (k) => k.toLowerCase().replace(/[_\s]/g, '').includes(areaKey),
      );
      const hasMentionInData = outputDataStr.includes(area.toLowerCase().replace(/_/g, ' '));
      const hasMentionInReasoning = (output.reasoning || '').toLowerCase().includes(
        area.toLowerCase().replace(/_/g, ' '),
      );

      if (!hasDirectKey && !hasMentionInData && !hasMentionInReasoning) {
        findings.push({
          area: 'data_completeness',
          issue: `Agent ${challengedId} output does not address focus area: ${area}`,
          severity: 'info',
          evidence: `Focus area "${area}" not found in output data keys or reasoning`,
          suggestedFix: `Include analysis or data related to "${area}" in the output`,
        });
      }
    }

    // Flag completely empty data
    if (!output.data || Object.keys(output.data).length === 0) {
      findings.push({
        area: 'data_completeness',
        issue: `Agent ${challengedId} produced output with no supporting data`,
        severity: 'critical',
        evidence: 'Data object is empty or missing',
        suggestedFix: 'Agent must include structured data supporting its decision',
      });
    }

    return findings;
  }

  /**
   * Evaluates the quality and feasibility of the output's recommendations.
   * Flags missing recommendations or recommendations that lack specificity.
   */
  private evaluateRecommendations(
    _challengerId: AgentType,
    challengedId: AgentType,
    output: AgentOutput,
  ): ChallengeFinding[] {
    const findings: ChallengeFinding[] = [];

    if (!output.recommendations || output.recommendations.length === 0) {
      findings.push({
        area: 'recommendations',
        issue: `Agent ${challengedId} provided no actionable recommendations`,
        severity: 'info',
        evidence: 'Recommendations array is empty or missing',
        suggestedFix: 'Include at least one actionable recommendation with each decision',
      });
    }

    // Flag very short recommendations that may lack actionability
    if (output.recommendations) {
      for (const rec of output.recommendations) {
        if (rec.trim().length < 20) {
          findings.push({
            area: 'recommendations',
            issue: `Agent ${challengedId} has a vague recommendation: "${rec}"`,
            severity: 'info',
            evidence: `Recommendation length: ${rec.length} characters`,
            suggestedFix: 'Recommendations should be specific and actionable (at least 20 characters)',
          });
          break; // Only flag once to avoid noise
        }
      }
    }

    return findings;
  }

  /**
   * Determines the highest severity among a set of findings.
   */
  private determineOverallSeverity(findings: ChallengeFinding[]): ChallengeSeverity {
    if (findings.some((f) => f.severity === 'critical')) {
      return 'critical';
    }
    if (findings.some((f) => f.severity === 'warning')) {
      return 'warning';
    }
    return 'info';
  }

  /**
   * Calculates how confident the challenger should be in its review.
   * Based on how much data was available in the target output and how many
   * focus areas could actually be evaluated.
   */
  private calculateReviewConfidence(
    output: AgentOutput,
    focusAreas: string[],
  ): number {
    let confidence = 50; // Base confidence

    // More data available -> higher confidence in the review
    const dataKeyCount = output.data ? Object.keys(output.data).length : 0;
    confidence += Math.min(dataKeyCount * 3, 20);

    // Reasoning present -> higher confidence in the review
    if (output.reasoning && output.reasoning.length > 100) {
      confidence += 10;
    } else if (output.reasoning && output.reasoning.length > 0) {
      confidence += 5;
    }

    // Focus areas provided -> more targeted review = higher confidence
    if (focusAreas.length > 0) {
      confidence += Math.min(focusAreas.length * 3, 15);
    }

    // Confidence factors present -> more context = higher confidence
    if (
      output.confidence &&
      output.confidence.factors &&
      Object.keys(output.confidence.factors).length > 0
    ) {
      confidence += 5;
    }

    return Math.min(confidence, 100);
  }
}

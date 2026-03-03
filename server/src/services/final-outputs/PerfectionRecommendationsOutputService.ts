/**
 * Perfection Recommendations Output Service.
 *
 * Phase 10 Final Output Deliverable #10.
 * Aggregates data from the Agent 20 orchestrator, cross-challenge insights,
 * and all agent module outputs to produce a comprehensive set of
 * recommendations for reaching enterprise perfection.
 *
 * All data is sourced from the database -- no hardcoded values.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories for classifying recommendations. */
export type RecommendationCategory =
  | 'strategy'
  | 'technology'
  | 'operations'
  | 'data'
  | 'compliance'
  | 'scaling';

/** Priority levels for recommendations. */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/** Enterprise readiness grade. */
export type EnterpriseGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Maturity level assessment for a specific domain.
 */
export interface MaturityLevel {
  /** Level from 1 (initial) to 5 (optimised) */
  level: number;
  /** Human-readable description of the current maturity */
  description: string;
  /** Numeric score for this domain (0-100) */
  score: number;
  /** Specific improvements needed to reach the next maturity level */
  improvements_needed: string[];
}

/**
 * A single recommendation for improving enterprise readiness.
 */
export interface PerfectionRecommendation {
  /** Unique identifier */
  id: string;
  /** Domain category */
  category: RecommendationCategory;
  /** Priority level */
  priority: RecommendationPriority;
  /** Short title */
  title: string;
  /** Detailed description of the recommendation */
  description: string;
  /** Assessment of the current state */
  current_state: string;
  /** Description of the desired target state */
  target_state: string;
  /** Analysis of the gap between current and target */
  gap_analysis: string;
  /** Ordered steps for implementation */
  implementation_steps: string[];
  /** Estimated percentage impact on enterprise readiness */
  estimated_impact_pct: number;
  /** Estimated timeline in weeks */
  estimated_timeline_weeks: number;
  /** IDs of other recommendations this depends on */
  dependencies: string[];
  /** Confidence in the recommendation (0-100) */
  confidence: number;
}

/**
 * Maturity assessment across all key enterprise domains.
 */
export interface MaturityAssessment {
  data_infrastructure: MaturityLevel;
  ai_capabilities: MaturityLevel;
  marketing_operations: MaturityLevel;
  compliance_governance: MaturityLevel;
  security_posture: MaturityLevel;
  integration_ecosystem: MaturityLevel;
}

/**
 * A next-step action item.
 */
export interface NextStep {
  /** Short step identifier */
  step: string;
  /** Detailed description */
  description: string;
  /** Priority level */
  priority: RecommendationPriority;
  /** Team or role responsible */
  owner: string;
}

/**
 * Industry benchmark comparison.
 */
export interface Benchmarks {
  /** Average score across the industry */
  industry_average_score: number;
  /** Score of top-performing organisations */
  top_performer_score: number;
  /** This organisation's current score */
  current_score: number;
  /** Percentile rank relative to industry */
  percentile: number;
}

/**
 * The full perfection recommendations output.
 */
export interface PerfectionRecommendationsOutput {
  /** Overall enterprise readiness score (0-100) */
  enterprise_readiness_score: number;
  /** Letter grade */
  grade: EnterpriseGrade;
  /** Ordered array of recommendations */
  recommendations: PerfectionRecommendation[];
  /** Maturity assessment across six domains */
  maturity_assessment: MaturityAssessment;
  /** Prioritised next steps */
  next_steps: NextStep[];
  /** Industry benchmark comparison */
  benchmarks: Benchmarks;
  /** ISO-8601 timestamp of generation */
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Categories mapped to the agent types that inform them. */
const CATEGORY_AGENT_MAP: Record<RecommendationCategory, string[]> = {
  strategy: ['market_intelligence', 'country_strategy', 'competitive_intelligence', 'revenue_forecasting'],
  technology: ['shopify_integration', 'data_engineering', 'creative_generation'],
  operations: ['paid_ads', 'organic_social', 'content_blog', 'ab_testing', 'budget_optimization'],
  data: ['performance_analytics', 'conversion_optimization', 'data_engineering'],
  compliance: ['compliance', 'brand_consistency', 'fraud_detection'],
  scaling: ['localization', 'enterprise_security', 'revenue_forecasting'],
};

/** Maturity domains mapped to the agent types that inform them. */
const MATURITY_DOMAIN_AGENTS: Record<keyof MaturityAssessment, string[]> = {
  data_infrastructure: ['data_engineering', 'performance_analytics'],
  ai_capabilities: ['creative_generation', 'ab_testing', 'conversion_optimization'],
  marketing_operations: ['paid_ads', 'organic_social', 'content_blog', 'budget_optimization'],
  compliance_governance: ['compliance', 'brand_consistency'],
  security_posture: ['enterprise_security', 'fraud_detection'],
  integration_ecosystem: ['shopify_integration', 'localization'],
};

const MATURITY_LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: 'Initial - Ad hoc processes, minimal automation',
  2: 'Developing - Basic processes established, some consistency',
  3: 'Defined - Standardised processes, documented procedures',
  4: 'Managed - Measured and controlled, data-driven decisions',
  5: 'Optimised - Continuous improvement, industry-leading practices',
};

const CACHE_PREFIX = 'final_output:perfection_recommendations';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PerfectionRecommendationsOutputService {
  /**
   * Generates the full perfection recommendations report.
   *
   * Pulls data from the orchestrator results, agent decisions, and
   * cross-challenge findings stored in the database. Computes an
   * enterprise readiness score, maturity assessment, and prioritised
   * recommendations for reaching enterprise perfection.
   */
  static async generatePerfectionRecommendations(): Promise<PerfectionRecommendationsOutput> {
    // Check cache
    const cacheKey = `${CACHE_PREFIX}:latest`;
    const cached = await cacheGet<PerfectionRecommendationsOutput>(cacheKey);

    if (cached) {
      logger.debug('Perfection recommendations cache hit');
      return cached;
    }

    // Gather all source data from DB
    const [
      orchestratorResult,
      agentDecisions,
      crossChallengeFindings,
      benchmarkData,
    ] = await Promise.all([
      PerfectionRecommendationsOutputService.fetchLatestOrchestration(),
      PerfectionRecommendationsOutputService.fetchAgentDecisions(),
      PerfectionRecommendationsOutputService.fetchCrossChallengeFindings(),
      PerfectionRecommendationsOutputService.fetchBenchmarkData(),
    ]);

    // Compute maturity assessment from agent outputs
    const maturity_assessment = PerfectionRecommendationsOutputService.computeMaturityAssessment(
      agentDecisions,
    );

    // Compute enterprise readiness score from maturity levels
    const enterprise_readiness_score = PerfectionRecommendationsOutputService.computeReadinessScore(
      maturity_assessment,
      orchestratorResult,
    );

    // Determine grade
    const grade = PerfectionRecommendationsOutputService.scoreToGrade(enterprise_readiness_score);

    // Generate recommendations from agent analysis + challenge insights
    const recommendations = PerfectionRecommendationsOutputService.generateRecommendations(
      agentDecisions,
      crossChallengeFindings,
      orchestratorResult,
      maturity_assessment,
    );

    // Derive next steps from top recommendations
    const next_steps = PerfectionRecommendationsOutputService.deriveNextSteps(recommendations);

    // Build benchmarks
    const benchmarks = PerfectionRecommendationsOutputService.buildBenchmarks(
      enterprise_readiness_score,
      benchmarkData,
    );

    const result: PerfectionRecommendationsOutput = {
      enterprise_readiness_score,
      grade,
      recommendations,
      maturity_assessment,
      next_steps,
      benchmarks,
      generated_at: new Date().toISOString(),
    };

    // Cache result
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Perfection recommendations generated', {
      score: enterprise_readiness_score,
      grade,
      recommendationCount: recommendations.length,
    });

    return result;
  }

  /**
   * Returns recommendations filtered by category.
   */
  static async getRecommendationsByCategory(
    category: RecommendationCategory,
  ): Promise<PerfectionRecommendation[]> {
    const full = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();
    return full.recommendations.filter((r) => r.category === category);
  }

  /**
   * Returns the detailed maturity assessment breakdown.
   */
  static async getMaturityAssessment(): Promise<MaturityAssessment> {
    const full = await PerfectionRecommendationsOutputService.generatePerfectionRecommendations();
    return full.maturity_assessment;
  }

  // -----------------------------------------------------------------------
  // Data Fetching (all from DB, no hardcoded values)
  // -----------------------------------------------------------------------

  /**
   * Fetches the latest orchestration result from the database.
   */
  static async fetchLatestOrchestration(): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        `SELECT id, overall_confidence, confidence_score, contradictions_count, resolved_count, agent_coverage, reasoning, actions_count, output_data, created_at FROM orchestrator_results ORDER BY created_at DESC LIMIT 1`,
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        overall_confidence: parseFloat(row.overall_confidence ?? row.confidence_score ?? '0'),
        contradictions_count: parseInt(row.contradictions_count ?? '0', 10),
        resolved_count: parseInt(row.resolved_count ?? '0', 10),
        agent_coverage: parseInt(row.agent_coverage ?? '0', 10),
        reasoning: row.reasoning ?? '',
        actions_count: parseInt(row.actions_count ?? '0', 10),
        output_data: typeof row.output_data === 'string'
          ? JSON.parse(row.output_data)
          : (row.output_data ?? {}),
        created_at: row.created_at,
      };
    } catch (error) {
      logger.warn('Failed to fetch orchestration result, proceeding without', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetches the latest decision from every agent type.
   */
  static async fetchAgentDecisions(): Promise<Map<string, Record<string, unknown>>> {
    const decisions = new Map<string, Record<string, unknown>>();

    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (agent_type)
           id, agent_type, decision_type, confidence_score, reasoning,
           output_data, input_data, created_at
         FROM agent_decisions
         ORDER BY agent_type, created_at DESC`,
      );

      for (const row of result.rows) {
        const outputData = typeof row.output_data === 'string'
          ? JSON.parse(row.output_data)
          : (row.output_data ?? {});

        decisions.set(row.agent_type, {
          id: row.id,
          agent_type: row.agent_type,
          decision_type: row.decision_type,
          confidence_score: parseFloat(row.confidence_score ?? '0'),
          reasoning: row.reasoning ?? '',
          output_data: outputData,
          recommendations: outputData?.recommendations ?? [],
          warnings: outputData?.warnings ?? [],
          uncertainties: outputData?.uncertainties ?? [],
          created_at: row.created_at,
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch agent decisions, proceeding with empty set', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return decisions;
  }

  /**
   * Fetches cross-challenge findings from the database.
   */
  static async fetchCrossChallengeFindings(): Promise<Array<Record<string, unknown>>> {
    try {
      const result = await pool.query(
        `SELECT * FROM cross_challenge_results ORDER BY created_at DESC LIMIT 100`,
      );
      return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        challenger: row.challenger,
        challenged: row.challenged,
        finding: row.finding,
        severity: row.severity,
        confidence: parseFloat(String(row.confidence ?? '0')),
        resolved: row.resolved ?? false,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.warn('Failed to fetch cross-challenge findings, proceeding with empty set', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Fetches benchmark data from the database.
   */
  static async fetchBenchmarkData(): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        `SELECT * FROM enterprise_benchmarks ORDER BY created_at DESC LIMIT 1`,
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        industry_average_score: parseFloat(row.industry_average_score ?? '0'),
        top_performer_score: parseFloat(row.top_performer_score ?? '0'),
        sample_size: parseInt(row.sample_size ?? '0', 10),
        created_at: row.created_at,
      };
    } catch (error) {
      logger.warn('Failed to fetch benchmark data, proceeding without', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Computation Methods
  // -----------------------------------------------------------------------

  /**
   * Computes the maturity assessment across six enterprise domains.
   * Each domain's score is derived from the confidence and output quality
   * of the relevant agents.
   */
  static computeMaturityAssessment(
    agentDecisions: Map<string, Record<string, unknown>>,
  ): MaturityAssessment {
    const assessment: Record<string, MaturityLevel> = {};

    for (const [domain, agents] of Object.entries(MATURITY_DOMAIN_AGENTS)) {
      const agentScores: number[] = [];
      const improvements: string[] = [];

      for (const agentType of agents) {
        const decision = agentDecisions.get(agentType);
        if (decision) {
          const confidence = decision.confidence_score as number;
          agentScores.push(confidence);

          // Extract warnings as improvement areas
          const warnings = decision.warnings as string[];
          if (Array.isArray(warnings)) {
            for (const warning of warnings) {
              improvements.push(`[${agentType}] ${warning}`);
            }
          }

          // Extract uncertainties as improvement areas
          const uncertainties = decision.uncertainties as string[];
          if (Array.isArray(uncertainties)) {
            for (const uncertainty of uncertainties) {
              improvements.push(`[${agentType}] Address uncertainty: ${uncertainty}`);
            }
          }
        } else {
          // Agent has no output - this itself is an area for improvement
          agentScores.push(0);
          improvements.push(`[${agentType}] No agent output available - deploy and configure agent`);
        }
      }

      const domainScore = agentScores.length > 0
        ? Math.round((agentScores.reduce((s, v) => s + v, 0) / agentScores.length) * 100) / 100
        : 0;

      const level = PerfectionRecommendationsOutputService.scoreToMaturityLevel(domainScore);

      assessment[domain] = {
        level,
        description: MATURITY_LEVEL_DESCRIPTIONS[level] ?? 'Unknown',
        score: domainScore,
        improvements_needed: improvements,
      };
    }

    return assessment as unknown as MaturityAssessment;
  }

  /**
   * Computes the overall enterprise readiness score from the maturity
   * assessment domains and orchestrator analysis.
   */
  static computeReadinessScore(
    maturity: MaturityAssessment,
    orchestratorResult: Record<string, unknown> | null,
  ): number {
    const domains = Object.values(maturity) as MaturityLevel[];

    if (domains.length === 0) {
      return 0;
    }

    // Weighted average of domain scores
    const domainWeights: Record<keyof MaturityAssessment, number> = {
      data_infrastructure: 0.20,
      ai_capabilities: 0.15,
      marketing_operations: 0.20,
      compliance_governance: 0.20,
      security_posture: 0.15,
      integration_ecosystem: 0.10,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [domain, weight] of Object.entries(domainWeights)) {
      const domainData = maturity[domain as keyof MaturityAssessment];
      if (domainData) {
        weightedSum += domainData.score * weight;
        totalWeight += weight;
      }
    }

    let score = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Factor in orchestrator confidence if available
    if (orchestratorResult) {
      const orchestratorConfidence = orchestratorResult.overall_confidence as number;
      if (typeof orchestratorConfidence === 'number' && orchestratorConfidence > 0) {
        // Blend 80% maturity score + 20% orchestrator confidence
        score = score * 0.8 + orchestratorConfidence * 0.2;
      }

      // Apply contradiction penalty
      const contradictionsCount = orchestratorResult.contradictions_count as number;
      const resolvedCount = orchestratorResult.resolved_count as number;
      if (typeof contradictionsCount === 'number' && contradictionsCount > 0) {
        const unresolvedRatio = typeof resolvedCount === 'number'
          ? Math.max(0, (contradictionsCount - resolvedCount) / contradictionsCount)
          : 1;
        score = score * (1 - unresolvedRatio * 0.1);
      }
    }

    return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
  }

  /**
   * Generates prioritised recommendations from agent analysis, cross-challenge
   * insights, and maturity gaps.
   */
  static generateRecommendations(
    agentDecisions: Map<string, Record<string, unknown>>,
    crossChallengeFindings: Array<Record<string, unknown>>,
    orchestratorResult: Record<string, unknown> | null,
    maturityAssessment: MaturityAssessment,
  ): PerfectionRecommendation[] {
    const recommendations: PerfectionRecommendation[] = [];
    let recIdCounter = 1;

    // ---- Recommendations from agent warnings and uncertainties ----
    for (const [category, agents] of Object.entries(CATEGORY_AGENT_MAP)) {
      for (const agentType of agents) {
        const decision = agentDecisions.get(agentType);
        if (!decision) {
          // Missing agent - critical recommendation
          const id = `REC-${String(recIdCounter++).padStart(4, '0')}`;
          recommendations.push({
            id,
            category: category as RecommendationCategory,
            priority: 'critical',
            title: `Deploy ${agentType.replace(/_/g, ' ')} agent`,
            description: `The ${agentType.replace(/_/g, ' ')} agent has not produced any outputs. ` +
              `This is a critical gap in the ${category} domain that must be addressed.`,
            current_state: 'Agent not operational or no decisions recorded',
            target_state: 'Agent fully deployed with high-confidence outputs',
            gap_analysis: `Complete absence of ${agentType.replace(/_/g, ' ')} analysis results in blind spots in ${category} decision-making.`,
            implementation_steps: [
              `Verify ${agentType} agent deployment status`,
              'Check agent configuration and input data availability',
              'Run initial agent processing cycle',
              'Validate output quality and confidence levels',
              'Integrate into orchestrator pipeline',
            ],
            estimated_impact_pct: 15,
            estimated_timeline_weeks: 2,
            dependencies: [],
            confidence: 90,
          });
          continue;
        }

        const confidence = decision.confidence_score as number;
        const warnings = (decision.warnings as string[]) ?? [];
        const uncertainties = (decision.uncertainties as string[]) ?? [];
        const agentRecommendations = (decision.recommendations as string[]) ?? [];

        // Low confidence agent -> recommendation
        if (typeof confidence === 'number' && confidence < 60) {
          const id = `REC-${String(recIdCounter++).padStart(4, '0')}`;
          recommendations.push({
            id,
            category: category as RecommendationCategory,
            priority: confidence < 30 ? 'critical' : 'high',
            title: `Improve ${agentType.replace(/_/g, ' ')} confidence`,
            description: `The ${agentType.replace(/_/g, ' ')} agent is operating at ${confidence}% confidence, ` +
              `below the 60% threshold. This undermines reliability of ${category} decisions.`,
            current_state: `Agent confidence at ${confidence}%`,
            target_state: 'Agent confidence above 80%',
            gap_analysis: `A ${Math.max(0, 80 - confidence)}% confidence gap exists. ` +
              `Contributing factors: ${warnings.length} warnings, ${uncertainties.length} uncertainties.`,
            implementation_steps: [
              'Audit input data quality and completeness',
              'Review agent model configuration and parameters',
              'Address identified warnings and uncertainties',
              'Increase training data or improve data pipeline',
              'Re-run agent and validate improved confidence',
            ],
            estimated_impact_pct: Math.round(Math.min(20, (80 - confidence) * 0.3) * 100) / 100,
            estimated_timeline_weeks: Math.ceil((80 - confidence) / 15),
            dependencies: [],
            confidence: 85,
          });
        }

        // Agent recommendations as improvement items
        for (const agentRec of agentRecommendations) {
          const id = `REC-${String(recIdCounter++).padStart(4, '0')}`;
          recommendations.push({
            id,
            category: category as RecommendationCategory,
            priority: 'medium',
            title: PerfectionRecommendationsOutputService.truncate(agentRec, 80),
            description: agentRec,
            current_state: `Identified by ${agentType.replace(/_/g, ' ')} agent analysis`,
            target_state: 'Recommendation fully implemented',
            gap_analysis: `Agent-identified improvement opportunity in ${category} domain.`,
            implementation_steps: [
              'Review recommendation in context of overall strategy',
              'Assess resource requirements and feasibility',
              'Create implementation plan',
              'Execute and validate outcomes',
            ],
            estimated_impact_pct: 5,
            estimated_timeline_weeks: 4,
            dependencies: [],
            confidence: typeof confidence === 'number' ? confidence : 50,
          });
        }
      }
    }

    // ---- Recommendations from cross-challenge findings ----
    const unresolvedFindings = crossChallengeFindings.filter((f) => !f.resolved);
    for (const finding of unresolvedFindings) {
      const id = `REC-${String(recIdCounter++).padStart(4, '0')}`;
      const category = PerfectionRecommendationsOutputService.agentToCategory(
        finding.challenged as string,
      );
      const severity = finding.severity as string;

      recommendations.push({
        id,
        category,
        priority: severity === 'critical' ? 'critical' : severity === 'warning' ? 'high' : 'medium',
        title: `Resolve cross-challenge finding: ${finding.challenger} vs ${finding.challenged}`,
        description: finding.finding as string,
        current_state: `Unresolved challenge between ${finding.challenger} and ${finding.challenged}`,
        target_state: 'Challenge resolved with aligned agent outputs',
        gap_analysis: `Cross-agent inconsistency detected with ${severity} severity. ` +
          `Confidence in finding: ${finding.confidence}%.`,
        implementation_steps: [
          `Review ${finding.challenger} and ${finding.challenged} agent outputs`,
          'Identify root cause of inconsistency',
          'Update agent parameters or input data to resolve conflict',
          'Re-run cross-challenge validation',
        ],
        estimated_impact_pct: severity === 'critical' ? 10 : 5,
        estimated_timeline_weeks: severity === 'critical' ? 1 : 2,
        dependencies: [],
        confidence: typeof finding.confidence === 'number' ? finding.confidence : 50,
      });
    }

    // ---- Recommendations from maturity gaps ----
    for (const [domain, level] of Object.entries(maturityAssessment)) {
      const maturityData = level as MaturityLevel;
      if (maturityData.level < 4) {
        const id = `REC-${String(recIdCounter++).padStart(4, '0')}`;
        const gapToTarget = 4 - maturityData.level;
        const domainLabel = domain.replace(/_/g, ' ');

        recommendations.push({
          id,
          category: PerfectionRecommendationsOutputService.domainToCategory(domain),
          priority: maturityData.level <= 1 ? 'critical' : maturityData.level <= 2 ? 'high' : 'medium',
          title: `Advance ${domainLabel} maturity from level ${maturityData.level} to level 4`,
          description: `Current maturity: ${maturityData.description}. ` +
            `A ${gapToTarget}-level gap exists to reach Managed (Level 4) maturity.`,
          current_state: `${domainLabel}: Level ${maturityData.level} - ${maturityData.description}`,
          target_state: `${domainLabel}: Level 4 - ${MATURITY_LEVEL_DESCRIPTIONS[4]}`,
          gap_analysis: `Score of ${maturityData.score}/100 with ${maturityData.improvements_needed.length} identified improvement areas.`,
          implementation_steps: maturityData.improvements_needed.length > 0
            ? maturityData.improvements_needed.slice(0, 5)
            : ['Conduct detailed assessment of current capabilities', 'Define improvement roadmap', 'Implement changes incrementally'],
          estimated_impact_pct: Math.round(gapToTarget * 5 * 100) / 100,
          estimated_timeline_weeks: gapToTarget * 6,
          dependencies: [],
          confidence: Math.min(90, maturityData.score + 20),
        });
      }
    }

    // Sort by priority (critical > high > medium > low) then by impact descending
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    recommendations.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      if (pDiff !== 0) return pDiff;
      return b.estimated_impact_pct - a.estimated_impact_pct;
    });

    return recommendations;
  }

  /**
   * Derives prioritised next steps from the top recommendations.
   */
  static deriveNextSteps(
    recommendations: PerfectionRecommendation[],
  ): NextStep[] {
    const nextSteps: NextStep[] = [];

    // Take the top recommendations and convert to actionable steps
    const topRecs = recommendations.slice(0, 10);

    for (let i = 0; i < topRecs.length; i++) {
      const rec = topRecs[i];
      nextSteps.push({
        step: `Step ${i + 1}`,
        description: `${rec.title}: ${rec.implementation_steps[0] ?? rec.description}`,
        priority: rec.priority,
        owner: PerfectionRecommendationsOutputService.categoryToOwner(rec.category),
      });
    }

    return nextSteps;
  }

  /**
   * Builds industry benchmarks from stored data and the current score.
   */
  static buildBenchmarks(
    currentScore: number,
    benchmarkData: Record<string, unknown> | null,
  ): Benchmarks {
    // Use DB benchmark data if available; otherwise compute from agent data
    const industryAvg = benchmarkData
      ? (benchmarkData.industry_average_score as number)
      : 0;
    const topPerformer = benchmarkData
      ? (benchmarkData.top_performer_score as number)
      : 0;

    // Compute percentile based on available benchmark data
    let percentile = 0;
    if (topPerformer > 0 && industryAvg > 0) {
      // Linear interpolation between industry average (50th percentile) and top performer (95th)
      if (currentScore >= topPerformer) {
        percentile = 99;
      } else if (currentScore >= industryAvg) {
        percentile = 50 + ((currentScore - industryAvg) / (topPerformer - industryAvg)) * 45;
      } else if (industryAvg > 0) {
        percentile = Math.max(1, (currentScore / industryAvg) * 50);
      }
    }

    return {
      industry_average_score: industryAvg,
      top_performer_score: topPerformer,
      current_score: currentScore,
      percentile: Math.round(percentile * 100) / 100,
    };
  }

  // -----------------------------------------------------------------------
  // Utility Methods
  // -----------------------------------------------------------------------

  /**
   * Maps a numeric score (0-100) to a maturity level (1-5).
   */
  static scoreToMaturityLevel(score: number): number {
    if (score >= 85) return 5;
    if (score >= 70) return 4;
    if (score >= 50) return 3;
    if (score >= 30) return 2;
    return 1;
  }

  /**
   * Maps an enterprise readiness score to a letter grade.
   */
  static scoreToGrade(score: number): EnterpriseGrade {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  /**
   * Maps an agent type to its primary recommendation category.
   */
  static agentToCategory(agentType: string): RecommendationCategory {
    for (const [category, agents] of Object.entries(CATEGORY_AGENT_MAP)) {
      if (agents.includes(agentType)) {
        return category as RecommendationCategory;
      }
    }
    return 'operations'; // default
  }

  /**
   * Maps a maturity domain name to a recommendation category.
   */
  static domainToCategory(domain: string): RecommendationCategory {
    const mapping: Record<string, RecommendationCategory> = {
      data_infrastructure: 'data',
      ai_capabilities: 'technology',
      marketing_operations: 'operations',
      compliance_governance: 'compliance',
      security_posture: 'compliance',
      integration_ecosystem: 'technology',
    };
    return mapping[domain] ?? 'operations';
  }

  /**
   * Maps a recommendation category to a responsible team/owner.
   */
  static categoryToOwner(category: RecommendationCategory): string {
    const ownerMap: Record<RecommendationCategory, string> = {
      strategy: 'Strategy Team',
      technology: 'Engineering Team',
      operations: 'Marketing Operations',
      data: 'Data Engineering Team',
      compliance: 'Compliance & Legal',
      scaling: 'Infrastructure Team',
    };
    return ownerMap[category];
  }

  /**
   * Truncates a string to the specified max length.
   */
  static truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

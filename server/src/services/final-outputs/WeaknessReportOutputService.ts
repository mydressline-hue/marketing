// ============================================================
// AI International Growth Engine - Weakness & Improvement Report
// Final Output Deliverable #9 (Phase 10)
//
// Aggregates cross-challenge protocol outputs from the database
// to produce a comprehensive weakness and improvement report.
// All data is sourced from DB (agent_decisions, challenge_rounds,
// contradiction_resolutions, gap_reports) -- no hardcoded values.
//
// Endpoints:
//   GET /final-outputs/weakness-report             - Full report
//   GET /final-outputs/weakness-report/priorities   - Sorted improvements
//   GET /final-outputs/weakness-report/:category    - By category
// ============================================================

import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import type { AgentType } from '../../types';

// ---- Type Definitions ----

export type OverallHealth = 'excellent' | 'good' | 'needs_improvement' | 'critical';
export type WeaknessSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Weakness {
  id: string;
  category: string;
  severity: WeaknessSeverity;
  description: string;
  affected_agents: AgentType[];
  affected_countries: string[];
  root_cause: string;
  evidence: string;
  improvement_recommendation: string;
  estimated_effort: string;
  priority_rank: number;
}

export interface ContradictionEntry {
  agents_involved: AgentType[];
  topic: string;
  contradiction_description: string;
  resolution_status: string;
  resolution_method: string;
}

export interface DataGapEntry {
  area: string;
  description: string;
  impact: string;
  recommended_data_source: string;
}

export interface ImprovementAction {
  priority: number;
  action: string;
  expected_impact: string;
  timeline_weeks: number;
  responsible_agent: AgentType;
}

export interface CrossChallengeSummary {
  total_challenges_run: number;
  contradictions_found: number;
  contradictions_resolved: number;
  avg_resolution_confidence: number;
}

export interface WeaknessReport {
  overall_health: OverallHealth;
  weaknesses: Weakness[];
  contradictions_found: ContradictionEntry[];
  data_gaps: DataGapEntry[];
  improvement_roadmap: ImprovementAction[];
  cross_challenge_summary: CrossChallengeSummary;
  generated_at: string;
  confidence_score: number;
}

// ---- DB Row Types ----

interface ChallengeRoundRow {
  id: string;
  round_number: number;
  challenges_json: string;
  inconsistencies_json: string;
  gaps_json: string;
  created_at: string;
}

interface ContradictionResolutionRow {
  id: string;
  inconsistency_json: string;
  resolution: string;
  method: string;
  winning_agent: string | null;
  reasoning: string;
  created_at: string;
}

interface GapReportRow {
  id: string;
  summary: string;
  critical_gaps_json: string;
  recommendations_json: string;
  created_at: string;
}

interface AgentDecisionRow {
  id: string;
  agent_type: string;
  decision: string;
  reasoning: string;
  confidence_score: number;
  warnings_json: string;
  data_json: string;
  country: string;
  created_at: string;
}

// ---- Service ----

/**
 * Service that produces the Weakness & Improvement Report (Final Output #9).
 *
 * Aggregates data from cross-challenge protocol tables (challenge_rounds,
 * contradiction_resolutions, gap_reports) and agent_decisions to identify
 * system weaknesses, contradictions, data gaps, and produce a prioritised
 * improvement roadmap.
 *
 * All data is sourced from the database -- no hardcoded or fake values.
 */
export class WeaknessReportOutputService {
  // =========================================================================
  // generateWeaknessReport
  // =========================================================================

  /**
   * Generates a comprehensive weakness and improvement report by querying
   * cross-challenge protocol outputs from the database.
   *
   * @returns The complete WeaknessReport
   */
  async generateWeaknessReport(): Promise<WeaknessReport> {
    logger.info('Generating weakness and improvement report');

    const [
      challengeRounds,
      contradictionResolutions,
      gapReports,
      agentDecisions,
    ] = await Promise.all([
      this.fetchChallengeRounds(),
      this.fetchContradictionResolutions(),
      this.fetchGapReports(),
      this.fetchAgentDecisions(),
    ]);

    const weaknesses = this.extractWeaknesses(
      challengeRounds,
      contradictionResolutions,
      gapReports,
      agentDecisions,
    );

    const contradictions = this.extractContradictions(contradictionResolutions);

    const dataGaps = this.extractDataGaps(gapReports);

    const crossChallengeSummary = this.buildCrossChallengeSummary(
      challengeRounds,
      contradictionResolutions,
    );

    const overallHealth = this.assessOverallHealth(
      weaknesses,
      contradictions,
      crossChallengeSummary,
    );

    const confidenceScore = this.calculateConfidenceScore(
      challengeRounds,
      agentDecisions,
      crossChallengeSummary,
    );

    const improvementRoadmap = this.buildImprovementRoadmap(
      weaknesses,
      dataGaps,
      contradictions,
    );

    const report: WeaknessReport = {
      overall_health: overallHealth,
      weaknesses,
      contradictions_found: contradictions,
      data_gaps: dataGaps,
      improvement_roadmap: improvementRoadmap,
      cross_challenge_summary: crossChallengeSummary,
      generated_at: new Date().toISOString(),
      confidence_score: confidenceScore,
    };

    logger.info('Weakness report generated', {
      overall_health: overallHealth,
      weakness_count: weaknesses.length,
      contradiction_count: contradictions.length,
      gap_count: dataGaps.length,
      improvement_count: improvementRoadmap.length,
      confidence_score: confidenceScore,
    });

    return report;
  }

  // =========================================================================
  // getWeaknessByCategory
  // =========================================================================

  /**
   * Returns weaknesses filtered to a specific category.
   *
   * @param category - The weakness category to filter by
   * @returns Filtered weaknesses
   */
  async getWeaknessByCategory(category: string): Promise<Weakness[]> {
    logger.info('Fetching weaknesses by category', { category });

    const report = await this.generateWeaknessReport();
    const filtered = report.weaknesses.filter(
      (w) => w.category.toLowerCase() === category.toLowerCase(),
    );

    logger.info('Filtered weaknesses by category', {
      category,
      count: filtered.length,
    });

    return filtered;
  }

  // =========================================================================
  // getImprovementPriorities
  // =========================================================================

  /**
   * Returns improvement actions sorted by priority (ascending -- 1 is highest).
   *
   * @returns Sorted array of improvement actions
   */
  async getImprovementPriorities(): Promise<ImprovementAction[]> {
    logger.info('Fetching improvement priorities');

    const report = await this.generateWeaknessReport();
    const sorted = [...report.improvement_roadmap].sort(
      (a, b) => a.priority - b.priority,
    );

    logger.info('Improvement priorities fetched', { count: sorted.length });

    return sorted;
  }

  // =========================================================================
  // Data Fetching (Private)
  // =========================================================================

  private async fetchChallengeRounds(): Promise<ChallengeRoundRow[]> {
    try {
      const result = await pool.query<ChallengeRoundRow>(
        `SELECT id, round_number, challenges_json, inconsistencies_json, gaps_json, created_at
         FROM challenge_rounds
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      return result.rows;
    } catch (err) {
      logger.error('Failed to fetch challenge rounds', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchContradictionResolutions(): Promise<ContradictionResolutionRow[]> {
    try {
      const result = await pool.query<ContradictionResolutionRow>(
        `SELECT id, inconsistency_json, resolution, method, winning_agent, reasoning, created_at
         FROM contradiction_resolutions
         ORDER BY created_at DESC
         LIMIT 200`,
      );
      return result.rows;
    } catch (err) {
      logger.error('Failed to fetch contradiction resolutions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchGapReports(): Promise<GapReportRow[]> {
    try {
      const result = await pool.query<GapReportRow>(
        `SELECT id, summary, critical_gaps_json, recommendations_json, created_at
         FROM gap_reports
         ORDER BY created_at DESC
         LIMIT 50`,
      );
      return result.rows;
    } catch (err) {
      logger.error('Failed to fetch gap reports', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchAgentDecisions(): Promise<AgentDecisionRow[]> {
    try {
      const result = await pool.query<AgentDecisionRow>(
        `SELECT id, agent_type, decision, reasoning, confidence_score, warnings_json, data_json, country, created_at
         FROM agent_decisions
         ORDER BY created_at DESC
         LIMIT 500`,
      );
      return result.rows;
    } catch (err) {
      logger.error('Failed to fetch agent decisions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // =========================================================================
  // Extraction & Analysis (Private)
  // =========================================================================

  /**
   * Extracts weaknesses from all cross-challenge data sources.
   */
  private extractWeaknesses(
    challengeRounds: ChallengeRoundRow[],
    contradictionResolutions: ContradictionResolutionRow[],
    gapReports: GapReportRow[],
    agentDecisions: AgentDecisionRow[],
  ): Weakness[] {
    const weaknesses: Weakness[] = [];
    let priorityCounter = 0;

    // 1. Extract weaknesses from challenge round findings
    for (const round of challengeRounds) {
      const challenges = this.safeParseJson<Array<{
        challengerId: string;
        challengedId: string;
        findings: Array<{
          area: string;
          issue: string;
          severity: string;
          evidence: string;
          suggestedFix?: string;
        }>;
        overallSeverity: string;
        confidence: number;
      }>>(round.challenges_json, []);

      for (const challenge of challenges) {
        const criticalFindings = challenge.findings.filter(
          (f) => f.severity === 'critical' || f.severity === 'warning',
        );

        for (const finding of criticalFindings) {
          priorityCounter += 1;
          weaknesses.push({
            id: generateId(),
            category: this.categoriseFinding(finding.area),
            severity: this.mapSeverity(finding.severity),
            description: finding.issue,
            affected_agents: [
              challenge.challengedId as AgentType,
              challenge.challengerId as AgentType,
            ],
            affected_countries: this.extractCountriesFromDecisions(
              agentDecisions,
              challenge.challengedId as AgentType,
            ),
            root_cause: this.deriveRootCause(finding.area, finding.issue),
            evidence: finding.evidence,
            improvement_recommendation: finding.suggestedFix || `Address ${finding.area} issues in ${challenge.challengedId}`,
            estimated_effort: this.estimateEffort(finding.severity),
            priority_rank: priorityCounter,
          });
        }
      }
    }

    // 2. Extract weaknesses from unresolved contradictions
    for (const resolution of contradictionResolutions) {
      if (resolution.method === 'manual_review') {
        const inconsistency = this.safeParseJson<{
          agents: string[];
          area: string;
          description: string;
          severity: string;
        }>(resolution.inconsistency_json, { agents: [], area: '', description: '', severity: 'warning' });

        priorityCounter += 1;
        weaknesses.push({
          id: generateId(),
          category: 'unresolved_contradiction',
          severity: this.mapSeverity(inconsistency.severity),
          description: `Unresolved contradiction: ${inconsistency.description}`,
          affected_agents: inconsistency.agents as AgentType[],
          affected_countries: this.extractCountriesFromDecisions(
            agentDecisions,
            inconsistency.agents[0] as AgentType,
          ),
          root_cause: `Agents disagree on ${inconsistency.area} and automatic resolution was insufficient`,
          evidence: resolution.reasoning,
          improvement_recommendation: `Review and manually resolve contradiction in ${inconsistency.area} between ${inconsistency.agents.join(' and ')}`,
          estimated_effort: 'medium',
          priority_rank: priorityCounter,
        });
      }
    }

    // 3. Extract weaknesses from critical gap reports
    for (const gapReport of gapReports) {
      const criticalGaps = this.safeParseJson<Array<{
        reportedBy: string;
        area: string;
        description: string;
        dataNeeded: string[];
        impact: string;
      }>>(gapReport.critical_gaps_json, []);

      for (const gap of criticalGaps) {
        priorityCounter += 1;
        const impactLower = gap.impact.toLowerCase();
        const severity: WeaknessSeverity = impactLower.startsWith('high')
          ? 'high'
          : impactLower.startsWith('medium')
            ? 'medium'
            : 'low';

        weaknesses.push({
          id: generateId(),
          category: 'data_gap',
          severity,
          description: gap.description,
          affected_agents: [gap.reportedBy as AgentType],
          affected_countries: this.extractCountriesFromDecisions(
            agentDecisions,
            gap.reportedBy as AgentType,
          ),
          root_cause: `Missing data coverage in ${gap.area}`,
          evidence: `Impact: ${gap.impact}. Data needed: ${gap.dataNeeded.join(', ')}`,
          improvement_recommendation: `Fill data gap by providing: ${gap.dataNeeded.join(', ')}`,
          estimated_effort: this.estimateEffort(severity),
          priority_rank: priorityCounter,
        });
      }
    }

    // 4. Extract weaknesses from low-confidence agent decisions
    for (const decision of agentDecisions) {
      if (decision.confidence_score < 40) {
        priorityCounter += 1;
        const warnings = this.safeParseJson<string[]>(decision.warnings_json, []);

        weaknesses.push({
          id: generateId(),
          category: 'low_confidence',
          severity: decision.confidence_score < 20 ? 'critical' : 'high',
          description: `Agent ${decision.agent_type} produced decision with very low confidence (${decision.confidence_score}/100)`,
          affected_agents: [decision.agent_type as AgentType],
          affected_countries: decision.country ? [decision.country] : [],
          root_cause: warnings.length > 0
            ? `Agent reported ${warnings.length} warnings: ${warnings.slice(0, 2).join('; ')}`
            : `Insufficient data or analysis quality for ${decision.agent_type}`,
          evidence: `Confidence: ${decision.confidence_score}, Decision: ${decision.decision.substring(0, 150)}`,
          improvement_recommendation: `Review data inputs for ${decision.agent_type} and ensure adequate data coverage before next decision cycle`,
          estimated_effort: 'medium',
          priority_rank: priorityCounter,
        });
      }
    }

    // Sort by severity then priority_rank
    weaknesses.sort((a, b) => {
      const severityOrder: Record<WeaknessSeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      return sevDiff !== 0 ? sevDiff : a.priority_rank - b.priority_rank;
    });

    // Re-assign priority ranks after sorting
    for (let i = 0; i < weaknesses.length; i++) {
      weaknesses[i].priority_rank = i + 1;
    }

    return weaknesses;
  }

  /**
   * Extracts contradictions from resolution records.
   */
  private extractContradictions(
    resolutions: ContradictionResolutionRow[],
  ): ContradictionEntry[] {
    return resolutions.map((r) => {
      const inconsistency = this.safeParseJson<{
        agents: string[];
        area: string;
        description: string;
        severity: string;
      }>(r.inconsistency_json, { agents: [], area: '', description: '', severity: '' });

      return {
        agents_involved: inconsistency.agents as AgentType[],
        topic: inconsistency.area,
        contradiction_description: inconsistency.description,
        resolution_status: r.method === 'manual_review' ? 'unresolved' : 'resolved',
        resolution_method: r.method,
      };
    });
  }

  /**
   * Extracts data gaps from gap reports.
   */
  private extractDataGaps(gapReports: GapReportRow[]): DataGapEntry[] {
    const gaps: DataGapEntry[] = [];

    for (const report of gapReports) {
      const criticalGaps = this.safeParseJson<Array<{
        reportedBy: string;
        area: string;
        description: string;
        dataNeeded: string[];
        impact: string;
      }>>(report.critical_gaps_json, []);

      for (const gap of criticalGaps) {
        gaps.push({
          area: gap.area,
          description: gap.description,
          impact: gap.impact,
          recommended_data_source: gap.dataNeeded.length > 0
            ? gap.dataNeeded.join(', ')
            : `Additional data sources for ${gap.area}`,
        });
      }
    }

    return gaps;
  }

  /**
   * Builds a summary of cross-challenge activity from DB data.
   */
  private buildCrossChallengeSummary(
    challengeRounds: ChallengeRoundRow[],
    contradictionResolutions: ContradictionResolutionRow[],
  ): CrossChallengeSummary {
    let totalChallenges = 0;

    for (const round of challengeRounds) {
      const challenges = this.safeParseJson<unknown[]>(round.challenges_json, []);
      totalChallenges += challenges.length;
    }

    const totalContradictions = contradictionResolutions.length;
    const resolved = contradictionResolutions.filter(
      (r) => r.method !== 'manual_review',
    ).length;

    // Calculate average resolution confidence from winning agent outcomes
    let confidenceSum = 0;
    let confidenceCount = 0;
    for (const round of challengeRounds) {
      const challenges = this.safeParseJson<Array<{ confidence: number }>>(
        round.challenges_json, [],
      );
      for (const challenge of challenges) {
        if (typeof challenge.confidence === 'number') {
          confidenceSum += challenge.confidence;
          confidenceCount += 1;
        }
      }
    }

    const avgConfidence = confidenceCount > 0
      ? Math.round(confidenceSum / confidenceCount)
      : 0;

    return {
      total_challenges_run: totalChallenges,
      contradictions_found: totalContradictions,
      contradictions_resolved: resolved,
      avg_resolution_confidence: avgConfidence,
    };
  }

  /**
   * Assesses the overall health of the system based on weakness data.
   */
  private assessOverallHealth(
    weaknesses: Weakness[],
    contradictions: ContradictionEntry[],
    summary: CrossChallengeSummary,
  ): OverallHealth {
    const criticalCount = weaknesses.filter((w) => w.severity === 'critical').length;
    const highCount = weaknesses.filter((w) => w.severity === 'high').length;
    const unresolvedCount = contradictions.filter(
      (c) => c.resolution_status === 'unresolved',
    ).length;

    // No data at all -> cannot assess
    if (summary.total_challenges_run === 0 && weaknesses.length === 0) {
      return 'needs_improvement';
    }

    if (criticalCount > 3 || unresolvedCount > 5) {
      return 'critical';
    }

    if (criticalCount > 0 || highCount > 5 || unresolvedCount > 2) {
      return 'needs_improvement';
    }

    if (highCount > 0 || weaknesses.length > 10) {
      return 'good';
    }

    return 'excellent';
  }

  /**
   * Calculates a confidence score for the report based on data availability.
   */
  private calculateConfidenceScore(
    challengeRounds: ChallengeRoundRow[],
    agentDecisions: AgentDecisionRow[],
    summary: CrossChallengeSummary,
  ): number {
    let score = 0;

    // More challenge rounds = higher confidence in analysis
    if (challengeRounds.length > 10) {
      score += 30;
    } else if (challengeRounds.length > 3) {
      score += 20;
    } else if (challengeRounds.length > 0) {
      score += 10;
    }

    // More agent decisions = more data to work with
    if (agentDecisions.length > 100) {
      score += 30;
    } else if (agentDecisions.length > 20) {
      score += 20;
    } else if (agentDecisions.length > 0) {
      score += 10;
    }

    // Higher resolution rate = more reliable challenge system
    if (summary.total_challenges_run > 0) {
      const resolutionRate = summary.contradictions_found > 0
        ? summary.contradictions_resolved / summary.contradictions_found
        : 1;
      score += Math.round(resolutionRate * 20);
    }

    // Average confidence from challenges
    if (summary.avg_resolution_confidence > 70) {
      score += 20;
    } else if (summary.avg_resolution_confidence > 50) {
      score += 10;
    } else if (summary.avg_resolution_confidence > 0) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Builds a prioritised improvement roadmap from all identified issues.
   */
  private buildImprovementRoadmap(
    weaknesses: Weakness[],
    dataGaps: DataGapEntry[],
    contradictions: ContradictionEntry[],
  ): ImprovementAction[] {
    const actions: ImprovementAction[] = [];
    let priorityCounter = 0;

    // Group weaknesses by affected agent and generate actions
    const agentWeaknessMap = new Map<AgentType, Weakness[]>();
    for (const w of weaknesses) {
      for (const agent of w.affected_agents) {
        const existing = agentWeaknessMap.get(agent) || [];
        existing.push(w);
        agentWeaknessMap.set(agent, existing);
      }
    }

    // Critical weaknesses first
    const criticalWeaknesses = weaknesses.filter((w) => w.severity === 'critical');
    for (const w of criticalWeaknesses) {
      priorityCounter += 1;
      actions.push({
        priority: priorityCounter,
        action: w.improvement_recommendation,
        expected_impact: `Resolve critical weakness: ${w.description.substring(0, 100)}`,
        timeline_weeks: this.effortToWeeks(w.estimated_effort),
        responsible_agent: w.affected_agents[0] || 'master_orchestrator' as AgentType,
      });
    }

    // Unresolved contradictions
    const unresolved = contradictions.filter((c) => c.resolution_status === 'unresolved');
    for (const c of unresolved) {
      priorityCounter += 1;
      actions.push({
        priority: priorityCounter,
        action: `Resolve contradiction between ${c.agents_involved.join(' and ')} on ${c.topic}`,
        expected_impact: `Eliminate conflicting decisions in ${c.topic}`,
        timeline_weeks: 2,
        responsible_agent: c.agents_involved[0] || 'master_orchestrator' as AgentType,
      });
    }

    // High severity weaknesses
    const highWeaknesses = weaknesses.filter((w) => w.severity === 'high');
    for (const w of highWeaknesses) {
      priorityCounter += 1;
      actions.push({
        priority: priorityCounter,
        action: w.improvement_recommendation,
        expected_impact: `Address high-severity weakness: ${w.description.substring(0, 100)}`,
        timeline_weeks: this.effortToWeeks(w.estimated_effort),
        responsible_agent: w.affected_agents[0] || 'master_orchestrator' as AgentType,
      });
    }

    // Data gaps
    for (const gap of dataGaps) {
      priorityCounter += 1;
      actions.push({
        priority: priorityCounter,
        action: `Fill data gap: ${gap.recommended_data_source}`,
        expected_impact: `Improve coverage for ${gap.area}: ${gap.impact.substring(0, 100)}`,
        timeline_weeks: 3,
        responsible_agent: 'data_engineering' as AgentType,
      });
    }

    // Medium/Low weaknesses
    const mediumLowWeaknesses = weaknesses.filter(
      (w) => w.severity === 'medium' || w.severity === 'low',
    );
    for (const w of mediumLowWeaknesses) {
      priorityCounter += 1;
      actions.push({
        priority: priorityCounter,
        action: w.improvement_recommendation,
        expected_impact: `Improve ${w.category}: ${w.description.substring(0, 100)}`,
        timeline_weeks: this.effortToWeeks(w.estimated_effort),
        responsible_agent: w.affected_agents[0] || 'master_orchestrator' as AgentType,
      });
    }

    return actions;
  }

  // =========================================================================
  // Helper Methods (Private)
  // =========================================================================

  private safeParseJson<T>(json: string, fallback: T): T {
    try {
      if (!json) return fallback;
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      return parsed as T;
    } catch {
      logger.warn('Failed to parse JSON in weakness report', {
        preview: typeof json === 'string' ? json.substring(0, 100) : String(json),
      });
      return fallback;
    }
  }

  private categoriseFinding(area: string): string {
    const normalised = area.toLowerCase();
    if (normalised.includes('confidence')) return 'confidence';
    if (normalised.includes('reasoning')) return 'reasoning_quality';
    if (normalised.includes('risk')) return 'risk_management';
    if (normalised.includes('data')) return 'data_completeness';
    if (normalised.includes('recommendation')) return 'recommendation_quality';
    if (normalised.includes('budget')) return 'budget';
    if (normalised.includes('strategy')) return 'strategy';
    if (normalised.includes('metric')) return 'metric_alignment';
    return 'general';
  }

  private mapSeverity(severity: string): WeaknessSeverity {
    switch (severity.toLowerCase()) {
      case 'critical': return 'critical';
      case 'high':
      case 'warning': return 'high';
      case 'medium':
      case 'info': return 'medium';
      default: return 'low';
    }
  }

  private deriveRootCause(area: string, issue: string): string {
    if (area.includes('confidence')) {
      return 'Agent lacks sufficient data inputs to produce a confident decision';
    }
    if (area.includes('reasoning')) {
      return 'Agent reasoning pipeline is not producing adequate justification';
    }
    if (area.includes('data_completeness')) {
      return 'Required data fields are not being populated by upstream data sources';
    }
    if (area.includes('risk')) {
      return 'Risk assessment module is not properly weighting known warnings';
    }
    if (area.includes('recommendation')) {
      return 'Recommendation generation lacks specificity or actionability';
    }
    return `Identified issue in ${area}: ${issue.substring(0, 80)}`;
  }

  private estimateEffort(severity: string | WeaknessSeverity): string {
    switch (severity) {
      case 'critical': return 'high';
      case 'high':
      case 'warning': return 'medium';
      case 'medium':
      case 'info': return 'low';
      default: return 'low';
    }
  }

  private effortToWeeks(effort: string): number {
    switch (effort) {
      case 'high': return 4;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  private extractCountriesFromDecisions(
    decisions: AgentDecisionRow[],
    agentType: AgentType,
  ): string[] {
    const countries = new Set<string>();
    for (const d of decisions) {
      if (d.agent_type === agentType && d.country) {
        countries.add(d.country);
      }
    }
    return Array.from(countries);
  }
}

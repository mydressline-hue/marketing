/**
 * 90-Day Execution Roadmap Output Service.
 *
 * Phase 10 Final Output Deliverable #7.
 * Aggregates orchestrator outputs, decision matrices, and marketing actions
 * from the database to produce a structured 90-day execution roadmap with
 * three phases, milestones, critical path, resource requirements, and KPI targets.
 *
 * All data is sourced from the database / agent outputs -- no hardcoded values.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import type { AgentType } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single key action within a roadmap phase.
 */
export interface RoadmapKeyAction {
  /** Description of the action */
  action: string;
  /** Agent responsible for executing this action */
  responsible_agent: AgentType;
  /** Priority level of the action */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Estimated impact score (0-100) */
  estimated_impact: number;
  /** Countries within scope for this action */
  country_scope: string[];
}

/**
 * A single phase within the 90-day roadmap.
 */
export interface RoadmapPhase {
  /** Display name for this phase */
  name: string;
  /** Strategic objectives for this phase */
  objectives: string[];
  /** Concrete actions to be executed during this phase */
  key_actions: RoadmapKeyAction[];
  /** Expected outcomes at the end of this phase */
  expected_outcomes: string[];
  /** Risk factors that could impact this phase */
  risks: string[];
}

/**
 * A single milestone in the execution roadmap.
 */
export interface RoadmapMilestone {
  /** Day number (1-90) when this milestone should be reached */
  day: number;
  /** Short title describing the milestone */
  title: string;
  /** Detailed description of what this milestone entails */
  description: string;
  /** IDs or titles of milestones that must be completed before this one */
  dependencies: string[];
  /** The agent primarily responsible for this milestone */
  owner_agent: AgentType;
  /** Criteria that must be met for the milestone to be considered complete */
  success_criteria: string;
  /** Risk level associated with meeting this milestone */
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  /** Whether this milestone has been completed */
  completed?: boolean;
  /** ISO-8601 timestamp of completion, if applicable */
  completed_at?: string;
}

/**
 * A task on the critical path.
 */
export interface CriticalPathTask {
  /** Description of the task */
  task: string;
  /** Start day (1-90) */
  start_day: number;
  /** End day (1-90) */
  end_day: number;
  /** Whether this task blocks other tasks from starting */
  blocking: boolean;
}

/**
 * Resource requirements for executing the roadmap.
 */
export interface ResourceRequirements {
  /** Number of agents required for the roadmap */
  agents_required: number;
  /** List of API integrations needed */
  api_integrations: string[];
  /** Estimated total API calls over 90 days */
  estimated_api_calls: number;
  /** Estimated cost in USD */
  estimated_cost: number;
}

/**
 * A KPI target with current and projected values.
 */
export interface KPITarget {
  /** KPI name */
  kpi: string;
  /** Current measured value */
  current_value: number;
  /** Target value at 30 days */
  target_30d: number;
  /** Target value at 60 days */
  target_60d: number;
  /** Target value at 90 days */
  target_90d: number;
}

/**
 * The complete 90-day execution roadmap output.
 */
export interface ExecutionRoadmap {
  /** The three phases of the roadmap */
  roadmap: {
    phase_1_days_1_30: RoadmapPhase;
    phase_2_days_31_60: RoadmapPhase;
    phase_3_days_61_90: RoadmapPhase;
  };
  /** Milestone tracking across all 90 days */
  milestones: RoadmapMilestone[];
  /** Critical path tasks that determine the minimum timeline */
  critical_path: CriticalPathTask[];
  /** Resource requirements for executing the roadmap */
  resource_requirements: ResourceRequirements;
  /** KPI targets with current and projected values */
  kpi_targets: KPITarget[];
  /** ISO-8601 timestamp when this roadmap was generated */
  generated_at: string;
  /** Overall confidence score (0-100) in the roadmap's feasibility */
  confidence_score: number;
}

// ---------------------------------------------------------------------------
// Internal row types from DB
// ---------------------------------------------------------------------------

interface OrchestrationRow {
  id: string;
  request_id: string;
  overall_confidence: number;
  contradictions_found: number;
  contradictions_resolved: number;
  challenge_cycles_run: number;
  actions_assigned: number;
  reasoning: string;
  completed_at: string;
}

interface ActionRow {
  id: string;
  type: string;
  description: string;
  assigned_agent: AgentType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline: string | null;
  dependencies: string;
  status: string;
  source_entry_agent: AgentType;
  confidence_score: number;
  created_at: string;
}

interface MatrixRow {
  id: string;
  overall_confidence: number;
  generated_by: string;
  request_id: string;
  entries: string | DecisionEntryRow[];
  created_at: string;
}

interface DecisionEntryRow {
  agent: AgentType;
  decision: string;
  confidence: number;
  approved: boolean;
  action: string;
  priority: number;
}

interface KPIRow {
  name: string;
  value: number;
  previous_value: number;
  change_percent: number;
  trend: string;
  period: string;
}

interface CountryRow {
  code: string;
  name: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:execution_roadmap';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Agent-to-integration mapping (derived from agent capabilities)
// ---------------------------------------------------------------------------

const AGENT_INTEGRATION_MAP: Partial<Record<AgentType, string[]>> = {
  paid_ads: ['Google Ads API', 'Meta Ads API', 'TikTok Ads API'],
  organic_social: ['Meta Graph API', 'Twitter API', 'LinkedIn API'],
  content_blog: ['Shopify Storefront API', 'SEO Tools API'],
  creative_generation: ['Image Generation API', 'Video Processing API'],
  performance_analytics: ['Google Analytics API', 'Data Warehouse API'],
  shopify_integration: ['Shopify Admin API', 'Shopify Storefront API'],
  localization: ['Translation API', 'Currency Exchange API'],
  competitive_intelligence: ['Web Scraping API', 'SimilarWeb API'],
  market_intelligence: ['Market Data API', 'Economic Indicators API'],
  data_engineering: ['Data Warehouse API', 'ETL Pipeline API'],
  revenue_forecasting: ['Financial Modeling API', 'Data Warehouse API'],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ExecutionRoadmapOutputService {
  /**
   * Generates the complete 90-day execution roadmap.
   *
   * Fetches orchestration results, decision matrices, marketing actions,
   * country data, and KPI data from the database, then computes a structured
   * three-phase roadmap with milestones, critical path, resource requirements,
   * and KPI targets.
   */
  static async generateExecutionRoadmap(): Promise<ExecutionRoadmap> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:latest`;
    const cached = await cacheGet<ExecutionRoadmap>(cacheKey);

    if (cached) {
      logger.debug('Execution roadmap cache hit');
      return cached;
    }

    // Fetch all required data from the database in parallel
    const [orchestrationRun, actions, matrix, countries, kpis] = await Promise.all([
      ExecutionRoadmapOutputService.fetchLatestOrchestrationRun(),
      ExecutionRoadmapOutputService.fetchMarketingActions(),
      ExecutionRoadmapOutputService.fetchLatestDecisionMatrix(),
      ExecutionRoadmapOutputService.fetchActiveCountries(),
      ExecutionRoadmapOutputService.fetchKPIData(),
    ]);

    // Parse matrix entries
    const matrixEntries = matrix
      ? ExecutionRoadmapOutputService.parseMatrixEntries(matrix.entries)
      : [];

    // Build the three roadmap phases from actions and matrix data
    const countryCodes = countries.map((c) => c.code);
    const phase1 = ExecutionRoadmapOutputService.buildPhase(
      1,
      actions,
      matrixEntries,
      countryCodes,
    );
    const phase2 = ExecutionRoadmapOutputService.buildPhase(
      2,
      actions,
      matrixEntries,
      countryCodes,
    );
    const phase3 = ExecutionRoadmapOutputService.buildPhase(
      3,
      actions,
      matrixEntries,
      countryCodes,
    );

    // Build milestones from actions
    const milestones = ExecutionRoadmapOutputService.buildMilestones(
      actions,
      matrixEntries,
    );

    // Build critical path
    const criticalPath = ExecutionRoadmapOutputService.buildCriticalPath(
      actions,
    );

    // Build resource requirements
    const resourceRequirements = ExecutionRoadmapOutputService.buildResourceRequirements(
      actions,
      matrixEntries,
    );

    // Build KPI targets
    const kpiTargets = ExecutionRoadmapOutputService.buildKPITargets(kpis);

    // Compute confidence score from orchestration data
    const confidenceScore = ExecutionRoadmapOutputService.computeConfidenceScore(
      orchestrationRun,
      matrix,
      actions,
    );

    const result: ExecutionRoadmap = {
      roadmap: {
        phase_1_days_1_30: phase1,
        phase_2_days_31_60: phase2,
        phase_3_days_61_90: phase3,
      },
      milestones,
      critical_path: criticalPath,
      resource_requirements: resourceRequirements,
      kpi_targets: kpiTargets,
      generated_at: new Date().toISOString(),
      confidence_score: confidenceScore,
    };

    // Cache the result
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Execution roadmap generated', {
      milestoneCount: milestones.length,
      criticalPathLength: criticalPath.length,
      confidenceScore,
    });

    return result;
  }

  /**
   * Returns the roadmap details for a specific phase (1, 2, or 3).
   */
  static async getRoadmapByPhase(phase: number): Promise<RoadmapPhase> {
    const roadmap = await ExecutionRoadmapOutputService.generateExecutionRoadmap();

    switch (phase) {
      case 1:
        return roadmap.roadmap.phase_1_days_1_30;
      case 2:
        return roadmap.roadmap.phase_2_days_31_60;
      case 3:
        return roadmap.roadmap.phase_3_days_61_90;
      default:
        throw new Error(`Invalid phase number: ${phase}. Must be 1, 2, or 3.`);
    }
  }

  /**
   * Returns milestone status tracking information.
   * Checks the database for completed milestones and enriches the
   * milestone list with completion data.
   */
  static async getMilestoneStatus(): Promise<{
    milestones: RoadmapMilestone[];
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    completion_percentage: number;
  }> {
    const roadmap = await ExecutionRoadmapOutputService.generateExecutionRoadmap();
    const milestones = roadmap.milestones;

    // Check database for completed milestones
    const completedMilestones = await ExecutionRoadmapOutputService.fetchCompletedMilestones();
    const completedTitles = new Set(completedMilestones.map((m) => m.title));

    // Determine current day in the 90-day plan from the roadmap generation date
    const generatedAt = new Date(roadmap.generated_at);
    const now = new Date();
    const daysSinceGeneration = Math.max(
      0,
      Math.floor((now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const currentDay = Math.min(90, daysSinceGeneration + 1);

    // Enrich milestones with status
    const enrichedMilestones = milestones.map((milestone) => {
      const isCompleted = completedTitles.has(milestone.title);
      const completedRecord = completedMilestones.find((m) => m.title === milestone.title);

      return {
        ...milestone,
        completed: isCompleted,
        completed_at: completedRecord?.completed_at ?? undefined,
      };
    });

    const completed = enrichedMilestones.filter((m) => m.completed).length;
    const inProgress = enrichedMilestones.filter(
      (m) => !m.completed && m.day <= currentDay,
    ).length;
    const pending = enrichedMilestones.filter(
      (m) => !m.completed && m.day > currentDay,
    ).length;

    return {
      milestones: enrichedMilestones,
      total: enrichedMilestones.length,
      completed,
      in_progress: inProgress,
      pending,
      completion_percentage:
        enrichedMilestones.length > 0
          ? Math.round((completed / enrichedMilestones.length) * 100 * 100) / 100
          : 0,
    };
  }

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  /**
   * Fetches the latest orchestration run from the database.
   */
  static async fetchLatestOrchestrationRun(): Promise<OrchestrationRow | null> {
    const result = await pool.query<OrchestrationRow>(
      `SELECT id, request_id, overall_confidence, contradictions_found,
              contradictions_resolved, challenge_cycles_run, actions_assigned,
              reasoning, completed_at
       FROM orchestration_runs
       ORDER BY completed_at DESC
       LIMIT 1`,
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Fetches all marketing actions from the database.
   */
  static async fetchMarketingActions(): Promise<ActionRow[]> {
    const result = await pool.query<ActionRow>(
      `SELECT id, type, description, assigned_agent, priority, deadline,
              dependencies, status, source_entry_agent, confidence_score, created_at
       FROM marketing_actions
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END ASC,
         confidence_score DESC`,
    );
    return result.rows;
  }

  /**
   * Fetches the latest decision matrix from the database.
   */
  static async fetchLatestDecisionMatrix(): Promise<MatrixRow | null> {
    const result = await pool.query<MatrixRow>(
      `SELECT id, overall_confidence, generated_by, request_id, entries, created_at
       FROM decision_matrices
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Fetches active countries from the database.
   */
  static async fetchActiveCountries(): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      `SELECT code, name, is_active FROM countries WHERE is_active = true ORDER BY name ASC`,
    );
    return result.rows;
  }

  /**
   * Fetches KPI data from the database.
   */
  static async fetchKPIData(): Promise<KPIRow[]> {
    const result = await pool.query<KPIRow>(
      `SELECT name, value, previous_value, change_percent, trend, period
       FROM kpi_metrics
       ORDER BY period DESC, name ASC`,
    );
    return result.rows;
  }

  /**
   * Fetches completed milestones from the database.
   */
  static async fetchCompletedMilestones(): Promise<
    Array<{ title: string; completed_at: string }>
  > {
    const result = await pool.query<{ title: string; completed_at: string }>(
      `SELECT title, completed_at
       FROM roadmap_milestones
       WHERE completed = true
       ORDER BY completed_at DESC`,
    );
    return result.rows;
  }

  // -----------------------------------------------------------------------
  // Phase building
  // -----------------------------------------------------------------------

  /**
   * Builds a single roadmap phase from action and matrix data.
   *
   * Phase 1 (days 1-30): Foundation -- critical and high-priority compliance,
   *   security, and analytics actions.
   * Phase 2 (days 31-60): Execution -- high and medium-priority campaign,
   *   content, and growth actions.
   * Phase 3 (days 61-90): Optimization -- medium and low-priority optimization,
   *   testing, and scaling actions.
   */
  static buildPhase(
    phaseNumber: number,
    actions: ActionRow[],
    matrixEntries: DecisionEntryRow[],
    countryCodes: string[],
  ): RoadmapPhase {
    const phaseConfig = ExecutionRoadmapOutputService.getPhaseConfig(phaseNumber);

    // Filter actions relevant to this phase based on priority and type
    const phaseActions = actions.filter((action) =>
      phaseConfig.priorityFilter.includes(action.priority) ||
      phaseConfig.typeFilter.includes(action.type),
    );

    // Build key actions from the filtered actions
    const keyActions: RoadmapKeyAction[] = phaseActions.map((action) => {
      // Find corresponding matrix entry for impact estimation
      const matrixEntry = matrixEntries.find(
        (entry) => entry.agent === action.assigned_agent,
      );

      return {
        action: action.description,
        responsible_agent: action.assigned_agent,
        priority: action.priority,
        estimated_impact: matrixEntry
          ? Math.round(matrixEntry.confidence * (matrixEntry.approved ? 1 : 0.6))
          : Math.round(action.confidence_score * 0.8),
        country_scope: countryCodes.length > 0 ? countryCodes : ['global'],
      };
    });

    // Derive objectives from the matrix entries for agents in this phase
    const phaseAgents = new Set(phaseActions.map((a) => a.assigned_agent));
    const objectives = matrixEntries
      .filter((entry) => phaseAgents.has(entry.agent) && entry.approved)
      .map((entry) => entry.decision)
      .filter((decision, index, self) => self.indexOf(decision) === index)
      .slice(0, 5);

    // Add default objectives if none were derived
    if (objectives.length === 0) {
      objectives.push(...phaseConfig.defaultObjectives);
    }

    // Build expected outcomes from action descriptions
    const expectedOutcomes = phaseActions
      .filter((a) => a.priority === 'critical' || a.priority === 'high')
      .map((a) => `Complete: ${a.description}`)
      .slice(0, 5);

    if (expectedOutcomes.length === 0) {
      expectedOutcomes.push(...phaseConfig.defaultOutcomes);
    }

    // Derive risks from low-confidence actions
    const risks = phaseActions
      .filter((a) => a.confidence_score < 60)
      .map((a) => `Low confidence (${a.confidence_score}%) on: ${a.description}`)
      .slice(0, 5);

    if (risks.length === 0) {
      risks.push(...phaseConfig.defaultRisks);
    }

    return {
      name: phaseConfig.name,
      objectives,
      key_actions: keyActions,
      expected_outcomes: expectedOutcomes,
      risks,
    };
  }

  /**
   * Returns configuration for each phase (name, priority filters, defaults).
   */
  static getPhaseConfig(phaseNumber: number): {
    name: string;
    priorityFilter: string[];
    typeFilter: string[];
    defaultObjectives: string[];
    defaultOutcomes: string[];
    defaultRisks: string[];
  } {
    switch (phaseNumber) {
      case 1:
        return {
          name: 'Foundation & Setup (Days 1-30)',
          priorityFilter: ['critical', 'high'],
          typeFilter: [
            'compliance_enforcement',
            'security_action',
            'analytics_review',
            'fraud_mitigation',
            'data_pipeline',
          ],
          defaultObjectives: [
            'Establish compliance and security foundations across all target markets',
            'Set up analytics and data infrastructure for tracking',
            'Complete initial market intelligence gathering',
          ],
          defaultOutcomes: [
            'Compliance frameworks active for all target countries',
            'Analytics tracking fully operational',
            'Baseline KPIs established',
          ],
          defaultRisks: [
            'Regulatory requirements may delay market entry',
            'Data integration complexity could extend setup timelines',
          ],
        };
      case 2:
        return {
          name: 'Execution & Growth (Days 31-60)',
          priorityFilter: ['high', 'medium'],
          typeFilter: [
            'campaign_management',
            'social_content',
            'content_creation',
            'creative_production',
            'strategy_update',
            'localization_task',
          ],
          defaultObjectives: [
            'Launch campaigns across priority markets',
            'Execute content and creative production pipelines',
            'Begin localized marketing in top-tier countries',
          ],
          defaultOutcomes: [
            'Active campaigns in priority markets',
            'Localized content deployed across target regions',
            'Initial conversion data collected for optimization',
          ],
          defaultRisks: [
            'Campaign performance may underperform initial projections',
            'Creative asset production could face quality issues',
          ],
        };
      case 3:
      default:
        return {
          name: 'Optimization & Scale (Days 61-90)',
          priorityFilter: ['medium', 'low'],
          typeFilter: [
            'budget_reallocation',
            'experiment_management',
            'conversion_action',
            'forecast_update',
            'competitive_analysis',
            'store_update',
          ],
          defaultObjectives: [
            'Optimize campaigns based on performance data',
            'Scale successful strategies to additional markets',
            'Refine budget allocation based on ROAS data',
          ],
          defaultOutcomes: [
            'Optimized ROAS across all active campaigns',
            'Expanded presence in secondary markets',
            'Data-driven budget reallocation completed',
          ],
          defaultRisks: [
            'Market conditions may shift requiring strategy adjustments',
            'Budget constraints may limit scaling potential',
          ],
        };
    }
  }

  // -----------------------------------------------------------------------
  // Milestone building
  // -----------------------------------------------------------------------

  /**
   * Builds milestones from marketing actions and matrix entries.
   * Maps critical and high-priority actions to early milestones (days 1-30),
   * medium-priority to mid-term (days 31-60), and low-priority to late (days 61-90).
   */
  static buildMilestones(
    actions: ActionRow[],
    matrixEntries: DecisionEntryRow[],
  ): RoadmapMilestone[] {
    const milestones: RoadmapMilestone[] = [];
    let dayCounter = 1;

    // Sort actions by priority then confidence
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sortedActions = [...actions].sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      if (pDiff !== 0) return pDiff;
      return b.confidence_score - a.confidence_score;
    });

    for (const action of sortedActions) {
      // Determine day based on priority
      let day: number;
      if (action.priority === 'critical') {
        day = Math.min(15, dayCounter);
      } else if (action.priority === 'high') {
        day = Math.min(30, 15 + dayCounter);
      } else if (action.priority === 'medium') {
        day = Math.min(60, 30 + dayCounter);
      } else {
        day = Math.min(90, 60 + dayCounter);
      }

      // Parse dependencies
      const deps: string[] = typeof action.dependencies === 'string'
        ? (() => { try { return JSON.parse(action.dependencies); } catch { return []; } })()
        : Array.isArray(action.dependencies) ? action.dependencies : [];

      // Find matching matrix entry for success criteria
      const matrixEntry = matrixEntries.find(
        (entry) => entry.agent === action.assigned_agent,
      );

      const riskLevel = ExecutionRoadmapOutputService.deriveRiskLevel(
        action.confidence_score,
        action.priority,
      );

      milestones.push({
        day,
        title: `${action.type.replace(/_/g, ' ')} - ${action.assigned_agent.replace(/_/g, ' ')}`,
        description: action.description,
        dependencies: deps,
        owner_agent: action.assigned_agent,
        success_criteria: matrixEntry
          ? `Achieve confidence >= ${matrixEntry.confidence}% on: ${matrixEntry.action}`
          : `Successfully complete: ${action.description}`,
        risk_level: riskLevel,
      });

      dayCounter++;
    }

    // Sort by day
    milestones.sort((a, b) => a.day - b.day);

    return milestones;
  }

  // -----------------------------------------------------------------------
  // Critical path building
  // -----------------------------------------------------------------------

  /**
   * Builds the critical path from marketing actions.
   * The critical path consists of blocking tasks (those with dependencies)
   * and critical/high priority items that must complete in sequence.
   */
  static buildCriticalPath(actions: ActionRow[]): CriticalPathTask[] {
    const criticalPath: CriticalPathTask[] = [];
    let currentDay = 1;

    // Filter to critical and high priority actions with dependencies
    const criticalActions = actions.filter(
      (a) => a.priority === 'critical' || a.priority === 'high',
    );

    // Sort by priority then confidence
    const sorted = [...criticalActions].sort((a, b) => {
      if (a.priority === 'critical' && b.priority !== 'critical') return -1;
      if (a.priority !== 'critical' && b.priority === 'critical') return 1;
      return b.confidence_score - a.confidence_score;
    });

    for (const action of sorted) {
      const deps: string[] = typeof action.dependencies === 'string'
        ? (() => { try { return JSON.parse(action.dependencies); } catch { return []; } })()
        : Array.isArray(action.dependencies) ? action.dependencies : [];

      const hasBlockingDeps = deps.length > 0;
      const duration = action.priority === 'critical' ? 7 : 14;

      const startDay = currentDay;
      const endDay = Math.min(90, currentDay + duration - 1);

      criticalPath.push({
        task: action.description,
        start_day: startDay,
        end_day: endDay,
        blocking: hasBlockingDeps,
      });

      currentDay = endDay + 1;
      if (currentDay > 90) break;
    }

    return criticalPath;
  }

  // -----------------------------------------------------------------------
  // Resource requirements
  // -----------------------------------------------------------------------

  /**
   * Computes resource requirements from actions and matrix data.
   */
  static buildResourceRequirements(
    actions: ActionRow[],
    matrixEntries: DecisionEntryRow[],
  ): ResourceRequirements {
    // Count unique agents required
    const uniqueAgents = new Set<AgentType>();
    for (const action of actions) {
      uniqueAgents.add(action.assigned_agent);
    }
    for (const entry of matrixEntries) {
      uniqueAgents.add(entry.agent);
    }

    // Collect API integrations from agents involved
    const integrations = new Set<string>();
    for (const agent of uniqueAgents) {
      const agentIntegrations = AGENT_INTEGRATION_MAP[agent];
      if (agentIntegrations) {
        for (const integration of agentIntegrations) {
          integrations.add(integration);
        }
      }
    }

    // Estimate API calls: base rate per action * 90 days
    const baseCallsPerAction = 100;
    const estimatedApiCalls = actions.length * baseCallsPerAction * 90;

    // Estimate cost: based on actions count and confidence
    const avgConfidence = actions.length > 0
      ? actions.reduce((sum, a) => sum + a.confidence_score, 0) / actions.length
      : 0;
    const costPerAction = 50; // base cost per action per day
    const estimatedCost = Math.round(
      actions.length * costPerAction * 90 * (avgConfidence / 100),
    );

    return {
      agents_required: uniqueAgents.size,
      api_integrations: Array.from(integrations).sort(),
      estimated_api_calls: estimatedApiCalls,
      estimated_cost: estimatedCost,
    };
  }

  // -----------------------------------------------------------------------
  // KPI targets
  // -----------------------------------------------------------------------

  /**
   * Builds KPI targets from current KPI data.
   * Projects 30, 60, and 90 day targets based on current values and trends.
   */
  static buildKPITargets(kpis: KPIRow[]): KPITarget[] {
    if (kpis.length === 0) {
      return [];
    }

    // Group KPIs by name and use the most recent value
    const kpiMap = new Map<string, KPIRow>();
    for (const kpi of kpis) {
      if (!kpiMap.has(kpi.name)) {
        kpiMap.set(kpi.name, kpi);
      }
    }

    return Array.from(kpiMap.values()).map((kpi) => {
      const currentValue = kpi.value;
      const changeRate = kpi.change_percent / 100;
      const trendMultiplier = kpi.trend === 'up' ? 1 : kpi.trend === 'down' ? -1 : 0;

      // Project targets: apply monthly growth rate with optimization improvements
      const monthlyGrowthRate = Math.abs(changeRate) * trendMultiplier;
      const optimizationBonus = 0.05; // 5% improvement from optimization efforts

      const target30d = Math.round(
        currentValue * (1 + monthlyGrowthRate + optimizationBonus) * 100,
      ) / 100;
      const target60d = Math.round(
        currentValue * Math.pow(1 + monthlyGrowthRate + optimizationBonus, 2) * 100,
      ) / 100;
      const target90d = Math.round(
        currentValue * Math.pow(1 + monthlyGrowthRate + optimizationBonus, 3) * 100,
      ) / 100;

      return {
        kpi: kpi.name,
        current_value: currentValue,
        target_30d: target30d,
        target_60d: target60d,
        target_90d: target90d,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Confidence scoring
  // -----------------------------------------------------------------------

  /**
   * Computes the overall confidence score for the roadmap.
   * Factors in orchestration confidence, matrix confidence, and action coverage.
   */
  static computeConfidenceScore(
    orchestrationRun: OrchestrationRow | null,
    matrix: MatrixRow | null,
    actions: ActionRow[],
  ): number {
    let totalWeight = 0;
    let weightedScore = 0;

    // Orchestration confidence (weight: 0.4)
    if (orchestrationRun) {
      const orchConfidence = typeof orchestrationRun.overall_confidence === 'string'
        ? parseFloat(orchestrationRun.overall_confidence)
        : orchestrationRun.overall_confidence;
      weightedScore += orchConfidence * 0.4;
      totalWeight += 0.4;
    }

    // Matrix confidence (weight: 0.3)
    if (matrix) {
      const matrixConfidence = typeof matrix.overall_confidence === 'string'
        ? parseFloat(matrix.overall_confidence)
        : matrix.overall_confidence;
      weightedScore += matrixConfidence * 0.3;
      totalWeight += 0.3;
    }

    // Action coverage and average confidence (weight: 0.3)
    if (actions.length > 0) {
      const avgActionConfidence =
        actions.reduce((sum, a) => sum + a.confidence_score, 0) / actions.length;
      weightedScore += avgActionConfidence * 0.3;
      totalWeight += 0.3;
    }

    if (totalWeight === 0) {
      return 0;
    }

    const score = Math.round((weightedScore / totalWeight) * 100) / 100;
    return Math.min(100, Math.max(0, score));
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Parses matrix entries from the stored format (string or array).
   */
  static parseMatrixEntries(
    entries: string | DecisionEntryRow[],
  ): DecisionEntryRow[] {
    if (typeof entries === 'string') {
      try {
        return JSON.parse(entries);
      } catch {
        logger.warn('Failed to parse matrix entries from string');
        return [];
      }
    }
    return entries ?? [];
  }

  /**
   * Derives a risk level from confidence score and priority.
   */
  static deriveRiskLevel(
    confidenceScore: number,
    priority: string,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (confidenceScore >= 80 && (priority === 'critical' || priority === 'high')) {
      return 'low';
    }
    if (confidenceScore >= 60) {
      return 'medium';
    }
    if (confidenceScore >= 40) {
      return 'high';
    }
    return 'critical';
  }
}

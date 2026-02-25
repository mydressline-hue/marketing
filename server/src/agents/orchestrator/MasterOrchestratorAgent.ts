// ============================================================
// AI International Growth Engine - Master Orchestrator Agent (#20)
// Phase 3D: The central agent that aggregates all 19 sub-agents,
//           detects contradictions, forces cross-challenges, and
//           produces the final decision matrix.
// ============================================================

import type { AgentType, CrossChallengeResult } from '../../types';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
  AgentChallengeRequest,
  AgentChallengeResponse,
} from '../base/types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger, createChildLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import {
  AgentAggregator,
  type AggregatedResult,
  type AgentConflict,
} from './AgentAggregator';
import {
  DecisionMatrixGenerator,
  type DecisionMatrix,
} from './DecisionMatrix';
import {
  ActionAssigner,
  type MarketingAction,
} from './ActionAssigner';

// ---- Constants ----

/** All agent types except the orchestrator itself */
const ALL_SUB_AGENTS: AgentType[] = [
  'market_intelligence',
  'country_strategy',
  'paid_ads',
  'organic_social',
  'content_blog',
  'creative_generation',
  'performance_analytics',
  'budget_optimization',
  'ab_testing',
  'conversion_optimization',
  'shopify_integration',
  'localization',
  'compliance',
  'competitive_intelligence',
  'fraud_detection',
  'brand_consistency',
  'data_engineering',
  'enterprise_security',
  'revenue_forecasting',
];

/** Maximum number of cross-challenge cycles before the orchestrator accepts the current state */
const MAX_CHALLENGE_CYCLES = 3;

/** Cache key prefix for agent outputs */
const AGENT_OUTPUT_CACHE_PREFIX = 'agent:output:';

/** Cache TTL for agent outputs (10 minutes) */
const AGENT_OUTPUT_CACHE_TTL = 600;

/** Cache key for the latest orchestration result */
const ORCHESTRATION_RESULT_CACHE_KEY = 'orchestrator:result:latest';
const ORCHESTRATION_RESULT_CACHE_TTL = 300;

// ---- Interfaces ----

/**
 * A detected contradiction between two agent outputs.
 */
export interface Contradiction {
  /** The agents whose outputs contradict each other */
  agentA: AgentType;
  agentB: AgentType;
  /** The domain area of the contradiction */
  area: string;
  /** Description of the contradiction */
  description: string;
  /** How severe the contradiction is */
  severity: 'info' | 'warning' | 'critical';
  /** Whether this contradiction was resolved via a challenge cycle */
  resolved: boolean;
  /** Optional resolution description */
  resolution?: string;
}

/**
 * The complete result of an orchestration cycle.
 */
export interface OrchestrationResult {
  /** Unique identifier for this orchestration run */
  id: string;
  /** The request ID that triggered the orchestration */
  requestId: string;
  /** Aggregated summary of all agent outputs */
  aggregation: AggregatedResult;
  /** The final decision matrix */
  decisionMatrix: DecisionMatrix;
  /** Assigned marketing actions */
  actions: MarketingAction[];
  /** Contradictions detected during the run */
  contradictions: Contradiction[];
  /** Cross-challenge results from resolution cycles */
  challengeResults: CrossChallengeResult[];
  /** Number of challenge cycles that were executed */
  challengeCyclesRun: number;
  /** Overall confidence of the orchestration */
  overallConfidence: AgentConfidenceScore;
  /** Human-readable explanation of the orchestration decisions */
  reasoning: string;
  /** ISO-8601 timestamp of completion */
  completedAt: string;
}

/**
 * Explainable decision log entry for audit purposes.
 */
export interface DecisionLogEntry {
  /** Unique identifier */
  id: string;
  /** The orchestration run this belongs to */
  orchestrationId: string;
  /** Which phase of the orchestration produced this log */
  phase: 'aggregation' | 'contradiction_detection' | 'challenge_cycle' | 'matrix_generation' | 'action_assignment';
  /** Summary of what happened in this phase */
  summary: string;
  /** Detailed data from this phase */
  details: Record<string, unknown>;
  /** ISO-8601 timestamp */
  timestamp: string;
}

// ============================================================
// MasterOrchestratorAgent
// ============================================================

export class MasterOrchestratorAgent {
  protected readonly config: AgentConfig;
  protected readonly agentLogger: ReturnType<typeof createChildLogger>;

  private readonly aggregator: AgentAggregator;
  private readonly matrixGenerator: DecisionMatrixGenerator;
  private readonly actionAssigner: ActionAssigner;

  constructor() {
    this.config = {
      agentType: 'master_orchestrator',
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 120_000,
      confidenceThreshold: 60,
    };

    this.agentLogger = createChildLogger({
      agent: 'master_orchestrator',
      model: 'opus',
    });

    this.aggregator = new AgentAggregator();
    this.matrixGenerator = new DecisionMatrixGenerator();
    this.actionAssigner = new ActionAssigner();
  }

  // ----------------------------------------------------------
  // BaseAgent interface methods
  // ----------------------------------------------------------

  /**
   * Main processing entry point. Collects all sub-agent outputs,
   * runs the full orchestration pipeline, and returns a comprehensive
   * AgentOutput containing the final decisions.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.agentLogger.info('Starting orchestration process', {
      requestId: input.requestId,
    });

    const startTime = Date.now();

    try {
      // Run the full orchestration cycle
      const result = await this.runOrchestrationCycle(input.requestId);

      const elapsed = Date.now() - startTime;
      this.agentLogger.info('Orchestration process completed', {
        requestId: input.requestId,
        elapsedMs: elapsed,
        contradictions: result.contradictions.length,
        actions: result.actions.length,
        overallConfidence: result.overallConfidence.score,
      });

      return this.buildOutput(
        result.decisionMatrix,
        result,
        input.requestId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.agentLogger.error('Orchestration process failed', {
        requestId: input.requestId,
        error: message,
      });
      throw error;
    }
  }

  /**
   * Returns the system prompt used when the orchestrator calls the
   * Opus model for reasoning about contradictions and final decisions.
   */
  getSystemPrompt(): string {
    return `You are the Master Orchestrator Agent for an AI-powered International Growth Engine.
Your role is to:
1. Analyze outputs from 19 specialized marketing AI agents.
2. Detect contradictions, inconsistencies, and conflicts between agent recommendations.
3. Determine which agent decisions should be prioritized based on confidence, relevance, and strategic alignment.
4. Produce a unified decision matrix that resolves conflicts and maximizes marketing ROI.
5. Assign concrete marketing actions with clear priorities and dependencies.

When analyzing contradictions:
- Identify the root cause of each disagreement.
- Consider which agent has higher domain expertise for the specific issue.
- Factor in confidence scores: higher-confidence agents get more weight.
- Flag unresolvable contradictions for human review.

When producing the decision matrix:
- Compliance and security decisions always take precedence over growth decisions.
- Budget decisions must align with revenue forecasts within a 15% tolerance.
- Creative and content decisions must pass brand consistency checks.
- All decisions must include actionable next steps.

Respond with structured JSON analysis. Be precise, data-driven, and transparent in your reasoning.`;
  }

  /**
   * Returns all 19 sub-agent types that this orchestrator challenges.
   */
  getChallengeTargets(): AgentType[] {
    return [...ALL_SUB_AGENTS];
  }

  // ----------------------------------------------------------
  // Core orchestration
  // ----------------------------------------------------------

  /**
   * Executes the full orchestration cycle:
   *  1. Collect all 19 agent outputs (from DB/cache)
   *  2. Aggregate via AgentAggregator
   *  3. Detect contradictions
   *  4. Force cross-challenge cycles if contradictions found
   *  5. Produce final DecisionMatrix
   *  6. Assign marketing actions via ActionAssigner
   *  7. Generate explainable decision logs
   *  8. Persist results
   *
   * @param requestId - Unique identifier for this orchestration request.
   * @returns The complete OrchestrationResult.
   */
  async runOrchestrationCycle(requestId: string): Promise<OrchestrationResult> {
    const orchestrationId = generateId();
    const decisionLog: DecisionLogEntry[] = [];

    this.agentLogger.info('Starting orchestration cycle', {
      orchestrationId,
      requestId,
    });

    // ---- Step 1: Collect agent outputs ----
    const outputs = await this.collectAgentOutputs(requestId);

    this.agentLogger.info('Collected agent outputs', {
      orchestrationId,
      collected: outputs.size,
      missing: ALL_SUB_AGENTS.filter((a) => !outputs.has(a)),
    });

    // ---- Step 2: Aggregate ----
    const aggregation = this.aggregator.aggregateOutputs(outputs);

    decisionLog.push({
      id: generateId(),
      orchestrationId,
      phase: 'aggregation',
      summary: `Aggregated ${aggregation.responding}/${aggregation.totalAgents} agent outputs. Average confidence: ${aggregation.averageConfidence}.`,
      details: {
        responding: aggregation.responding,
        totalAgents: aggregation.totalAgents,
        averageConfidence: aggregation.averageConfidence,
        highestConfidence: aggregation.highestConfidence,
        lowestConfidence: aggregation.lowestConfidence,
        recommendationCount: aggregation.recommendations.length,
        warningCount: aggregation.warnings.length,
      },
      timestamp: new Date().toISOString(),
    });

    // ---- Step 3: Detect contradictions ----
    const contradictions = this.detectContradictions(outputs);

    decisionLog.push({
      id: generateId(),
      orchestrationId,
      phase: 'contradiction_detection',
      summary: `Detected ${contradictions.length} contradiction(s) across agent outputs.`,
      details: {
        contradictions: contradictions.map((c) => ({
          agents: [c.agentA, c.agentB],
          area: c.area,
          severity: c.severity,
          description: c.description,
        })),
      },
      timestamp: new Date().toISOString(),
    });

    // ---- Step 4: Cross-challenge cycles ----
    let challengeResults: CrossChallengeResult[] = [];
    let challengeCyclesRun = 0;

    const unresolvedContradictions = contradictions.filter(
      (c) => c.severity === 'critical' || c.severity === 'warning',
    );

    if (unresolvedContradictions.length > 0) {
      const challengeOutcome = await this.runChallengeCycles(
        unresolvedContradictions,
        outputs,
        orchestrationId,
      );

      challengeResults = challengeOutcome.results;
      challengeCyclesRun = challengeOutcome.cyclesRun;

      // Mark resolved contradictions
      for (const contradiction of contradictions) {
        const resolved = challengeResults.find(
          (cr) =>
            cr.resolved &&
            ((cr.challenger === contradiction.agentA && cr.challenged === contradiction.agentB) ||
              (cr.challenger === contradiction.agentB && cr.challenged === contradiction.agentA)),
        );
        if (resolved) {
          contradiction.resolved = true;
          contradiction.resolution = resolved.finding;
        }
      }

      decisionLog.push({
        id: generateId(),
        orchestrationId,
        phase: 'challenge_cycle',
        summary: `Executed ${challengeCyclesRun} challenge cycle(s). Resolved ${challengeResults.filter((r) => r.resolved).length}/${challengeResults.length} findings.`,
        details: {
          cyclesRun: challengeCyclesRun,
          totalFindings: challengeResults.length,
          resolvedFindings: challengeResults.filter((r) => r.resolved).length,
          findings: challengeResults,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ---- Step 5: Generate decision matrix ----
    const rawMatrix = this.matrixGenerator.generateMatrix(outputs, requestId);
    const decisionMatrix = this.matrixGenerator.prioritizeDecisions(rawMatrix);

    decisionLog.push({
      id: generateId(),
      orchestrationId,
      phase: 'matrix_generation',
      summary: `Generated decision matrix with ${decisionMatrix.entries.length} entries. Overall confidence: ${decisionMatrix.overallConfidence}.`,
      details: {
        matrixId: decisionMatrix.id,
        entryCount: decisionMatrix.entries.length,
        overallConfidence: decisionMatrix.overallConfidence,
        approvedCount: decisionMatrix.entries.filter((e) => e.approved).length,
        pendingReviewCount: decisionMatrix.entries.filter((e) => !e.approved).length,
      },
      timestamp: new Date().toISOString(),
    });

    // ---- Step 6: Assign actions ----
    const rawActions = this.actionAssigner.assignActions(decisionMatrix);
    const actions = this.actionAssigner.prioritizeActions(rawActions);

    decisionLog.push({
      id: generateId(),
      orchestrationId,
      phase: 'action_assignment',
      summary: `Assigned ${actions.length} marketing actions. Executable now: ${this.actionAssigner.getExecutableActions(actions).length}.`,
      details: {
        totalActions: actions.length,
        executable: this.actionAssigner.getExecutableActions(actions).length,
        byPriority: {
          critical: actions.filter((a) => a.priority === 'critical').length,
          high: actions.filter((a) => a.priority === 'high').length,
          medium: actions.filter((a) => a.priority === 'medium').length,
          low: actions.filter((a) => a.priority === 'low').length,
        },
      },
      timestamp: new Date().toISOString(),
    });

    // ---- Step 7: Compute overall confidence ----
    const overallConfidence = this.calculateConfidence({
      agentCoverage: (aggregation.responding / aggregation.totalAgents) * 100,
      averageAgentConfidence: aggregation.averageConfidence,
      contradictionPenalty: Math.max(0, 100 - contradictions.length * 15),
      resolutionBonus: challengeResults.length > 0
        ? (challengeResults.filter((r) => r.resolved).length / challengeResults.length) * 100
        : 100,
      matrixConfidence: decisionMatrix.overallConfidence,
    });

    // ---- Build reasoning string ----
    const reasoning = this.buildReasoning(
      aggregation,
      contradictions,
      challengeResults,
      decisionMatrix,
      actions,
    );

    // ---- Construct result ----
    const result: OrchestrationResult = {
      id: orchestrationId,
      requestId,
      aggregation,
      decisionMatrix,
      actions,
      contradictions,
      challengeResults,
      challengeCyclesRun,
      overallConfidence,
      reasoning,
      completedAt: new Date().toISOString(),
    };

    // ---- Step 8: Persist everything ----
    await this.persistOrchestrationResult(result, decisionLog);

    this.agentLogger.info('Orchestration cycle complete', {
      orchestrationId,
      requestId,
      overallConfidence: overallConfidence.score,
      actionsAssigned: actions.length,
      contradictionsFound: contradictions.length,
      contradictionsResolved: contradictions.filter((c) => c.resolved).length,
    });

    return result;
  }

  // ----------------------------------------------------------
  // Contradiction detection
  // ----------------------------------------------------------

  /**
   * Detects contradictions across all agent outputs.
   * Combines rule-based conflict detection from the aggregator
   * with confidence-divergence analysis.
   *
   * @param outputs - Map of all agent outputs.
   * @returns Array of detected contradictions.
   */
  detectContradictions(outputs: Map<AgentType, AgentOutput>): Contradiction[] {
    this.agentLogger.info('Detecting contradictions', {
      agentCount: outputs.size,
    });

    const contradictions: Contradiction[] = [];

    // ---- Rule-based conflicts from aggregator ----
    const conflicts = this.aggregator.identifyConflicts(outputs);
    for (const conflict of conflicts) {
      const severity = this.assessConflictSeverity(conflict, outputs);
      contradictions.push({
        agentA: conflict.agents[0],
        agentB: conflict.agents[1],
        area: conflict.area,
        description: conflict.conflict,
        severity,
        resolved: false,
      });
    }

    // ---- Cross-decision contradiction detection ----
    // Look for agents that make opposing directional recommendations
    // but were not caught by the predefined rules
    const outputEntries = Array.from(outputs.entries());
    for (let i = 0; i < outputEntries.length; i++) {
      for (let j = i + 1; j < outputEntries.length; j++) {
        const [agentA, outputA] = outputEntries[i];
        const [agentB, outputB] = outputEntries[j];

        // Skip pairs already covered by rule-based detection
        const alreadyCovered = contradictions.some(
          (c) =>
            (c.agentA === agentA && c.agentB === agentB) ||
            (c.agentA === agentB && c.agentB === agentA),
        );
        if (alreadyCovered) continue;

        // Check for warning contradictions in shared warning areas
        const sharedWarningContradiction = this.detectWarningContradiction(
          agentA, outputA, agentB, outputB,
        );
        if (sharedWarningContradiction) {
          contradictions.push(sharedWarningContradiction);
        }
      }
    }

    this.agentLogger.info('Contradiction detection complete', {
      total: contradictions.length,
      critical: contradictions.filter((c) => c.severity === 'critical').length,
      warning: contradictions.filter((c) => c.severity === 'warning').length,
      info: contradictions.filter((c) => c.severity === 'info').length,
    });

    return contradictions;
  }

  // ----------------------------------------------------------
  // Cross-challenge execution
  // ----------------------------------------------------------

  /**
   * Forces challenge cycles on the conflicting agents until
   * contradictions are resolved or MAX_CHALLENGE_CYCLES is reached.
   *
   * @param agents - Agent types to include in the challenge.
   */
  async forceChallengeCycle(agents: AgentType[]): Promise<void> {
    this.agentLogger.info('Forcing challenge cycle', { agents });

    for (const agent of agents) {
      const challengeRequest: AgentChallengeRequest = {
        challengeId: generateId(),
        challengerType: 'master_orchestrator',
        challengedType: agent,
        decision: await this.getAgentOutput(agent) as AgentOutput,
        focusAreas: ['accuracy', 'consistency', 'risk'],
        requestedAt: new Date().toISOString(),
      };

      await this.persistChallengeRequest(challengeRequest);
    }
  }

  // ----------------------------------------------------------
  // Private: Agent output collection
  // ----------------------------------------------------------

  /**
   * Collects the latest outputs from all 19 sub-agents.
   * Checks Redis cache first, then falls back to the database.
   */
  private async collectAgentOutputs(
    requestId: string,
  ): Promise<Map<AgentType, AgentOutput>> {
    const outputs = new Map<AgentType, AgentOutput>();

    const collectionPromises = ALL_SUB_AGENTS.map(async (agentType) => {
      const output = await this.getAgentOutput(agentType, requestId);
      if (output) {
        outputs.set(agentType, output);
      } else {
        this.agentLogger.warn('No output found for agent', {
          agentType,
          requestId,
        });
      }
    });

    await Promise.all(collectionPromises);

    return outputs;
  }

  /**
   * Retrieves a single agent's output from cache or database.
   */
  private async getAgentOutput(
    agentType: AgentType,
    requestId?: string,
  ): Promise<AgentOutput | null> {
    // Try cache
    const cacheKey = `${AGENT_OUTPUT_CACHE_PREFIX}${agentType}`;
    const cached = await cacheGet<AgentOutput>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fall back to database
    const queryText = requestId
      ? `SELECT * FROM agent_decisions
         WHERE agent_type = $1 AND input_data->>'requestId' = $2
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM agent_decisions
         WHERE agent_type = $1
         ORDER BY created_at DESC LIMIT 1`;

    const params = requestId ? [agentType, requestId] : [agentType];
    const result = await pool.query(queryText, params);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const output: AgentOutput = {
      agentType: row.agent_type,
      decision: row.decision_type,
      data: typeof row.output_data === 'string' ? JSON.parse(row.output_data) : row.output_data,
      confidence: {
        score: parseFloat(row.confidence_score),
        level: this.scoreToLevel(parseFloat(row.confidence_score)),
        factors: (typeof row.output_data === 'string' ? JSON.parse(row.output_data) : row.output_data)?.confidenceFactors ?? {},
      },
      reasoning: row.reasoning,
      recommendations: (typeof row.output_data === 'string' ? JSON.parse(row.output_data) : row.output_data)?.recommendations ?? [],
      warnings: (typeof row.output_data === 'string' ? JSON.parse(row.output_data) : row.output_data)?.warnings ?? [],
      uncertainties: (typeof row.output_data === 'string' ? JSON.parse(row.output_data) : row.output_data)?.uncertainties ?? [],
      timestamp: row.created_at,
    };

    // Warm cache
    await cacheSet(cacheKey, output, AGENT_OUTPUT_CACHE_TTL);

    return output;
  }

  // ----------------------------------------------------------
  // Private: Challenge cycle runner
  // ----------------------------------------------------------

  /**
   * Runs iterative challenge cycles on unresolved contradictions.
   * Each cycle:
   *  1. Identifies the conflicting agent pairs.
   *  2. Sends challenge requests.
   *  3. Collects challenge responses from the database (agents process async).
   *  4. Evaluates whether contradictions are resolved.
   *
   * Stops when all contradictions are resolved or MAX_CHALLENGE_CYCLES is hit.
   */
  private async runChallengeCycles(
    contradictions: Contradiction[],
    outputs: Map<AgentType, AgentOutput>,
    orchestrationId: string,
  ): Promise<{ results: CrossChallengeResult[]; cyclesRun: number }> {
    const allResults: CrossChallengeResult[] = [];
    let cyclesRun = 0;
    let unresolved = [...contradictions];

    while (unresolved.length > 0 && cyclesRun < MAX_CHALLENGE_CYCLES) {
      cyclesRun++;
      this.agentLogger.info('Running challenge cycle', {
        cycle: cyclesRun,
        unresolvedCount: unresolved.length,
        orchestrationId,
      });

      // Collect unique agents involved in unresolved contradictions
      const involvedAgents = new Set<AgentType>();
      for (const c of unresolved) {
        involvedAgents.add(c.agentA);
        involvedAgents.add(c.agentB);
      }

      // Issue challenge requests for each contradiction pair
      const cycleResults: CrossChallengeResult[] = [];

      for (const contradiction of unresolved) {
        const outputA = outputs.get(contradiction.agentA);
        const outputB = outputs.get(contradiction.agentB);

        if (!outputA || !outputB) continue;

        // Agent A challenges Agent B's decision
        const challengeAB = await this.issueCrossChallenge(
          contradiction.agentA,
          contradiction.agentB,
          outputB,
          contradiction.area,
          orchestrationId,
        );
        if (challengeAB) cycleResults.push(challengeAB);

        // Agent B challenges Agent A's decision
        const challengeBA = await this.issueCrossChallenge(
          contradiction.agentB,
          contradiction.agentA,
          outputA,
          contradiction.area,
          orchestrationId,
        );
        if (challengeBA) cycleResults.push(challengeBA);
      }

      allResults.push(...cycleResults);

      // Determine which contradictions are now resolved
      unresolved = unresolved.filter((c) => {
        const resolved = cycleResults.some(
          (cr) =>
            cr.resolved &&
            ((cr.challenger === c.agentA && cr.challenged === c.agentB) ||
              (cr.challenger === c.agentB && cr.challenged === c.agentA)),
        );
        return !resolved;
      });

      this.agentLogger.info('Challenge cycle completed', {
        cycle: cyclesRun,
        newResults: cycleResults.length,
        remainingUnresolved: unresolved.length,
      });
    }

    if (unresolved.length > 0) {
      this.agentLogger.warn('Unresolved contradictions after max challenge cycles', {
        unresolvedCount: unresolved.length,
        maxCycles: MAX_CHALLENGE_CYCLES,
        contradictions: unresolved.map((c) => ({
          agents: [c.agentA, c.agentB],
          area: c.area,
        })),
      });
    }

    return { results: allResults, cyclesRun };
  }

  /**
   * Issues a single cross-challenge from one agent to another and
   * persists the result.  The challenge is recorded but actual agent
   * re-evaluation happens asynchronously; this method creates the
   * CrossChallengeResult based on available data.
   */
  private async issueCrossChallenge(
    challenger: AgentType,
    challenged: AgentType,
    challengedOutput: AgentOutput,
    focusArea: string,
    orchestrationId: string,
  ): Promise<CrossChallengeResult> {
    const challengeId = generateId();

    this.agentLogger.info('Issuing cross-challenge', {
      challengeId,
      challenger,
      challenged,
      focusArea,
      orchestrationId,
    });

    // Build challenge request
    const request: AgentChallengeRequest = {
      challengeId,
      challengerType: challenger,
      challengedType: challenged,
      decision: challengedOutput,
      focusAreas: [focusArea, 'data_accuracy', 'strategic_alignment'],
      requestedAt: new Date().toISOString(),
    };

    await this.persistChallengeRequest(request);

    // Check if there is already a cached challenge response
    const existingResponse = await this.getChallengeResponse(challengeId);

    // Build result from response or mark as pending
    const result: CrossChallengeResult = {
      challenger,
      challenged,
      finding: existingResponse
        ? `Challenge resolved: ${existingResponse.verdict}. ${existingResponse.findings.map((f) => f.finding).join('; ')}`
        : `Challenge issued from ${challenger} to ${challenged} on ${focusArea}. Awaiting resolution.`,
      severity: existingResponse
        ? this.verdictToSeverity(existingResponse.verdict)
        : 'warning',
      confidence: existingResponse?.confidence?.score ?? 50,
      resolved: existingResponse ? existingResponse.verdict === 'agree' : false,
    };

    // Persist cross-challenge result
    await this.persistCrossChallenge(result, orchestrationId);

    return result;
  }

  // ----------------------------------------------------------
  // Private: Confidence calculation
  // ----------------------------------------------------------

  /**
   * Computes the orchestrator's overall confidence from multiple factors.
   */
  protected calculateConfidence(
    factors: Record<string, number>,
  ): AgentConfidenceScore {
    const weights: Record<string, number> = {
      agentCoverage: 0.25,
      averageAgentConfidence: 0.30,
      contradictionPenalty: 0.20,
      resolutionBonus: 0.10,
      matrixConfidence: 0.15,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [factor, value] of Object.entries(factors)) {
      const weight = weights[factor] ?? 0.1;
      weightedSum += value * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 100) / 100
      : 0;

    return {
      score: Math.min(100, Math.max(0, score)),
      level: this.scoreToLevel(score),
      factors,
    };
  }

  // ----------------------------------------------------------
  // Private: Output building
  // ----------------------------------------------------------

  /**
   * Constructs the final AgentOutput from the orchestration result.
   */
  private buildOutput(
    matrix: DecisionMatrix,
    result: OrchestrationResult,
    requestId: string,
  ): AgentOutput {
    const approvedEntries = this.matrixGenerator.getApprovedActions(matrix);
    const executableActions = this.actionAssigner.getExecutableActions(result.actions);

    return {
      agentType: 'master_orchestrator',
      decision: `Orchestration complete. ${approvedEntries.length} decisions approved, ${executableActions.length} actions ready for execution. ${result.contradictions.length} contradictions detected, ${result.contradictions.filter((c) => c.resolved).length} resolved.`,
      data: {
        orchestrationId: result.id,
        requestId,
        matrixId: matrix.id,
        aggregation: {
          responding: result.aggregation.responding,
          totalAgents: result.aggregation.totalAgents,
          averageConfidence: result.aggregation.averageConfidence,
        },
        approvedDecisions: approvedEntries.length,
        pendingReview: matrix.entries.length - approvedEntries.length,
        executableActions: executableActions.length,
        totalActions: result.actions.length,
        contradictions: {
          total: result.contradictions.length,
          resolved: result.contradictions.filter((c) => c.resolved).length,
          unresolved: result.contradictions.filter((c) => !c.resolved).length,
          critical: result.contradictions.filter((c) => c.severity === 'critical').length,
        },
        challengeCyclesRun: result.challengeCyclesRun,
        decisionMatrix: matrix,
        actions: result.actions,
      },
      confidence: result.overallConfidence,
      reasoning: result.reasoning,
      recommendations: result.aggregation.recommendations.slice(0, 20),
      warnings: [
        ...result.aggregation.warnings.slice(0, 10),
        ...result.contradictions
          .filter((c) => !c.resolved && c.severity === 'critical')
          .map((c) => `UNRESOLVED CRITICAL: ${c.description}`),
      ],
      uncertainties: [
        ...result.aggregation.uncertainties.slice(0, 10),
        ...(result.aggregation.responding < result.aggregation.totalAgents
          ? [`${result.aggregation.totalAgents - result.aggregation.responding} agent(s) did not respond`]
          : []),
      ],
      timestamp: result.completedAt,
    };
  }

  /**
   * Builds a human-readable reasoning string summarising the
   * entire orchestration cycle.
   */
  private buildReasoning(
    aggregation: AggregatedResult,
    contradictions: Contradiction[],
    challengeResults: CrossChallengeResult[],
    matrix: DecisionMatrix,
    actions: MarketingAction[],
  ): string {
    const parts: string[] = [];

    // Coverage
    parts.push(
      `Orchestration aggregated ${aggregation.responding} of ${aggregation.totalAgents} agents ` +
      `(${Math.round((aggregation.responding / aggregation.totalAgents) * 100)}% coverage). ` +
      `Average agent confidence: ${aggregation.averageConfidence.toFixed(1)}.`,
    );

    // Confidence leaders
    parts.push(
      `Highest confidence: ${aggregation.highestConfidence}. ` +
      `Lowest confidence: ${aggregation.lowestConfidence}.`,
    );

    // Contradictions
    if (contradictions.length > 0) {
      const critical = contradictions.filter((c) => c.severity === 'critical').length;
      const resolved = contradictions.filter((c) => c.resolved).length;
      parts.push(
        `Detected ${contradictions.length} contradiction(s) (${critical} critical). ` +
        `${resolved} resolved via ${challengeResults.length} cross-challenge(s).`,
      );

      const unresolved = contradictions.filter((c) => !c.resolved);
      if (unresolved.length > 0) {
        parts.push(
          `Unresolved contradictions: ${unresolved.map((c) => `${c.agentA} vs ${c.agentB} in ${c.area}`).join('; ')}.`,
        );
      }
    } else {
      parts.push('No contradictions detected between agent outputs.');
    }

    // Matrix
    const approved = matrix.entries.filter((e) => e.approved).length;
    parts.push(
      `Decision matrix: ${matrix.entries.length} entries, ${approved} auto-approved. ` +
      `Overall matrix confidence: ${matrix.overallConfidence.toFixed(1)}.`,
    );

    // Actions
    const critical = actions.filter((a) => a.priority === 'critical').length;
    const high = actions.filter((a) => a.priority === 'high').length;
    parts.push(
      `Assigned ${actions.length} marketing actions: ${critical} critical, ${high} high priority.`,
    );

    return parts.join(' ');
  }

  // ----------------------------------------------------------
  // Private: Persistence
  // ----------------------------------------------------------

  /**
   * Persists the complete orchestration result, decision matrix,
   * actions, and decision logs.
   */
  private async persistOrchestrationResult(
    result: OrchestrationResult,
    decisionLog: DecisionLogEntry[],
  ): Promise<void> {
    try {
      // Persist matrix and actions in parallel
      await Promise.all([
        this.matrixGenerator.persistMatrix(result.decisionMatrix),
        this.actionAssigner.persistActions(result.actions),
        this.persistDecisionLogs(decisionLog),
        this.persistOrchestrationRecord(result),
      ]);

      // Cache the latest result
      await cacheSet(
        ORCHESTRATION_RESULT_CACHE_KEY,
        result,
        ORCHESTRATION_RESULT_CACHE_TTL,
      );

      this.agentLogger.info('Orchestration result persisted', {
        orchestrationId: result.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.agentLogger.error('Failed to persist orchestration result', {
        orchestrationId: result.id,
        error: message,
      });
      // Do not rethrow: persistence failure should not break the orchestration response
    }
  }

  /**
   * Persists the top-level orchestration run record.
   */
  private async persistOrchestrationRecord(
    result: OrchestrationResult,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO orchestration_runs
         (id, request_id, overall_confidence, contradictions_found, contradictions_resolved,
          challenge_cycles_run, actions_assigned, reasoning, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        result.id,
        result.requestId,
        result.overallConfidence.score,
        result.contradictions.length,
        result.contradictions.filter((c) => c.resolved).length,
        result.challengeCyclesRun,
        result.actions.length,
        result.reasoning,
        result.completedAt,
      ],
    );
  }

  /**
   * Persists decision log entries for audit / explainability.
   */
  private async persistDecisionLogs(logs: DecisionLogEntry[]): Promise<void> {
    if (logs.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const log of logs) {
        await client.query(
          `INSERT INTO decision_logs (id, orchestration_id, phase, summary, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            log.id,
            log.orchestrationId,
            log.phase,
            log.summary,
            JSON.stringify(log.details),
            log.timestamp,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Persists a challenge request for async agent processing.
   */
  private async persistChallengeRequest(
    request: AgentChallengeRequest,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO challenge_requests
         (id, challenger_type, challenged_type, decision_data, focus_areas, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        request.challengeId,
        request.challengerType,
        request.challengedType,
        JSON.stringify(request.decision),
        JSON.stringify(request.focusAreas),
        request.requestedAt,
      ],
    );
  }

  /**
   * Persists a cross-challenge result.
   */
  private async persistCrossChallenge(
    result: CrossChallengeResult,
    orchestrationId: string,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO cross_challenge_results
         (id, orchestration_id, challenger, challenged, finding, severity, confidence, resolved, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        generateId(),
        orchestrationId,
        result.challenger,
        result.challenged,
        result.finding,
        result.severity,
        result.confidence,
        result.resolved,
        new Date().toISOString(),
      ],
    );
  }

  /**
   * Retrieves a challenge response (if one exists) for a given challenge ID.
   */
  private async getChallengeResponse(
    challengeId: string,
  ): Promise<AgentChallengeResponse | null> {
    const cacheKey = `challenge:response:${challengeId}`;
    const cached = await cacheGet<AgentChallengeResponse>(cacheKey);
    if (cached) return cached;

    const result = await pool.query(
      `SELECT * FROM challenge_responses WHERE challenge_id = $1 LIMIT 1`,
      [challengeId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const response: AgentChallengeResponse = {
      challengeId: row.challenge_id,
      challengerType: row.challenger_type,
      challengedType: row.challenged_type,
      verdict: row.verdict,
      findings: typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings,
      confidence: typeof row.confidence === 'string' ? JSON.parse(row.confidence) : row.confidence,
      suggestedChanges: typeof row.suggested_changes === 'string' ? JSON.parse(row.suggested_changes) : row.suggested_changes,
      completedAt: row.completed_at,
    };

    return response;
  }

  // ----------------------------------------------------------
  // Private: Helper methods
  // ----------------------------------------------------------

  /**
   * Converts a numeric confidence score (0-100) to a categorical level.
   */
  private scoreToLevel(score: number): 'low' | 'medium' | 'high' | 'very_high' {
    if (score >= 85) return 'very_high';
    if (score >= 65) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Assesses the severity of a conflict based on the agents involved
   * and their confidence levels.
   */
  private assessConflictSeverity(
    conflict: AgentConflict,
    outputs: Map<AgentType, AgentOutput>,
  ): 'info' | 'warning' | 'critical' {
    const [agentA, agentB] = conflict.agents;
    const outputA = outputs.get(agentA);
    const outputB = outputs.get(agentB);

    if (!outputA || !outputB) return 'info';

    // Both agents are highly confident but disagree -> critical
    if (outputA.confidence.score >= 70 && outputB.confidence.score >= 70) {
      return 'critical';
    }

    // Compliance or security agents involved -> at least warning
    const criticalAgents: AgentType[] = [
      'compliance',
      'enterprise_security',
      'fraud_detection',
    ];
    if (
      criticalAgents.includes(agentA) ||
      criticalAgents.includes(agentB)
    ) {
      return 'warning';
    }

    // Budget-related conflicts are at least warnings
    if (
      conflict.area.includes('budget') ||
      conflict.area.includes('spend')
    ) {
      return 'warning';
    }

    return 'info';
  }

  /**
   * Detects contradictions where one agent warns about an area
   * that another agent does not mention in its warnings, suggesting
   * a blindspot or disagreement about risk.
   */
  private detectWarningContradiction(
    agentA: AgentType,
    outputA: AgentOutput,
    agentB: AgentType,
    outputB: AgentOutput,
  ): Contradiction | null {
    // Only flag if both agents have high confidence but one has critical warnings
    // the other completely ignores
    if (outputA.confidence.score < 60 || outputB.confidence.score < 60) {
      return null;
    }

    // Check if A has warnings containing keywords that B's decision contradicts
    for (const warning of outputA.warnings) {
      const warningLower = warning.toLowerCase();
      const decisionBLower = outputB.decision.toLowerCase();

      // If A warns about risk but B's decision ignores or contradicts it
      if (
        (warningLower.includes('risk') || warningLower.includes('danger') || warningLower.includes('critical')) &&
        (decisionBLower.includes('proceed') || decisionBLower.includes('increase') || decisionBLower.includes('launch'))
      ) {
        return {
          agentA,
          agentB,
          area: 'risk_assessment',
          description: `${agentA} warns "${warning}" but ${agentB} recommends action that may conflict.`,
          severity: 'info',
          resolved: false,
        };
      }
    }

    return null;
  }

  /**
   * Maps a challenge verdict to a severity level.
   */
  private verdictToSeverity(verdict: string): 'info' | 'warning' | 'critical' {
    switch (verdict) {
      case 'agree':
        return 'info';
      case 'partial_disagree':
        return 'warning';
      case 'disagree':
        return 'critical';
      default:
        return 'warning';
    }
  }
}

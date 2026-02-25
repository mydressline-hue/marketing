/**
 * AI Governance Service.
 *
 * Provides centralized governance controls for the AI agent framework
 * including risk assessment, confidence gating, approval workflows,
 * manual overrides, rollback planning, and governance metrics.
 *
 * Every governance action is audit-logged for full traceability.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import type { AgentType, ConfidenceLevel, DateRange } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface RiskAssessment {
  id: string;
  decision_id: string;
  agent_type: AgentType;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  requires_approval: boolean;
  auto_approved: boolean;
  assessed_at: string;
}

export interface ApprovalRequest {
  id: string;
  decision_id: string;
  agent_type: AgentType;
  risk_assessment_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_at: string;
  resolved_at?: string;
  resolved_by?: string;
  reason?: string;
}

export interface RollbackStep {
  order: number;
  action: string;
  target: string;
  details: Record<string, unknown>;
}

export interface RollbackPlan {
  id: string;
  decision_id: string;
  steps: RollbackStep[];
  estimated_impact: string;
  created_at: string;
}

export interface GovernancePolicy {
  min_confidence_for_auto_approve: number;
  max_risk_for_auto_approve: number;
  approval_timeout_minutes: number;
  require_human_approval_for_levels: ConfidenceLevel[];
}

export interface ApprovalQueueFilters {
  agent_type?: AgentType;
  status?: ApprovalRequest['status'];
  page?: number;
  limit?: number;
}

export interface GovernanceMetrics {
  total_decisions: number;
  auto_approved_percent: number;
  manually_approved_percent: number;
  rejected_percent: number;
  average_risk_score: number;
  average_confidence: number;
}

export interface ManualOverride {
  id: string;
  decision_id: string;
  user_id: string;
  override_action: string;
  reason: string;
  previous_state: Record<string, unknown>;
  created_at: string;
}

export interface DecisionAuditTrail {
  decision: Record<string, unknown>;
  risk_assessment: RiskAssessment | null;
  approvals: ApprovalRequest[];
  overrides: ManualOverride[];
  audit_logs: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'governance';
const CACHE_TTL = 60; // seconds
const POLICY_CACHE_KEY = `${CACHE_PREFIX}:policy`;

const DEFAULT_POLICY: GovernancePolicy = {
  min_confidence_for_auto_approve: 70,
  max_risk_for_auto_approve: 25,
  approval_timeout_minutes: 60,
  require_human_approval_for_levels: ['low'],
};

const RISK_FACTOR_WEIGHTS = {
  confidence_score: 0.3,
  decision_impact: 0.25,
  historical_accuracy: 0.2,
  agent_reliability: 0.15,
  data_quality: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRiskLevel(score: number): RiskAssessment['risk_level'] {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GovernanceService {
  /**
   * Assess risk for an agent decision.
   *
   * Computes a risk score (0-100) based on five weighted factors derived
   * from real decision data:
   *   - confidence_score (weight 0.3)
   *   - decision_impact (weight 0.25)
   *   - historical_accuracy (weight 0.2)
   *   - agent_reliability (weight 0.15)
   *   - data_quality (weight 0.1)
   *
   * The assessment is persisted to the database and audit-logged.
   */
  static async assessRisk(decisionId: string): Promise<RiskAssessment> {
    // Fetch the decision
    const decisionResult = await pool.query(
      `SELECT id, agent_type, decision_type, confidence_score, input_data, output_data, created_at
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    const decision = decisionResult.rows[0];

    // Factor 1: Confidence score - lower confidence = higher risk
    const confidenceRaw = Number(decision.confidence_score) || 0;
    const confidenceRisk = Math.max(0, Math.min(100, 100 - confidenceRaw));

    // Factor 2: Decision impact - derived from decision type characteristics
    const impactResult = await pool.query(
      `SELECT COUNT(*) AS related_count
       FROM agent_decisions
       WHERE decision_type = $1 AND agent_type = $2 AND id != $3`,
      [decision.decision_type, decision.agent_type, decisionId],
    );
    const relatedCount = parseInt(impactResult.rows[0].related_count, 10);
    // More precedent = lower impact risk; novel decisions carry higher risk
    const impactRisk = relatedCount > 0
      ? Math.max(0, Math.min(100, 100 - Math.min(relatedCount * 10, 80)))
      : 80;

    // Factor 3: Historical accuracy - how accurate has this agent been
    const accuracyResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_approved = true) AS approved
       FROM agent_decisions
       WHERE agent_type = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [decision.agent_type],
    );
    const totalDecisions = parseInt(accuracyResult.rows[0].total, 10);
    const approvedDecisions = parseInt(accuracyResult.rows[0].approved, 10);
    const accuracyRate = totalDecisions > 0
      ? (approvedDecisions / totalDecisions) * 100
      : 50; // Default to 50% if no history
    const accuracyRisk = Math.max(0, Math.min(100, 100 - accuracyRate));

    // Factor 4: Agent reliability - based on recent error rate
    const reliabilityResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'error') AS errors
       FROM agent_states
       WHERE agent_type = $1`,
      [decision.agent_type],
    );
    const totalStates = parseInt(reliabilityResult.rows[0]?.total || '0', 10);
    const errorStates = parseInt(reliabilityResult.rows[0]?.errors || '0', 10);
    const reliabilityRisk = totalStates > 0
      ? Math.min(100, (errorStates / totalStates) * 100)
      : 30; // Default moderate risk if no data

    // Factor 5: Data quality - based on presence and completeness of input data
    const inputData = decision.input_data || {};
    const inputFields = Object.keys(inputData).length;
    const nonNullFields = Object.values(inputData).filter(
      (v) => v !== null && v !== undefined && v !== '',
    ).length;
    const dataQualityScore = inputFields > 0
      ? (nonNullFields / inputFields) * 100
      : 50; // Default to 50% if no input data
    const dataQualityRisk = Math.max(0, Math.min(100, 100 - dataQualityScore));

    // Build factors
    const factors: RiskFactor[] = [
      {
        name: 'confidence_score',
        score: confidenceRisk,
        weight: RISK_FACTOR_WEIGHTS.confidence_score,
        description: `Agent confidence: ${confidenceRaw}%. Lower confidence increases risk.`,
      },
      {
        name: 'decision_impact',
        score: impactRisk,
        weight: RISK_FACTOR_WEIGHTS.decision_impact,
        description: `Decision novelty based on ${relatedCount} similar prior decisions.`,
      },
      {
        name: 'historical_accuracy',
        score: accuracyRisk,
        weight: RISK_FACTOR_WEIGHTS.historical_accuracy,
        description: `Agent accuracy rate: ${accuracyRate.toFixed(1)}% over last 30 days.`,
      },
      {
        name: 'agent_reliability',
        score: reliabilityRisk,
        weight: RISK_FACTOR_WEIGHTS.agent_reliability,
        description: `Agent reliability based on error history.`,
      },
      {
        name: 'data_quality',
        score: dataQualityRisk,
        weight: RISK_FACTOR_WEIGHTS.data_quality,
        description: `Input data completeness: ${dataQualityScore.toFixed(1)}%.`,
      },
    ];

    // Compute weighted risk score
    const riskScore = Math.round(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0),
    );

    const riskLevel = computeRiskLevel(riskScore);

    // Determine if approval is needed
    const policy = await GovernanceService.getGovernancePolicy();
    const requiresApproval = riskScore > policy.max_risk_for_auto_approve;
    const autoApproved = !requiresApproval;

    const assessmentId = generateId();
    const assessedAt = new Date().toISOString();

    const assessment: RiskAssessment = {
      id: assessmentId,
      decision_id: decisionId,
      agent_type: decision.agent_type,
      risk_score: riskScore,
      risk_level: riskLevel,
      factors,
      requires_approval: requiresApproval,
      auto_approved: autoApproved,
      assessed_at: assessedAt,
    };

    // Persist to database
    await pool.query(
      `INSERT INTO risk_assessments
         (id, decision_id, agent_type, risk_score, risk_level, factors,
          requires_approval, auto_approved, assessed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        assessmentId,
        decisionId,
        decision.agent_type,
        riskScore,
        riskLevel,
        JSON.stringify(factors),
        requiresApproval,
        autoApproved,
        assessedAt,
      ],
    );

    // If auto-approved, update the decision
    if (autoApproved) {
      await pool.query(
        `UPDATE agent_decisions SET is_approved = true WHERE id = $1`,
        [decisionId],
      );
    }

    // Audit log
    await AuditService.log({
      action: 'governance.risk_assessed',
      resourceType: 'agent_decision',
      resourceId: decisionId,
      details: {
        assessment_id: assessmentId,
        risk_score: riskScore,
        risk_level: riskLevel,
        requires_approval: requiresApproval,
        auto_approved: autoApproved,
      },
    });

    logger.info('Risk assessment completed', {
      assessmentId,
      decisionId,
      riskScore,
      riskLevel,
      requiresApproval,
      autoApproved,
    });

    return assessment;
  }

  /**
   * Gate an action by confidence score based on governance policy.
   *
   * Returns an object indicating whether the action should proceed,
   * requires approval, or should be blocked.
   *
   * - Block if confidence < min_confidence (default 40)
   * - Require approval if confidence < auto-approve threshold (default 70)
   * - Allow if confidence >= auto-approve threshold
   */
  static async gateByConfidence(
    agentType: AgentType,
    confidenceScore: number,
    decisionType: string,
  ): Promise<{
    allowed: boolean;
    requires_approval: boolean;
    reason: string;
  }> {
    const policy = await GovernanceService.getGovernancePolicy();

    const minConfidence = 40; // Hard floor for blocking
    const autoApproveThreshold = policy.min_confidence_for_auto_approve;

    if (confidenceScore < minConfidence) {
      await AuditService.log({
        action: 'governance.confidence_gate_blocked',
        resourceType: 'agent_decision',
        details: {
          agent_type: agentType,
          confidence_score: confidenceScore,
          decision_type: decisionType,
          threshold: minConfidence,
        },
      });

      logger.warn('Confidence gate: action blocked', {
        agentType,
        confidenceScore,
        decisionType,
        threshold: minConfidence,
      });

      return {
        allowed: false,
        requires_approval: false,
        reason: `Confidence score ${confidenceScore} is below minimum threshold of ${minConfidence}. Action blocked.`,
      };
    }

    if (confidenceScore < autoApproveThreshold) {
      await AuditService.log({
        action: 'governance.confidence_gate_approval_required',
        resourceType: 'agent_decision',
        details: {
          agent_type: agentType,
          confidence_score: confidenceScore,
          decision_type: decisionType,
          threshold: autoApproveThreshold,
        },
      });

      logger.info('Confidence gate: approval required', {
        agentType,
        confidenceScore,
        decisionType,
        autoApproveThreshold,
      });

      return {
        allowed: true,
        requires_approval: true,
        reason: `Confidence score ${confidenceScore} is below auto-approve threshold of ${autoApproveThreshold}. Manual approval required.`,
      };
    }

    await AuditService.log({
      action: 'governance.confidence_gate_passed',
      resourceType: 'agent_decision',
      details: {
        agent_type: agentType,
        confidence_score: confidenceScore,
        decision_type: decisionType,
      },
    });

    return {
      allowed: true,
      requires_approval: false,
      reason: `Confidence score ${confidenceScore} meets auto-approve threshold of ${autoApproveThreshold}.`,
    };
  }

  /**
   * Validate a strategic decision before execution.
   *
   * Performs the following checks:
   * 1. Confidence >= governance policy threshold
   * 2. No active kill switch conflicts
   * 3. No contradicting approved decisions
   * 4. Budget within allocated limits
   *
   * Returns a validation result with pass/fail and detailed findings.
   */
  static async validateStrategy(
    decisionId: string,
  ): Promise<{
    valid: boolean;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  }> {
    // Fetch the decision
    const decisionResult = await pool.query(
      `SELECT id, agent_type, decision_type, confidence_score, input_data, output_data
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    const decision = decisionResult.rows[0];
    const policy = await GovernanceService.getGovernancePolicy();
    const checks: Array<{ name: string; passed: boolean; message: string }> = [];

    // Check 1: Confidence threshold
    const confidenceScore = Number(decision.confidence_score) || 0;
    const confidencePassed = confidenceScore >= policy.min_confidence_for_auto_approve;
    checks.push({
      name: 'confidence_threshold',
      passed: confidencePassed,
      message: confidencePassed
        ? `Confidence ${confidenceScore} meets threshold ${policy.min_confidence_for_auto_approve}.`
        : `Confidence ${confidenceScore} is below threshold ${policy.min_confidence_for_auto_approve}.`,
    });

    // Check 2: Kill switch conflicts
    const killSwitchResult = await pool.query(
      `SELECT id, level, trigger_type, affected_campaigns
       FROM kill_switch_states
       WHERE is_active = true`,
    );
    const activeKillSwitches = killSwitchResult.rows;
    const killSwitchPassed = activeKillSwitches.length === 0;
    checks.push({
      name: 'kill_switch_conflict',
      passed: killSwitchPassed,
      message: killSwitchPassed
        ? 'No active kill switches detected.'
        : `${activeKillSwitches.length} active kill switch(es) detected. Decision may conflict.`,
    });

    // Check 3: Contradicting approved decisions
    const contradictionResult = await pool.query(
      `SELECT id, decision_type, output_data
       FROM agent_decisions
       WHERE agent_type = $1
         AND decision_type = $2
         AND is_approved = true
         AND id != $3
       ORDER BY created_at DESC
       LIMIT 5`,
      [decision.agent_type, decision.decision_type, decisionId],
    );
    const contradictions = contradictionResult.rows;
    // A simple contradiction check: if there are recent approved decisions of the
    // same type, flag for review
    const contradictionPassed = contradictions.length === 0;
    checks.push({
      name: 'contradicting_decisions',
      passed: contradictionPassed,
      message: contradictionPassed
        ? 'No contradicting approved decisions found.'
        : `${contradictions.length} existing approved decision(s) of same type found. Review for contradictions.`,
    });

    // Check 4: Budget within limits
    const outputData = decision.output_data || {};
    const budgetRequired = Number(outputData.budget_required) || 0;
    let budgetPassed = true;
    let budgetMessage = 'No budget requirement specified in decision.';

    if (budgetRequired > 0) {
      const budgetResult = await pool.query(
        `SELECT COALESCE(SUM(total_budget - total_spent), 0) AS available_budget
         FROM budget_allocations
         WHERE period_end >= NOW()`,
      );
      const availableBudget = parseFloat(budgetResult.rows[0].available_budget);
      budgetPassed = availableBudget >= budgetRequired;
      budgetMessage = budgetPassed
        ? `Budget requirement ${budgetRequired} is within available budget ${availableBudget}.`
        : `Budget requirement ${budgetRequired} exceeds available budget ${availableBudget}.`;
    }
    checks.push({
      name: 'budget_limits',
      passed: budgetPassed,
      message: budgetMessage,
    });

    const valid = checks.every((c) => c.passed);

    // Audit log
    await AuditService.log({
      action: 'governance.strategy_validated',
      resourceType: 'agent_decision',
      resourceId: decisionId,
      details: {
        valid,
        checks,
      },
    });

    logger.info('Strategy validation completed', {
      decisionId,
      valid,
      checksCount: checks.length,
      failedChecks: checks.filter((c) => !c.passed).map((c) => c.name),
    });

    return { valid, checks };
  }

  /**
   * Generate a rollback plan for a decision.
   *
   * Reads decision details and creates reversal steps that can be executed
   * if the decision needs to be undone.
   */
  static async generateRollbackPlan(decisionId: string): Promise<RollbackPlan> {
    // Fetch the decision
    const decisionResult = await pool.query(
      `SELECT id, agent_type, decision_type, input_data, output_data, confidence_score
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    const decision = decisionResult.rows[0];
    const outputData = decision.output_data || {};
    const inputData = decision.input_data || {};
    const steps: RollbackStep[] = [];
    let stepOrder = 1;

    // Step 1: Always mark the decision as reverted
    steps.push({
      order: stepOrder++,
      action: 'revert_decision',
      target: 'agent_decisions',
      details: {
        decision_id: decisionId,
        set_approved: false,
        reason: 'Rollback initiated',
      },
    });

    // Step 2: If the decision affected campaigns, revert campaign changes
    if (outputData.campaign_id || outputData.affected_campaigns) {
      const campaignIds = outputData.affected_campaigns || [outputData.campaign_id];
      steps.push({
        order: stepOrder++,
        action: 'revert_campaign_changes',
        target: 'campaigns',
        details: {
          campaign_ids: campaignIds,
          restore_previous_state: true,
        },
      });
    }

    // Step 3: If the decision involved budget changes, reverse them
    if (outputData.budget_changes || outputData.budget_required) {
      steps.push({
        order: stepOrder++,
        action: 'reverse_budget_allocation',
        target: 'budget_allocations',
        details: {
          original_budget: inputData.budget || outputData.budget_required,
          reverse_amount: outputData.budget_changes || outputData.budget_required,
        },
      });
    }

    // Step 4: If the decision involved content changes
    if (outputData.content_id || outputData.content_changes) {
      steps.push({
        order: stepOrder++,
        action: 'revert_content_changes',
        target: 'content',
        details: {
          content_id: outputData.content_id,
          restore_previous_version: true,
        },
      });
    }

    // Step 5: Notify stakeholders
    steps.push({
      order: stepOrder++,
      action: 'notify_stakeholders',
      target: 'notifications',
      details: {
        decision_id: decisionId,
        agent_type: decision.agent_type,
        decision_type: decision.decision_type,
        notification_type: 'rollback_executed',
      },
    });

    const planId = generateId();
    const createdAt = new Date().toISOString();

    // Estimate impact based on decision type and scope
    const affectedEntities = [
      outputData.campaign_id ? 'campaigns' : null,
      outputData.budget_changes ? 'budgets' : null,
      outputData.content_id ? 'content' : null,
    ].filter(Boolean);

    const estimatedImpact = affectedEntities.length > 0
      ? `Rollback will affect: ${affectedEntities.join(', ')}. ${steps.length} steps required.`
      : `Rollback will revert decision and notify stakeholders. ${steps.length} steps required.`;

    const plan: RollbackPlan = {
      id: planId,
      decision_id: decisionId,
      steps,
      estimated_impact: estimatedImpact,
      created_at: createdAt,
    };

    // Persist rollback plan
    await pool.query(
      `INSERT INTO rollback_plans (id, decision_id, steps, estimated_impact, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [planId, decisionId, JSON.stringify(steps), estimatedImpact, createdAt],
    );

    // Audit log
    await AuditService.log({
      action: 'governance.rollback_plan_generated',
      resourceType: 'agent_decision',
      resourceId: decisionId,
      details: {
        plan_id: planId,
        steps_count: steps.length,
        estimated_impact: estimatedImpact,
      },
    });

    logger.info('Rollback plan generated', {
      planId,
      decisionId,
      stepsCount: steps.length,
    });

    return plan;
  }

  /**
   * Create an approval request for manual review of a decision.
   */
  static async requestApproval(
    decisionId: string,
    riskAssessmentId: string,
  ): Promise<ApprovalRequest> {
    // Verify decision exists
    const decisionResult = await pool.query(
      `SELECT id, agent_type FROM agent_decisions WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    // Verify risk assessment exists
    const assessmentResult = await pool.query(
      `SELECT id FROM risk_assessments WHERE id = $1`,
      [riskAssessmentId],
    );

    if (assessmentResult.rows.length === 0) {
      throw new NotFoundError(`Risk assessment with id "${riskAssessmentId}" not found`);
    }

    const decision = decisionResult.rows[0];
    const approvalId = generateId();
    const requestedAt = new Date().toISOString();

    const approval: ApprovalRequest = {
      id: approvalId,
      decision_id: decisionId,
      agent_type: decision.agent_type,
      risk_assessment_id: riskAssessmentId,
      status: 'pending',
      requested_at: requestedAt,
    };

    await pool.query(
      `INSERT INTO approval_requests
         (id, decision_id, agent_type, risk_assessment_id, status, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        approvalId,
        decisionId,
        decision.agent_type,
        riskAssessmentId,
        'pending',
        requestedAt,
      ],
    );

    // Audit log
    await AuditService.log({
      action: 'governance.approval_requested',
      resourceType: 'approval_request',
      resourceId: approvalId,
      details: {
        decision_id: decisionId,
        agent_type: decision.agent_type,
        risk_assessment_id: riskAssessmentId,
      },
    });

    logger.info('Approval request created', {
      approvalId,
      decisionId,
      agentType: decision.agent_type,
    });

    return approval;
  }

  /**
   * Approve or reject a pending approval request.
   *
   * Updates the approval request status and, if approved, sets the
   * agent_decisions.is_approved flag. All actions are audit-logged.
   */
  static async resolveApproval(
    approvalId: string,
    userId: string,
    approved: boolean,
    reason?: string,
  ): Promise<ApprovalRequest> {
    // Fetch the approval request
    const approvalResult = await pool.query(
      `SELECT id, decision_id, agent_type, risk_assessment_id, status, requested_at
       FROM approval_requests
       WHERE id = $1`,
      [approvalId],
    );

    if (approvalResult.rows.length === 0) {
      throw new NotFoundError(`Approval request with id "${approvalId}" not found`);
    }

    const existing = approvalResult.rows[0];

    if (existing.status !== 'pending') {
      throw new ValidationError(
        `Approval request "${approvalId}" is already ${existing.status}. Only pending requests can be resolved.`,
      );
    }

    const status = approved ? 'approved' : 'rejected';
    const resolvedAt = new Date().toISOString();

    // Update approval request
    await pool.query(
      `UPDATE approval_requests
       SET status = $1, resolved_at = $2, resolved_by = $3, reason = $4
       WHERE id = $5`,
      [status, resolvedAt, userId, reason || null, approvalId],
    );

    // If approved, update the agent decision
    if (approved) {
      await pool.query(
        `UPDATE agent_decisions SET is_approved = true, approved_by = $1 WHERE id = $2`,
        [userId, existing.decision_id],
      );
    }

    const resolved: ApprovalRequest = {
      id: existing.id,
      decision_id: existing.decision_id,
      agent_type: existing.agent_type,
      risk_assessment_id: existing.risk_assessment_id,
      status,
      requested_at: existing.requested_at,
      resolved_at: resolvedAt,
      resolved_by: userId,
      reason,
    };

    // Audit log
    await AuditService.log({
      userId,
      action: `governance.approval_${status}`,
      resourceType: 'approval_request',
      resourceId: approvalId,
      details: {
        decision_id: existing.decision_id,
        agent_type: existing.agent_type,
        approved,
        reason,
      },
    });

    logger.info('Approval request resolved', {
      approvalId,
      decisionId: existing.decision_id,
      status,
      resolvedBy: userId,
    });

    return resolved;
  }

  /**
   * Get pending approval requests with pagination.
   *
   * Supports filtering by agent_type and status.
   */
  static async getApprovalQueue(
    filters?: ApprovalQueueFilters,
  ): Promise<{
    data: ApprovalRequest[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.max(1, Math.min(100, filters?.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.agent_type) {
      conditions.push(`agent_type = $${paramIndex++}`);
      params.push(filters.agent_type);
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM approval_requests ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch
    const dataResult = await pool.query(
      `SELECT id, decision_id, agent_type, risk_assessment_id, status,
              requested_at, resolved_at, resolved_by, reason
       FROM approval_requests
       ${whereClause}
       ORDER BY requested_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data: ApprovalRequest[] = dataResult.rows.map((row) => ({
      id: row.id,
      decision_id: row.decision_id,
      agent_type: row.agent_type,
      risk_assessment_id: row.risk_assessment_id,
      status: row.status,
      requested_at: row.requested_at,
      resolved_at: row.resolved_at || undefined,
      resolved_by: row.resolved_by || undefined,
      reason: row.reason || undefined,
    }));

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Execute a manual override for an agent decision.
   *
   * Override hierarchy: human > orchestrator > agent.
   * The override is persisted and an audit trail is created.
   */
  static async executeManualOverride(
    decisionId: string,
    userId: string,
    overrideAction: string,
    reason: string,
  ): Promise<ManualOverride> {
    // Fetch the decision
    const decisionResult = await pool.query(
      `SELECT id, agent_type, decision_type, is_approved, output_data, confidence_score
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    const decision = decisionResult.rows[0];

    // Store previous state
    const previousState: Record<string, unknown> = {
      is_approved: decision.is_approved,
      output_data: decision.output_data,
      confidence_score: Number(decision.confidence_score),
    };

    const overrideId = generateId();
    const createdAt = new Date().toISOString();

    // Apply override based on action
    if (overrideAction === 'approve') {
      await pool.query(
        `UPDATE agent_decisions SET is_approved = true, approved_by = $1 WHERE id = $2`,
        [userId, decisionId],
      );
    } else if (overrideAction === 'reject') {
      await pool.query(
        `UPDATE agent_decisions SET is_approved = false WHERE id = $1`,
        [decisionId],
      );
    } else if (overrideAction === 'modify') {
      // Mark as needing re-review
      await pool.query(
        `UPDATE agent_decisions SET is_approved = false WHERE id = $1`,
        [decisionId],
      );
    }

    const override: ManualOverride = {
      id: overrideId,
      decision_id: decisionId,
      user_id: userId,
      override_action: overrideAction,
      reason,
      previous_state: previousState,
      created_at: createdAt,
    };

    // Persist the override
    await pool.query(
      `INSERT INTO manual_overrides
         (id, decision_id, user_id, override_action, reason, previous_state, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        overrideId,
        decisionId,
        userId,
        overrideAction,
        reason,
        JSON.stringify(previousState),
        createdAt,
      ],
    );

    // Audit log
    await AuditService.log({
      userId,
      action: 'governance.manual_override',
      resourceType: 'agent_decision',
      resourceId: decisionId,
      details: {
        override_id: overrideId,
        override_action: overrideAction,
        reason,
        previous_state: previousState,
        override_hierarchy: 'human > orchestrator > agent',
      },
    });

    logger.info('Manual override executed', {
      overrideId,
      decisionId,
      userId,
      overrideAction,
      agentType: decision.agent_type,
    });

    return override;
  }

  /**
   * Get the current governance policy.
   *
   * Reads from cache first, then database. Falls back to defaults if
   * no policy has been explicitly set.
   */
  static async getGovernancePolicy(): Promise<GovernancePolicy> {
    // Check cache
    const cached = await cacheGet<GovernancePolicy>(POLICY_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'governance_policy'`,
    );

    let policy: GovernancePolicy;

    if (result.rows.length > 0 && result.rows[0].value) {
      const raw = typeof result.rows[0].value === 'string'
        ? JSON.parse(result.rows[0].value)
        : result.rows[0].value;
      policy = {
        min_confidence_for_auto_approve: raw.min_confidence_for_auto_approve ?? DEFAULT_POLICY.min_confidence_for_auto_approve,
        max_risk_for_auto_approve: raw.max_risk_for_auto_approve ?? DEFAULT_POLICY.max_risk_for_auto_approve,
        approval_timeout_minutes: raw.approval_timeout_minutes ?? DEFAULT_POLICY.approval_timeout_minutes,
        require_human_approval_for_levels: raw.require_human_approval_for_levels ?? DEFAULT_POLICY.require_human_approval_for_levels,
      };
    } else {
      policy = { ...DEFAULT_POLICY };
    }

    // Cache the policy
    await cacheSet(POLICY_CACHE_KEY, policy, CACHE_TTL);

    return policy;
  }

  /**
   * Update the governance policy.
   *
   * Persists the new policy to the database, invalidates the cache,
   * and creates an audit trail.
   */
  static async updateGovernancePolicy(
    policy: Partial<GovernancePolicy>,
    userId: string,
  ): Promise<GovernancePolicy> {
    // Get current policy to merge with updates
    const current = await GovernanceService.getGovernancePolicy();

    const updated: GovernancePolicy = {
      min_confidence_for_auto_approve:
        policy.min_confidence_for_auto_approve ?? current.min_confidence_for_auto_approve,
      max_risk_for_auto_approve:
        policy.max_risk_for_auto_approve ?? current.max_risk_for_auto_approve,
      approval_timeout_minutes:
        policy.approval_timeout_minutes ?? current.approval_timeout_minutes,
      require_human_approval_for_levels:
        policy.require_human_approval_for_levels ?? current.require_human_approval_for_levels,
    };

    // Validate policy values
    if (updated.min_confidence_for_auto_approve < 0 || updated.min_confidence_for_auto_approve > 100) {
      throw new ValidationError('min_confidence_for_auto_approve must be between 0 and 100');
    }
    if (updated.max_risk_for_auto_approve < 0 || updated.max_risk_for_auto_approve > 100) {
      throw new ValidationError('max_risk_for_auto_approve must be between 0 and 100');
    }
    if (updated.approval_timeout_minutes < 1) {
      throw new ValidationError('approval_timeout_minutes must be at least 1');
    }

    // Upsert the policy in system_settings
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('governance_policy', $1, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $1, updated_at = NOW()`,
      [JSON.stringify(updated)],
    );

    // Invalidate cache
    await cacheDel(POLICY_CACHE_KEY);

    // Audit log
    await AuditService.log({
      userId,
      action: 'governance.policy_updated',
      resourceType: 'governance_policy',
      details: {
        previous: current,
        updated,
      },
    });

    logger.info('Governance policy updated', {
      userId,
      policy: updated,
    });

    return updated;
  }

  /**
   * Get the full audit trail for a decision including risk assessment,
   * approvals, overrides, and general audit logs.
   */
  static async getDecisionAuditTrail(decisionId: string): Promise<DecisionAuditTrail> {
    // Fetch the decision
    const decisionResult = await pool.query(
      `SELECT id, agent_type, decision_type, input_data, output_data,
              confidence_score, reasoning, is_approved, approved_by, created_at
       FROM agent_decisions
       WHERE id = $1`,
      [decisionId],
    );

    if (decisionResult.rows.length === 0) {
      throw new NotFoundError(`Decision with id "${decisionId}" not found`);
    }

    const decision = decisionResult.rows[0];

    // Fetch risk assessment
    const riskResult = await pool.query(
      `SELECT id, decision_id, agent_type, risk_score, risk_level, factors,
              requires_approval, auto_approved, assessed_at
       FROM risk_assessments
       WHERE decision_id = $1
       ORDER BY assessed_at DESC
       LIMIT 1`,
      [decisionId],
    );

    let riskAssessment: RiskAssessment | null = null;
    if (riskResult.rows.length > 0) {
      const row = riskResult.rows[0];
      riskAssessment = {
        id: row.id,
        decision_id: row.decision_id,
        agent_type: row.agent_type,
        risk_score: Number(row.risk_score),
        risk_level: row.risk_level,
        factors: typeof row.factors === 'string' ? JSON.parse(row.factors) : row.factors,
        requires_approval: row.requires_approval,
        auto_approved: row.auto_approved,
        assessed_at: row.assessed_at,
      };
    }

    // Fetch approval requests
    const approvalsResult = await pool.query(
      `SELECT id, decision_id, agent_type, risk_assessment_id, status,
              requested_at, resolved_at, resolved_by, reason
       FROM approval_requests
       WHERE decision_id = $1
       ORDER BY requested_at DESC`,
      [decisionId],
    );

    const approvals: ApprovalRequest[] = approvalsResult.rows.map((row) => ({
      id: row.id,
      decision_id: row.decision_id,
      agent_type: row.agent_type,
      risk_assessment_id: row.risk_assessment_id,
      status: row.status,
      requested_at: row.requested_at,
      resolved_at: row.resolved_at || undefined,
      resolved_by: row.resolved_by || undefined,
      reason: row.reason || undefined,
    }));

    // Fetch manual overrides
    const overridesResult = await pool.query(
      `SELECT id, decision_id, user_id, override_action, reason, previous_state, created_at
       FROM manual_overrides
       WHERE decision_id = $1
       ORDER BY created_at DESC`,
      [decisionId],
    );

    const overrides: ManualOverride[] = overridesResult.rows.map((row) => ({
      id: row.id,
      decision_id: row.decision_id,
      user_id: row.user_id,
      override_action: row.override_action,
      reason: row.reason,
      previous_state: typeof row.previous_state === 'string'
        ? JSON.parse(row.previous_state)
        : row.previous_state,
      created_at: row.created_at,
    }));

    // Fetch audit logs related to this decision
    const auditResult = await pool.query(
      `SELECT id, user_id, action, resource_type, resource_id, details, created_at
       FROM audit_logs
       WHERE resource_id = $1
       ORDER BY created_at DESC`,
      [decisionId],
    );

    const auditLogs = auditResult.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      created_at: row.created_at,
    }));

    // Audit this query itself
    await AuditService.log({
      action: 'governance.audit_trail_viewed',
      resourceType: 'agent_decision',
      resourceId: decisionId,
    });

    return {
      decision,
      risk_assessment: riskAssessment,
      approvals,
      overrides,
      audit_logs: auditLogs,
    };
  }

  /**
   * Get aggregated governance metrics for a date range.
   *
   * Returns:
   * - total_decisions: Total number of decisions in the period
   * - auto_approved_percent: % of decisions auto-approved
   * - manually_approved_percent: % approved via manual approval
   * - rejected_percent: % rejected
   * - average_risk_score: Mean risk score across assessments
   * - average_confidence: Mean confidence score across decisions
   */
  static async getGovernanceMetrics(
    dateRange?: DateRange,
  ): Promise<GovernanceMetrics> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (dateRange?.startDate) {
      conditions.push(`ad.created_at >= $${paramIndex++}`);
      params.push(dateRange.startDate);
    }

    if (dateRange?.endDate) {
      conditions.push(`ad.created_at <= $${paramIndex++}`);
      params.push(dateRange.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total decisions and confidence
    const decisionsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_decisions,
         COALESCE(AVG(ad.confidence_score), 0) AS avg_confidence
       FROM agent_decisions ad
       ${whereClause}`,
      params,
    );

    const totalDecisions = parseInt(decisionsResult.rows[0].total_decisions, 10);
    const avgConfidence = parseFloat(decisionsResult.rows[0].avg_confidence);

    // Risk assessment metrics
    const riskConditions: string[] = [];
    const riskParams: unknown[] = [];
    let riskParamIndex = 1;

    if (dateRange?.startDate) {
      riskConditions.push(`assessed_at >= $${riskParamIndex++}`);
      riskParams.push(dateRange.startDate);
    }
    if (dateRange?.endDate) {
      riskConditions.push(`assessed_at <= $${riskParamIndex++}`);
      riskParams.push(dateRange.endDate);
    }

    const riskWhereClause =
      riskConditions.length > 0 ? `WHERE ${riskConditions.join(' AND ')}` : '';

    const riskResult = await pool.query(
      `SELECT
         COALESCE(AVG(risk_score), 0) AS avg_risk_score,
         COUNT(*) FILTER (WHERE auto_approved = true) AS auto_approved_count,
         COUNT(*) AS total_assessments
       FROM risk_assessments
       ${riskWhereClause}`,
      riskParams,
    );

    const avgRiskScore = parseFloat(riskResult.rows[0].avg_risk_score);
    const autoApprovedCount = parseInt(riskResult.rows[0].auto_approved_count, 10);
    const totalAssessments = parseInt(riskResult.rows[0].total_assessments, 10);

    // Approval metrics
    const approvalConditions: string[] = [];
    const approvalParams: unknown[] = [];
    let approvalParamIndex = 1;

    if (dateRange?.startDate) {
      approvalConditions.push(`requested_at >= $${approvalParamIndex++}`);
      approvalParams.push(dateRange.startDate);
    }
    if (dateRange?.endDate) {
      approvalConditions.push(`requested_at <= $${approvalParamIndex++}`);
      approvalParams.push(dateRange.endDate);
    }

    const approvalWhereClause =
      approvalConditions.length > 0 ? `WHERE ${approvalConditions.join(' AND ')}` : '';

    const approvalResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved') AS manually_approved,
         COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
       FROM approval_requests
       ${approvalWhereClause}`,
      approvalParams,
    );

    const manuallyApprovedCount = parseInt(approvalResult.rows[0].manually_approved, 10);
    const rejectedCount = parseInt(approvalResult.rows[0].rejected, 10);

    // Compute percentages
    const autoApprovedPercent = totalDecisions > 0
      ? Math.round((autoApprovedCount / totalDecisions) * 10000) / 100
      : 0;
    const manuallyApprovedPercent = totalDecisions > 0
      ? Math.round((manuallyApprovedCount / totalDecisions) * 10000) / 100
      : 0;
    const rejectedPercent = totalDecisions > 0
      ? Math.round((rejectedCount / totalDecisions) * 10000) / 100
      : 0;

    const metrics: GovernanceMetrics = {
      total_decisions: totalDecisions,
      auto_approved_percent: autoApprovedPercent,
      manually_approved_percent: manuallyApprovedPercent,
      rejected_percent: rejectedPercent,
      average_risk_score: Math.round(avgRiskScore * 100) / 100,
      average_confidence: Math.round(avgConfidence * 100) / 100,
    };

    // Audit log
    await AuditService.log({
      action: 'governance.metrics_viewed',
      resourceType: 'governance_metrics',
      details: {
        date_range: dateRange,
        total_decisions: totalDecisions,
      },
    });

    return metrics;
  }
}

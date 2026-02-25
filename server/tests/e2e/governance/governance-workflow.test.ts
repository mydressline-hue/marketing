/**
 * E2E tests for Governance workflow lifecycle.
 *
 * Tests full governance workflows including:
 *   - Low confidence decision -> blocked
 *   - Medium confidence -> requires approval -> approve -> execute
 *   - High risk -> approval required -> reject
 *   - Manual override flow
 *   - Governance metrics after multiple decisions
 *   - Policy update affects gating
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { cacheGet, cacheSet } from '../../../src/config/redis';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type DecisionStatus = 'pending_gate' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'overridden';

interface GovernancePolicy {
  confidence_thresholds: {
    auto_approve: number;     // Above this: auto-approve
    require_approval: number; // Above this but below auto_approve: require approval
    block: number;            // Below this: block entirely
  };
  risk_thresholds: {
    auto_approve_max_risk: RiskLevel;
    require_approval_risk: RiskLevel[];
    block_risk: RiskLevel[];
  };
  max_budget_auto_approve: number;
  require_human_review_types: string[];
}

interface GovernanceDecision {
  id: string;
  decision_type: string;
  confidence_score: number;
  risk_level: RiskLevel;
  status: DecisionStatus;
  requires_approval: boolean;
  approved_by: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  override_by: string | null;
  override_reason: string | null;
  audit_trail: AuditEntry[];
  created_at: string;
  resolved_at: string | null;
}

interface ApprovalRequest {
  id: string;
  decision_id: string;
  status: ApprovalStatus;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  reason: string | null;
}

interface AuditEntry {
  action: string;
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
}

interface GovernanceMetrics {
  total_decisions: number;
  auto_approved: number;
  manually_approved: number;
  rejected: number;
  blocked: number;
  overridden: number;
  avg_confidence: number;
  risk_distribution: Record<RiskLevel, number>;
}

// ---------------------------------------------------------------------------
// Governance Simulator
// ---------------------------------------------------------------------------

class GovernanceSimulator {
  private decisions: Map<string, GovernanceDecision> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private policy: GovernancePolicy;
  private idCounter = 0;

  constructor() {
    this.policy = {
      confidence_thresholds: {
        auto_approve: 0.85,
        require_approval: 0.60,
        block: 0.60,
      },
      risk_thresholds: {
        auto_approve_max_risk: 'low',
        require_approval_risk: ['medium', 'high'],
        block_risk: ['critical'],
      },
      max_budget_auto_approve: 10000,
      require_human_review_types: ['budget_increase', 'new_country_launch'],
    };
  }

  /**
   * Assess a decision against the governance policy confidence gate.
   */
  gateConfidence(
    decisionType: string,
    confidenceScore: number,
    context: Record<string, unknown> = {},
  ): GovernanceDecision {
    this.idCounter += 1;
    const id = `gov-decision-${this.idCounter}`;
    const riskLevel = this.assessRiskLevel(decisionType, confidenceScore, context);
    const status = this.determineStatus(confidenceScore, riskLevel, decisionType);
    const requiresApproval = status === 'pending_approval';

    const decision: GovernanceDecision = {
      id,
      decision_type: decisionType,
      confidence_score: confidenceScore,
      risk_level: riskLevel,
      status,
      requires_approval: requiresApproval,
      approved_by: null,
      rejected_by: null,
      rejection_reason: null,
      override_by: null,
      override_reason: null,
      audit_trail: [{
        action: 'confidence_gate_evaluated',
        actor: 'system',
        timestamp: new Date().toISOString(),
        details: { confidence_score: confidenceScore, risk_level: riskLevel, result: status },
      }],
      created_at: new Date().toISOString(),
      resolved_at: status === 'approved' ? new Date().toISOString() : null,
    };

    this.decisions.set(id, decision);

    if (requiresApproval) {
      this.createApprovalRequest(id);
    }

    return decision;
  }

  private assessRiskLevel(
    decisionType: string,
    confidenceScore: number,
    context: Record<string, unknown>,
  ): RiskLevel {
    // Budget-based risk assessment
    const budgetAmount = (context.budget_amount as number) || 0;
    if (budgetAmount > this.policy.max_budget_auto_approve * 5) return 'critical';
    if (budgetAmount > this.policy.max_budget_auto_approve * 2) return 'high';

    // Confidence-based risk
    if (confidenceScore < 0.40) return 'critical';
    if (confidenceScore < 0.60) return 'high';
    if (confidenceScore < 0.75) return 'medium';

    // Decision type risk
    if (this.policy.require_human_review_types.includes(decisionType)) return 'medium';

    return 'low';
  }

  private determineStatus(
    confidenceScore: number,
    riskLevel: RiskLevel,
    decisionType: string,
  ): DecisionStatus {
    // Block if below confidence threshold
    if (confidenceScore < this.policy.confidence_thresholds.block) {
      return 'blocked';
    }

    // Block if critical risk
    if (this.policy.risk_thresholds.block_risk.includes(riskLevel)) {
      return 'blocked';
    }

    // Require approval if risk level is medium or high
    if (this.policy.risk_thresholds.require_approval_risk.includes(riskLevel)) {
      return 'pending_approval';
    }

    // Require approval if decision type needs human review
    if (this.policy.require_human_review_types.includes(decisionType)) {
      return 'pending_approval';
    }

    // Auto-approve if high confidence and low risk
    if (
      confidenceScore >= this.policy.confidence_thresholds.auto_approve &&
      riskLevel === this.policy.risk_thresholds.auto_approve_max_risk
    ) {
      return 'approved';
    }

    // Default: require approval for anything not clearly auto-approvable
    if (confidenceScore >= this.policy.confidence_thresholds.require_approval) {
      return 'pending_approval';
    }

    return 'blocked';
  }

  private createApprovalRequest(decisionId: string): ApprovalRequest {
    this.idCounter += 1;
    const approval: ApprovalRequest = {
      id: `approval-${this.idCounter}`,
      decision_id: decisionId,
      status: 'pending',
      requested_at: new Date().toISOString(),
      resolved_by: null,
      resolved_at: null,
      reason: null,
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  resolveApproval(
    approvalId: string,
    userId: string,
    action: 'approve' | 'reject',
    reason: string,
  ): ApprovalRequest {
    const approval = this.approvals.get(approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);
    if (approval.status !== 'pending') throw new Error(`Approval ${approvalId} already resolved`);

    approval.status = action === 'approve' ? 'approved' : 'rejected';
    approval.resolved_by = userId;
    approval.resolved_at = new Date().toISOString();
    approval.reason = reason;

    // Update corresponding decision
    const decision = this.decisions.get(approval.decision_id);
    if (decision) {
      if (action === 'approve') {
        decision.status = 'approved';
        decision.approved_by = userId;
        decision.resolved_at = new Date().toISOString();
      } else {
        decision.status = 'rejected';
        decision.rejected_by = userId;
        decision.rejection_reason = reason;
        decision.resolved_at = new Date().toISOString();
      }

      decision.audit_trail.push({
        action: `approval_${action}d`,
        actor: userId,
        timestamp: new Date().toISOString(),
        details: { approval_id: approvalId, reason },
      });
    }

    return approval;
  }

  manualOverride(decisionId: string, userId: string, reason: string): GovernanceDecision {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error(`Decision ${decisionId} not found`);

    decision.status = 'overridden';
    decision.override_by = userId;
    decision.override_reason = reason;
    decision.resolved_at = new Date().toISOString();

    decision.audit_trail.push({
      action: 'manual_override',
      actor: userId,
      timestamp: new Date().toISOString(),
      details: { reason, previous_status: decision.status },
    });

    return decision;
  }

  getDecision(decisionId: string): GovernanceDecision | undefined {
    return this.decisions.get(decisionId);
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter((a) => a.status === 'pending');
  }

  getApprovalForDecision(decisionId: string): ApprovalRequest | undefined {
    return Array.from(this.approvals.values()).find((a) => a.decision_id === decisionId);
  }

  getMetrics(): GovernanceMetrics {
    const decisions = Array.from(this.decisions.values());
    const totalConfidence = decisions.reduce((sum, d) => sum + d.confidence_score, 0);

    const riskDist: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const d of decisions) {
      riskDist[d.risk_level] += 1;
    }

    return {
      total_decisions: decisions.length,
      auto_approved: decisions.filter((d) => d.status === 'approved' && !d.approved_by).length,
      manually_approved: decisions.filter((d) => d.status === 'approved' && d.approved_by !== null).length,
      rejected: decisions.filter((d) => d.status === 'rejected').length,
      blocked: decisions.filter((d) => d.status === 'blocked').length,
      overridden: decisions.filter((d) => d.status === 'overridden').length,
      avg_confidence: decisions.length > 0 ? totalConfidence / decisions.length : 0,
      risk_distribution: riskDist,
    };
  }

  getAuditTrail(decisionId: string): AuditEntry[] {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error(`Decision ${decisionId} not found`);
    return decision.audit_trail;
  }

  updatePolicy(updates: Partial<GovernancePolicy>): GovernancePolicy {
    if (updates.confidence_thresholds) {
      this.policy.confidence_thresholds = {
        ...this.policy.confidence_thresholds,
        ...updates.confidence_thresholds,
      };
    }
    if (updates.risk_thresholds) {
      this.policy.risk_thresholds = {
        ...this.policy.risk_thresholds,
        ...updates.risk_thresholds,
      };
    }
    if (updates.max_budget_auto_approve !== undefined) {
      this.policy.max_budget_auto_approve = updates.max_budget_auto_approve;
    }
    if (updates.require_human_review_types) {
      this.policy.require_human_review_types = updates.require_human_review_types;
    }
    return { ...this.policy };
  }

  getPolicy(): GovernancePolicy {
    return { ...this.policy };
  }

  reset(): void {
    this.decisions.clear();
    this.approvals.clear();
    this.idCounter = 0;
    this.policy = {
      confidence_thresholds: {
        auto_approve: 0.85,
        require_approval: 0.60,
        block: 0.60,
      },
      risk_thresholds: {
        auto_approve_max_risk: 'low',
        require_approval_risk: ['medium', 'high'],
        block_risk: ['critical'],
      },
      max_budget_auto_approve: 10000,
      require_human_review_types: ['budget_increase', 'new_country_launch'],
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Governance Workflow E2E Tests', () => {
  let gov: GovernanceSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    gov = new GovernanceSimulator();
  });

  // =========================================================================
  // Low confidence decision -> blocked
  // =========================================================================

  describe('Low confidence decision: blocked', () => {
    it('should block a decision with confidence below the threshold', () => {
      const decision = gov.gateConfidence('optimize_budget', 0.45, { budget_amount: 500 });

      expect(decision.status).toBe('blocked');
      expect(decision.requires_approval).toBe(false);
      expect(decision.confidence_score).toBe(0.45);
      expect(decision.risk_level).toBe('high');
    });

    it('should block a decision with very low confidence as critical risk', () => {
      const decision = gov.gateConfidence('scale_campaign', 0.30, { budget_amount: 100 });

      expect(decision.status).toBe('blocked');
      expect(decision.risk_level).toBe('critical');
    });

    it('should record gate evaluation in audit trail when blocked', () => {
      const decision = gov.gateConfidence('optimize_budget', 0.50, {});

      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(1);
      expect(trail[0].action).toBe('confidence_gate_evaluated');
      expect(trail[0].details.result).toBe('blocked');
    });
  });

  // =========================================================================
  // Medium confidence -> requires approval -> approve -> execute
  // =========================================================================

  describe('Medium confidence: approval required -> approve', () => {
    it('should require approval for medium confidence decisions', () => {
      const decision = gov.gateConfidence('adjust_targeting', 0.72, { budget_amount: 5000 });

      expect(decision.status).toBe('pending_approval');
      expect(decision.requires_approval).toBe(true);
      expect(decision.risk_level).toBe('medium');

      // Verify approval request was created
      const pendingApprovals = gov.getPendingApprovals();
      expect(pendingApprovals).toHaveLength(1);
      expect(pendingApprovals[0].decision_id).toBe(decision.id);
    });

    it('should approve and move decision to approved status', () => {
      const decision = gov.gateConfidence('adjust_targeting', 0.72, { budget_amount: 5000 });

      const approval = gov.getApprovalForDecision(decision.id);
      expect(approval).toBeDefined();

      const resolved = gov.resolveApproval(approval!.id, 'admin-user-1', 'approve', 'Looks good after review');

      expect(resolved.status).toBe('approved');
      expect(resolved.resolved_by).toBe('admin-user-1');

      // Verify decision state updated
      const updatedDecision = gov.getDecision(decision.id);
      expect(updatedDecision!.status).toBe('approved');
      expect(updatedDecision!.approved_by).toBe('admin-user-1');
      expect(updatedDecision!.resolved_at).not.toBeNull();

      // Verify audit trail
      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(2);
      expect(trail[1].action).toBe('approval_approved');
    });
  });

  // =========================================================================
  // High risk -> approval required -> reject
  // =========================================================================

  describe('High risk decision: approval required -> reject', () => {
    it('should require approval for high risk decisions', () => {
      const decision = gov.gateConfidence('increase_spend', 0.75, { budget_amount: 25000 });

      expect(decision.status).toBe('pending_approval');
      expect(decision.risk_level).toBe('high');
      expect(decision.requires_approval).toBe(true);
    });

    it('should reject and record rejection reason', () => {
      const decision = gov.gateConfidence('increase_spend', 0.75, { budget_amount: 25000 });

      const approval = gov.getApprovalForDecision(decision.id);
      const rejected = gov.resolveApproval(
        approval!.id,
        'admin-user-2',
        'reject',
        'Budget too high for current market conditions',
      );

      expect(rejected.status).toBe('rejected');

      const updatedDecision = gov.getDecision(decision.id);
      expect(updatedDecision!.status).toBe('rejected');
      expect(updatedDecision!.rejected_by).toBe('admin-user-2');
      expect(updatedDecision!.rejection_reason).toBe('Budget too high for current market conditions');

      // Verify audit trail
      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(2);
      expect(trail[1].action).toBe('approval_rejected');
    });
  });

  // =========================================================================
  // Manual override flow
  // =========================================================================

  describe('Manual override flow', () => {
    it('should allow admin to override a blocked decision', () => {
      const decision = gov.gateConfidence('emergency_spend', 0.45, { budget_amount: 500 });
      expect(decision.status).toBe('blocked');

      // Admin manually overrides
      const overridden = gov.manualOverride(
        decision.id,
        'admin-user-1',
        'Emergency situation requires immediate action',
      );

      expect(overridden.status).toBe('overridden');
      expect(overridden.override_by).toBe('admin-user-1');
      expect(overridden.override_reason).toBe('Emergency situation requires immediate action');
      expect(overridden.resolved_at).not.toBeNull();

      // Verify audit trail
      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(2);
      expect(trail[1].action).toBe('manual_override');
      expect(trail[1].actor).toBe('admin-user-1');
    });

    it('should throw when overriding a non-existent decision', () => {
      expect(() => gov.manualOverride('nonexistent', 'admin-1', 'test')).toThrow('not found');
    });
  });

  // =========================================================================
  // Governance metrics after multiple decisions
  // =========================================================================

  describe('Governance metrics accumulation', () => {
    it('should correctly calculate metrics after multiple decisions', () => {
      // Auto-approved (high confidence, low risk)
      gov.gateConfidence('minor_adjustment', 0.92, { budget_amount: 100 });

      // Blocked (low confidence)
      gov.gateConfidence('risky_move', 0.40, { budget_amount: 200 });

      // Pending approval (medium confidence, medium risk)
      const pendingDecision = gov.gateConfidence('budget_increase', 0.75, { budget_amount: 8000 });

      // Approve it
      const approval1 = gov.getApprovalForDecision(pendingDecision.id);
      gov.resolveApproval(approval1!.id, 'admin-1', 'approve', 'Approved after review');

      // Another pending -> reject
      const rejectDecision = gov.gateConfidence('new_country_launch', 0.80, { budget_amount: 5000 });
      const approval2 = gov.getApprovalForDecision(rejectDecision.id);
      gov.resolveApproval(approval2!.id, 'admin-2', 'reject', 'Not ready');

      // Blocked -> override
      const blockedDecision = gov.gateConfidence('emergency_action', 0.35, { budget_amount: 100 });
      gov.manualOverride(blockedDecision.id, 'admin-1', 'Emergency override');

      const metrics = gov.getMetrics();

      expect(metrics.total_decisions).toBe(5);
      expect(metrics.auto_approved).toBe(1);
      expect(metrics.manually_approved).toBe(1);
      expect(metrics.rejected).toBe(1);
      expect(metrics.blocked).toBe(1);
      expect(metrics.overridden).toBe(1);
      expect(metrics.avg_confidence).toBeCloseTo((0.92 + 0.40 + 0.75 + 0.80 + 0.35) / 5, 2);
    });

    it('should track risk distribution correctly', () => {
      gov.gateConfidence('low_risk_1', 0.90, { budget_amount: 100 });
      gov.gateConfidence('low_risk_2', 0.88, { budget_amount: 200 });
      gov.gateConfidence('medium_risk', 0.72, { budget_amount: 5000 });
      gov.gateConfidence('high_risk', 0.65, { budget_amount: 25000 });
      gov.gateConfidence('critical_risk', 0.30, { budget_amount: 100 });

      const metrics = gov.getMetrics();

      expect(metrics.risk_distribution.low).toBe(2);
      expect(metrics.risk_distribution.medium).toBe(1);
      expect(metrics.risk_distribution.high).toBe(1);
      expect(metrics.risk_distribution.critical).toBe(1);
    });
  });

  // =========================================================================
  // Policy update affects gating
  // =========================================================================

  describe('Policy update affects gating behavior', () => {
    it('should lower the auto-approve threshold when policy is updated', () => {
      // Default: auto_approve at 0.85
      const beforeUpdate = gov.gateConfidence('standard_op', 0.80, { budget_amount: 100 });
      // 0.80 is below 0.85 auto-approve but above 0.60, and risk is low, so pending_approval
      expect(beforeUpdate.status).toBe('pending_approval');

      // Lower the auto-approve threshold
      gov.updatePolicy({
        confidence_thresholds: {
          auto_approve: 0.70,
          require_approval: 0.50,
          block: 0.50,
        },
      });

      // Now 0.80 should be auto-approved (above new 0.70 threshold)
      const afterUpdate = gov.gateConfidence('standard_op', 0.80, { budget_amount: 100 });
      expect(afterUpdate.status).toBe('approved');
    });

    it('should raise the block threshold when policy is tightened', () => {
      // Default: block at 0.60
      const beforeTighten = gov.gateConfidence('edge_case', 0.62, { budget_amount: 100 });
      expect(beforeTighten.status).not.toBe('blocked');

      // Raise block threshold
      gov.updatePolicy({
        confidence_thresholds: {
          auto_approve: 0.90,
          require_approval: 0.75,
          block: 0.75,
        },
      });

      // Now 0.62 is below the new 0.75 block threshold
      const afterTighten = gov.gateConfidence('edge_case', 0.62, { budget_amount: 100 });
      expect(afterTighten.status).toBe('blocked');
    });

    it('should update human review types in policy', () => {
      // 'optimize_targeting' is not in require_human_review_types by default
      const beforeAdd = gov.gateConfidence('optimize_targeting', 0.90, { budget_amount: 100 });
      expect(beforeAdd.status).toBe('approved');

      // Add it to human review types
      gov.updatePolicy({
        require_human_review_types: ['budget_increase', 'new_country_launch', 'optimize_targeting'],
      });

      // Now it should require approval (medium risk due to human review type)
      const afterAdd = gov.gateConfidence('optimize_targeting', 0.90, { budget_amount: 100 });
      expect(afterAdd.status).toBe('pending_approval');
    });
  });

  // =========================================================================
  // Auto-approve for high confidence + low risk
  // =========================================================================

  describe('Auto-approve for high confidence decisions', () => {
    it('should auto-approve a high confidence low risk decision', () => {
      const decision = gov.gateConfidence('minor_bid_adjustment', 0.95, { budget_amount: 500 });

      expect(decision.status).toBe('approved');
      expect(decision.requires_approval).toBe(false);
      expect(decision.confidence_score).toBe(0.95);
      expect(decision.risk_level).toBe('low');
      expect(decision.resolved_at).not.toBeNull();
    });
  });

  // =========================================================================
  // Audit trail completeness
  // =========================================================================

  describe('Audit trail completeness', () => {
    it('should produce a complete audit trail for approval flow', () => {
      const decision = gov.gateConfidence('budget_increase', 0.75, { budget_amount: 8000 });
      const approval = gov.getApprovalForDecision(decision.id);
      gov.resolveApproval(approval!.id, 'admin-1', 'approve', 'Budget within limits');

      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(2);

      expect(trail[0].action).toBe('confidence_gate_evaluated');
      expect(trail[0].actor).toBe('system');
      expect(trail[0].details.confidence_score).toBe(0.75);

      expect(trail[1].action).toBe('approval_approved');
      expect(trail[1].actor).toBe('admin-1');
      expect(trail[1].details.reason).toBe('Budget within limits');
    });

    it('should produce a complete audit trail for override flow', () => {
      const decision = gov.gateConfidence('critical_action', 0.40, { budget_amount: 100 });
      gov.manualOverride(decision.id, 'admin-1', 'Override due to time sensitivity');

      const trail = gov.getAuditTrail(decision.id);
      expect(trail).toHaveLength(2);

      expect(trail[0].action).toBe('confidence_gate_evaluated');
      expect(trail[0].details.result).toBe('blocked');

      expect(trail[1].action).toBe('manual_override');
      expect(trail[1].actor).toBe('admin-1');
      expect(trail[1].details.reason).toBe('Override due to time sensitivity');
    });
  });

  // =========================================================================
  // Pending approvals queue
  // =========================================================================

  describe('Pending approvals queue', () => {
    it('should track multiple pending approvals and clear them on resolution', () => {
      gov.gateConfidence('task_1', 0.72, { budget_amount: 5000 });
      gov.gateConfidence('task_2', 0.68, { budget_amount: 6000 });
      gov.gateConfidence('task_3', 0.70, { budget_amount: 7000 });

      const pending = gov.getPendingApprovals();
      expect(pending).toHaveLength(3);

      // Resolve first
      gov.resolveApproval(pending[0].id, 'admin-1', 'approve', 'OK');

      const afterResolve = gov.getPendingApprovals();
      expect(afterResolve).toHaveLength(2);
    });
  });

  // =========================================================================
  // Critical risk blocking
  // =========================================================================

  describe('Critical risk: always blocked', () => {
    it('should block decisions with critical risk regardless of confidence', () => {
      // Very high budget triggers critical risk
      const decision = gov.gateConfidence('huge_budget', 0.90, { budget_amount: 60000 });

      expect(decision.status).toBe('blocked');
      expect(decision.risk_level).toBe('critical');
    });
  });
});

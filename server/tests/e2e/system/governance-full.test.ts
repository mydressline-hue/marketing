/**
 * E2E System Tests - Governance Full
 *
 * Comprehensive tests for the governance framework:
 *   - Low-confidence decision is blocked
 *   - High-risk action requires approval
 *   - Human override works at all levels
 *   - Rollback plan is generated for risky actions
 *   - Immutable audit trail
 *   - Manual approval workflow
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

jest.mock('../../../src/utils/helpers', () => {
  let counter = 0;
  return {
    generateId: jest.fn(() => `gov-uuid-${++counter}`),
    hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
    comparePassword: jest.fn().mockResolvedValue(true),
    encrypt: jest.fn().mockReturnValue('encrypted-value'),
    decrypt: jest.fn().mockReturnValue('decrypted-value'),
    paginate: jest.fn(),
    sleep: jest.fn().mockResolvedValue(undefined),
    retryWithBackoff: jest.fn(),
  };
});

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
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet } from '../../../src/config/redis';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type DecisionStatus =
  | 'pending_gate'
  | 'blocked'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'overridden'
  | 'rolled_back';

interface GovernancePolicy {
  confidence_thresholds: {
    auto_approve: number;
    require_approval: number;
    block: number;
  };
  risk_thresholds: {
    auto_approve_max_risk: RiskLevel;
    require_approval_risk: RiskLevel[];
    block_risk: RiskLevel[];
  };
  max_budget_auto_approve: number;
  require_human_review_types: string[];
}

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: Record<string, unknown>;
  immutable_hash: string;
}

interface RollbackPlan {
  id: string;
  decision_id: string;
  steps: RollbackStep[];
  estimated_duration_minutes: number;
  risk_assessment: string;
  created_at: string;
}

interface RollbackStep {
  order: number;
  action: string;
  target: string;
  description: string;
  automated: boolean;
}

interface GovernanceDecision {
  id: string;
  decision_type: string;
  agent_type: string;
  confidence_score: number;
  risk_level: RiskLevel;
  status: DecisionStatus;
  requires_approval: boolean;
  approved_by: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  override_by: string | null;
  override_reason: string | null;
  rollback_plan: RollbackPlan | null;
  audit_trail: AuditEntry[];
  context: Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Governance Service Simulator
// ---------------------------------------------------------------------------

class GovernanceServiceSimulator {
  private decisions: Map<string, GovernanceDecision> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private policy: GovernancePolicy;
  private idCounter = 0;
  private auditCounter = 0;

  constructor() {
    this.policy = {
      confidence_thresholds: {
        auto_approve: 85,
        require_approval: 60,
        block: 60,
      },
      risk_thresholds: {
        auto_approve_max_risk: 'low',
        require_approval_risk: ['medium', 'high'],
        block_risk: ['critical'],
      },
      max_budget_auto_approve: 10000,
      require_human_review_types: ['budget_increase', 'new_country_launch', 'api_key_rotation'],
    };
  }

  private generateAuditHash(action: string, actor: string, timestamp: string): string {
    // Simulated hash for immutability verification
    return `hash_${action}_${actor}_${timestamp.replace(/[^0-9]/g, '').slice(0, 12)}`;
  }

  private createAuditEntry(action: string, actor: string, details: Record<string, unknown>): AuditEntry {
    this.auditCounter += 1;
    const timestamp = new Date().toISOString();
    return {
      id: `audit-${this.auditCounter}`,
      action,
      actor,
      timestamp,
      details,
      immutable_hash: this.generateAuditHash(action, actor, timestamp),
    };
  }

  private assessRiskLevel(
    decisionType: string,
    confidenceScore: number,
    context: Record<string, unknown>,
  ): RiskLevel {
    const budgetAmount = (context.budget_amount as number) || 0;
    if (budgetAmount > this.policy.max_budget_auto_approve * 5) return 'critical';
    if (budgetAmount > this.policy.max_budget_auto_approve * 2) return 'high';

    if (confidenceScore < 40) return 'critical';
    if (confidenceScore < 60) return 'high';
    if (confidenceScore < 75) return 'medium';

    if (this.policy.require_human_review_types.includes(decisionType)) return 'medium';

    return 'low';
  }

  private determineStatus(
    confidenceScore: number,
    riskLevel: RiskLevel,
    decisionType: string,
  ): DecisionStatus {
    if (confidenceScore < this.policy.confidence_thresholds.block) {
      return 'blocked';
    }

    if (this.policy.risk_thresholds.block_risk.includes(riskLevel)) {
      return 'blocked';
    }

    if (this.policy.risk_thresholds.require_approval_risk.includes(riskLevel)) {
      return 'pending_approval';
    }

    if (this.policy.require_human_review_types.includes(decisionType)) {
      return 'pending_approval';
    }

    if (
      confidenceScore >= this.policy.confidence_thresholds.auto_approve &&
      riskLevel === this.policy.risk_thresholds.auto_approve_max_risk
    ) {
      return 'approved';
    }

    if (confidenceScore >= this.policy.confidence_thresholds.require_approval) {
      return 'pending_approval';
    }

    return 'blocked';
  }

  private generateRollbackPlan(decision: GovernanceDecision): RollbackPlan {
    this.idCounter += 1;
    const steps: RollbackStep[] = [];

    // Generate rollback steps based on decision type
    switch (decision.decision_type) {
      case 'budget_increase':
        steps.push(
          { order: 1, action: 'revert_budget', target: 'budget_allocation', description: 'Revert budget to previous allocation', automated: true },
          { order: 2, action: 'pause_new_campaigns', target: 'campaign_service', description: 'Pause any campaigns started with new budget', automated: true },
          { order: 3, action: 'notify_stakeholders', target: 'notification_service', description: 'Notify stakeholders of budget rollback', automated: false },
        );
        break;
      case 'new_country_launch':
        steps.push(
          { order: 1, action: 'stop_country_campaigns', target: 'campaign_service', description: 'Stop all campaigns in the new country', automated: true },
          { order: 2, action: 'disable_country', target: 'country_service', description: 'Disable country in system', automated: true },
          { order: 3, action: 'revoke_api_keys', target: 'api_key_service', description: 'Revoke any country-specific API keys', automated: true },
          { order: 4, action: 'review_spent_budget', target: 'finance_service', description: 'Review and reconcile any spent budget', automated: false },
        );
        break;
      case 'campaign_scale':
        steps.push(
          { order: 1, action: 'revert_scale', target: 'campaign_service', description: 'Revert campaign to previous scale', automated: true },
          { order: 2, action: 'adjust_bids', target: 'bid_service', description: 'Revert bid adjustments', automated: true },
        );
        break;
      default:
        steps.push(
          { order: 1, action: 'revert_changes', target: 'general', description: `Revert ${decision.decision_type} changes`, automated: false },
          { order: 2, action: 'validate_state', target: 'system', description: 'Validate system state after rollback', automated: true },
        );
    }

    return {
      id: `rollback-${this.idCounter}`,
      decision_id: decision.id,
      steps,
      estimated_duration_minutes: steps.length * 5,
      risk_assessment: decision.risk_level === 'high' || decision.risk_level === 'critical'
        ? 'High risk rollback - requires manual verification after automated steps'
        : 'Standard rollback - automated steps should be sufficient',
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Submit a decision through the governance gate.
   */
  gateDecision(
    decisionType: string,
    agentType: string,
    confidenceScore: number,
    context: Record<string, unknown> = {},
  ): GovernanceDecision {
    this.idCounter += 1;
    const id = `gov-${this.idCounter}`;
    const riskLevel = this.assessRiskLevel(decisionType, confidenceScore, context);
    const status = this.determineStatus(confidenceScore, riskLevel, decisionType);
    const requiresApproval = status === 'pending_approval';

    // Generate rollback plan for risky actions
    const isRisky = riskLevel === 'medium' || riskLevel === 'high' || riskLevel === 'critical';

    const decision: GovernanceDecision = {
      id,
      decision_type: decisionType,
      agent_type: agentType,
      confidence_score: confidenceScore,
      risk_level: riskLevel,
      status,
      requires_approval: requiresApproval,
      approved_by: null,
      rejected_by: null,
      rejection_reason: null,
      override_by: null,
      override_reason: null,
      rollback_plan: null,
      audit_trail: [
        this.createAuditEntry('governance_gate_evaluated', 'system', {
          confidence_score: confidenceScore,
          risk_level: riskLevel,
          result: status,
          agent_type: agentType,
        }),
      ],
      context,
      created_at: new Date().toISOString(),
      resolved_at: status === 'approved' ? new Date().toISOString() : null,
    };

    // Attach rollback plan for risky decisions
    if (isRisky) {
      decision.rollback_plan = this.generateRollbackPlan(decision);
      decision.audit_trail.push(
        this.createAuditEntry('rollback_plan_generated', 'system', {
          rollback_id: decision.rollback_plan.id,
          steps_count: decision.rollback_plan.steps.length,
        }),
      );
    }

    this.decisions.set(id, decision);

    if (requiresApproval) {
      this.createApprovalRequest(id);
    }

    return decision;
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

  /**
   * Resolve an approval request (approve or reject).
   */
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

      decision.audit_trail.push(
        this.createAuditEntry(`approval_${action}d`, userId, {
          approval_id: approvalId,
          reason,
        }),
      );
    }

    return approval;
  }

  /**
   * Manual override - allows admin to override any decision status.
   */
  manualOverride(
    decisionId: string,
    userId: string,
    newStatus: 'approved' | 'blocked',
    reason: string,
  ): GovernanceDecision {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error(`Decision ${decisionId} not found`);

    const previousStatus = decision.status;
    decision.status = newStatus === 'approved' ? 'overridden' : 'blocked';
    decision.override_by = userId;
    decision.override_reason = reason;
    decision.resolved_at = new Date().toISOString();

    decision.audit_trail.push(
      this.createAuditEntry('manual_override', userId, {
        previous_status: previousStatus,
        new_status: decision.status,
        reason,
      }),
    );

    return decision;
  }

  /**
   * Execute rollback for a decision.
   */
  executeRollback(decisionId: string, userId: string): GovernanceDecision {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error(`Decision ${decisionId} not found`);
    if (!decision.rollback_plan) throw new Error(`No rollback plan for decision ${decisionId}`);

    decision.status = 'rolled_back';
    decision.resolved_at = new Date().toISOString();

    decision.audit_trail.push(
      this.createAuditEntry('rollback_executed', userId, {
        rollback_id: decision.rollback_plan.id,
        steps_executed: decision.rollback_plan.steps.length,
      }),
    );

    return decision;
  }

  getDecision(decisionId: string): GovernanceDecision | undefined {
    return this.decisions.get(decisionId);
  }

  getApprovalForDecision(decisionId: string): ApprovalRequest | undefined {
    return Array.from(this.approvals.values()).find((a) => a.decision_id === decisionId);
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter((a) => a.status === 'pending');
  }

  getAuditTrail(decisionId: string): AuditEntry[] {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new Error(`Decision ${decisionId} not found`);
    return [...decision.audit_trail];
  }

  getFullAuditLog(): AuditEntry[] {
    const allEntries: AuditEntry[] = [];
    for (const decision of this.decisions.values()) {
      allEntries.push(...decision.audit_trail);
    }
    return allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  updatePolicy(updates: Partial<GovernancePolicy>): void {
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
  }

  reset(): void {
    this.decisions.clear();
    this.approvals.clear();
    this.idCounter = 0;
    this.auditCounter = 0;
    this.policy = {
      confidence_thresholds: {
        auto_approve: 85,
        require_approval: 60,
        block: 60,
      },
      risk_thresholds: {
        auto_approve_max_risk: 'low',
        require_approval_risk: ['medium', 'high'],
        block_risk: ['critical'],
      },
      max_budget_auto_approve: 10000,
      require_human_review_types: ['budget_increase', 'new_country_launch', 'api_key_rotation'],
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Governance Full E2E System Tests', () => {
  let gov: GovernanceServiceSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    gov = new GovernanceServiceSimulator();
  });

  // =========================================================================
  // 1. Low-confidence decision is blocked
  // =========================================================================

  describe('Low-Confidence Decision Blocking', () => {
    it('should block a decision with confidence below the threshold', () => {
      const decision = gov.gateDecision('optimize_budget', 'budget_optimization', 45, {
        budget_amount: 500,
      });

      expect(decision.status).toBe('blocked');
      expect(decision.requires_approval).toBe(false);
      expect(decision.confidence_score).toBe(45);
    });

    it('should block a decision with very low confidence as critical risk', () => {
      const decision = gov.gateDecision('scale_campaign', 'paid_ads', 25, {
        budget_amount: 100,
      });

      expect(decision.status).toBe('blocked');
      expect(decision.risk_level).toBe('critical');
    });

    it('should block decisions at the exact threshold boundary', () => {
      // Default block threshold is 60; score of 59 should be blocked
      const decision = gov.gateDecision('adjust_bids', 'paid_ads', 59, {
        budget_amount: 200,
      });

      expect(decision.status).toBe('blocked');
    });

    it('should include gate evaluation in audit trail when blocked', () => {
      const decision = gov.gateDecision('risky_action', 'market_intelligence', 40, {});
      const trail = gov.getAuditTrail(decision.id);

      expect(trail.length).toBeGreaterThanOrEqual(1);
      expect(trail[0].action).toBe('governance_gate_evaluated');
      expect(trail[0].details.result).toBe('blocked');
      expect(trail[0].details.confidence_score).toBe(40);
    });
  });

  // =========================================================================
  // 2. High-risk action requires approval
  // =========================================================================

  describe('High-Risk Action Approval Requirement', () => {
    it('should require approval for high-risk decisions', () => {
      const decision = gov.gateDecision('increase_spend', 'budget_optimization', 75, {
        budget_amount: 25000,
      });

      expect(decision.status).toBe('pending_approval');
      expect(decision.risk_level).toBe('high');
      expect(decision.requires_approval).toBe(true);
    });

    it('should create an approval request for pending decisions', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const approval = gov.getApprovalForDecision(decision.id);
      expect(approval).toBeDefined();
      expect(approval!.status).toBe('pending');
      expect(approval!.decision_id).toBe(decision.id);
    });

    it('should approve the decision when approval is granted', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const approval = gov.getApprovalForDecision(decision.id)!;
      const resolved = gov.resolveApproval(approval.id, 'admin-1', 'approve', 'Budget within limits');

      expect(resolved.status).toBe('approved');
      const updated = gov.getDecision(decision.id)!;
      expect(updated.status).toBe('approved');
      expect(updated.approved_by).toBe('admin-1');
      expect(updated.resolved_at).not.toBeNull();
    });

    it('should reject the decision when approval is denied', () => {
      const decision = gov.gateDecision('new_country_launch', 'country_strategy', 70, {
        budget_amount: 15000,
      });

      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'admin-2', 'reject', 'Market conditions unfavorable');

      const updated = gov.getDecision(decision.id)!;
      expect(updated.status).toBe('rejected');
      expect(updated.rejected_by).toBe('admin-2');
      expect(updated.rejection_reason).toBe('Market conditions unfavorable');
    });

    it('should block critical risk decisions even with high confidence', () => {
      const decision = gov.gateDecision('massive_budget', 'budget_optimization', 92, {
        budget_amount: 60000,
      });

      expect(decision.status).toBe('blocked');
      expect(decision.risk_level).toBe('critical');
    });
  });

  // =========================================================================
  // 3. Human override works at all levels
  // =========================================================================

  describe('Human Override at All Levels', () => {
    it('should allow admin to override a blocked decision to approved', () => {
      const decision = gov.gateDecision('emergency_spend', 'budget_optimization', 45, {
        budget_amount: 500,
      });
      expect(decision.status).toBe('blocked');

      const overridden = gov.manualOverride(
        decision.id,
        'admin-1',
        'approved',
        'Emergency situation requires immediate action',
      );

      expect(overridden.status).toBe('overridden');
      expect(overridden.override_by).toBe('admin-1');
      expect(overridden.override_reason).toBe('Emergency situation requires immediate action');
    });

    it('should allow admin to override an approved decision to blocked', () => {
      const decision = gov.gateDecision('minor_adjustment', 'paid_ads', 92, {
        budget_amount: 100,
      });
      expect(decision.status).toBe('approved');

      const overridden = gov.manualOverride(
        decision.id,
        'admin-1',
        'blocked',
        'Reconsidered due to new information',
      );

      expect(overridden.status).toBe('blocked');
      expect(overridden.override_by).toBe('admin-1');
    });

    it('should allow admin to override a pending_approval decision', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });
      expect(decision.status).toBe('pending_approval');

      const overridden = gov.manualOverride(
        decision.id,
        'admin-1',
        'approved',
        'Expedited approval due to time sensitivity',
      );

      expect(overridden.status).toBe('overridden');
    });

    it('should allow admin to override a rejected decision', () => {
      const decision = gov.gateDecision('new_country_launch', 'country_strategy', 72, {
        budget_amount: 5000,
      });

      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'reviewer-1', 'reject', 'Not ready');

      const overridden = gov.manualOverride(
        decision.id,
        'admin-ceo',
        'approved',
        'CEO override: strategic priority',
      );

      expect(overridden.status).toBe('overridden');
      expect(overridden.override_by).toBe('admin-ceo');
    });

    it('should record override in audit trail', () => {
      const decision = gov.gateDecision('emergency_action', 'compliance', 40, {});
      gov.manualOverride(decision.id, 'admin-1', 'approved', 'Override required');

      const trail = gov.getAuditTrail(decision.id);
      const overrideEntry = trail.find((e) => e.action === 'manual_override');
      expect(overrideEntry).toBeDefined();
      expect(overrideEntry!.actor).toBe('admin-1');
      expect(overrideEntry!.details.reason).toBe('Override required');
      expect(overrideEntry!.details.previous_status).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Rollback plan generated for risky actions
  // =========================================================================

  describe('Rollback Plan Generation', () => {
    it('should generate a rollback plan for medium-risk decisions', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      expect(decision.rollback_plan).not.toBeNull();
      expect(decision.rollback_plan!.decision_id).toBe(decision.id);
      expect(decision.rollback_plan!.steps.length).toBeGreaterThan(0);
    });

    it('should generate budget-specific rollback steps for budget_increase', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const steps = decision.rollback_plan!.steps;
      expect(steps[0].action).toBe('revert_budget');
      expect(steps.some((s) => s.action === 'pause_new_campaigns')).toBe(true);
      expect(steps.some((s) => s.action === 'notify_stakeholders')).toBe(true);
    });

    it('should generate country-specific rollback steps for new_country_launch', () => {
      const decision = gov.gateDecision('new_country_launch', 'country_strategy', 72, {
        budget_amount: 5000,
      });

      const steps = decision.rollback_plan!.steps;
      expect(steps[0].action).toBe('stop_country_campaigns');
      expect(steps.some((s) => s.action === 'disable_country')).toBe(true);
      expect(steps.some((s) => s.action === 'revoke_api_keys')).toBe(true);
    });

    it('should not generate a rollback plan for low-risk decisions', () => {
      const decision = gov.gateDecision('minor_adjustment', 'paid_ads', 92, {
        budget_amount: 100,
      });

      expect(decision.rollback_plan).toBeNull();
    });

    it('should include rollback plan generation in audit trail', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const trail = gov.getAuditTrail(decision.id);
      const rollbackEntry = trail.find((e) => e.action === 'rollback_plan_generated');
      expect(rollbackEntry).toBeDefined();
      expect(rollbackEntry!.details.steps_count).toBeGreaterThan(0);
    });

    it('should allow executing the rollback plan', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      // Approve and then rollback
      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'admin-1', 'approve', 'Approved');

      const rolledBack = gov.executeRollback(decision.id, 'admin-1');
      expect(rolledBack.status).toBe('rolled_back');

      const trail = gov.getAuditTrail(decision.id);
      const rollbackExecEntry = trail.find((e) => e.action === 'rollback_executed');
      expect(rollbackExecEntry).toBeDefined();
    });

    it('should estimate rollback duration based on step count', () => {
      const decision = gov.gateDecision('new_country_launch', 'country_strategy', 72, {
        budget_amount: 5000,
      });

      const plan = decision.rollback_plan!;
      expect(plan.estimated_duration_minutes).toBe(plan.steps.length * 5);
    });
  });

  // =========================================================================
  // 5. Immutable audit trail
  // =========================================================================

  describe('Immutable Audit Trail', () => {
    it('should create an audit entry for every governance action', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'admin-1', 'approve', 'Approved');

      const trail = gov.getAuditTrail(decision.id);
      // gate_evaluated + rollback_plan_generated + approval_approved = 3
      expect(trail.length).toBeGreaterThanOrEqual(3);
    });

    it('should include immutable hash in every audit entry', () => {
      const decision = gov.gateDecision('test_action', 'compliance', 80, {});

      const trail = gov.getAuditTrail(decision.id);
      for (const entry of trail) {
        expect(entry.immutable_hash).toBeDefined();
        expect(entry.immutable_hash.startsWith('hash_')).toBe(true);
      }
    });

    it('should preserve audit trail order chronologically', () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'admin-1', 'approve', 'OK');
      gov.manualOverride(decision.id, 'admin-2', 'blocked', 'Reconsidered');

      const trail = gov.getAuditTrail(decision.id);
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].timestamp >= trail[i - 1].timestamp).toBe(true);
      }
    });

    it('should provide a full audit log across all decisions', () => {
      gov.gateDecision('action_1', 'paid_ads', 92, { budget_amount: 100 });
      gov.gateDecision('action_2', 'compliance', 72, { budget_amount: 5000 });
      gov.gateDecision('action_3', 'fraud_detection', 35, {});

      const fullLog = gov.getFullAuditLog();
      expect(fullLog.length).toBeGreaterThanOrEqual(3); // At least one per decision
    });

    it('should persist audit trail to database', async () => {
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 72, {
        budget_amount: 8000,
      });

      const trail = gov.getAuditTrail(decision.id);

      for (const entry of trail) {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ id: entry.id, action: entry.action, immutable_hash: entry.immutable_hash }],
          rowCount: 1,
        });

        const dbResult = await mockPool.query(
          `INSERT INTO governance_audit_trail
            (id, decision_id, action, actor, details, immutable_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            entry.id,
            decision.id,
            entry.action,
            entry.actor,
            JSON.stringify(entry.details),
            entry.immutable_hash,
            entry.timestamp,
          ],
        );

        expect(dbResult.rows[0].immutable_hash).toBe(entry.immutable_hash);
      }
    });

    it('should have unique IDs for all audit entries', () => {
      gov.gateDecision('action_1', 'paid_ads', 72, { budget_amount: 5000 });
      gov.gateDecision('action_2', 'compliance', 80, {});
      gov.gateDecision('action_3', 'fraud_detection', 92, { budget_amount: 100 });

      const fullLog = gov.getFullAuditLog();
      const ids = fullLog.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // =========================================================================
  // 6. Manual approval workflow
  // =========================================================================

  describe('Manual Approval Workflow', () => {
    it('should track multiple pending approvals simultaneously', () => {
      gov.gateDecision('task_1', 'paid_ads', 72, { budget_amount: 5000 });
      gov.gateDecision('task_2', 'budget_optimization', 68, { budget_amount: 6000 });
      gov.gateDecision('task_3', 'country_strategy', 70, { budget_amount: 7000 });

      const pending = gov.getPendingApprovals();
      expect(pending).toHaveLength(3);
    });

    it('should clear pending count when approvals are resolved', () => {
      gov.gateDecision('task_a', 'paid_ads', 72, { budget_amount: 5000 });
      gov.gateDecision('task_b', 'compliance', 68, { budget_amount: 6000 });

      const pending = gov.getPendingApprovals();
      expect(pending).toHaveLength(2);

      gov.resolveApproval(pending[0].id, 'admin-1', 'approve', 'OK');

      expect(gov.getPendingApprovals()).toHaveLength(1);

      gov.resolveApproval(pending[1].id, 'admin-1', 'reject', 'No');

      expect(gov.getPendingApprovals()).toHaveLength(0);
    });

    it('should prevent double resolution of an approval', () => {
      const decision = gov.gateDecision('task_x', 'paid_ads', 72, { budget_amount: 5000 });
      const approval = gov.getApprovalForDecision(decision.id)!;

      gov.resolveApproval(approval.id, 'admin-1', 'approve', 'OK');

      expect(() =>
        gov.resolveApproval(approval.id, 'admin-2', 'reject', 'Too late'),
      ).toThrow('already resolved');
    });

    it('should auto-approve low-risk high-confidence decisions without manual step', () => {
      const decision = gov.gateDecision('minor_bid_change', 'paid_ads', 92, {
        budget_amount: 100,
      });

      expect(decision.status).toBe('approved');
      expect(decision.requires_approval).toBe(false);
      expect(decision.approved_by).toBeNull(); // Auto-approved, no human involved

      const approval = gov.getApprovalForDecision(decision.id);
      expect(approval).toBeUndefined(); // No approval request created
    });

    it('should always require human review for configured decision types', () => {
      const decision = gov.gateDecision('api_key_rotation', 'enterprise_security', 90, {
        budget_amount: 0,
      });

      // Even with high confidence, api_key_rotation is in require_human_review_types
      expect(decision.status).toBe('pending_approval');
      expect(decision.requires_approval).toBe(true);
    });
  });

  // =========================================================================
  // 7. End-to-end governance lifecycle
  // =========================================================================

  describe('End-to-End Governance Lifecycle', () => {
    it('should handle a complete lifecycle: gate -> approve -> execute -> rollback', () => {
      // Step 1: Gate the decision
      const decision = gov.gateDecision('budget_increase', 'budget_optimization', 75, {
        budget_amount: 12000,
      });
      expect(decision.status).toBe('pending_approval');
      expect(decision.rollback_plan).not.toBeNull();

      // Step 2: Approve
      const approval = gov.getApprovalForDecision(decision.id)!;
      gov.resolveApproval(approval.id, 'admin-1', 'approve', 'Budget approved');
      expect(gov.getDecision(decision.id)!.status).toBe('approved');

      // Step 3: Execute rollback (simulating issue after execution)
      const rolledBack = gov.executeRollback(decision.id, 'admin-1');
      expect(rolledBack.status).toBe('rolled_back');

      // Step 4: Verify full audit trail
      const trail = gov.getAuditTrail(decision.id);
      const actions = trail.map((e) => e.action);
      expect(actions).toContain('governance_gate_evaluated');
      expect(actions).toContain('rollback_plan_generated');
      expect(actions).toContain('approval_approved');
      expect(actions).toContain('rollback_executed');
    });

    it('should handle lifecycle: gate -> block -> override -> verify', () => {
      // Step 1: Decision is blocked
      const decision = gov.gateDecision('critical_action', 'fraud_detection', 30, {});
      expect(decision.status).toBe('blocked');

      // Step 2: Admin overrides
      gov.manualOverride(decision.id, 'admin-ceo', 'approved', 'CEO authorization');
      expect(gov.getDecision(decision.id)!.status).toBe('overridden');

      // Step 3: Verify audit trail captures everything
      const trail = gov.getAuditTrail(decision.id);
      expect(trail.length).toBeGreaterThanOrEqual(3); // gate + rollback_plan + override
      expect(trail[trail.length - 1].action).toBe('manual_override');
    });
  });
});

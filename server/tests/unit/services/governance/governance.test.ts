/**
 * Unit tests for GovernanceService.
 *
 * Database pool, Redis cache, logger, generateId, and AuditService are
 * fully mocked so tests exercise only the service logic: risk assessment,
 * confidence gating, strategy validation, approval workflow, manual overrides,
 * rollback planning, governance metrics, and policy CRUD.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('generated-uuid'),
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { GovernanceService } from '../../../../src/services/governance/GovernanceService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { generateId } from '../../../../src/utils/helpers';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DECISION_ROW = {
  id: 'decision-001',
  agent_type: 'market_intelligence',
  decision_type: 'market_entry',
  confidence_score: 75,
  input_data: { region: 'EU', market: 'Germany', timeframe: '6months' },
  output_data: { recommendation: 'proceed', budget_required: 50000 },
  reasoning: 'Strong market signals detected',
  is_approved: false,
  approved_by: null,
  created_at: '2026-01-15T10:00:00Z',
};

const DEFAULT_GOVERNANCE_POLICY = {
  min_confidence_for_auto_approve: 70,
  max_risk_for_auto_approve: 25,
  approval_timeout_minutes: 60,
  require_human_approval_for_levels: ['low'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up mock pool.query calls for getGovernancePolicy() which is called
 * by several methods internally. Configures cache miss + DB result.
 */
function mockPolicyLookup(policy = DEFAULT_GOVERNANCE_POLICY): void {
  // The internal getGovernancePolicy first checks cache, then DB
  // We need cacheGet to return null so it falls through to DB
  mockCacheGet.mockResolvedValueOnce(null);
  mockQuery.mockResolvedValueOnce({
    rows: [{ value: JSON.stringify(policy) }],
  });
}

/**
 * Set up mock for getGovernancePolicy() returning cached policy.
 */
function mockPolicyCached(policy = DEFAULT_GOVERNANCE_POLICY): void {
  mockCacheGet.mockResolvedValueOnce(policy);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GovernanceService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockAuditLog.mockResolvedValue(undefined);
    mockGenerateId.mockReturnValue('generated-uuid');
  });

  // -----------------------------------------------------------------------
  // assessRisk
  // -----------------------------------------------------------------------

  describe('assessRisk', () => {
    it('computes risk score from weighted factors and persists assessment', async () => {
      // Decision lookup
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      // Impact: related decisions count
      mockQuery.mockResolvedValueOnce({ rows: [{ related_count: '5' }] });
      // Historical accuracy
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '20', approved: '18' }] });
      // Agent reliability
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', errors: '1' }] });
      // getGovernancePolicy (cache miss + DB)
      mockPolicyLookup();
      // INSERT risk_assessments
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE agent_decisions (auto-approve if low risk)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.assessRisk('decision-001');

      expect(result.id).toBe('generated-uuid');
      expect(result.decision_id).toBe('decision-001');
      expect(result.agent_type).toBe('market_intelligence');
      expect(result.risk_score).toBeGreaterThanOrEqual(0);
      expect(result.risk_score).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.risk_level);
      expect(result.factors).toHaveLength(5);
      expect(result.assessed_at).toBeDefined();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.risk_assessed',
          resourceType: 'agent_decision',
          resourceId: 'decision-001',
        }),
      );
    });

    it('throws NotFoundError when decision does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.assessRisk('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('assigns low risk level for high-confidence decisions with good history', async () => {
      const highConfidenceDecision = {
        ...DECISION_ROW,
        confidence_score: 95,
        input_data: { a: 'b', c: 'd', e: 'f' }, // Full completeness
      };
      mockQuery.mockResolvedValueOnce({ rows: [highConfidenceDecision] });
      // Impact: many similar decisions
      mockQuery.mockResolvedValueOnce({ rows: [{ related_count: '20' }] });
      // Accuracy: 100%
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50', approved: '50' }] });
      // Reliability: no errors
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', errors: '0' }] });
      // Policy
      mockPolicyLookup();
      // INSERT + UPDATE (auto-approve)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.assessRisk('decision-001');

      expect(result.risk_level).toBe('low');
      expect(result.risk_score).toBeLessThanOrEqual(25);
      expect(result.auto_approved).toBe(true);
      expect(result.requires_approval).toBe(false);
    });

    it('assigns critical risk level for low-confidence decisions with poor history', async () => {
      const lowConfidenceDecision = {
        ...DECISION_ROW,
        confidence_score: 10,
        input_data: {}, // Empty = low quality
      };
      mockQuery.mockResolvedValueOnce({ rows: [lowConfidenceDecision] });
      // Impact: no similar decisions (novel)
      mockQuery.mockResolvedValueOnce({ rows: [{ related_count: '0' }] });
      // Accuracy: 10%
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', approved: '1' }] });
      // Reliability: many errors
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', errors: '8' }] });
      // Policy
      mockPolicyLookup();
      // INSERT risk_assessments
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.assessRisk('decision-001');

      expect(result.risk_level).toBe('critical');
      expect(result.risk_score).toBeGreaterThan(75);
      expect(result.requires_approval).toBe(true);
      expect(result.auto_approved).toBe(false);
    });

    it('correctly weights each risk factor', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [{ related_count: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', approved: '7' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5', errors: '2' }] });
      mockPolicyLookup();
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT
      // May or may not auto-approve depending on score
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.assessRisk('decision-001');

      // Verify factor weights
      const weights = result.factors.map((f) => f.weight);
      expect(weights).toEqual([0.3, 0.25, 0.2, 0.15, 0.1]);

      // Sum of weights = 1.0
      const weightSum = weights.reduce((s, w) => s + w, 0);
      expect(weightSum).toBeCloseTo(1.0, 5);
    });

    it('handles agents with no historical data gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      // No related decisions
      mockQuery.mockResolvedValueOnce({ rows: [{ related_count: '0' }] });
      // No historical decisions
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0', approved: '0' }] });
      // No agent state records
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0', errors: '0' }] });
      mockPolicyLookup();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.assessRisk('decision-001');

      // Should still produce a valid assessment with defaults
      expect(result.risk_score).toBeGreaterThanOrEqual(0);
      expect(result.risk_score).toBeLessThanOrEqual(100);
      expect(result.factors).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // gateByConfidence
  // -----------------------------------------------------------------------

  describe('gateByConfidence', () => {
    it('blocks action when confidence is below minimum threshold (40)', async () => {
      mockPolicyCached();

      const result = await GovernanceService.gateByConfidence(
        'market_intelligence',
        20,
        'market_entry',
      );

      expect(result.allowed).toBe(false);
      expect(result.requires_approval).toBe(false);
      expect(result.reason).toContain('below minimum threshold');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.confidence_gate_blocked',
        }),
      );
    });

    it('requires approval when confidence is between 40 and auto-approve threshold', async () => {
      mockPolicyCached();

      const result = await GovernanceService.gateByConfidence(
        'paid_ads',
        55,
        'budget_allocation',
      );

      expect(result.allowed).toBe(true);
      expect(result.requires_approval).toBe(true);
      expect(result.reason).toContain('Manual approval required');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.confidence_gate_approval_required',
        }),
      );
    });

    it('auto-approves when confidence meets the threshold', async () => {
      mockPolicyCached();

      const result = await GovernanceService.gateByConfidence(
        'content_blog',
        85,
        'content_generation',
      );

      expect(result.allowed).toBe(true);
      expect(result.requires_approval).toBe(false);
      expect(result.reason).toContain('meets auto-approve threshold');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.confidence_gate_passed',
        }),
      );
    });

    it('uses custom policy threshold from governance policy', async () => {
      // Custom policy with higher auto-approve threshold
      mockPolicyCached({
        ...DEFAULT_GOVERNANCE_POLICY,
        min_confidence_for_auto_approve: 90,
      });

      const result = await GovernanceService.gateByConfidence(
        'budget_optimization',
        80,
        'reallocation',
      );

      // 80 >= 40 (not blocked) but < 90 (requires approval)
      expect(result.allowed).toBe(true);
      expect(result.requires_approval).toBe(true);
    });

    it('handles boundary confidence score at exactly 40', async () => {
      mockPolicyCached();

      const result = await GovernanceService.gateByConfidence(
        'fraud_detection',
        40,
        'alert',
      );

      // 40 is not < 40, so not blocked; but 40 < 70, so needs approval
      expect(result.allowed).toBe(true);
      expect(result.requires_approval).toBe(true);
    });

    it('handles boundary confidence score at exactly the auto-approve threshold', async () => {
      mockPolicyCached();

      const result = await GovernanceService.gateByConfidence(
        'compliance',
        70,
        'check',
      );

      // 70 is not < 70, so auto-approved
      expect(result.allowed).toBe(true);
      expect(result.requires_approval).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // validateStrategy
  // -----------------------------------------------------------------------

  describe('validateStrategy', () => {
    it('passes all checks for a valid decision', async () => {
      // Decision lookup
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      // getGovernancePolicy
      mockPolicyLookup();
      // Kill switch check - none active
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Contradicting decisions - none
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Budget check
      mockQuery.mockResolvedValueOnce({ rows: [{ available_budget: '100000' }] });

      const result = await GovernanceService.validateStrategy('decision-001');

      expect(result.valid).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.checks.every((c) => c.passed)).toBe(true);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.strategy_validated',
        }),
      );
    });

    it('fails when confidence is below threshold', async () => {
      const lowConfDecision = { ...DECISION_ROW, confidence_score: 30 };
      mockQuery.mockResolvedValueOnce({ rows: [lowConfDecision] });
      mockPolicyLookup();
      mockQuery.mockResolvedValueOnce({ rows: [] }); // kill switch
      mockQuery.mockResolvedValueOnce({ rows: [] }); // contradictions
      // Budget check (output_data has budget_required: 50000)
      mockQuery.mockResolvedValueOnce({ rows: [{ available_budget: '100000' }] });

      const result = await GovernanceService.validateStrategy('decision-001');

      expect(result.valid).toBe(false);
      const confidenceCheck = result.checks.find((c) => c.name === 'confidence_threshold');
      expect(confidenceCheck?.passed).toBe(false);
    });

    it('fails when active kill switches exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      mockPolicyLookup();
      // Active kill switch
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'ks-1', level: 2, trigger_type: 'spend_anomaly', affected_campaigns: [] }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // contradictions
      mockQuery.mockResolvedValueOnce({ rows: [{ available_budget: '100000' }] }); // budget

      const result = await GovernanceService.validateStrategy('decision-001');

      expect(result.valid).toBe(false);
      const killSwitchCheck = result.checks.find((c) => c.name === 'kill_switch_conflict');
      expect(killSwitchCheck?.passed).toBe(false);
    });

    it('fails when budget exceeds available limits', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      mockPolicyLookup();
      mockQuery.mockResolvedValueOnce({ rows: [] }); // kill switch
      mockQuery.mockResolvedValueOnce({ rows: [] }); // contradictions
      // Budget insufficient
      mockQuery.mockResolvedValueOnce({ rows: [{ available_budget: '1000' }] });

      const result = await GovernanceService.validateStrategy('decision-001');

      expect(result.valid).toBe(false);
      const budgetCheck = result.checks.find((c) => c.name === 'budget_limits');
      expect(budgetCheck?.passed).toBe(false);
      expect(budgetCheck?.message).toContain('exceeds');
    });

    it('throws NotFoundError for nonexistent decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.validateStrategy('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // generateRollbackPlan
  // -----------------------------------------------------------------------

  describe('generateRollbackPlan', () => {
    it('generates a rollback plan with basic steps', async () => {
      const simpleDecision = {
        ...DECISION_ROW,
        output_data: { recommendation: 'proceed' }, // No campaigns or budget
      };
      mockQuery.mockResolvedValueOnce({ rows: [simpleDecision] });
      // INSERT rollback_plans
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const plan = await GovernanceService.generateRollbackPlan('decision-001');

      expect(plan.id).toBe('generated-uuid');
      expect(plan.decision_id).toBe('decision-001');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2); // revert + notify
      expect(plan.steps[0].action).toBe('revert_decision');
      expect(plan.steps[plan.steps.length - 1].action).toBe('notify_stakeholders');
      expect(plan.estimated_impact).toBeDefined();
      expect(plan.created_at).toBeDefined();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.rollback_plan_generated',
        }),
      );
    });

    it('includes campaign rollback steps when decision affects campaigns', async () => {
      const campaignDecision = {
        ...DECISION_ROW,
        output_data: {
          campaign_id: 'campaign-001',
          affected_campaigns: ['campaign-001', 'campaign-002'],
        },
      };
      mockQuery.mockResolvedValueOnce({ rows: [campaignDecision] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const plan = await GovernanceService.generateRollbackPlan('decision-001');

      const campaignStep = plan.steps.find((s) => s.action === 'revert_campaign_changes');
      expect(campaignStep).toBeDefined();
      expect(campaignStep?.target).toBe('campaigns');
    });

    it('includes budget rollback steps when decision involves budget changes', async () => {
      const budgetDecision = {
        ...DECISION_ROW,
        output_data: { budget_changes: 25000, budget_required: 50000 },
      };
      mockQuery.mockResolvedValueOnce({ rows: [budgetDecision] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const plan = await GovernanceService.generateRollbackPlan('decision-001');

      const budgetStep = plan.steps.find((s) => s.action === 'reverse_budget_allocation');
      expect(budgetStep).toBeDefined();
      expect(budgetStep?.target).toBe('budget_allocations');
    });

    it('throws NotFoundError for nonexistent decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.generateRollbackPlan('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // requestApproval
  // -----------------------------------------------------------------------

  describe('requestApproval', () => {
    it('creates a pending approval request', async () => {
      // Decision exists
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'decision-001', agent_type: 'market_intelligence' }],
      });
      // Risk assessment exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'risk-001' }] });
      // INSERT approval_requests
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const approval = await GovernanceService.requestApproval('decision-001', 'risk-001');

      expect(approval.id).toBe('generated-uuid');
      expect(approval.decision_id).toBe('decision-001');
      expect(approval.agent_type).toBe('market_intelligence');
      expect(approval.risk_assessment_id).toBe('risk-001');
      expect(approval.status).toBe('pending');
      expect(approval.requested_at).toBeDefined();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.approval_requested',
        }),
      );
    });

    it('throws NotFoundError when decision does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.requestApproval('nonexistent', 'risk-001'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when risk assessment does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'decision-001', agent_type: 'market_intelligence' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.requestApproval('decision-001', 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // resolveApproval
  // -----------------------------------------------------------------------

  describe('resolveApproval', () => {
    const PENDING_APPROVAL_ROW = {
      id: 'approval-001',
      decision_id: 'decision-001',
      agent_type: 'market_intelligence',
      risk_assessment_id: 'risk-001',
      status: 'pending',
      requested_at: '2026-01-15T10:00:00Z',
    };

    it('approves a pending request and updates the decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PENDING_APPROVAL_ROW] });
      // UPDATE approval_requests
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE agent_decisions (set approved)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.resolveApproval(
        'approval-001',
        'user-001',
        true,
        'Looks good to proceed',
      );

      expect(result.status).toBe('approved');
      expect(result.resolved_by).toBe('user-001');
      expect(result.resolved_at).toBeDefined();
      expect(result.reason).toBe('Looks good to proceed');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.approval_approved',
          userId: 'user-001',
        }),
      );
    });

    it('rejects a pending request without updating the decision approval', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PENDING_APPROVAL_ROW] });
      // UPDATE approval_requests
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GovernanceService.resolveApproval(
        'approval-001',
        'user-001',
        false,
        'Risk too high',
      );

      expect(result.status).toBe('rejected');
      expect(result.resolved_by).toBe('user-001');
      expect(result.reason).toBe('Risk too high');
      // Should NOT call update on agent_decisions for rejection
      expect(mockQuery).toHaveBeenCalledTimes(2); // SELECT + UPDATE approval only
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.approval_rejected',
        }),
      );
    });

    it('throws NotFoundError for nonexistent approval', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.resolveApproval('nonexistent', 'user-001', true),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when trying to resolve an already resolved approval', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...PENDING_APPROVAL_ROW, status: 'approved' }],
      });

      await expect(
        GovernanceService.resolveApproval('approval-001', 'user-001', true),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // getApprovalQueue
  // -----------------------------------------------------------------------

  describe('getApprovalQueue', () => {
    it('returns paginated pending approvals', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-001',
            decision_id: 'decision-001',
            agent_type: 'market_intelligence',
            risk_assessment_id: 'risk-001',
            status: 'pending',
            requested_at: '2026-01-15T10:00:00Z',
            resolved_at: null,
            resolved_by: null,
            reason: null,
          },
          {
            id: 'approval-002',
            decision_id: 'decision-002',
            agent_type: 'paid_ads',
            risk_assessment_id: 'risk-002',
            status: 'pending',
            requested_at: '2026-01-15T11:00:00Z',
            resolved_at: null,
            resolved_by: null,
            reason: null,
          },
        ],
      });

      const result = await GovernanceService.getApprovalQueue({
        status: 'pending',
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.data[0].status).toBe('pending');
    });

    it('filters by agent_type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-001',
            decision_id: 'decision-001',
            agent_type: 'paid_ads',
            risk_assessment_id: 'risk-001',
            status: 'pending',
            requested_at: '2026-01-15T10:00:00Z',
            resolved_at: null,
            resolved_by: null,
            reason: null,
          },
        ],
      });

      const result = await GovernanceService.getApprovalQueue({
        agent_type: 'paid_ads',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].agent_type).toBe('paid_ads');
      // Verify SQL contains agent_type filter
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('agent_type = $1');
    });
  });

  // -----------------------------------------------------------------------
  // executeManualOverride
  // -----------------------------------------------------------------------

  describe('executeManualOverride', () => {
    it('approves a decision via manual override and records previous state', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'decision-001',
          agent_type: 'market_intelligence',
          decision_type: 'market_entry',
          is_approved: false,
          output_data: { recommendation: 'proceed' },
          confidence_score: 65,
        }],
      });
      // UPDATE agent_decisions
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT manual_overrides
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const override = await GovernanceService.executeManualOverride(
        'decision-001',
        'user-001',
        'approve',
        'Human review confirms the recommendation',
      );

      expect(override.id).toBe('generated-uuid');
      expect(override.decision_id).toBe('decision-001');
      expect(override.user_id).toBe('user-001');
      expect(override.override_action).toBe('approve');
      expect(override.reason).toBe('Human review confirms the recommendation');
      expect(override.previous_state).toEqual({
        is_approved: false,
        output_data: { recommendation: 'proceed' },
        confidence_score: 65,
      });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.manual_override',
          details: expect.objectContaining({
            override_hierarchy: 'human > orchestrator > agent',
          }),
        }),
      );
    });

    it('rejects a decision via manual override', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'decision-001',
          agent_type: 'paid_ads',
          decision_type: 'budget_allocation',
          is_approved: true,
          output_data: {},
          confidence_score: 80,
        }],
      });
      // UPDATE agent_decisions (set is_approved = false)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT manual_overrides
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const override = await GovernanceService.executeManualOverride(
        'decision-001',
        'user-001',
        'reject',
        'Budget allocation too aggressive',
      );

      expect(override.override_action).toBe('reject');
      expect(override.previous_state.is_approved).toBe(true);
    });

    it('throws NotFoundError for nonexistent decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.executeManualOverride(
          'nonexistent', 'user-001', 'approve', 'test',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('handles modify override action', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'decision-001',
          agent_type: 'content_blog',
          decision_type: 'content_generation',
          is_approved: true,
          output_data: { content: 'original' },
          confidence_score: 72,
        }],
      });
      // UPDATE agent_decisions (set is_approved = false for re-review)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT manual_overrides
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const override = await GovernanceService.executeManualOverride(
        'decision-001',
        'user-001',
        'modify',
        'Needs content adjustments for local market',
      );

      expect(override.override_action).toBe('modify');
    });
  });

  // -----------------------------------------------------------------------
  // getGovernancePolicy / updateGovernancePolicy
  // -----------------------------------------------------------------------

  describe('getGovernancePolicy', () => {
    it('returns cached policy when available', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_GOVERNANCE_POLICY);

      const policy = await GovernanceService.getGovernancePolicy();

      expect(policy).toEqual(DEFAULT_GOVERNANCE_POLICY);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('falls back to DB when cache is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{ value: JSON.stringify(DEFAULT_GOVERNANCE_POLICY) }],
      });

      const policy = await GovernanceService.getGovernancePolicy();

      expect(policy).toEqual(DEFAULT_GOVERNANCE_POLICY);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('returns defaults when no policy exists in DB', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const policy = await GovernanceService.getGovernancePolicy();

      expect(policy.min_confidence_for_auto_approve).toBe(70);
      expect(policy.max_risk_for_auto_approve).toBe(25);
      expect(policy.approval_timeout_minutes).toBe(60);
    });
  });

  describe('updateGovernancePolicy', () => {
    it('merges partial updates with current policy', async () => {
      // getGovernancePolicy call
      mockPolicyCached();
      // UPSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const updated = await GovernanceService.updateGovernancePolicy(
        { min_confidence_for_auto_approve: 80 },
        'user-001',
      );

      expect(updated.min_confidence_for_auto_approve).toBe(80);
      expect(updated.max_risk_for_auto_approve).toBe(25); // Unchanged
      expect(updated.approval_timeout_minutes).toBe(60); // Unchanged
      expect(mockCacheDel).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.policy_updated',
          userId: 'user-001',
        }),
      );
    });

    it('rejects invalid min_confidence_for_auto_approve', async () => {
      mockPolicyCached();

      await expect(
        GovernanceService.updateGovernancePolicy(
          { min_confidence_for_auto_approve: 150 },
          'user-001',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid max_risk_for_auto_approve', async () => {
      mockPolicyCached();

      await expect(
        GovernanceService.updateGovernancePolicy(
          { max_risk_for_auto_approve: -10 },
          'user-001',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid approval_timeout_minutes', async () => {
      mockPolicyCached();

      await expect(
        GovernanceService.updateGovernancePolicy(
          { approval_timeout_minutes: 0 },
          'user-001',
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // getDecisionAuditTrail
  // -----------------------------------------------------------------------

  describe('getDecisionAuditTrail', () => {
    it('returns full audit trail for a decision', async () => {
      // Decision
      mockQuery.mockResolvedValueOnce({ rows: [DECISION_ROW] });
      // Risk assessment
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'risk-001',
          decision_id: 'decision-001',
          agent_type: 'market_intelligence',
          risk_score: 35,
          risk_level: 'medium',
          factors: JSON.stringify([]),
          requires_approval: true,
          auto_approved: false,
          assessed_at: '2026-01-15T10:01:00Z',
        }],
      });
      // Approvals
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'approval-001',
          decision_id: 'decision-001',
          agent_type: 'market_intelligence',
          risk_assessment_id: 'risk-001',
          status: 'approved',
          requested_at: '2026-01-15T10:02:00Z',
          resolved_at: '2026-01-15T10:30:00Z',
          resolved_by: 'user-001',
          reason: 'Approved after review',
        }],
      });
      // Overrides
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit logs
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'audit-001',
          user_id: null,
          action: 'governance.risk_assessed',
          resource_type: 'agent_decision',
          resource_id: 'decision-001',
          details: '{}',
          created_at: '2026-01-15T10:01:00Z',
        }],
      });

      const trail = await GovernanceService.getDecisionAuditTrail('decision-001');

      expect(trail.decision).toBeDefined();
      expect(trail.risk_assessment).toBeDefined();
      expect(trail.risk_assessment?.risk_level).toBe('medium');
      expect(trail.approvals).toHaveLength(1);
      expect(trail.approvals[0].status).toBe('approved');
      expect(trail.overrides).toHaveLength(0);
      expect(trail.audit_logs).toHaveLength(1);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.audit_trail_viewed',
        }),
      );
    });

    it('throws NotFoundError for nonexistent decision', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GovernanceService.getDecisionAuditTrail('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // getGovernanceMetrics
  // -----------------------------------------------------------------------

  describe('getGovernanceMetrics', () => {
    it('returns aggregated metrics without date filter', async () => {
      // Total decisions + avg confidence
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_decisions: '100', avg_confidence: '72.5' }],
      });
      // Risk metrics
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_risk_score: '35.2', auto_approved_count: '60', total_assessments: '100' }],
      });
      // Approval metrics
      mockQuery.mockResolvedValueOnce({
        rows: [{ manually_approved: '25', rejected: '10' }],
      });

      const metrics = await GovernanceService.getGovernanceMetrics();

      expect(metrics.total_decisions).toBe(100);
      expect(metrics.auto_approved_percent).toBe(60);
      expect(metrics.manually_approved_percent).toBe(25);
      expect(metrics.rejected_percent).toBe(10);
      expect(metrics.average_risk_score).toBe(35.2);
      expect(metrics.average_confidence).toBe(72.5);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'governance.metrics_viewed',
        }),
      );
    });

    it('applies date range filters when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_decisions: '50', avg_confidence: '68' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_risk_score: '40', auto_approved_count: '20', total_assessments: '50' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ manually_approved: '15', rejected: '5' }],
      });

      const metrics = await GovernanceService.getGovernanceMetrics({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(metrics.total_decisions).toBe(50);
      // Verify date filters were applied
      const firstCallSql = mockQuery.mock.calls[0][0] as string;
      expect(firstCallSql).toContain('ad.created_at >=');
      expect(mockQuery.mock.calls[0][1]).toContain('2026-01-01');
    });

    it('returns zero percentages when there are no decisions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_decisions: '0', avg_confidence: '0' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ avg_risk_score: '0', auto_approved_count: '0', total_assessments: '0' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ manually_approved: '0', rejected: '0' }],
      });

      const metrics = await GovernanceService.getGovernanceMetrics();

      expect(metrics.total_decisions).toBe(0);
      expect(metrics.auto_approved_percent).toBe(0);
      expect(metrics.manually_approved_percent).toBe(0);
      expect(metrics.rejected_percent).toBe(0);
      expect(metrics.average_risk_score).toBe(0);
      expect(metrics.average_confidence).toBe(0);
    });
  });
});

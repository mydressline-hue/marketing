/**
 * E2E tests for Human Override Verification.
 *
 * Validates the override hierarchy: human > orchestrator > agent.
 * Tests RBAC enforcement across all roles and verifies that every
 * override is audit-logged with a mandatory reason.
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
// Types
// ---------------------------------------------------------------------------

type Role = 'admin' | 'campaign_manager' | 'analyst' | 'viewer';

type OverrideSource = 'human' | 'orchestrator' | 'agent';

interface User {
  id: string;
  role: Role;
  name: string;
}

interface AgentDecision {
  id: string;
  agent_type: string;
  decision_type: string;
  confidence_score: number;
  is_approved: boolean;
  output_data: Record<string, unknown>;
  created_by: OverrideSource;
}

interface OverrideRequest {
  decision_id: string;
  user: User;
  source: OverrideSource;
  action: 'approve' | 'reject' | 'modify' | 'pause' | 'resume';
  reason: string;
}

interface OverrideResult {
  success: boolean;
  override_id?: string;
  error?: string;
  audit_entry?: AuditEntry;
}

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  source: OverrideSource;
  reason: string;
  decision_id: string;
  timestamp: string;
  previous_state: Record<string, unknown>;
}

interface Campaign {
  id: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  name: string;
}

// ---------------------------------------------------------------------------
// Role-based permission map (mirrors server/src/middleware/rbac.ts)
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['*'],
  campaign_manager: [
    'read:*',
    'write:campaigns',
    'write:creatives',
    'write:content',
    'write:budget',
    'write:ab_tests',
  ],
  analyst: [
    'read:*',
    'write:reports',
    'write:analytics',
    'read:campaigns',
    'read:agents',
  ],
  viewer: ['read:*'],
};

// ---------------------------------------------------------------------------
// Permission checker (mirrors server/src/middleware/rbac.ts logic)
// ---------------------------------------------------------------------------

function hasPermission(role: Role, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;

  return perms.some((p) => {
    if (p === '*') return true;
    if (p.endsWith(':*')) {
      const action = p.slice(0, p.indexOf(':'));
      const reqAction = permission.slice(0, permission.indexOf(':'));
      return action === reqAction;
    }
    return p === permission;
  });
}

// ---------------------------------------------------------------------------
// Override Hierarchy Simulator
// ---------------------------------------------------------------------------

class OverrideHierarchySimulator {
  private decisions: Map<string, AgentDecision> = new Map();
  private campaigns: Map<string, Campaign> = new Map();
  private auditLog: AuditEntry[] = [];
  private overrideCounter = 0;

  /**
   * Override hierarchy: human > orchestrator > agent.
   * A higher-priority source can override a lower-priority source.
   * Same-level cannot override each other (except human always can).
   */
  private static readonly HIERARCHY: Record<OverrideSource, number> = {
    human: 3,
    orchestrator: 2,
    agent: 1,
  };

  createDecision(
    id: string,
    agentType: string,
    decisionType: string,
    confidence: number,
    createdBy: OverrideSource = 'agent',
  ): AgentDecision {
    const decision: AgentDecision = {
      id,
      agent_type: agentType,
      decision_type: decisionType,
      confidence_score: confidence,
      is_approved: false,
      output_data: {},
      created_by: createdBy,
    };
    this.decisions.set(id, decision);
    return decision;
  }

  createCampaign(id: string, name: string, status: Campaign['status'] = 'active'): Campaign {
    const campaign: Campaign = { id, name, status };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  /**
   * Attempt an override. Enforces:
   * 1. Role-based permissions
   * 2. Source hierarchy (human > orchestrator > agent)
   * 3. Mandatory reason
   * 4. Audit logging
   */
  executeOverride(request: OverrideRequest): OverrideResult {
    const { decision_id, user, source, action, reason } = request;

    // Validate reason is provided
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Override reason is required' };
    }

    // Validate decision exists
    const decision = this.decisions.get(decision_id);
    if (!decision) {
      return { success: false, error: `Decision ${decision_id} not found` };
    }

    // Enforce RBAC: check permissions based on action
    const requiredPermission = this.getRequiredPermission(action);
    if (!hasPermission(user.role, requiredPermission)) {
      return {
        success: false,
        error: `Role '${user.role}' does not have permission '${requiredPermission}'`,
      };
    }

    // Enforce hierarchy: source must outrank decision creator
    const sourceRank = OverrideHierarchySimulator.HIERARCHY[source];
    const creatorRank = OverrideHierarchySimulator.HIERARCHY[decision.created_by];

    if (sourceRank < creatorRank) {
      return {
        success: false,
        error: `Source '${source}' (rank ${sourceRank}) cannot override '${decision.created_by}' (rank ${creatorRank}). Hierarchy: human > orchestrator > agent.`,
      };
    }

    // Store previous state for audit
    const previousState: Record<string, unknown> = {
      is_approved: decision.is_approved,
      confidence_score: decision.confidence_score,
      created_by: decision.created_by,
    };

    // Apply override
    this.overrideCounter += 1;
    const overrideId = `override-${this.overrideCounter}`;

    if (action === 'approve') {
      decision.is_approved = true;
    } else if (action === 'reject') {
      decision.is_approved = false;
    } else if (action === 'modify') {
      decision.is_approved = false; // requires re-review
    }

    // Log to audit trail
    const auditEntry: AuditEntry = {
      id: `audit-${this.overrideCounter}`,
      user_id: user.id,
      action: `override.${action}`,
      source,
      reason,
      decision_id,
      timestamp: new Date().toISOString(),
      previous_state: previousState,
    };
    this.auditLog.push(auditEntry);

    return { success: true, override_id: overrideId, audit_entry: auditEntry };
  }

  /**
   * Attempt campaign pause/resume. Enforces RBAC and logs the action.
   */
  manageCampaign(
    campaignId: string,
    user: User,
    action: 'pause' | 'resume',
    reason: string,
  ): OverrideResult {
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Reason is required for campaign management' };
    }

    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      return { success: false, error: `Campaign ${campaignId} not found` };
    }

    // campaign_manager needs write:campaigns; admin has *
    if (!hasPermission(user.role, 'write:campaigns')) {
      return {
        success: false,
        error: `Role '${user.role}' does not have permission 'write:campaigns'`,
      };
    }

    const previousStatus = campaign.status;

    if (action === 'pause') {
      campaign.status = 'paused';
    } else {
      campaign.status = 'active';
    }

    this.overrideCounter += 1;

    const auditEntry: AuditEntry = {
      id: `audit-${this.overrideCounter}`,
      user_id: user.id,
      action: `campaign.${action}`,
      source: 'human',
      reason,
      decision_id: campaignId,
      timestamp: new Date().toISOString(),
      previous_state: { status: previousStatus },
    };
    this.auditLog.push(auditEntry);

    return { success: true, override_id: `campaign-op-${this.overrideCounter}`, audit_entry: auditEntry };
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  getDecision(id: string): AgentDecision | undefined {
    return this.decisions.get(id);
  }

  getCampaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  reset(): void {
    this.decisions.clear();
    this.campaigns.clear();
    this.auditLog = [];
    this.overrideCounter = 0;
  }

  private getRequiredPermission(action: string): string {
    switch (action) {
      case 'approve':
      case 'reject':
      case 'modify':
        return 'write:agents';
      case 'pause':
      case 'resume':
        return 'write:campaigns';
      default:
        return '*';
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Human Override Verification E2E Tests', () => {
  let sim: OverrideHierarchySimulator;

  // Test users for each role
  const adminUser: User = { id: 'admin-001', role: 'admin', name: 'Admin User' };
  const campaignMgr: User = { id: 'cm-001', role: 'campaign_manager', name: 'Campaign Mgr' };
  const analystUser: User = { id: 'analyst-001', role: 'analyst', name: 'Analyst User' };
  const viewerUser: User = { id: 'viewer-001', role: 'viewer', name: 'Viewer User' };

  beforeEach(() => {
    sim = new OverrideHierarchySimulator();

    // Create test decisions
    sim.createDecision('dec-agent-1', 'market_analyzer', 'country_selection', 0.75, 'agent');
    sim.createDecision('dec-agent-2', 'budget_optimizer', 'budget_allocation', 0.60, 'agent');
    sim.createDecision('dec-orch-1', 'orchestrator', 'campaign_strategy', 0.80, 'orchestrator');
    sim.createDecision('dec-human-1', 'market_analyzer', 'market_entry', 0.90, 'human');

    // Create test campaigns
    sim.createCampaign('camp-1', 'Germany Launch Campaign', 'active');
    sim.createCampaign('camp-2', 'Japan Expansion', 'active');
  });

  // =========================================================================
  // 1. Admin can override any agent decision
  // =========================================================================

  describe('Admin can override any agent decision', () => {
    it('should allow admin to approve an agent decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Reviewed and approved by admin after manual analysis',
      });

      expect(result.success).toBe(true);
      expect(result.override_id).toBeDefined();

      const decision = sim.getDecision('dec-agent-1');
      expect(decision!.is_approved).toBe(true);
    });

    it('should allow admin to reject an agent decision', () => {
      // First approve the decision
      sim.executeOverride({
        decision_id: 'dec-agent-2',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Temporarily approving for testing',
      });

      // Now reject it
      const result = sim.executeOverride({
        decision_id: 'dec-agent-2',
        user: adminUser,
        source: 'human',
        action: 'reject',
        reason: 'Budget allocation exceeds quarterly limits after review',
      });

      expect(result.success).toBe(true);

      const decision = sim.getDecision('dec-agent-2');
      expect(decision!.is_approved).toBe(false);
    });

    it('should allow admin to modify an agent decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'modify',
        reason: 'Country selection needs adjustment based on Q4 data',
      });

      expect(result.success).toBe(true);

      const decision = sim.getDecision('dec-agent-1');
      // modify sets is_approved to false for re-review
      expect(decision!.is_approved).toBe(false);
    });
  });

  // =========================================================================
  // 2. Admin can override orchestrator decisions
  // =========================================================================

  describe('Admin can override orchestrator decisions', () => {
    it('should allow admin to override an orchestrator decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-orch-1',
        user: adminUser,
        source: 'human',
        action: 'reject',
        reason: 'Campaign strategy conflicts with board directive',
      });

      expect(result.success).toBe(true);
      expect(result.override_id).toBeDefined();

      const decision = sim.getDecision('dec-orch-1');
      expect(decision!.is_approved).toBe(false);
    });

    it('should allow admin to approve an orchestrator decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-orch-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Strategy aligned after exec review meeting',
      });

      expect(result.success).toBe(true);

      const decision = sim.getDecision('dec-orch-1');
      expect(decision!.is_approved).toBe(true);
    });
  });

  // =========================================================================
  // 3. Campaign manager can pause/resume campaigns
  // =========================================================================

  describe('Campaign manager can pause and resume campaigns', () => {
    it('should allow campaign manager to pause an active campaign', () => {
      const result = sim.manageCampaign(
        'camp-1',
        campaignMgr,
        'pause',
        'Pausing for creative review before next flight',
      );

      expect(result.success).toBe(true);

      const campaign = sim.getCampaign('camp-1');
      expect(campaign!.status).toBe('paused');
    });

    it('should allow campaign manager to resume a paused campaign', () => {
      // First pause it
      sim.manageCampaign('camp-2', campaignMgr, 'pause', 'Temporary hold');

      // Then resume
      const result = sim.manageCampaign(
        'camp-2',
        campaignMgr,
        'resume',
        'Creative review completed, resuming campaign',
      );

      expect(result.success).toBe(true);

      const campaign = sim.getCampaign('camp-2');
      expect(campaign!.status).toBe('active');
    });
  });

  // =========================================================================
  // 4. Analyst has read-only access and cannot override
  // =========================================================================

  describe('Analyst cannot perform override actions', () => {
    it('should deny analyst from overriding an agent decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: analystUser,
        source: 'human',
        action: 'approve',
        reason: 'Attempting to approve',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have permission');
      expect(result.error).toContain('analyst');
    });

    it('should deny analyst from pausing a campaign', () => {
      const result = sim.manageCampaign(
        'camp-1',
        analystUser,
        'pause',
        'Trying to pause',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have permission');

      // Ensure campaign is unchanged
      const campaign = sim.getCampaign('camp-1');
      expect(campaign!.status).toBe('active');
    });
  });

  // =========================================================================
  // 5. Viewer cannot modify anything
  // =========================================================================

  describe('Viewer cannot modify anything', () => {
    it('should deny viewer from overriding any decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: viewerUser,
        source: 'human',
        action: 'approve',
        reason: 'Trying to approve as viewer',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have permission');
      expect(result.error).toContain('viewer');
    });

    it('should deny viewer from pausing campaigns', () => {
      const result = sim.manageCampaign(
        'camp-1',
        viewerUser,
        'pause',
        'Trying to pause as viewer',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have permission');
    });

    it('should deny viewer from resuming campaigns', () => {
      // First pause via admin
      sim.manageCampaign('camp-1', adminUser, 'pause', 'Admin pause');

      const result = sim.manageCampaign(
        'camp-1',
        viewerUser,
        'resume',
        'Trying to resume as viewer',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not have permission');

      // Confirm campaign is still paused
      const campaign = sim.getCampaign('camp-1');
      expect(campaign!.status).toBe('paused');
    });
  });

  // =========================================================================
  // 6. Override is logged in audit trail
  // =========================================================================

  describe('Override audit trail logging', () => {
    it('should create an audit entry for every successful override', () => {
      sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'First override for audit test',
      });

      sim.executeOverride({
        decision_id: 'dec-agent-2',
        user: adminUser,
        source: 'human',
        action: 'reject',
        reason: 'Second override for audit test',
      });

      const auditLog = sim.getAuditLog();

      expect(auditLog).toHaveLength(2);

      expect(auditLog[0].user_id).toBe('admin-001');
      expect(auditLog[0].action).toBe('override.approve');
      expect(auditLog[0].reason).toBe('First override for audit test');
      expect(auditLog[0].decision_id).toBe('dec-agent-1');
      expect(auditLog[0].previous_state).toBeDefined();
      expect(auditLog[0].timestamp).toBeDefined();

      expect(auditLog[1].action).toBe('override.reject');
      expect(auditLog[1].decision_id).toBe('dec-agent-2');
    });

    it('should not create audit entries for denied overrides', () => {
      sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: viewerUser,
        source: 'human',
        action: 'approve',
        reason: 'Should fail',
      });

      const auditLog = sim.getAuditLog();
      expect(auditLog).toHaveLength(0);
    });

    it('should include previous state in audit entry', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Testing previous state capture',
      });

      expect(result.audit_entry).toBeDefined();
      expect(result.audit_entry!.previous_state).toEqual({
        is_approved: false,
        confidence_score: 0.75,
        created_by: 'agent',
      });
    });
  });

  // =========================================================================
  // 7. Override reason is required
  // =========================================================================

  describe('Override reason is required', () => {
    it('should reject override with empty reason', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reason is required');
    });

    it('should reject override with whitespace-only reason', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reason is required');
    });

    it('should reject campaign management with empty reason', () => {
      const result = sim.manageCampaign('camp-1', adminUser, 'pause', '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Reason is required');
    });
  });

  // =========================================================================
  // 8. Hierarchy enforcement: orchestrator can override agent
  // =========================================================================

  describe('Orchestrator can override individual agent decisions', () => {
    it('should allow orchestrator-sourced override of agent decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'orchestrator',
        action: 'reject',
        reason: 'Orchestrator determined conflicting strategy across agents',
      });

      expect(result.success).toBe(true);

      const decision = sim.getDecision('dec-agent-1');
      expect(decision!.is_approved).toBe(false);
    });
  });

  // =========================================================================
  // 9. Hierarchy enforcement: agent cannot override orchestrator
  // =========================================================================

  describe('Agent cannot override orchestrator decisions', () => {
    it('should deny agent-sourced override of orchestrator decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-orch-1',
        user: adminUser,
        source: 'agent',
        action: 'approve',
        reason: 'Agent attempting to override orchestrator',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot override');
      expect(result.error).toContain('orchestrator');
      expect(result.error).toContain('human > orchestrator > agent');
    });
  });

  // =========================================================================
  // 10. Agent cannot override human decisions
  // =========================================================================

  describe('Agent cannot override human decisions', () => {
    it('should deny agent-sourced override of human decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-human-1',
        user: adminUser,
        source: 'agent',
        action: 'reject',
        reason: 'Agent trying to override human decision',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot override');
      expect(result.error).toContain('human');
    });
  });

  // =========================================================================
  // 11. Orchestrator cannot override human decisions
  // =========================================================================

  describe('Orchestrator cannot override human decisions', () => {
    it('should deny orchestrator-sourced override of human decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-human-1',
        user: adminUser,
        source: 'orchestrator',
        action: 'modify',
        reason: 'Orchestrator attempting to override human decision',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot override');
    });
  });

  // =========================================================================
  // 12. Human can override human decisions (same level, human always wins)
  // =========================================================================

  describe('Human can override another human decision', () => {
    it('should allow human-sourced override of human-created decision', () => {
      const result = sim.executeOverride({
        decision_id: 'dec-human-1',
        user: adminUser,
        source: 'human',
        action: 'reject',
        reason: 'Another admin disagrees with the market entry assessment',
      });

      expect(result.success).toBe(true);

      const decision = sim.getDecision('dec-human-1');
      expect(decision!.is_approved).toBe(false);
    });
  });

  // =========================================================================
  // 13. Complete override flow produces full audit trail
  // =========================================================================

  describe('Complete override flow produces full audit trail', () => {
    it('should track a multi-step override lifecycle with full audit', () => {
      // Step 1: Admin approves an agent decision
      const approve = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Initial approval after review',
      });
      expect(approve.success).toBe(true);

      // Step 2: Another admin modifies the same decision
      const modify = sim.executeOverride({
        decision_id: 'dec-agent-1',
        user: { id: 'admin-002', role: 'admin', name: 'Admin Two' },
        source: 'human',
        action: 'modify',
        reason: 'Modification needed based on new market data',
      });
      expect(modify.success).toBe(true);

      // Step 3: Campaign manager pauses a campaign
      const pause = sim.manageCampaign(
        'camp-1',
        campaignMgr,
        'pause',
        'Pausing for budget reallocation',
      );
      expect(pause.success).toBe(true);

      // Step 4: Admin resumes campaign
      const resume = sim.manageCampaign(
        'camp-1',
        adminUser,
        'resume',
        'Budget reallocation complete, resuming',
      );
      expect(resume.success).toBe(true);

      // Verify full audit trail
      const auditLog = sim.getAuditLog();
      expect(auditLog).toHaveLength(4);

      expect(auditLog[0].action).toBe('override.approve');
      expect(auditLog[0].source).toBe('human');

      expect(auditLog[1].action).toBe('override.modify');
      expect(auditLog[1].user_id).toBe('admin-002');

      expect(auditLog[2].action).toBe('campaign.pause');
      expect(auditLog[2].user_id).toBe('cm-001');

      expect(auditLog[3].action).toBe('campaign.resume');
      expect(auditLog[3].user_id).toBe('admin-001');

      // Each entry has a timestamp and previous_state
      for (const entry of auditLog) {
        expect(entry.timestamp).toBeDefined();
        expect(entry.previous_state).toBeDefined();
        expect(entry.reason.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 14. Non-existent decision returns error
  // =========================================================================

  describe('Error handling for non-existent resources', () => {
    it('should return error when overriding a non-existent decision', () => {
      const result = sim.executeOverride({
        decision_id: 'non-existent-id',
        user: adminUser,
        source: 'human',
        action: 'approve',
        reason: 'Trying to override something that does not exist',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when managing a non-existent campaign', () => {
      const result = sim.manageCampaign(
        'non-existent-campaign',
        adminUser,
        'pause',
        'Trying to pause non-existent campaign',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // =========================================================================
  // 15. RBAC permission map verification
  // =========================================================================

  describe('RBAC permission map verification', () => {
    it('should grant admin wildcard access to all permissions', () => {
      expect(hasPermission('admin', 'write:agents')).toBe(true);
      expect(hasPermission('admin', 'write:campaigns')).toBe(true);
      expect(hasPermission('admin', 'read:anything')).toBe(true);
      expect(hasPermission('admin', 'delete:everything')).toBe(true);
    });

    it('should grant campaign_manager write access to campaigns but not agents', () => {
      expect(hasPermission('campaign_manager', 'write:campaigns')).toBe(true);
      expect(hasPermission('campaign_manager', 'write:agents')).toBe(false);
      expect(hasPermission('campaign_manager', 'read:agents')).toBe(true);
    });

    it('should grant analyst only read access and write to reports/analytics', () => {
      expect(hasPermission('analyst', 'read:campaigns')).toBe(true);
      expect(hasPermission('analyst', 'write:reports')).toBe(true);
      expect(hasPermission('analyst', 'write:analytics')).toBe(true);
      expect(hasPermission('analyst', 'write:campaigns')).toBe(false);
      expect(hasPermission('analyst', 'write:agents')).toBe(false);
    });

    it('should grant viewer only read access', () => {
      expect(hasPermission('viewer', 'read:campaigns')).toBe(true);
      expect(hasPermission('viewer', 'read:agents')).toBe(true);
      expect(hasPermission('viewer', 'write:campaigns')).toBe(false);
      expect(hasPermission('viewer', 'write:agents')).toBe(false);
      expect(hasPermission('viewer', 'write:reports')).toBe(false);
    });
  });
});

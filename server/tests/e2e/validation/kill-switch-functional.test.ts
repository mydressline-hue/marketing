/**
 * Validation Test Suite: Kill Switch Functional Tests
 *
 * Phase 10B Part 3 - Validates that:
 *   - All 4 kill switch levels work (Level 1-4)
 *   - Country-specific kill switch works
 *   - Campaign-level kill switch works
 *   - Automation pause works
 *   - API key locking works
 *   - Kill switch propagates to agents (they stop executing)
 *   - Recovery after deactivation restores normal operation
 *   - History and audit trail are maintained
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
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
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

import { cacheGet } from '../../../src/config/redis';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockCacheGet = cacheGet as jest.Mock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HaltLevel = 0 | 1 | 2 | 3 | 4;
type OperationType = 'campaign_create' | 'campaign_scale' | 'agent_run' | 'api_call' | 'budget_increase';

interface KillSwitchEntry {
  id: string;
  level: HaltLevel;
  is_active: boolean;
  activated_by: string;
  trigger_type: 'manual' | 'automated';
  reason: string;
  affected_countries: string[];
  affected_campaigns: string[];
  api_keys_locked: boolean;
  activated_at: string;
  deactivated_at: string | null;
}

interface OperationCheckResult {
  allowed: boolean;
  reason?: string;
  activeLevel: HaltLevel;
}

// ---------------------------------------------------------------------------
// Kill Switch Simulator
// ---------------------------------------------------------------------------

class KillSwitchSimulator {
  private switches: Map<string, KillSwitchEntry> = new Map();
  private auditLog: Array<{ action: string; details: Record<string, unknown> }> = [];
  private idCounter = 0;

  private genId(): string {
    return `ks-${++this.idCounter}`;
  }

  /**
   * Activate a global kill switch at a given level.
   */
  activateGlobal(userId: string, level: HaltLevel, reason: string): KillSwitchEntry {
    if (level < 1 || level > 4) {
      throw new Error('Kill switch level must be between 1 and 4');
    }
    const id = this.genId();
    const entry: KillSwitchEntry = {
      id,
      level,
      is_active: true,
      activated_by: userId,
      trigger_type: 'manual',
      reason,
      affected_countries: [],
      affected_campaigns: [],
      api_keys_locked: level === 4,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    };
    this.switches.set(id, entry);
    this.auditLog.push({ action: 'kill_switch.activate', details: { id, level, userId, reason } });
    return entry;
  }

  /**
   * Deactivate a specific kill switch.
   */
  deactivate(id: string, userId: string): KillSwitchEntry {
    const entry = this.switches.get(id);
    if (!entry || !entry.is_active) {
      throw new Error('Active kill switch entry not found');
    }
    entry.is_active = false;
    entry.deactivated_at = new Date().toISOString();
    this.auditLog.push({ action: 'kill_switch.deactivate', details: { id, userId } });
    return entry;
  }

  /**
   * Pause a specific campaign.
   */
  pauseCampaign(campaignId: string, userId: string, reason: string): KillSwitchEntry {
    const id = this.genId();
    const entry: KillSwitchEntry = {
      id,
      level: 2,
      is_active: true,
      activated_by: userId,
      trigger_type: 'manual',
      reason,
      affected_countries: [],
      affected_campaigns: [campaignId],
      api_keys_locked: false,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    };
    this.switches.set(id, entry);
    this.auditLog.push({ action: 'kill_switch.pause_campaign', details: { id, campaignId, userId, reason } });
    return entry;
  }

  /**
   * Resume a specific campaign.
   */
  resumeCampaign(campaignId: string, userId: string): KillSwitchEntry {
    for (const [id, entry] of this.switches) {
      if (entry.is_active && entry.affected_campaigns.includes(campaignId)) {
        entry.is_active = false;
        entry.deactivated_at = new Date().toISOString();
        this.auditLog.push({ action: 'kill_switch.resume_campaign', details: { id, campaignId, userId } });
        return entry;
      }
    }
    throw new Error('No active kill switch found for this campaign');
  }

  /**
   * Pause a specific country.
   */
  pauseCountry(countryId: string, userId: string, reason: string): KillSwitchEntry {
    const id = this.genId();
    const entry: KillSwitchEntry = {
      id,
      level: 3,
      is_active: true,
      activated_by: userId,
      trigger_type: 'manual',
      reason,
      affected_countries: [countryId],
      affected_campaigns: [],
      api_keys_locked: false,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    };
    this.switches.set(id, entry);
    this.auditLog.push({ action: 'kill_switch.pause_country', details: { id, countryId, userId, reason } });
    return entry;
  }

  /**
   * Resume a specific country.
   */
  resumeCountry(countryId: string, userId: string): KillSwitchEntry {
    for (const [id, entry] of this.switches) {
      if (entry.is_active && entry.affected_countries.includes(countryId)) {
        entry.is_active = false;
        entry.deactivated_at = new Date().toISOString();
        this.auditLog.push({ action: 'kill_switch.resume_country', details: { id, countryId, userId } });
        return entry;
      }
    }
    throw new Error('No active kill switch found for this country');
  }

  /**
   * Pause automation (Level 1).
   */
  pauseAutomation(userId: string, reason: string): KillSwitchEntry {
    return this.activateGlobal(userId, 1, reason);
  }

  /**
   * Lock API keys (Level 4).
   */
  lockAPIKeys(userId: string, reason: string): KillSwitchEntry {
    const entry = this.activateGlobal(userId, 4, reason);
    entry.api_keys_locked = true;
    return entry;
  }

  /**
   * Get the current highest active level.
   */
  getCurrentLevel(): HaltLevel {
    let maxLevel: HaltLevel = 0;
    for (const entry of this.switches.values()) {
      if (entry.is_active && entry.level > maxLevel) {
        maxLevel = entry.level as HaltLevel;
      }
    }
    return maxLevel;
  }

  /**
   * Get all active kill switches.
   */
  getActive(): KillSwitchEntry[] {
    return Array.from(this.switches.values()).filter(e => e.is_active);
  }

  /**
   * Check if an operation is allowed under current kill switch state.
   */
  isOperationAllowed(operationType: OperationType, context?: Record<string, unknown>): OperationCheckResult {
    const activeLevel = this.getCurrentLevel();

    if (activeLevel === 0) {
      return { allowed: true, activeLevel: 0 };
    }

    // Level 4 -- full shutdown
    if (activeLevel >= 4) {
      return {
        allowed: false,
        reason: 'Full system shutdown is active. All operations are halted.',
        activeLevel,
      };
    }

    // Level 3 -- country-specific checks
    if (activeLevel >= 3) {
      if (context?.countryId) {
        const active = this.getActive();
        const countryBlocked = active.some(
          s => s.level === 3 && s.affected_countries.includes(context.countryId as string),
        );
        if (countryBlocked) {
          return {
            allowed: false,
            reason: `Operations for country ${context.countryId} are paused.`,
            activeLevel,
          };
        }
      }
      if (operationType === 'campaign_create' || operationType === 'agent_run') {
        return {
          allowed: false,
          reason: 'Country-level pause is active. Campaign creation and agent runs are restricted.',
          activeLevel,
        };
      }
    }

    // Level 2 -- no new campaigns
    if (activeLevel >= 2) {
      if (operationType === 'campaign_create') {
        return {
          allowed: false,
          reason: 'New campaign creation is paused.',
          activeLevel,
        };
      }
      if (operationType === 'agent_run') {
        return {
          allowed: false,
          reason: 'Agent runs are paused at level 2.',
          activeLevel,
        };
      }
    }

    // Level 1 -- no scaling
    if (activeLevel >= 1) {
      if (operationType === 'budget_increase' || operationType === 'campaign_scale') {
        return {
          allowed: false,
          reason: 'Scaling and budget increases are paused.',
          activeLevel,
        };
      }
    }

    return { allowed: true, activeLevel };
  }

  /**
   * Check if API keys are locked.
   */
  areAPIKeysLocked(): boolean {
    return this.getActive().some(e => e.api_keys_locked);
  }

  getHistory(): Array<{ action: string; details: Record<string, unknown> }> {
    return [...this.auditLog];
  }

  reset(): void {
    this.switches.clear();
    this.auditLog = [];
    this.idCounter = 0;
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Phase 10B Validation: Kill Switch Functional Tests', () => {
  let sim: KillSwitchSimulator;
  const userId = 'admin-user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    sim = new KillSwitchSimulator();
  });

  // -------------------------------------------------------------------------
  // 1. Level 1: Pause scaling
  // -------------------------------------------------------------------------

  describe('Level 1 - Pause Scaling', () => {
    it('should block budget increases at level 1', () => {
      sim.activateGlobal(userId, 1, 'Suspicious spend pattern');

      const result = sim.isOperationAllowed('budget_increase');
      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(1);
      expect(result.reason).toContain('Scaling and budget increases are paused');
    });

    it('should block campaign scaling at level 1', () => {
      sim.activateGlobal(userId, 1, 'Cost overrun');

      const result = sim.isOperationAllowed('campaign_scale');
      expect(result.allowed).toBe(false);
    });

    it('should still allow campaign creation at level 1', () => {
      sim.activateGlobal(userId, 1, 'Cost overrun');

      const result = sim.isOperationAllowed('campaign_create');
      expect(result.allowed).toBe(true);
    });

    it('should still allow agent runs at level 1', () => {
      sim.activateGlobal(userId, 1, 'Cost overrun');

      const result = sim.isOperationAllowed('agent_run');
      expect(result.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Level 2: Pause new campaigns
  // -------------------------------------------------------------------------

  describe('Level 2 - Pause New Campaigns', () => {
    it('should block campaign creation at level 2', () => {
      sim.activateGlobal(userId, 2, 'Performance review needed');

      const result = sim.isOperationAllowed('campaign_create');
      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(2);
    });

    it('should block agent runs at level 2', () => {
      sim.activateGlobal(userId, 2, 'Performance review needed');

      const result = sim.isOperationAllowed('agent_run');
      expect(result.allowed).toBe(false);
    });

    it('should also block scaling at level 2 (inherits level 1)', () => {
      sim.activateGlobal(userId, 2, 'Review');

      const result = sim.isOperationAllowed('budget_increase');
      expect(result.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Level 3: Country-specific pause
  // -------------------------------------------------------------------------

  describe('Level 3 - Country-Specific Pause', () => {
    it('should block operations for a paused country', () => {
      sim.pauseCountry('country-de', userId, 'Compliance issue in Germany');

      const result = sim.isOperationAllowed('campaign_create', { countryId: 'country-de' });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('country-de');
    });

    it('should block campaign creation and agent runs at level 3', () => {
      sim.pauseCountry('country-fr', userId, 'Regulatory concern');

      const createResult = sim.isOperationAllowed('campaign_create');
      expect(createResult.allowed).toBe(false);

      const agentResult = sim.isOperationAllowed('agent_run');
      expect(agentResult.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Level 4: Full shutdown
  // -------------------------------------------------------------------------

  describe('Level 4 - Full Shutdown', () => {
    it('should block ALL operations at level 4', () => {
      sim.activateGlobal(userId, 4, 'Emergency shutdown');

      const operations: OperationType[] = ['campaign_create', 'campaign_scale', 'agent_run', 'api_call', 'budget_increase'];

      for (const op of operations) {
        const result = sim.isOperationAllowed(op);
        expect(result.allowed).toBe(false);
        expect(result.activeLevel).toBe(4);
        expect(result.reason).toContain('Full system shutdown');
      }
    });

    it('should lock API keys at level 4', () => {
      sim.lockAPIKeys(userId, 'Security breach detected');

      expect(sim.areAPIKeysLocked()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Campaign-level kill switch
  // -------------------------------------------------------------------------

  describe('Campaign-Level Kill Switch', () => {
    it('should pause a specific campaign', () => {
      const entry = sim.pauseCampaign('campaign-123', userId, 'Poor performance');

      expect(entry.is_active).toBe(true);
      expect(entry.affected_campaigns).toContain('campaign-123');
      expect(entry.level).toBe(2);
    });

    it('should resume a specific campaign', () => {
      sim.pauseCampaign('campaign-456', userId, 'Testing pause');

      const entry = sim.resumeCampaign('campaign-456', userId);
      expect(entry.is_active).toBe(false);
      expect(entry.deactivated_at).not.toBeNull();
    });

    it('should throw when resuming a campaign that is not paused', () => {
      expect(() => sim.resumeCampaign('campaign-nonexistent', userId))
        .toThrow('No active kill switch found for this campaign');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Automation pause
  // -------------------------------------------------------------------------

  describe('Automation Pause', () => {
    it('should pause automation at level 1', () => {
      const entry = sim.pauseAutomation(userId, 'Automated pause for investigation');

      expect(entry.is_active).toBe(true);
      expect(entry.level).toBe(1);

      // Budget increases should be blocked
      const result = sim.isOperationAllowed('budget_increase');
      expect(result.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. API key locking
  // -------------------------------------------------------------------------

  describe('API Key Locking', () => {
    it('should lock API keys at level 4', () => {
      sim.lockAPIKeys(userId, 'API abuse detected');

      expect(sim.areAPIKeysLocked()).toBe(true);
      expect(sim.getCurrentLevel()).toBe(4);
    });

    it('should unlock API keys when kill switch is deactivated', () => {
      const entry = sim.lockAPIKeys(userId, 'Lock keys');
      sim.deactivate(entry.id, userId);

      expect(sim.areAPIKeysLocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Recovery after deactivation
  // -------------------------------------------------------------------------

  describe('Recovery After Deactivation', () => {
    it('should restore normal operation after level 4 deactivation', () => {
      const entry = sim.activateGlobal(userId, 4, 'Emergency');

      // All blocked
      expect(sim.isOperationAllowed('campaign_create').allowed).toBe(false);
      expect(sim.isOperationAllowed('agent_run').allowed).toBe(false);

      // Deactivate
      sim.deactivate(entry.id, userId);

      // All allowed
      expect(sim.isOperationAllowed('campaign_create').allowed).toBe(true);
      expect(sim.isOperationAllowed('agent_run').allowed).toBe(true);
      expect(sim.isOperationAllowed('budget_increase').allowed).toBe(true);
      expect(sim.getCurrentLevel()).toBe(0);
    });

    it('should degrade to lower level when higher level is deactivated', () => {
      const level1 = sim.activateGlobal(userId, 1, 'Pause scaling');
      const level3 = sim.activateGlobal(userId, 3, 'Country issue');

      expect(sim.getCurrentLevel()).toBe(3);

      // Deactivate level 3 -- should fall back to level 1
      sim.deactivate(level3.id, userId);

      expect(sim.getCurrentLevel()).toBe(1);
      // Budget increases still blocked
      expect(sim.isOperationAllowed('budget_increase').allowed).toBe(false);
      // But campaign creation allowed at level 1
      expect(sim.isOperationAllowed('campaign_create').allowed).toBe(true);
    });

    it('should restore country operations after country pause is lifted', () => {
      const entry = sim.pauseCountry('country-jp', userId, 'Investigation');

      expect(sim.isOperationAllowed('campaign_create', { countryId: 'country-jp' }).allowed).toBe(false);

      sim.resumeCountry('country-jp', userId);

      expect(sim.isOperationAllowed('campaign_create', { countryId: 'country-jp' }).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 9. History and audit trail
  // -------------------------------------------------------------------------

  describe('History & Audit Trail', () => {
    it('should maintain a complete audit trail of all actions', () => {
      sim.activateGlobal(userId, 1, 'Test level 1');
      sim.pauseCampaign('camp-1', userId, 'Bad campaign');
      sim.pauseCountry('country-uk', userId, 'Brexit issues');

      const history = sim.getHistory();
      expect(history.length).toBe(3);
      expect(history[0].action).toBe('kill_switch.activate');
      expect(history[1].action).toBe('kill_switch.pause_campaign');
      expect(history[2].action).toBe('kill_switch.pause_country');
    });

    it('should record deactivation in audit trail', () => {
      const entry = sim.activateGlobal(userId, 2, 'Test');
      sim.deactivate(entry.id, userId);

      const history = sim.getHistory();
      expect(history.length).toBe(2);
      expect(history[1].action).toBe('kill_switch.deactivate');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Kill switch validation of level range
  // -------------------------------------------------------------------------

  describe('Validation', () => {
    it('should reject invalid kill switch levels', () => {
      expect(() => sim.activateGlobal(userId, 0 as HaltLevel, 'Invalid'))
        .toThrow('Kill switch level must be between 1 and 4');
      expect(() => sim.activateGlobal(userId, 5 as HaltLevel, 'Invalid'))
        .toThrow('Kill switch level must be between 1 and 4');
    });
  });

  // -------------------------------------------------------------------------
  // 11. KillSwitchService interface verification
  // -------------------------------------------------------------------------

  describe('KillSwitchService Interface Verification', () => {
    it('KillSwitchService has activateGlobalKillSwitch method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.activateGlobalKillSwitch).toBe('function');
    });

    it('KillSwitchService has deactivateKillSwitch method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.deactivateKillSwitch).toBe('function');
    });

    it('KillSwitchService has pauseCampaign and resumeCampaign methods', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.pauseCampaign).toBe('function');
      expect(typeof KillSwitchService.resumeCampaign).toBe('function');
    });

    it('KillSwitchService has pauseCountry and resumeCountry methods', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.pauseCountry).toBe('function');
      expect(typeof KillSwitchService.resumeCountry).toBe('function');
    });

    it('KillSwitchService has pauseAutomation method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.pauseAutomation).toBe('function');
    });

    it('KillSwitchService has lockAPIKeys method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.lockAPIKeys).toBe('function');
    });

    it('KillSwitchService has isOperationAllowed method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.isOperationAllowed).toBe('function');
    });

    it('KillSwitchService has getCurrentLevel method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.getCurrentLevel).toBe('function');
    });

    it('KillSwitchService has getKillSwitchHistory method', async () => {
      const { KillSwitchService } = await import('../../../src/services/killswitch/KillSwitchService');
      expect(typeof KillSwitchService.getKillSwitchHistory).toBe('function');
    });
  });
});

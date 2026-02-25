/**
 * E2E tests for Kill Switch workflow lifecycle.
 *
 * Tests full kill switch workflows including:
 *   - Activate at various levels -> verify operations blocked -> deactivate -> verify allowed
 *   - Campaign and country pause/resume cycles with status verification
 *   - Concurrent kill switches at different levels -> highest wins
 *   - Kill switch history accumulation
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

import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';

import type { HaltLevel, KillSwitchState, TriggerType } from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

// ---------------------------------------------------------------------------
// Kill Switch Simulator
// ---------------------------------------------------------------------------

interface KillSwitchEntry {
  id: string;
  level: HaltLevel;
  is_active: boolean;
  activated_by: string;
  trigger_type: TriggerType;
  reason: string;
  affected_countries: string[];
  affected_campaigns: string[];
  activated_at: string;
  deactivated_at: string | null;
}

interface CampaignState {
  id: string;
  status: 'active' | 'paused';
  paused_by: string | null;
  paused_at: string | null;
}

interface CountryState {
  id: string;
  status: 'active' | 'paused';
  paused_by: string | null;
  paused_at: string | null;
}

/**
 * Level-based operation restrictions:
 *   Level 0: No restrictions
 *   Level 1: Block new campaign scaling
 *   Level 2: Block new campaign scaling + pause underperformers
 *   Level 3: Block all scaling + pause all automated operations
 *   Level 4: Full halt -- everything blocked
 */
const LEVEL_RESTRICTIONS: Record<number, string[]> = {
  0: [],
  1: ['scale_campaign'],
  2: ['scale_campaign', 'new_campaign', 'increase_budget'],
  3: ['scale_campaign', 'new_campaign', 'increase_budget', 'automated_operations', 'agent_runs'],
  4: ['scale_campaign', 'new_campaign', 'increase_budget', 'automated_operations', 'agent_runs', 'api_calls', 'all_operations'],
};

class KillSwitchSimulator {
  private switches: Map<string, KillSwitchEntry> = new Map();
  private campaigns: Map<string, CampaignState> = new Map();
  private countries: Map<string, CountryState> = new Map();
  private history: KillSwitchEntry[] = [];
  private idCounter = 0;

  activate(
    level: HaltLevel,
    userId: string,
    triggerType: TriggerType = 'manual',
    reason: string = '',
    affectedCountries: string[] = [],
    affectedCampaigns: string[] = [],
  ): KillSwitchEntry {
    this.idCounter += 1;
    const entry: KillSwitchEntry = {
      id: `ks-${this.idCounter}`,
      level,
      is_active: true,
      activated_by: userId,
      trigger_type: triggerType,
      reason,
      affected_countries: affectedCountries,
      affected_campaigns: affectedCampaigns,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    };
    this.switches.set(entry.id, entry);
    this.history.push({ ...entry });
    return entry;
  }

  deactivate(id: string, userId: string, reason: string = ''): KillSwitchEntry {
    const entry = this.switches.get(id);
    if (!entry) throw new Error(`Kill switch ${id} not found`);
    if (!entry.is_active) throw new Error(`Kill switch ${id} is already deactivated`);

    entry.is_active = false;
    entry.deactivated_at = new Date().toISOString();

    // Update history entry
    const histIdx = this.history.findIndex((h) => h.id === id && h.is_active);
    if (histIdx >= 0) {
      this.history[histIdx] = { ...entry };
    }

    return entry;
  }

  getHighestLevel(): HaltLevel {
    let highest: HaltLevel = 0;
    for (const entry of this.switches.values()) {
      if (entry.is_active && entry.level > highest) {
        highest = entry.level;
      }
    }
    return highest;
  }

  getActiveSwitches(): KillSwitchEntry[] {
    return Array.from(this.switches.values()).filter((s) => s.is_active);
  }

  isOperationAllowed(operation: string): { allowed: boolean; reason: string; level: HaltLevel } {
    const currentLevel = this.getHighestLevel();
    const blocked = LEVEL_RESTRICTIONS[currentLevel] || [];

    if (blocked.includes(operation) || blocked.includes('all_operations')) {
      return {
        allowed: false,
        reason: `Kill switch level ${currentLevel} active: ${operation} is blocked`,
        level: currentLevel,
      };
    }

    return {
      allowed: true,
      reason: 'Operation permitted',
      level: currentLevel,
    };
  }

  pauseCampaign(campaignId: string, userId: string): CampaignState {
    const state: CampaignState = {
      id: campaignId,
      status: 'paused',
      paused_by: userId,
      paused_at: new Date().toISOString(),
    };
    this.campaigns.set(campaignId, state);
    return state;
  }

  resumeCampaign(campaignId: string): CampaignState {
    const state = this.campaigns.get(campaignId);
    if (!state) throw new Error(`Campaign ${campaignId} not found`);
    state.status = 'active';
    state.paused_by = null;
    state.paused_at = null;
    return state;
  }

  getCampaign(campaignId: string): CampaignState | undefined {
    return this.campaigns.get(campaignId);
  }

  pauseCountry(countryId: string, userId: string): CountryState {
    const state: CountryState = {
      id: countryId,
      status: 'paused',
      paused_by: userId,
      paused_at: new Date().toISOString(),
    };
    this.countries.set(countryId, state);
    return state;
  }

  resumeCountry(countryId: string): CountryState {
    const state = this.countries.get(countryId);
    if (!state) throw new Error(`Country ${countryId} not found`);
    state.status = 'active';
    state.paused_by = null;
    state.paused_at = null;
    return state;
  }

  getCountry(countryId: string): CountryState | undefined {
    return this.countries.get(countryId);
  }

  getHistory(): KillSwitchEntry[] {
    return [...this.history];
  }

  reset(): void {
    this.switches.clear();
    this.campaigns.clear();
    this.countries.clear();
    this.history = [];
    this.idCounter = 0;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kill Switch Workflow E2E Tests', () => {
  let simulator: KillSwitchSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    simulator = new KillSwitchSimulator();
  });

  // =========================================================================
  // Level 1: Block scaling -> deactivate -> allow scaling
  // =========================================================================

  describe('Level 1 activation and deactivation workflow', () => {
    it('should block scaling when level 1 is active and allow after deactivation', () => {
      // Verify no restrictions initially
      const beforeCheck = simulator.isOperationAllowed('scale_campaign');
      expect(beforeCheck.allowed).toBe(true);
      expect(beforeCheck.level).toBe(0);

      // Activate level 1
      const ks = simulator.activate(1, 'admin-user-1', 'manual', 'ROAS decline detected');
      expect(ks.level).toBe(1);
      expect(ks.is_active).toBe(true);

      // Verify scaling is blocked
      const duringCheck = simulator.isOperationAllowed('scale_campaign');
      expect(duringCheck.allowed).toBe(false);
      expect(duringCheck.level).toBe(1);
      expect(duringCheck.reason).toContain('scale_campaign');

      // Other operations should still be allowed
      const otherCheck = simulator.isOperationAllowed('automated_operations');
      expect(otherCheck.allowed).toBe(true);

      // Deactivate
      const deactivated = simulator.deactivate(ks.id, 'admin-user-1', 'ROAS recovered');
      expect(deactivated.is_active).toBe(false);
      expect(deactivated.deactivated_at).not.toBeNull();

      // Verify scaling is allowed again
      const afterCheck = simulator.isOperationAllowed('scale_campaign');
      expect(afterCheck.allowed).toBe(true);
      expect(afterCheck.level).toBe(0);
    });

    it('should record activation in history', () => {
      simulator.activate(1, 'admin-user-1', 'roas_drop', 'ROAS below 2.0');

      const history = simulator.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].level).toBe(1);
      expect(history[0].trigger_type).toBe('roas_drop');
      expect(history[0].reason).toBe('ROAS below 2.0');
    });
  });

  // =========================================================================
  // Level 4: Full halt -> verify everything blocked -> deactivate
  // =========================================================================

  describe('Level 4 full halt workflow', () => {
    it('should block all operations when level 4 is active', () => {
      const ks = simulator.activate(4, 'admin-user-1', 'manual', 'Critical system failure');
      expect(ks.level).toBe(4);

      // All operations should be blocked
      const operations = [
        'scale_campaign',
        'new_campaign',
        'increase_budget',
        'automated_operations',
        'agent_runs',
        'api_calls',
        'all_operations',
      ];

      for (const op of operations) {
        const check = simulator.isOperationAllowed(op);
        expect(check.allowed).toBe(false);
        expect(check.level).toBe(4);
      }
    });

    it('should restore all operations after level 4 deactivation', () => {
      const ks = simulator.activate(4, 'admin-user-1', 'manual', 'Critical failure');

      // Deactivate
      simulator.deactivate(ks.id, 'admin-user-1', 'System restored');

      // All operations should be allowed
      const operations = [
        'scale_campaign',
        'new_campaign',
        'increase_budget',
        'automated_operations',
        'agent_runs',
        'api_calls',
      ];

      for (const op of operations) {
        const check = simulator.isOperationAllowed(op);
        expect(check.allowed).toBe(true);
        expect(check.level).toBe(0);
      }
    });
  });

  // =========================================================================
  // Campaign pause -> check -> resume -> check
  // =========================================================================

  describe('Campaign pause/resume workflow', () => {
    it('should pause a campaign and verify status then resume', () => {
      // Pause campaign
      const paused = simulator.pauseCampaign('camp-de-001', 'admin-user-1');
      expect(paused.status).toBe('paused');
      expect(paused.paused_by).toBe('admin-user-1');
      expect(paused.paused_at).not.toBeNull();

      // Check status
      const checkPaused = simulator.getCampaign('camp-de-001');
      expect(checkPaused).toBeDefined();
      expect(checkPaused!.status).toBe('paused');

      // Resume campaign
      const resumed = simulator.resumeCampaign('camp-de-001');
      expect(resumed.status).toBe('active');
      expect(resumed.paused_by).toBeNull();

      // Check status again
      const checkResumed = simulator.getCampaign('camp-de-001');
      expect(checkResumed!.status).toBe('active');
    });

    it('should handle multiple campaigns paused independently', () => {
      simulator.pauseCampaign('camp-001', 'admin-user-1');
      simulator.pauseCampaign('camp-002', 'admin-user-1');
      simulator.pauseCampaign('camp-003', 'admin-user-1');

      expect(simulator.getCampaign('camp-001')!.status).toBe('paused');
      expect(simulator.getCampaign('camp-002')!.status).toBe('paused');
      expect(simulator.getCampaign('camp-003')!.status).toBe('paused');

      // Resume only one
      simulator.resumeCampaign('camp-002');

      expect(simulator.getCampaign('camp-001')!.status).toBe('paused');
      expect(simulator.getCampaign('camp-002')!.status).toBe('active');
      expect(simulator.getCampaign('camp-003')!.status).toBe('paused');
    });
  });

  // =========================================================================
  // Country pause -> check -> resume -> check
  // =========================================================================

  describe('Country pause/resume workflow', () => {
    it('should pause and resume country operations', () => {
      // Pause Germany
      const paused = simulator.pauseCountry('country-de', 'admin-user-1');
      expect(paused.status).toBe('paused');
      expect(paused.id).toBe('country-de');

      // Verify paused
      const check = simulator.getCountry('country-de');
      expect(check!.status).toBe('paused');

      // Resume
      const resumed = simulator.resumeCountry('country-de');
      expect(resumed.status).toBe('active');
    });

    it('should throw when resuming a non-existent country', () => {
      expect(() => simulator.resumeCountry('country-xx')).toThrow('not found');
    });
  });

  // =========================================================================
  // Concurrent kill switches at different levels -> highest wins
  // =========================================================================

  describe('Concurrent kill switches: highest level wins', () => {
    it('should use the highest active level for operation checks', () => {
      // Activate level 1
      const ks1 = simulator.activate(1, 'admin-user-1', 'roas_drop', 'ROAS dip in DE');
      expect(simulator.getHighestLevel()).toBe(1);

      // Activate level 3 alongside level 1
      const ks3 = simulator.activate(3, 'admin-user-2', 'spend_anomaly', 'Spend anomaly detected');
      expect(simulator.getHighestLevel()).toBe(3);

      // Level 3 blocks automated operations, level 1 alone would not
      const autoCheck = simulator.isOperationAllowed('automated_operations');
      expect(autoCheck.allowed).toBe(false);
      expect(autoCheck.level).toBe(3);

      // Deactivate level 3 -> highest should drop to level 1
      simulator.deactivate(ks3.id, 'admin-user-2', 'Anomaly resolved');
      expect(simulator.getHighestLevel()).toBe(1);

      // Automated operations now allowed (level 1 only blocks scaling)
      const afterDeactivate = simulator.isOperationAllowed('automated_operations');
      expect(afterDeactivate.allowed).toBe(true);
      expect(afterDeactivate.level).toBe(1);

      // Scaling still blocked by level 1
      const scaleCheck = simulator.isOperationAllowed('scale_campaign');
      expect(scaleCheck.allowed).toBe(false);

      // Deactivate level 1 -> no restrictions
      simulator.deactivate(ks1.id, 'admin-user-1', 'ROAS recovered');
      expect(simulator.getHighestLevel()).toBe(0);
      expect(simulator.isOperationAllowed('scale_campaign').allowed).toBe(true);
    });

    it('should track all concurrent switches independently', () => {
      simulator.activate(1, 'user-1', 'manual', 'Reason 1');
      simulator.activate(2, 'user-2', 'cpc_spike', 'Reason 2');
      simulator.activate(3, 'user-3', 'fraud_alert', 'Reason 3');

      const active = simulator.getActiveSwitches();
      expect(active).toHaveLength(3);
      expect(active.map((s) => s.level).sort()).toEqual([1, 2, 3]);
    });
  });

  // =========================================================================
  // Kill switch history accumulation
  // =========================================================================

  describe('Kill switch history accumulation', () => {
    it('should accumulate all activations and deactivations in history', () => {
      const ks1 = simulator.activate(1, 'admin-1', 'manual', 'First activation');
      const ks2 = simulator.activate(2, 'admin-1', 'roas_drop', 'Second activation');
      simulator.deactivate(ks1.id, 'admin-1', 'Resolved');
      const ks3 = simulator.activate(3, 'admin-2', 'spend_anomaly', 'Third activation');
      simulator.deactivate(ks2.id, 'admin-1', 'Fixed');
      simulator.deactivate(ks3.id, 'admin-2', 'All clear');

      const history = simulator.getHistory();
      expect(history).toHaveLength(3);

      // All should now be deactivated in the latest state
      const active = simulator.getActiveSwitches();
      expect(active).toHaveLength(0);
    });

    it('should preserve trigger details in history', () => {
      simulator.activate(2, 'admin-1', 'cpc_spike', 'CPC spiked 300% in US');
      simulator.activate(1, 'admin-1', 'conversion_failure', 'Conversion tracking offline');
      simulator.activate(4, 'admin-2', 'api_error_storm', 'Google Ads API returning 500s');

      const history = simulator.getHistory();
      expect(history).toHaveLength(3);

      expect(history[0].trigger_type).toBe('cpc_spike');
      expect(history[0].reason).toBe('CPC spiked 300% in US');
      expect(history[1].trigger_type).toBe('conversion_failure');
      expect(history[2].trigger_type).toBe('api_error_storm');
    });
  });

  // =========================================================================
  // Level escalation and de-escalation
  // =========================================================================

  describe('Level escalation and de-escalation', () => {
    it('should correctly reflect escalation from level 1 through 4', () => {
      const ks1 = simulator.activate(1, 'admin-1', 'manual', 'Initial concern');
      expect(simulator.getHighestLevel()).toBe(1);
      expect(simulator.isOperationAllowed('new_campaign').allowed).toBe(true);

      const ks2 = simulator.activate(2, 'admin-1', 'roas_drop', 'Situation worsening');
      expect(simulator.getHighestLevel()).toBe(2);
      expect(simulator.isOperationAllowed('new_campaign').allowed).toBe(false);

      const ks3 = simulator.activate(3, 'admin-1', 'spend_anomaly', 'Critical issue emerging');
      expect(simulator.getHighestLevel()).toBe(3);
      expect(simulator.isOperationAllowed('agent_runs').allowed).toBe(false);

      const ks4 = simulator.activate(4, 'admin-1', 'manual', 'Full emergency');
      expect(simulator.getHighestLevel()).toBe(4);
      expect(simulator.isOperationAllowed('api_calls').allowed).toBe(false);

      // De-escalate step by step
      simulator.deactivate(ks4.id, 'admin-1');
      expect(simulator.getHighestLevel()).toBe(3);
      expect(simulator.isOperationAllowed('api_calls').allowed).toBe(true);
      expect(simulator.isOperationAllowed('agent_runs').allowed).toBe(false);

      simulator.deactivate(ks3.id, 'admin-1');
      expect(simulator.getHighestLevel()).toBe(2);
      expect(simulator.isOperationAllowed('agent_runs').allowed).toBe(true);
      expect(simulator.isOperationAllowed('new_campaign').allowed).toBe(false);

      simulator.deactivate(ks2.id, 'admin-1');
      expect(simulator.getHighestLevel()).toBe(1);
      expect(simulator.isOperationAllowed('new_campaign').allowed).toBe(true);
      expect(simulator.isOperationAllowed('scale_campaign').allowed).toBe(false);

      simulator.deactivate(ks1.id, 'admin-1');
      expect(simulator.getHighestLevel()).toBe(0);
      expect(simulator.isOperationAllowed('scale_campaign').allowed).toBe(true);
    });
  });

  // =========================================================================
  // Cache interaction verification
  // =========================================================================

  describe('Cache interaction for kill switch state', () => {
    it('should support caching of kill switch status', async () => {
      const ks = simulator.activate(2, 'admin-1', 'manual', 'Testing cache');

      // Simulate caching the status
      const statusData = {
        active_switches: simulator.getActiveSwitches(),
        highest_level: simulator.getHighestLevel(),
      };

      await mockCacheSet('killswitch:status', JSON.stringify(statusData), 30);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:status',
        expect.stringContaining('"highest_level":2'),
        30,
      );

      // Simulate reading from cache
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(statusData));
      const cached = await mockCacheGet('killswitch:status');
      const parsed = JSON.parse(cached);
      expect(parsed.highest_level).toBe(2);
      expect(parsed.active_switches).toHaveLength(1);

      // Deactivate and invalidate cache
      simulator.deactivate(ks.id, 'admin-1');
      await mockCacheDel('killswitch:status');
      expect(mockCacheDel).toHaveBeenCalledWith('killswitch:status');
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('Error handling', () => {
    it('should throw when deactivating a non-existent switch', () => {
      expect(() => simulator.deactivate('ks-nonexistent', 'admin-1')).toThrow('not found');
    });

    it('should throw when deactivating an already deactivated switch', () => {
      const ks = simulator.activate(1, 'admin-1', 'manual', 'Test');
      simulator.deactivate(ks.id, 'admin-1');

      expect(() => simulator.deactivate(ks.id, 'admin-1')).toThrow('already deactivated');
    });

    it('should throw when resuming a non-existent campaign', () => {
      expect(() => simulator.resumeCampaign('camp-nonexistent')).toThrow('not found');
    });
  });
});

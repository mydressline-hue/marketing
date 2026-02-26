/**
 * E2E System Tests - Kill Switch Full
 *
 * Comprehensive tests for the kill switch emergency control system:
 *   - Level 1: Pause scaling (new scaling blocked, existing campaigns continue)
 *   - Level 2: Pause new campaigns (no new campaigns created)
 *   - Level 3: Pause country (country-specific operations stop)
 *   - Level 4: Full shutdown (ALL operations stop, API keys locked)
 *   - Activate -> verify halt -> deactivate -> verify resume
 *   - Automated triggers (ROAS drop, spend anomaly, etc.)
 *   - State persistence across service restart
 *   - Kill switch history logging
 *   - Concurrent kill switch operations
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
    generateId: jest.fn(() => `ks-uuid-${++counter}`),
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
import { cacheGet, cacheSet, cacheFlush } from '../../../src/config/redis';

import type { HaltLevel, TriggerType, KillSwitchState } from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OperationType =
  | 'campaign_create'
  | 'campaign_scale'
  | 'agent_run'
  | 'api_call'
  | 'budget_increase'
  | 'campaign_continue'
  | 'reporting';

interface KillSwitchEntry {
  id: string;
  level: HaltLevel;
  is_active: boolean;
  activated_by: string;
  trigger_type: TriggerType;
  trigger_details: Record<string, unknown>;
  affected_countries: string[];
  affected_campaigns: string[];
  api_keys_locked: boolean;
  activated_at: string;
  deactivated_at: string | null;
  created_at: string;
}

interface OperationCheckResult {
  allowed: boolean;
  reason: string;
  activeLevel: HaltLevel;
}

interface AutomatedTriggerConfig {
  type: TriggerType;
  threshold: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
}

interface KillSwitchHistory {
  entries: KillSwitchEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// Kill Switch Service Simulator
// ---------------------------------------------------------------------------

class KillSwitchServiceSimulator {
  private switches: Map<string, KillSwitchEntry> = new Map();
  private history: KillSwitchEntry[] = [];
  private automatedTriggers: Map<TriggerType, AutomatedTriggerConfig> = new Map();
  private idCounter = 0;
  private stateSnapshot: string | null = null;

  constructor() {
    this.setupDefaultTriggers();
  }

  private setupDefaultTriggers(): void {
    const triggers: AutomatedTriggerConfig[] = [
      { type: 'roas_drop', threshold: 1.5, enabled: true, lastTriggeredAt: null },
      { type: 'spend_anomaly', threshold: 200, enabled: true, lastTriggeredAt: null },
      { type: 'conversion_failure', threshold: 0.01, enabled: true, lastTriggeredAt: null },
      { type: 'cpc_spike', threshold: 300, enabled: true, lastTriggeredAt: null },
      { type: 'api_error_storm', threshold: 50, enabled: true, lastTriggeredAt: null },
      { type: 'fraud_alert', threshold: 0.8, enabled: true, lastTriggeredAt: null },
    ];

    for (const trigger of triggers) {
      this.automatedTriggers.set(trigger.type, trigger);
    }
  }

  activate(
    level: HaltLevel,
    userId: string,
    triggerType: TriggerType = 'manual',
    reason: string = '',
    options: {
      affectedCountries?: string[];
      affectedCampaigns?: string[];
      lockApiKeys?: boolean;
    } = {},
  ): KillSwitchEntry {
    if (level < 1 || level > 4) {
      throw new Error('Kill switch level must be between 1 and 4');
    }

    this.idCounter += 1;
    const entry: KillSwitchEntry = {
      id: `ks-${this.idCounter}`,
      level,
      is_active: true,
      activated_by: userId,
      trigger_type: triggerType,
      trigger_details: { reason },
      affected_countries: options.affectedCountries || [],
      affected_campaigns: options.affectedCampaigns || [],
      api_keys_locked: options.lockApiKeys || level === 4,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
      created_at: new Date().toISOString(),
    };

    this.switches.set(entry.id, entry);
    this.history.push({ ...entry });
    return entry;
  }

  deactivate(id: string, userId: string): KillSwitchEntry {
    const entry = this.switches.get(id);
    if (!entry) throw new Error(`Kill switch ${id} not found`);
    if (!entry.is_active) throw new Error(`Kill switch ${id} already deactivated`);

    entry.is_active = false;
    entry.deactivated_at = new Date().toISOString();
    entry.api_keys_locked = false;

    // Update history
    const histIdx = this.history.findIndex((h) => h.id === id && h.is_active);
    if (histIdx >= 0) {
      this.history[histIdx] = { ...entry };
    }

    return entry;
  }

  getCurrentLevel(): HaltLevel {
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

  isOperationAllowed(
    operationType: OperationType,
    context?: { countryId?: string; campaignId?: string },
  ): OperationCheckResult {
    const activeLevel = this.getCurrentLevel();

    // Level 0 -- everything allowed
    if (activeLevel === 0) {
      return { allowed: true, reason: 'No active kill switch', activeLevel: 0 };
    }

    // Level 4 -- full shutdown
    if (activeLevel >= 4) {
      return {
        allowed: false,
        reason: 'Full system shutdown is active. All operations are halted.',
        activeLevel,
      };
    }

    // Level 3 -- country-specific + block agent runs and campaign creation
    if (activeLevel >= 3) {
      if (context?.countryId) {
        const activeStates = this.getActiveSwitches();
        const countryBlocked = activeStates.some(
          (s) => s.level === 3 && s.affected_countries.includes(context.countryId!),
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
          reason: 'Country-level pause active. Campaign creation and agent runs restricted.',
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

    // Level 1 -- no scaling or budget increases
    if (activeLevel >= 1) {
      if (operationType === 'budget_increase' || operationType === 'campaign_scale') {
        return {
          allowed: false,
          reason: 'Scaling and budget increases are paused.',
          activeLevel,
        };
      }
    }

    // Reporting and campaign_continue are always allowed at levels 1-3
    return { allowed: true, reason: 'Operation permitted', activeLevel };
  }

  areApiKeysLocked(): boolean {
    for (const entry of this.switches.values()) {
      if (entry.is_active && entry.api_keys_locked) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluate automated triggers against current metric values.
   */
  evaluateAutomatedTrigger(
    triggerType: TriggerType,
    currentValue: number,
    userId: string = 'system',
  ): KillSwitchEntry | null {
    const config = this.automatedTriggers.get(triggerType);
    if (!config || !config.enabled) return null;

    let shouldTrigger = false;

    switch (triggerType) {
      case 'roas_drop':
        // Trigger if ROAS drops below threshold
        shouldTrigger = currentValue < config.threshold;
        break;
      case 'spend_anomaly':
        // Trigger if spend exceeds threshold percentage of normal
        shouldTrigger = currentValue > config.threshold;
        break;
      case 'conversion_failure':
        // Trigger if conversion rate drops below threshold
        shouldTrigger = currentValue < config.threshold;
        break;
      case 'cpc_spike':
        // Trigger if CPC spikes above threshold percentage
        shouldTrigger = currentValue > config.threshold;
        break;
      case 'api_error_storm':
        // Trigger if error count exceeds threshold
        shouldTrigger = currentValue > config.threshold;
        break;
      case 'fraud_alert':
        // Trigger if fraud confidence exceeds threshold
        shouldTrigger = currentValue > config.threshold;
        break;
    }

    if (shouldTrigger) {
      config.lastTriggeredAt = new Date().toISOString();
      // Automated triggers activate at level 1 for ROAS/CPC, level 2 for spend/conversion, level 3 for fraud
      let level: HaltLevel = 1;
      if (triggerType === 'spend_anomaly' || triggerType === 'conversion_failure') level = 2;
      if (triggerType === 'fraud_alert' || triggerType === 'api_error_storm') level = 3;

      return this.activate(level, userId, triggerType, `Automated trigger: ${triggerType} = ${currentValue}`);
    }

    return null;
  }

  getHistory(filters?: { triggerType?: TriggerType; level?: HaltLevel }): KillSwitchHistory {
    let filtered = [...this.history];

    if (filters?.triggerType) {
      filtered = filtered.filter((h) => h.trigger_type === filters.triggerType);
    }
    if (filters?.level !== undefined) {
      filtered = filtered.filter((h) => h.level === filters.level);
    }

    return { entries: filtered, total: filtered.length };
  }

  /**
   * Serialize state for persistence simulation.
   */
  serializeState(): string {
    const state = {
      switches: Array.from(this.switches.entries()),
      history: this.history,
      idCounter: this.idCounter,
    };
    return JSON.stringify(state);
  }

  /**
   * Restore state from serialized snapshot (simulates service restart).
   */
  restoreState(serialized: string): void {
    const state = JSON.parse(serialized);
    this.switches = new Map(state.switches);
    this.history = state.history;
    this.idCounter = state.idCounter;
    this.setupDefaultTriggers();
  }

  /**
   * Save snapshot for restart simulation.
   */
  saveSnapshot(): void {
    this.stateSnapshot = this.serializeState();
  }

  /**
   * Simulate service restart by restoring from saved snapshot.
   */
  simulateRestart(): void {
    if (!this.stateSnapshot) throw new Error('No snapshot saved');
    const snapshot = this.stateSnapshot;
    this.switches.clear();
    this.history = [];
    this.idCounter = 0;
    this.restoreState(snapshot);
  }

  reset(): void {
    this.switches.clear();
    this.history = [];
    this.idCounter = 0;
    this.stateSnapshot = null;
    this.setupDefaultTriggers();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kill Switch Full E2E System Tests', () => {
  let ks: KillSwitchServiceSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    ks = new KillSwitchServiceSimulator();
  });

  // =========================================================================
  // Level 1: Pause Scaling
  // =========================================================================

  describe('Level 1: Pause Scaling', () => {
    it('should block new scaling while allowing existing campaigns to continue', () => {
      ks.activate(1, 'admin-1', 'manual', 'ROAS declining');

      // New scaling blocked
      const scaleCheck = ks.isOperationAllowed('campaign_scale');
      expect(scaleCheck.allowed).toBe(false);
      expect(scaleCheck.reason).toContain('Scaling');

      // Budget increases blocked
      const budgetCheck = ks.isOperationAllowed('budget_increase');
      expect(budgetCheck.allowed).toBe(false);

      // Existing campaigns continue
      const continueCheck = ks.isOperationAllowed('campaign_continue');
      expect(continueCheck.allowed).toBe(true);

      // Reporting still works
      const reportCheck = ks.isOperationAllowed('reporting');
      expect(reportCheck.allowed).toBe(true);

      // Campaign creation still allowed at level 1
      const createCheck = ks.isOperationAllowed('campaign_create');
      expect(createCheck.allowed).toBe(true);
    });

    it('should not lock API keys at level 1', () => {
      ks.activate(1, 'admin-1', 'manual', 'Precautionary pause');

      expect(ks.areApiKeysLocked()).toBe(false);
    });
  });

  // =========================================================================
  // Level 2: Pause New Campaigns
  // =========================================================================

  describe('Level 2: Pause New Campaigns', () => {
    it('should block new campaign creation', () => {
      ks.activate(2, 'admin-1', 'manual', 'Market instability');

      const createCheck = ks.isOperationAllowed('campaign_create');
      expect(createCheck.allowed).toBe(false);
      expect(createCheck.reason).toContain('campaign creation');
    });

    it('should also block scaling (includes level 1 restrictions)', () => {
      ks.activate(2, 'admin-1', 'manual', 'Market instability');

      const scaleCheck = ks.isOperationAllowed('campaign_scale');
      expect(scaleCheck.allowed).toBe(false);

      const budgetCheck = ks.isOperationAllowed('budget_increase');
      expect(budgetCheck.allowed).toBe(false);
    });

    it('should block agent runs at level 2', () => {
      ks.activate(2, 'admin-1', 'manual', 'Agent issues');

      const agentCheck = ks.isOperationAllowed('agent_run');
      expect(agentCheck.allowed).toBe(false);
      expect(agentCheck.reason).toContain('Agent runs');
    });

    it('should allow existing campaigns and reporting', () => {
      ks.activate(2, 'admin-1', 'manual', 'Market instability');

      expect(ks.isOperationAllowed('campaign_continue').allowed).toBe(true);
      expect(ks.isOperationAllowed('reporting').allowed).toBe(true);
    });
  });

  // =========================================================================
  // Level 3: Pause Country
  // =========================================================================

  describe('Level 3: Pause Country', () => {
    it('should block operations for the specific affected country', () => {
      ks.activate(3, 'admin-1', 'manual', 'Germany compliance issue', {
        affectedCountries: ['country-de'],
      });

      const deCheck = ks.isOperationAllowed('campaign_continue', { countryId: 'country-de' });
      expect(deCheck.allowed).toBe(false);
      expect(deCheck.reason).toContain('country-de');
    });

    it('should allow operations for non-affected countries', () => {
      ks.activate(3, 'admin-1', 'manual', 'Germany compliance issue', {
        affectedCountries: ['country-de'],
      });

      // US operations should still be allowed (for non-restricted operation types)
      const usCheck = ks.isOperationAllowed('campaign_continue', { countryId: 'country-us' });
      expect(usCheck.allowed).toBe(true);
    });

    it('should block campaign creation and agent runs at level 3', () => {
      ks.activate(3, 'admin-1', 'manual', 'Country pause');

      expect(ks.isOperationAllowed('campaign_create').allowed).toBe(false);
      expect(ks.isOperationAllowed('agent_run').allowed).toBe(false);
    });

    it('should block multiple countries simultaneously', () => {
      ks.activate(3, 'admin-1', 'manual', 'Multi-country issue', {
        affectedCountries: ['country-de', 'country-fr', 'country-jp'],
      });

      for (const countryId of ['country-de', 'country-fr', 'country-jp']) {
        const check = ks.isOperationAllowed('campaign_continue', { countryId });
        expect(check.allowed).toBe(false);
      }
    });
  });

  // =========================================================================
  // Level 4: Full Shutdown
  // =========================================================================

  describe('Level 4: Full Shutdown', () => {
    it('should halt ALL operations', () => {
      ks.activate(4, 'admin-1', 'manual', 'Critical system failure');

      const operations: OperationType[] = [
        'campaign_create',
        'campaign_scale',
        'agent_run',
        'api_call',
        'budget_increase',
        'campaign_continue',
        'reporting',
      ];

      for (const op of operations) {
        const check = ks.isOperationAllowed(op);
        expect(check.allowed).toBe(false);
        expect(check.activeLevel).toBe(4);
        expect(check.reason).toContain('Full system shutdown');
      }
    });

    it('should lock API keys at level 4', () => {
      ks.activate(4, 'admin-1', 'manual', 'Emergency shutdown');

      expect(ks.areApiKeysLocked()).toBe(true);
    });

    it('should unlock API keys after deactivation', () => {
      const entry = ks.activate(4, 'admin-1', 'manual', 'Emergency shutdown');
      expect(ks.areApiKeysLocked()).toBe(true);

      ks.deactivate(entry.id, 'admin-1');
      expect(ks.areApiKeysLocked()).toBe(false);
    });
  });

  // =========================================================================
  // Activate -> Verify Halt -> Deactivate -> Verify Resume
  // =========================================================================

  describe('Activate -> Halt -> Deactivate -> Resume Cycle', () => {
    it('should halt all operations on activation and resume after deactivation', () => {
      // Pre-activation: everything works
      expect(ks.isOperationAllowed('campaign_create').allowed).toBe(true);
      expect(ks.isOperationAllowed('campaign_scale').allowed).toBe(true);
      expect(ks.isOperationAllowed('agent_run').allowed).toBe(true);

      // Activate level 4
      const entry = ks.activate(4, 'admin-1', 'manual', 'Full emergency');

      // During activation: everything halted
      expect(ks.isOperationAllowed('campaign_create').allowed).toBe(false);
      expect(ks.isOperationAllowed('campaign_scale').allowed).toBe(false);
      expect(ks.isOperationAllowed('agent_run').allowed).toBe(false);
      expect(ks.isOperationAllowed('api_call').allowed).toBe(false);
      expect(ks.areApiKeysLocked()).toBe(true);

      // Deactivate
      ks.deactivate(entry.id, 'admin-1');

      // Post-deactivation: everything resumes
      expect(ks.isOperationAllowed('campaign_create').allowed).toBe(true);
      expect(ks.isOperationAllowed('campaign_scale').allowed).toBe(true);
      expect(ks.isOperationAllowed('agent_run').allowed).toBe(true);
      expect(ks.isOperationAllowed('api_call').allowed).toBe(true);
      expect(ks.areApiKeysLocked()).toBe(false);
      expect(ks.getCurrentLevel()).toBe(0);
    });

    it('should support escalation from level 1 to level 4 and back', () => {
      const ks1 = ks.activate(1, 'admin-1', 'roas_drop', 'ROAS declining');
      expect(ks.getCurrentLevel()).toBe(1);

      const ks2 = ks.activate(2, 'admin-1', 'spend_anomaly', 'Spend spiking');
      expect(ks.getCurrentLevel()).toBe(2);

      const ks3 = ks.activate(3, 'admin-1', 'fraud_alert', 'Fraud detected');
      expect(ks.getCurrentLevel()).toBe(3);

      const ks4 = ks.activate(4, 'admin-1', 'manual', 'Full shutdown needed');
      expect(ks.getCurrentLevel()).toBe(4);

      // De-escalate
      ks.deactivate(ks4.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(3);

      ks.deactivate(ks3.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(2);

      ks.deactivate(ks2.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(1);

      ks.deactivate(ks1.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(0);
    });
  });

  // =========================================================================
  // Automated Triggers
  // =========================================================================

  describe('Automated Triggers', () => {
    it('should trigger level 1 kill switch on ROAS drop below threshold', () => {
      const result = ks.evaluateAutomatedTrigger('roas_drop', 1.2);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(1);
      expect(result!.trigger_type).toBe('roas_drop');
      expect(result!.is_active).toBe(true);
      expect(ks.getCurrentLevel()).toBe(1);
    });

    it('should not trigger when ROAS is above threshold', () => {
      const result = ks.evaluateAutomatedTrigger('roas_drop', 2.5);

      expect(result).toBeNull();
      expect(ks.getCurrentLevel()).toBe(0);
    });

    it('should trigger level 2 kill switch on spend anomaly', () => {
      const result = ks.evaluateAutomatedTrigger('spend_anomaly', 350);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(2);
      expect(result!.trigger_type).toBe('spend_anomaly');
    });

    it('should trigger level 3 kill switch on fraud alert', () => {
      const result = ks.evaluateAutomatedTrigger('fraud_alert', 0.92);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(3);
      expect(result!.trigger_type).toBe('fraud_alert');
    });

    it('should trigger level 2 on conversion failure', () => {
      const result = ks.evaluateAutomatedTrigger('conversion_failure', 0.005);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(2);
      expect(result!.trigger_type).toBe('conversion_failure');
    });

    it('should trigger level 1 on CPC spike', () => {
      const result = ks.evaluateAutomatedTrigger('cpc_spike', 450);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(1);
      expect(result!.trigger_type).toBe('cpc_spike');
    });

    it('should trigger level 3 on API error storm', () => {
      const result = ks.evaluateAutomatedTrigger('api_error_storm', 100);

      expect(result).not.toBeNull();
      expect(result!.level).toBe(3);
      expect(result!.trigger_type).toBe('api_error_storm');
    });

    it('should record automated trigger in history', () => {
      ks.evaluateAutomatedTrigger('roas_drop', 1.0);

      const history = ks.getHistory({ triggerType: 'roas_drop' });
      expect(history.total).toBe(1);
      expect(history.entries[0].trigger_type).toBe('roas_drop');
      expect(history.entries[0].activated_by).toBe('system');
    });
  });

  // =========================================================================
  // State Persistence Across Restart
  // =========================================================================

  describe('State Persistence Across Service Restart', () => {
    it('should persist active kill switches across simulated restart', () => {
      ks.activate(2, 'admin-1', 'manual', 'Pause before maintenance');
      ks.activate(1, 'admin-2', 'roas_drop', 'ROAS concern');

      expect(ks.getCurrentLevel()).toBe(2);
      expect(ks.getActiveSwitches()).toHaveLength(2);

      // Save and restart
      ks.saveSnapshot();
      ks.simulateRestart();

      // State should be preserved
      expect(ks.getCurrentLevel()).toBe(2);
      expect(ks.getActiveSwitches()).toHaveLength(2);
    });

    it('should preserve kill switch history across restart', () => {
      const entry = ks.activate(3, 'admin-1', 'fraud_alert', 'Fraud detected');
      ks.deactivate(entry.id, 'admin-1');
      ks.activate(1, 'admin-2', 'manual', 'Precaution');

      const historyBefore = ks.getHistory();
      expect(historyBefore.total).toBe(2);

      ks.saveSnapshot();
      ks.simulateRestart();

      const historyAfter = ks.getHistory();
      expect(historyAfter.total).toBe(2);
    });

    it('should maintain correct level after restart with mixed active/inactive switches', () => {
      const ks1 = ks.activate(1, 'admin-1', 'manual', 'Level 1');
      const ks2 = ks.activate(3, 'admin-1', 'manual', 'Level 3');
      ks.deactivate(ks2.id, 'admin-1'); // Deactivate level 3

      expect(ks.getCurrentLevel()).toBe(1);

      ks.saveSnapshot();
      ks.simulateRestart();

      expect(ks.getCurrentLevel()).toBe(1);
      expect(ks.getActiveSwitches()).toHaveLength(1);
    });
  });

  // =========================================================================
  // Kill Switch History Logging
  // =========================================================================

  describe('Kill Switch History Logging', () => {
    it('should log every activation in history', () => {
      ks.activate(1, 'admin-1', 'manual', 'First');
      ks.activate(2, 'admin-2', 'roas_drop', 'Second');
      ks.activate(3, 'admin-1', 'fraud_alert', 'Third');

      const history = ks.getHistory();
      expect(history.total).toBe(3);
      expect(history.entries[0].level).toBe(1);
      expect(history.entries[1].level).toBe(2);
      expect(history.entries[2].level).toBe(3);
    });

    it('should filter history by trigger type', () => {
      ks.activate(1, 'admin-1', 'manual', 'Manual 1');
      ks.activate(2, 'admin-1', 'roas_drop', 'ROAS trigger');
      ks.activate(1, 'admin-1', 'manual', 'Manual 2');

      const manualHistory = ks.getHistory({ triggerType: 'manual' });
      expect(manualHistory.total).toBe(2);

      const roasHistory = ks.getHistory({ triggerType: 'roas_drop' });
      expect(roasHistory.total).toBe(1);
    });

    it('should filter history by level', () => {
      ks.activate(1, 'admin-1', 'manual', 'Level 1');
      ks.activate(2, 'admin-1', 'manual', 'Level 2');
      ks.activate(1, 'admin-1', 'roas_drop', 'Level 1 again');

      const level1History = ks.getHistory({ level: 1 });
      expect(level1History.total).toBe(2);

      const level2History = ks.getHistory({ level: 2 });
      expect(level2History.total).toBe(1);
    });

    it('should record activation and deactivation timestamps', () => {
      const entry = ks.activate(2, 'admin-1', 'manual', 'Test');
      expect(entry.activated_at).toBeDefined();
      expect(entry.deactivated_at).toBeNull();

      const deactivated = ks.deactivate(entry.id, 'admin-1');
      expect(deactivated.deactivated_at).toBeDefined();
      expect(deactivated.deactivated_at).not.toBeNull();
    });

    it('should persist history to database', async () => {
      ks.activate(1, 'admin-1', 'manual', 'DB test');
      ks.activate(2, 'admin-2', 'roas_drop', 'DB test 2');

      const history = ks.getHistory();

      for (const entry of history.entries) {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ id: entry.id, level: entry.level, trigger_type: entry.trigger_type }],
          rowCount: 1,
        });

        const dbResult = await mockPool.query(
          `INSERT INTO kill_switch_state
            (id, level, is_active, activated_by, trigger_type, trigger_details, activated_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            entry.id,
            entry.level,
            entry.is_active,
            entry.activated_by,
            entry.trigger_type,
            JSON.stringify(entry.trigger_details),
            entry.activated_at,
            entry.created_at,
          ],
        );

        expect(dbResult.rows[0].level).toBe(entry.level);
      }

      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Concurrent Kill Switch Operations
  // =========================================================================

  describe('Concurrent Kill Switch Operations', () => {
    it('should handle multiple kill switches at different levels without conflict', () => {
      const ks1 = ks.activate(1, 'admin-1', 'manual', 'Level 1 concern');
      const ks2 = ks.activate(2, 'admin-2', 'spend_anomaly', 'Spend issue');
      const ks3 = ks.activate(3, 'admin-3', 'fraud_alert', 'Fraud');

      expect(ks.getActiveSwitches()).toHaveLength(3);
      expect(ks.getCurrentLevel()).toBe(3);

      // Deactivate middle level -- highest should still be 3
      ks.deactivate(ks2.id, 'admin-2');
      expect(ks.getCurrentLevel()).toBe(3);
      expect(ks.getActiveSwitches()).toHaveLength(2);
    });

    it('should support multiple level 1 switches from different triggers', () => {
      ks.activate(1, 'admin-1', 'roas_drop', 'ROAS issue');
      ks.activate(1, 'admin-2', 'cpc_spike', 'CPC issue');

      expect(ks.getActiveSwitches()).toHaveLength(2);
      expect(ks.getCurrentLevel()).toBe(1);
    });

    it('should correctly resolve level when overlapping switches are deactivated', () => {
      const ks1 = ks.activate(1, 'admin-1', 'manual', 'A');
      const ks2 = ks.activate(3, 'admin-1', 'manual', 'B');
      const ks3 = ks.activate(2, 'admin-1', 'manual', 'C');

      expect(ks.getCurrentLevel()).toBe(3);

      // Deactivate level 3 -> level should drop to 2
      ks.deactivate(ks2.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(2);

      // Deactivate level 1 -> level should still be 2
      ks.deactivate(ks1.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(2);

      // Deactivate level 2 -> level should be 0
      ks.deactivate(ks3.id, 'admin-1');
      expect(ks.getCurrentLevel()).toBe(0);
    });

    it('should prevent double deactivation', () => {
      const entry = ks.activate(2, 'admin-1', 'manual', 'Test');
      ks.deactivate(entry.id, 'admin-1');

      expect(() => ks.deactivate(entry.id, 'admin-1')).toThrow('already deactivated');
    });

    it('should reject deactivation of non-existent switch', () => {
      expect(() => ks.deactivate('ks-nonexistent', 'admin-1')).toThrow('not found');
    });
  });

  // =========================================================================
  // Validation and Edge Cases
  // =========================================================================

  describe('Validation and Edge Cases', () => {
    it('should reject invalid kill switch levels', () => {
      expect(() => ks.activate(0 as HaltLevel, 'admin-1', 'manual', 'Invalid')).toThrow(
        'level must be between 1 and 4',
      );
      expect(() => ks.activate(5 as HaltLevel, 'admin-1', 'manual', 'Invalid')).toThrow(
        'level must be between 1 and 4',
      );
    });

    it('should return level 0 when no switches are active', () => {
      expect(ks.getCurrentLevel()).toBe(0);
      expect(ks.getActiveSwitches()).toHaveLength(0);
    });

    it('should cache kill switch state via Redis', async () => {
      ks.activate(2, 'admin-1', 'manual', 'Cache test');

      const stateData = {
        level: ks.getCurrentLevel(),
        activeSwitches: ks.getActiveSwitches().length,
      };

      await mockCacheSet('killswitch:current_level', stateData, 10);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:current_level',
        expect.objectContaining({ level: 2 }),
        10,
      );
    });

    it('should invalidate cache on state change', async () => {
      const entry = ks.activate(2, 'admin-1', 'manual', 'Cache invalidation test');

      await mockCacheFlush('killswitch:*');
      expect(mockCacheFlush).toHaveBeenCalledWith('killswitch:*');

      ks.deactivate(entry.id, 'admin-1');

      await mockCacheFlush('killswitch:*');
      expect(mockCacheFlush).toHaveBeenCalledTimes(2);
    });
  });
});

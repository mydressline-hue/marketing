/**
 * Kill Switch Integration Tests (Phase 12C - Batch 2).
 *
 * Validates kill switch activation/deactivation at multiple levels,
 * automated trigger evaluation, operation permission checks, history
 * querying, and concurrent activation handling.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any application imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn(), scan: jest.fn() },
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
  generateId: jest.fn().mockReturnValue('ks-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheFlush } from '../../../src/config/redis';
import { KillSwitchService } from '../../../src/services/killswitch/KillSwitchService';
import { AutomatedTriggersService } from '../../../src/services/killswitch/AutomatedTriggersService';
import { AuditService } from '../../../src/services/audit.service';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kill Switch Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheFlush.mockResolvedValue(undefined);
    mockAuditLog.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Global Activation / Deactivation
  // =========================================================================

  describe('Global kill switch activation', () => {
    it('should activate a global kill switch at level 1', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 1, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Pause scaling' },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.activateGlobalKillSwitch('admin-1', 1 as any, 'Pause scaling');

      expect(result.is_active).toBe(true);
      expect(result.level).toBe(1);
      expect(result.activated_by).toBe('admin-1');
      expect(mockCacheFlush).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'kill_switch.activate', details: expect.objectContaining({ level: 1 }) }),
      );
    });

    it('should activate a global kill switch at level 4 (full shutdown)', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 4, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Emergency' },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.activateGlobalKillSwitch('admin-1', 4 as any, 'Emergency');

      expect(result.level).toBe(4);
      expect(result.is_active).toBe(true);
    });

    it('should reject invalid kill switch levels below 1', async () => {
      await expect(
        KillSwitchService.activateGlobalKillSwitch('admin-1', 0 as any, 'test'),
      ).rejects.toThrow('Kill switch level must be between 1 and 4');
    });

    it('should reject invalid kill switch levels above 4', async () => {
      await expect(
        KillSwitchService.activateGlobalKillSwitch('admin-1', 5 as any, 'test'),
      ).rejects.toThrow('Kill switch level must be between 1 and 4');
    });

    it('should deactivate a global kill switch by ID', async () => {
      const mockRow = {
        id: 'ks-1', level: 2, is_active: false, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: {},
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-01-01T01:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.deactivateKillSwitch('ks-1', 'admin-1');

      expect(result.is_active).toBe(false);
      expect(result.deactivated_at).toBeDefined();
      expect(mockCacheFlush).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'kill_switch.deactivate' }),
      );
    });

    it('should throw NotFoundError when deactivating a non-existent kill switch', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        KillSwitchService.deactivateKillSwitch('non-existent', 'admin-1'),
      ).rejects.toThrow('Active kill switch entry not found');
    });
  });

  // =========================================================================
  // Campaign-level kill switch
  // =========================================================================

  describe('Campaign-level kill switch', () => {
    it('should pause a specific campaign', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 2, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Bad ROAS' },
        affected_campaigns: ['camp-1'], affected_countries: null,
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.pauseCampaign('camp-1', 'admin-1', 'Bad ROAS');

      expect(result.level).toBe(2);
      expect(result.affected_campaigns).toContain('camp-1');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'kill_switch.pause_campaign' }),
      );
    });

    it('should resume a paused campaign', async () => {
      const mockRow = {
        id: 'ks-2', level: 2, is_active: false, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: {},
        affected_campaigns: ['camp-1'], affected_countries: null,
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-01-01T01:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.resumeCampaign('camp-1', 'admin-1');

      expect(result.is_active).toBe(false);
      expect(result.deactivated_at).toBeDefined();
    });

    it('should throw NotFoundError when resuming a campaign with no active kill switch', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        KillSwitchService.resumeCampaign('nonexistent-camp', 'admin-1'),
      ).rejects.toThrow('No active kill switch found for this campaign');
    });
  });

  // =========================================================================
  // Automation-level kill switch
  // =========================================================================

  describe('Automation-level kill switch', () => {
    it('should pause automation and set level 1', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 1, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Agent misbehaving', scope: 'automation' },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.pauseAutomation('admin-1', 'Agent misbehaving');

      expect(result.level).toBe(1);
      expect(result.is_active).toBe(true);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'kill_switch.pause_automation' }),
      );
    });
  });

  // =========================================================================
  // API Keys kill switch
  // =========================================================================

  describe('API Keys kill switch', () => {
    it('should lock API keys at level 4', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 4, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Security breach', api_keys_locked: true },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.lockAPIKeys('admin-1', 'Security breach');

      expect(result.level).toBe(4);
      expect(result.is_active).toBe(true);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kill_switch.lock_api_keys',
          details: expect.objectContaining({ api_keys_locked: true }),
        }),
      );
    });
  });

  // =========================================================================
  // Country-specific kill switch
  // =========================================================================

  describe('Country-specific kill switch', () => {
    it('should pause a specific country at level 3', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 3, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'Regulatory issue' },
        affected_campaigns: null, affected_countries: ['country-br'],
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.pauseCountry('country-br', 'admin-1', 'Regulatory issue');

      expect(result.level).toBe(3);
      expect(result.affected_countries).toContain('country-br');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'kill_switch.pause_country' }),
      );
    });

    it('should resume a paused country', async () => {
      const mockRow = {
        id: 'ks-3', level: 3, is_active: false, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: {},
        affected_campaigns: null, affected_countries: ['country-br'],
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-01-01T02:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      const result = await KillSwitchService.resumeCountry('country-br', 'admin-1');

      expect(result.is_active).toBe(false);
      expect(result.affected_countries).toContain('country-br');
    });

    it('should throw NotFoundError when resuming a country with no active kill switch', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        KillSwitchService.resumeCountry('country-xx', 'admin-1'),
      ).rejects.toThrow('No active kill switch found for this country');
    });
  });

  // =========================================================================
  // Operation permission checks
  // =========================================================================

  describe('Operation permission checks (isOperationAllowed)', () => {
    it('should allow all operations at level 0', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 0 }] });

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(true);
      expect(result.activeLevel).toBe(0);
    });

    it('should block budget_increase at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 1 }] });

      const result = await KillSwitchService.isOperationAllowed('budget_increase');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Scaling and budget increases');
      expect(result.activeLevel).toBe(1);
    });

    it('should block campaign_scale at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 1 }] });

      const result = await KillSwitchService.isOperationAllowed('campaign_scale');

      expect(result.allowed).toBe(false);
      expect(result.activeLevel).toBe(1);
    });

    it('should allow api_call at level 1', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 1 }] });

      const result = await KillSwitchService.isOperationAllowed('api_call');

      expect(result.allowed).toBe(true);
    });

    it('should block campaign_create at level 2', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 2 }] });

      const result = await KillSwitchService.isOperationAllowed('campaign_create');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('campaign creation is paused');
    });

    it('should block agent_run at level 2', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 2 }] });

      const result = await KillSwitchService.isOperationAllowed('agent_run');

      expect(result.allowed).toBe(false);
    });

    it('should block country-specific operations at level 3', async () => {
      // getCurrentLevel returns 3
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 3 }] });
      // getActiveKillSwitches returns country-specific entry
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ks-1', level: 3, is_active: true, activated_by: 'admin-1',
          trigger_type: 'manual', trigger_details: {},
          affected_countries: ['country-br'], activated_at: '2026-01-01T00:00:00Z',
          deactivated_at: null, created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const result = await KillSwitchService.isOperationAllowed('api_call', { countryId: 'country-br' });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('country-br');
    });

    it('should block all operations at level 4 (full shutdown)', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 4 }] });

      const result = await KillSwitchService.isOperationAllowed('api_call');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Full system shutdown');
      expect(result.activeLevel).toBe(4);
    });
  });

  // =========================================================================
  // Active kill switches query
  // =========================================================================

  describe('Active kill switches query', () => {
    it('should return active kill switches from database when cache misses', async () => {
      const mockRows = [
        { id: 'ks-1', level: 3, is_active: true, activated_by: 'admin-1', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T00:00:00Z', deactivated_at: null, created_at: '2026-01-01T00:00:00Z' },
        { id: 'ks-2', level: 1, is_active: true, activated_by: 'admin-2', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T00:00:00Z', deactivated_at: null, created_at: '2026-01-01T00:00:00Z' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await KillSwitchService.getActiveKillSwitches();

      expect(result).toHaveLength(2);
      expect(result[0].level).toBe(3);
      expect(result[1].level).toBe(1);
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return active kill switches from cache when available', async () => {
      const cachedData = [
        { id: 'ks-cached', level: 2, is_active: true, activated_by: 'admin-1', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T00:00:00Z', deactivated_at: null, created_at: '2026-01-01T00:00:00Z' },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedData);

      const result = await KillSwitchService.getActiveKillSwitches();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ks-cached');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return current highest level (0 when none active)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 0 }] });

      const level = await KillSwitchService.getCurrentLevel();

      expect(level).toBe(0);
    });
  });

  // =========================================================================
  // Kill switch history / audit log
  // =========================================================================

  describe('Kill switch history and audit log', () => {
    it('should return paginated history with default parameters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'ks-h1', level: 2, is_active: false, activated_by: 'admin-1', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-01-01T01:00:00Z', created_at: '2026-01-01T00:00:00Z' },
          ],
        });

      const result = await KillSwitchService.getKillSwitchHistory();

      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('should filter history by trigger type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await KillSwitchService.getKillSwitchHistory({ triggerType: 'roas_drop' });

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain('trigger_type = $1');
      expect(countCall[1]).toContain('roas_drop');
    });

    it('should filter history by level', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await KillSwitchService.getKillSwitchHistory({ level: 3 as any });

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain('level = $');
    });

    it('should filter history by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await KillSwitchService.getKillSwitchHistory({
        startDate: '2026-01-01', endDate: '2026-01-31',
      });

      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain('created_at >= $');
      expect(countCall[0]).toContain('created_at <= $');
    });

    it('should respect pagination parameters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await KillSwitchService.getKillSwitchHistory({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(5);
    });
  });

  // =========================================================================
  // Automated trigger creation and evaluation
  // =========================================================================

  describe('Automated trigger configuration', () => {
    it('should return default trigger configurations when DB has no records', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs.length).toBeGreaterThan(0);
      expect(configs.find(c => c.type === 'roas_drop')).toBeDefined();
      expect(configs.find(c => c.type === 'spend_anomaly')).toBeDefined();
      expect(configs.find(c => c.type === 'fraud_alert')).toBeDefined();
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should return cached trigger configurations when available', async () => {
      const cached = [{ type: 'roas_drop', threshold: 1.5, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 2 }];
      mockCacheGet.mockResolvedValueOnce(cached);

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return DB-sourced trigger configurations when available', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: 'roas_drop', threshold: '1.5', is_enabled: true, cooldown_minutes: '30', kill_switch_level: '2' },
          { type: 'fraud_alert', threshold: '80', is_enabled: true, cooldown_minutes: '15', kill_switch_level: '3' },
        ],
      });

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toHaveLength(2);
      expect(configs[0].threshold).toBe(1.5);
      expect(configs[1].kill_switch_level).toBe(3);
    });
  });

  // =========================================================================
  // Automated trigger firing based on conditions
  // =========================================================================

  describe('Automated trigger firing', () => {
    it('should fire ROAS drop trigger when average ROAS is below threshold', async () => {
      // getTriggerConfigurations (cache miss + DB)
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // defaults

      // isCooldownActive check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // ROAS query returns low value
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_roas: '0.5' }] });

      // registerTriggerEvent
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(true);
      expect(result.type).toBe('roas_drop');
      expect(result.current_value).toBe(0.5);
      expect(result.current_value).toBeLessThan(result.threshold);
    });

    it('should not fire ROAS trigger when ROAS is above threshold', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no cooldown
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_roas: '2.5' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // register event

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(2.5);
    });

    it('should fire spend anomaly trigger when spend exceeds multiplier', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // defaults
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no cooldown
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_daily_spend: '1000' }] }); // baseline
      mockQuery.mockResolvedValueOnce({ rows: [{ today_spend: '3000' }] }); // today (3x > 2.0 threshold)
      mockQuery.mockResolvedValueOnce({ rows: [] }); // register event

      const result = await AutomatedTriggersService.evaluateSpendAnomalyTrigger();

      expect(result.fired).toBe(true);
      expect(result.type).toBe('spend_anomaly');
      expect(result.current_value).toBe(3); // 3000/1000
    });

    it('should fire fraud alert trigger when confidence exceeds threshold', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // defaults
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no cooldown
      mockQuery.mockResolvedValueOnce({ rows: [{ max_confidence: '95', alert_count: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // register event

      const result = await AutomatedTriggersService.evaluateFraudAlertTrigger();

      expect(result.fired).toBe(true);
      expect(result.type).toBe('fraud_alert');
      expect(result.current_value).toBe(95);
    });
  });

  // =========================================================================
  // Recovery after deactivation
  // =========================================================================

  describe('Recovery after deactivation', () => {
    it('should allow operations after kill switch deactivation', async () => {
      // Deactivate the kill switch
      const deactivatedRow = {
        id: 'ks-1', level: 2, is_active: false, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: {},
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-01-01T01:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [deactivatedRow], rowCount: 1 });
      await KillSwitchService.deactivateKillSwitch('ks-1', 'admin-1');

      // Now check that operations are allowed (level 0)
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 0 }] });

      const result = await KillSwitchService.isOperationAllowed('campaign_create');
      expect(result.allowed).toBe(true);
      expect(result.activeLevel).toBe(0);
    });
  });

  // =========================================================================
  // Kill switch state persistence
  // =========================================================================

  describe('Kill switch state persistence', () => {
    it('should persist state to database on activation', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 2, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'test' },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      await KillSwitchService.activateGlobalKillSwitch('admin-1', 2 as any, 'test');

      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO kill_switch_state');
      expect(insertCall[1]).toContain('ks-test-uuid');
      expect(insertCall[1]).toContain(2); // level
    });

    it('should invalidate cache on every state change', async () => {
      const mockRow = {
        id: 'ks-test-uuid', level: 1, is_active: true, activated_by: 'admin-1',
        trigger_type: 'manual', trigger_details: { reason: 'test' },
        activated_at: '2026-01-01T00:00:00Z', deactivated_at: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRow], rowCount: 1 });

      await KillSwitchService.activateGlobalKillSwitch('admin-1', 1 as any, 'test');

      expect(mockCacheFlush).toHaveBeenCalledWith('killswitch:*');
    });
  });

  // =========================================================================
  // Concurrent activation handling
  // =========================================================================

  describe('Concurrent activation handling', () => {
    it('should return the highest active level among multiple activations', async () => {
      // Two active kill switches: level 1 and level 3
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ max_level: 3 }] });

      const level = await KillSwitchService.getCurrentLevel();

      expect(level).toBe(3);
    });

    it('should handle multiple concurrent active kill switches in getActiveKillSwitches', async () => {
      const mockRows = [
        { id: 'ks-1', level: 4, is_active: true, activated_by: 'admin-1', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T02:00:00Z', deactivated_at: null, created_at: '2026-01-01T02:00:00Z' },
        { id: 'ks-2', level: 3, is_active: true, activated_by: 'admin-2', trigger_type: 'roas_drop', trigger_details: {}, affected_countries: ['country-de'], activated_at: '2026-01-01T01:00:00Z', deactivated_at: null, created_at: '2026-01-01T01:00:00Z' },
        { id: 'ks-3', level: 1, is_active: true, activated_by: 'admin-1', trigger_type: 'manual', trigger_details: {}, activated_at: '2026-01-01T00:00:00Z', deactivated_at: null, created_at: '2026-01-01T00:00:00Z' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await KillSwitchService.getActiveKillSwitches();

      expect(result).toHaveLength(3);
      // Ordered by level DESC
      expect(result[0].level).toBe(4);
      expect(result[1].level).toBe(3);
      expect(result[2].level).toBe(1);
    });
  });
});

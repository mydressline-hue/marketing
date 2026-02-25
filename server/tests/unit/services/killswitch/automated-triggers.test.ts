/**
 * Unit tests for AutomatedTriggersService.
 *
 * Database pool, Redis cache, logger, and ID generation are fully mocked
 * so tests exercise only the service logic -- trigger evaluation, cooldown
 * enforcement, configuration CRUD, history retrieval, and cache behaviour.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before any imports
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { AutomatedTriggersService } from '../../../../src/services/killswitch/AutomatedTriggersService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { generateId } from '../../../../src/utils/helpers';
import { AuditService } from '../../../../src/services/audit.service';
import { ValidationError } from '../../../../src/utils/errors';
import type { TriggerConfig } from '../../../../src/services/killswitch/AutomatedTriggersService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a mock query result with the given rows. */
function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

/** Returns a Date N minutes in the past as an ISO string. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** Default configs that mirror the service defaults -- used when cache is empty and DB falls back. */
const DEFAULT_CONFIGS: TriggerConfig[] = [
  { type: 'roas_drop', threshold: 1.0, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 2 },
  { type: 'spend_anomaly', threshold: 2.0, is_enabled: true, cooldown_minutes: 15, kill_switch_level: 3 },
  { type: 'conversion_failure', threshold: 0, is_enabled: true, cooldown_minutes: 60, kill_switch_level: 2 },
  { type: 'cpc_spike', threshold: 1.5, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 1 },
  { type: 'api_error_storm', threshold: 50, is_enabled: true, cooldown_minutes: 5, kill_switch_level: 3 },
  { type: 'fraud_alert', threshold: 90, is_enabled: true, cooldown_minutes: 10, kill_switch_level: 3 },
];

/**
 * A helper that sets up:
 *   1. Cache miss for trigger configs
 *   2. DB error on trigger_configurations (falls back to defaults)
 *   3. Cooldown check returning no prior fired events
 * so the next mockQuery call is the trigger-specific query.
 */
function setupDefaultConfigAndNoCooldown() {
  mockCacheGet.mockResolvedValueOnce(null);           // config cache miss
  mockQuery.mockResolvedValueOnce(mockRows([]));      // trigger_configurations empty → defaults
  mockQuery.mockResolvedValueOnce(mockRows([]));      // cooldown check → no prior events
}

/**
 * Sets up cached configs and no cooldown for simpler trigger tests.
 */
function setupCachedConfigAndNoCooldown() {
  mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS); // config cache hit
  mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown check → no prior events
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutomatedTriggersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // evaluateROASTrigger
  // =========================================================================

  describe('evaluateROASTrigger', () => {
    it('fires when average ROAS is below configured threshold', async () => {
      setupCachedConfigAndNoCooldown();

      // ROAS query returns low value
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '0.5' }]));
      // registerTriggerEvent INSERT
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(true);
      expect(result.type).toBe('roas_drop');
      expect(result.current_value).toBe(0.5);
      expect(result.threshold).toBe(1.0);
    });

    it('does not fire when average ROAS is above threshold', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '3.5' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(3.5);
    });

    it('skips evaluation when cooldown is active', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      // Cooldown check returns a recent fired event
      mockQuery.mockResolvedValueOnce(mockRows([{ created_at: minutesAgo(5) }]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(false);
      expect(result.details).toEqual({ skipped: 'cooldown_active' });
    });
  });

  // =========================================================================
  // evaluateSpendAnomalyTrigger
  // =========================================================================

  describe('evaluateSpendAnomalyTrigger', () => {
    it('fires when daily spend exceeds 200% of 30-day baseline', async () => {
      setupCachedConfigAndNoCooldown();

      // Baseline: avg $100/day
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_daily_spend: '100' }]));
      // Today: $250 (ratio 2.5 > threshold 2.0)
      mockQuery.mockResolvedValueOnce(mockRows([{ today_spend: '250' }]));
      // registerTriggerEvent
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateSpendAnomalyTrigger();

      expect(result.fired).toBe(true);
      expect(result.current_value).toBe(2.5);
      expect(result.threshold).toBe(2.0);
    });

    it('does not fire when spend is within normal range', async () => {
      setupCachedConfigAndNoCooldown();

      // Baseline: $100/day
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_daily_spend: '100' }]));
      // Today: $150 (ratio 1.5 < threshold 2.0)
      mockQuery.mockResolvedValueOnce(mockRows([{ today_spend: '150' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateSpendAnomalyTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(1.5);
    });

    it('does not fire when baseline is zero', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ avg_daily_spend: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([{ today_spend: '500' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateSpendAnomalyTrigger();

      expect(result.fired).toBe(false);
    });
  });

  // =========================================================================
  // evaluateConversionFailureTrigger
  // =========================================================================

  describe('evaluateConversionFailureTrigger', () => {
    it('fires when campaigns with prior conversions have zero recent conversions', async () => {
      setupCachedConfigAndNoCooldown();

      // 3 stalled campaigns (threshold is 0, so > 0 fires)
      mockQuery.mockResolvedValueOnce(mockRows([{ stalled_count: '3' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateConversionFailureTrigger();

      expect(result.fired).toBe(true);
      expect(result.current_value).toBe(3);
    });

    it('does not fire when no campaigns are stalled', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ stalled_count: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateConversionFailureTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(0);
    });
  });

  // =========================================================================
  // evaluateCPCSpikeTrigger
  // =========================================================================

  describe('evaluateCPCSpikeTrigger', () => {
    it('fires when CPC ratio exceeds 150% of 7-day average', async () => {
      setupCachedConfigAndNoCooldown();

      // 7-day avg CPC
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_cpc: '1.00' }]));
      // Current CPC (ratio 2.0 > threshold 1.5)
      mockQuery.mockResolvedValueOnce(mockRows([{ current_cpc: '2.00' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateCPCSpikeTrigger();

      expect(result.fired).toBe(true);
      expect(result.current_value).toBe(2.0);
      expect(result.threshold).toBe(1.5);
    });

    it('does not fire when CPC is within normal range', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ avg_cpc: '1.00' }]));
      mockQuery.mockResolvedValueOnce(mockRows([{ current_cpc: '1.20' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateCPCSpikeTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(1.2);
    });
  });

  // =========================================================================
  // evaluateAPIErrorStormTrigger
  // =========================================================================

  describe('evaluateAPIErrorStormTrigger', () => {
    it('fires when error count exceeds threshold', async () => {
      setupCachedConfigAndNoCooldown();

      // 75 errors in last minute (> threshold of 50)
      mockQuery.mockResolvedValueOnce(mockRows([{ error_count: '75' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateAPIErrorStormTrigger();

      expect(result.fired).toBe(true);
      expect(result.current_value).toBe(75);
      expect(result.threshold).toBe(50);
    });

    it('does not fire when error count is below threshold', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ error_count: '10' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateAPIErrorStormTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(10);
    });
  });

  // =========================================================================
  // evaluateFraudAlertTrigger
  // =========================================================================

  describe('evaluateFraudAlertTrigger', () => {
    it('fires when an open fraud alert exceeds confidence threshold', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ max_confidence: '95', alert_count: '2' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateFraudAlertTrigger();

      expect(result.fired).toBe(true);
      expect(result.current_value).toBe(95);
      expect(result.threshold).toBe(90);
    });

    it('does not fire when no fraud alerts exceed threshold', async () => {
      setupCachedConfigAndNoCooldown();

      mockQuery.mockResolvedValueOnce(mockRows([{ max_confidence: '0', alert_count: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateFraudAlertTrigger();

      expect(result.fired).toBe(false);
      expect(result.current_value).toBe(0);
    });
  });

  // =========================================================================
  // getTriggerConfigurations
  // =========================================================================

  describe('getTriggerConfigurations', () => {
    it('returns cached configurations on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toEqual(DEFAULT_CONFIGS);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries database on cache miss and caches the result', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      const dbRows = [
        { type: 'roas_drop', threshold: '0.8', is_enabled: true, cooldown_minutes: '20', kill_switch_level: '2' },
        { type: 'spend_anomaly', threshold: '3.0', is_enabled: false, cooldown_minutes: '10', kill_switch_level: '3' },
      ];
      mockQuery.mockResolvedValueOnce(mockRows(dbRows));

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toHaveLength(2);
      expect(configs[0].type).toBe('roas_drop');
      expect(configs[0].threshold).toBe(0.8);
      expect(configs[1].is_enabled).toBe(false);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:trigger_configs',
        configs,
        300,
      );
    });

    it('falls back to defaults when DB table is empty', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toEqual(DEFAULT_CONFIGS);
      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:trigger_configs',
        DEFAULT_CONFIGS,
        300,
      );
    });

    it('falls back to defaults when DB query throws', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockRejectedValueOnce(new Error('relation "trigger_configurations" does not exist'));

      const configs = await AutomatedTriggersService.getTriggerConfigurations();

      expect(configs).toEqual(DEFAULT_CONFIGS);
    });
  });

  // =========================================================================
  // updateTriggerConfiguration
  // =========================================================================

  describe('updateTriggerConfiguration', () => {
    it('updates configuration and invalidates cache', async () => {
      const updatedRow = {
        type: 'roas_drop',
        threshold: '0.7',
        is_enabled: true,
        cooldown_minutes: '45',
        kill_switch_level: '2',
      };
      mockQuery.mockResolvedValueOnce(mockRows([updatedRow]));

      const result = await AutomatedTriggersService.updateTriggerConfiguration(
        'roas_drop',
        { threshold: 0.7, cooldown_minutes: 45 },
      );

      expect(result.type).toBe('roas_drop');
      expect(result.threshold).toBe(0.7);
      expect(result.cooldown_minutes).toBe(45);
      expect(mockCacheDel).toHaveBeenCalledWith('killswitch:trigger_configs');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trigger_config_updated',
          resourceType: 'trigger_configuration',
          resourceId: 'roas_drop',
        }),
      );
    });

    it('rejects manual trigger type', async () => {
      await expect(
        AutomatedTriggersService.updateTriggerConfiguration('manual', { threshold: 1 }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid trigger type', async () => {
      await expect(
        AutomatedTriggersService.updateTriggerConfiguration(
          'invalid_type' as any,
          { threshold: 1 },
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // getTriggerHistory
  // =========================================================================

  describe('getTriggerHistory', () => {
    it('returns paginated trigger events with default pagination', async () => {
      const eventRow = {
        id: 'event-1',
        type: 'roas_drop',
        fired: true,
        current_value: '0.5',
        threshold: '1.0',
        details: JSON.stringify({ avg_roas_24h: 0.5 }),
        created_at: '2026-02-25T10:00:00Z',
      };

      mockQuery.mockResolvedValueOnce(mockRows([{ total: '1' }]));
      mockQuery.mockResolvedValueOnce(mockRows([eventRow]));

      const result = await AutomatedTriggersService.getTriggerHistory();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0].type).toBe('roas_drop');
      expect(result.data[0].fired).toBe(true);
      expect(result.data[0].current_value).toBe(0.5);
    });

    it('applies type filter when provided', async () => {
      mockQuery.mockResolvedValueOnce(mockRows([{ total: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      await AutomatedTriggersService.getTriggerHistory({ type: 'cpc_spike' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('type = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['cpc_spike']);
    });

    it('applies date range filters', async () => {
      mockQuery.mockResolvedValueOnce(mockRows([{ total: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      await AutomatedTriggersService.getTriggerHistory({
        startDate: '2026-01-01',
        endDate: '2026-02-25',
      });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('created_at >= $1');
      expect(countSql).toContain('created_at <= $2');
    });
  });

  // =========================================================================
  // registerTriggerEvent
  // =========================================================================

  describe('registerTriggerEvent', () => {
    it('inserts event into trigger_events table', async () => {
      mockQuery.mockResolvedValueOnce(mockRows([]));

      await AutomatedTriggersService.registerTriggerEvent('roas_drop', 0.5, 1.0, true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trigger_events'),
        expect.arrayContaining(['test-uuid-1', 'roas_drop', true, 0.5, 1.0]),
      );
    });

    it('falls back to audit_logs when trigger_events table is unavailable', async () => {
      mockQuery.mockRejectedValueOnce(new Error('relation "trigger_events" does not exist'));

      await AutomatedTriggersService.registerTriggerEvent('roas_drop', 0.5, 1.0, true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trigger_evaluation',
          resourceType: 'trigger_event',
        }),
      );
    });
  });

  // =========================================================================
  // getRecentTriggerEvents
  // =========================================================================

  describe('getRecentTriggerEvents', () => {
    it('returns events from the last N hours', async () => {
      const rows = [
        {
          id: 'evt-1',
          type: 'api_error_storm',
          fired: true,
          current_value: '75',
          threshold: '50',
          details: JSON.stringify({ errors_last_minute: 75 }),
          created_at: '2026-02-25T09:00:00Z',
        },
      ];
      mockQuery.mockResolvedValueOnce(mockRows(rows));

      const events = await AutomatedTriggersService.getRecentTriggerEvents(12);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('api_error_storm');
      expect(events[0].current_value).toBe(75);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 hour' * $1"),
        [12],
      );
    });

    it('defaults to 24 hours when no argument provided', async () => {
      mockQuery.mockResolvedValueOnce(mockRows([]));

      await AutomatedTriggersService.getRecentTriggerEvents();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '1 hour' * $1"),
        [24],
      );
    });
  });

  // =========================================================================
  // Cooldown logic
  // =========================================================================

  describe('cooldown enforcement', () => {
    it('allows trigger to fire when cooldown period has elapsed', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      // Last fired 40 minutes ago, cooldown is 30 minutes → cooldown expired
      mockQuery.mockResolvedValueOnce(mockRows([{ created_at: minutesAgo(40) }]));
      // ROAS query
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '0.3' }]));
      // registerTriggerEvent
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(true);
    });

    it('blocks trigger from firing during cooldown window', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      // Last fired 10 minutes ago, cooldown is 30 minutes → still in cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ created_at: minutesAgo(10) }]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(false);
      expect(result.details).toEqual({ skipped: 'cooldown_active' });
    });

    it('allows evaluation when cooldown check fails (table missing)', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      // Cooldown check throws
      mockQuery.mockRejectedValueOnce(new Error('relation does not exist'));
      // ROAS query
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '0.2' }]));
      // registerTriggerEvent
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const result = await AutomatedTriggersService.evaluateROASTrigger();

      expect(result.fired).toBe(true);
    });
  });

  // =========================================================================
  // evaluateAllTriggers
  // =========================================================================

  describe('evaluateAllTriggers', () => {
    it('returns only fired triggers when some thresholds are breached', async () => {
      // getTriggerConfigurations: cache hit with all enabled
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);

      // --- roas_drop ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS); // getConfigForType
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '0.4' }])); // ROAS query (fires)
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // --- spend_anomaly ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_daily_spend: '100' }])); // baseline
      mockQuery.mockResolvedValueOnce(mockRows([{ today_spend: '120' }]));     // today (ratio 1.2 < 2.0, no fire)
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // --- conversion_failure ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ stalled_count: '0' }])); // no stalled (no fire)
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // --- cpc_spike ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_cpc: '1.0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([{ current_cpc: '1.1' }])); // ratio 1.1 < 1.5 (no fire)
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // --- api_error_storm ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ error_count: '10' }])); // below 50 (no fire)
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // --- fraud_alert ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));       // cooldown
      mockQuery.mockResolvedValueOnce(mockRows([{ max_confidence: '95', alert_count: '1' }])); // fires
      mockQuery.mockResolvedValueOnce(mockRows([]));       // registerTriggerEvent

      // activateKillSwitch INSERT
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const fired = await AutomatedTriggersService.evaluateAllTriggers();

      expect(fired).toHaveLength(2);
      expect(fired.map((t) => t.type)).toContain('roas_drop');
      expect(fired.map((t) => t.type)).toContain('fraud_alert');
    });

    it('returns empty array when no triggers fire', async () => {
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);

      // --- roas_drop ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_roas: '5.0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      // --- spend_anomaly ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_daily_spend: '100' }]));
      mockQuery.mockResolvedValueOnce(mockRows([{ today_spend: '80' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      // --- conversion_failure ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ stalled_count: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      // --- cpc_spike ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ avg_cpc: '1.0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([{ current_cpc: '1.0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      // --- api_error_storm ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ error_count: '5' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      // --- fraud_alert ---
      mockCacheGet.mockResolvedValueOnce(DEFAULT_CONFIGS);
      mockQuery.mockResolvedValueOnce(mockRows([]));
      mockQuery.mockResolvedValueOnce(mockRows([{ max_confidence: '0', alert_count: '0' }]));
      mockQuery.mockResolvedValueOnce(mockRows([]));

      const fired = await AutomatedTriggersService.evaluateAllTriggers();

      expect(fired).toHaveLength(0);
    });

    it('handles errors in individual trigger evaluation gracefully', async () => {
      // Only enable roas_drop, disable the rest
      const partialConfigs: TriggerConfig[] = [
        { type: 'roas_drop', threshold: 1.0, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 2 },
      ];
      mockCacheGet.mockResolvedValueOnce(partialConfigs);

      // roas_drop getConfigForType
      mockCacheGet.mockResolvedValueOnce(partialConfigs);
      // cooldown check throws
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));
      // The ROAS query itself also throws
      mockQuery.mockRejectedValueOnce(new Error('database unavailable'));

      const fired = await AutomatedTriggersService.evaluateAllTriggers();

      // The trigger errored so it should not be marked as fired
      expect(fired).toHaveLength(0);
    });
  });

  // =========================================================================
  // Cache behaviour
  // =========================================================================

  describe('cache behaviour', () => {
    it('caches configurations with 5-minute TTL', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce(mockRows([
        { type: 'roas_drop', threshold: '1.0', is_enabled: true, cooldown_minutes: '30', kill_switch_level: '2' },
      ]));

      await AutomatedTriggersService.getTriggerConfigurations();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'killswitch:trigger_configs',
        expect.any(Array),
        300,
      );
    });

    it('invalidates cache when configuration is updated', async () => {
      const updatedRow = {
        type: 'fraud_alert',
        threshold: '85',
        is_enabled: true,
        cooldown_minutes: '15',
        kill_switch_level: '3',
      };
      mockQuery.mockResolvedValueOnce(mockRows([updatedRow]));

      await AutomatedTriggersService.updateTriggerConfiguration(
        'fraud_alert',
        { threshold: 85, cooldown_minutes: 15 },
      );

      expect(mockCacheDel).toHaveBeenCalledWith('killswitch:trigger_configs');
    });
  });
});

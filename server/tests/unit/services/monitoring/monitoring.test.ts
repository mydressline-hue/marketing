/**
 * Unit tests for MonitoringService.
 *
 * Database pool, Redis cache utilities, logger, generateId, and AuditService
 * are fully mocked so tests exercise only the service logic: spend monitoring,
 * anomaly detection, alert lifecycle, escalation evaluation, and dashboard
 * aggregation.
 */

// ---------------------------------------------------------------------------
// Mocks
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
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('generated-uuid'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { MonitoringService } from '../../../../src/services/monitoring/MonitoringService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { generateId } from '../../../../src/utils/helpers';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockGenerateId.mockReturnValue('generated-uuid');
  });

  // =========================================================================
  // monitorSpend
  // =========================================================================

  describe('monitorSpend', () => {
    it('returns spend summary with velocity and projections for active campaigns', async () => {
      // Summary query (total spend + budget)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '5000', total_budget: '20000' }],
      });
      // Per-campaign anomaly query -- spend within normal range
      // Expected daily = 3000/30 = 100, actual = 150 -> 50% deviation (below 200%)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            campaign_name: 'Campaign Alpha',
            actual_spend: '150',
            budget: '3000',
            campaign_days: '30',
          },
        ],
      });

      const result = await MonitoringService.monitorSpend();

      expect(result.total_spend_today).toBe(5000);
      expect(result.budget_remaining).toBe(15000);
      expect(result.spend_velocity).toBeGreaterThanOrEqual(0);
      expect(result.projected_daily_spend).toBeGreaterThanOrEqual(0);
      expect(result.anomalies).toEqual([]);
      expect(result.checked_at).toBeDefined();
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('returns cached result on cache hit', async () => {
      const cachedResult = {
        total_spend_today: 1000,
        budget_remaining: 9000,
        spend_velocity: 100,
        projected_daily_spend: 2400,
        anomalies: [],
        checked_at: '2026-01-01T00:00:00.000Z',
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await MonitoringService.monitorSpend();

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('flags campaigns with spend exceeding 200% of expected baseline', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '10000', total_budget: '50000' }],
      });
      // Campaign with spend = 1000, budget = 3000, days = 30
      // Expected daily = 100, actual = 1000, deviation = 900% -> anomaly
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c-anomaly',
            campaign_name: 'Overspending Campaign',
            actual_spend: '1000',
            budget: '3000',
            campaign_days: '30',
          },
        ],
      });

      const result = await MonitoringService.monitorSpend();

      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].campaign_id).toBe('c-anomaly');
      expect(result.anomalies[0].severity).toBe('critical');
      expect(result.anomalies[0].deviation_percent).toBeGreaterThan(200);
    });

    it('classifies anomalies as warning when deviation is between 200-400%', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '5000', total_budget: '20000' }],
      });
      // Expected daily = 100, actual = 280, deviation = 180% -> no anomaly at this level
      // Let's make: expected = 100, actual = 350, deviation = 250% -> warning (< 400%)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c-warn',
            campaign_name: 'Warning Campaign',
            actual_spend: '350',
            budget: '3000',
            campaign_days: '30',
          },
        ],
      });

      const result = await MonitoringService.monitorSpend();

      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].severity).toBe('warning');
    });
  });

  // =========================================================================
  // detectCTRAnomaly
  // =========================================================================

  describe('detectCTRAnomaly', () => {
    it('detects CTR deviation exceeding 30% threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_ctr: '2.0',
            avg_ctr: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCTRAnomaly();

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].metric).toBe('ctr');
      expect(anomalies[0].campaign_id).toBe('c1');
      expect(anomalies[0].deviation_percent).toBeGreaterThan(30);
    });

    it('returns empty array when CTR is within acceptable range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_ctr: '4.8',
            avg_ctr: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCTRAnomaly();

      expect(anomalies).toHaveLength(0);
    });

    it('skips campaigns with zero average CTR', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c-new',
            country_id: 'co1',
            current_ctr: '3.0',
            avg_ctr: '0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCTRAnomaly();

      expect(anomalies).toHaveLength(0);
    });

    it('classifies large CTR deviations as critical', async () => {
      // Deviation > 60% (30% * 2) should be critical
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_ctr: '1.0',
            avg_ctr: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCTRAnomaly();

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe('critical');
    });
  });

  // =========================================================================
  // detectCPCAnomaly
  // =========================================================================

  describe('detectCPCAnomaly', () => {
    it('detects CPC exceeding 150% of baseline (50% deviation)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_cpc: '3.0',
            avg_cpc: '1.5',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCPCAnomaly();

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].metric).toBe('cpc');
      expect(anomalies[0].deviation_percent).toBeGreaterThan(50);
    });

    it('returns empty array when CPC is within normal range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_cpc: '1.6',
            avg_cpc: '1.5',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCPCAnomaly();

      expect(anomalies).toHaveLength(0);
    });

    it('skips campaigns with zero average CPC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_cpc: '2.0',
            avg_cpc: '0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectCPCAnomaly();

      expect(anomalies).toHaveLength(0);
    });
  });

  // =========================================================================
  // detectConversionAnomaly
  // =========================================================================

  describe('detectConversionAnomaly', () => {
    it('detects conversion rate drops exceeding 40%', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_conv_rate: '2.0',
            avg_conv_rate: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectConversionAnomaly();

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].metric).toBe('conversion_rate');
      expect(anomalies[0].deviation_percent).toBeGreaterThan(40);
    });

    it('does not flag increases in conversion rate', async () => {
      // Current rate (8.0) is higher than avg (5.0) -- this is good, not an anomaly
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_conv_rate: '8.0',
            avg_conv_rate: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectConversionAnomaly();

      expect(anomalies).toHaveLength(0);
    });

    it('classifies severe conversion drops as critical', async () => {
      // Drop > 80% (40% * 2) should be critical
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            campaign_id: 'c1',
            country_id: 'co1',
            current_conv_rate: '0.5',
            avg_conv_rate: '5.0',
          },
        ],
      });

      const anomalies = await MonitoringService.detectConversionAnomaly();

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe('critical');
    });
  });

  // =========================================================================
  // createAlert
  // =========================================================================

  describe('createAlert', () => {
    const alertInput = {
      config_id: 'config-1',
      metric: 'ctr',
      current_value: 1.5,
      threshold: 3.0,
      severity: 'warning' as const,
      message: 'CTR below threshold',
    };

    it('persists alert and dispatches to configured channels', async () => {
      // INSERT alert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // SELECT alert config for channels
      mockQuery.mockResolvedValueOnce({
        rows: [{ channels: JSON.stringify(['email', 'slack']) }],
      });
      // UPDATE channels_notified
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alert = await MonitoringService.createAlert(alertInput);

      expect(alert.id).toBe('generated-uuid');
      expect(alert.metric).toBe('ctr');
      expect(alert.severity).toBe('warning');
      expect(alert.acknowledged).toBe(false);
      expect(alert.channels_notified).toEqual(['email', 'slack']);
      expect(mockAuditLog).toHaveBeenCalled();
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('creates alert without dispatching when config is not found', async () => {
      // INSERT alert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // SELECT alert config -> empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alert = await MonitoringService.createAlert(alertInput);

      expect(alert.channels_notified).toEqual([]);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'alert.created' }),
      );
    });
  });

  // =========================================================================
  // dispatchAlert
  // =========================================================================

  describe('dispatchAlert', () => {
    const mockAlert = {
      id: 'alert-1',
      config_id: 'config-1',
      metric: 'ctr',
      current_value: 1.5,
      threshold: 3.0,
      severity: 'warning' as const,
      message: 'CTR below threshold',
      channels_notified: [],
      acknowledged: false,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    it('dispatches to email channel and logs audit', async () => {
      await MonitoringService.dispatchAlert(mockAlert, ['email']);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert.dispatched',
          details: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('dispatches to multiple channels', async () => {
      await MonitoringService.dispatchAlert(mockAlert, ['email', 'slack', 'webhook']);

      expect(mockAuditLog).toHaveBeenCalledTimes(3);
    });

    it('logs Slack dispatch with correct payload structure', async () => {
      await MonitoringService.dispatchAlert(mockAlert, ['slack']);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert.dispatched',
          details: expect.objectContaining({ channel: 'slack' }),
        }),
      );
    });
  });

  // =========================================================================
  // acknowledgeAlert
  // =========================================================================

  describe('acknowledgeAlert', () => {
    it('marks an alert as acknowledged by user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'alert-1',
            config_id: 'config-1',
            metric: 'cpc',
            current_value: '2.5',
            threshold: '1.5',
            severity: 'warning',
            message: 'CPC spike',
            channels_notified: '["email"]',
            acknowledged: true,
            acknowledged_by: 'user-1',
            acknowledged_at: '2026-01-01T12:00:00.000Z',
            created_at: '2026-01-01T10:00:00.000Z',
          },
        ],
      });

      const alert = await MonitoringService.acknowledgeAlert('alert-1', 'user-1');

      expect(alert.acknowledged).toBe(true);
      expect(alert.acknowledged_by).toBe('user-1');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'alert.acknowledged' }),
      );
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('throws NotFoundError for non-existent alert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MonitoringService.acknowledgeAlert('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // resolveAlert
  // =========================================================================

  describe('resolveAlert', () => {
    it('resolves an alert with a resolution note', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'alert-1',
            config_id: 'config-1',
            metric: 'spend',
            current_value: '5000',
            threshold: '3000',
            severity: 'critical',
            message: 'Overspend detected',
            channels_notified: '["email","slack"]',
            acknowledged: true,
            acknowledged_by: 'user-1',
            acknowledged_at: '2026-01-01T12:00:00.000Z',
            created_at: '2026-01-01T10:00:00.000Z',
          },
        ],
      });

      const alert = await MonitoringService.resolveAlert(
        'alert-1',
        'user-1',
        'Budget cap adjusted to accommodate seasonal surge',
      );

      expect(alert.acknowledged).toBe(true);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert.resolved',
          details: expect.objectContaining({
            resolution: 'Budget cap adjusted to accommodate seasonal surge',
          }),
        }),
      );
      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('throws NotFoundError when resolving non-existent alert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MonitoringService.resolveAlert('missing-id', 'user-1', 'resolved'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // getActiveAlerts
  // =========================================================================

  describe('getActiveAlerts', () => {
    it('returns paginated unacknowledged alerts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            config_id: 'cfg1',
            metric: 'ctr',
            current_value: '1.5',
            threshold: '3.0',
            severity: 'warning',
            message: 'Low CTR',
            channels_notified: '["email"]',
            acknowledged: false,
            created_at: '2026-01-01T10:00:00.000Z',
          },
          {
            id: 'a2',
            config_id: 'cfg2',
            metric: 'cpc',
            current_value: '4.0',
            threshold: '2.0',
            severity: 'critical',
            message: 'High CPC',
            channels_notified: '["slack"]',
            acknowledged: false,
            created_at: '2026-01-01T11:00:00.000Z',
          },
        ],
      });

      const result = await MonitoringService.getActiveAlerts({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.data[0].acknowledged).toBe(false);
    });

    it('applies severity filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a2',
            config_id: 'cfg2',
            metric: 'cpc',
            current_value: '4.0',
            threshold: '2.0',
            severity: 'critical',
            message: 'High CPC',
            channels_notified: '["slack"]',
            acknowledged: false,
            created_at: '2026-01-01T11:00:00.000Z',
          },
        ],
      });

      const result = await MonitoringService.getActiveAlerts({ severity: 'critical' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].severity).toBe('critical');
      // Verify severity was included in query params
      expect(mockQuery.mock.calls[0][1]).toContain('critical');
    });
  });

  // =========================================================================
  // getAlertHistory
  // =========================================================================

  describe('getAlertHistory', () => {
    it('returns both acknowledged and unacknowledged alerts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            config_id: 'cfg1',
            metric: 'ctr',
            current_value: '1.5',
            threshold: '3.0',
            severity: 'warning',
            message: 'Low CTR',
            channels_notified: '["email"]',
            acknowledged: false,
            created_at: '2026-01-01T10:00:00.000Z',
          },
          {
            id: 'a3',
            config_id: 'cfg1',
            metric: 'ctr',
            current_value: '1.2',
            threshold: '3.0',
            severity: 'warning',
            message: 'Low CTR resolved',
            channels_notified: '["email"]',
            acknowledged: true,
            acknowledged_by: 'user-1',
            acknowledged_at: '2026-01-01T14:00:00.000Z',
            created_at: '2026-01-01T08:00:00.000Z',
          },
        ],
      });

      const result = await MonitoringService.getAlertHistory({ page: 1, limit: 10 });

      expect(result.total).toBe(3);
      // Mix of acknowledged states
      const acknowledgedStates = result.data.map((a) => a.acknowledged);
      expect(acknowledgedStates).toContain(false);
      expect(acknowledgedStates).toContain(true);
    });
  });

  // =========================================================================
  // configureAlert
  // =========================================================================

  describe('configureAlert', () => {
    const alertConfig = {
      id: 'cfg-1',
      name: 'High CPC Alert',
      metric: 'cpc',
      condition: 'above' as const,
      threshold: 2.0,
      channels: ['email', 'slack'] as ('email' | 'slack')[],
      is_enabled: true,
      cooldown_minutes: 30,
    };

    it('creates a new alert configuration', async () => {
      // Check existing -> not found
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const config = await MonitoringService.configureAlert(alertConfig);

      expect(config).toEqual(alertConfig);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'alert_config.created' }),
      );
    });

    it('updates an existing alert configuration', async () => {
      // Check existing -> found
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'cfg-1' }] });
      // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const config = await MonitoringService.configureAlert(alertConfig);

      expect(config).toEqual(alertConfig);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'alert_config.updated' }),
      );
    });

    it('throws ValidationError when name is missing', async () => {
      const invalid = { ...alertConfig, name: '' };

      await expect(
        MonitoringService.configureAlert(invalid),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when metric is missing', async () => {
      const invalid = { ...alertConfig, metric: '' };

      await expect(
        MonitoringService.configureAlert(invalid),
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // evaluateEscalationRules
  // =========================================================================

  describe('evaluateEscalationRules', () => {
    it('triggers escalation when alert count exceeds rule threshold', async () => {
      // Fetch enabled rules
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'Critical Alert Flood',
            condition: 'critical',
            alert_count: 3,
            time_window_minutes: 30,
            escalation_action: 'page_oncall',
            is_enabled: true,
          },
        ],
      });
      // Count matching alerts -> 5 (exceeds threshold of 3)
      mockQuery.mockResolvedValueOnce({ rows: [{ alert_count: '5' }] });

      // createAlert internals:
      // INSERT alert
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // SELECT alert config for channels
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const escalated = await MonitoringService.evaluateEscalationRules();

      expect(escalated).toHaveLength(1);
      expect(escalated[0].severity).toBe('critical');
      expect(escalated[0].metric).toBe('escalation');
      expect(escalated[0].message).toContain('Critical Alert Flood');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'escalation.triggered' }),
      );
    });

    it('does not escalate when alert count is below threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'Critical Alert Flood',
            condition: 'critical',
            alert_count: 3,
            time_window_minutes: 30,
            escalation_action: 'page_oncall',
            is_enabled: true,
          },
        ],
      });
      // Count -> only 1, below threshold of 3
      mockQuery.mockResolvedValueOnce({ rows: [{ alert_count: '1' }] });

      const escalated = await MonitoringService.evaluateEscalationRules();

      expect(escalated).toHaveLength(0);
    });

    it('returns empty array when no escalation rules are enabled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const escalated = await MonitoringService.evaluateEscalationRules();

      expect(escalated).toHaveLength(0);
    });
  });

  // =========================================================================
  // getMonitoringDashboard
  // =========================================================================

  describe('getMonitoringDashboard', () => {
    it('returns cached dashboard on cache hit', async () => {
      const cachedDashboard = {
        spend: {
          total_spend_today: 5000,
          budget_remaining: 15000,
          spend_velocity: 200,
          projected_daily_spend: 4800,
          anomalies: [],
          checked_at: '2026-01-01T12:00:00.000Z',
        },
        active_alerts_count: 2,
        anomaly_counts: { ctr: 1, cpc: 0, conversion_rate: 0, spend: 1 },
        system_health: 'degraded',
        generated_at: '2026-01-01T12:00:00.000Z',
      };
      // First cacheGet for dashboard
      mockCacheGet.mockResolvedValueOnce(cachedDashboard);

      const dashboard = await MonitoringService.getMonitoringDashboard();

      expect(dashboard).toEqual(cachedDashboard);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('generates fresh dashboard with correct system health status', async () => {
      // Dashboard cache miss (null returned by default from beforeEach)

      // monitorSpend inner calls:
      //   spend cache miss (null - already set in beforeEach)
      //   -- but cacheGet is called again inside monitorSpend, need to mock it
      mockCacheGet.mockResolvedValueOnce(null); // dashboard cache miss
      mockCacheGet.mockResolvedValueOnce(null); // spend cache miss

      // monitorSpend: summary query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '3000', total_budget: '10000' }],
      });
      // monitorSpend: campaign anomaly query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // active alerts count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // anomaly counts by metric
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // critical alerts count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const dashboard = await MonitoringService.getMonitoringDashboard();

      expect(dashboard.system_health).toBe('healthy');
      expect(dashboard.active_alerts_count).toBe(0);
      expect(dashboard.spend.total_spend_today).toBe(3000);
      expect(dashboard.generated_at).toBeDefined();
      // Dashboard should be cached
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('reports critical health when critical alerts exist', async () => {
      mockCacheGet.mockResolvedValueOnce(null); // dashboard cache miss
      mockCacheGet.mockResolvedValueOnce(null); // spend cache miss

      // monitorSpend queries
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '5000', total_budget: '10000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // active alerts count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // anomaly counts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { metric: 'ctr', count: '2' },
          { metric: 'spend', count: '1' },
        ],
      });
      // critical alerts count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const dashboard = await MonitoringService.getMonitoringDashboard();

      expect(dashboard.system_health).toBe('critical');
      expect(dashboard.active_alerts_count).toBe(3);
      expect(dashboard.anomaly_counts.ctr).toBe(2);
      expect(dashboard.anomaly_counts.spend).toBe(1);
    });
  });

  // =========================================================================
  // Cache behavior
  // =========================================================================

  describe('cache behavior', () => {
    it('invalidates dashboard cache on alert acknowledgment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            config_id: 'cfg1',
            metric: 'ctr',
            current_value: '1.5',
            threshold: '3.0',
            severity: 'warning',
            message: 'Low CTR',
            channels_notified: '["email"]',
            acknowledged: true,
            acknowledged_by: 'user-1',
            acknowledged_at: '2026-01-01T12:00:00.000Z',
            created_at: '2026-01-01T10:00:00.000Z',
          },
        ],
      });

      await MonitoringService.acknowledgeAlert('a1', 'user-1');

      expect(mockCacheDel).toHaveBeenCalledWith('monitoring:dashboard');
    });

    it('invalidates dashboard cache on alert resolution', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            config_id: 'cfg1',
            metric: 'spend',
            current_value: '5000',
            threshold: '3000',
            severity: 'critical',
            message: 'Overspend',
            channels_notified: '["email"]',
            acknowledged: true,
            acknowledged_by: 'user-1',
            acknowledged_at: '2026-01-01T12:00:00.000Z',
            created_at: '2026-01-01T10:00:00.000Z',
          },
        ],
      });

      await MonitoringService.resolveAlert('a1', 'user-1', 'Fixed');

      expect(mockCacheDel).toHaveBeenCalledWith('monitoring:dashboard');
    });

    it('caches spend monitoring results with TTL', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend_today: '1000', total_budget: '5000' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await MonitoringService.monitorSpend();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'monitoring:spend',
        expect.objectContaining({ total_spend_today: 1000 }),
        30,
      );
    });
  });
});

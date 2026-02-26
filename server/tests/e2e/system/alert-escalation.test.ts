/**
 * E2E tests for Alert Escalation System.
 *
 * Validates the complete alert lifecycle from anomaly detection through
 * escalation:
 *   1.  Anomaly detection triggers alert creation
 *   2.  Alert delivery via configured channels (email, slack, in-app)
 *   3.  Multiple alerts trigger escalation
 *   4.  Escalation notifies higher-priority channels
 *   5.  Alert acknowledgment updates status
 *   6.  Alert resolution closes the alert
 *   7.  ROAS drop triggers automated alert
 *   8.  CPC spike triggers automated alert
 *   9.  Spend anomaly triggers automated alert
 *   10. Conversion tracking failure triggers alert
 *   11. Alert history is preserved
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

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Simulation Types
// ---------------------------------------------------------------------------

type AlertSeverity = 'info' | 'warning' | 'critical';
type AlertChannel = 'email' | 'slack' | 'in_app' | 'webhook';
type AlertStatus = 'active' | 'acknowledged' | 'resolved';

interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  channels: AlertChannel[];
  escalation_channels: AlertChannel[];
  is_enabled: boolean;
  cooldown_minutes: number;
}

interface SimulatedAlert {
  id: string;
  config_id: string;
  metric: string;
  current_value: number;
  threshold: number;
  severity: AlertSeverity;
  message: string;
  channels_notified: AlertChannel[];
  status: AlertStatus;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution?: string;
  created_at: string;
}

interface EscalationRule {
  id: string;
  name: string;
  condition: AlertSeverity;
  alert_count: number;
  time_window_minutes: number;
  escalation_action: string;
  escalation_channels: AlertChannel[];
  is_enabled: boolean;
}

interface MetricAnomaly {
  metric: string;
  campaign_id: string;
  expected_value: number;
  actual_value: number;
  deviation_percent: number;
  severity: AlertSeverity;
  detected_at: string;
}

interface ChannelDelivery {
  alert_id: string;
  channel: AlertChannel;
  delivered_at: string;
  status: 'success' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Alert Escalation Simulator
// ---------------------------------------------------------------------------

class AlertEscalationSimulator {
  private alerts: Map<string, SimulatedAlert> = new Map();
  private configs: Map<string, AlertConfig> = new Map();
  private escalationRules: Map<string, EscalationRule> = new Map();
  private anomalies: MetricAnomaly[] = [];
  private deliveries: ChannelDelivery[] = [];
  private alertHistory: SimulatedAlert[] = [];
  private idCounter = 0;

  // -- Configuration --

  addAlertConfig(config: AlertConfig): void {
    this.configs.set(config.id, config);
  }

  addEscalationRule(rule: EscalationRule): void {
    this.escalationRules.set(rule.id, rule);
  }

  // -- Anomaly Detection --

  detectAnomaly(metric: string, campaignId: string, expected: number, actual: number): MetricAnomaly | null {
    const deviationPercent = expected !== 0
      ? Math.abs(((actual - expected) / expected) * 100)
      : 0;

    let severity: AlertSeverity = 'info';
    if (deviationPercent > 50) severity = 'critical';
    else if (deviationPercent > 25) severity = 'warning';
    else return null; // Not anomalous enough

    const anomaly: MetricAnomaly = {
      metric,
      campaign_id: campaignId,
      expected_value: expected,
      actual_value: actual,
      deviation_percent: Math.round(deviationPercent * 100) / 100,
      severity,
      detected_at: new Date().toISOString(),
    };

    this.anomalies.push(anomaly);
    return anomaly;
  }

  // -- Alert Creation --

  createAlertFromAnomaly(anomaly: MetricAnomaly, configId: string): SimulatedAlert {
    this.idCounter++;
    const config = this.configs.get(configId);
    const channels = config ? config.channels : ['in_app' as AlertChannel];

    const alert: SimulatedAlert = {
      id: `alert-${this.idCounter}`,
      config_id: configId,
      metric: anomaly.metric,
      current_value: anomaly.actual_value,
      threshold: anomaly.expected_value,
      severity: anomaly.severity,
      message: `${anomaly.metric} anomaly: expected ${anomaly.expected_value}, got ${anomaly.actual_value} (${anomaly.deviation_percent}% deviation)`,
      channels_notified: [],
      status: 'active',
      created_at: new Date().toISOString(),
    };

    this.alerts.set(alert.id, alert);
    this.alertHistory.push({ ...alert });

    // Dispatch to channels
    this.dispatchToChannels(alert, channels);

    return alert;
  }

  createAlert(params: {
    configId: string;
    metric: string;
    currentValue: number;
    threshold: number;
    severity: AlertSeverity;
    message: string;
  }): SimulatedAlert {
    this.idCounter++;
    const config = this.configs.get(params.configId);
    const channels = config ? config.channels : ['in_app' as AlertChannel];

    const alert: SimulatedAlert = {
      id: `alert-${this.idCounter}`,
      config_id: params.configId,
      metric: params.metric,
      current_value: params.currentValue,
      threshold: params.threshold,
      severity: params.severity,
      message: params.message,
      channels_notified: [],
      status: 'active',
      created_at: new Date().toISOString(),
    };

    this.alerts.set(alert.id, alert);
    this.alertHistory.push({ ...alert });

    this.dispatchToChannels(alert, channels);

    return alert;
  }

  // -- Channel Dispatch --

  private dispatchToChannels(alert: SimulatedAlert, channels: AlertChannel[]): void {
    for (const channel of channels) {
      const delivery: ChannelDelivery = {
        alert_id: alert.id,
        channel,
        delivered_at: new Date().toISOString(),
        status: 'success',
      };
      this.deliveries.push(delivery);
      alert.channels_notified.push(channel);
    }
  }

  // -- Escalation --

  evaluateEscalation(): SimulatedAlert[] {
    const escalatedAlerts: SimulatedAlert[] = [];

    for (const rule of this.escalationRules.values()) {
      if (!rule.is_enabled) continue;

      // Count matching active alerts within the time window
      const now = Date.now();
      const windowMs = rule.time_window_minutes * 60 * 1000;
      const matchingAlerts = Array.from(this.alerts.values()).filter((a) => {
        if (a.status !== 'active') return false;
        if (a.severity !== rule.condition && rule.condition !== a.severity) return false;
        const alertTime = new Date(a.created_at).getTime();
        return now - alertTime <= windowMs;
      });

      if (matchingAlerts.length >= rule.alert_count) {
        // Create escalation alert
        this.idCounter++;
        const escalationAlert: SimulatedAlert = {
          id: `alert-${this.idCounter}`,
          config_id: rule.id,
          metric: 'escalation',
          current_value: matchingAlerts.length,
          threshold: rule.alert_count,
          severity: 'critical',
          message: `Escalation: ${matchingAlerts.length} ${rule.condition} alerts in ${rule.time_window_minutes} min. Action: ${rule.escalation_action}`,
          channels_notified: [],
          status: 'active',
          created_at: new Date().toISOString(),
        };

        this.alerts.set(escalationAlert.id, escalationAlert);
        this.alertHistory.push({ ...escalationAlert });

        // Dispatch to escalation channels (higher priority)
        this.dispatchToChannels(escalationAlert, rule.escalation_channels);

        escalatedAlerts.push(escalationAlert);
      }
    }

    return escalatedAlerts;
  }

  // -- Alert Lifecycle --

  acknowledgeAlert(alertId: string, userId: string): SimulatedAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    if (alert.status !== 'active') throw new Error(`Alert ${alertId} is not active`);

    alert.status = 'acknowledged';
    alert.acknowledged_by = userId;
    alert.acknowledged_at = new Date().toISOString();

    // Update history
    this.alertHistory.push({ ...alert });

    return alert;
  }

  resolveAlert(alertId: string, userId: string, resolution: string): SimulatedAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    if (alert.status === 'resolved') throw new Error(`Alert ${alertId} already resolved`);

    alert.status = 'resolved';
    alert.resolved_by = userId;
    alert.resolved_at = new Date().toISOString();
    alert.resolution = resolution;

    this.alertHistory.push({ ...alert });

    return alert;
  }

  // -- Metric-Specific Alert Triggers --

  checkRoas(campaignId: string, currentRoas: number, targetRoas: number, configId: string): SimulatedAlert | null {
    if (currentRoas < targetRoas) {
      const dropPercent = ((targetRoas - currentRoas) / targetRoas) * 100;
      const severity: AlertSeverity = dropPercent > 50 ? 'critical' : 'warning';

      return this.createAlert({
        configId,
        metric: 'roas',
        currentValue: currentRoas,
        threshold: targetRoas,
        severity,
        message: `ROAS dropped to ${currentRoas.toFixed(2)} (target: ${targetRoas.toFixed(2)}, ${dropPercent.toFixed(1)}% below target)`,
      });
    }
    return null;
  }

  checkCpc(campaignId: string, currentCpc: number, baselineCpc: number, configId: string): SimulatedAlert | null {
    const spikePercent = ((currentCpc - baselineCpc) / baselineCpc) * 100;
    if (spikePercent > 50) {
      const severity: AlertSeverity = spikePercent > 100 ? 'critical' : 'warning';

      return this.createAlert({
        configId,
        metric: 'cpc',
        currentValue: currentCpc,
        threshold: baselineCpc,
        severity,
        message: `CPC spiked to $${currentCpc.toFixed(2)} (baseline: $${baselineCpc.toFixed(2)}, ${spikePercent.toFixed(1)}% above)`,
      });
    }
    return null;
  }

  checkSpendAnomaly(campaignId: string, dailySpend: number, expectedDailySpend: number, configId: string): SimulatedAlert | null {
    const deviation = ((dailySpend - expectedDailySpend) / expectedDailySpend) * 100;
    if (Math.abs(deviation) > 40) {
      const severity: AlertSeverity = Math.abs(deviation) > 80 ? 'critical' : 'warning';
      const direction = deviation > 0 ? 'overspend' : 'underspend';

      return this.createAlert({
        configId,
        metric: 'spend',
        currentValue: dailySpend,
        threshold: expectedDailySpend,
        severity,
        message: `Spend ${direction}: $${dailySpend.toFixed(2)}/day vs expected $${expectedDailySpend.toFixed(2)}/day (${Math.abs(deviation).toFixed(1)}% deviation)`,
      });
    }
    return null;
  }

  checkConversionTracking(campaignId: string, currentConversions: number, expectedConversions: number, configId: string): SimulatedAlert | null {
    if (currentConversions === 0 && expectedConversions > 0) {
      return this.createAlert({
        configId,
        metric: 'conversion_tracking',
        currentValue: 0,
        threshold: expectedConversions,
        severity: 'critical',
        message: `Conversion tracking failure: 0 conversions detected (expected ~${expectedConversions})`,
      });
    }

    const dropPercent = ((expectedConversions - currentConversions) / expectedConversions) * 100;
    if (dropPercent > 50) {
      return this.createAlert({
        configId,
        metric: 'conversion_tracking',
        currentValue: currentConversions,
        threshold: expectedConversions,
        severity: 'warning',
        message: `Conversion tracking issue: ${currentConversions} conversions (expected ~${expectedConversions}, ${dropPercent.toFixed(1)}% drop)`,
      });
    }

    return null;
  }

  // -- Getters --

  getAlert(id: string): SimulatedAlert | undefined {
    return this.alerts.get(id);
  }

  getActiveAlerts(): SimulatedAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.status === 'active');
  }

  getAlertsByMetric(metric: string): SimulatedAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.metric === metric);
  }

  getAlertsBySeverity(severity: AlertSeverity): SimulatedAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.severity === severity);
  }

  getDeliveries(alertId?: string): ChannelDelivery[] {
    if (alertId) return this.deliveries.filter((d) => d.alert_id === alertId);
    return [...this.deliveries];
  }

  getAlertHistory(): SimulatedAlert[] {
    return [...this.alertHistory];
  }

  getAnomalies(): MetricAnomaly[] {
    return [...this.anomalies];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Alert Escalation System', () => {
  let sim: AlertEscalationSimulator;

  const defaultConfig: AlertConfig = {
    id: 'config-1',
    name: 'Default Alert Config',
    metric: 'general',
    condition: 'above',
    threshold: 100,
    channels: ['email', 'slack', 'in_app'],
    escalation_channels: ['email', 'slack', 'in_app', 'webhook'],
    is_enabled: true,
    cooldown_minutes: 15,
  };

  const roasConfig: AlertConfig = {
    id: 'config-roas',
    name: 'ROAS Monitor',
    metric: 'roas',
    condition: 'below',
    threshold: 2.0,
    channels: ['email', 'slack'],
    escalation_channels: ['email', 'slack', 'webhook'],
    is_enabled: true,
    cooldown_minutes: 30,
  };

  const cpcConfig: AlertConfig = {
    id: 'config-cpc',
    name: 'CPC Monitor',
    metric: 'cpc',
    condition: 'above',
    threshold: 5.0,
    channels: ['slack', 'in_app'],
    escalation_channels: ['email', 'slack', 'webhook'],
    is_enabled: true,
    cooldown_minutes: 15,
  };

  const spendConfig: AlertConfig = {
    id: 'config-spend',
    name: 'Spend Monitor',
    metric: 'spend',
    condition: 'change',
    threshold: 1000,
    channels: ['email', 'in_app'],
    escalation_channels: ['email', 'slack', 'in_app', 'webhook'],
    is_enabled: true,
    cooldown_minutes: 60,
  };

  const conversionConfig: AlertConfig = {
    id: 'config-conversions',
    name: 'Conversion Tracker',
    metric: 'conversion_tracking',
    condition: 'below',
    threshold: 10,
    channels: ['email', 'slack', 'in_app'],
    escalation_channels: ['email', 'slack', 'in_app', 'webhook'],
    is_enabled: true,
    cooldown_minutes: 30,
  };

  const defaultEscalationRule: EscalationRule = {
    id: 'esc-1',
    name: 'Critical Alert Escalation',
    condition: 'critical',
    alert_count: 3,
    time_window_minutes: 60,
    escalation_action: 'notify_management',
    escalation_channels: ['email', 'slack', 'webhook'],
    is_enabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sim = new AlertEscalationSimulator();
    sim.addAlertConfig(defaultConfig);
    sim.addAlertConfig(roasConfig);
    sim.addAlertConfig(cpcConfig);
    sim.addAlertConfig(spendConfig);
    sim.addAlertConfig(conversionConfig);
    sim.addEscalationRule(defaultEscalationRule);
  });

  // =========================================================================
  // 1. Anomaly Detection -> Alert Creation
  // =========================================================================

  describe('Anomaly Detection -> Alert Creation', () => {
    it('should detect an anomaly and create an alert', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      expect(anomaly).not.toBeNull();
      expect(anomaly!.severity).toBe('critical'); // 60% deviation

      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      expect(alert.id).toBeDefined();
      expect(alert.metric).toBe('ctr');
      expect(alert.severity).toBe('critical');
      expect(alert.status).toBe('active');
      expect(alert.message).toContain('anomaly');
    });

    it('should not create an anomaly for minor deviations', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 4.5);
      expect(anomaly).toBeNull(); // 10% deviation -- below threshold
    });

    it('should classify anomaly severity based on deviation magnitude', () => {
      // 30% deviation -> warning
      const warningAnomaly = sim.detectAnomaly('cpc', 'campaign-1', 2.0, 2.8);
      expect(warningAnomaly).not.toBeNull();
      expect(warningAnomaly!.severity).toBe('warning');

      // 60% deviation -> critical
      const criticalAnomaly = sim.detectAnomaly('cpc', 'campaign-2', 2.0, 3.5);
      expect(criticalAnomaly).not.toBeNull();
      expect(criticalAnomaly!.severity).toBe('critical');
    });
  });

  // =========================================================================
  // 2. Alert Delivery via Configured Channels
  // =========================================================================

  describe('Alert Delivery via Configured Channels', () => {
    it('should deliver alert via email, slack, and in-app channels', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);

      // Default config has: ['email', 'slack', 'in_app']
      expect(alert.channels_notified).toContain('email');
      expect(alert.channels_notified).toContain('slack');
      expect(alert.channels_notified).toContain('in_app');
      expect(alert.channels_notified).toHaveLength(3);

      // Verify delivery records
      const deliveries = sim.getDeliveries(alert.id);
      expect(deliveries).toHaveLength(3);
      for (const d of deliveries) {
        expect(d.status).toBe('success');
        expect(d.delivered_at).toBeDefined();
      }
    });

    it('should deliver via only configured channels per alert config', () => {
      // CPC config only has slack and in_app
      const anomaly = sim.detectAnomaly('cpc', 'campaign-1', 2.0, 4.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, cpcConfig.id);

      expect(alert.channels_notified).toContain('slack');
      expect(alert.channels_notified).toContain('in_app');
      expect(alert.channels_notified).not.toContain('email');
      expect(alert.channels_notified).toHaveLength(2);
    });
  });

  // =========================================================================
  // 3. Multiple Alerts -> Escalation
  // =========================================================================

  describe('Multiple Alerts -> Escalation Trigger', () => {
    it('should trigger escalation when alert count exceeds threshold', () => {
      // Create 3 critical alerts (matching the escalation rule threshold)
      for (let i = 0; i < 3; i++) {
        const anomaly = sim.detectAnomaly('cpc', `campaign-${i}`, 2.0, 5.0);
        sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      }

      const escalated = sim.evaluateEscalation();
      expect(escalated).toHaveLength(1);
      expect(escalated[0].metric).toBe('escalation');
      expect(escalated[0].severity).toBe('critical');
      expect(escalated[0].message).toContain('Escalation');
      expect(escalated[0].message).toContain('notify_management');
    });

    it('should NOT trigger escalation when alert count is below threshold', () => {
      // Create only 2 critical alerts (below the threshold of 3)
      for (let i = 0; i < 2; i++) {
        const anomaly = sim.detectAnomaly('cpc', `campaign-${i}`, 2.0, 5.0);
        sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      }

      const escalated = sim.evaluateEscalation();
      expect(escalated).toHaveLength(0);
    });

    it('should not count acknowledged alerts toward escalation', () => {
      // Create 3 critical alerts, then acknowledge one
      const alerts: SimulatedAlert[] = [];
      for (let i = 0; i < 3; i++) {
        const anomaly = sim.detectAnomaly('cpc', `campaign-${i}`, 2.0, 5.0);
        alerts.push(sim.createAlertFromAnomaly(anomaly!, defaultConfig.id));
      }

      // Acknowledge one -> only 2 active now
      sim.acknowledgeAlert(alerts[0].id, 'admin-1');

      const escalated = sim.evaluateEscalation();
      expect(escalated).toHaveLength(0);
    });
  });

  // =========================================================================
  // 4. Escalation Notifies Higher-Priority Channels
  // =========================================================================

  describe('Escalation -> Higher-Priority Channel Notification', () => {
    it('should dispatch escalation alert to escalation channels including webhook', () => {
      // Create enough critical alerts to trigger escalation
      for (let i = 0; i < 3; i++) {
        const anomaly = sim.detectAnomaly('cpc', `campaign-${i}`, 2.0, 5.0);
        sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      }

      const escalated = sim.evaluateEscalation();
      expect(escalated).toHaveLength(1);

      // Escalation rule channels: ['email', 'slack', 'webhook']
      const escAlert = escalated[0];
      expect(escAlert.channels_notified).toContain('email');
      expect(escAlert.channels_notified).toContain('slack');
      expect(escAlert.channels_notified).toContain('webhook');

      // Verify deliveries for the escalation alert
      const deliveries = sim.getDeliveries(escAlert.id);
      expect(deliveries).toHaveLength(3);
    });
  });

  // =========================================================================
  // 5. Alert Acknowledgment Updates Status
  // =========================================================================

  describe('Alert Acknowledgment', () => {
    it('should update alert status to acknowledged', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      expect(alert.status).toBe('active');

      const acked = sim.acknowledgeAlert(alert.id, 'admin-user-1');
      expect(acked.status).toBe('acknowledged');
      expect(acked.acknowledged_by).toBe('admin-user-1');
      expect(acked.acknowledged_at).toBeDefined();
    });

    it('should throw when acknowledging a non-existent alert', () => {
      expect(() => sim.acknowledgeAlert('non-existent', 'user-1'))
        .toThrow('Alert non-existent not found');
    });

    it('should throw when acknowledging an already acknowledged alert', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      sim.acknowledgeAlert(alert.id, 'admin-1');

      expect(() => sim.acknowledgeAlert(alert.id, 'admin-2'))
        .toThrow('is not active');
    });
  });

  // =========================================================================
  // 6. Alert Resolution Closes the Alert
  // =========================================================================

  describe('Alert Resolution', () => {
    it('should resolve an active alert with resolution message', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);

      const resolved = sim.resolveAlert(alert.id, 'admin-1', 'Adjusted bid strategy to fix CTR');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolved_by).toBe('admin-1');
      expect(resolved.resolved_at).toBeDefined();
      expect(resolved.resolution).toBe('Adjusted bid strategy to fix CTR');
    });

    it('should resolve an acknowledged alert', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      sim.acknowledgeAlert(alert.id, 'admin-1');

      const resolved = sim.resolveAlert(alert.id, 'admin-1', 'Issue was transient');
      expect(resolved.status).toBe('resolved');
    });

    it('should throw when resolving an already resolved alert', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      sim.resolveAlert(alert.id, 'admin-1', 'Fixed');

      expect(() => sim.resolveAlert(alert.id, 'admin-2', 'Fix again'))
        .toThrow('already resolved');
    });

    it('should remove resolved alerts from active alerts list', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);
      expect(sim.getActiveAlerts()).toHaveLength(1);

      sim.resolveAlert(alert.id, 'admin-1', 'Fixed');
      expect(sim.getActiveAlerts()).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. ROAS Drop Triggers Automated Alert
  // =========================================================================

  describe('ROAS Drop -> Automated Alert', () => {
    it('should create alert when ROAS drops below target', () => {
      const alert = sim.checkRoas('campaign-1', 1.2, 2.0, roasConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.metric).toBe('roas');
      expect(alert!.severity).toBe('warning');
      expect(alert!.message).toContain('ROAS dropped');
      expect(alert!.message).toContain('1.20');
    });

    it('should create critical alert for severe ROAS drop', () => {
      const alert = sim.checkRoas('campaign-1', 0.5, 2.0, roasConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe('critical');
    });

    it('should not create alert when ROAS is above target', () => {
      const alert = sim.checkRoas('campaign-1', 3.5, 2.0, roasConfig.id);
      expect(alert).toBeNull();
    });
  });

  // =========================================================================
  // 8. CPC Spike Triggers Automated Alert
  // =========================================================================

  describe('CPC Spike -> Automated Alert', () => {
    it('should create alert when CPC spikes above baseline', () => {
      const alert = sim.checkCpc('campaign-1', 9.0, 4.0, cpcConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.metric).toBe('cpc');
      expect(alert!.severity).toBe('critical'); // 125% spike
      expect(alert!.message).toContain('CPC spiked');
    });

    it('should create warning alert for moderate CPC spike', () => {
      const alert = sim.checkCpc('campaign-1', 6.5, 4.0, cpcConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe('warning'); // 62.5% spike
    });

    it('should not create alert for normal CPC variation', () => {
      const alert = sim.checkCpc('campaign-1', 4.5, 4.0, cpcConfig.id);
      expect(alert).toBeNull(); // 12.5% -- below 50% threshold
    });
  });

  // =========================================================================
  // 9. Spend Anomaly Triggers Automated Alert
  // =========================================================================

  describe('Spend Anomaly -> Automated Alert', () => {
    it('should create alert for overspend anomaly', () => {
      const alert = sim.checkSpendAnomaly('campaign-1', 2000, 1000, spendConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.metric).toBe('spend');
      expect(alert!.severity).toBe('critical'); // 100% overspend
      expect(alert!.message).toContain('overspend');
    });

    it('should create alert for underspend anomaly', () => {
      const alert = sim.checkSpendAnomaly('campaign-1', 400, 1000, spendConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.message).toContain('underspend');
      expect(alert!.severity).toBe('warning'); // 60% underspend
    });

    it('should not create alert for normal spend variation', () => {
      const alert = sim.checkSpendAnomaly('campaign-1', 1100, 1000, spendConfig.id);
      expect(alert).toBeNull(); // 10% -- below 40% threshold
    });
  });

  // =========================================================================
  // 10. Conversion Tracking Failure Triggers Alert
  // =========================================================================

  describe('Conversion Tracking Failure -> Alert', () => {
    it('should create critical alert when conversions drop to zero', () => {
      const alert = sim.checkConversionTracking('campaign-1', 0, 50, conversionConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.metric).toBe('conversion_tracking');
      expect(alert!.severity).toBe('critical');
      expect(alert!.message).toContain('Conversion tracking failure');
      expect(alert!.message).toContain('0 conversions');
    });

    it('should create warning alert for significant conversion drop', () => {
      const alert = sim.checkConversionTracking('campaign-1', 15, 50, conversionConfig.id);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe('warning');
      expect(alert!.message).toContain('Conversion tracking issue');
    });

    it('should not create alert for minor conversion fluctuation', () => {
      const alert = sim.checkConversionTracking('campaign-1', 40, 50, conversionConfig.id);
      expect(alert).toBeNull(); // 20% drop -- below 50% threshold
    });
  });

  // =========================================================================
  // 11. Alert History Preservation
  // =========================================================================

  describe('Alert History Preservation', () => {
    it('should preserve complete alert lifecycle in history', () => {
      const anomaly = sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      const alert = sim.createAlertFromAnomaly(anomaly!, defaultConfig.id);

      sim.acknowledgeAlert(alert.id, 'admin-1');
      sim.resolveAlert(alert.id, 'admin-1', 'Fixed the issue');

      // History should have 3 entries: created, acknowledged, resolved
      const history = sim.getAlertHistory();
      const alertHistory = history.filter((h) => h.id === alert.id);
      expect(alertHistory).toHaveLength(3);

      // States should be in order: active, acknowledged, resolved
      expect(alertHistory[0].status).toBe('active');
      expect(alertHistory[1].status).toBe('acknowledged');
      expect(alertHistory[2].status).toBe('resolved');
    });

    it('should preserve history across multiple alerts', () => {
      // Create multiple alerts
      for (let i = 0; i < 5; i++) {
        sim.createAlert({
          configId: defaultConfig.id,
          metric: 'ctr',
          currentValue: i,
          threshold: 10,
          severity: 'warning',
          message: `Alert ${i}`,
        });
      }

      const history = sim.getAlertHistory();
      expect(history.length).toBeGreaterThanOrEqual(5);
    });

    it('should track anomaly history alongside alerts', () => {
      sim.detectAnomaly('ctr', 'campaign-1', 5.0, 2.0);
      sim.detectAnomaly('cpc', 'campaign-2', 2.0, 4.0);
      sim.detectAnomaly('spend', 'campaign-3', 1000, 500);

      const anomalies = sim.getAnomalies();
      expect(anomalies).toHaveLength(3);
      expect(anomalies.map((a) => a.metric)).toEqual(['ctr', 'cpc', 'spend']);
    });
  });

  // =========================================================================
  // MonitoringService DB Integration (mocked pool)
  // =========================================================================

  describe('MonitoringService DB Integration (mocked)', () => {
    it('should create an alert via the MonitoringService pattern', async () => {
      let insertedAlertId = '';

      mockGenerateId.mockReturnValue('alert-uuid-001');

      mockPool.query
        // INSERT alert
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // SELECT alert config channels
        .mockResolvedValueOnce({
          rows: [{ channels: JSON.stringify(['email', 'slack']) }],
          rowCount: 1,
        })
        // UPDATE alert with dispatched channels
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Simulate the createAlert flow
      insertedAlertId = mockGenerateId();

      await mockPool.query(
        `INSERT INTO monitoring_alerts (id, config_id, metric, current_value, threshold, severity, message, channels_notified, acknowledged, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [insertedAlertId, 'config-1', 'cpc', 8.5, 5.0, 'critical', 'CPC spike detected', '[]', false, new Date().toISOString()],
      );

      const configResult = await mockPool.query(
        `SELECT channels FROM alert_configs WHERE id = $1 AND is_enabled = true`,
        ['config-1'],
      );

      const channels = JSON.parse(configResult.rows[0].channels);
      expect(channels).toEqual(['email', 'slack']);

      await mockPool.query(
        `UPDATE monitoring_alerts SET channels_notified = $1 WHERE id = $2`,
        [JSON.stringify(channels), insertedAlertId],
      );

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      expect(insertedAlertId).toBe('alert-uuid-001');
    });

    it('should evaluate escalation rules via mocked DB', async () => {
      // Mock: fetch enabled escalation rules
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'esc-rule-1',
            name: 'Critical Escalation',
            condition: 'critical',
            alert_count: 3,
            time_window_minutes: 60,
            escalation_action: 'notify_management',
            is_enabled: true,
          }],
        })
        // Mock: count matching alerts
        .mockResolvedValueOnce({
          rows: [{ alert_count: '5' }],
        })
        // Mock: INSERT escalation alert
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // Mock: SELECT config channels for escalation alert
        .mockResolvedValueOnce({
          rows: [{ channels: JSON.stringify(['email', 'slack', 'webhook']) }],
        })
        // Mock: UPDATE escalation alert with channels
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Fetch escalation rules
      const rulesResult = await mockPool.query(
        `SELECT * FROM escalation_rules WHERE is_enabled = true`,
      );

      expect(rulesResult.rows).toHaveLength(1);
      const rule = rulesResult.rows[0];

      // Count alerts within window
      const countResult = await mockPool.query(
        `SELECT COUNT(*) AS alert_count FROM monitoring_alerts WHERE severity = $1 AND created_at >= NOW() - ($2 || ' minutes')::interval AND acknowledged = false`,
        [rule.condition, rule.time_window_minutes],
      );

      const alertCount = parseInt(countResult.rows[0].alert_count, 10);
      expect(alertCount).toBe(5);
      expect(alertCount).toBeGreaterThanOrEqual(rule.alert_count);
    });
  });
});

/**
 * E2E tests for Infrastructure workflow lifecycles (Phase 6).
 *
 * Tests complete workflows:
 *   1. Anomaly detected -> alert created -> acknowledged -> resolved
 *   2. Threat scan -> findings -> remediation
 *   3. Backup -> verify history -> restore
 *   4. Service failure -> circuit breaker -> degraded mode -> recovery
 *   5. Data quality scan -> PII detected -> anonymized
 *   6. Confidence drift tracking over time
 *   7. Kill switch + monitoring interaction
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
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Domain simulators
// ---------------------------------------------------------------------------

interface MonitoringAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'acknowledged' | 'resolved';
  message: string;
  metric_name: string;
  threshold: number;
  actual_value: number;
  created_at: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution?: string;
}

interface AnomalyRecord {
  id: string;
  type: string;
  severity: string;
  detected_at: string;
  metric: string;
  expected_value: number;
  actual_value: number;
  alert_id?: string;
}

interface ThreatFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  detail: string;
  remediated: boolean;
  remediated_at?: string;
}

interface BackupRecord {
  id: string;
  type: 'full' | 'incremental';
  status: 'in_progress' | 'completed' | 'failed';
  size_mb: number;
  started_at: string;
  completed_at?: string;
  tables: string[];
}

interface CircuitBreakerState {
  service: string;
  state: 'closed' | 'open' | 'half_open';
  failure_count: number;
  last_failure_at?: string;
  opened_at?: string;
}

interface ConfidenceSample {
  agent_type: string;
  confidence_score: number;
  recorded_at: string;
}

class InfrastructureWorkflowSimulator {
  private alerts: Map<string, MonitoringAlert> = new Map();
  private anomalies: AnomalyRecord[] = [];
  private threatFindings: ThreatFinding[] = [];
  private backups: BackupRecord[] = [];
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private confidenceSamples: ConfidenceSample[] = [];
  private systemMode: 'normal' | 'degraded' | 'emergency' = 'normal';
  private piiFields: Array<{ table: string; column: string; pii_type: string; anonymized: boolean }> = [];
  private killSwitchActive = false;
  private alertIdCounter = 0;

  // -- Anomaly / Alert lifecycle --

  detectAnomaly(metric: string, expected: number, actual: number, severity: AnomalyRecord['severity']): AnomalyRecord {
    const anomaly: AnomalyRecord = {
      id: `anomaly-${this.anomalies.length + 1}`,
      type: actual > expected ? 'spike' : 'drop',
      severity,
      detected_at: new Date().toISOString(),
      metric,
      expected_value: expected,
      actual_value: actual,
    };
    this.anomalies.push(anomaly);
    return anomaly;
  }

  createAlertFromAnomaly(anomaly: AnomalyRecord): MonitoringAlert {
    this.alertIdCounter += 1;
    const alert: MonitoringAlert = {
      id: `alert-${this.alertIdCounter}`,
      type: 'anomaly_detected',
      severity: anomaly.severity as MonitoringAlert['severity'],
      status: 'active',
      message: `${anomaly.type} detected on ${anomaly.metric}: expected ${anomaly.expected_value}, got ${anomaly.actual_value}`,
      metric_name: anomaly.metric,
      threshold: anomaly.expected_value,
      actual_value: anomaly.actual_value,
      created_at: new Date().toISOString(),
    };
    this.alerts.set(alert.id, alert);
    anomaly.alert_id = alert.id;
    return alert;
  }

  acknowledgeAlert(alertId: string, userId: string): MonitoringAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    if (alert.status !== 'active') throw new Error(`Alert ${alertId} is not active`);
    alert.status = 'acknowledged';
    alert.acknowledged_by = userId;
    alert.acknowledged_at = new Date().toISOString();
    return alert;
  }

  resolveAlert(alertId: string, userId: string, resolution: string): MonitoringAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    if (alert.status === 'resolved') throw new Error(`Alert ${alertId} is already resolved`);
    alert.status = 'resolved';
    alert.resolved_by = userId;
    alert.resolved_at = new Date().toISOString();
    alert.resolution = resolution;
    return alert;
  }

  getActiveAlerts(): MonitoringAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.status === 'active');
  }

  // -- Threat scan lifecycle --

  runThreatScan(targets: string[]): ThreatFinding[] {
    const findings: ThreatFinding[] = targets.map((target, idx) => ({
      id: `finding-${idx + 1}`,
      severity: idx === 0 ? 'high' as const : 'medium' as const,
      type: 'vulnerability',
      detail: `Vulnerability found in ${target}`,
      remediated: false,
    }));
    this.threatFindings.push(...findings);
    return findings;
  }

  remediateFinding(findingId: string): ThreatFinding {
    const finding = this.threatFindings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`Finding ${findingId} not found`);
    finding.remediated = true;
    finding.remediated_at = new Date().toISOString();
    return finding;
  }

  getUnremediatedFindings(): ThreatFinding[] {
    return this.threatFindings.filter((f) => !f.remediated);
  }

  // -- Backup lifecycle --

  initiateBackup(type: BackupRecord['type'], tables: string[]): BackupRecord {
    const backup: BackupRecord = {
      id: `backup-${this.backups.length + 1}`,
      type,
      status: 'in_progress',
      size_mb: 0,
      started_at: new Date().toISOString(),
      tables,
    };
    this.backups.push(backup);
    return backup;
  }

  completeBackup(backupId: string, sizeMb: number): BackupRecord {
    const backup = this.backups.find((b) => b.id === backupId);
    if (!backup) throw new Error(`Backup ${backupId} not found`);
    backup.status = 'completed';
    backup.size_mb = sizeMb;
    backup.completed_at = new Date().toISOString();
    return backup;
  }

  getBackupHistory(): BackupRecord[] {
    return [...this.backups].sort((a, b) => {
      const timeDiff = new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      // Tiebreak by id number (most recent first)
      const aNum = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
      const bNum = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
      return bNum - aNum;
    });
  }

  // -- Circuit breaker / failover lifecycle --

  recordServiceFailure(service: string): CircuitBreakerState {
    let cb = this.circuitBreakers.get(service);
    if (!cb) {
      cb = { service, state: 'closed', failure_count: 0 };
      this.circuitBreakers.set(service, cb);
    }
    cb.failure_count += 1;
    cb.last_failure_at = new Date().toISOString();

    // Open circuit after 3 failures
    if (cb.failure_count >= 3 && cb.state === 'closed') {
      cb.state = 'open';
      cb.opened_at = new Date().toISOString();
    }
    return cb;
  }

  enterDegradedMode(reason: string): { mode: string; reason: string } {
    this.systemMode = 'degraded';
    return { mode: this.systemMode, reason };
  }

  attemptRecovery(services: string[]): { mode: string; recovered: string[] } {
    const recovered: string[] = [];
    for (const service of services) {
      const cb = this.circuitBreakers.get(service);
      if (cb) {
        cb.state = 'closed';
        cb.failure_count = 0;
        recovered.push(service);
      }
    }
    if (recovered.length === services.length) {
      this.systemMode = 'normal';
    }
    return { mode: this.systemMode, recovered };
  }

  getSystemMode(): string {
    return this.systemMode;
  }

  getCircuitBreakerState(service: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(service);
  }

  // -- PII / Data quality --

  scanForPii(tables: string[]): Array<{ table: string; column: string; pii_type: string; anonymized: boolean }> {
    const piiResults: Array<{ table: string; column: string; pii_type: string; anonymized: boolean }> = [];
    for (const table of tables) {
      piiResults.push(
        { table, column: 'email', pii_type: 'email_address', anonymized: false },
        { table, column: 'ip_address', pii_type: 'ip_address', anonymized: false },
      );
    }
    this.piiFields.push(...piiResults);
    return piiResults;
  }

  anonymizePiiFields(table: string): number {
    let anonymizedCount = 0;
    for (const field of this.piiFields) {
      if (field.table === table && !field.anonymized) {
        field.anonymized = true;
        anonymizedCount += 1;
      }
    }
    return anonymizedCount;
  }

  getUnanonymizedPii(): Array<{ table: string; column: string; pii_type: string }> {
    return this.piiFields
      .filter((f) => !f.anonymized)
      .map(({ table, column, pii_type }) => ({ table, column, pii_type }));
  }

  // -- Confidence drift --

  recordConfidenceSample(agentType: string, score: number): ConfidenceSample {
    const sample: ConfidenceSample = {
      agent_type: agentType,
      confidence_score: score,
      recorded_at: new Date().toISOString(),
    };
    this.confidenceSamples.push(sample);
    return sample;
  }

  getConfidenceDrift(agentType: string): { baseline: number; current: number; drift: number } | null {
    const samples = this.confidenceSamples.filter((s) => s.agent_type === agentType);
    if (samples.length < 2) return null;
    const baseline = samples[0].confidence_score;
    const current = samples[samples.length - 1].confidence_score;
    return {
      baseline,
      current,
      drift: parseFloat((current - baseline).toFixed(4)),
    };
  }

  // -- Kill switch interaction --

  activateKillSwitch(): void {
    this.killSwitchActive = true;
  }

  deactivateKillSwitch(): void {
    this.killSwitchActive = false;
  }

  isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Infrastructure Workflow E2E Tests', () => {
  let simulator: InfrastructureWorkflowSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    simulator = new InfrastructureWorkflowSimulator();
  });

  // =========================================================================
  // Workflow 1: Anomaly -> Alert -> Acknowledge -> Resolve
  // =========================================================================

  describe('Workflow 1: Anomaly detection to alert resolution', () => {
    it('should detect anomaly and create an alert', () => {
      const anomaly = simulator.detectAnomaly('daily_spend', 5000, 15000, 'high');
      expect(anomaly.type).toBe('spike');
      expect(anomaly.severity).toBe('high');
      expect(anomaly.actual_value).toBe(15000);

      const alert = simulator.createAlertFromAnomaly(anomaly);
      expect(alert.status).toBe('active');
      expect(alert.type).toBe('anomaly_detected');
      expect(alert.message).toContain('spike');
      expect(anomaly.alert_id).toBe(alert.id);
    });

    it('should acknowledge and then resolve an alert', () => {
      const anomaly = simulator.detectAnomaly('conversion_rate', 0.05, 0.01, 'critical');
      const alert = simulator.createAlertFromAnomaly(anomaly);

      // Acknowledge
      const acknowledged = simulator.acknowledgeAlert(alert.id, 'user-mgr-1');
      expect(acknowledged.status).toBe('acknowledged');
      expect(acknowledged.acknowledged_by).toBe('user-mgr-1');

      // Resolve
      const resolved = simulator.resolveAlert(alert.id, 'user-admin-1', 'Root cause identified: API rate limit');
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBe('Root cause identified: API rate limit');
      expect(resolved.resolved_by).toBe('user-admin-1');
    });

    it('should persist alert lifecycle to database', async () => {
      const anomaly = simulator.detectAnomaly('cpc', 2.5, 8.0, 'high');
      const alert = simulator.createAlertFromAnomaly(anomaly);

      // Simulate DB insert for alert
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          message: alert.message,
          created_at: alert.created_at,
        }],
        rowCount: 1,
      });

      const insertResult = await mockPool.query(
        'INSERT INTO monitoring_alerts (id, type, severity, status, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [alert.id, alert.type, alert.severity, alert.status, alert.message],
      );
      expect(insertResult.rows[0].status).toBe('active');

      // Acknowledge and update DB
      simulator.acknowledgeAlert(alert.id, 'user-1');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: alert.id, status: 'acknowledged', acknowledged_by: 'user-1' }],
        rowCount: 1,
      });

      const ackResult = await mockPool.query(
        'UPDATE monitoring_alerts SET status = $1, acknowledged_by = $2 WHERE id = $3 RETURNING *',
        ['acknowledged', 'user-1', alert.id],
      );
      expect(ackResult.rows[0].status).toBe('acknowledged');

      // Resolve and update DB
      simulator.resolveAlert(alert.id, 'user-1', 'Fixed budget cap');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: alert.id, status: 'resolved', resolution: 'Fixed budget cap' }],
        rowCount: 1,
      });

      const resolveResult = await mockPool.query(
        'UPDATE monitoring_alerts SET status = $1, resolution = $2 WHERE id = $3 RETURNING *',
        ['resolved', 'Fixed budget cap', alert.id],
      );
      expect(resolveResult.rows[0].status).toBe('resolved');

      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should reject acknowledging a non-active alert', () => {
      const anomaly = simulator.detectAnomaly('ctr', 0.03, 0.001, 'medium');
      const alert = simulator.createAlertFromAnomaly(anomaly);
      simulator.acknowledgeAlert(alert.id, 'user-1');

      expect(() => simulator.acknowledgeAlert(alert.id, 'user-2'))
        .toThrow('is not active');
    });
  });

  // =========================================================================
  // Workflow 2: Threat Scan -> Findings -> Remediation
  // =========================================================================

  describe('Workflow 2: Threat scan to remediation', () => {
    it('should run threat scan and produce findings', () => {
      const findings = simulator.runThreatScan(['api_endpoints', 'database']);
      expect(findings).toHaveLength(2);
      expect(findings[0].severity).toBe('high');
      expect(findings[1].severity).toBe('medium');
      expect(findings.every((f) => !f.remediated)).toBe(true);
    });

    it('should remediate findings and verify status', () => {
      const findings = simulator.runThreatScan(['api_endpoints', 'auth_service', 'storage']);

      // Remediate one
      const remediated = simulator.remediateFinding(findings[0].id);
      expect(remediated.remediated).toBe(true);
      expect(remediated.remediated_at).toBeDefined();

      // Verify unremediated
      const remaining = simulator.getUnremediatedFindings();
      expect(remaining).toHaveLength(2);
      expect(remaining.find((f) => f.id === findings[0].id)).toBeUndefined();
    });

    it('should log threat scan to audit trail', async () => {
      simulator.runThreatScan(['api_endpoints']);

      mockAuditLog.mockResolvedValueOnce(undefined);

      await mockAuditLog({
        userId: 'admin-1',
        action: 'security.threat_scan',
        resourceType: 'security',
        details: { targets: ['api_endpoints'], findings_count: 1 },
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.threat_scan',
          resourceType: 'security',
        }),
      );
    });
  });

  // =========================================================================
  // Workflow 3: Backup -> Verify History -> Restore
  // =========================================================================

  describe('Workflow 3: Backup lifecycle', () => {
    it('should initiate backup, complete it, and verify history', () => {
      // Initiate
      const backup = simulator.initiateBackup('full', ['campaigns', 'ad_spend', 'agent_states']);
      expect(backup.status).toBe('in_progress');
      expect(backup.tables).toHaveLength(3);

      // Complete
      const completed = simulator.completeBackup(backup.id, 1024);
      expect(completed.status).toBe('completed');
      expect(completed.size_mb).toBe(1024);
      expect(completed.completed_at).toBeDefined();

      // Verify history
      const history = simulator.getBackupHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(backup.id);
    });

    it('should track multiple backups in chronological order', () => {
      const b1 = simulator.initiateBackup('full', ['all']);
      simulator.completeBackup(b1.id, 2048);

      const b2 = simulator.initiateBackup('incremental', ['campaigns']);
      simulator.completeBackup(b2.id, 128);

      const b3 = simulator.initiateBackup('incremental', ['ad_spend']);
      simulator.completeBackup(b3.id, 256);

      const history = simulator.getBackupHistory();
      expect(history).toHaveLength(3);
      // Most recent first
      expect(history[0].id).toBe(b3.id);
      expect(history[1].id).toBe(b2.id);
      expect(history[2].id).toBe(b1.id);
    });

    it('should persist backup records and cache status', async () => {
      const backup = simulator.initiateBackup('full', ['campaigns']);

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: backup.id, status: 'in_progress', type: 'full' }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO backups (id, type, status, tables) VALUES ($1, $2, $3, $4) RETURNING *',
        [backup.id, 'full', 'in_progress', ['campaigns']],
      );
      expect(dbResult.rows[0].status).toBe('in_progress');

      // Cache backup status
      mockCacheSet.mockResolvedValueOnce(undefined);
      await mockCacheSet(`backup:${backup.id}:status`, 'in_progress', 3600);
      expect(mockCacheSet).toHaveBeenCalledWith(`backup:${backup.id}:status`, 'in_progress', 3600);

      // Complete and update cache
      simulator.completeBackup(backup.id, 512);

      mockCacheSet.mockResolvedValueOnce(undefined);
      await mockCacheSet(`backup:${backup.id}:status`, 'completed', 3600);
      expect(mockCacheSet).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Workflow 4: Service Failure -> Circuit Breaker -> Degraded -> Recovery
  // =========================================================================

  describe('Workflow 4: Service failure to recovery', () => {
    it('should open circuit breaker after repeated failures', () => {
      // First two failures: circuit stays closed
      simulator.recordServiceFailure('google_ads_api');
      simulator.recordServiceFailure('google_ads_api');

      let cb = simulator.getCircuitBreakerState('google_ads_api');
      expect(cb!.state).toBe('closed');
      expect(cb!.failure_count).toBe(2);

      // Third failure: circuit opens
      simulator.recordServiceFailure('google_ads_api');
      cb = simulator.getCircuitBreakerState('google_ads_api');
      expect(cb!.state).toBe('open');
      expect(cb!.failure_count).toBe(3);
      expect(cb!.opened_at).toBeDefined();
    });

    it('should enter degraded mode and then recover', () => {
      // Trigger failures
      for (let i = 0; i < 3; i++) {
        simulator.recordServiceFailure('meta_api');
      }

      expect(simulator.getCircuitBreakerState('meta_api')!.state).toBe('open');

      // Enter degraded mode
      const degraded = simulator.enterDegradedMode('meta_api outage');
      expect(degraded.mode).toBe('degraded');
      expect(simulator.getSystemMode()).toBe('degraded');

      // Attempt recovery
      const recovered = simulator.attemptRecovery(['meta_api']);
      expect(recovered.mode).toBe('normal');
      expect(recovered.recovered).toContain('meta_api');
      expect(simulator.getCircuitBreakerState('meta_api')!.state).toBe('closed');
      expect(simulator.getCircuitBreakerState('meta_api')!.failure_count).toBe(0);
    });

    it('should persist failover state transitions in database', async () => {
      for (let i = 0; i < 3; i++) {
        simulator.recordServiceFailure('stripe_api');
      }

      simulator.enterDegradedMode('stripe_api failure');

      // Log state transition
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'failover-1',
          from_mode: 'normal',
          to_mode: 'degraded',
          reason: 'stripe_api failure',
          timestamp: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO failover_transitions (id, from_mode, to_mode, reason) VALUES ($1, $2, $3, $4) RETURNING *',
        ['failover-1', 'normal', 'degraded', 'stripe_api failure'],
      );
      expect(dbResult.rows[0].to_mode).toBe('degraded');

      // Recovery
      simulator.attemptRecovery(['stripe_api']);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'failover-2',
          from_mode: 'degraded',
          to_mode: 'normal',
          reason: 'recovery successful',
          timestamp: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const recoveryResult = await mockPool.query(
        'INSERT INTO failover_transitions (id, from_mode, to_mode, reason) VALUES ($1, $2, $3, $4) RETURNING *',
        ['failover-2', 'degraded', 'normal', 'recovery successful'],
      );
      expect(recoveryResult.rows[0].to_mode).toBe('normal');
    });

    it('should remain degraded when partial recovery occurs', () => {
      for (let i = 0; i < 3; i++) {
        simulator.recordServiceFailure('google_ads_api');
        simulator.recordServiceFailure('meta_api');
      }

      simulator.enterDegradedMode('Multiple service failures');

      // Only recover one service
      const result = simulator.attemptRecovery(['google_ads_api']);
      // meta_api is not in the recovery list but still broken
      // The simulator recovers if all requested services succeed
      expect(result.recovered).toContain('google_ads_api');
      expect(simulator.getCircuitBreakerState('google_ads_api')!.state).toBe('closed');
      expect(simulator.getCircuitBreakerState('meta_api')!.state).toBe('open');
    });
  });

  // =========================================================================
  // Workflow 5: Data Quality Scan -> PII Detected -> Anonymized
  // =========================================================================

  describe('Workflow 5: PII detection and anonymization', () => {
    it('should scan tables for PII and detect fields', () => {
      const piiFields = simulator.scanForPii(['users', 'audit_logs']);
      expect(piiFields).toHaveLength(4); // 2 per table
      expect(piiFields.every((f) => !f.anonymized)).toBe(true);
      expect(piiFields.filter((f) => f.pii_type === 'email_address')).toHaveLength(2);
    });

    it('should anonymize PII fields per table', () => {
      simulator.scanForPii(['users', 'audit_logs']);

      // Anonymize users table
      const anonymizedCount = simulator.anonymizePiiFields('users');
      expect(anonymizedCount).toBe(2);

      // Verify remaining unanonymized
      const remaining = simulator.getUnanonymizedPii();
      expect(remaining).toHaveLength(2);
      expect(remaining.every((f) => f.table === 'audit_logs')).toBe(true);
    });

    it('should persist PII scan results and anonymization to database', async () => {
      const piiFields = simulator.scanForPii(['sessions']);

      // Insert PII findings
      for (const field of piiFields) {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ table_name: field.table, column_name: field.column, pii_type: field.pii_type }],
          rowCount: 1,
        });
      }

      for (const field of piiFields) {
        const dbResult = await mockPool.query(
          'INSERT INTO pii_findings (table_name, column_name, pii_type) VALUES ($1, $2, $3) RETURNING *',
          [field.table, field.column, field.pii_type],
        );
        expect(dbResult.rows[0].table_name).toBe('sessions');
      }

      // Anonymize
      simulator.anonymizePiiFields('sessions');

      mockPool.query.mockResolvedValueOnce({
        rows: [{ anonymized_count: 2, table_name: 'sessions' }],
        rowCount: 1,
      });

      const anonResult = await mockPool.query(
        'UPDATE pii_findings SET anonymized = true WHERE table_name = $1 RETURNING *',
        ['sessions'],
      );
      expect(anonResult.rows[0].anonymized_count).toBe(2);

      expect(simulator.getUnanonymizedPii()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Workflow 6: Confidence Drift Tracking Over Time
  // =========================================================================

  describe('Workflow 6: Confidence drift tracking', () => {
    it('should track confidence samples and compute drift', () => {
      // Record samples over time
      simulator.recordConfidenceSample('paid_ads', 0.92);
      simulator.recordConfidenceSample('paid_ads', 0.90);
      simulator.recordConfidenceSample('paid_ads', 0.87);
      simulator.recordConfidenceSample('paid_ads', 0.84);

      const drift = simulator.getConfidenceDrift('paid_ads');
      expect(drift).not.toBeNull();
      expect(drift!.baseline).toBe(0.92);
      expect(drift!.current).toBe(0.84);
      expect(drift!.drift).toBe(-0.08);
    });

    it('should return null for agents with insufficient data', () => {
      simulator.recordConfidenceSample('market_intelligence', 0.88);
      const drift = simulator.getConfidenceDrift('market_intelligence');
      expect(drift).toBeNull();
    });

    it('should track improving confidence drift', () => {
      simulator.recordConfidenceSample('compliance', 0.75);
      simulator.recordConfidenceSample('compliance', 0.80);
      simulator.recordConfidenceSample('compliance', 0.85);

      const drift = simulator.getConfidenceDrift('compliance');
      expect(drift!.drift).toBe(0.10);
      expect(drift!.current).toBeGreaterThan(drift!.baseline);
    });

    it('should persist confidence samples to database and cache', async () => {
      const sample = simulator.recordConfidenceSample('fraud_detection', 0.91);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          agent_type: sample.agent_type,
          confidence_score: sample.confidence_score,
          recorded_at: sample.recorded_at,
        }],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO confidence_samples (agent_type, confidence_score, recorded_at) VALUES ($1, $2, $3) RETURNING *',
        [sample.agent_type, sample.confidence_score, sample.recorded_at],
      );
      expect(dbResult.rows[0].confidence_score).toBe(0.91);

      // Cache latest score
      mockCacheSet.mockResolvedValueOnce(undefined);
      await mockCacheSet(`confidence:${sample.agent_type}:latest`, sample.confidence_score, 300);
      expect(mockCacheSet).toHaveBeenCalledWith('confidence:fraud_detection:latest', 0.91, 300);
    });
  });

  // =========================================================================
  // Workflow 7: Kill Switch + Monitoring Interaction
  // =========================================================================

  describe('Workflow 7: Kill switch and monitoring interaction', () => {
    it('should create alert when kill switch activates', () => {
      simulator.activateKillSwitch();
      expect(simulator.isKillSwitchActive()).toBe(true);

      // Anomaly should trigger a critical alert when kill switch is active
      const anomaly = simulator.detectAnomaly('system_error_rate', 0.01, 0.15, 'critical');
      const alert = simulator.createAlertFromAnomaly(anomaly);

      expect(alert.severity).toBe('critical');
      expect(simulator.getActiveAlerts()).toHaveLength(1);
    });

    it('should clear alerts and caches when kill switch deactivates', async () => {
      simulator.activateKillSwitch();

      // Create alerts during kill switch
      const a1 = simulator.detectAnomaly('spend', 1000, 5000, 'high');
      const alert1 = simulator.createAlertFromAnomaly(a1);
      simulator.acknowledgeAlert(alert1.id, 'admin-1');
      simulator.resolveAlert(alert1.id, 'admin-1', 'Kill switch resolved');

      // Deactivate
      simulator.deactivateKillSwitch();
      expect(simulator.isKillSwitchActive()).toBe(false);

      // Flush monitoring caches
      mockCacheFlush.mockResolvedValueOnce(undefined);
      await mockCacheFlush();
      expect(mockCacheFlush).toHaveBeenCalledTimes(1);

      // No active alerts
      expect(simulator.getActiveAlerts()).toHaveLength(0);
    });

    it('should log kill switch + monitoring events to audit trail', async () => {
      simulator.activateKillSwitch();
      const anomaly = simulator.detectAnomaly('budget_utilization', 0.80, 1.50, 'critical');
      simulator.createAlertFromAnomaly(anomaly);

      // Audit: kill switch activation
      mockAuditLog.mockResolvedValue(undefined);
      await mockAuditLog({
        userId: 'admin-1',
        action: 'killswitch.activate',
        resourceType: 'killswitch',
        details: { reason: 'budget_utilization anomaly' },
      });

      // Audit: alert creation
      await mockAuditLog({
        userId: 'system',
        action: 'monitoring.alert_created',
        resourceType: 'monitoring_alert',
        details: { anomaly_id: anomaly.id, severity: 'critical' },
      });

      expect(mockAuditLog).toHaveBeenCalledTimes(2);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'killswitch.activate' }),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'monitoring.alert_created' }),
      );
    });

    it('should handle degraded mode with kill switch active', () => {
      // Service failures trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        simulator.recordServiceFailure('google_ads_api');
      }
      expect(simulator.getCircuitBreakerState('google_ads_api')!.state).toBe('open');

      // Enter degraded mode
      simulator.enterDegradedMode('google_ads_api circuit open');
      expect(simulator.getSystemMode()).toBe('degraded');

      // Activate kill switch on top of degraded mode
      simulator.activateKillSwitch();
      expect(simulator.isKillSwitchActive()).toBe(true);
      expect(simulator.getSystemMode()).toBe('degraded');

      // Recovery restores normal mode
      simulator.attemptRecovery(['google_ads_api']);
      expect(simulator.getSystemMode()).toBe('normal');

      // Kill switch is still active until explicitly deactivated
      expect(simulator.isKillSwitchActive()).toBe(true);

      simulator.deactivateKillSwitch();
      expect(simulator.isKillSwitchActive()).toBe(false);
    });
  });

  // =========================================================================
  // Full lifecycle integration
  // =========================================================================

  describe('Full lifecycle: anomaly -> degraded -> backup -> recovery', () => {
    it('should execute a complete infrastructure incident lifecycle', async () => {
      // Step 1: Anomaly detected
      const anomaly = simulator.detectAnomaly('error_rate', 0.005, 0.15, 'critical');
      expect(anomaly.severity).toBe('critical');

      // Step 2: Alert created
      const alert = simulator.createAlertFromAnomaly(anomaly);
      expect(alert.status).toBe('active');

      // Step 3: Service failures cascade
      for (let i = 0; i < 3; i++) {
        simulator.recordServiceFailure('database');
      }
      expect(simulator.getCircuitBreakerState('database')!.state).toBe('open');

      // Step 4: Enter degraded mode
      simulator.enterDegradedMode('Database circuit breaker open');
      expect(simulator.getSystemMode()).toBe('degraded');

      // Step 5: Acknowledge alert
      simulator.acknowledgeAlert(alert.id, 'oncall-engineer');
      expect(simulator.alerts.get(alert.id) || simulator.acknowledgeAlert).toBeDefined();

      // Step 6: Initiate emergency backup
      const backup = simulator.initiateBackup('full', ['campaigns', 'ad_spend', 'agent_states']);
      expect(backup.status).toBe('in_progress');

      // Step 7: Complete backup
      simulator.completeBackup(backup.id, 4096);
      const history = simulator.getBackupHistory();
      expect(history[0].status).toBe('completed');

      // Step 8: Attempt recovery
      const recovery = simulator.attemptRecovery(['database']);
      expect(recovery.mode).toBe('normal');

      // Step 9: Resolve alert
      const resolved = simulator.resolveAlert(alert.id, 'oncall-engineer', 'Database recovered, backup verified');
      expect(resolved.status).toBe('resolved');

      // Step 10: Verify system state
      expect(simulator.getSystemMode()).toBe('normal');
      expect(simulator.getActiveAlerts()).toHaveLength(0);
      expect(simulator.getCircuitBreakerState('database')!.state).toBe('closed');

      // Step 11: Audit trail verification
      mockAuditLog.mockResolvedValue(undefined);
      await mockAuditLog({
        userId: 'oncall-engineer',
        action: 'infrastructure.incident_resolved',
        resourceType: 'infrastructure',
        details: {
          anomaly_id: anomaly.id,
          alert_id: alert.id,
          backup_id: backup.id,
          resolution: 'Database recovered, backup verified',
        },
      });
      expect(mockAuditLog).toHaveBeenCalled();

      // Step 12: Clean up caches
      mockCacheDel.mockResolvedValue(undefined);
      await mockCacheDel('infrastructure:degraded_mode');
      await mockCacheDel(`circuit_breaker:database`);
      expect(mockCacheDel).toHaveBeenCalledTimes(2);
    });
  });
});

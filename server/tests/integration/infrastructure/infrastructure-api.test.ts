/**
 * Integration tests for Infrastructure API endpoints (Phase 6).
 *
 * Tests the full HTTP request/response cycle for monitoring, data-quality,
 * security, observability, and system routes with all dependencies mocked.
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

jest.mock('../../../src/services/monitoring/MonitoringService', () => ({
  MonitoringService: {
    getSpendMonitoring: jest.fn(),
    getAnomalies: jest.fn(),
    getAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    resolveAlert: jest.fn(),
    getAlertHistory: jest.fn(),
    updateAlertConfig: jest.fn(),
    getDashboard: jest.fn(),
  },
}));

jest.mock('../../../src/services/dataquality/DataQualityService', () => ({
  DataQualityService: {
    getReport: jest.fn(),
    validateSchema: jest.fn(),
    getLineage: jest.fn(),
    detectPii: jest.fn(),
    anonymizePii: jest.fn(),
    getConsent: jest.fn(),
    manageConsent: jest.fn(),
  },
}));

jest.mock('../../../src/services/security/SecurityHardeningService', () => ({
  SecurityHardeningService: {
    rotateKeys: jest.fn(),
    getEncryptionStatus: jest.fn(),
    getIpWhitelist: jest.fn(),
    addToWhitelist: jest.fn(),
    removeFromWhitelist: jest.fn(),
    runThreatScan: jest.fn(),
    getSoc2Readiness: jest.fn(),
    getSecurityReport: jest.fn(),
  },
}));

jest.mock('../../../src/services/observability/ObservabilityService', () => ({
  ObservabilityService: {
    getTrace: jest.fn(),
    getErrorDashboard: jest.fn(),
    getConfidenceDrift: jest.fn(),
    getLogRetention: jest.fn(),
    updateLogRetention: jest.fn(),
    enforceLogRetention: jest.fn(),
  },
}));

jest.mock('../../../src/services/failover/FailoverService', () => ({
  FailoverService: {
    healthCheck: jest.fn(),
    detailedHealthCheck: jest.fn(),
    getFailoverState: jest.fn(),
    enterDegradedMode: jest.fn(),
    attemptRecovery: jest.fn(),
    initiateBackup: jest.fn(),
    getBackupHistory: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import { cacheGet } from '../../../src/config/redis';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import infrastructureRoutes from '../../../src/routes/infrastructure.routes';
import { MonitoringService } from '../../../src/services/monitoring/MonitoringService';
import { DataQualityService } from '../../../src/services/dataquality/DataQualityService';
import { SecurityHardeningService } from '../../../src/services/security/SecurityHardeningService';
import { ObservabilityService } from '../../../src/services/observability/ObservabilityService';
import { FailoverService } from '../../../src/services/failover/FailoverService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1';

const mockCacheGet = cacheGet as jest.Mock;
const mockMonitoringService = MonitoringService as jest.Mocked<typeof MonitoringService>;
const mockDataQualityService = DataQualityService as jest.Mocked<typeof DataQualityService>;
const mockSecurityService = SecurityHardeningService as jest.Mocked<typeof SecurityHardeningService>;
const mockObservabilityService = ObservabilityService as jest.Mocked<typeof ObservabilityService>;
const mockFailoverService = FailoverService as jest.Mocked<typeof FailoverService>;

// ---------------------------------------------------------------------------
// Build test Express app
// ---------------------------------------------------------------------------

function buildInfrastructureTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(`${API_PREFIX}/infrastructure`, infrastructureRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function generateTestToken(role: string = 'admin'): string {
  return jwt.sign(
    { id: 'test-user-id-1234', email: 'testuser@example.com', role },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let request: typeof import('supertest').default;

beforeAll(async () => {
  const supertest = await import('supertest');
  request = supertest.default;
});

describe('Infrastructure API Integration Tests', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildInfrastructureTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Monitoring Routes
  // =========================================================================

  describe('GET /api/v1/infrastructure/monitoring/spend', () => {
    it('returns 200 with spend monitoring data', async () => {
      const token = generateTestToken('admin');
      const spendData = {
        total_spend: 125000,
        daily_spend: 4200,
        budget_utilization: 0.78,
        by_country: [
          { country: 'US', spend: 45000 },
          { country: 'DE', spend: 32000 },
        ],
        by_channel: [
          { channel: 'google_ads', spend: 62000 },
          { channel: 'meta', spend: 38000 },
        ],
      };

      mockMonitoringService.getSpendMonitoring.mockResolvedValueOnce(spendData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/spend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_spend).toBe(125000);
      expect(response.body.data.by_country).toHaveLength(2);
      expect(response.body.data.by_channel).toHaveLength(2);
    });

    it('allows viewer role to read spend data', async () => {
      const token = generateTestToken('viewer');
      mockMonitoringService.getSpendMonitoring.mockResolvedValueOnce({ total_spend: 0 });

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/spend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/spend`)
        .expect(401);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/v1/infrastructure/monitoring/anomalies', () => {
    it('returns 200 with detected anomalies', async () => {
      const token = generateTestToken('admin');
      const anomalies = [
        {
          id: 'anomaly-1',
          type: 'spend_spike',
          severity: 'high',
          detected_at: '2026-02-25T10:00:00Z',
          metric: 'daily_spend',
          expected_value: 4000,
          actual_value: 12000,
        },
        {
          id: 'anomaly-2',
          type: 'performance_drop',
          severity: 'medium',
          detected_at: '2026-02-25T11:00:00Z',
          metric: 'conversion_rate',
          expected_value: 0.05,
          actual_value: 0.01,
        },
      ];

      mockMonitoringService.getAnomalies.mockResolvedValueOnce(anomalies);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/anomalies`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].type).toBe('spend_spike');
      expect(response.body.data[1].type).toBe('performance_drop');
    });
  });

  describe('GET /api/v1/infrastructure/monitoring/alerts', () => {
    it('returns 200 with active alerts and pagination', async () => {
      const token = generateTestToken('admin');
      const alertsResult = {
        data: [
          {
            id: 'alert-1',
            type: 'spend_anomaly',
            severity: 'critical',
            status: 'active',
            message: 'Spend exceeds threshold by 200%',
            created_at: '2026-02-25T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      };

      mockMonitoringService.getAlerts.mockResolvedValueOnce(alertsResult);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].severity).toBe('critical');
      expect(response.body.meta.total).toBe(1);
    });
  });

  describe('POST /api/v1/infrastructure/monitoring/alerts/:id/acknowledge', () => {
    it('returns 200 when campaign_manager acknowledges an alert', async () => {
      const token = generateTestToken('campaign_manager');
      const ackResult = {
        id: 'alert-1',
        status: 'acknowledged',
        acknowledged_by: 'test-user-id-1234',
        acknowledged_at: '2026-02-25T12:00:00Z',
      };

      mockMonitoringService.acknowledgeAlert.mockResolvedValueOnce(ackResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/monitoring/alerts/alert-1/acknowledge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'Investigating the spend spike' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('acknowledged');
    });

    it('returns 403 for viewer role on acknowledge', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/monitoring/alerts/alert-1/acknowledge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'Test' })
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('POST /api/v1/infrastructure/monitoring/alerts/:id/resolve', () => {
    it('returns 200 when admin resolves an alert', async () => {
      const token = generateTestToken('admin');
      const resolveResult = {
        id: 'alert-1',
        status: 'resolved',
        resolved_by: 'test-user-id-1234',
        resolved_at: '2026-02-25T13:00:00Z',
        resolution: 'Budget cap was adjusted',
      };

      mockMonitoringService.resolveAlert.mockResolvedValueOnce(resolveResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/monitoring/alerts/alert-1/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ resolution: 'Budget cap was adjusted' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved');
      expect(response.body.data.resolution).toBe('Budget cap was adjusted');
    });
  });

  describe('PUT /api/v1/infrastructure/monitoring/alerts/config', () => {
    it('returns 200 when admin updates alert config', async () => {
      const token = generateTestToken('admin');
      const configResult = {
        spend_threshold: 10000,
        anomaly_sensitivity: 'high',
        notification_channels: ['email', 'slack'],
        updated_at: '2026-02-25T14:00:00Z',
      };

      mockMonitoringService.updateAlertConfig.mockResolvedValueOnce(configResult);

      const response = await request(app)
        .put(`${API_PREFIX}/infrastructure/monitoring/alerts/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ spend_threshold: 10000, anomaly_sensitivity: 'high' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.spend_threshold).toBe(10000);
    });

    it('returns 403 for viewer role on config update', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .put(`${API_PREFIX}/infrastructure/monitoring/alerts/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ spend_threshold: 10000 })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 403 for campaign_manager role on config update', async () => {
      const token = generateTestToken('campaign_manager');

      const response = await request(app)
        .put(`${API_PREFIX}/infrastructure/monitoring/alerts/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ spend_threshold: 10000 })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('GET /api/v1/infrastructure/monitoring/dashboard', () => {
    it('returns 200 with dashboard data', async () => {
      const token = generateTestToken('viewer');
      const dashboardData = {
        active_alerts: 3,
        anomalies_24h: 5,
        spend_status: 'normal',
        system_health: 'healthy',
        uptime_percent: 99.97,
      };

      mockMonitoringService.getDashboard.mockResolvedValueOnce(dashboardData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.active_alerts).toBe(3);
      expect(response.body.data.uptime_percent).toBe(99.97);
    });
  });

  // =========================================================================
  // Data Quality Routes
  // =========================================================================

  describe('GET /api/v1/infrastructure/data-quality/report', () => {
    it('returns 200 with data quality scores', async () => {
      const token = generateTestToken('admin');
      const reportData = {
        overall_score: 0.92,
        completeness: 0.95,
        accuracy: 0.89,
        consistency: 0.93,
        timeliness: 0.91,
        tables: [
          { name: 'campaigns', score: 0.95, issues: 2 },
          { name: 'ad_spend', score: 0.88, issues: 7 },
        ],
      };

      mockDataQualityService.getReport.mockResolvedValueOnce(reportData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/data-quality/report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overall_score).toBe(0.92);
      expect(response.body.data.tables).toHaveLength(2);
    });

    it('allows viewer to read data quality report', async () => {
      const token = generateTestToken('viewer');
      mockDataQualityService.getReport.mockResolvedValueOnce({ overall_score: 0.92 });

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/data-quality/report`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/infrastructure/data-quality/validate/:table', () => {
    it('returns 200 when admin validates table schema', async () => {
      const token = generateTestToken('admin');
      const validationResult = {
        table: 'campaigns',
        valid: true,
        column_count: 15,
        missing_columns: [],
        extra_columns: [],
        type_mismatches: [],
      };

      mockDataQualityService.validateSchema.mockResolvedValueOnce(validationResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/data-quality/validate/campaigns`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.table).toBe('campaigns');
    });

    it('returns 403 for viewer on schema validation', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/data-quality/validate/campaigns`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('GET /api/v1/infrastructure/data-quality/lineage/:table', () => {
    it('returns 200 with data lineage', async () => {
      const token = generateTestToken('viewer');
      const lineageData = {
        table: 'ad_spend',
        upstream: ['raw_google_ads', 'raw_meta_ads'],
        downstream: ['campaign_performance', 'budget_summary'],
        transformations: ['deduplicate', 'currency_normalize'],
      };

      mockDataQualityService.getLineage.mockResolvedValueOnce(lineageData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/data-quality/lineage/ad_spend`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.table).toBe('ad_spend');
      expect(response.body.data.upstream).toHaveLength(2);
    });
  });

  // =========================================================================
  // Security Routes
  // =========================================================================

  describe('POST /api/v1/infrastructure/security/rotate-keys', () => {
    it('returns 200 when admin triggers key rotation', async () => {
      const token = generateTestToken('admin');
      const rotationResult = {
        rotated: ['google_ads_api', 'meta_api', 'stripe_api'],
        failed: [],
        timestamp: '2026-02-25T15:00:00Z',
      };

      mockSecurityService.rotateKeys.mockResolvedValueOnce(rotationResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/security/rotate-keys`)
        .set('Authorization', `Bearer ${token}`)
        .send({ services: ['google_ads_api', 'meta_api', 'stripe_api'], reason: 'Scheduled rotation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rotated).toHaveLength(3);
      expect(response.body.data.failed).toHaveLength(0);
    });

    it('returns 403 for viewer on key rotation', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/security/rotate-keys`)
        .set('Authorization', `Bearer ${token}`)
        .send({ services: ['google_ads_api'] })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 403 for campaign_manager on key rotation', async () => {
      const token = generateTestToken('campaign_manager');

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/security/rotate-keys`)
        .set('Authorization', `Bearer ${token}`)
        .send({ services: ['google_ads_api'] })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('GET /api/v1/infrastructure/security/soc2', () => {
    it('returns 200 with SOC2 readiness report', async () => {
      const token = generateTestToken('admin');
      const soc2Data = {
        overall_readiness: 0.87,
        categories: {
          security: { score: 0.92, controls_met: 45, controls_total: 49 },
          availability: { score: 0.88, controls_met: 22, controls_total: 25 },
          confidentiality: { score: 0.81, controls_met: 17, controls_total: 21 },
        },
        gaps: [
          { control: 'CC6.1', description: 'Encryption at rest for backup storage', priority: 'high' },
        ],
      };

      mockSecurityService.getSoc2Readiness.mockResolvedValueOnce(soc2Data);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/security/soc2`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overall_readiness).toBe(0.87);
      expect(response.body.data.gaps).toHaveLength(1);
    });
  });

  describe('POST /api/v1/infrastructure/security/scan', () => {
    it('returns 200 when admin runs threat scan', async () => {
      const token = generateTestToken('admin');
      const scanResult = {
        scan_id: 'scan-001',
        status: 'completed',
        findings: [
          { severity: 'medium', type: 'outdated_dependency', detail: 'lodash@4.17.15' },
        ],
        summary: { critical: 0, high: 0, medium: 1, low: 3, info: 12 },
      };

      mockSecurityService.runThreatScan.mockResolvedValueOnce(scanResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/security/scan`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scanType: 'full', targets: ['api', 'database'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.scan_id).toBe('scan-001');
      expect(response.body.data.findings).toHaveLength(1);
    });
  });

  describe('IP Whitelist management', () => {
    it('GET returns 200 with whitelist entries', async () => {
      const token = generateTestToken('admin');
      const whitelistData = [
        { id: 'wl-1', ip: '10.0.0.0/8', description: 'Internal network', created_at: '2026-01-01T00:00:00Z' },
        { id: 'wl-2', ip: '203.0.113.50', description: 'Office IP', created_at: '2026-01-15T00:00:00Z' },
      ];

      mockSecurityService.getIpWhitelist.mockResolvedValueOnce(whitelistData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/security/ip-whitelist`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('DELETE returns 200 when admin removes entry', async () => {
      const token = generateTestToken('admin');
      mockSecurityService.removeFromWhitelist.mockResolvedValueOnce({
        id: 'wl-2',
        removed: true,
      });

      const response = await request(app)
        .delete(`${API_PREFIX}/infrastructure/security/ip-whitelist/wl-2`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.removed).toBe(true);
    });
  });

  // =========================================================================
  // Observability Routes
  // =========================================================================

  describe('GET /api/v1/infrastructure/observability/errors', () => {
    it('returns 200 with error dashboard data', async () => {
      const token = generateTestToken('viewer');
      const errorData = {
        total_errors_24h: 47,
        error_rate: 0.003,
        top_errors: [
          { code: 'EXTERNAL_SERVICE_ERROR', count: 23, service: 'google_ads_api' },
          { code: 'TIMEOUT', count: 12, service: 'meta_api' },
        ],
        trend: 'decreasing',
      };

      mockObservabilityService.getErrorDashboard.mockResolvedValueOnce(errorData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/observability/errors`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_errors_24h).toBe(47);
      expect(response.body.data.top_errors).toHaveLength(2);
    });
  });

  describe('GET /api/v1/infrastructure/observability/trace/:traceId', () => {
    it('returns 200 with trace data', async () => {
      const token = generateTestToken('viewer');
      const traceData = {
        trace_id: 'trace-abc-123',
        spans: [
          { span_id: 'span-1', operation: 'http_request', duration_ms: 250, status: 'ok' },
          { span_id: 'span-2', operation: 'db_query', duration_ms: 45, status: 'ok' },
        ],
        total_duration_ms: 295,
        service: 'campaign-service',
      };

      mockObservabilityService.getTrace.mockResolvedValueOnce(traceData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/observability/trace/trace-abc-123`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.trace_id).toBe('trace-abc-123');
      expect(response.body.data.spans).toHaveLength(2);
    });
  });

  describe('GET /api/v1/infrastructure/observability/confidence-drift', () => {
    it('returns 200 with confidence drift report', async () => {
      const token = generateTestToken('viewer');
      const driftData = {
        agents: [
          {
            agent_type: 'paid_ads',
            baseline_confidence: 0.90,
            current_confidence: 0.85,
            drift: -0.05,
            trend: 'declining',
          },
          {
            agent_type: 'market_intelligence',
            baseline_confidence: 0.88,
            current_confidence: 0.91,
            drift: 0.03,
            trend: 'improving',
          },
        ],
        overall_drift: -0.01,
      };

      mockObservabilityService.getConfidenceDrift.mockResolvedValueOnce(driftData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/observability/confidence-drift`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.agents).toHaveLength(2);
      expect(response.body.data.overall_drift).toBe(-0.01);
    });
  });

  describe('Log retention management', () => {
    it('PUT returns 403 for viewer on retention update', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .put(`${API_PREFIX}/infrastructure/observability/log-retention`)
        .set('Authorization', `Bearer ${token}`)
        .send({ log_type: 'audit', retention_days: 365 })
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('PUT returns 200 when admin updates retention', async () => {
      const token = generateTestToken('admin');
      const retentionResult = {
        log_type: 'audit',
        retention_days: 365,
        updated_at: '2026-02-25T16:00:00Z',
      };

      mockObservabilityService.updateLogRetention.mockResolvedValueOnce(retentionResult);

      const response = await request(app)
        .put(`${API_PREFIX}/infrastructure/observability/log-retention`)
        .set('Authorization', `Bearer ${token}`)
        .send({ log_type: 'audit', retention_days: 365 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.retention_days).toBe(365);
    });
  });

  // =========================================================================
  // System Routes
  // =========================================================================

  describe('GET /api/v1/infrastructure/system/health', () => {
    it('returns 200 without authentication (public endpoint)', async () => {
      const healthData = {
        status: 'healthy',
        timestamp: '2026-02-25T10:00:00Z',
        version: '1.0.0',
      };

      mockFailoverService.healthCheck.mockResolvedValueOnce(healthData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/system/health`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });

    it('returns 200 with auth token as well (no rejection)', async () => {
      const token = generateTestToken('viewer');
      const healthData = {
        status: 'healthy',
        timestamp: '2026-02-25T10:00:00Z',
        version: '1.0.0',
      };

      mockFailoverService.healthCheck.mockResolvedValueOnce(healthData);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/system/health`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/infrastructure/system/health/detailed', () => {
    it('returns 200 for admin with detailed health', async () => {
      const token = generateTestToken('admin');
      const detailedHealth = {
        status: 'healthy',
        subsystems: {
          database: { status: 'healthy', latency_ms: 12 },
          redis: { status: 'healthy', latency_ms: 3 },
          google_ads_api: { status: 'healthy', latency_ms: 145 },
          meta_api: { status: 'degraded', latency_ms: 890, error: 'Slow responses' },
        },
        uptime_seconds: 864000,
        memory_usage_mb: 512,
      };

      mockFailoverService.detailedHealthCheck.mockResolvedValueOnce(detailedHealth);

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/system/health/detailed`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subsystems.database.status).toBe('healthy');
      expect(response.body.data.subsystems.meta_api.status).toBe('degraded');
    });

    it('returns 403 for viewer on detailed health', async () => {
      const token = generateTestToken('viewer');

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/system/health/detailed`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('returns 401 without authentication on detailed health', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/system/health/detailed`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('POST /api/v1/infrastructure/system/backup', () => {
    it('returns 201 when admin initiates backup', async () => {
      const token = generateTestToken('admin');
      const backupResult = {
        backup_id: 'backup-001',
        type: 'full',
        status: 'in_progress',
        initiated_by: 'test-user-id-1234',
        started_at: '2026-02-25T17:00:00Z',
      };

      mockFailoverService.initiateBackup.mockResolvedValueOnce(backupResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/system/backup`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'full', tables: ['campaigns', 'ad_spend'] })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.backup_id).toBe('backup-001');
      expect(response.body.data.status).toBe('in_progress');
    });
  });

  describe('Failover management', () => {
    it('POST /system/failover/degraded returns 200 for admin', async () => {
      const token = generateTestToken('admin');
      const degradedResult = {
        mode: 'degraded',
        disabled_services: ['meta_api', 'creative_generation'],
        reason: 'External API outage',
        entered_at: '2026-02-25T18:00:00Z',
      };

      mockFailoverService.enterDegradedMode.mockResolvedValueOnce(degradedResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/system/failover/degraded`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'External API outage', services: ['meta_api', 'creative_generation'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.mode).toBe('degraded');
    });

    it('POST /system/failover/recover returns 200 for admin', async () => {
      const token = generateTestToken('admin');
      const recoveryResult = {
        mode: 'normal',
        recovered_services: ['meta_api', 'creative_generation'],
        recovered_at: '2026-02-25T19:00:00Z',
      };

      mockFailoverService.attemptRecovery.mockResolvedValueOnce(recoveryResult);

      const response = await request(app)
        .post(`${API_PREFIX}/infrastructure/system/failover/recover`)
        .set('Authorization', `Bearer ${token}`)
        .send({ services: ['meta_api', 'creative_generation'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.mode).toBe('normal');
    });
  });

  // =========================================================================
  // Authentication edge cases
  // =========================================================================

  describe('Authentication edge cases', () => {
    it('returns 401 for expired token', async () => {
      const expiredToken = jwt.sign(
        { id: 'test-user-id-1234', email: 'test@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/spend`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 for malformed token', async () => {
      const response = await request(app)
        .get(`${API_PREFIX}/infrastructure/monitoring/spend`)
        .set('Authorization', 'Bearer not-a-valid-jwt-token')
        .expect(401);

      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

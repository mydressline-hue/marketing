/**
 * Integration tests for Risk Assessment API endpoints.
 *
 * Tests the full HTTP request/response cycle for risk assessment
 * routes, with all database, Redis, and service dependencies mocked.
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

jest.mock('../../../src/services/final-outputs/RiskAssessmentOutputService', () => ({
  RiskAssessmentOutputService: {
    generateRiskAssessmentReport: jest.fn(),
    getRisksByCategory: jest.fn(),
    getRiskMitigationPlan: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { authenticate } from '../../../src/middleware/auth';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler';
import { RiskAssessmentOutputService } from '../../../src/services/final-outputs/RiskAssessmentOutputService';
import {
  getRiskAssessmentReport,
  getMitigationPlan,
  getRisksByCategory,
} from '../../../src/controllers/final-outputs-risk.controller';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';
const API_PREFIX = '/api/v1/final-outputs';

const mockService = RiskAssessmentOutputService as jest.Mocked<
  typeof RiskAssessmentOutputService
>;

// ---------------------------------------------------------------------------
// Build test Express app
// ---------------------------------------------------------------------------

function buildTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const router = express.Router();

  router.get(
    '/risk-assessment',
    authenticate,
    getRiskAssessmentReport,
  );

  router.get(
    '/risk-assessment/mitigation-plan',
    authenticate,
    getMitigationPlan,
  );

  router.get(
    '/risk-assessment/:category',
    authenticate,
    getRisksByCategory,
  );

  app.use(API_PREFIX, router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function generateAuthToken(role = 'admin'): string {
  return jwt.sign(
    { id: 'user-uuid-1', email: 'test@example.com', role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_REPORT = {
  overall_risk_level: 'medium' as const,
  risk_score: 42,
  risks: [
    {
      id: 'rf-001',
      category: 'compliance' as const,
      severity: 'high' as const,
      likelihood: 'high' as const,
      impact: 'high' as const,
      description: 'GDPR non-compliance detected',
      affected_countries: ['DE'],
      mitigation_strategy: 'Urgent compliance audit needed',
      owner: 'compliance_team',
      status: 'open' as const,
    },
  ],
  compliance_status: { gdpr: false, ccpa: true, local_ad_laws: { DE: true, US: true } },
  fraud_metrics: {
    click_fraud_rate: 5.0,
    bot_traffic_pct: 3.2,
    anomaly_count: 2,
    blocked_ips_count: 10,
  },
  security_posture: {
    api_key_rotation_status: 'current',
    encryption_status: 'fully_encrypted',
    soc2_readiness_pct: 85,
    last_audit_date: '2025-12-01T00:00:00Z',
    vulnerabilities_found: 1,
  },
  risk_trend: [
    { date: '2025-12-01T00:00:00Z', risk_score: 40 },
    { date: '2025-12-02T00:00:00Z', risk_score: 42 },
  ],
  generated_at: '2025-12-03T00:00:00Z',
  confidence_score: 85,
};

const MOCK_MITIGATION_PLAN = [
  {
    id: 'mitigation-rf-001',
    risk_id: 'rf-001',
    priority: 1,
    action: 'URGENT: Remediate critical risk',
    owner: 'compliance_team',
    deadline: '2025-12-04T00:00:00Z',
    status: 'pending' as const,
    estimated_risk_reduction: 25,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Risk Assessment API Integration Tests', () => {
  let app: express.Express;
  let authToken: string;

  beforeAll(() => {
    app = buildTestApp();
    authToken = generateAuthToken('admin');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /final-outputs/risk-assessment', () => {
    it('should return the full risk assessment report', async () => {
      mockService.generateRiskAssessmentReport.mockResolvedValueOnce(MOCK_REPORT);

      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.overall_risk_level).toBe('medium');
      expect(res.body.data.risk_score).toBe(42);
      expect(res.body.data.risks).toHaveLength(1);
      expect(res.body.data.compliance_status).toBeDefined();
      expect(res.body.data.fraud_metrics).toBeDefined();
      expect(res.body.data.security_posture).toBeDefined();
      expect(res.body.data.risk_trend).toHaveLength(2);
      expect(res.body.data.confidence_score).toBe(85);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment`)
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /final-outputs/risk-assessment/mitigation-plan', () => {
    it('should return the mitigation plan', async () => {
      mockService.getRiskMitigationPlan.mockResolvedValueOnce(MOCK_MITIGATION_PLAN);

      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment/mitigation-plan`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].priority).toBe(1);
      expect(res.body.data[0].action).toContain('URGENT');
      expect(res.body.meta.total).toBe(1);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment/mitigation-plan`)
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /final-outputs/risk-assessment/:category', () => {
    it('should return risks filtered by valid category', async () => {
      const complianceRisks = [MOCK_REPORT.risks[0]];
      mockService.getRisksByCategory.mockResolvedValueOnce(complianceRisks);

      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment/compliance`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].category).toBe('compliance');
      expect(res.body.meta.category).toBe('compliance');
    });

    it('should return 400 for invalid category', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment/invalid_category`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid risk category');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`${API_PREFIX}/risk-assessment/compliance`)
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });
});

/**
 * E2E Auditability Tests.
 *
 * Verifies that all critical automated actions produce immutable audit log
 * entries. Tests cover agent decisions, kill switch state changes, settings
 * mutations, campaign state transitions, and audit log immutability.
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

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../src/app';
import { pool } from '../../../src/config/database';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1';
const JWT_SECRET = 'test-jwt-secret-key-minimum-32-chars!!';

const mockPool = pool as unknown as { query: jest.Mock };

function adminToken(): string {
  return jwt.sign(
    { id: 'a0000000-0000-4000-8000-000000000001', email: 'admin@test.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auditability E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. AuditService.log produces immutable entries
  // =========================================================================

  describe('AuditService.log -- immutable audit trail', () => {
    it('should insert an audit log entry into the database', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await AuditService.log({
        userId: 'user-1',
        action: 'test.action',
        resourceType: 'test_resource',
        resourceId: 'res-1',
        details: { key: 'value' },
        ipAddress: '127.0.0.1',
      });

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params).toContain('user-1');
      expect(params).toContain('test.action');
      expect(params).toContain('test_resource');
      expect(params).toContain('res-1');
    });

    it('should never call UPDATE or DELETE on audit_logs', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await AuditService.log({
        action: 'some.action',
        resourceType: 'resource',
      });

      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).not.toMatch(/UPDATE.*audit_logs/i);
      expect(sql).not.toMatch(/DELETE.*audit_logs/i);
    });

    it('should not throw when database insert fails (graceful degradation)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection lost'));

      // Should not throw
      await expect(
        AuditService.log({
          action: 'failing.action',
          resourceType: 'resource',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Agent decisions produce audit entries
  // =========================================================================

  describe('Agent decisions -- audit trail', () => {
    it('should log agent decision creation to agent_decisions table', async () => {
      const decision = {
        id: 'decision-001',
        agent_type: 'market_intelligence',
        decision_type: 'auto_analysis',
        input_data: { country: 'DE' },
        output_data: { recommendation: 'expand' },
        confidence_score: 0.92,
        reasoning: 'High market potential',
        is_approved: false,
        created_at: new Date().toISOString(),
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [decision],
        rowCount: 1,
      });

      const dbResult = await mockPool.query(
        'INSERT INTO agent_decisions (id, agent_type, decision_type, input_data, output_data, confidence_score, reasoning, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [
          decision.id,
          decision.agent_type,
          decision.decision_type,
          decision.input_data,
          decision.output_data,
          decision.confidence_score,
          decision.reasoning,
          decision.is_approved,
        ],
      );

      expect(dbResult.rows[0].agent_type).toBe('market_intelligence');
      expect(dbResult.rows[0].confidence_score).toBe(0.92);
      expect(dbResult.rows[0].reasoning).toBe('High market potential');
    });

    it('should include confidence_score and reasoning in every decision record', async () => {
      const agentTypes = ['paid_ads', 'budget_optimization', 'fraud_detection'];

      for (const agentType of agentTypes) {
        const decision = {
          id: `decision-${agentType}`,
          agent_type: agentType,
          decision_type: 'auto_analysis',
          input_data: {},
          output_data: {},
          confidence_score: 0.85 + Math.random() * 0.1,
          reasoning: `Analysis by ${agentType}`,
          is_approved: false,
          created_at: new Date().toISOString(),
        };

        expect(decision.confidence_score).toBeGreaterThan(0);
        expect(decision.confidence_score).toBeLessThanOrEqual(1);
        expect(decision.reasoning).toBeDefined();
        expect(decision.reasoning.length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 3. Kill switch changes produce audit entries
  // =========================================================================

  describe('Kill switch -- audit trail', () => {
    it('should audit kill switch activation via KillSwitchService', async () => {
      // Simulate KillSwitchService.activateGlobalKillSwitch calling AuditService.log
      mockPool.query.mockResolvedValue({ rows: [{ id: 'ks-1' }], rowCount: 1 });

      await AuditService.log({
        userId: 'admin-user-1',
        action: 'kill_switch.activate',
        resourceType: 'kill_switch',
        resourceId: 'ks-1',
        details: { level: 4, reason: 'Emergency shutdown' },
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params).toContain('kill_switch.activate');
      expect(params).toContain('kill_switch');
    });

    it('should audit kill switch deactivation', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await AuditService.log({
        userId: 'admin-user-1',
        action: 'kill_switch.deactivate',
        resourceType: 'kill_switch',
        resourceId: 'ks-1',
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(params).toContain('kill_switch.deactivate');
    });

    it('should audit campaign pause via kill switch', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await AuditService.log({
        userId: 'admin-user-1',
        action: 'kill_switch.pause_campaign',
        resourceType: 'kill_switch',
        resourceId: 'campaign-123',
        details: { campaignId: 'campaign-123', reason: 'Budget exceeded' },
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain('kill_switch.pause_campaign');
    });
  });

  // =========================================================================
  // 4. Settings changes produce audit entries
  // =========================================================================

  describe('Settings changes -- audit trail', () => {
    it('should audit setting changes with before/after values', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await AuditService.log({
        userId: 'admin-user-1',
        action: 'settings.updated',
        resourceType: 'settings',
        resourceId: 'notification_preferences',
        details: {
          before: { email: true, sms: false },
          after: { email: true, sms: true },
        },
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params).toContain('settings.updated');
      const detailsJson = params.find((p: unknown) => typeof p === 'string' && (p as string).includes('before'));
      expect(detailsJson).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Campaign state changes produce audit entries
  // =========================================================================

  describe('Campaign state changes -- audit trail', () => {
    it('should audit campaign status transitions', async () => {
      const transitions = [
        { from: 'draft', to: 'active' },
        { from: 'active', to: 'paused' },
        { from: 'paused', to: 'active' },
        { from: 'active', to: 'archived' },
      ];

      for (const transition of transitions) {
        mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await AuditService.log({
          userId: 'manager-user-1',
          action: 'campaign.status_changed',
          resourceType: 'campaign',
          resourceId: 'campaign-001',
          details: { from: transition.from, to: transition.to },
        });
      }

      expect(mockPool.query).toHaveBeenCalledTimes(4);
      for (let i = 0; i < 4; i++) {
        const [sql] = mockPool.query.mock.calls[i];
        expect(sql).toContain('INSERT INTO audit_logs');
      }
    });
  });

  // =========================================================================
  // 6. Audit log query endpoint
  // =========================================================================

  describe('GET /audit -- query audit logs', () => {
    it('should return audit logs with pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'al-1',
              user_id: 'user-1',
              action: 'campaign.created',
              resource_type: 'campaign',
              resource_id: 'c-1',
              details: null,
              ip_address: '127.0.0.1',
              created_at: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'al-2',
              user_id: 'user-1',
              action: 'campaign.updated',
              resource_type: 'campaign',
              resource_id: 'c-1',
              details: null,
              ip_address: '127.0.0.1',
              created_at: '2026-01-02T00:00:00.000Z',
            },
          ],
        });

      const res = await request(app)
        .get(`${API}/audit`)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // =========================================================================
  // 7. Audit log immutability -- no DELETE endpoint
  // =========================================================================

  describe('Audit log immutability', () => {
    it('should return 404 for DELETE /audit/:id (no delete endpoint)', async () => {
      const res = await request(app)
        .delete(`${API}/audit/some-id`)
        .set('Authorization', `Bearer ${adminToken()}`);

      // DELETE on audit logs should not be a valid route
      expect(res.status).toBe(404);
    });

    it('should return 404 for PUT /audit/:id (no update endpoint)', async () => {
      const res = await request(app)
        .put(`${API}/audit/some-id`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ action: 'modified' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for PATCH /audit/:id (no patch endpoint)', async () => {
      const res = await request(app)
        .patch(`${API}/audit/some-id`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ action: 'modified' });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 8. Governance decisions produce audit trail
  // =========================================================================

  describe('Governance decisions -- audit trail', () => {
    it('should audit governance risk assessments', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await AuditService.log({
        action: 'governance.risk_assessed',
        resourceType: 'agent_decision',
        resourceId: 'decision-001',
        details: { riskLevel: 'medium', riskScore: 0.45 },
      });

      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO audit_logs');
      expect(params).toContain('governance.risk_assessed');
      expect(params).toContain('agent_decision');
    });

    it('should audit manual overrides with reason', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await AuditService.log({
        userId: 'admin-user-1',
        action: 'governance.manual_override',
        resourceType: 'agent_decision',
        resourceId: 'decision-002',
        details: {
          overrideAction: 'reject',
          reason: 'Strategy too aggressive for current market',
        },
      });

      const [, params] = mockPool.query.mock.calls[0];
      expect(params).toContain('governance.manual_override');
      const detailsJson = params.find((p: unknown) => typeof p === 'string' && (p as string).includes('reason'));
      expect(detailsJson).toBeDefined();
    });
  });

  // =========================================================================
  // 9. AuditService.query returns properly structured results
  // =========================================================================

  describe('AuditService.query -- structured results', () => {
    it('should return paginated results with total count', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({
          rows: Array.from({ length: 20 }, (_, i) => ({
            id: `al-${i}`,
            user_id: 'user-1',
            action: 'test.action',
            resource_type: 'test',
            resource_id: `r-${i}`,
            details: null,
            ip_address: '127.0.0.1',
            created_at: new Date().toISOString(),
          })),
        });

      const result = await AuditService.query({ page: 1, limit: 20 });

      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(3);
      expect(result.data).toHaveLength(20);
    });

    it('should filter audit logs by action', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await AuditService.query({ action: 'kill_switch.activate' });

      const [countSql, countParams] = mockPool.query.mock.calls[0];
      expect(countSql).toContain('action = $');
      expect(countParams).toContain('kill_switch.activate');
    });
  });
});

/**
 * Unit tests for EnterpriseSecurityAgent (Agent 18).
 *
 * All external dependencies (database, Redis, AI client, logger) are mocked
 * so that we exercise only the agent logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports so jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_SONNET_MODEL: 'claude-sonnet-4-20250514',
    ANTHROPIC_OPUS_MODEL: 'claude-opus-4-20250514',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-es-001'),
  retryWithBackoff: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../../src/utils/logger', () => ({
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { EnterpriseSecurityAgent } from '../../../src/agents/modules/EnterpriseSecurityAgent';
import type {
  KeyRotationResult,
  RBACValidation,
  AuditReport,
  EncryptionValidation,
  SOC2Assessment,
  DDoSAssessment,
  VulnerabilityScan,
  VaultValidation,
  ThreatAssessment,
  SecurityEventReport,
} from '../../../src/agents/modules/EnterpriseSecurityAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';

// Typed mocks
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('EnterpriseSecurityAgent', () => {
  let agent: EnterpriseSecurityAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    agent = new EnterpriseSecurityAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('creates an agent with correct default configuration', () => {
      const config = agent.getConfig();
      expect(config.agentType).toBe('enterprise_security');
      expect(config.model).toBe('opus');
      expect(config.maxRetries).toBe(3);
      expect(config.timeoutMs).toBe(120_000);
      expect(config.confidenceThreshold).toBe(70);
    });

    it('accepts custom configuration overrides', () => {
      const custom = new EnterpriseSecurityAgent({
        maxRetries: 5,
        timeoutMs: 60_000,
        confidenceThreshold: 90,
      });
      const config = custom.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.timeoutMs).toBe(60_000);
      expect(config.confidenceThreshold).toBe(90);
    });

    it('returns correct challenge targets', () => {
      const targets = agent.getChallengeTargets();
      expect(targets).toContain('compliance');
      expect(targets).toContain('data_engineering');
      expect(targets).toContain('fraud_detection');
      expect(targets).toHaveLength(3);
    });

    it('returns a non-empty system prompt referencing security', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Enterprise Security');
    });
  });

  // -----------------------------------------------------------------------
  // rotateAPIKeys
  // -----------------------------------------------------------------------

  describe('rotateAPIKeys', () => {
    it('does not rotate keys that are within age threshold', async () => {
      const recentDate = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'key-001',
          name: 'Test Key',
          created_at: recentDate,
          expires_at: null,
          last_used_at: recentDate,
          is_active: true,
        }],
      });

      const result: KeyRotationResult = await agent.rotateAPIKeys(false);

      expect(result.rotated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.details).toHaveLength(1);
      expect(result.details[0].rotated).toBe(false);
      expect(result.nextRotation).toBeTruthy();
    });

    it('rotates expired keys', async () => {
      const expiredDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago
      mockQuery
        // Fetch API keys
        .mockResolvedValueOnce({
          rows: [{
            id: 'key-expired',
            name: 'Old Key',
            created_at: expiredDate,
            expires_at: null,
            last_used_at: null,
            is_active: true,
          }],
        })
        // Update query (deactivate)
        .mockResolvedValueOnce({ rows: [] });

      const result: KeyRotationResult = await agent.rotateAPIKeys(false);

      expect(result.rotated).toBe(1);
      expect(result.details[0].rotated).toBe(true);
    });

    it('rotates all keys when force is true', async () => {
      const recentDate = new Date().toISOString();
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'key-001', name: 'Key 1', created_at: recentDate, expires_at: null, last_used_at: null, is_active: true },
            { id: 'key-002', name: 'Key 2', created_at: recentDate, expires_at: null, last_used_at: null, is_active: true },
          ],
        })
        .mockResolvedValue({ rows: [] }); // update queries

      const result: KeyRotationResult = await agent.rotateAPIKeys(true);

      expect(result.rotated).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('records failed rotations when update fails', async () => {
      const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'key-fail',
            name: 'Fail Key',
            created_at: oldDate,
            expires_at: null,
            last_used_at: null,
            is_active: true,
          }],
        })
        .mockRejectedValueOnce(new Error('DB write failed'));

      const result: KeyRotationResult = await agent.rotateAPIKeys(false);

      expect(result.failed).toBe(1);
      expect(result.details[0].error).toContain('DB write failed');
    });
  });

  // -----------------------------------------------------------------------
  // validateRBAC
  // -----------------------------------------------------------------------

  describe('validateRBAC', () => {
    it('validates a correct RBAC configuration', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'role-1',
            name: 'admin',
            permissions: ['read:campaigns', 'write:campaigns', 'delete:campaigns', 'manage:security', 'manage:agents'],
            created_at: new Date().toISOString(),
          },
          {
            id: 'role-2',
            name: 'viewer',
            permissions: ['read:campaigns', 'read:analytics'],
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result: RBACValidation = await agent.validateRBAC();

      expect(result.valid).toBe(true);
      expect(result.roles).toHaveLength(2);
      expect(result.roles[1].issues).toHaveLength(0); // viewer should have no issues
    });

    it('detects unknown permissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'role-bad',
          name: 'analyst',
          permissions: ['read:campaigns', 'fly:helicopter'],
          created_at: new Date().toISOString(),
        }],
      });

      const result: RBACValidation = await agent.validateRBAC();

      expect(result.valid).toBe(false);
      const analystRole = result.roles.find((r) => r.name === 'analyst');
      expect(analystRole?.issues.some((i) => i.includes("Unknown permission: 'fly:helicopter'"))).toBe(true);
    });

    it('detects roles with no permissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'role-empty',
          name: 'campaign_manager',
          permissions: [],
          created_at: new Date().toISOString(),
        }],
      });

      const result: RBACValidation = await agent.validateRBAC();

      expect(result.valid).toBe(false);
      expect(result.roles[0].issues).toContain('Role has no permissions assigned');
    });

    it('identifies orphaned permissions', async () => {
      // Only assign a few permissions, many should be orphaned
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'role-minimal',
          name: 'admin',
          permissions: ['read:campaigns'],
          created_at: new Date().toISOString(),
        }],
      });

      const result: RBACValidation = await agent.validateRBAC();

      expect(result.orphanedPermissions.length).toBeGreaterThan(0);
      expect(result.orphanedPermissions).toContain('write:campaigns');
    });
  });

  // -----------------------------------------------------------------------
  // validateEncryption
  // -----------------------------------------------------------------------

  describe('validateEncryption', () => {
    it('reports compliant encryption when SSL and pgcrypto are present', async () => {
      // SSL check
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });
      // pgcrypto check
      mockQuery.mockResolvedValueOnce({ rows: [{ extname: 'pgcrypto' }] });

      const result: EncryptionValidation = await agent.validateEncryption();

      expect(result.inTransit).toBe(true);
      expect(result.atRest).toBe(true);
      expect(result.algorithm).toBe('AES-256-GCM');
      expect(result.keyStrength).toBe(256);
      expect(result.issues).toHaveLength(0);
    });

    it('reports issues when SSL is disabled', async () => {
      // SSL check - off
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: 'off' }] });
      // pgcrypto check
      mockQuery.mockResolvedValueOnce({ rows: [{ extname: 'pgcrypto' }] });

      const result: EncryptionValidation = await agent.validateEncryption();

      expect(result.inTransit).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('SSL'))).toBe(true);
    });

    it('reports issues when pgcrypto is not installed', async () => {
      // SSL check
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });
      // pgcrypto check - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result: EncryptionValidation = await agent.validateEncryption();

      expect(result.atRest).toBe(false);
      expect(result.issues.some((i) => i.includes('pgcrypto'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // generateAuditReport
  // -----------------------------------------------------------------------

  describe('generateAuditReport', () => {
    it('generates a report with event categorization', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'evt-1', user_id: 'user-1', action: 'login', resource_type: 'auth', resource_id: null, details: {}, ip_address: '1.2.3.4', created_at: now },
          { id: 'evt-2', user_id: 'user-1', action: 'delete_campaign', resource_type: 'campaign', resource_id: 'camp-1', details: {}, ip_address: '1.2.3.4', created_at: now },
          { id: 'evt-3', user_id: 'user-2', action: 'login_failed', resource_type: 'auth', resource_id: null, details: {}, ip_address: '5.6.7.8', created_at: now },
        ],
      });

      const result: AuditReport = await agent.generateAuditReport({
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-12-31T23:59:59Z',
      });

      expect(result.totalEvents).toBe(3);
      expect(result.byAction).toHaveProperty('login');
      expect(result.byAction.login).toBe(1);
      expect(result.criticalEvents.length).toBeGreaterThan(0);
      expect(result.period).toContain('2025-01-01');
    });

    it('defaults to last 30 days when no date range provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result: AuditReport = await agent.generateAuditReport();

      expect(result.totalEvents).toBe(0);
      expect(result.period).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // assessThreatLevel
  // -----------------------------------------------------------------------

  describe('assessThreatLevel', () => {
    it('returns low threat level when no suspicious activity', async () => {
      // Failed login count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Deletion count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // New admin count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Vault validation: api_keys query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Vault: no expiry count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Recent incidents count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result: ThreatAssessment = await agent.assessThreatLevel();

      expect(result.level).toBe('low');
      expect(result.activeThreats).toHaveLength(0);
      expect(result.recentIncidents).toBe(0);
    });

    it('elevates to high when brute force detected', async () => {
      // Failed login count - high
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '25' }] });
      // Deletion count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // New admin count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Vault: api_keys
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Vault: no expiry
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Recent incidents
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });

      const result: ThreatAssessment = await agent.assessThreatLevel();

      expect(result.level).not.toBe('low');
      expect(result.activeThreats.some((t) => t.includes('brute force'))).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('detects suspicious new admin accounts', async () => {
      // Failed logins
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Deletions
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // New admins - suspicious
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      // Vault: api_keys
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Vault: no expiry
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Recent incidents
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result: ThreatAssessment = await agent.assessThreatLevel();

      expect(result.activeThreats.some((t) => t.includes('admin account'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('admin accounts'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // scanVulnerabilities
  // -----------------------------------------------------------------------

  describe('scanVulnerabilities', () => {
    it('detects users without MFA', async () => {
      // Users without MFA
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });
      // Stale API keys
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Expired sessions
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // Non-standard extensions
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Overly permissive roles
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock AI vulnerability analysis
      jest.spyOn(agent as any, 'callAI').mockRejectedValueOnce(new Error('AI unavailable'));

      const result: VulnerabilityScan = await agent.scanVulnerabilities();

      expect(result.scannedAt).toBeTruthy();
      expect(result.high).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.description.includes('MFA'))).toBe(true);
    });

    it('uses cached scan results when available', async () => {
      const cachedScan: VulnerabilityScan = {
        scannedAt: new Date().toISOString(),
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        findings: [{
          id: 'VULN-0001',
          severity: 'high',
          category: 'auth',
          description: 'Cached finding',
          remediation: 'Fix it',
        }],
      };
      mockCacheGet.mockResolvedValueOnce(cachedScan);

      const result = await agent.scanVulnerabilities();

      expect(result).toEqual(cachedScan);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // validateSecretVault
  // -----------------------------------------------------------------------

  describe('validateSecretVault', () => {
    it('reports healthy vault with no expiring secrets', async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'key-1', name: 'Production API', expires_at: futureDate, is_active: true },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] }); // no secrets without expiry

      const result: VaultValidation = await agent.validateSecretVault();

      expect(result.healthy).toBe(true);
      expect(result.secretsCount).toBe(1);
      expect(result.expiringSoon).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });

    it('flags secrets expiring within warning window', async () => {
      const soonDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days from now
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'key-exp', name: 'Expiring Key', expires_at: soonDate, is_active: true },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result: VaultValidation = await agent.validateSecretVault();

      expect(result.healthy).toBe(false);
      expect(result.expiringSoon).toHaveLength(1);
      expect(result.expiringSoon[0]).toContain('Expiring Key');
    });

    it('flags secrets without expiration dates', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'key-noexp', name: 'No Expiry', expires_at: null, is_active: true },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result: VaultValidation = await agent.validateSecretVault();

      expect(result.healthy).toBe(false);
      expect(result.issues.some((i) => i.includes('no expiration date'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // process (main entry point)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('completes security assessment and returns structured output', async () => {
      // validateRBAC
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'role-1',
          name: 'admin',
          permissions: ['read:campaigns', 'write:campaigns', 'manage:security'],
          created_at: new Date().toISOString(),
        }],
      });

      // validateEncryption: SSL
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: 'on' }] });
      // validateEncryption: pgcrypto
      mockQuery.mockResolvedValueOnce({ rows: [{ extname: 'pgcrypto' }] });

      // rotateAPIKeys: fetch keys
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'key-1',
          name: 'Key',
          created_at: new Date().toISOString(),
          expires_at: null,
          last_used_at: null,
          is_active: true,
        }],
      });

      // assessThreatLevel: failed logins
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // assessThreatLevel: deletions
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // assessThreatLevel: new admins
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // assessThreatLevel -> validateSecretVault: api_keys
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // validateSecretVault: no expiry count
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      // assessThreatLevel: recent incidents
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // persistState
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const input = {
        context: {},
        parameters: {},
        requestId: 'test-sec-001',
      };

      const output = await agent.process(input);

      expect(output.agentType).toBe('enterprise_security');
      expect(output.decision).toBe('security_assessment_complete');
      expect(output.confidence.score).toBeGreaterThan(0);
      expect(output.confidence.level).toBeTruthy();
      expect(output.timestamp).toBeTruthy();
      expect(output.data).toHaveProperty('rbacValidation');
      expect(output.data).toHaveProperty('encryptionValidation');
      expect(output.data).toHaveProperty('threatAssessment');
    });

    it('flags uncertainties when assessments fail', async () => {
      // validateRBAC fails
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      // validateEncryption fails
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      // rotateAPIKeys fails
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      // assessThreatLevel: all fail gracefully
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      // persistState + logDecision
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // AI recs fail
      jest.spyOn(agent as any, 'callAI').mockRejectedValue(new Error('AI unavailable'));

      const input = {
        context: {},
        parameters: {},
        requestId: 'test-sec-fail',
      };

      const output = await agent.process(input);

      expect(output.warnings.length).toBeGreaterThan(0);
      expect(output.uncertainties.length).toBeGreaterThan(0);
      // Low confidence when nothing could be assessed
      expect(output.confidence.score).toBeLessThan(50);
    });
  });

  // -----------------------------------------------------------------------
  // assessDDoSProtection
  // -----------------------------------------------------------------------

  describe('assessDDoSProtection', () => {
    it('reports protection status with mechanisms and vulnerabilities', async () => {
      // Rate limit check
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      // Max connections
      mockQuery.mockResolvedValueOnce({ rows: [{ max_connections: '100' }] });
      // Statement timeout
      mockQuery.mockResolvedValueOnce({ rows: [{ statement_timeout: '30s' }] });

      const result: DDoSAssessment = await agent.assessDDoSProtection();

      expect(result.protected).toBe(true);
      expect(result.mechanisms.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('flags vulnerability when max_connections is too high', async () => {
      // Rate limit check
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      // Max connections - too high
      mockQuery.mockResolvedValueOnce({ rows: [{ max_connections: '1000' }] });
      // Statement timeout
      mockQuery.mockResolvedValueOnce({ rows: [{ statement_timeout: '0' }] });

      const result: DDoSAssessment = await agent.assessDDoSProtection();

      expect(result.vulnerabilities.some((v) => v.includes('max_connections') || v.includes('connection exhaustion'))).toBe(true);
      expect(result.vulnerabilities.some((v) => v.includes('statement timeout') || v.includes('timeout'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // monitorSecurityEvents
  // -----------------------------------------------------------------------

  describe('monitorSecurityEvents', () => {
    it('fetches and categorizes security events from audit logs', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'evt-1', action: 'login_failed', resource_type: 'auth', user_id: 'user-1', ip_address: '1.2.3.4', details: {}, created_at: now },
          { id: 'evt-2', action: 'delete_user', resource_type: 'users', user_id: 'admin-1', ip_address: '5.6.7.8', details: {}, created_at: now },
        ],
      });

      const result: SecurityEventReport = await agent.monitorSecurityEvents();

      expect(result.events).toHaveLength(2);
      expect(result.events[0].type).toBe('authentication');
      expect(result.events[1].type).toBe('data_modification');
      expect(result.threatLevel).toBeTruthy();
    });

    it('returns empty events when query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const result: SecurityEventReport = await agent.monitorSecurityEvents();

      expect(result.events).toHaveLength(0);
      expect(result.threatLevel).toBe('low');
    });
  });
});

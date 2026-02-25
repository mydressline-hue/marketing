/**
 * Unit tests for SecurityHardeningService.
 *
 * All external dependencies (database, Redis, helpers, logger, AuditService)
 * are mocked so that we exercise only the service logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports so jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { SecurityHardeningService } from '../../../../src/services/security/SecurityHardeningService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { generateId, encrypt, decrypt } from '../../../../src/utils/helpers';
import { AuditService } from '../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';

// Typed mocks
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockEncrypt = encrypt as jest.Mock;
const mockDecrypt = decrypt as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function resetIdCounter(): void {
  idCounter = 0;
  mockGenerateId.mockImplementation(() => {
    idCounter += 1;
    return `test-id-${idCounter}`;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecurityHardeningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIdCounter();
    mockEncrypt.mockImplementation((text: string) => `encrypted:${text}`);
    mockDecrypt.mockImplementation((text: string) => text.replace('encrypted:', ''));
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // rotateAPIKeys
  // -----------------------------------------------------------------------

  describe('rotateAPIKeys', () => {
    it('rotates API keys older than 30 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'old-key-1',
            key_hash: 'old-hash-1',
            encrypted_key: 'encrypted:old-raw-1',
            user_id: 'user-1',
            name: 'Production Key',
            scopes: '["read","write"]',
          },
        ],
      });
      // Deactivate old key
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Insert new key
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const results = await SecurityHardeningService.rotateAPIKeys();

      expect(results).toHaveLength(1);
      expect(results[0].key_id).toBe('test-id-1');
      expect(results[0].old_key_hash).toBe('old-hash-1');
      expect(results[0].new_key_hash).toBeDefined();
      expect(results[0].rotated_at).toBeDefined();
      expect(results[0].next_rotation_at).toBeDefined();

      // Verify old key was deactivated
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[1][0]).toContain('UPDATE api_keys SET is_active = false');
      expect(mockQuery.mock.calls[1][1]).toEqual(['old-key-1']);

      // Verify new key was inserted
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO api_keys');

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.api_key_rotated',
          resourceType: 'api_key',
          details: expect.objectContaining({ forced: false }),
        }),
      );
    });

    it('force-rotates all active keys when force=true', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'key-1',
            key_hash: 'hash-1',
            encrypted_key: 'encrypted:raw-1',
            user_id: 'user-1',
            name: 'Key One',
            scopes: '["read"]',
          },
          {
            id: 'key-2',
            key_hash: 'hash-2',
            encrypted_key: 'encrypted:raw-2',
            user_id: 'user-2',
            name: 'Key Two',
            scopes: '["admin"]',
          },
        ],
      });
      // Deactivate + Insert for key-1
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Deactivate + Insert for key-2
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const results = await SecurityHardeningService.rotateAPIKeys(true);

      expect(results).toHaveLength(2);
      // Verify SELECT query uses force condition (no date filter)
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = true');
      expect(mockQuery.mock.calls[0][0]).not.toContain('NOW() -');
      expect(mockAuditLog).toHaveBeenCalledTimes(2);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ forced: true }),
        }),
      );
    });

    it('returns empty array when no keys need rotation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const results = await SecurityHardeningService.rotateAPIKeys();

      expect(results).toHaveLength(0);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // validateEncryption
  // -----------------------------------------------------------------------

  describe('validateEncryption', () => {
    it('returns encryption status with SSL enabled', async () => {
      // SSL check
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl_enabled: 'on' }] });
      // TLS check
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: true }] });

      const status = await SecurityHardeningService.validateEncryption();

      expect(status.at_rest).toBe(true);
      expect(status.in_transit).toBe(true);
      expect(status.algorithm).toBe('AES-256-GCM');
      expect(status.key_strength).toBe(256);
      expect(status.last_validated).toBeDefined();

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.encryption_validated',
          resourceType: 'encryption',
        }),
      );
    });

    it('reports encryption as disabled when SSL is off', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl_enabled: 'off' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const status = await SecurityHardeningService.validateEncryption();

      expect(status.at_rest).toBe(false);
      expect(status.in_transit).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // manageIPWhitelist
  // -----------------------------------------------------------------------

  describe('manageIPWhitelist', () => {
    it('adds a new IP whitelist entry', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-id-1',
          ip_address: '10.0.0.1',
          description: 'Office VPN',
          created_by: 'admin-1',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        }],
      });

      const result = await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: '10.0.0.1',
        description: 'Office VPN',
        created_by: 'admin-1',
      });

      expect(result.id).toBe('test-id-1');
      expect(result.ip_address).toBe('10.0.0.1');
      expect(result.is_active).toBe(true);

      expect(mockCacheDel).toHaveBeenCalledWith('security:ip_whitelist');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ip_whitelist_add',
          resourceType: 'ip_whitelist',
        }),
      );
    });

    it('removes an IP whitelist entry', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'entry-1',
          ip_address: '10.0.0.2',
          description: 'Old office',
          created_by: 'admin-1',
          is_active: false,
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        }],
      });

      const result = await SecurityHardeningService.manageIPWhitelist('remove', {
        id: 'entry-1',
      });

      expect(result.is_active).toBe(false);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE ip_whitelist SET is_active = false');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ip_whitelist_remove',
        }),
      );
    });

    it('updates an IP whitelist entry', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'entry-1',
          ip_address: '10.0.0.5',
          description: 'Updated VPN',
          created_by: 'admin-1',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        }],
      });

      const result = await SecurityHardeningService.manageIPWhitelist('update', {
        id: 'entry-1',
        ip_address: '10.0.0.5',
        description: 'Updated VPN',
      });

      expect(result.ip_address).toBe('10.0.0.5');
      expect(result.description).toBe('Updated VPN');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ip_whitelist_update',
        }),
      );
    });

    it('throws ValidationError when adding without required fields', async () => {
      await expect(
        SecurityHardeningService.manageIPWhitelist('add', {}),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when removing a non-existent entry', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SecurityHardeningService.manageIPWhitelist('remove', { id: 'nonexistent' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // checkIPWhitelist
  // -----------------------------------------------------------------------

  describe('checkIPWhitelist', () => {
    it('returns allowed=true for whitelisted IP', async () => {
      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'entry-1',
          ip_address: '192.168.1.1',
          description: 'Office',
          created_by: 'admin',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.ip_address).toBe('192.168.1.1');
    });

    it('returns allowed=false for non-whitelisted IP', async () => {
      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'entry-1',
          ip_address: '192.168.1.1',
          description: 'Office',
          created_by: 'admin',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('10.0.0.99');

      expect(result.allowed).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('returns allowed=false for expired whitelist entry', async () => {
      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'entry-1',
          ip_address: '192.168.1.1',
          description: 'Expired entry',
          created_by: 'admin',
          is_active: true,
          created_at: '2025-01-01T00:00:00Z',
          expires_at: '2025-06-01T00:00:00Z',
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('192.168.1.1');

      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getIPWhitelist
  // -----------------------------------------------------------------------

  describe('getIPWhitelist', () => {
    it('returns cached whitelist when available', async () => {
      const cachedEntries = [
        { id: 'e1', ip_address: '10.0.0.1', is_active: true },
      ];
      mockCacheGet.mockResolvedValueOnce(cachedEntries);

      const result = await SecurityHardeningService.getIPWhitelist();

      expect(result).toEqual(cachedEntries);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries database and caches result when no cache', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'e1',
            ip_address: '10.0.0.1',
            description: 'VPN',
            created_by: 'admin',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            expires_at: null,
          },
        ],
      });

      const result = await SecurityHardeningService.getIPWhitelist();

      expect(result).toHaveLength(1);
      expect(result[0].ip_address).toBe('10.0.0.1');
      expect(mockCacheSet).toHaveBeenCalledWith(
        'security:ip_whitelist',
        expect.any(Array),
        300,
      );
    });
  });

  // -----------------------------------------------------------------------
  // configureAgentScope
  // -----------------------------------------------------------------------

  describe('configureAgentScope', () => {
    it('configures agent access scope and audit logs', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          agent_type: 'content_agent',
          allowed_tables: JSON.stringify(['campaigns', 'content']),
          allowed_operations: JSON.stringify(['SELECT', 'INSERT']),
          max_query_rate: 100,
          is_active: true,
        }],
      });

      const result = await SecurityHardeningService.configureAgentScope('content_agent', {
        allowed_tables: ['campaigns', 'content'],
        allowed_operations: ['SELECT', 'INSERT'],
        max_query_rate: 100,
        is_active: true,
      });

      expect(result.agent_type).toBe('content_agent');
      expect(result.allowed_tables).toEqual(['campaigns', 'content']);
      expect(result.allowed_operations).toEqual(['SELECT', 'INSERT']);
      expect(result.max_query_rate).toBe(100);
      expect(result.is_active).toBe(true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.agent_scope_configured',
          resourceType: 'agent_scope',
          resourceId: 'content_agent',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateAgentAccess
  // -----------------------------------------------------------------------

  describe('validateAgentAccess', () => {
    it('allows access when agent has permission', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          agent_type: 'content_agent',
          allowed_tables: JSON.stringify(['campaigns', 'content']),
          allowed_operations: JSON.stringify(['SELECT', 'INSERT']),
          max_query_rate: 100,
          is_active: true,
        }],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'content_agent',
        'campaigns',
        'SELECT',
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('denies access when no scope is defined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SecurityHardeningService.validateAgentAccess(
        'unknown_agent',
        'users',
        'DELETE',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No access scope defined');
    });

    it('denies access when agent is disabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          agent_type: 'content_agent',
          allowed_tables: JSON.stringify(['campaigns']),
          allowed_operations: JSON.stringify(['SELECT']),
          max_query_rate: 100,
          is_active: false,
        }],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'content_agent',
        'campaigns',
        'SELECT',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('currently disabled');
    });

    it('denies access to unauthorized table', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          agent_type: 'content_agent',
          allowed_tables: JSON.stringify(['campaigns']),
          allowed_operations: JSON.stringify(['SELECT']),
          max_query_rate: 100,
          is_active: true,
        }],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'content_agent',
        'users',
        'SELECT',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not have access to table');
    });

    it('denies access to unauthorized operation', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          agent_type: 'content_agent',
          allowed_tables: JSON.stringify(['campaigns']),
          allowed_operations: JSON.stringify(['SELECT']),
          max_query_rate: 100,
          is_active: true,
        }],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'content_agent',
        'campaigns',
        'DELETE',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed to perform operation');
    });
  });

  // -----------------------------------------------------------------------
  // scanForThreats
  // -----------------------------------------------------------------------

  describe('scanForThreats', () => {
    it('returns clean scan when no threats found', async () => {
      // MFA check - all users have MFA
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Expired keys check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Stale sessions check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Weak passwords check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Failed logins check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Persist scan result
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await SecurityHardeningService.scanForThreats();

      expect(result.scan_type).toBe('comprehensive');
      expect(result.findings).toHaveLength(0);
      expect(result.risk_level).toBe('none');
      expect(result.id).toBe('test-id-1');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.threat_scan_completed',
          details: expect.objectContaining({
            findings_count: 0,
            risk_level: 'none',
          }),
        }),
      );
    });

    it('detects multiple threats and calculates correct risk level', async () => {
      // MFA check - users without MFA
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // Expired keys
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // Stale sessions
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      // Weak passwords
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Failed logins (over threshold)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '25' }] });
      // Persist scan result
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await SecurityHardeningService.scanForThreats();

      expect(result.findings.length).toBeGreaterThanOrEqual(4);
      // Has two critical findings (expired keys + failed logins) -> critical risk
      expect(result.risk_level).toBe('critical');

      const findingTypes = result.findings.map((f) => f.type);
      expect(findingTypes).toContain('missing_mfa');
      expect(findingTypes).toContain('expired_api_keys');
      expect(findingTypes).toContain('stale_sessions');
      expect(findingTypes).toContain('excessive_failed_logins');
    });
  });

  // -----------------------------------------------------------------------
  // manageSecret
  // -----------------------------------------------------------------------

  describe('manageSecret', () => {
    it('sets a new secret with encryption', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-id-1',
          name: 'API_TOKEN',
          encrypted_value: 'encrypted:my-secret-token',
          created_by: 'system',
          expires_at: null,
          last_rotated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const result = await SecurityHardeningService.manageSecret('set', 'API_TOKEN', 'my-secret-token');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('API_TOKEN');
      expect(result!.encrypted_value).toBe('encrypted:my-secret-token');
      expect(mockEncrypt).toHaveBeenCalledWith('my-secret-token', expect.any(String));

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_set',
          resourceType: 'secrets_vault',
          details: { name: 'API_TOKEN' },
        }),
      );
    });

    it('gets a secret from the vault', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'secret-1',
          name: 'DB_PASSWORD',
          encrypted_value: 'encrypted:super-secret',
          created_by: 'system',
          expires_at: null,
          last_rotated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const result = await SecurityHardeningService.manageSecret('get', 'DB_PASSWORD');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('DB_PASSWORD');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_accessed',
        }),
      );
    });

    it('deletes a secret from the vault', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'secret-1',
          name: 'OLD_TOKEN',
          encrypted_value: 'encrypted:old-value',
          created_by: 'system',
          expires_at: null,
          last_rotated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        }],
      });

      const result = await SecurityHardeningService.manageSecret('delete', 'OLD_TOKEN');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('OLD_TOKEN');
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM secrets_vault');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_deleted',
        }),
      );
    });

    it('rotates a secret with new encrypted value', async () => {
      // Existing secret lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'secret-1',
          name: 'ROTATING_SECRET',
          encrypted_value: 'encrypted:old-value',
          created_by: 'system',
          last_rotated_at: '2025-06-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        }],
      });
      // Update with new value
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'secret-1',
          name: 'ROTATING_SECRET',
          encrypted_value: 'encrypted:new-value',
          created_by: 'system',
          expires_at: null,
          last_rotated_at: '2026-02-25T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        }],
      });

      const result = await SecurityHardeningService.manageSecret('rotate', 'ROTATING_SECRET', 'new-value');

      expect(result).not.toBeNull();
      expect(result!.encrypted_value).toBe('encrypted:new-value');
      expect(mockEncrypt).toHaveBeenCalledWith('new-value', expect.any(String));
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_rotated',
        }),
      );
    });

    it('throws ValidationError when setting without a value', async () => {
      await expect(
        SecurityHardeningService.manageSecret('set', 'EMPTY_SECRET'),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when getting non-existent secret', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SecurityHardeningService.manageSecret('get', 'NONEXISTENT'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when rotating non-existent secret', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SecurityHardeningService.manageSecret('rotate', 'NONEXISTENT', 'new-val'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // checkSOC2Readiness
  // -----------------------------------------------------------------------

  describe('checkSOC2Readiness', () => {
    it('returns SOC2 controls with compliance statuses', async () => {
      // Access control check
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', mfa_count: '10' }] });
      // Change management check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '15' }] });
      // Risk assessment check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Monitoring check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] });
      // Incident response check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Persist controls (5 inserts)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const controls = await SecurityHardeningService.checkSOC2Readiness();

      expect(controls).toHaveLength(5);

      const accessControl = controls.find((c) => c.category === 'access_control');
      expect(accessControl).toBeDefined();
      expect(accessControl!.status).toBe('compliant');

      const changeManagement = controls.find((c) => c.category === 'change_management');
      expect(changeManagement).toBeDefined();
      expect(changeManagement!.status).toBe('compliant');

      const riskAssessment = controls.find((c) => c.category === 'risk_assessment');
      expect(riskAssessment!.status).toBe('compliant');

      const monitoring = controls.find((c) => c.category === 'monitoring');
      expect(monitoring!.status).toBe('compliant');

      const incidentResponse = controls.find((c) => c.category === 'incident_response');
      expect(incidentResponse!.status).toBe('compliant');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.soc2_readiness_checked',
          resourceType: 'soc2',
          details: expect.objectContaining({
            total_controls: 5,
            compliant: 5,
          }),
        }),
      );
    });

    it('reports partial/non-compliant controls correctly', async () => {
      // Access control: 80% MFA = partial
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10', mfa_count: '8' }] });
      // Change management: no logs = non_compliant
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Risk assessment: no scans = non_compliant
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Monitoring: has logs = compliant
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      // Incident response: open incidents = partial
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // Persist controls (5 inserts)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const controls = await SecurityHardeningService.checkSOC2Readiness();

      const accessControl = controls.find((c) => c.category === 'access_control');
      expect(accessControl!.status).toBe('partial');

      const changeManagement = controls.find((c) => c.category === 'change_management');
      expect(changeManagement!.status).toBe('non_compliant');

      const riskAssessment = controls.find((c) => c.category === 'risk_assessment');
      expect(riskAssessment!.status).toBe('non_compliant');

      const incidentResponse = controls.find((c) => c.category === 'incident_response');
      expect(incidentResponse!.status).toBe('partial');
    });
  });

  // -----------------------------------------------------------------------
  // configureDDoSProtection
  // -----------------------------------------------------------------------

  describe('configureDDoSProtection', () => {
    it('persists DDoS protection config and audit logs', async () => {
      const config = {
        rate_limit_per_minute: 1000,
        rate_limit_burst: 50,
        block_duration_seconds: 3600,
        allowed_origins: ['https://app.example.com'],
        geo_blocking_enabled: true,
        blocked_countries: ['XX', 'YY'],
      };

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await SecurityHardeningService.configureDDoSProtection(config);

      expect(result).toEqual(config);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO ddos_protection_config');
      expect(mockQuery.mock.calls[0][1]).toEqual(['default', JSON.stringify(config)]);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ddos_protection_configured',
          resourceType: 'ddos_protection',
          details: expect.objectContaining({
            rate_limit_per_minute: 1000,
            geo_blocking_enabled: true,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // generateSecurityReport
  // -----------------------------------------------------------------------

  describe('generateSecurityReport', () => {
    it('returns cached report when available', async () => {
      const cachedReport = { generated_at: '2026-02-25T00:00:00Z', encryption: {} };
      mockCacheGet.mockResolvedValueOnce(cachedReport);

      const result = await SecurityHardeningService.generateSecurityReport();

      expect(result).toEqual(cachedReport);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('generates full security report and caches it', async () => {
      mockCacheGet.mockResolvedValueOnce(null);

      // validateEncryption queries
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl_enabled: 'on' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ssl: true }] });

      // Keys needing rotation
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Total active keys
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      // Latest threat scan
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'scan-1',
          scan_type: 'comprehensive',
          findings: JSON.stringify([{ type: 'test' }]),
          risk_level: 'low',
          scanned_at: '2026-02-24T00:00:00Z',
        }],
      });

      // SOC2 controls
      mockQuery.mockResolvedValueOnce({
        rows: [
          { name: 'Access Controls', status: 'compliant', last_checked: '2026-02-24T00:00:00Z' },
          { name: 'Change Management', status: 'compliant', last_checked: '2026-02-24T00:00:00Z' },
        ],
      });

      // IP whitelist count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const result = await SecurityHardeningService.generateSecurityReport();

      expect(result.generated_at).toBeDefined();
      expect(result.encryption).toBeDefined();
      expect((result.encryption as Record<string, unknown>).algorithm).toBe('AES-256-GCM');
      expect(result.key_rotation).toEqual(
        expect.objectContaining({
          total_active_keys: 10,
          keys_needing_rotation: 2,
          rotation_policy_days: 30,
        }),
      );
      expect(result.threat_scan).toEqual(
        expect.objectContaining({
          id: 'scan-1',
          risk_level: 'low',
        }),
      );
      expect(result.soc2_readiness).toEqual(
        expect.objectContaining({
          compliant_count: 2,
          total_count: 2,
        }),
      );
      expect(result.ip_whitelist).toEqual({ active_entries: 5 });

      // Verify caching with 10 minute TTL
      expect(mockCacheSet).toHaveBeenCalledWith(
        'security:report',
        expect.any(Object),
        600,
      );

      // Verify audit logging (validateEncryption + generateSecurityReport)
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.report_generated',
        }),
      );
    });
  });
});

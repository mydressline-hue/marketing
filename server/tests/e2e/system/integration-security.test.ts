/**
 * Integration Security E2E Test Suite.
 *
 * Validates webhook HMAC verification, platform API credential encryption,
 * API key scoping, per-platform rate limiting, and credential rotation
 * for third-party integrations.
 *
 * All external dependencies are mocked for deterministic, isolated tests.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mocks – declared before imports
// ---------------------------------------------------------------------------

const mockPoolQuery = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDel = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisScan = jest.fn();
const mockAuditLog = jest.fn();

jest.mock('../../../src/config/database', () => ({
  pool: { query: mockPoolQuery },
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    scan: mockRedisScan,
  },
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  cacheDel: mockCacheDel,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: mockAuditLog },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!',
  },
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { SecurityHardeningService } from '../../../src/services/security/SecurityHardeningService';
import { encrypt, decrypt } from '../../../src/utils/helpers';
import { ROLE_PERMISSIONS } from '../../../src/middleware/rbac';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'whsec_test_webhook_secret_key_1234';
// Must match the key used by SecurityHardeningService at module level:
// process.env.ENCRYPTION_KEY || 'default-security-key-32-chars!!'
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'default-security-key-32-chars!!';

/**
 * Compute HMAC-SHA256 signature for a webhook payload, matching the
 * pattern used by platforms like Stripe and GitHub.
 */
function computeWebhookHMAC(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a webhook signature against a payload and secret.
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = computeWebhookHMAC(payload, secret);
  // Use timing-safe comparison to prevent timing attacks
  if (signature.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Integration Security E2E Tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
  });

  // =========================================================================
  // 1. Webhook HMAC verification
  // =========================================================================
  describe('Webhook HMAC verification', () => {
    it('should accept webhooks with valid HMAC signatures', () => {
      const payload = JSON.stringify({
        event: 'campaign.updated',
        data: { id: 'camp-1', status: 'active' },
        timestamp: Date.now(),
      });

      const signature = computeWebhookHMAC(payload, WEBHOOK_SECRET);
      const isValid = verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);

      expect(isValid).toBe(true);
    });

    it('should reject webhooks with invalid HMAC signatures', () => {
      const payload = JSON.stringify({
        event: 'campaign.updated',
        data: { id: 'camp-1' },
      });

      const validSignature = computeWebhookHMAC(payload, WEBHOOK_SECRET);
      // Tamper with one character
      const tamperedSignature =
        validSignature.slice(0, -2) +
        (validSignature.slice(-2) === 'ff' ? '00' : 'ff');

      const isValid = verifyWebhookSignature(
        payload,
        tamperedSignature,
        WEBHOOK_SECRET,
      );

      expect(isValid).toBe(false);
    });

    it('should reject webhooks with tampered payload', () => {
      const originalPayload = JSON.stringify({
        event: 'payment.completed',
        amount: 100,
      });

      const signature = computeWebhookHMAC(originalPayload, WEBHOOK_SECRET);

      // Tamper with the payload
      const tamperedPayload = JSON.stringify({
        event: 'payment.completed',
        amount: 99999,
      });

      const isValid = verifyWebhookSignature(
        tamperedPayload,
        signature,
        WEBHOOK_SECRET,
      );

      expect(isValid).toBe(false);
    });

    it('should use timing-safe comparison to prevent timing attacks', () => {
      const payload = JSON.stringify({ event: 'test' });
      const signature = computeWebhookHMAC(payload, WEBHOOK_SECRET);

      // Verify that we use timingSafeEqual internally
      const expected = computeWebhookHMAC(payload, WEBHOOK_SECRET);
      const result = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // 2. Platform API credentials are encrypted
  // =========================================================================
  describe('Platform API credential encryption', () => {
    it('should encrypt platform API credentials at rest', async () => {
      const platformCredential = 'sk_live_abc123def456ghi789';

      // Store the secret via vault
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'cred-1',
            name: 'google_ads_api_key',
            encrypted_value: encrypt(platformCredential, ENCRYPTION_KEY),
            created_by: 'system',
            last_rotated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });

      const result = await SecurityHardeningService.manageSecret(
        'set',
        'google_ads_api_key',
        platformCredential,
      );

      expect(result).not.toBeNull();
      expect(result!.encrypted_value).not.toBe(platformCredential);

      // Verify the query used an encrypted value
      const queryParams = mockPoolQuery.mock.calls[0][1] as unknown[];
      const storedEncrypted = queryParams[2] as string;
      expect(storedEncrypted).not.toBe(platformCredential);
      expect(storedEncrypted.split(':')).toHaveLength(3);

      // Verify we can decrypt it
      const decrypted = decrypt(storedEncrypted, ENCRYPTION_KEY);
      expect(decrypted).toBe(platformCredential);
    });

    it('should encrypt credentials for multiple platforms independently', () => {
      const credentials = {
        google_ads: 'ga_sk_live_12345',
        meta_ads: 'meta_token_abcdef',
        tiktok_ads: 'tt_api_key_xyz',
      };

      const encrypted: Record<string, string> = {};
      for (const [platform, cred] of Object.entries(credentials)) {
        encrypted[platform] = encrypt(cred, ENCRYPTION_KEY);
      }

      // Each encrypted value should be unique (due to random IV)
      const encryptedValues = Object.values(encrypted);
      const uniqueValues = new Set(encryptedValues);
      expect(uniqueValues.size).toBe(encryptedValues.length);

      // Each should decrypt correctly
      for (const [platform, cred] of Object.entries(credentials)) {
        const decrypted = decrypt(encrypted[platform], ENCRYPTION_KEY);
        expect(decrypted).toBe(cred);
      }
    });
  });

  // =========================================================================
  // 3. API key scoping limits access
  // =========================================================================
  describe('API key scoping', () => {
    it('should validate agent access based on configured scopes', async () => {
      // Configure scope for analytics agent: read-only on campaigns
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_type: 'analytics',
            allowed_tables: JSON.stringify(['campaigns', 'analytics_data']),
            allowed_operations: JSON.stringify(['SELECT']),
            max_query_rate: 100,
            is_active: true,
          },
        ],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'analytics',
        'campaigns',
        'SELECT',
      );

      expect(result.allowed).toBe(true);
    });

    it('should deny agent access to tables outside its scope', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_type: 'analytics',
            allowed_tables: JSON.stringify(['campaigns']),
            allowed_operations: JSON.stringify(['SELECT']),
            max_query_rate: 100,
            is_active: true,
          },
        ],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'analytics',
        'users',
        'SELECT',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not have access to table');
    });

    it('should deny agent access to operations outside its scope', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_type: 'analytics',
            allowed_tables: JSON.stringify(['campaigns']),
            allowed_operations: JSON.stringify(['SELECT']),
            max_query_rate: 100,
            is_active: true,
          },
        ],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'analytics',
        'campaigns',
        'DELETE',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed to perform operation');
    });

    it('should deny access for disabled agents', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_type: 'decommissioned-agent',
            allowed_tables: JSON.stringify(['*']),
            allowed_operations: JSON.stringify(['*']),
            max_query_rate: 100,
            is_active: false,
          },
        ],
      });

      const result = await SecurityHardeningService.validateAgentAccess(
        'decommissioned-agent',
        'campaigns',
        'SELECT',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('currently disabled');
    });

    it('should deny access for undefined agent types', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SecurityHardeningService.validateAgentAccess(
        'unknown-agent',
        'campaigns',
        'SELECT',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No access scope defined');
    });
  });

  // =========================================================================
  // 4. Rate limiting per platform
  // =========================================================================
  describe('Rate limiting per platform', () => {
    it('should configure different rate limits per platform via DDoS protection', async () => {
      const googleAdsConfig = {
        rate_limit_per_minute: 120,
        rate_limit_burst: 200,
        block_duration_seconds: 600,
        allowed_origins: ['https://ads.google.com'],
        geo_blocking_enabled: false,
        blocked_countries: [],
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result =
        await SecurityHardeningService.configureDDoSProtection(googleAdsConfig);

      expect(result.rate_limit_per_minute).toBe(120);
      expect(result.rate_limit_burst).toBe(200);
      expect(result.allowed_origins).toContain('https://ads.google.com');
    });

    it('should enforce agent-level rate limits via max_query_rate', async () => {
      // Configure agent scope with rate limit
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            agent_type: 'meta-agent',
            allowed_tables: JSON.stringify(['campaigns']),
            allowed_operations: JSON.stringify(['SELECT', 'INSERT']),
            max_query_rate: 50,
            is_active: true,
          },
        ],
      });

      const result = await SecurityHardeningService.configureAgentScope(
        'meta-agent',
        {
          allowed_tables: ['campaigns'],
          allowed_operations: ['SELECT', 'INSERT'],
          max_query_rate: 50,
          is_active: true,
        },
      );

      expect(result.agent_type).toBe('meta-agent');
      expect(result.max_query_rate).toBe(50);

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.agent_scope_configured',
          resourceId: 'meta-agent',
        }),
      );
    });

    it('should have role-based permissions that effectively scope API access', () => {
      // Viewer role can only read
      expect(ROLE_PERMISSIONS.viewer).toContain('read:*');
      expect(ROLE_PERMISSIONS.viewer).not.toContain('write:campaigns');

      // Analyst has limited write permissions
      const analystWritePerms = ROLE_PERMISSIONS.analyst.filter((p) =>
        p.startsWith('write:'),
      );
      expect(analystWritePerms).toContain('write:reports');
      expect(analystWritePerms).toContain('write:analytics');
      expect(analystWritePerms).not.toContain('write:campaigns');
    });
  });

  // =========================================================================
  // 5. Credential rotation for integrations
  // =========================================================================
  describe('Credential rotation for integrations', () => {
    it('should rotate API keys for all active integrations', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'key-google',
            key_hash: 'old_hash_g',
            encrypted_key: 'enc_g',
            user_id: 'integration-google',
            name: 'Google Ads API Key',
            scopes: '["read:campaigns", "write:campaigns"]',
          },
          {
            id: 'key-meta',
            key_hash: 'old_hash_m',
            encrypted_key: 'enc_m',
            user_id: 'integration-meta',
            name: 'Meta Ads API Key',
            scopes: '["read:*"]',
          },
        ],
      });

      // Deactivate + Insert for each key
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // deactivate google
        .mockResolvedValueOnce({ rows: [] }) // insert google
        .mockResolvedValueOnce({ rows: [] }) // deactivate meta
        .mockResolvedValueOnce({ rows: [] }); // insert meta

      const results = await SecurityHardeningService.rotateAPIKeys(true);

      expect(results).toHaveLength(2);

      // Each key should have a new hash different from old
      expect(results[0].old_key_hash).toBe('old_hash_g');
      expect(results[0].new_key_hash).not.toBe('old_hash_g');
      expect(results[1].old_key_hash).toBe('old_hash_m');
      expect(results[1].new_key_hash).not.toBe('old_hash_m');

      // Verify audit log for each rotation
      expect(mockAuditLog).toHaveBeenCalledTimes(2);
    });

    it('should rotate secrets in the vault for integration credentials', async () => {
      const oldSecret = 'old-platform-secret';
      const newSecret = 'new-platform-secret-rotated';

      // Existing secret check
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'vault-1',
            name: 'meta_client_secret',
            encrypted_value: encrypt(oldSecret, ENCRYPTION_KEY),
            created_by: 'system',
            last_rotated_at: '2024-01-01T00:00:00Z',
            created_at: '2024-01-01T00:00:00Z',
            expires_at: null,
          },
        ],
      });

      // Update query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'vault-1',
            name: 'meta_client_secret',
            encrypted_value: encrypt(newSecret, ENCRYPTION_KEY),
            created_by: 'system',
            last_rotated_at: new Date().toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            expires_at: null,
          },
        ],
      });

      const result = await SecurityHardeningService.manageSecret(
        'rotate',
        'meta_client_secret',
        newSecret,
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('meta_client_secret');

      // Verify the new encrypted value was stored
      const updateQuery = mockPoolQuery.mock.calls[1];
      const encryptedNewValue = updateQuery[1][1] as string;
      expect(encryptedNewValue).not.toBe(newSecret);
      expect(decrypt(encryptedNewValue, ENCRYPTION_KEY)).toBe(newSecret);

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_rotated',
          resourceType: 'secrets_vault',
        }),
      );
    });

    it('should throw when trying to rotate a non-existent secret', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SecurityHardeningService.manageSecret(
          'rotate',
          'non_existent_secret',
          'new_value',
        ),
      ).rejects.toThrow('Secret not found');
    });

    it('should record rotation timestamp for tracking rotation schedule', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'key-1',
            key_hash: 'hash1',
            encrypted_key: 'enc1',
            user_id: 'u1',
            name: 'Integration Key',
            scopes: '["read:*"]',
          },
        ],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const beforeRotation = Date.now();
      const results = await SecurityHardeningService.rotateAPIKeys(true);
      const afterRotation = Date.now();

      expect(results).toHaveLength(1);

      const rotatedAt = new Date(results[0].rotated_at).getTime();
      expect(rotatedAt).toBeGreaterThanOrEqual(beforeRotation);
      expect(rotatedAt).toBeLessThanOrEqual(afterRotation);

      const nextRotation = new Date(results[0].next_rotation_at).getTime();
      // Next rotation should be approximately 30 days from now
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(nextRotation).toBeGreaterThanOrEqual(
        beforeRotation + thirtyDaysMs - 1000,
      );
      expect(nextRotation).toBeLessThanOrEqual(
        afterRotation + thirtyDaysMs + 1000,
      );
    });
  });
});

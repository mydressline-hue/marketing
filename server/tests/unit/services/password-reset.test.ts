/**
 * Unit tests for PasswordResetService.
 *
 * Tests cover:
 *   - Token generation (randomness and hashing)
 *   - requestReset flow (user lookup, old token invalidation, new token storage)
 *   - Token validation (valid, expired, already used, not found)
 *   - resetPassword flow (token validation, password update, session invalidation, audit log)
 *   - Edge cases (nonexistent email, null returns)
 *
 * All database interactions and crypto operations are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    }),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PASSWORD_RESET_EXPIRY_MINUTES: 60,
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('mock-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$newhashed'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (fn: Function) => {
    const mockClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    };
    return fn(mockClient);
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { PasswordResetService } from '../../../src/services/password-reset.service';
import { pool } from '../../../src/config/database';
import { hashPassword } from '../../../src/utils/helpers';
import { AuthenticationError } from '../../../src/utils/errors';

const mockPoolQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the SHA-256 hash of a token, matching the service's internal hashToken. */
function computeTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasswordResetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // requestReset
  // =========================================================================

  describe('requestReset', () => {
    it('should return null when user email does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await PasswordResetService.requestReset('nonexistent@example.com');

      expect(result).toBeNull();
      // Only the user lookup query should be called
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });

    it('should generate and return a raw token when user exists', async () => {
      // User lookup
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }],
        rowCount: 1,
      });

      // withTransaction calls: invalidate old tokens + insert new token
      mockClientQuery.mockResolvedValueOnce({ rowCount: 0 }); // invalidate old tokens
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 }); // insert new token

      const token = await PasswordResetService.requestReset('user@example.com');

      expect(token).toBeDefined();
      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
      // The token should be a hex string (64 chars for 32 bytes)
      expect(token!.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token!)).toBe(true);
    });

    it('should lowercase the email for lookup', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await PasswordResetService.requestReset('User@Example.COM');

      const queryCall = mockPoolQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe('user@example.com');
    });

    it('should invalidate existing unused tokens for the user', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }],
        rowCount: 1,
      });

      mockClientQuery.mockResolvedValueOnce({ rowCount: 2 }); // invalidate old tokens
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 }); // insert new token

      await PasswordResetService.requestReset('user@example.com');

      // Verify the invalidation query was called
      const invalidateCall = mockClientQuery.mock.calls[0];
      expect(invalidateCall[0]).toContain('UPDATE password_reset_tokens');
      expect(invalidateCall[0]).toContain('used_at IS NULL');
      expect(invalidateCall[1][0]).toBe('user-123');
    });

    it('should store the SHA-256 hash of the token, not the raw token', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }],
        rowCount: 1,
      });

      mockClientQuery.mockResolvedValueOnce({ rowCount: 0 });
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 });

      const rawToken = await PasswordResetService.requestReset('user@example.com');
      expect(rawToken).not.toBeNull();

      // Verify the INSERT query stores a hash, not the raw token
      const insertCall = mockClientQuery.mock.calls[1];
      const storedHash = insertCall[1][2]; // third parameter is the token_hash

      // The stored hash should be the SHA-256 of the raw token
      const expectedHash = computeTokenHash(rawToken!);
      expect(storedHash).toBe(expectedHash);
    });

    it('should generate different tokens on successive calls', async () => {
      const tokens: string[] = [];

      for (let i = 0; i < 3; i++) {
        mockPoolQuery.mockResolvedValueOnce({
          rows: [{ id: 'user-123' }],
          rowCount: 1,
        });
        mockClientQuery.mockResolvedValueOnce({ rowCount: 0 });
        mockClientQuery.mockResolvedValueOnce({ rowCount: 1 });

        const token = await PasswordResetService.requestReset('user@example.com');
        tokens.push(token!);
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });
  });

  // =========================================================================
  // validateToken
  // =========================================================================

  describe('validateToken', () => {
    it('should return the user ID for a valid, unexpired, unused token', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = computeTokenHash(rawToken);
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: futureDate,
          used_at: null,
        }],
        rowCount: 1,
      });

      const userId = await PasswordResetService.validateToken(rawToken);

      expect(userId).toBe('user-123');

      // Verify the query used the hashed token
      const queryCall = mockPoolQuery.mock.calls[0];
      expect(queryCall[1][0]).toBe(tokenHash);
    });

    it('should throw AuthenticationError when token is not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        PasswordResetService.validateToken('invalid-token'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when token has already been used', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          used_at: new Date().toISOString(), // already used
        }],
        rowCount: 1,
      });

      try {
        await PasswordResetService.validateToken('some-token');
        fail('Expected AuthenticationError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as Error).message).toMatch(/already been used/);
      }
    });

    it('should throw AuthenticationError when token has expired', async () => {
      const pastDate = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: pastDate,
          used_at: null,
        }],
        rowCount: 1,
      });

      try {
        await PasswordResetService.validateToken('expired-token');
        fail('Expected AuthenticationError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as Error).message).toMatch(/expired/);
      }
    });
  });

  // =========================================================================
  // resetPassword
  // =========================================================================

  describe('resetPassword', () => {
    it('should throw AuthenticationError for invalid token', async () => {
      // Token lookup returns nothing
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        PasswordResetService.resetPassword('bad-token', 'NewPassword123!'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for used token', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          used_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      await expect(
        PasswordResetService.resetPassword('used-token', 'NewPassword123!'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for expired token', async () => {
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: new Date(Date.now() - 3600_000).toISOString(),
          used_at: null,
        }],
        rowCount: 1,
      });

      await expect(
        PasswordResetService.resetPassword('expired-token', 'NewPassword123!'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('should complete the full reset flow for a valid token', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const futureDate = new Date(Date.now() + 3600_000).toISOString();

      // Token lookup (FOR UPDATE)
      mockClientQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-123',
          expires_at: futureDate,
          used_at: null,
        }],
        rowCount: 1,
      });

      // Update user password
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 });
      // Mark token as used
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 });
      // Delete sessions
      mockClientQuery.mockResolvedValueOnce({ rowCount: 3 });
      // Insert audit log
      mockClientQuery.mockResolvedValueOnce({ rowCount: 1 });

      await PasswordResetService.resetPassword(rawToken, 'NewSecurePassword123!');

      // Verify hashPassword was called with the new password
      expect(hashPassword).toHaveBeenCalledWith('NewSecurePassword123!');

      // Verify the user password update query
      const passwordUpdateCall = mockClientQuery.mock.calls[1];
      expect(passwordUpdateCall[0]).toContain('UPDATE users');
      expect(passwordUpdateCall[0]).toContain('password_hash');
      expect(passwordUpdateCall[1][0]).toBe('$2b$12$newhashed');
      expect(passwordUpdateCall[1][1]).toBe('user-123');

      // Verify token was marked as used
      const tokenUpdateCall = mockClientQuery.mock.calls[2];
      expect(tokenUpdateCall[0]).toContain('UPDATE password_reset_tokens');
      expect(tokenUpdateCall[0]).toContain('used_at');

      // Verify sessions were deleted
      const sessionDeleteCall = mockClientQuery.mock.calls[3];
      expect(sessionDeleteCall[0]).toContain('DELETE FROM sessions');
      expect(sessionDeleteCall[1][0]).toBe('user-123');

      // Verify audit log was created
      const auditCall = mockClientQuery.mock.calls[4];
      expect(auditCall[0]).toContain('INSERT INTO audit_logs');
      expect(auditCall[1][1]).toBe('user-123');
      expect(auditCall[1][2]).toBe('PASSWORD_RESET');
    });

    it('should use SHA-256 hash to look up the token', async () => {
      const rawToken = 'abc123';
      const expectedHash = computeTokenHash(rawToken);

      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      try {
        await PasswordResetService.resetPassword(rawToken, 'newpass');
      } catch {
        // Expected to fail
      }

      const lookupCall = mockClientQuery.mock.calls[0];
      expect(lookupCall[1][0]).toBe(expectedHash);
    });
  });

  // =========================================================================
  // Token hashing consistency
  // =========================================================================

  describe('token hashing', () => {
    it('should produce consistent hashes for the same token', () => {
      const token = 'my-secret-token';
      const hash1 = computeTokenHash(token);
      const hash2 = computeTokenHash(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = computeTokenHash('token-a');
      const hash2 = computeTokenHash('token-b');

      expect(hash1).not.toBe(hash2);
    });
  });
});

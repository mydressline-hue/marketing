/**
 * Unit tests for AuthService.
 *
 * All external dependencies (database, Redis, helpers, auth middleware) are
 * mocked so that we exercise only the service logic in isolation.
 */

// ---------------------------------------------------------------------------
// Mocks – must be declared before imports so jest hoists them correctly
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
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-1234'),
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
  comparePassword: jest.fn(),
}));

jest.mock('../../../src/middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { AuthService } from '../../../src/services/auth.service';
import { pool } from '../../../src/config/database';
import { generateId, hashPassword, comparePassword } from '../../../src/utils/helpers';
import { generateToken, generateRefreshToken } from '../../../src/middleware/auth';
import { AuthenticationError, ConflictError } from '../../../src/utils/errors';
import jwt from 'jsonwebtoken';

// Typed mocks for convenience
const mockQuery = pool.query as jest.Mock;
const mockComparePassword = comparePassword as jest.Mock;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: 'test-uuid-1234',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'user',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      // First query: check for existing user → no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Second query: INSERT → return the new user
      mockQuery.mockResolvedValueOnce({ rows: [TEST_USER] });

      const result = await AuthService.register(
        'alice@example.com',
        'SecurePass1',
        'Alice',
        'user',
      );

      // Verify password was hashed
      expect(hashPassword).toHaveBeenCalledWith('SecurePass1');

      // Verify INSERT was called with hashed password and lowercased email
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][1]).toEqual(
        expect.arrayContaining(['test-uuid-1234', 'alice@example.com', 'hashed-password', 'Alice', 'user']),
      );

      // Verify tokens were generated
      expect(generateToken).toHaveBeenCalledWith({
        id: TEST_USER.id,
        email: TEST_USER.email,
        role: TEST_USER.role,
      });
      expect(generateRefreshToken).toHaveBeenCalledWith({ id: TEST_USER.id });

      // Verify returned shape
      expect(result).toEqual({
        user: TEST_USER,
        token: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('throws ConflictError when email already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      await expect(
        AuthService.register('alice@example.com', 'SecurePass1', 'Alice'),
      ).rejects.toThrow(ConflictError);
    });
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe('login', () => {
    it('returns user and tokens with valid credentials', async () => {
      const dbRow = {
        ...TEST_USER,
        password_hash: 'hashed-password',
      };

      // SELECT user
      mockQuery.mockResolvedValueOnce({ rows: [dbRow] });
      // UPDATE last_login_at
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT session
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT audit_log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      mockComparePassword.mockResolvedValueOnce(true);

      const result = await AuthService.login('alice@example.com', 'SecurePass1');

      expect(comparePassword).toHaveBeenCalledWith('SecurePass1', 'hashed-password');
      expect(generateToken).toHaveBeenCalledWith({
        id: TEST_USER.id,
        email: TEST_USER.email,
        role: TEST_USER.role,
      });
      expect(generateRefreshToken).toHaveBeenCalledWith({ id: TEST_USER.id });

      expect(result.user).toEqual(
        expect.objectContaining({ id: TEST_USER.id, email: TEST_USER.email }),
      );
      expect(result.token).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
    });

    it('throws AuthenticationError with invalid password', async () => {
      const dbRow = {
        ...TEST_USER,
        password_hash: 'hashed-password',
      };

      mockQuery.mockResolvedValueOnce({ rows: [dbRow] });
      mockComparePassword.mockResolvedValueOnce(false);

      await expect(
        AuthService.login('alice@example.com', 'wrong-password'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError with non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        AuthService.login('nobody@example.com', 'password'),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------

  describe('logout', () => {
    it('removes session and logs audit event', async () => {
      // DELETE session
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT audit_log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await AuthService.logout('user-123', 'some-token');

      // First call: DELETE FROM sessions
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM sessions');
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-123', 'some-token']);

      // Second call: INSERT audit_logs
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO audit_logs');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // refreshToken
  // -----------------------------------------------------------------------

  describe('refreshToken', () => {
    it('returns new tokens with a valid refresh token', async () => {
      // Create a real refresh token to pass verification
      const validRefreshToken = jwt.sign(
        { id: 'user-123' },
        'test-secret-key-for-jwt-testing',
        { expiresIn: '7d' },
      );

      // SELECT user for the new access token
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-123', email: 'alice@example.com', role: 'user' }],
      });

      const result = await AuthService.refreshToken(validRefreshToken);

      expect(result.token).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(generateToken).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'alice@example.com',
        role: 'user',
      });
    });

    it('throws AuthenticationError with an invalid refresh token', async () => {
      await expect(
        AuthService.refreshToken('totally-bogus-token'),
      ).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError when user no longer exists', async () => {
      const validRefreshToken = jwt.sign(
        { id: 'deleted-user' },
        'test-secret-key-for-jwt-testing',
        { expiresIn: '7d' },
      );

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        AuthService.refreshToken(validRefreshToken),
      ).rejects.toThrow(AuthenticationError);
    });
  });
});

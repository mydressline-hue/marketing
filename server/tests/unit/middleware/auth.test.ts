/**
 * Unit tests for the JWT authentication middleware and token-generation
 * helpers exported from src/middleware/auth.ts.
 *
 * The env module is mocked with a fixed JWT_SECRET so we can create
 * deterministic tokens and verify them within the same test.
 */

// ---------------------------------------------------------------------------
// Mocks
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticate,
  optionalAuth,
  generateToken,
  generateRefreshToken,
} from '../../../src/middleware/auth';
import { AuthenticationError } from '../../../src/utils/errors';
import { pool } from '../../../src/config/database';

// ---------------------------------------------------------------------------
// Helpers to build mock Express objects
// ---------------------------------------------------------------------------

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response {
  return {} as unknown as Response;
}

function mockNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

const JWT_SECRET = 'test-secret-key-for-jwt-testing';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth Middleware', () => {
  // -----------------------------------------------------------------------
  // authenticate
  // -----------------------------------------------------------------------

  describe('authenticate', () => {
    it('sets req.user when a valid token is provided', async () => {
      const payload = { id: 'user-1', email: 'alice@example.com', role: 'admin' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user!.id).toBe('user-1');
      expect(req.user!.email).toBe('alice@example.com');
      expect(req.user!.role).toBe('admin');
      expect(next).toHaveBeenCalledWith();
    });

    it('calls next with AuthenticationError when no authorization header is present', async () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('calls next with AuthenticationError when token is malformed', async () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer not-a-valid-jwt' },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('calls next with AuthenticationError when token is signed with wrong secret', async () => {
      const token = jwt.sign(
        { id: 'user-1', email: 'a@b.com', role: 'user' },
        'completely-different-secret',
        { expiresIn: '1h' },
      );

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('calls next with AuthenticationError when token is expired', async () => {
      // Create a token that expired 1 hour ago
      const token = jwt.sign(
        { id: 'user-1', email: 'a@b.com', role: 'user' },
        JWT_SECRET,
        { expiresIn: '-1h' },
      );

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });
  });

  // -----------------------------------------------------------------------
  // optionalAuth
  // -----------------------------------------------------------------------

  describe('optionalAuth', () => {
    it('sets req.user to undefined when no token is provided', () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      const next = mockNext();

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('sets req.user when a valid token is provided', () => {
      const payload = { id: 'user-1', email: 'alice@example.com', role: 'admin' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      const req = mockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = mockResponse();
      const next = mockNext();

      optionalAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user!.id).toBe('user-1');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('sets req.user to undefined with invalid token and still calls next', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = mockResponse();
      const next = mockNext();

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // generateToken
  // -----------------------------------------------------------------------

  describe('generateToken', () => {
    it('returns a valid JWT containing id, email, and role', () => {
      const payload = { id: 'user-1', email: 'alice@example.com', role: 'admin' };
      const token = generateToken(payload);

      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.id).toBe('user-1');
      expect(decoded.email).toBe('alice@example.com');
      expect(decoded.role).toBe('admin');
    });

    it('includes an expiration claim', () => {
      const token = generateToken({ id: 'u1', email: 'a@b.com', role: 'user' });
      const decoded = jwt.decode(token) as Record<string, unknown>;

      expect(decoded).toHaveProperty('exp');
      expect(typeof decoded.exp).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // generateRefreshToken
  // -----------------------------------------------------------------------

  describe('generateRefreshToken', () => {
    it('returns a valid JWT containing only the user id', () => {
      const token = generateRefreshToken({ id: 'user-1' });

      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.id).toBe('user-1');
      // Refresh token should NOT include email or role
      expect(decoded).not.toHaveProperty('email');
      expect(decoded).not.toHaveProperty('role');
    });

    it('has a longer expiry than the access token', () => {
      const accessToken = generateToken({ id: 'u1', email: 'a@b.com', role: 'user' });
      const refreshToken = generateRefreshToken({ id: 'u1' });

      const accessDecoded = jwt.decode(accessToken) as { exp: number; iat: number };
      const refreshDecoded = jwt.decode(refreshToken) as { exp: number; iat: number };

      const accessLifetime = accessDecoded.exp - accessDecoded.iat;
      const refreshLifetime = refreshDecoded.exp - refreshDecoded.iat;

      // Refresh token (7d) should have a longer lifetime than access token (24h)
      expect(refreshLifetime).toBeGreaterThan(accessLifetime);
    });
  });
});

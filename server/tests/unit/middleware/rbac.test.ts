/**
 * Unit tests for the Role-Based Access Control (RBAC) middleware.
 *
 * Verifies that `requireRole` and `requirePermission` correctly allow or
 * block requests based on the authenticated user's role and the configured
 * ROLE_PERMISSIONS map.
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
import {
  requireRole,
  requirePermission,
  ROLE_PERMISSIONS,
} from '../../../src/middleware/rbac';
import {
  AuthenticationError,
  AuthorizationError,
} from '../../../src/utils/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(user?: { id: string; role: string }): Request {
  return { user } as unknown as Request;
}

function mockResponse(): Response {
  return {} as unknown as Response;
}

function mockNext(): jest.Mock {
  return jest.fn();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RBAC Middleware', () => {
  // -----------------------------------------------------------------------
  // requireRole
  // -----------------------------------------------------------------------

  describe('requireRole', () => {
    it('allows a user with a matching role', () => {
      const middleware = requireRole('admin');
      const req = mockRequest({ id: 'user-1', role: 'admin' });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows when user matches one of several accepted roles', () => {
      const middleware = requireRole('admin', 'analyst');
      const req = mockRequest({ id: 'user-1', role: 'analyst' });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks a user with a non-matching role', () => {
      const middleware = requireRole('admin');
      const req = mockRequest({ id: 'user-1', role: 'viewer' });
      const res = mockResponse();
      const next = mockNext();

      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('throws AuthenticationError when req.user is missing', () => {
      const middleware = requireRole('admin');
      const req = mockRequest(undefined);
      const res = mockResponse();
      const next = mockNext();

      expect(() => middleware(req, res, next)).toThrow(AuthenticationError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // requirePermission
  // -----------------------------------------------------------------------

  describe('requirePermission', () => {
    it('allows admin (wildcard * permission)', () => {
      const middleware = requirePermission('write:campaigns');
      const req = mockRequest({ id: 'user-1', role: 'admin' });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows a role with the exact matching permission', () => {
      // campaign_manager has 'write:campaigns'
      const middleware = requirePermission('write:campaigns');
      const req = mockRequest({ id: 'user-1', role: 'campaign_manager' });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows a role with a wildcard action permission (read:*)', () => {
      // 'viewer' has 'read:*' which should match 'read:campaigns'
      const middleware = requirePermission('read:campaigns');
      const req = mockRequest({ id: 'user-1', role: 'viewer' });
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks a role that does not have the required permission', () => {
      // 'viewer' only has 'read:*' -- should NOT have 'write:campaigns'
      const middleware = requirePermission('write:campaigns');
      const req = mockRequest({ id: 'user-1', role: 'viewer' });
      const res = mockResponse();
      const next = mockNext();

      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks an unknown role', () => {
      const middleware = requirePermission('read:campaigns');
      const req = mockRequest({ id: 'user-1', role: 'unknown_role' });
      const res = mockResponse();
      const next = mockNext();

      expect(() => middleware(req, res, next)).toThrow(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('throws AuthenticationError when req.user is missing', () => {
      const middleware = requirePermission('read:campaigns');
      const req = mockRequest(undefined);
      const res = mockResponse();
      const next = mockNext();

      expect(() => middleware(req, res, next)).toThrow(AuthenticationError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // ROLE_PERMISSIONS map sanity checks
  // -----------------------------------------------------------------------

  describe('ROLE_PERMISSIONS', () => {
    it('defines admin with wildcard permission', () => {
      expect(ROLE_PERMISSIONS.admin).toContain('*');
    });

    it('defines viewer with read-only wildcard', () => {
      expect(ROLE_PERMISSIONS.viewer).toContain('read:*');
      // Viewer should NOT have any write permissions
      const hasWrite = ROLE_PERMISSIONS.viewer.some((p) => p.startsWith('write:'));
      expect(hasWrite).toBe(false);
    });

    it('defines campaign_manager with write:campaigns', () => {
      expect(ROLE_PERMISSIONS.campaign_manager).toContain('write:campaigns');
    });
  });
});

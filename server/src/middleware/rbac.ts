/**
 * Role-Based Access Control (RBAC) middleware.
 *
 * Defines a permission system where each role is mapped to a set of
 * permissions. Middleware factories `requireRole` and `requirePermission`
 * can be applied to routes to enforce authorisation rules.
 *
 * Permission strings follow the format `action:resource` and support
 * wildcard matching at both the action and resource levels.
 */

import { Request, Response, NextFunction } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Permission = string;

interface UserPayload {
  id: string;
  role: string;
  [key: string]: unknown;
}

// Note: `req.user` is declared globally in auth.ts.
// We reuse that declaration here rather than redeclaring it.

// ---------------------------------------------------------------------------
// Role  Permission map
// ---------------------------------------------------------------------------

/**
 * Maps each role to the set of permissions it grants.
 *
 * - `*` is a wildcard that grants **all** permissions (admin only).
 * - `read:*` grants read access to every resource.
 * - Specific entries such as `write:campaigns` grant write access to a
 *   single resource type.
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['*'],
  analyst: [
    'read:*',
    'write:reports',
    'write:analytics',
    'read:campaigns',
    'read:agents',
  ],
  campaign_manager: [
    'read:*',
    'write:campaigns',
    'write:creatives',
    'write:content',
    'write:budget',
    'write:ab_tests',
    'write:video',
  ],
  viewer: ['read:*'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a role's permission set includes the requested permission.
 *
 * Matching rules:
 * 1. `*` (full wildcard) matches everything.
 * 2. `action:*` matches any permission that starts with `action:`.
 * 3. Exact string match.
 */
function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];

  if (!permissions) {
    return false;
  }

  return permissions.some((p) => {
    // Full wildcard -- role has every permission
    if (p === '*') return true;

    // Wildcard on the resource side, e.g. "read:*" matches "read:campaigns"
    if (p.endsWith(':*')) {
      const action = p.slice(0, p.indexOf(':'));
      const requestedAction = permission.slice(0, permission.indexOf(':'));
      return action === requestedAction;
    }

    // Exact match
    return p === permission;
  });
}

// ---------------------------------------------------------------------------
// Middleware factories
// ---------------------------------------------------------------------------

/**
 * Returns middleware that ensures the authenticated user holds one of the
 * supplied roles.
 *
 * @example
 * router.delete('/users/:id', requireRole('admin'), deleteUser);
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(
        `Role '${req.user.role}' is not authorised for this action. Required: ${roles.join(', ')}`,
      ));
    }

    next();
  };
}

/**
 * Returns middleware that ensures the authenticated user's role grants the
 * requested permission string.
 *
 * @example
 * router.post('/campaigns', requirePermission('write:campaigns'), createCampaign);
 */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!hasPermission(req.user.role, permission)) {
      return next(new AuthorizationError(
        `Permission '${permission}' is not granted to role '${req.user.role}'`,
      ));
    }

    next();
  };
}

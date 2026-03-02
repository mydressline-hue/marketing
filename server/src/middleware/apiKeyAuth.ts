/**
 * API Key Authentication Middleware.
 *
 * Provides Express middleware for authenticating requests via API keys
 * passed in the `X-API-Key` header. This is an alternative to JWT-based
 * authentication and supports scope-based access control, platform
 * restrictions, IP whitelisting, and per-key rate limiting.
 *
 * Also provides a combined middleware that tries JWT first, then falls
 * back to API key authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError, RateLimitError } from '../utils/errors';
import { ApiKeyScopingService } from '../services/apikey-scoping/ApiKeyScopingService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// API Key Authentication
// ---------------------------------------------------------------------------

/**
 * Returns middleware that authenticates a request using an API key from
 * the `X-API-Key` header. Optionally enforces a required scope.
 *
 * On success, attaches the key owner's user info to `req.user` in the
 * same shape used by JWT authentication (id, email, role).
 *
 * @param requiredScope - Optional scope that the key must possess.
 */
export function apiKeyAuth(requiredScope?: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKey = req.headers['x-api-key'] as string | undefined;

      if (!apiKey) {
        return next(new AuthenticationError('Missing X-API-Key header'));
      }

      // Determine the client IP for IP whitelist checks
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '';

      // Determine platform type from header or query parameter
      const platformType =
        (req.headers['x-platform-type'] as string) ||
        (req.query.platform as string) ||
        undefined;

      const result = await ApiKeyScopingService.validateScopedKey(
        apiKey,
        requiredScope,
        platformType,
        clientIp,
      );

      if (!result.isValid) {
        // Differentiate between auth failures and rate limit failures
        if (result.reason?.includes('Rate limit exceeded')) {
          return next(new RateLimitError(result.reason));
        }
        if (result.reason?.includes('not authorized for platform') ||
            result.reason?.includes('does not have required scope') ||
            result.reason?.includes('not in the API key whitelist')) {
          return next(new AuthorizationError(result.reason));
        }
        return next(new AuthenticationError(result.reason || 'API key validation failed'));
      }

      // Look up the user's email and role from the database so we can
      // populate req.user with the same shape as JWT auth
      const userResult = await pool.query(
        `SELECT id, email, role FROM users WHERE id = $1`,
        [result.userId],
      );

      if (userResult.rows.length === 0) {
        return next(new AuthenticationError('API key belongs to a non-existent user'));
      }

      const user = userResult.rows[0];

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      logger.debug('API key authentication successful', {
        userId: user.id,
        scopes: result.scopes,
        platforms: result.platforms,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// Combined Authentication (JWT + API Key)
// ---------------------------------------------------------------------------

/**
 * Returns middleware that tries JWT authentication first and, if no
 * Bearer token is present, falls back to API key authentication via
 * the `X-API-Key` header.
 *
 * This allows endpoints to accept either authentication method
 * transparently.
 *
 * @param requiredScope - Optional scope required for API key auth.
 */
export function authenticateAny(requiredScope?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string | undefined;

      // Try JWT first if an Authorization header is present
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          // Dynamically import to avoid circular dependencies
          const jwt = await import('jsonwebtoken');
          const { env } = await import('../config/env');

          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, env.JWT_SECRET!) as {
            id: string;
            email: string;
            role: string;
          };

          req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
          };

          return next();
        } catch {
          // JWT failed -- if there's also an API key, try that
          if (!apiKey) {
            return next(new AuthenticationError('Invalid or expired JWT token'));
          }
        }
      }

      // Fall back to API key authentication
      if (apiKey) {
        const handler = apiKeyAuth(requiredScope);
        return handler(req, res, next);
      }

      return next(new AuthenticationError(
        'Authentication required. Provide a Bearer token or X-API-Key header.',
      ));
    } catch (error) {
      next(error);
    }
  };
}

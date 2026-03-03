/**
 * JWT Authentication Middleware.
 *
 * Provides Express middleware for verifying JSON Web Tokens, optional
 * authentication for public-but-personalised routes, and helper functions
 * for generating access and refresh tokens.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { pool } from '../config/database';
import { AuthenticationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Module augmentation -- attach `user` to Express Request
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Creates a signed JWT containing the user's id, email, and role.
 */
export function generateToken(payload: {
  id: string;
  email: string;
  role: string;
}): string {
  return jwt.sign(payload, env.JWT_SECRET!, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Creates a signed refresh JWT containing only the user's id.
 * Uses a longer expiry window defined by `JWT_REFRESH_EXPIRES_IN`.
 */
export function generateRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, env.JWT_SECRET!, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produces a SHA-256 hex digest of the given token, matching the format
 * stored in the `sessions.token_hash` column.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Extracts a Bearer token from the Authorization header, verifies it, and
 * attaches the decoded payload to `req.user`. After JWT verification the
 * middleware checks that the session has not been revoked by querying the
 * `sessions` table. Returns 401 if the token is missing, invalid, or the
 * corresponding session has been revoked / expired.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];

    let decoded: { id: string; email: string; role: string };

    try {
      decoded = jwt.verify(token, env.JWT_SECRET!) as {
        id: string;
        email: string;
        role: string;
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw new AuthenticationError('Authentication failed');
    }

    // -----------------------------------------------------------------
    // Session validation: ensure the session has not been revoked and
    // has not expired in the database.
    // -----------------------------------------------------------------
    const tokenHash = hashToken(token);

    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash],
    );

    if (sessionResult.rows.length === 0) {
      logger.warn('Session revoked or expired', {
        userId: decoded.id,
      });
      throw new AuthenticationError('Session has been revoked or expired');
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Same as {@link authenticate} but does **not** throw when no token is
 * present. If a valid token is supplied the user is attached to the request;
 * otherwise `req.user` is set to `null` / `undefined` and the request
 * continues.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = undefined;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
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
  } catch {
    req.user = undefined;
  }

  next();
}

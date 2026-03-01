/**
 * JWT Authentication Middleware.
 *
 * Provides Express middleware for verifying JSON Web Tokens, optional
 * authentication for public-but-personalised routes, and helper functions
 * for generating access and refresh tokens.
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthenticationError } from '../utils/errors';

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
// Middleware
// ---------------------------------------------------------------------------

/**
 * Extracts a Bearer token from the Authorization header, verifies it, and
 * attaches the decoded payload to `req.user`. Throws an
 * `AuthenticationError` if the token is missing or invalid.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or invalid authorization header'));
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

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token has expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AuthenticationError('Invalid token'));
    }
    return next(new AuthenticationError('Authentication failed'));
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

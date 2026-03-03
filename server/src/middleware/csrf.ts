/**
 * CSRF Protection Middleware.
 *
 * Generates a CSRF token using `crypto.randomBytes`, stores it in a signed
 * cookie, and validates it on state-changing requests (POST, PUT, PATCH,
 * DELETE) by comparing the `X-CSRF-Token` header against the cookie value.
 *
 * Requests authenticated via API key (`X-API-Key` header) are exempt because
 * API key authentication is not cookie-based and is therefore not vulnerable
 * to CSRF attacks.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSRF_COOKIE_NAME = '_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_BYTES = 32;

/** HTTP methods that mutate state and require CSRF validation. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random CSRF token as a hex string.
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that provides CSRF protection.
 *
 * - On every request, ensures a CSRF token cookie is present (generates one
 *   if missing).
 * - On state-changing requests, validates that the `X-CSRF-Token` header
 *   matches the token stored in the cookie.
 * - Skips validation for requests authenticated via the `X-API-Key` header,
 *   since API key authentication is not susceptible to CSRF.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isProduction = env.NODE_ENV === 'production';

  // ------------------------------------------------------------------
  // 1. Ensure a CSRF token cookie exists
  // ------------------------------------------------------------------
  let csrfToken: string | undefined = req.cookies?.[CSRF_COOKIE_NAME];

  if (!csrfToken) {
    csrfToken = generateCsrfToken();

    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
    });
  }

  // ------------------------------------------------------------------
  // 2. Skip validation for non-state-changing methods (GET, HEAD, OPTIONS)
  // ------------------------------------------------------------------
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  // ------------------------------------------------------------------
  // 3. Skip validation for API-key-authenticated requests
  // ------------------------------------------------------------------
  if (req.headers['x-api-key']) {
    return next();
  }

  // ------------------------------------------------------------------
  // 4. Validate the CSRF token header against the cookie value
  // ------------------------------------------------------------------
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

  if (!headerToken || !csrfToken) {
    logger.warn('CSRF token missing', {
      method: req.method,
      path: req.path,
      hasHeader: !!headerToken,
      hasCookie: !!csrfToken,
    });
    return next(new AuthorizationError('CSRF token missing'));
  }

  // Use timing-safe comparison to prevent timing attacks
  if (headerToken.length !== csrfToken.length) {
    logger.warn('CSRF token mismatch', {
      method: req.method,
      path: req.path,
    });
    return next(new AuthorizationError('CSRF token invalid'));
  }

  const headerBuffer = Buffer.from(headerToken, 'utf8');
  const cookieBuffer = Buffer.from(csrfToken, 'utf8');

  if (!crypto.timingSafeEqual(headerBuffer, cookieBuffer)) {
    logger.warn('CSRF token mismatch', {
      method: req.method,
      path: req.path,
    });
    return next(new AuthorizationError('CSRF token invalid'));
  }

  next();
}

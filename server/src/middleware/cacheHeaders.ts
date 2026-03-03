/**
 * Cache Headers Middleware.
 *
 * Adds HTTP cache-control headers and ETag support to GET responses.
 *
 * Two cache profiles are provided:
 *
 *   - **staticData** -- for reference / slowly-changing data such as countries
 *     and settings. Sets a `public, max-age=300` header (5 minutes).
 *
 *   - **dynamicData** -- for frequently-changing data such as campaigns and
 *     dashboard endpoints. Sets `private, no-cache` so the browser always
 *     revalidates but can still use conditional requests via ETags.
 *
 * Both profiles compute an ETag from the SHA-256 hash of the serialised
 * response body. When the client sends a matching `If-None-Match` header the
 * middleware short-circuits with a 304 Not Modified response.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Cache duration constants (seconds)
// ---------------------------------------------------------------------------

/** Cache duration for static / reference data (countries, settings). */
const STATIC_DATA_MAX_AGE_SECONDS = 300; // 5 minutes

/** Cache-Control header value for static / reference data. */
const STATIC_DATA_CACHE_CONTROL = `public, max-age=${STATIC_DATA_MAX_AGE_SECONDS}`;

/** Cache-Control header value for dynamic / frequently-changing data. */
const DYNAMIC_DATA_CACHE_CONTROL = 'private, no-cache';

// ---------------------------------------------------------------------------
// ETag helper
// ---------------------------------------------------------------------------

/**
 * Compute a weak ETag from the response body string using SHA-256.
 * We use a weak ETag (`W/`) because the representation may vary by encoding.
 */
function computeETag(body: string): string {
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  // Use the first 32 hex characters (128 bits) -- more than sufficient for
  // collision avoidance while keeping the header compact.
  return `W/"${hash.substring(0, 32)}"`;
}

// ---------------------------------------------------------------------------
// Core middleware factory
// ---------------------------------------------------------------------------

type CacheProfile = 'static' | 'dynamic';

/**
 * Returns Express middleware that intercepts `res.json()` to:
 *
 * 1. Set the appropriate `Cache-Control` header.
 * 2. Compute an ETag from the serialised body.
 * 3. Return 304 if the client's `If-None-Match` matches.
 *
 * Non-GET requests are passed through without modification.
 */
function cacheHeaders(profile: CacheProfile) {
  const cacheControlValue =
    profile === 'static' ? STATIC_DATA_CACHE_CONTROL : DYNAMIC_DATA_CACHE_CONTROL;

  return (_req: Request, res: Response, next: NextFunction): void => {
    // Only apply cache headers to GET requests.
    if (_req.method !== 'GET') {
      next();
      return;
    }

    // Monkey-patch res.json so we can inspect the body before it is sent.
    const originalJson = res.json.bind(res);

    res.json = function patchedJson(body?: unknown): Response {
      const bodyString = JSON.stringify(body);
      const etag = computeETag(bodyString);

      // Set cache headers
      res.setHeader('Cache-Control', cacheControlValue);
      res.setHeader('ETag', etag);

      // Conditional GET: honour If-None-Match
      const ifNoneMatch = _req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.status(304).end();
        return res;
      }

      return originalJson(body);
    };

    next();
  };
}

// ---------------------------------------------------------------------------
// Pre-built middleware instances
// ---------------------------------------------------------------------------

/**
 * Middleware for static / reference data routes (countries, settings).
 *
 * Sets `Cache-Control: public, max-age=300` and an ETag derived from the
 * response body.
 */
export const staticCacheHeaders = cacheHeaders('static');

/**
 * Middleware for dynamic data routes (campaigns, dashboard).
 *
 * Sets `Cache-Control: private, no-cache` and an ETag derived from the
 * response body. Clients must revalidate on every request but can leverage
 * conditional GETs to avoid transferring unchanged payloads.
 */
export const dynamicCacheHeaders = cacheHeaders('dynamic');

export { STATIC_DATA_MAX_AGE_SECONDS, DYNAMIC_DATA_CACHE_CONTROL };

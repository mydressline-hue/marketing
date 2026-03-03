/**
 * Per-User Rate Limit Middleware.
 *
 * Implements a sliding-window rate limiter backed by Redis sorted sets.
 * Each authenticated user is tracked by their user ID; unauthenticated
 * requests fall back to IP-based tracking.
 *
 * The sliding window uses the ZADD + ZREMRANGEBYSCORE + ZCARD pattern:
 *   1. Remove expired entries outside the current window.
 *   2. Count remaining entries to determine usage.
 *   3. If under the limit, add a new entry for this request.
 *   4. Set a TTL on the key so Redis cleans up automatically.
 *
 * If Redis is unavailable the middleware degrades gracefully -- it logs a
 * warning and allows the request through so the service is not hard-blocked
 * by a Redis outage.
 *
 * Configuration (via environment variables):
 *   USER_RATE_LIMIT_MAX            - max requests per window (default 100)
 *   USER_RATE_LIMIT_WINDOW_SECONDS - window size in seconds  (default 60)
 *
 * Response headers on every request:
 *   X-RateLimit-Limit     - the configured max
 *   X-RateLimit-Remaining - requests left in the current window
 *   X-RateLimit-Reset     - UTC epoch seconds when the window resets
 *
 * When the limit is exceeded the middleware returns 429 with a Retry-After
 * header (in seconds).
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'user_ratelimit:';

// TTL buffer (seconds) added on top of the window so the sorted set is not
// evicted while there are still valid entries near the window boundary.
const TTL_BUFFER_SECONDS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable identifier for rate-limiting purposes.
 * Authenticated users are keyed by their user ID; anonymous requests use the
 * originating IP address (respecting X-Forwarded-For when behind a proxy).
 */
function getIdentifier(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined) ??
    req.ip ??
    req.socket.remoteAddress ??
    'unknown';

  return `ip:${ip}`;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function perUserRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const maxRequests = env.USER_RATE_LIMIT_MAX;
  const windowSeconds = env.USER_RATE_LIMIT_WINDOW_SECONDS;
  const windowMs = windowSeconds * 1000;

  const identifier = getIdentifier(req);
  const redisKey = `${KEY_PREFIX}${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Unique member for this request (timestamp + random suffix to avoid
  // collisions when multiple requests arrive in the same millisecond).
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

  // Key TTL: window + buffer so Redis garbage-collects idle keys.
  const keyTtl = windowSeconds + TTL_BUFFER_SECONDS;

  // Execute the sliding window check + record atomically via a pipeline.
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, '-inf', windowStart); // 0: prune expired
  pipeline.zcard(redisKey);                                  // 1: current count
  pipeline.zadd(redisKey, now, member);                      // 2: record request
  pipeline.expire(redisKey, keyTtl);                         // 3: refresh TTL

  pipeline
    .exec()
    .then((results) => {
      if (!results) {
        // Pipeline returned null -- Redis may be in a broken state.
        logger.warn('Per-user rate limit: Redis pipeline returned null, allowing request', {
          identifier,
        });
        setRateLimitHeaders(res, maxRequests, maxRequests - 1, now + windowMs);
        return next();
      }

      // results[1] = [err, count] from ZCARD
      const [cardErr, currentCount] = results[1];
      if (cardErr) {
        logger.warn('Per-user rate limit: Redis ZCARD error, allowing request', {
          identifier,
          error: cardErr.message,
        });
        setRateLimitHeaders(res, maxRequests, maxRequests - 1, now + windowMs);
        return next();
      }

      const count = currentCount as number;

      // The count is *before* the ZADD we just issued, so the effective
      // usage after this request will be count + 1.
      const remaining = Math.max(0, maxRequests - count - 1);
      const resetAtMs = now + windowMs;

      setRateLimitHeaders(res, maxRequests, remaining, resetAtMs);

      if (count >= maxRequests) {
        // Over the limit -- remove the member we speculatively added.
        redis.zrem(redisKey, member).catch((err) => {
          logger.warn('Per-user rate limit: failed to remove speculative member', {
            identifier,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        const retryAfterSeconds = Math.ceil(windowMs / 1000);

        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          status: 429,
          error: 'Too Many Requests',
          message: 'You have exceeded the per-user rate limit. Please try again later.',
          retryAfter: retryAfterSeconds,
        });
        return;
      }

      next();
    })
    .catch((err: unknown) => {
      // Redis is completely unavailable -- degrade gracefully.
      logger.warn('Per-user rate limit: Redis unavailable, allowing request', {
        identifier,
        error: err instanceof Error ? err.message : String(err),
      });
      setRateLimitHeaders(res, maxRequests, maxRequests - 1, now + windowMs);
      next();
    });
}

// ---------------------------------------------------------------------------
// Header helper
// ---------------------------------------------------------------------------

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAtMs: number,
): void {
  const resetEpochSeconds = Math.ceil(resetAtMs / 1000);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetEpochSeconds));
}

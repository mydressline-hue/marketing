/**
 * Platform Rate Limit Middleware.
 *
 * Express middleware factory that enforces per-platform API rate limits.
 * Uses the PlatformRateLimitService to check and record requests, and sets
 * standard rate-limit response headers on every response.
 *
 * Usage:
 * ```ts
 * router.get('/google/campaigns', platformRateLimit('google_ads'), handler);
 * ```
 *
 * Response headers set on every request:
 *   - X-RateLimit-Limit     -- the limit for the tightest window
 *   - X-RateLimit-Remaining -- remaining requests in that window
 *   - X-RateLimit-Reset     -- ISO-8601 timestamp when the window resets
 */

import { Request, Response, NextFunction } from 'express';
import { PlatformRateLimitService } from '../services/ratelimit/PlatformRateLimitService';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Returns Express middleware that rate-limits requests to a specific platform.
 *
 * When the rate limit is exceeded the middleware throws a `RateLimitError`
 * (HTTP 429) which is handled by the central error handler.
 *
 * @param platformType - The platform identifier (e.g. `google_ads`, `meta_ads`).
 */
export function platformRateLimit(platformType: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      const result = await PlatformRateLimitService.checkRateLimit(
        platformType,
        userId,
      );

      // Always set rate limit headers regardless of outcome
      res.set('X-RateLimit-Limit', String(result.limit));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', result.resetAt);

      if (!result.allowed) {
        logger.warn('Platform rate limit exceeded', {
          platform: platformType,
          userId: userId ?? 'global',
          limit: result.limit,
          resetAt: result.resetAt,
        });

        throw new RateLimitError(
          `Rate limit exceeded for platform ${platformType}. ` +
          `Limit: ${result.limit}. Resets at: ${result.resetAt}`,
        );
      }

      // Record the request against the sliding windows
      await PlatformRateLimitService.recordRequest(platformType, userId);

      next();
    } catch (error) {
      // Re-throw RateLimitError so the central error handler picks it up
      if (error instanceof RateLimitError) {
        next(error);
        return;
      }

      // For unexpected errors, log and pass through so the request isn't
      // blocked by a Redis outage.
      logger.error('Rate limit middleware error -- allowing request', {
        platform: platformType,
        error: error instanceof Error ? error.message : String(error),
      });

      next();
    }
  };
}

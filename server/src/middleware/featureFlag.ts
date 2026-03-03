/**
 * Feature Flag Middleware.
 *
 * Provides a middleware factory `requireFeature` that gates access to a route
 * behind a feature flag. If the flag is disabled (or does not exist) the
 * request receives a 404 response, making the endpoint appear non-existent
 * to clients that are not in the rollout.
 *
 * When a `userId` is available on the request (via prior authentication
 * middleware), the rollout percentage is evaluated deterministically so that
 * the same user always receives a consistent result.
 */

import { Request, Response, NextFunction } from 'express';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { NotFoundError } from '../utils/errors';

/**
 * Returns Express middleware that checks whether the given feature flag is
 * enabled before allowing the request to proceed.
 *
 * If the flag is disabled for the current user (or globally), a 404 error
 * is forwarded to the error handler so the endpoint appears to not exist.
 *
 * @param flagName - The `name` column value of the feature flag to check.
 *
 * @example
 * ```ts
 * router.get(
 *   '/new-dashboard',
 *   authenticate,
 *   requireFeature('new_dashboard'),
 *   newDashboardHandler,
 * );
 * ```
 */
export function requireFeature(flagName: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const enabled = await FeatureFlagsService.isEnabled(flagName, userId);

      if (!enabled) {
        throw new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

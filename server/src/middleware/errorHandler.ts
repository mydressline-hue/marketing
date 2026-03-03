/**
 * Express error-handling middleware.
 *
 * Provides centralised error logging, structured JSON error responses, and
 * lightweight error-count metrics that can be wired into any monitoring
 * backend. Integrates with the APM client (Sentry-ready) to forward
 * exceptions and with Prometheus-compatible counters for error tracking.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { apm } from '../services/observability/apm';
import { recordError } from '../services/observability/metrics';

// ---------------------------------------------------------------------------
// Error metrics – simple in-memory counters keyed by error code
// ---------------------------------------------------------------------------

const errorMetrics: Record<string, number> = {};

/**
 * Increment the counter for a given error code. Also records the error in
 * the Prometheus-compatible metrics service.
 */
function trackErrorMetric(code: string): void {
  errorMetrics[code] = (errorMetrics[code] ?? 0) + 1;
  recordError(code);
}

/**
 * Retrieve a snapshot of the current error counts.
 * Useful for health-check or metrics endpoints.
 */
export function getErrorMetrics(): Readonly<Record<string, number>> {
  return { ...errorMetrics };
}

// ---------------------------------------------------------------------------
// Error response helpers
// ---------------------------------------------------------------------------

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
    service?: string;
    stack?: string;
  };
}

function buildErrorResponse(err: AppError): ErrorResponseBody & { success: boolean } {
  const body = {
    success: false as const,
    error: {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    } as ErrorResponseBody['error'],
  };

  // Attach extra context from specialised error subclasses
  if (err instanceof ValidationError && err.details.length > 0) {
    body.error.details = err.details;
  }

  if (err instanceof ExternalServiceError) {
    body.error.service = err.service;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Central Express error-handling middleware.
 *
 * Must be registered **after** all route handlers so Express can forward
 * errors here.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Build a rich log context (redact sensitive fields)
  const sanitizedBody = req.body ? { ...req.body } : undefined;
  if (sanitizedBody) {
    delete sanitizedBody.password;
    delete sanitizedBody.currentPassword;
    delete sanitizedBody.newPassword;
    delete sanitizedBody.refreshToken;
  }
  const logContext: Record<string, unknown> = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    body: sanitizedBody,
    ip: req.ip,
    // Express may attach a user object via auth middleware
    user: (req as unknown as Record<string, unknown>).user ?? undefined,
  };

  // Set APM user context if available
  const user = (req as unknown as Record<string, unknown>).user as
    | { id?: string }
    | undefined;
  if (user?.id) {
    apm.setUser(user.id);
  }

  if (err instanceof AppError) {
    // ------- Known / operational errors -------
    trackErrorMetric(err.code);

    // Operational errors are expected (4xx); non-operational ones (5xx) are
    // more severe.
    if (err.isOperational) {
      logger.warn(err.message, { ...logContext, code: err.code, stack: err.stack });
    } else {
      logger.error(err.message, { ...logContext, code: err.code, stack: err.stack });
      // Forward non-operational AppErrors to APM for alerting
      apm.captureException(err, {
        requestId: req.requestId,
        code: err.code,
        url: req.originalUrl,
        method: req.method,
      });
    }

    const responseBody = buildErrorResponse(err);
    res.status(err.statusCode).json(responseBody);
    return;
  }

  // ------- Unknown / unexpected errors -------
  trackErrorMetric('UNKNOWN_ERROR');

  // Forward all unknown errors to APM -- these are the most important to catch
  apm.captureException(err, {
    requestId: req.requestId,
    url: req.originalUrl,
    method: req.method,
  });

  logger.error('Unhandled error', {
    ...logContext,
    error: err.message,
    stack: err.stack,
  });

  const isDev = process.env.NODE_ENV === 'development';

  const responseBody: ErrorResponseBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred',
      statusCode: 500,
    },
  };

  // Expose the stack trace only in development
  if (isDev) {
    responseBody.error.stack = err.stack;
  }

  res.status(500).json(responseBody);
}

/**
 * Catch-all handler for routes that do not match any registered endpoint.
 * Register this **after** all route definitions but **before** `errorHandler`.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`);
  next(error);
}

/**
 * Wraps an async route handler so that rejected promises are forwarded to
 * Express error-handling middleware automatically.
 *
 * Usage:
 * ```ts
 * router.get('/items', asyncHandler(async (req, res) => {
 *   const items = await fetchItems();
 *   res.json(items);
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

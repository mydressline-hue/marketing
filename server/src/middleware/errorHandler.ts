/**
 * Express error-handling middleware.
 *
 * Provides centralised error logging, structured JSON error responses, and
 * lightweight error-count metrics that can be wired into any monitoring
 * backend.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
} from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Error metrics – simple in-memory counters keyed by error code
// ---------------------------------------------------------------------------

const errorMetrics: Record<string, number> = {};

/**
 * Increment the counter for a given error code.
 */
function trackErrorMetric(code: string): void {
  errorMetrics[code] = (errorMetrics[code] ?? 0) + 1;
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

function buildErrorResponse(err: AppError): ErrorResponseBody {
  const body: ErrorResponseBody = {
    error: {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    },
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
  // Build a rich log context
  const logContext: Record<string, unknown> = {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    ip: req.ip,
    // Express may attach a user object via auth middleware
    user: (req as unknown as Record<string, unknown>).user ?? undefined,
  };

  if (err instanceof AppError) {
    // ------- Known / operational errors -------
    trackErrorMetric(err.code);

    // Operational errors are expected (4xx); non-operational ones (5xx) are
    // more severe.
    if (err.isOperational) {
      logger.warn(err.message, { ...logContext, code: err.code, stack: err.stack });
    } else {
      logger.error(err.message, { ...logContext, code: err.code, stack: err.stack });
    }

    const responseBody = buildErrorResponse(err);
    res.status(err.statusCode).json(responseBody);
    return;
  }

  // ------- Unknown / unexpected errors -------
  trackErrorMetric('UNKNOWN_ERROR');

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

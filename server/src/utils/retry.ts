/**
 * Retry utility with exponential backoff and jitter.
 *
 * Designed for transient failures (network blips, 5xx responses, database
 * connection drops). The jitter (+-25 %) prevents the "thundering herd"
 * problem when many callers retry at the same instant.
 */

import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts (default 3). */
  maxRetries?: number;
  /** Base delay in milliseconds before the first retry (default 1000). */
  baseDelayMs?: number;
  /** Upper cap on delay in milliseconds (default 30000). */
  maxDelayMs?: number;
  /**
   * Predicate that decides whether a given error is retriable.
   * Return `true` to retry, `false` to bail immediately.
   * By default, 5xx HTTP status codes and generic `Error` instances
   * (network / runtime errors) are considered retriable.
   */
  retryOn?: (error: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Default retriability check
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the error looks like a transient / retriable failure.
 *
 * Heuristics:
 *   - Objects with a numeric `statusCode` or `status` >= 500
 *   - Objects with `code` matching common Node.js network error codes
 *   - Plain `Error` instances (catch-all for unexpected runtime errors)
 */
function isRetriableByDefault(error: unknown): boolean {
  if (error == null) return false;

  // Check for HTTP-style status codes (Axios, fetch wrappers, AppError, etc.)
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    const status =
      typeof obj.statusCode === 'number'
        ? obj.statusCode
        : typeof obj.status === 'number'
          ? obj.status
          : undefined;

    // 4xx errors are generally not retriable (bad input, auth issues).
    if (status !== undefined && status >= 400 && status < 500) {
      return false;
    }

    // 5xx or gateway-level errors are retriable.
    if (status !== undefined && status >= 500) {
      return true;
    }

    // Common Node.js network error codes
    const networkCodes = new Set([
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EPIPE',
      'EHOSTUNREACH',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
    ]);

    if (typeof obj.code === 'string' && networkCodes.has(obj.code)) {
      return true;
    }
  }

  // Generic Error instances are retriable by default (e.g. database timeouts).
  return error instanceof Error;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Apply jitter of +-25 % to a given delay value.
 *
 * Example: a 1000 ms delay becomes a random value between 750 ms and 1250 ms.
 */
function applyJitter(delayMs: number): number {
  const jitterFactor = 0.25;
  const min = delayMs * (1 - jitterFactor);
  const max = delayMs * (1 + jitterFactor);
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Execute `fn` with automatic retries on failure.
 *
 * Uses exponential backoff: delay doubles on each attempt, capped at
 * `maxDelayMs`, with +-25 % jitter to avoid thundering herds.
 *
 * @example
 * ```ts
 * const data = await retryWithBackoff(() => fetchFromApi('/users'), {
 *   maxRetries: 5,
 *   baseDelayMs: 500,
 * });
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;
  const retryOn = options?.retryOn ?? isRetriableByDefault;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If we've exhausted retries or the error is not retriable, bail.
      if (attempt >= maxRetries || !retryOn(error)) {
        throw error;
      }

      // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay.
      const rawDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const delay = applyJitter(rawDelay);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.warn('Retrying after transient failure', {
        attempt: attempt + 1,
        maxRetries,
        nextDelayMs: delay,
        error: errorMessage,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should be unreachable, but satisfies the TypeScript compiler.
  throw lastError;
}

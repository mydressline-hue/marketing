/**
 * Promise utilities for batch operations where partial failure is acceptable.
 *
 * Wraps native `Promise.allSettled` with a friendlier return shape so callers
 * can iterate over successful results and collected errors separately without
 * manual filtering and type narrowing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettledResult<T> {
  /** Successfully resolved values (order may differ from the input array). */
  results: T[];
  /** Errors from rejected promises. */
  errors: Error[];
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Execute an array of promises concurrently, collecting successes and
 * failures into separate arrays.
 *
 * Unlike `Promise.all`, this never short-circuits on the first rejection.
 * Unlike raw `Promise.allSettled`, the return value is pre-split so
 * consumers don't have to filter/narrow the discriminated union themselves.
 *
 * @example
 * ```ts
 * const { results, errors } = await allSettledWithErrors([
 *   fetchUser(1),
 *   fetchUser(2),
 *   fetchUser(3),
 * ]);
 *
 * if (errors.length > 0) {
 *   logger.warn(`${errors.length} user fetches failed`, { errors });
 * }
 * // `results` contains the users that were fetched successfully.
 * ```
 */
export async function allSettledWithErrors<T>(
  promises: Promise<T>[],
): Promise<SettledResult<T>> {
  const outcomes = await Promise.allSettled(promises);

  const results: T[] = [];
  const errors: Error[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      // Normalise the rejection reason into an Error instance.
      const reason = outcome.reason;
      errors.push(
        reason instanceof Error ? reason : new Error(String(reason)),
      );
    }
  }

  return { results, errors };
}

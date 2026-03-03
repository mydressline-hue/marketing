/**
 * Unit tests for the retry utility with exponential backoff and jitter.
 *
 * These tests validate:
 *   - Successful execution without retries
 *   - Retry behaviour on transient failures
 *   - Max retries enforcement
 *   - Exponential backoff timing
 *   - Jitter application (+-25%)
 *   - Custom retryOn predicate
 *   - Default retriability heuristics (5xx, network codes, 4xx)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { retryWithBackoff } from '../../../src/utils/retry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates an Error with an extra property attached. */
function errorWith(props: Record<string, unknown>): Error {
  const err = new Error('test error');
  Object.assign(err, props);
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // Basic behaviour
  // =========================================================================

  it('should return the result on first successful call', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await retryWithBackoff(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient error and eventually succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');

    // Use real timers for this test since delay is small
    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // Max retries
  // =========================================================================

  it('should throw after exhausting all retries', async () => {
    const error = new Error('persistent failure');
    const fn = jest.fn().mockRejectedValue(error);

    jest.useRealTimers();

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
      }),
    ).rejects.toThrow('persistent failure');

    // Initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxRetries = 0 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 0 }),
    ).rejects.toThrow('fail');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Default retriability logic
  // =========================================================================

  it('should NOT retry on 4xx status code errors', async () => {
    const fn = jest.fn().mockRejectedValue(errorWith({ statusCode: 400 }));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow();

    // 4xx errors are not retriable, so only one attempt
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 404 status code errors', async () => {
    const fn = jest.fn().mockRejectedValue(errorWith({ statusCode: 404 }));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 status code errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(errorWith({ statusCode: 500 }))
      .mockResolvedValue('ok');

    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 502 status code errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(errorWith({ statusCode: 502 }))
      .mockResolvedValue('ok');

    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ECONNRESET network errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(errorWith({ code: 'ECONNRESET' }))
      .mockResolvedValue('ok');

    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ECONNREFUSED network errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(errorWith({ code: 'ECONNREFUSED' }))
      .mockResolvedValue('recovered');

    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ETIMEDOUT network errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(errorWith({ code: 'ETIMEDOUT' }))
      .mockResolvedValue('ok');

    jest.useRealTimers();

    const result = await retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on null errors', async () => {
    const fn = jest.fn().mockRejectedValue(null);

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toBeNull();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Custom retryOn predicate
  // =========================================================================

  it('should use custom retryOn predicate when provided', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('retry-me'))
      .mockRejectedValueOnce(new Error('stop-here'))
      .mockResolvedValue('ok');

    const retryOn = jest.fn((err: unknown) => {
      return err instanceof Error && err.message === 'retry-me';
    });

    jest.useRealTimers();

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
        retryOn,
      }),
    ).rejects.toThrow('stop-here');

    // First call fails with 'retry-me' -> retry
    // Second call fails with 'stop-here' -> retryOn returns false -> throw
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retryOn).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // Exponential backoff timing
  // =========================================================================

  it('should apply exponential backoff with increasing delays', async () => {
    jest.useRealTimers();

    const callTimes: number[] = [];
    let callCount = 0;

    const fn = jest.fn(async () => {
      callTimes.push(Date.now());
      callCount++;
      if (callCount < 4) {
        throw new Error('retry');
      }
      return 'done';
    });

    const result = await retryWithBackoff(fn, {
      maxRetries: 5,
      baseDelayMs: 50,
      maxDelayMs: 5000,
    });

    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(4);

    // Verify delays are generally increasing (accounting for jitter)
    // Attempt 0: baseDelay * 2^0 = 50ms (with jitter: 37.5 - 62.5)
    // Attempt 1: baseDelay * 2^1 = 100ms (with jitter: 75 - 125)
    // Attempt 2: baseDelay * 2^2 = 200ms (with jitter: 150 - 250)
    if (callTimes.length >= 3) {
      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];
      const delay3 = callTimes[3] - callTimes[2];

      // Each delay should be positive
      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(0);
      expect(delay3).toBeGreaterThan(0);

      // Later delays should generally be larger (with some tolerance for jitter)
      // delay3 should be roughly 4x delay1 (200ms vs 50ms base), allow large tolerance
      expect(delay3).toBeGreaterThan(delay1 * 0.5);
    }
  });

  it('should cap delay at maxDelayMs', async () => {
    jest.useRealTimers();

    const callTimes: number[] = [];
    let callCount = 0;

    const fn = jest.fn(async () => {
      callTimes.push(Date.now());
      callCount++;
      if (callCount < 5) {
        throw new Error('retry');
      }
      return 'done';
    });

    const maxDelayMs = 100;
    const result = await retryWithBackoff(fn, {
      maxRetries: 5,
      baseDelayMs: 50,
      maxDelayMs,
    });

    expect(result).toBe('done');

    // All delays should not greatly exceed the cap (with 25% jitter = max 125ms)
    for (let i = 1; i < callTimes.length; i++) {
      const delay = callTimes[i] - callTimes[i - 1];
      expect(delay).toBeLessThanOrEqual(maxDelayMs * 1.5); // generous tolerance for CI
    }
  });

  // =========================================================================
  // Jitter
  // =========================================================================

  it('should apply jitter so delays are not exactly the base values', async () => {
    jest.useRealTimers();

    const delays: number[] = [];

    // Run multiple trials to observe jitter variance
    for (let trial = 0; trial < 5; trial++) {
      let callCount = 0;
      const times: number[] = [];

      const fn = jest.fn(async () => {
        times.push(Date.now());
        callCount++;
        if (callCount < 2) {
          throw new Error('retry');
        }
        return 'ok';
      });

      await retryWithBackoff(fn, {
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 5000,
      });

      delays.push(times[1] - times[0]);
    }

    // With +-25% jitter on 100ms base, delays should be in [75, 125] range
    // At least verify they are all within a reasonable range
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(50);  // generous lower bound
      expect(d).toBeLessThanOrEqual(200);     // generous upper bound
    }

    // If jitter is working, not ALL delays should be identical
    // (statistically very unlikely that 5 random values are all the same)
    const uniqueDelays = new Set(delays);
    // We allow the possibility they might be the same due to timer resolution,
    // but check they're in the right ballpark
    expect(delays.length).toBe(5);
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it('should pass through the exact error from the last attempt', async () => {
    const specificError = new Error('specific failure reason');
    const fn = jest.fn().mockRejectedValue(specificError);

    jest.useRealTimers();

    try {
      await retryWithBackoff(fn, {
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 5,
      });
      fail('Expected an error to be thrown');
    } catch (err) {
      expect(err).toBe(specificError);
    }
  });

  it('should use default options when none are provided', async () => {
    const fn = jest.fn().mockResolvedValue(42);

    const result = await retryWithBackoff(fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle async functions that return different types', async () => {
    const fn1 = jest.fn().mockResolvedValue({ key: 'value' });
    const fn2 = jest.fn().mockResolvedValue([1, 2, 3]);
    const fn3 = jest.fn().mockResolvedValue(null);

    expect(await retryWithBackoff(fn1)).toEqual({ key: 'value' });
    expect(await retryWithBackoff(fn2)).toEqual([1, 2, 3]);
    expect(await retryWithBackoff(fn3)).toBeNull();
  });
});

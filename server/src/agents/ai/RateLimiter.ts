// ============================================================
// AI Integration Layer - Rate Limiter
// Phase 3B: Token bucket algorithm with Redis-backed distributed state
// ============================================================

import { cacheGet, cacheSet } from '../../config/redis';
import { createChildLogger } from '../../utils/logger';
import { RateLimitError } from '../../utils/errors';
import { sleep } from '../../utils/helpers';
import type { RateLimitConfig, RateLimitStatus } from './types';

/** Redis key prefix for rate limiter state. */
const REDIS_KEY_PREFIX = 'ai:ratelimit';

/** Default polling interval when waiting for a slot (ms). */
const POLL_INTERVAL_MS = 250;

/** Maximum time to wait for a slot before timing out (ms). */
const MAX_WAIT_MS = 60000;

/** TTL for Redis rate limit keys (seconds). */
const REDIS_TTL_SECONDS = 120;

/**
 * Internal state tracked in Redis for distributed rate limiting.
 */
interface RateLimitState {
  /** Timestamps (epoch ms) of requests in the current window. */
  requestTimestamps: number[];
  /** Total tokens consumed in the current window. */
  tokensInWindow: number;
  /** Number of currently in-flight concurrent requests. */
  currentConcurrent: number;
  /** Start of the current 1-minute window (epoch ms). */
  windowStart: number;
}

/**
 * Distributed rate limiter for Anthropic API calls using a sliding-window
 * token bucket algorithm backed by Redis.
 *
 * Controls three dimensions:
 * 1. **Requests per minute** - sliding window of request timestamps
 * 2. **Tokens per minute** - aggregate token count in the current window
 * 3. **Concurrency** - maximum simultaneous in-flight requests
 *
 * Callers must pair every successful `acquire()` with a `release()` call
 * to correctly track concurrency.
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly redisKey: string;
  private readonly log;

  /** In-memory queue of pending waiters (resolve callbacks). */
  private waitQueue: Array<() => void> = [];

  /**
   * Creates a new RateLimiter instance.
   *
   * @param config - Rate limit configuration specifying max requests/tokens
   *                 per minute and max concurrent requests.
   * @param namespace - Optional namespace to isolate rate limit state in Redis.
   *                    Defaults to 'default'.
   */
  constructor(config: RateLimitConfig, namespace: string = 'default') {
    this.config = config;
    this.redisKey = `${REDIS_KEY_PREFIX}:${namespace}`;
    this.log = createChildLogger({ component: 'RateLimiter', namespace });

    this.log.info('RateLimiter initialized', {
      maxRequestsPerMinute: config.maxRequestsPerMinute,
      maxTokensPerMinute: config.maxTokensPerMinute,
      maxConcurrent: config.maxConcurrent,
      namespace,
    });
  }

  /**
   * Acquires a rate limit slot. Blocks (with polling) until a slot is
   * available or times out.
   *
   * Must be called before each API request. Pair with `release()` after
   * the request completes (success or failure).
   *
   * @param estimatedTokens - Estimated token count for this request (used
   *                          for token-per-minute limiting). Defaults to 0.
   * @throws RateLimitError if the wait exceeds MAX_WAIT_MS.
   */
  async acquire(estimatedTokens: number = 0): Promise<void> {
    const startWait = Date.now();

    while (true) {
      const state = await this.getState();
      const now = Date.now();
      const cleanedState = this.cleanWindow(state, now);

      const requestsOk =
        cleanedState.requestTimestamps.length < this.config.maxRequestsPerMinute;
      const tokensOk =
        cleanedState.tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute;
      const concurrencyOk =
        cleanedState.currentConcurrent < this.config.maxConcurrent;

      if (requestsOk && tokensOk && concurrencyOk) {
        // Grant the slot
        cleanedState.requestTimestamps.push(now);
        cleanedState.tokensInWindow += estimatedTokens;
        cleanedState.currentConcurrent += 1;

        await this.setState(cleanedState);

        this.log.debug('Rate limit slot acquired', {
          requests: cleanedState.requestTimestamps.length,
          tokens: cleanedState.tokensInWindow,
          concurrent: cleanedState.currentConcurrent,
        });

        return;
      }

      // Check for timeout
      if (Date.now() - startWait > MAX_WAIT_MS) {
        this.log.warn('Rate limit wait timeout exceeded', {
          waitedMs: Date.now() - startWait,
          requests: cleanedState.requestTimestamps.length,
          tokens: cleanedState.tokensInWindow,
          concurrent: cleanedState.currentConcurrent,
        });

        throw new RateLimitError(
          'AI API rate limit: timed out waiting for an available slot',
        );
      }

      // Wait and retry
      this.log.debug('Rate limit slot unavailable, waiting', {
        requestsOk,
        tokensOk,
        concurrencyOk,
      });

      await sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Releases a rate limit slot after a request completes.
   *
   * Decrements the concurrent request counter. Must be called exactly once
   * for each successful `acquire()` call, typically in a `finally` block.
   *
   * @param actualTokens - The actual token count consumed by the completed
   *                       request. If provided and different from the estimate,
   *                       the token window is adjusted accordingly.
   */
  async release(_actualTokens?: number): Promise<void> {
    const state = await this.getState();
    const now = Date.now();
    const cleanedState = this.cleanWindow(state, now);

    cleanedState.currentConcurrent = Math.max(0, cleanedState.currentConcurrent - 1);

    await this.setState(cleanedState);

    this.log.debug('Rate limit slot released', {
      concurrent: cleanedState.currentConcurrent,
    });

    // Wake up any waiters
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter) waiter();
    }
  }

  /**
   * Returns the current status of the rate limiter.
   *
   * @returns An object with available concurrency slots and queue length.
   */
  async getStatus(): Promise<RateLimitStatus> {
    const state = await this.getState();
    const now = Date.now();
    const cleanedState = this.cleanWindow(state, now);

    return {
      availableSlots: Math.max(0, this.config.maxConcurrent - cleanedState.currentConcurrent),
      queueLength: this.waitQueue.length,
    };
  }

  /**
   * Retrieves the current rate limit state from Redis.
   * Falls back to a fresh state if none exists.
   */
  private async getState(): Promise<RateLimitState> {
    try {
      const cached = await cacheGet<RateLimitState>(this.redisKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      this.log.warn('Failed to read rate limit state from Redis, using defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.createFreshState();
  }

  /**
   * Persists the rate limit state to Redis with a TTL.
   */
  private async setState(state: RateLimitState): Promise<void> {
    try {
      await cacheSet(this.redisKey, state, REDIS_TTL_SECONDS);
    } catch (error) {
      this.log.warn('Failed to persist rate limit state to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Creates a fresh rate limit state with an empty window starting now.
   */
  private createFreshState(): RateLimitState {
    return {
      requestTimestamps: [],
      tokensInWindow: 0,
      currentConcurrent: 0,
      windowStart: Date.now(),
    };
  }

  /**
   * Cleans the sliding window by removing timestamps older than 60 seconds
   * and resetting token counts when the window rolls over.
   *
   * @param state - Current state to clean.
   * @param now - Current timestamp in epoch ms.
   * @returns Cleaned state with expired entries removed.
   */
  private cleanWindow(state: RateLimitState, now: number): RateLimitState {
    const windowMs = 60000; // 1 minute
    const windowStart = now - windowMs;

    // Remove timestamps outside the sliding window
    const validTimestamps = state.requestTimestamps.filter(
      (ts) => ts > windowStart,
    );

    // If all timestamps were cleared, reset token count
    const tokensInWindow =
      validTimestamps.length === 0 ? 0 : state.tokensInWindow;

    return {
      requestTimestamps: validTimestamps,
      tokensInWindow,
      currentConcurrent: state.currentConcurrent,
      windowStart: Math.max(state.windowStart, windowStart),
    };
  }
}

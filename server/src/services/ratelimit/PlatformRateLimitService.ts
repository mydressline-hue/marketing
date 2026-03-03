/**
 * Platform Rate Limit Service.
 *
 * Manages per-platform API rate limiting using Redis sorted sets for a
 * sliding-window algorithm. Each platform has hardcoded default limits that
 * can be overridden via the `platform_rate_limits` database table.
 *
 * Redis keys follow the pattern `ratelimit:{platform}:{userId}:{window}`
 * where window is one of `second`, `minute`, `hour`, or `day`.
 *
 * The sliding-window approach uses sorted sets (ZADD with timestamp scores)
 * and ZRANGEBYSCORE to count requests within the active window. MULTI/EXEC
 * transactions ensure atomic increment + expiry operations.
 */

import { pool } from '../../config/database';
import { redis, cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { ValidationError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformLimits {
  requests_per_second?: number;
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  concurrent_limit?: number;
  custom_config?: Record<string, unknown>;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  limit: number;
}

export interface RateLimitStatus {
  platform: string;
  windows: {
    second?: { used: number; limit: number; remaining: number; resetAt: string };
    minute?: { used: number; limit: number; remaining: number; resetAt: string };
    hour?: { used: number; limit: number; remaining: number; resetAt: string };
    day?: { used: number; limit: number; remaining: number; resetAt: string };
  };
}

export interface PlatformLimitRow {
  id: string;
  platform_type: string;
  requests_per_second: number | null;
  requests_per_minute: number | null;
  requests_per_hour: number | null;
  requests_per_day: number | null;
  concurrent_limit: number | null;
  custom_config: Record<string, unknown>;
  updated_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Window durations (milliseconds)
// ---------------------------------------------------------------------------

type WindowName = 'second' | 'minute' | 'hour' | 'day';

const WINDOW_DURATIONS: Record<WindowName, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

// TTL for sorted set keys (seconds) -- slightly longer than the window to
// avoid premature eviction while still keeping Redis clean.
const WINDOW_TTL: Record<WindowName, number> = {
  second: 5,
  minute: 120,
  hour: 7_200,
  day: 172_800,
};

// Cache key for DB overrides
const DB_CACHE_PREFIX = 'ratelimit:dbcfg:';
const DB_CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Default Platform Limits
// ---------------------------------------------------------------------------

const DEFAULT_LIMITS: Record<string, PlatformLimits> = {
  google_ads: {
    requests_per_day: 15_000,
    requests_per_hour: 1_500,
    custom_config: { mutate_per_day: 5_000 },
  },
  meta_ads: {
    requests_per_hour: 200,
    requests_per_day: 4_800,
    custom_config: { batch_per_hour: 50 },
  },
  tiktok_ads: {
    requests_per_minute: 600,
    requests_per_second: 10,
  },
  bing_ads: {
    requests_per_minute: 12_000,
  },
  snapchat_ads: {
    requests_per_minute: 100,
  },
  shopify: {
    requests_per_second: 40,
    custom_config: { graphql_per_second: 2 },
  },
  salesforce: {
    requests_per_day: 100_000,
    concurrent_limit: 25,
  },
  hubspot: {
    requests_per_second: 50,
    requests_per_day: 200_000,
    custom_config: { per_10_seconds: 500 },
  },
  klaviyo: {
    requests_per_second: 75,
    requests_per_minute: 700,
  },
  mailchimp: {
    requests_per_second: 10,
  },
  iterable: {
    requests_per_second: 500,
  },
  looker: {
    requests_per_hour: 200,
  },
  tableau: {
    requests_per_hour: 600,
  },
  powerbi: {
    requests_per_hour: 200,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redisKey(platform: string, userId: string, window: WindowName): string {
  return `ratelimit:${platform}:${userId}:${window}`;
}

function mapRowToLimits(row: Record<string, unknown>): PlatformLimitRow {
  return {
    id: row.id as string,
    platform_type: row.platform_type as string,
    requests_per_second: row.requests_per_second as number | null,
    requests_per_minute: row.requests_per_minute as number | null,
    requests_per_hour: row.requests_per_hour as number | null,
    requests_per_day: row.requests_per_day as number | null,
    concurrent_limit: row.concurrent_limit as number | null,
    custom_config: (row.custom_config as Record<string, unknown>) ?? {},
    updated_at: row.updated_at as string,
    created_at: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PlatformRateLimitService {
  // -----------------------------------------------------------------------
  // Internal: resolve effective limits (DB override > hardcoded default)
  // -----------------------------------------------------------------------

  /**
   * Resolve the effective rate limits for a platform. DB overrides take
   * precedence; if no DB row exists the hardcoded defaults are used.
   */
  private static async resolveEffectiveLimits(
    platformType: string,
  ): Promise<PlatformLimits> {
    const defaults = DEFAULT_LIMITS[platformType];
    if (!defaults) {
      throw new ValidationError(`Unknown platform type: ${platformType}`);
    }

    // Check cache first
    const cacheKey = `${DB_CACHE_PREFIX}${platformType}`;
    const cached = await cacheGet<PlatformLimitRow | null>(cacheKey);

    if (cached !== null && cached !== undefined) {
      // Merge DB overrides on top of defaults
      return PlatformRateLimitService.mergeLimits(defaults, cached);
    }

    // Query DB
    const result = await pool.query(
      'SELECT * FROM platform_rate_limits WHERE platform_type = $1',
      [platformType],
    );

    if (result.rows.length === 0) {
      // Cache the miss so we don't hit DB on every request
      await cacheSet(cacheKey, null, DB_CACHE_TTL);
      return defaults;
    }

    const dbRow = mapRowToLimits(result.rows[0]);
    await cacheSet(cacheKey, dbRow, DB_CACHE_TTL);

    return PlatformRateLimitService.mergeLimits(defaults, dbRow);
  }

  /**
   * Merge DB overrides on top of defaults. Only non-null DB values override.
   */
  private static mergeLimits(
    defaults: PlatformLimits,
    dbRow: PlatformLimitRow,
  ): PlatformLimits {
    return {
      requests_per_second:
        dbRow.requests_per_second ?? defaults.requests_per_second,
      requests_per_minute:
        dbRow.requests_per_minute ?? defaults.requests_per_minute,
      requests_per_hour:
        dbRow.requests_per_hour ?? defaults.requests_per_hour,
      requests_per_day:
        dbRow.requests_per_day ?? defaults.requests_per_day,
      concurrent_limit:
        dbRow.concurrent_limit ?? defaults.concurrent_limit,
      custom_config: {
        ...defaults.custom_config,
        ...dbRow.custom_config,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal: sliding window helpers
  // -----------------------------------------------------------------------

  /**
   * Count the number of requests in a given sliding window using a Redis
   * sorted set. Members are scored by timestamp; we count those within
   * [now - windowMs, now].
   */
  private static async getWindowCount(
    key: string,
    windowMs: number,
  ): Promise<number> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up expired entries and count remaining in one pipeline
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zcard(key);
    const results = await pipeline.exec();

    if (!results || results.length < 2) {
      return 0;
    }

    // results[1] = [err, count]
    const [err, count] = results[1];
    if (err) {
      logger.error('Redis error counting window', { key, error: err.message });
      return 0;
    }

    return count as number;
  }

  /**
   * Record a request in the sliding window sorted set. Uses MULTI/EXEC
   * for atomic ZADD + EXPIRE.
   */
  private static async addToWindow(
    key: string,
    windowName: WindowName,
  ): Promise<void> {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    const pipeline = redis.multi();
    pipeline.zadd(key, now, member);
    pipeline.expire(key, WINDOW_TTL[windowName]);
    await pipeline.exec();
  }

  /**
   * Build the window entries that have configured limits for a given platform.
   */
  private static buildWindowEntries(
    limits: PlatformLimits,
  ): Array<{ window: WindowName; limit: number }> {
    const entries: Array<{ window: WindowName; limit: number }> = [];

    if (limits.requests_per_second !== undefined) {
      entries.push({ window: 'second', limit: limits.requests_per_second });
    }
    if (limits.requests_per_minute !== undefined) {
      entries.push({ window: 'minute', limit: limits.requests_per_minute });
    }
    if (limits.requests_per_hour !== undefined) {
      entries.push({ window: 'hour', limit: limits.requests_per_hour });
    }
    if (limits.requests_per_day !== undefined) {
      entries.push({ window: 'day', limit: limits.requests_per_day });
    }

    return entries;
  }

  // -----------------------------------------------------------------------
  // Public: checkRateLimit
  // -----------------------------------------------------------------------

  /**
   * Check whether a request to the given platform is allowed under the
   * current rate limits. Does NOT consume a request slot.
   *
   * Returns the result for the **tightest** (most constrained) window.
   */
  static async checkRateLimit(
    platformType: string,
    userId?: string,
  ): Promise<RateLimitCheckResult> {
    const effectiveUserId = userId ?? 'global';
    const limits = await PlatformRateLimitService.resolveEffectiveLimits(platformType);
    const windowEntries = PlatformRateLimitService.buildWindowEntries(limits);

    if (windowEntries.length === 0) {
      return {
        allowed: true,
        remaining: Infinity,
        resetAt: new Date().toISOString(),
        limit: 0,
      };
    }

    let tightestRemaining = Infinity;
    let tightestLimit = 0;
    let tightestResetAt = new Date().toISOString();
    let allowed = true;

    for (const entry of windowEntries) {
      const key = redisKey(platformType, effectiveUserId, entry.window);
      const count = await PlatformRateLimitService.getWindowCount(
        key,
        WINDOW_DURATIONS[entry.window],
      );

      const remaining = Math.max(0, entry.limit - count);
      const resetAt = new Date(
        Date.now() + WINDOW_DURATIONS[entry.window],
      ).toISOString();

      if (remaining === 0) {
        allowed = false;
      }

      if (remaining < tightestRemaining) {
        tightestRemaining = remaining;
        tightestLimit = entry.limit;
        tightestResetAt = resetAt;
      }
    }

    return {
      allowed,
      remaining: tightestRemaining === Infinity ? 0 : tightestRemaining,
      resetAt: tightestResetAt,
      limit: tightestLimit,
    };
  }

  // -----------------------------------------------------------------------
  // Public: recordRequest
  // -----------------------------------------------------------------------

  /**
   * Record a successful request against all configured windows for a
   * platform. Call this **after** the request has been executed.
   */
  static async recordRequest(
    platformType: string,
    userId?: string,
  ): Promise<void> {
    const effectiveUserId = userId ?? 'global';
    const limits = await PlatformRateLimitService.resolveEffectiveLimits(platformType);
    const windowEntries = PlatformRateLimitService.buildWindowEntries(limits);

    const promises = windowEntries.map((entry) => {
      const key = redisKey(platformType, effectiveUserId, entry.window);
      return PlatformRateLimitService.addToWindow(key, entry.window);
    });

    await Promise.all(promises);

    logger.debug('Rate limit request recorded', {
      platform: platformType,
      userId: effectiveUserId,
    });
  }

  // -----------------------------------------------------------------------
  // Public: getRateLimitStatus
  // -----------------------------------------------------------------------

  /**
   * Get detailed rate limit usage for a specific platform without
   * consuming a request slot.
   */
  static async getRateLimitStatus(
    platformType: string,
    userId?: string,
  ): Promise<RateLimitStatus> {
    const effectiveUserId = userId ?? 'global';
    const limits = await PlatformRateLimitService.resolveEffectiveLimits(platformType);
    const windowEntries = PlatformRateLimitService.buildWindowEntries(limits);

    const status: RateLimitStatus = {
      platform: platformType,
      windows: {},
    };

    for (const entry of windowEntries) {
      const key = redisKey(platformType, effectiveUserId, entry.window);
      const used = await PlatformRateLimitService.getWindowCount(
        key,
        WINDOW_DURATIONS[entry.window],
      );

      const remaining = Math.max(0, entry.limit - used);
      const resetAt = new Date(
        Date.now() + WINDOW_DURATIONS[entry.window],
      ).toISOString();

      status.windows[entry.window] = {
        used,
        limit: entry.limit,
        remaining,
        resetAt,
      };
    }

    return status;
  }

  // -----------------------------------------------------------------------
  // Public: getAllLimitsStatus
  // -----------------------------------------------------------------------

  /**
   * Get rate limit status for every known platform.
   */
  static async getAllLimitsStatus(
    userId?: string,
  ): Promise<RateLimitStatus[]> {
    const platforms = Object.keys(DEFAULT_LIMITS);
    const statuses = await Promise.all(
      platforms.map((platform) =>
        PlatformRateLimitService.getRateLimitStatus(platform, userId),
      ),
    );

    return statuses;
  }

  // -----------------------------------------------------------------------
  // Public: updatePlatformLimits
  // -----------------------------------------------------------------------

  /**
   * Create or update custom rate limit overrides for a platform.
   * Persisted to the `platform_rate_limits` table. Invalidates the
   * cached configuration for that platform.
   */
  static async updatePlatformLimits(
    platformType: string,
    limits: PlatformLimits,
  ): Promise<PlatformLimitRow> {
    if (!DEFAULT_LIMITS[platformType]) {
      throw new ValidationError(`Unknown platform type: ${platformType}`);
    }

    // Upsert
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO platform_rate_limits
         (id, platform_type, requests_per_second, requests_per_minute,
          requests_per_hour, requests_per_day, concurrent_limit,
          custom_config, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (platform_type) DO UPDATE SET
         requests_per_second = COALESCE($3, platform_rate_limits.requests_per_second),
         requests_per_minute = COALESCE($4, platform_rate_limits.requests_per_minute),
         requests_per_hour   = COALESCE($5, platform_rate_limits.requests_per_hour),
         requests_per_day    = COALESCE($6, platform_rate_limits.requests_per_day),
         concurrent_limit    = COALESCE($7, platform_rate_limits.concurrent_limit),
         custom_config       = COALESCE($8, platform_rate_limits.custom_config),
         updated_at          = NOW()
       RETURNING *`,
      [
        id,
        platformType,
        limits.requests_per_second ?? null,
        limits.requests_per_minute ?? null,
        limits.requests_per_hour ?? null,
        limits.requests_per_day ?? null,
        limits.concurrent_limit ?? null,
        JSON.stringify(limits.custom_config ?? {}),
      ],
    );

    const row = mapRowToLimits(result.rows[0]);

    // Invalidate cache
    await cacheDel(`${DB_CACHE_PREFIX}${platformType}`);

    logger.info('Platform rate limits updated', {
      platform: platformType,
      limits,
    });

    return row;
  }

  // -----------------------------------------------------------------------
  // Public: getPlatformLimits
  // -----------------------------------------------------------------------

  /**
   * Get the current effective limits for a platform (DB override merged
   * with defaults).
   */
  static async getPlatformLimits(
    platformType: string,
  ): Promise<PlatformLimits> {
    return PlatformRateLimitService.resolveEffectiveLimits(platformType);
  }

  // -----------------------------------------------------------------------
  // Public: resetPlatformCounter
  // -----------------------------------------------------------------------

  /**
   * Manually reset all sliding-window counters for a given platform and
   * optional user.
   */
  static async resetPlatformCounter(
    platformType: string,
    userId?: string,
  ): Promise<void> {
    if (!DEFAULT_LIMITS[platformType]) {
      throw new ValidationError(`Unknown platform type: ${platformType}`);
    }

    const effectiveUserId = userId ?? 'global';
    const windows: WindowName[] = ['second', 'minute', 'hour', 'day'];

    const pipeline = redis.pipeline();
    for (const window of windows) {
      const key = redisKey(platformType, effectiveUserId, window);
      pipeline.del(key);
    }
    await pipeline.exec();

    logger.info('Platform rate limit counters reset', {
      platform: platformType,
      userId: effectiveUserId,
    });
  }
}

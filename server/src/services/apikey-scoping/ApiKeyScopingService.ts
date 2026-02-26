/**
 * API Key Scoping Service.
 *
 * Extends the base {@link ApiKeyService} with platform-specific scoping,
 * IP whitelisting, per-key rate limiting, expiration, and usage tracking.
 * Scoping metadata is stored in the `api_key_scopes` table and joined with
 * the base `api_keys` table for comprehensive key management.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { redis } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
  RateLimitError,
} from '../../utils/errors';
import { ApiKeyService } from '../apikey.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScopedKeyConfig {
  scopes: string[];
  platforms?: string[];
  ip_whitelist?: string[];
  expires_at?: string;
  rate_limit?: number;
  description?: string;
}

export interface ScopedKeyValidationResult {
  userId: string;
  scopes: string[];
  platforms: string[];
  isValid: boolean;
  reason?: string;
}

export interface ScopedKeyInfo {
  id: string;
  name: string;
  scopes: string[];
  platforms: string[];
  ipWhitelist: string[];
  rateLimitPerHour: number | null;
  expiresAt: string | null;
  description: string | null;
  requestCountToday: number;
  requestCountTotal: number;
  lastRequestAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface KeyUsageStats {
  keyId: string;
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;
  requestsTotal: number;
  lastRequestAt: string | null;
  rateLimitPerHour: number | null;
  requestsThisHour: number;
}

export interface UpdateScopedKeyConfig {
  scopes?: string[];
  platforms?: string[];
  ip_whitelist?: string[];
  expires_at?: string | null;
  rate_limit?: number | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 300; // 5 minutes
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApiKeyScopingService {
  /**
   * Create a new API key with platform-specific scoping.
   *
   * Delegates actual key generation to {@link ApiKeyService.create} and
   * stores extended scoping metadata in the `api_key_scopes` table.
   */
  static async createScopedKey(
    userId: string,
    name: string,
    config: ScopedKeyConfig,
  ): Promise<{ id: string; key: string }> {
    // Validate required fields
    if (!config.scopes || config.scopes.length === 0) {
      throw new ValidationError('At least one scope is required', [
        { field: 'scopes', message: 'At least one scope is required' },
      ]);
    }

    if (config.expires_at) {
      const expiresDate = new Date(config.expires_at);
      if (isNaN(expiresDate.getTime())) {
        throw new ValidationError('Invalid expiration date', [
          { field: 'expires_at', message: 'Must be a valid ISO 8601 date string' },
        ]);
      }
      if (expiresDate <= new Date()) {
        throw new ValidationError('Expiration date must be in the future', [
          { field: 'expires_at', message: 'Must be a future date' },
        ]);
      }
    }

    if (config.rate_limit !== undefined && config.rate_limit !== null) {
      if (config.rate_limit < 1) {
        throw new ValidationError('Rate limit must be at least 1 request per hour', [
          { field: 'rate_limit', message: 'Must be a positive integer' },
        ]);
      }
    }

    // Create the base API key via the existing service
    const { id: apiKeyId, key } = await ApiKeyService.create(userId, name, config.scopes);

    // Store extended scoping metadata
    const scopeId = generateId();
    await pool.query(
      `INSERT INTO api_key_scopes (
        id, api_key_id, platforms, ip_whitelist, rate_limit_per_hour,
        expires_at, description, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        scopeId,
        apiKeyId,
        config.platforms || [],
        config.ip_whitelist || [],
        config.rate_limit || null,
        config.expires_at || null,
        config.description || null,
      ],
    );

    // Invalidate any cached key lists for this user
    await cacheDel(`apikeys:user:${userId}`);

    logger.info('Scoped API key created', {
      keyId: apiKeyId,
      userId,
      name,
      platforms: config.platforms || [],
      hasIpWhitelist: (config.ip_whitelist || []).length > 0,
      hasRateLimit: !!config.rate_limit,
      hasExpiration: !!config.expires_at,
    });

    return { id: apiKeyId, key };
  }

  /**
   * Enhanced validation that checks scope, platform access, expiration,
   * IP whitelist, and rate limits.
   *
   * Returns a structured result indicating whether the key is valid and,
   * if not, the reason for rejection.
   */
  static async validateScopedKey(
    key: string,
    requiredScope?: string,
    platformType?: string,
    clientIp?: string,
  ): Promise<ScopedKeyValidationResult> {
    // Step 1: Validate the base key
    const baseResult = await ApiKeyService.validate(key);

    if (!baseResult) {
      return {
        userId: '',
        scopes: [],
        platforms: [],
        isValid: false,
        reason: 'Invalid or revoked API key',
      };
    }

    const { userId, scopes } = baseResult;

    // Step 2: Fetch the scoping metadata
    // We need the api_key id first -- re-derive it from the hash lookup
    const scopeData = await this.getScopeDataByKey(key);

    const platforms = scopeData?.platforms || [];

    // Step 3: Check required scope
    if (requiredScope && !scopes.includes(requiredScope)) {
      // Also check for wildcard scopes -- e.g. 'read:*' covers 'read:campaigns'
      const hasWildcard = scopes.some((s) => {
        if (s === '*') return true;
        if (s.endsWith(':*')) {
          const action = s.slice(0, s.indexOf(':'));
          const requiredAction = requiredScope.slice(0, requiredScope.indexOf(':'));
          return action === requiredAction;
        }
        return false;
      });

      if (!hasWildcard) {
        return {
          userId,
          scopes,
          platforms,
          isValid: false,
          reason: `API key does not have required scope: ${requiredScope}`,
        };
      }
    }

    // Step 4: Check platform access
    if (platformType && platforms.length > 0 && !platforms.includes(platformType)) {
      return {
        userId,
        scopes,
        platforms,
        isValid: false,
        reason: `API key is not authorized for platform: ${platformType}`,
      };
    }

    // Step 5: Check expiration
    if (scopeData?.expires_at) {
      const expiresAt = new Date(scopeData.expires_at);
      if (expiresAt <= new Date()) {
        return {
          userId,
          scopes,
          platforms,
          isValid: false,
          reason: 'API key has expired',
        };
      }
    }

    // Step 6: Check IP whitelist
    if (clientIp && scopeData?.ip_whitelist && scopeData.ip_whitelist.length > 0) {
      if (!scopeData.ip_whitelist.includes(clientIp)) {
        return {
          userId,
          scopes,
          platforms,
          isValid: false,
          reason: `IP address ${clientIp} is not in the API key whitelist`,
        };
      }
    }

    // Step 7: Check rate limit
    if (scopeData?.rate_limit_per_hour && scopeData.api_key_id) {
      const isWithinLimit = await this.checkRateLimit(
        scopeData.api_key_id,
        scopeData.rate_limit_per_hour,
      );

      if (!isWithinLimit) {
        return {
          userId,
          scopes,
          platforms,
          isValid: false,
          reason: `Rate limit exceeded: ${scopeData.rate_limit_per_hour} requests per hour`,
        };
      }
    }

    // Step 8: Update usage counters (fire-and-forget)
    if (scopeData?.api_key_id) {
      this.incrementUsageCounters(scopeData.api_key_id).catch((err) => {
        logger.error('Failed to increment API key usage counters', {
          keyId: scopeData.api_key_id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return {
      userId,
      scopes,
      platforms,
      isValid: true,
    };
  }

  /**
   * List all keys for a user with their scoping details.
   */
  static async listScopedKeys(userId: string): Promise<ScopedKeyInfo[]> {
    // Check cache first
    const cacheKey = `apikeys:user:${userId}`;
    const cached = await cacheGet<ScopedKeyInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT
        ak.id,
        ak.name,
        ak.scopes,
        ak.is_active,
        ak.created_at,
        ak.last_used_at,
        aks.platforms,
        aks.ip_whitelist,
        aks.rate_limit_per_hour,
        aks.expires_at,
        aks.description,
        aks.request_count_today,
        aks.request_count_total,
        aks.last_request_at
      FROM api_keys ak
      LEFT JOIN api_key_scopes aks ON aks.api_key_id = ak.id
      WHERE ak.user_id = $1
      ORDER BY ak.created_at DESC`,
      [userId],
    );

    const keys: ScopedKeyInfo[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes || []),
      platforms: row.platforms || [],
      ipWhitelist: row.ip_whitelist || [],
      rateLimitPerHour: row.rate_limit_per_hour ?? null,
      expiresAt: row.expires_at ?? null,
      description: row.description ?? null,
      requestCountToday: row.request_count_today ?? 0,
      requestCountTotal: row.request_count_total ?? 0,
      lastRequestAt: row.last_request_at ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? null,
    }));

    await cacheSet(cacheKey, keys, CACHE_TTL_SECONDS);

    return keys;
  }

  /**
   * Update a key's scopes, platforms, rate limit, IP whitelist, or expiration.
   */
  static async updateKeyScopes(
    keyId: string,
    userId: string,
    newConfig: UpdateScopedKeyConfig,
  ): Promise<ScopedKeyInfo> {
    // Verify ownership
    const ownerCheck = await pool.query(
      `SELECT id FROM api_keys WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [keyId, userId],
    );

    if (ownerCheck.rows.length === 0) {
      throw new NotFoundError('API key not found or not owned by user');
    }

    // Update base scopes in api_keys table if provided
    if (newConfig.scopes && newConfig.scopes.length > 0) {
      await pool.query(
        `UPDATE api_keys SET scopes = $1 WHERE id = $2`,
        [JSON.stringify(newConfig.scopes), keyId],
      );
    }

    // Build dynamic UPDATE for api_key_scopes
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (newConfig.platforms !== undefined) {
      updates.push(`platforms = $${paramIndex++}`);
      values.push(newConfig.platforms);
    }

    if (newConfig.ip_whitelist !== undefined) {
      updates.push(`ip_whitelist = $${paramIndex++}`);
      values.push(newConfig.ip_whitelist);
    }

    if (newConfig.rate_limit !== undefined) {
      updates.push(`rate_limit_per_hour = $${paramIndex++}`);
      values.push(newConfig.rate_limit);
    }

    if (newConfig.expires_at !== undefined) {
      if (newConfig.expires_at !== null) {
        const expiresDate = new Date(newConfig.expires_at);
        if (isNaN(expiresDate.getTime())) {
          throw new ValidationError('Invalid expiration date', [
            { field: 'expires_at', message: 'Must be a valid ISO 8601 date string' },
          ]);
        }
      }
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(newConfig.expires_at);
    }

    if (newConfig.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(newConfig.description);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);

      // Check if scope row exists
      const scopeRow = await pool.query(
        `SELECT id FROM api_key_scopes WHERE api_key_id = $1`,
        [keyId],
      );

      if (scopeRow.rows.length === 0) {
        // Create a new scope row
        const scopeId = generateId();
        await pool.query(
          `INSERT INTO api_key_scopes (
            id, api_key_id, platforms, ip_whitelist, rate_limit_per_hour,
            expires_at, description, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [
            scopeId,
            keyId,
            newConfig.platforms || [],
            newConfig.ip_whitelist || [],
            newConfig.rate_limit ?? null,
            newConfig.expires_at ?? null,
            newConfig.description ?? null,
          ],
        );
      } else {
        values.push(keyId);
        await pool.query(
          `UPDATE api_key_scopes SET ${updates.join(', ')} WHERE api_key_id = $${paramIndex}`,
          values,
        );
      }
    }

    // Invalidate caches
    await cacheDel(`apikeys:user:${userId}`);
    await cacheDel(`apikey:scope:${keyId}`);

    logger.info('API key scopes updated', { keyId, userId });

    // Return the updated key info
    const updatedKey = await this.getKeyById(keyId, userId);
    if (!updatedKey) {
      throw new NotFoundError('API key not found after update');
    }

    return updatedKey;
  }

  /**
   * Get usage statistics for a specific API key.
   */
  static async getKeyUsageStats(keyId: string): Promise<KeyUsageStats> {
    const result = await pool.query(
      `SELECT
        aks.request_count_today,
        aks.request_count_total,
        aks.last_request_at,
        aks.rate_limit_per_hour
      FROM api_key_scopes aks
      WHERE aks.api_key_id = $1`,
      [keyId],
    );

    // Get hourly rate from Redis
    const hourlyKey = `apikey:rate:${keyId}`;
    const currentHourCount = await redis.get(hourlyKey);

    // Calculate weekly and monthly from total (approximation from the database)
    // For more precise tracking, we'd use time-series data
    const row = result.rows[0];

    if (!row) {
      return {
        keyId,
        requestsToday: 0,
        requestsThisWeek: 0,
        requestsThisMonth: 0,
        requestsTotal: 0,
        lastRequestAt: null,
        rateLimitPerHour: null,
        requestsThisHour: parseInt(currentHourCount || '0', 10),
      };
    }

    // Get weekly count from Redis (rolling 7 day counters)
    const weeklyKey = `apikey:weekly:${keyId}`;
    const weeklyCount = await redis.get(weeklyKey);

    // Get monthly count from Redis (rolling 30 day counter)
    const monthlyKey = `apikey:monthly:${keyId}`;
    const monthlyCount = await redis.get(monthlyKey);

    return {
      keyId,
      requestsToday: row.request_count_today ?? 0,
      requestsThisWeek: parseInt(weeklyCount || '0', 10) || (row.request_count_today ?? 0),
      requestsThisMonth: parseInt(monthlyCount || '0', 10) || (row.request_count_total ?? 0),
      requestsTotal: row.request_count_total ?? 0,
      lastRequestAt: row.last_request_at ?? null,
      rateLimitPerHour: row.rate_limit_per_hour ?? null,
      requestsThisHour: parseInt(currentHourCount || '0', 10),
    };
  }

  /**
   * Revoke all API keys scoped to a specific platform for a user.
   */
  static async revokeByPlatform(
    userId: string,
    platformType: string,
  ): Promise<{ revokedCount: number }> {
    // Find all active keys for this user that are scoped to the given platform
    const result = await pool.query(
      `SELECT ak.id
       FROM api_keys ak
       JOIN api_key_scopes aks ON aks.api_key_id = ak.id
       WHERE ak.user_id = $1
         AND ak.is_active = true
         AND $2 = ANY(aks.platforms)`,
      [userId, platformType],
    );

    const keyIds: string[] = result.rows.map((row) => row.id);

    if (keyIds.length === 0) {
      return { revokedCount: 0 };
    }

    // Revoke each key
    for (const keyId of keyIds) {
      await ApiKeyService.revoke(keyId, userId);
      await cacheDel(`apikey:scope:${keyId}`);
    }

    // Invalidate user's key list cache
    await cacheDel(`apikeys:user:${userId}`);

    logger.info('API keys revoked by platform', {
      userId,
      platformType,
      revokedCount: keyIds.length,
      revokedKeyIds: keyIds,
    });

    return { revokedCount: keyIds.length };
  }

  /**
   * Get a single key's full details by ID and owning user.
   */
  static async getKeyById(keyId: string, userId: string): Promise<ScopedKeyInfo | null> {
    const result = await pool.query(
      `SELECT
        ak.id,
        ak.name,
        ak.scopes,
        ak.is_active,
        ak.created_at,
        ak.last_used_at,
        aks.platforms,
        aks.ip_whitelist,
        aks.rate_limit_per_hour,
        aks.expires_at,
        aks.description,
        aks.request_count_today,
        aks.request_count_total,
        aks.last_request_at
      FROM api_keys ak
      LEFT JOIN api_key_scopes aks ON aks.api_key_id = ak.id
      WHERE ak.id = $1 AND ak.user_id = $2`,
      [keyId, userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      name: row.name,
      scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes || []),
      platforms: row.platforms || [],
      ipWhitelist: row.ip_whitelist || [],
      rateLimitPerHour: row.rate_limit_per_hour ?? null,
      expiresAt: row.expires_at ?? null,
      description: row.description ?? null,
      requestCountToday: row.request_count_today ?? 0,
      requestCountTotal: row.request_count_total ?? 0,
      lastRequestAt: row.last_request_at ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Retrieve scope metadata for a key by looking up its hash.
   * Uses caching for performance.
   */
  private static async getScopeDataByKey(
    key: string,
  ): Promise<{
    api_key_id: string;
    platforms: string[];
    ip_whitelist: string[];
    rate_limit_per_hour: number | null;
    expires_at: string | null;
  } | null> {
    const crypto = await import('crypto');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    // Look up the key ID from the hash
    const keyResult = await pool.query(
      `SELECT id FROM api_keys WHERE key_hash = $1 AND is_active = true`,
      [keyHash],
    );

    if (keyResult.rows.length === 0) {
      return null;
    }

    const apiKeyId = keyResult.rows[0].id;

    // Check cache
    const cacheKey = `apikey:scope:${apiKeyId}`;
    const cached = await cacheGet<{
      api_key_id: string;
      platforms: string[];
      ip_whitelist: string[];
      rate_limit_per_hour: number | null;
      expires_at: string | null;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    // Fetch from database
    const scopeResult = await pool.query(
      `SELECT api_key_id, platforms, ip_whitelist, rate_limit_per_hour, expires_at
       FROM api_key_scopes
       WHERE api_key_id = $1`,
      [apiKeyId],
    );

    if (scopeResult.rows.length === 0) {
      // No scoping data -- the key exists but has no extended scoping
      return {
        api_key_id: apiKeyId,
        platforms: [],
        ip_whitelist: [],
        rate_limit_per_hour: null,
        expires_at: null,
      };
    }

    const row = scopeResult.rows[0];
    const scopeData = {
      api_key_id: row.api_key_id,
      platforms: row.platforms || [],
      ip_whitelist: row.ip_whitelist || [],
      rate_limit_per_hour: row.rate_limit_per_hour ?? null,
      expires_at: row.expires_at ?? null,
    };

    await cacheSet(cacheKey, scopeData, CACHE_TTL_SECONDS);

    return scopeData;
  }

  /**
   * Check whether the key is within its rate limit using a Redis sliding
   * window counter (hourly bucket).
   */
  private static async checkRateLimit(
    apiKeyId: string,
    limitPerHour: number,
  ): Promise<boolean> {
    const rateLimitKey = `apikey:rate:${apiKeyId}`;

    const current = await redis.get(rateLimitKey);
    const currentCount = parseInt(current || '0', 10);

    return currentCount < limitPerHour;
  }

  /**
   * Increment all usage counters for a key -- hourly (Redis), daily
   * (database), weekly (Redis), monthly (Redis), and total (database).
   */
  private static async incrementUsageCounters(apiKeyId: string): Promise<void> {
    // Increment hourly counter in Redis with TTL
    const hourlyKey = `apikey:rate:${apiKeyId}`;
    const pipeline = redis.pipeline();
    pipeline.incr(hourlyKey);
    pipeline.expire(hourlyKey, RATE_LIMIT_WINDOW_SECONDS);

    // Increment weekly counter (7 day TTL)
    const weeklyKey = `apikey:weekly:${apiKeyId}`;
    pipeline.incr(weeklyKey);
    pipeline.expire(weeklyKey, 7 * 24 * 3600);

    // Increment monthly counter (30 day TTL)
    const monthlyKey = `apikey:monthly:${apiKeyId}`;
    pipeline.incr(monthlyKey);
    pipeline.expire(monthlyKey, 30 * 24 * 3600);

    await pipeline.exec();

    // Update database counters (fire-and-forget)
    pool.query(
      `UPDATE api_key_scopes
       SET request_count_today = request_count_today + 1,
           request_count_total = request_count_total + 1,
           last_request_at = NOW(),
           updated_at = NOW()
       WHERE api_key_id = $1`,
      [apiKeyId],
    ).catch((err) => {
      logger.error('Failed to update API key scope counters', {
        keyId: apiKeyId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

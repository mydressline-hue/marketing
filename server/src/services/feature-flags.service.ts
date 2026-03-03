/**
 * Feature Flags Service.
 *
 * Provides a DB-backed feature flag system with in-memory caching (Map with
 * configurable TTL) and deterministic rollout based on a hash of userId +
 * flagName. This guarantees that a given user always receives the same
 * result for a given flag without additional DB or external state.
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError } from '../utils/errors';
import { AuditService } from './audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFeatureFlagOptions {
  description?: string;
  is_enabled?: boolean;
  rollout_percentage?: number;
  created_by?: string;
}

export interface UpdateFeatureFlagOptions {
  description?: string;
  is_enabled?: boolean;
  rollout_percentage?: number;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  flag: FeatureFlag;
  cachedAt: number;
}

/** Default cache TTL in milliseconds (30 seconds). */
const DEFAULT_CACHE_TTL_MS = 30_000;

/**
 * Simple in-memory cache keyed by flag name.
 *
 * Each entry stores the flag data and the timestamp at which it was cached.
 * Entries older than `cacheTtlMs` are considered stale and are re-fetched
 * from the database on the next access.
 */
const cache = new Map<string, CacheEntry>();

let cacheTtlMs = DEFAULT_CACHE_TTL_MS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic number in [0, 100) from a userId and flagName.
 *
 * Uses SHA-256 so the distribution is uniform and the same (userId, flagName)
 * pair always maps to the same bucket.
 */
function deterministicBucket(userId: string, flagName: string): number {
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}:${flagName}`)
    .digest('hex');
  // Take the first 8 hex characters (32 bits) and mod 100.
  const numeric = parseInt(hash.substring(0, 8), 16);
  return numeric % 100;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.cachedAt < cacheTtlMs;
}

function cacheFlag(flag: FeatureFlag): void {
  cache.set(flag.name, { flag, cachedAt: Date.now() });
}

function invalidateCache(name: string): void {
  cache.delete(name);
}

function invalidateAllCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FeatureFlagsService {
  /**
   * Configure the in-memory cache TTL (milliseconds).
   * Useful for testing or runtime tuning.
   */
  static setCacheTtl(ttlMs: number): void {
    cacheTtlMs = ttlMs;
  }

  /**
   * Return all feature flags.
   */
  static async getAll(): Promise<FeatureFlag[]> {
    const result = await pool.query<FeatureFlag>(
      `SELECT id, name, description, is_enabled, rollout_percentage,
              created_by, created_at, updated_at
       FROM feature_flags
       ORDER BY created_at DESC`,
    );

    // Refresh cache with the full result set.
    for (const flag of result.rows) {
      cacheFlag(flag);
    }

    return result.rows;
  }

  /**
   * Get a single feature flag by name.
   *
   * Reads from the in-memory cache when available and not stale; otherwise
   * queries the database and populates the cache.
   */
  static async get(name: string): Promise<FeatureFlag> {
    // Check cache first
    const cached = cache.get(name);
    if (cached && isCacheValid(cached)) {
      return cached.flag;
    }

    const result = await pool.query<FeatureFlag>(
      `SELECT id, name, description, is_enabled, rollout_percentage,
              created_by, created_at, updated_at
       FROM feature_flags
       WHERE name = $1`,
      [name],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Feature flag '${name}' not found`);
    }

    const flag = result.rows[0];
    cacheFlag(flag);
    return flag;
  }

  /**
   * Check whether a feature flag is enabled.
   *
   * If the flag does not exist, returns `false` (fail-closed).
   *
   * When `rollout_percentage` is less than 100 and a `userId` is provided,
   * a deterministic hash decides whether this specific user falls within the
   * rollout bucket. Without a `userId` the raw `is_enabled` value is returned
   * (ignoring percentage).
   */
  static async isEnabled(name: string, userId?: string): Promise<boolean> {
    let flag: FeatureFlag;

    try {
      flag = await FeatureFlagsService.get(name);
    } catch {
      // Flag does not exist -- treat as disabled.
      return false;
    }

    if (!flag.is_enabled) {
      return false;
    }

    // If rollout is 100 %, the flag is simply on for everyone.
    if (flag.rollout_percentage >= 100) {
      return true;
    }

    // If rollout is 0 %, the flag is off for everyone (even though is_enabled is true).
    if (flag.rollout_percentage <= 0) {
      return false;
    }

    // Gradual rollout: requires a userId for deterministic bucketing.
    if (!userId) {
      // Without a user context we cannot determine the bucket. Default to
      // the flag's enabled state (full rollout semantics).
      return true;
    }

    const bucket = deterministicBucket(userId, name);
    return bucket < flag.rollout_percentage;
  }

  /**
   * Create a new feature flag.
   */
  static async create(
    name: string,
    description?: string,
    options: Omit<CreateFeatureFlagOptions, 'description'> = {},
  ): Promise<FeatureFlag> {
    const id = generateId();
    const {
      is_enabled = false,
      rollout_percentage = 100,
      created_by = null,
    } = options;

    // Check for duplicate name
    const existing = await pool.query(
      `SELECT id FROM feature_flags WHERE name = $1`,
      [name],
    );

    if (existing.rows.length > 0) {
      throw new ConflictError(`Feature flag '${name}' already exists`);
    }

    const result = await pool.query<FeatureFlag>(
      `INSERT INTO feature_flags (id, name, description, is_enabled, rollout_percentage, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, name, description, is_enabled, rollout_percentage, created_by, created_at, updated_at`,
      [id, name, description ?? null, is_enabled, rollout_percentage, created_by],
    );

    const flag = result.rows[0];
    cacheFlag(flag);

    logger.info('Feature flag created', { name, id });

    await AuditService.log({
      userId: created_by ?? undefined,
      action: 'featureFlag.create',
      resourceType: 'feature_flag',
      resourceId: id,
      details: { name, is_enabled, rollout_percentage },
    });

    return flag;
  }

  /**
   * Update an existing feature flag by name.
   *
   * Only the fields present in `updates` are modified; all others remain
   * unchanged.
   */
  static async update(
    name: string,
    updates: UpdateFeatureFlagOptions,
  ): Promise<FeatureFlag> {
    // Build dynamic SET clause
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      values.push(updates.description);
    }
    if (updates.is_enabled !== undefined) {
      setClauses.push(`is_enabled = $${paramIdx++}`);
      values.push(updates.is_enabled);
    }
    if (updates.rollout_percentage !== undefined) {
      setClauses.push(`rollout_percentage = $${paramIdx++}`);
      values.push(updates.rollout_percentage);
    }

    values.push(name);

    const result = await pool.query<FeatureFlag>(
      `UPDATE feature_flags
       SET ${setClauses.join(', ')}
       WHERE name = $${paramIdx}
       RETURNING id, name, description, is_enabled, rollout_percentage, created_by, created_at, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Feature flag '${name}' not found`);
    }

    const flag = result.rows[0];
    cacheFlag(flag);

    logger.info('Feature flag updated', { name, updates });

    await AuditService.log({
      action: 'featureFlag.update',
      resourceType: 'feature_flag',
      resourceId: flag.id,
      details: { name, updates },
    });

    return flag;
  }

  /**
   * Delete a feature flag by name.
   */
  static async delete(name: string): Promise<void> {
    const result = await pool.query(
      `DELETE FROM feature_flags WHERE name = $1 RETURNING id`,
      [name],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Feature flag '${name}' not found`);
    }

    const deletedId = result.rows[0].id;

    invalidateCache(name);

    logger.info('Feature flag deleted', { name });

    await AuditService.log({
      action: 'featureFlag.delete',
      resourceType: 'feature_flag',
      resourceId: deletedId,
      details: { name },
    });
  }

  /**
   * Clear the entire in-memory cache. Useful for testing.
   */
  static clearCache(): void {
    invalidateAllCache();
  }
}

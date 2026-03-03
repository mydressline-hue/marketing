/**
 * System Settings Service.
 *
 * Provides a key-value settings store backed by PostgreSQL (via
 * `agent_states` table with `agent_type = 'system_setting'`) and cached in
 * Redis for fast reads. Every mutation is recorded in the `audit_logs` table.
 *
 * Settings are stored as JSONB values and can represent any serialisable
 * structure (notification preferences, appearance config, feature flags, etc.).
 */

import { pool } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { generateId } from '../utils/helpers';
import { withTransaction } from '../utils/transaction';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_TYPE = 'system_setting';
const CACHE_PREFIX = 'settings:';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SettingsService {
  /**
   * Retrieve a single setting by key.
   *
   * Checks Redis first; on cache miss, falls back to the database and
   * populates the cache for subsequent reads.
   */
  static async get(key: string): Promise<unknown> {
    // Try Redis cache first
    const cached = await cacheGet<unknown>(`${CACHE_PREFIX}${key}`);

    if (cached !== null) {
      return cached;
    }

    // Fallback to database
    const result = await pool.query(
      `SELECT state FROM agent_states
       WHERE agent_type = $1 AND agent_id = $2`,
      [AGENT_TYPE, key],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const value = result.rows[0].state;

    // Populate cache
    await cacheSet(`${CACHE_PREFIX}${key}`, value, CACHE_TTL);

    return value;
  }

  /**
   * Persist a setting in the database and update the Redis cache.
   *
   * Uses an upsert so that both new and existing settings are handled
   * transparently. The change is recorded in the audit log.
   */
  static async set(key: string, value: unknown, userId: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO agent_states (id, agent_type, agent_id, state, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (agent_type, agent_id)
         DO UPDATE SET state = $4, updated_at = NOW()`,
        [generateId(), AGENT_TYPE, key, JSON.stringify(value)],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, $2, 'setting_updated', 'system_setting', $3, $4, NOW())`,
        [generateId(), userId, key, JSON.stringify({ key, value })],
      );
    });

    // Update cache after successful transaction
    await cacheSet(`${CACHE_PREFIX}${key}`, value, CACHE_TTL);

    logger.info('System setting updated', { key, userId });
  }

  /**
   * Retrieve all system settings as a flat key-value map.
   */
  static async getAll(): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `SELECT agent_id AS key, state AS value
       FROM agent_states
       WHERE agent_type = $1
       ORDER BY agent_id`,
      [AGENT_TYPE],
    );

    const settings: Record<string, unknown> = {};

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return settings;
  }

  /**
   * Check which API keys / platform integrations are configured.
   *
   * Inspects environment variables and returns a boolean map indicating
   * which external services have credentials available.
   */
  static async getApiKeyConfig(): Promise<{
    anthropicConfigured: boolean;
    shopifyConfigured: boolean;
    platforms: Record<string, boolean>;
  }> {
    const anthropicConfigured = !!(env.ANTHROPIC_API_KEY);

    // Check for Shopify credentials in settings
    const shopifyKey = await SettingsService.get('shopify_api_key');
    const shopifyConfigured = !!shopifyKey;

    // Check platform integration keys stored in settings
    const platformKeys = ['google_ads', 'meta_ads', 'tiktok_ads', 'shopify', 'klaviyo'];
    const platforms: Record<string, boolean> = {};

    for (const platform of platformKeys) {
      const config = await SettingsService.get(`platform_${platform}`);
      platforms[platform] = !!config;
    }

    return {
      anthropicConfigured,
      shopifyConfigured,
      platforms,
    };
  }

  /**
   * Update notification preferences.
   *
   * Persists the configuration object under the `notifications` key and
   * records the change in the audit log.
   */
  static async updateNotifications(config: object, userId: string): Promise<void> {
    await SettingsService.set('notifications', config, userId);

    logger.info('Notification settings updated', { userId });
  }

  /**
   * Update appearance / theme preferences.
   *
   * Persists the configuration object under the `appearance` key and
   * records the change in the audit log.
   */
  static async updateAppearance(config: object, userId: string): Promise<void> {
    await SettingsService.set('appearance', config, userId);

    logger.info('Appearance settings updated', { userId });
  }
}

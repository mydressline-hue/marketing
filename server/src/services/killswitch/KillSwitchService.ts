/**
 * Kill Switch Service.
 *
 * Provides emergency controls for halting or restricting system operations
 * at varying severity levels. Every state change is persisted to the
 * `kill_switch_state` table, audit-logged, and triggers cache invalidation
 * to ensure all running processes see the updated state immediately.
 *
 * Halt Levels:
 *   0 - Normal operation (no restrictions)
 *   1 - Pause scaling (no new budget increases)
 *   2 - Pause new campaigns (existing continue)
 *   3 - Pause specific country (specified in params)
 *   4 - Full shutdown (stop everything)
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import type { HaltLevel, KillSwitchState, ID } from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_ACTIVE = 'killswitch:active';
const CACHE_KEY_LEVEL = 'killswitch:current_level';
const CACHE_TTL_ACTIVE = 30; // seconds
const CACHE_TTL_LEVEL = 10; // seconds
const CACHE_PATTERN = 'killswitch:*';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type OperationType =
  | 'campaign_create'
  | 'campaign_scale'
  | 'agent_run'
  | 'api_call'
  | 'budget_increase';

export interface OperationCheckResult {
  allowed: boolean;
  reason?: string;
  activeLevel: HaltLevel;
}

export interface KillSwitchHistoryFilters {
  triggerType?: string;
  level?: HaltLevel;
  activatedBy?: ID;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedKillSwitchHistory {
  data: KillSwitchState[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRowToState(row: Record<string, unknown>): KillSwitchState {
  return {
    id: row.id as string,
    level: row.level as HaltLevel,
    is_active: row.is_active as boolean,
    activated_by: row.activated_by as ID | undefined,
    trigger_type: row.trigger_type as KillSwitchState['trigger_type'],
    trigger_details: row.trigger_details as Record<string, unknown> | undefined,
    affected_countries: row.affected_countries as ID[] | undefined,
    affected_campaigns: row.affected_campaigns as ID[] | undefined,
    activated_at: row.activated_at as string | undefined,
    deactivated_at: row.deactivated_at as string | undefined,
    created_at: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KillSwitchService {
  /**
   * Invalidate all kill-switch-related cache keys.
   */
  private static async invalidateCache(): Promise<void> {
    await cacheFlush(CACHE_PATTERN);
  }

  // -------------------------------------------------------------------------
  // Activation / Deactivation
  // -------------------------------------------------------------------------

  /**
   * Activate a global kill switch at the specified level (1-4).
   */
  static async activateGlobalKillSwitch(
    userId: ID,
    level: HaltLevel,
    reason: string,
  ): Promise<KillSwitchState> {
    if (level < 1 || level > 4) {
      throw new ValidationError('Kill switch level must be between 1 and 4');
    }

    const id = generateId();

    const result = await pool.query(
      `INSERT INTO kill_switch_state
         (id, level, is_active, activated_by, trigger_type, trigger_details, activated_at, created_at)
       VALUES ($1, $2, TRUE, $3, 'manual', $4, NOW(), NOW())
       RETURNING *`,
      [id, level, userId, JSON.stringify({ reason })],
    );

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.activate',
      resourceType: 'kill_switch',
      resourceId: id,
      details: { level, reason },
    });

    logger.warn('Kill switch activated', { id, level, userId, reason });

    return state;
  }

  /**
   * Deactivate a specific kill switch entry.
   */
  static async deactivateKillSwitch(
    killSwitchId: ID,
    userId: ID,
  ): Promise<KillSwitchState> {
    const result = await pool.query(
      `UPDATE kill_switch_state
       SET is_active = FALSE, deactivated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING *`,
      [killSwitchId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Active kill switch entry not found');
    }

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.deactivate',
      resourceType: 'kill_switch',
      resourceId: killSwitchId,
      details: { level: state.level },
    });

    logger.info('Kill switch deactivated', { id: killSwitchId, userId });

    return state;
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Return all currently active kill switch entries. Cached for 30 seconds.
   */
  static async getActiveKillSwitches(): Promise<KillSwitchState[]> {
    const cached = await cacheGet<KillSwitchState[]>(CACHE_KEY_ACTIVE);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT * FROM kill_switch_state
       WHERE is_active = TRUE
       ORDER BY level DESC, activated_at DESC`,
    );

    const states = result.rows.map(mapRowToState);

    await cacheSet(CACHE_KEY_ACTIVE, states, CACHE_TTL_ACTIVE);

    return states;
  }

  /**
   * Return the highest active kill switch level (0 if none active).
   * Cached for 10 seconds.
   */
  static async getCurrentLevel(): Promise<HaltLevel> {
    const cached = await cacheGet<HaltLevel>(CACHE_KEY_LEVEL);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const result = await pool.query(
      `SELECT COALESCE(MAX(level), 0) AS max_level
       FROM kill_switch_state
       WHERE is_active = TRUE`,
    );

    const level = (result.rows[0].max_level as number) as HaltLevel;

    await cacheSet(CACHE_KEY_LEVEL, level, CACHE_TTL_LEVEL);

    return level;
  }

  // -------------------------------------------------------------------------
  // Campaign Pause / Resume
  // -------------------------------------------------------------------------

  /**
   * Create a level-2 kill switch targeting a specific campaign.
   */
  static async pauseCampaign(
    campaignId: ID,
    userId: ID,
    reason: string,
  ): Promise<KillSwitchState> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO kill_switch_state
         (id, level, is_active, activated_by, trigger_type, trigger_details,
          affected_campaigns, activated_at, created_at)
       VALUES ($1, 2, TRUE, $2, 'manual', $3, $4, NOW(), NOW())
       RETURNING *`,
      [id, userId, JSON.stringify({ reason }), JSON.stringify([campaignId])],
    );

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.pause_campaign',
      resourceType: 'kill_switch',
      resourceId: id,
      details: { campaignId, reason },
    });

    logger.warn('Campaign paused via kill switch', { id, campaignId, userId, reason });

    return state;
  }

  /**
   * Deactivate the kill switch for a specific campaign.
   */
  static async resumeCampaign(
    campaignId: ID,
    userId: ID,
  ): Promise<KillSwitchState> {
    const result = await pool.query(
      `UPDATE kill_switch_state
       SET is_active = FALSE, deactivated_at = NOW()
       WHERE is_active = TRUE
         AND affected_campaigns @> $1::jsonb
       RETURNING *`,
      [JSON.stringify([campaignId])],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('No active kill switch found for this campaign');
    }

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.resume_campaign',
      resourceType: 'kill_switch',
      resourceId: state.id,
      details: { campaignId },
    });

    logger.info('Campaign resumed via kill switch', { id: state.id, campaignId, userId });

    return state;
  }

  // -------------------------------------------------------------------------
  // Country Pause / Resume
  // -------------------------------------------------------------------------

  /**
   * Create a level-3 kill switch targeting a specific country.
   */
  static async pauseCountry(
    countryId: ID,
    userId: ID,
    reason: string,
  ): Promise<KillSwitchState> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO kill_switch_state
         (id, level, is_active, activated_by, trigger_type, trigger_details,
          affected_countries, activated_at, created_at)
       VALUES ($1, 3, TRUE, $2, 'manual', $3, $4, NOW(), NOW())
       RETURNING *`,
      [id, userId, JSON.stringify({ reason }), JSON.stringify([countryId])],
    );

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.pause_country',
      resourceType: 'kill_switch',
      resourceId: id,
      details: { countryId, reason },
    });

    logger.warn('Country paused via kill switch', { id, countryId, userId, reason });

    return state;
  }

  /**
   * Deactivate the kill switch for a specific country.
   */
  static async resumeCountry(
    countryId: ID,
    userId: ID,
  ): Promise<KillSwitchState> {
    const result = await pool.query(
      `UPDATE kill_switch_state
       SET is_active = FALSE, deactivated_at = NOW()
       WHERE is_active = TRUE
         AND affected_countries @> $1::jsonb
       RETURNING *`,
      [JSON.stringify([countryId])],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('No active kill switch found for this country');
    }

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.resume_country',
      resourceType: 'kill_switch',
      resourceId: state.id,
      details: { countryId },
    });

    logger.info('Country resumed via kill switch', { id: state.id, countryId, userId });

    return state;
  }

  // -------------------------------------------------------------------------
  // Automation & API Key Controls
  // -------------------------------------------------------------------------

  /**
   * Create a level-1 kill switch to pause all agent autonomous actions.
   */
  static async pauseAutomation(
    userId: ID,
    reason: string,
  ): Promise<KillSwitchState> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO kill_switch_state
         (id, level, is_active, activated_by, trigger_type, trigger_details, activated_at, created_at)
       VALUES ($1, 1, TRUE, $2, 'manual', $3, NOW(), NOW())
       RETURNING *`,
      [id, userId, JSON.stringify({ reason, scope: 'automation' })],
    );

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.pause_automation',
      resourceType: 'kill_switch',
      resourceId: id,
      details: { reason },
    });

    logger.warn('Automation paused via kill switch', { id, userId, reason });

    return state;
  }

  /**
   * Create a level-4 kill switch that additionally flags API keys as locked.
   */
  static async lockAPIKeys(
    userId: ID,
    reason: string,
  ): Promise<KillSwitchState> {
    const id = generateId();

    const result = await pool.query(
      `INSERT INTO kill_switch_state
         (id, level, is_active, activated_by, trigger_type, trigger_details, activated_at, created_at)
       VALUES ($1, 4, TRUE, $2, 'manual', $3, NOW(), NOW())
       RETURNING *`,
      [id, userId, JSON.stringify({ reason, api_keys_locked: true })],
    );

    const state = mapRowToState(result.rows[0]);

    await KillSwitchService.invalidateCache();

    await AuditService.log({
      userId,
      action: 'kill_switch.lock_api_keys',
      resourceType: 'kill_switch',
      resourceId: id,
      details: { reason, api_keys_locked: true },
    });

    logger.warn('API keys locked via kill switch', { id, userId, reason });

    return state;
  }

  // -------------------------------------------------------------------------
  // Operation Permission Check
  // -------------------------------------------------------------------------

  /**
   * Check whether a given operation is allowed under the current kill switch
   * state. Returns an object with `allowed`, an optional `reason`, and the
   * current `activeLevel`.
   */
  static async isOperationAllowed(
    operationType: OperationType,
    context?: Record<string, unknown>,
  ): Promise<OperationCheckResult> {
    const activeLevel = await KillSwitchService.getCurrentLevel();

    // Level 0 -- everything is allowed
    if (activeLevel === 0) {
      return { allowed: true, activeLevel: 0 };
    }

    // Level 4 -- full shutdown, nothing is allowed
    if (activeLevel >= 4) {
      return {
        allowed: false,
        reason: 'Full system shutdown is active. All operations are halted.',
        activeLevel,
      };
    }

    // Level 3 -- country-specific checks
    if (activeLevel >= 3) {
      if (context?.countryId) {
        const activeStates = await KillSwitchService.getActiveKillSwitches();
        const countryBlocked = activeStates.some(
          (s) =>
            s.level === 3 &&
            s.affected_countries &&
            s.affected_countries.includes(context.countryId as string),
        );
        if (countryBlocked) {
          return {
            allowed: false,
            reason: `Operations for country ${context.countryId} are paused.`,
            activeLevel,
          };
        }
      }
      // For level 3 without matching country context, also block campaign_create and agent_run
      if (operationType === 'campaign_create' || operationType === 'agent_run') {
        return {
          allowed: false,
          reason: 'Country-level pause is active. Campaign creation and agent runs are restricted.',
          activeLevel,
        };
      }
    }

    // Level 2 -- no new campaigns, existing continue
    if (activeLevel >= 2) {
      if (operationType === 'campaign_create') {
        return {
          allowed: false,
          reason: 'New campaign creation is paused.',
          activeLevel,
        };
      }
      if (operationType === 'agent_run') {
        return {
          allowed: false,
          reason: 'Agent runs are paused at level 2.',
          activeLevel,
        };
      }
    }

    // Level 1 -- no budget increases or scaling
    if (activeLevel >= 1) {
      if (operationType === 'budget_increase' || operationType === 'campaign_scale') {
        return {
          allowed: false,
          reason: 'Scaling and budget increases are paused.',
          activeLevel,
        };
      }
    }

    return { allowed: true, activeLevel };
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  /**
   * Query historical kill switch events with pagination.
   */
  static async getKillSwitchHistory(
    filters: KillSwitchHistoryFilters = {},
  ): Promise<PaginatedKillSwitchHistory> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.triggerType) {
      conditions.push(`trigger_type = $${paramIndex++}`);
      params.push(filters.triggerType);
    }

    if (filters.level !== undefined) {
      conditions.push(`level = $${paramIndex++}`);
      params.push(filters.level);
    }

    if (filters.activatedBy) {
      conditions.push(`activated_by = $${paramIndex++}`);
      params.push(filters.activatedBy);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM kill_switch_state ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0].total as string, 10);
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT * FROM kill_switch_state
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data = dataResult.rows.map(mapRowToState);

    return { data, total, page, totalPages };
  }
}

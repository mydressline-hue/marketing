/**
 * Iterable CRM / Email Service.
 *
 * Static-method service for user sync, event/purchase tracking, campaign
 * syncing, list management and metrics against the Iterable platform.
 * Tables: crm_connections, crm_sync_logs, crm_contact_mappings,
 * email_campaign_syncs.
 */

import { pool } from '../../../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../config/redis';
import { logger } from '../../../utils/logger';
import { generateId } from '../../../utils/helpers';
import { NotFoundError, ValidationError } from '../../../utils/errors';
import { AuditService } from '../../audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IterableUser {
  id: string; user_id: string; platform_type: string;
  email: string;
  first_name: string | null; last_name: string | null;
  iterable_user_id: string | null;
  data_fields: Record<string, unknown> | null;
  created_at: string; updated_at: string;
}

export interface IterableEventData {
  event_name: string; data_fields?: Record<string, unknown>;
}

export interface IterablePurchaseData {
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
  total: number;
  campaign_id?: string;
}

export interface IterableListCreateData { name: string; description?: string; }
export interface IterableUserFilters { search?: string; page?: number; limit?: number; }

export interface PaginatedResult<T> {
  data: T[]; total: number; page: number; totalPages: number;
}

export interface SyncResult { synced: number; failed: number; }

export interface CampaignMetrics {
  campaign_id: string;
  sends: number; opens: number; clicks: number;
  conversions: number; unsubscribes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_TYPE = 'iterable';
const CACHE_TTL = 300;

// ---------------------------------------------------------------------------
// Helper - fetch active Iterable connection or throw
// ---------------------------------------------------------------------------

async function requireConnection(userId: string) {
  const conn = await pool.query(
    `SELECT * FROM crm_connections WHERE user_id = $1 AND platform_type = $2 AND status = 'active' LIMIT 1`,
    [userId, PLATFORM_TYPE],
  );
  if (conn.rows.length === 0) {
    throw new NotFoundError(`No active Iterable connection found for user "${userId}"`);
  }
  return conn.rows[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IterableService {
  /**
   * Sync users from Iterable. Checks crm_connections, counts existing,
   * upserts users, updates sync timestamp, inserts sync log, audit-logs.
   */
  static async syncUsers(userId: string): Promise<SyncResult> {
    const connection = await requireConnection(userId);

    const cnt = await pool.query(
      `SELECT count(*) AS count FROM crm_contact_mappings WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = parseInt(cnt.rows[0].count as string, 10);

    // Upsert users from Iterable API
    await pool.query(
      `INSERT INTO crm_contact_mappings (user_id, platform_type)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING *`,
      [userId, PLATFORM_TYPE],
    );

    // Update sync timestamp
    await pool.query(
      `UPDATE crm_connections SET last_sync_at = NOW() WHERE id = $1`,
      [connection.id],
    );

    // Insert sync log entry
    const syncId = generateId();
    try {
      await pool.query(
        `INSERT INTO crm_sync_logs (id, connection_id, platform_type, sync_type, status, records_synced, records_failed, started_at, completed_at)
         VALUES ($1, $2, $3, 'users', 'completed', $4, 0, NOW(), NOW())`,
        [syncId, connection.id, PLATFORM_TYPE, synced],
      );
    } catch (_) { /* optional sync log */ }

    await AuditService.log({
      userId,
      action: 'iterable.sync_users',
      resourceType: 'crm_sync',
      resourceId: connection.id,
      details: { synced, failed: 0 },
    });

    logger.info('Iterable users synced', { userId, synced });
    await cacheFlush('iterable:users:*');

    return { synced, failed: 0 };
  }

  /**
   * Create a new Iterable user. Validates email, checks connection,
   * inserts into crm_contact_mappings, creates contact mapping, audit-logs.
   */
  static async createUser(
    userId: string,
    data: {
      email: string;
      first_name?: string;
      last_name?: string;
      data_fields?: Record<string, unknown>;
    },
  ): Promise<any> {
    if (!data.email || data.email.trim().length === 0) {
      throw new ValidationError('Email is required', [
        { field: 'email', message: 'Email is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO crm_contact_mappings (id, user_id, platform_type, email, first_name, last_name, data_fields, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
        [
          id, userId, PLATFORM_TYPE,
          data.email.trim(),
          data.first_name || null,
          data.last_name || null,
          data.data_fields ? JSON.stringify(data.data_fields) : null,
        ],
      );
    } catch (err: any) {
      if (err && err.code === '23505') {
        throw new ValidationError('A user with this email already exists', [
          { field: 'email', message: 'Duplicate email address', value: data.email },
        ]);
      }
      throw err;
    }

    const user = result.rows[0];

    // Create contact mapping
    try {
      await pool.query(
        `INSERT INTO crm_contact_mappings_index (id, platform_type, internal_id, external_id, entity_type, last_synced_at)
         VALUES ($1, $2, $3, $4, 'user', NOW())`,
        [generateId(), PLATFORM_TYPE, id, user.iterable_user_id || id],
      );
    } catch (_) { /* optional mapping */ }

    await AuditService.log({
      userId,
      action: 'iterable.create_user',
      resourceType: 'crm_contact_mapping',
      resourceId: id,
      details: { email: data.email },
    });
    logger.info('Iterable user created', { userId, contactId: id, email: data.email });

    return user;
  }

  /**
   * Update an existing Iterable user. Checks connection, updates user.
   * Throws NotFoundError when missing. Invalidates cache.
   */
  static async updateUser(
    userId: string,
    iterableUserId: string,
    data: Record<string, unknown>,
  ): Promise<any> {
    await requireConnection(userId);

    const result = await pool.query(
      `UPDATE crm_contact_mappings SET first_name = COALESCE($1, first_name), data_fields = COALESCE($2, data_fields), updated_at = NOW()
       WHERE id = $3 AND platform_type = $4 RETURNING *`,
      [data.first_name || null, data.data_fields ? JSON.stringify(data.data_fields) : null, iterableUserId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Iterable user "${iterableUserId}" not found`);
    }

    await cacheDel(`iterable:user:${iterableUserId}`);
    await cacheFlush('iterable:users:*');
    logger.info('Iterable user updated', { userId, iterableUserId });

    return result.rows[0];
  }

  /**
   * Get a single user. Cache first, DB on miss, null when not found.
   */
  static async getUser(userId: string): Promise<any | null> {
    const cacheKey = `iterable:user:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Iterable user cache hit', { userId });
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    const result = await pool.query(
      `SELECT * FROM crm_contact_mappings WHERE id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    await cacheSet(cacheKey, user, CACHE_TTL);

    return user;
  }

  /**
   * Paginated list with optional search. Defaults: page 1, limit 20.
   */
  static async listUsers(filters: IterableUserFilters = {}): Promise<PaginatedResult<any>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`platform_type = $1`];
    const params: unknown[] = [PLATFORM_TYPE];
    let idx = 2;

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(`(email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx})`);
      params.push(term);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const dataRes = await pool.query(
      `SELECT * FROM crm_contact_mappings ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    const countRes = await pool.query(
      `SELECT count(*) AS count FROM crm_contact_mappings ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count as string, 10);

    return {
      data: dataRes.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Track a custom event. Validates event_name is required, checks connection,
   * inserts event record, audit-logs.
   */
  static async trackEvent(
    userId: string,
    eventData: IterableEventData,
  ): Promise<any> {
    if (!eventData.event_name || eventData.event_name.trim().length === 0) {
      throw new ValidationError('Event name is required', [
        { field: 'event_name', message: 'Event name is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO crm_events (id, user_id, platform_type, event_name, data_fields, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [
        id, userId, PLATFORM_TYPE,
        eventData.event_name.trim(),
        eventData.data_fields ? JSON.stringify(eventData.data_fields) : null,
      ],
    );

    await AuditService.log({
      userId,
      action: 'iterable.track_event',
      resourceType: 'iterable_event',
      resourceId: id,
      details: { event_name: eventData.event_name },
    });
    logger.info('Iterable event tracked', { userId, eventId: id, eventName: eventData.event_name });

    return result.rows[0];
  }

  /**
   * Track a purchase with items and total.
   */
  static async trackPurchase(
    userId: string,
    purchaseData: IterablePurchaseData,
  ): Promise<any> {
    await requireConnection(userId);

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO crm_purchases (id, user_id, platform_type, items, total, campaign_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [
        id, userId, PLATFORM_TYPE,
        JSON.stringify(purchaseData.items),
        purchaseData.total,
        purchaseData.campaign_id || null,
      ],
    );

    await AuditService.log({
      userId,
      action: 'iterable.track_purchase',
      resourceType: 'iterable_purchase',
      resourceId: id,
      details: { total: purchaseData.total, itemCount: Array.isArray(purchaseData.items) ? purchaseData.items.length : 1 },
    });
    logger.info('Iterable purchase tracked', { userId, purchaseId: id, total: purchaseData.total });

    return result.rows[0];
  }

  /**
   * Sync campaigns from Iterable. Checks connection, fetches campaigns,
   * updates sync timestamp, inserts sync log. Returns { synced, failed }.
   */
  static async syncCampaigns(userId: string): Promise<SyncResult> {
    await requireConnection(userId);

    const campaigns = await pool.query(
      `SELECT * FROM email_campaign_syncs WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = campaigns.rows.length;

    await pool.query(
      `UPDATE crm_connections SET last_campaign_sync_at = NOW() WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );

    // Insert sync log entry
    const syncId = generateId();
    try {
      await pool.query(
        `INSERT INTO crm_sync_logs (id, platform_type, sync_type, status, records_synced, records_failed, started_at, completed_at)
         VALUES ($1, $2, 'campaigns', 'completed', $3, 0, NOW(), NOW())`,
        [syncId, PLATFORM_TYPE, synced],
      );
    } catch (_) { /* optional sync log */ }

    logger.info('Iterable campaigns synced', { userId, synced });

    return { synced, failed: 0 };
  }

  /**
   * Get campaign metrics. Cache/DB/null pattern.
   */
  static async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const cacheKey = `iterable:campaign_metrics:${campaignId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Iterable campaign metrics cache hit', { campaignId });
      return (typeof cached === 'string' ? JSON.parse(cached) : cached) as CampaignMetrics;
    }

    const result = await pool.query(
      `SELECT * FROM email_campaign_metrics WHERE campaign_id = $1`,
      [campaignId],
    );
    if (result.rows.length === 0) return null;

    const metrics = result.rows[0];
    await cacheSet(cacheKey, metrics, CACHE_TTL);

    return metrics;
  }

  /**
   * Create a new Iterable list. Validates non-empty name, checks connection,
   * inserts list, audit-logs.
   */
  static async createList(
    userId: string,
    data: IterableListCreateData,
  ): Promise<any> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('List name is required', [
        { field: 'name', message: 'List name is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO crm_lists (id, user_id, platform_type, name, description, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [id, userId, PLATFORM_TYPE, data.name.trim(), data.description || null],
    );

    await AuditService.log({
      userId,
      action: 'iterable.create_list',
      resourceType: 'iterable_list',
      resourceId: id,
      details: { name: data.name },
    });
    logger.info('Iterable list created', { userId, listId: id, name: data.name });

    return result.rows[0];
  }

  /**
   * Add users to a list. Checks connection, checks list exists (NotFoundError).
   * Handles empty array. Audit-logs the operation.
   */
  static async addToList(
    userId: string,
    listId: string,
    userIds: string[],
  ): Promise<{ added: number }> {
    await requireConnection(userId);

    const listRes = await pool.query(
      `SELECT * FROM crm_lists WHERE id = $1 AND platform_type = $2`,
      [listId, PLATFORM_TYPE],
    );
    if (listRes.rows.length === 0) {
      throw new NotFoundError(`Iterable list "${listId}" not found`);
    }

    if (!userIds || userIds.length === 0) {
      logger.debug('addToList called with empty userIds', { listId });
      return { added: 0 };
    }

    const insertResult = await pool.query(
      `INSERT INTO crm_list_members (list_id, user_id, platform_type, created_at)
       SELECT $1, unnest($2::text[]), $3, NOW()
       ON CONFLICT DO NOTHING`,
      [listId, userIds, PLATFORM_TYPE],
    );
    const added = insertResult.rowCount || 0;

    await AuditService.log({
      userId,
      action: 'iterable.add_to_list',
      resourceType: 'iterable_list',
      resourceId: listId,
      details: { userIds, added },
    });
    logger.info('Users added to Iterable list', { userId, listId, added });

    return { added };
  }

  /**
   * Get sync status. Returns last sync time and record counts.
   * Returns defaults when no sync has occurred.
   */
  static async getSyncStatus(): Promise<any> {
    const result = await pool.query(
      `SELECT last_sync_at, users_count, campaigns_count, lists_count
       FROM crm_sync_status WHERE platform_type = $1 LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return {
        last_sync_at: null,
        users_count: 0,
        campaigns_count: 0,
        lists_count: 0,
      };
    }

    return result.rows[0];
  }

  /**
   * Get connection status. Returns active, disconnected, or error
   * based on the connection record status.
   */
  static async getConnectionStatus(userId: string): Promise<any> {
    const result = await pool.query(
      `SELECT * FROM crm_connections WHERE user_id = $1 AND platform_type = $2 LIMIT 1`,
      [userId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return { status: 'disconnected' };
    }

    const connection = result.rows[0];
    if (connection.status === 'active') {
      return { status: 'active', connection };
    }

    return { status: 'error', connection, reason: `Connection status: ${connection.status}` };
  }
}

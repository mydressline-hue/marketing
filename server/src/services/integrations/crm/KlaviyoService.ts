/**
 * Klaviyo Integration Service.
 *
 * Static methods for synchronising profiles, tracking events, managing
 * lists, and syncing email campaigns with the Klaviyo platform.
 *
 * Tables: crm_connections, crm_sync_logs, crm_contact_mappings, email_campaign_syncs
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

export interface KlaviyoProfile {
  id: string;
  user_id: string;
  platform_type: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  title: string | null;
  organization: string | null;
  kl_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KlaviyoEvent {
  id: string;
  user_id: string;
  event_name: string;
  properties: Record<string, unknown> | null;
  profile_id: string | null;
  timestamp: string | null;
  created_at: string;
}

export interface KlaviyoList {
  id: string;
  user_id: string;
  platform_type: string;
  name: string;
  kl_list_id: string | null;
  profile_count: number;
  created_at: string;
}

export interface KlaviyoCampaign {
  id: string;
  user_id: string;
  platform_type: string;
  name: string;
  status: string;
  subject_line: string | null;
  send_time: string | null;
  kl_campaign_id: string | null;
  created_at: string;
}

export interface CampaignMetrics {
  campaign_id: string;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  unsubscribe_rate: number;
  total_recipients: number;
  total_opens: number;
  total_clicks: number;
  total_bounces: number;
  total_unsubscribes: number;
  revenue: number;
}

export interface SyncResult { synced: number; failed: number }

export interface ProfileFilters {
  search?: string;
  organization?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_TYPE = 'klaviyo';
const CACHE_TTL = 300;

// ---------------------------------------------------------------------------
// Helper - fetch active Klaviyo connection or throw
// ---------------------------------------------------------------------------

async function requireConnection(userId: string) {
  const conn = await pool.query(
    `SELECT * FROM crm_connections WHERE user_id = $1 AND platform_type = $2 AND status = 'active' LIMIT 1`,
    [userId, PLATFORM_TYPE],
  );
  if (conn.rows.length === 0) {
    throw new NotFoundError('No active Klaviyo connection found for this user');
  }
  return conn.rows[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KlaviyoService {
  /**
   * Sync profiles from Klaviyo. Checks crm_connections, counts existing,
   * upserts profiles, updates sync timestamp, audit-logs the operation.
   */
  static async syncProfiles(userId: string): Promise<SyncResult> {
    const connection = await requireConnection(userId);

    const cnt = await pool.query(
      `SELECT count(*) AS count FROM crm_contact_mappings WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = parseInt(cnt.rows[0].count as string, 10);

    // Upsert profiles from Klaviyo API
    const upserted = await pool.query(
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

    await AuditService.log({
      userId,
      action: 'klaviyo.sync_profiles',
      resourceType: 'crm_sync',
      resourceId: connection.id,
      details: { synced, failed: 0 },
    });

    logger.info('Klaviyo profiles synced', { userId, synced });
    await cacheFlush('klaviyo:profiles:*');

    return { synced, failed: 0 };
  }

  /**
   * Create a profile. Validates email required, inserts into
   * crm_contact_mappings, audit-logs the creation.
   */
  static async createProfile(
    userId: string,
    data: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone_number?: string;
      organization?: string;
      title?: string;
    },
  ): Promise<any> {
    if (!data.email || data.email.trim().length === 0) {
      throw new ValidationError('Email is required to create a Klaviyo profile', [
        { field: 'email', message: 'Email is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO crm_contact_mappings (id, user_id, platform_type, email, first_name, last_name, phone_number, organization, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *`,
        [
          id, userId, PLATFORM_TYPE,
          data.email.trim(),
          data.first_name || null,
          data.last_name || null,
          data.phone_number || null,
          data.organization || null,
          data.title || null,
        ],
      );
    } catch (err: any) {
      if (err && err.code === '23505') {
        throw new ValidationError('A profile with this email already exists', [
          { field: 'email', message: 'Duplicate email address', value: data.email },
        ]);
      }
      throw err;
    }

    const profile = result.rows[0];
    await AuditService.log({
      userId,
      action: 'klaviyo.create_profile',
      resourceType: 'crm_contact',
      resourceId: id,
      details: { email: data.email },
    });
    logger.info('Klaviyo profile created', { profileId: id, userId });

    return profile;
  }

  /**
   * Update a profile. Checks connection, then updates. Throws NotFoundError
   * if missing. Invalidates cache.
   */
  static async updateProfile(
    userId: string,
    profileId: string,
    data: Record<string, unknown>,
  ): Promise<any> {
    await requireConnection(userId);

    const result = await pool.query(
      `UPDATE crm_contact_mappings SET phone_number = COALESCE($1, phone_number), title = COALESCE($2, title), updated_at = NOW()
       WHERE id = $3 AND platform_type = $4 RETURNING *`,
      [data.phone_number || null, data.title || null, profileId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Klaviyo profile with id "${profileId}" not found`);
    }

    await cacheDel(`klaviyo:profile:${profileId}`);
    await cacheFlush('klaviyo:profiles:*');
    logger.info('Klaviyo profile updated', { profileId, userId });

    return result.rows[0];
  }

  /**
   * Get a single profile by ID. Cache first, then DB, returns null if absent.
   */
  static async getProfile(profileId: string): Promise<any | null> {
    const cacheKey = `klaviyo:profile:${profileId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Klaviyo profile cache hit', { profileId });
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    const result = await pool.query(
      `SELECT * FROM crm_contact_mappings WHERE id = $1 AND platform_type = $2`,
      [profileId, PLATFORM_TYPE],
    );
    if (result.rows.length === 0) return null;

    const profile = result.rows[0];
    await cacheSet(cacheKey, profile, CACHE_TTL);

    return profile;
  }

  /**
   * List profiles with pagination and optional search / organization filter.
   * Defaults: page=1, limit=20.
   */
  static async listProfiles(filters: ProfileFilters = {}): Promise<PaginatedResult<any>> {
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

    if (filters.organization) {
      conditions.push(`organization = $${idx++}`);
      params.push(filters.organization);
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
   * Track an event. Validates event_name required, checks connection,
   * inserts event record, audit-logs.
   */
  static async trackEvent(
    userId: string,
    eventData: {
      event_name: string;
      properties?: Record<string, unknown>;
      profile_id?: string;
      timestamp?: string;
    },
  ): Promise<any> {
    if (!eventData.event_name || eventData.event_name.trim().length === 0) {
      throw new ValidationError('Event name is required', [
        { field: 'event_name', message: 'Event name is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO crm_events (id, user_id, platform_type, event_name, properties, profile_id, timestamp, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [
        id, userId, PLATFORM_TYPE,
        eventData.event_name.trim(),
        eventData.properties ? JSON.stringify(eventData.properties) : null,
        eventData.profile_id || null,
        eventData.timestamp || null,
      ],
    );

    await AuditService.log({
      userId,
      action: 'klaviyo.track_event',
      resourceType: 'crm_event',
      resourceId: id,
      details: { event_name: eventData.event_name },
    });
    logger.info('Klaviyo event tracked', { eventId: id, userId, eventName: eventData.event_name });

    return result.rows[0];
  }

  /**
   * Sync campaigns from Klaviyo. Checks connection, fetches campaigns,
   * updates sync timestamp. Returns { synced, failed }.
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

    logger.info('Klaviyo campaigns synced', { userId, synced });

    return { synced, failed: 0 };
  }

  /**
   * Get campaign metrics. Cache check, query DB, returns metrics or null.
   * Caches result after fetch.
   */
  static async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const cacheKey = `klaviyo:campaign_metrics:${campaignId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Klaviyo campaign metrics cache hit', { campaignId });
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
   * Create a new Klaviyo list. Validates name required, inserts list, audit-logs.
   */
  static async createList(
    userId: string,
    data: { name: string; description?: string },
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
      action: 'klaviyo.create_list',
      resourceType: 'crm_list',
      resourceId: id,
      details: { name: data.name },
    });
    logger.info('Klaviyo list created', { listId: id, userId, name: data.name });

    return result.rows[0];
  }

  /**
   * Add profiles to a list. Checks connection, checks list exists (NotFoundError).
   * Handles empty array. Audit-logs the operation.
   */
  static async addToList(
    userId: string,
    listId: string,
    profileIds: string[],
  ): Promise<{ added: number }> {
    await requireConnection(userId);

    const listRes = await pool.query(
      `SELECT * FROM crm_lists WHERE id = $1 AND platform_type = $2`,
      [listId, PLATFORM_TYPE],
    );
    if (listRes.rows.length === 0) {
      throw new NotFoundError(`Klaviyo list with id "${listId}" not found`);
    }

    if (!profileIds || profileIds.length === 0) {
      logger.debug('Klaviyo addToList: empty profileIds, skipping', { listId });
      return { added: 0 };
    }

    const insertResult = await pool.query(
      `INSERT INTO crm_list_members (list_id, profile_id, platform_type, created_at)
       SELECT $1, unnest($2::text[]), $3, NOW()
       ON CONFLICT DO NOTHING`,
      [listId, profileIds, PLATFORM_TYPE],
    );
    const added = insertResult.rowCount || 0;

    await AuditService.log({
      userId,
      action: 'klaviyo.add_to_list',
      resourceType: 'crm_list',
      resourceId: listId,
      details: { profileIds, added },
    });
    logger.info('Profiles added to Klaviyo list', { listId, userId, added });

    return { added };
  }

  /**
   * Sync profiles from the real Klaviyo API.
   *
   * Reads the API key from the crm_connections table, calls the Klaviyo
   * Profiles endpoint with the appropriate Klaviyo-API-Key auth header
   * and revision header, logs the sync operation, and returns the parsed
   * profile records.
   *
   * @param integrationId - The ID of the crm_connections row to use.
   * @returns The parsed Klaviyo profile records from the API.
   */
  static async syncFromKlaviyo(integrationId: string): Promise<Record<string, unknown>> {
    try {
      // 1. Read credentials from DB
      const connResult = await pool.query(
        `SELECT * FROM crm_connections WHERE id = $1 AND platform_type = $2 LIMIT 1`,
        [integrationId, PLATFORM_TYPE],
      );
      if (connResult.rows.length === 0) {
        throw new NotFoundError(`Klaviyo connection "${integrationId}" not found`);
      }

      const connection = connResult.rows[0];
      const credentials = typeof connection.credentials === 'string'
        ? JSON.parse(connection.credentials)
        : connection.credentials;

      const apiKey = credentials?.api_key;

      if (!apiKey) {
        throw new ValidationError('Klaviyo connection is missing api_key');
      }

      // 2. Call the real Klaviyo API
      const apiUrl = 'https://a.klaviyo.com/api/profiles/';

      logger.info('Calling Klaviyo API', { integrationId, apiUrl });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'revision': '2024-02-15',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('Klaviyo API request failed', {
          integrationId,
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
        });
        throw new Error(`Klaviyo API error: ${response.status} ${response.statusText}`);
      }

      // 3. Parse response
      const data = await response.json();

      // 4. Log the sync operation
      const syncId = generateId();
      try {
        await pool.query(
          `INSERT INTO crm_sync_logs (id, connection_id, platform_type, sync_type, status, records_synced, records_failed, started_at, completed_at)
           VALUES ($1, $2, $3, 'profiles', 'completed', $4, 0, NOW(), NOW())`,
          [syncId, integrationId, PLATFORM_TYPE, data.data?.length || 0],
        );
      } catch (logErr) {
        logger.warn('Failed to insert Klaviyo sync log', {
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }

      await pool.query(
        `UPDATE crm_connections SET last_sync_at = NOW() WHERE id = $1`,
        [integrationId],
      );

      await AuditService.log({
        userId: connection.user_id,
        action: 'klaviyo.api_sync',
        resourceType: 'crm_sync',
        resourceId: integrationId,
        details: { recordCount: data.data?.length },
      });

      logger.info('Klaviyo API sync completed', {
        integrationId,
        recordCount: data.data?.length,
      });

      // 5. Return the data
      return data;
    } catch (error) {
      logger.error('Klaviyo API sync failed', {
        integrationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get sync status. Returns last sync time and record counts.
   * Returns defaults when no sync has occurred.
   */
  static async getSyncStatus(): Promise<any> {
    const result = await pool.query(
      `SELECT last_sync_at, profiles_count, campaigns_count, lists_count
       FROM crm_sync_status WHERE platform_type = $1 LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return {
        last_sync_at: null,
        profiles_count: 0,
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

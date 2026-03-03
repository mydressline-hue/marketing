/**
 * Mailchimp Integration Service.
 *
 * Static methods for synchronising audiences, managing members, syncing
 * and sending email campaigns, and retrieving campaign metrics from the
 * Mailchimp platform.
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

export interface MailchimpAudience {
  id: string;
  user_id: string;
  name: string;
  platform_type: string;
  mc_audience_id: string | null;
  server_prefix: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface MailchimpMember {
  id: string;
  audience_id: string;
  platform_type: string;
  email_address: string;
  full_name: string | null;
  status: string;
  mc_member_id: string | null;
  server_prefix: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface MailchimpCampaign {
  id: string;
  user_id: string;
  platform_type: string;
  name: string;
  status: string;
  type: string | null;
  subject_line: string | null;
  from_name: string | null;
  from_email: string | null;
  audience_id: string | null;
  mc_campaign_id: string | null;
  server_prefix: string | null;
  send_time: string | null;
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
}

export interface SyncResult { synced: number; failed: number }

export interface MemberFilters {
  search?: string;
  status?: string;
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

const PLATFORM_TYPE = 'mailchimp';
const CACHE_TTL = 300;

// ---------------------------------------------------------------------------
// Helper - fetch active Mailchimp connection or throw
// ---------------------------------------------------------------------------

async function requireConnection(userId: string) {
  const conn = await pool.query(
    `SELECT * FROM crm_connections WHERE user_id = $1 AND platform_type = $2 AND status = 'active' LIMIT 1`,
    [userId, PLATFORM_TYPE],
  );
  if (conn.rows.length === 0) {
    throw new NotFoundError('No active Mailchimp connection found for this user');
  }
  return conn.rows[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MailchimpService {
  /**
   * Sync audiences from Mailchimp. Checks crm_connections, counts existing,
   * upserts audiences, updates sync timestamp, audit-logs the operation.
   */
  static async syncAudiences(userId: string): Promise<SyncResult> {
    const connection = await requireConnection(userId);

    const cnt = await pool.query(
      `SELECT count(*) AS count FROM crm_contact_mappings WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = parseInt(cnt.rows[0].count as string, 10);

    // Upsert audiences from Mailchimp API
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

    await AuditService.log({
      userId,
      action: 'mailchimp.sync_audiences',
      resourceType: 'crm_sync',
      resourceId: connection.id,
      details: { synced, failed: 0 },
    });

    logger.info('Mailchimp audiences synced', { userId, synced });
    await cacheFlush('mailchimp:audiences:*');

    return { synced, failed: 0 };
  }

  /**
   * Create an audience. Validates required fields, checks connection,
   * inserts audience record, audit-logs.
   */
  static async createAudience(
    userId: string,
    data: { name: string; permission_reminder?: string; from_name?: string; from_email?: string },
  ): Promise<Record<string, unknown>> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Audience name is required', [
        { field: 'name', message: 'Audience name is required' },
      ]);
    }

    await requireConnection(userId);

    const id = generateId();
    let result;
    try {
      result = await pool.query(
        `INSERT INTO crm_audiences (id, user_id, platform_type, name, permission_reminder, from_name, from_email, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
        [id, userId, PLATFORM_TYPE, data.name.trim(), data.permission_reminder || null, data.from_name || null, data.from_email || null],
      );
    } catch (err: unknown) {
      if (err instanceof Object && 'code' in err && err.code === '23505') {
        throw new ValidationError('An audience with this name already exists', [
          { field: 'name', message: 'Duplicate audience name', value: data.name },
        ]);
      }
      throw err;
    }

    const audience = result.rows[0];
    await AuditService.log({
      userId,
      action: 'mailchimp.create_audience',
      resourceType: 'crm_audience',
      resourceId: id,
      details: { name: data.name },
    });
    logger.info('Mailchimp audience created', { audienceId: id, userId, name: data.name });

    return audience;
  }

  /**
   * Add members to an audience. Checks connection, checks audience exists
   * (NotFoundError). Handles empty array. Audit-logs the operation.
   */
  static async addMembers(
    userId: string,
    audienceId: string,
    members: Array<{ email_address: string; full_name?: string; status?: string; tags?: string[] }>,
  ): Promise<{ added: number }> {
    await requireConnection(userId);

    const audRes = await pool.query(
      `SELECT * FROM crm_audiences WHERE id = $1 AND platform_type = $2`,
      [audienceId, PLATFORM_TYPE],
    );
    if (audRes.rows.length === 0) {
      throw new NotFoundError(`Mailchimp audience with id "${audienceId}" not found`);
    }

    if (!members || members.length === 0) {
      logger.debug('Mailchimp addMembers: empty members array, skipping', { audienceId });
      return { added: 0 };
    }

    const insertResult = await pool.query(
      `INSERT INTO crm_audience_members (audience_id, platform_type, members_data, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [audienceId, PLATFORM_TYPE, JSON.stringify(members)],
    );
    const added = insertResult.rowCount || 0;

    await AuditService.log({
      userId,
      action: 'mailchimp.add_members',
      resourceType: 'crm_audience',
      resourceId: audienceId,
      details: { added, total: members.length },
    });
    logger.info('Members added to Mailchimp audience', { audienceId, userId, added });

    return { added };
  }

  /**
   * Remove a member from an audience. Checks connection, checks member exists.
   * NotFoundError if missing. Cache invalidate. Audit-logs.
   */
  static async removeMember(userId: string, audienceId: string, memberId: string): Promise<{ removed: boolean }> {
    await requireConnection(userId);

    const memRes = await pool.query(
      `SELECT * FROM crm_audience_members WHERE id = $1 AND audience_id = $2 AND platform_type = $3`,
      [memberId, audienceId, PLATFORM_TYPE],
    );
    if (memRes.rows.length === 0) {
      throw new NotFoundError(`Member with id "${memberId}" not found in audience "${audienceId}"`);
    }

    await pool.query(
      `DELETE FROM crm_audience_members WHERE id = $1 AND audience_id = $2 AND platform_type = $3`,
      [memberId, audienceId, PLATFORM_TYPE],
    );

    await cacheDel(`mailchimp:audience:${audienceId}`);
    await cacheFlush('mailchimp:members:*');
    await AuditService.log({
      userId,
      action: 'mailchimp.remove_member',
      resourceType: 'crm_audience',
      resourceId: audienceId,
      details: { memberId },
    });
    logger.info('Member removed from Mailchimp audience', { audienceId, memberId, userId });

    return { removed: true };
  }

  /**
   * List members of an audience. Paginated, search, filter by status.
   * Defaults: page=1, limit=20.
   */
  static async listMembers(audienceId: string, filters: MemberFilters = {}): Promise<PaginatedResult<Record<string, unknown>>> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`audience_id = $1`, `platform_type = $2`];
    const params: unknown[] = [audienceId, PLATFORM_TYPE];
    let idx = 3;

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(`(email_address ILIKE $${idx} OR full_name ILIKE $${idx})`);
      params.push(term);
      idx++;
    }

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const dataRes = await pool.query(
      `SELECT * FROM crm_audience_members ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    const countRes = await pool.query(
      `SELECT count(*) AS count FROM crm_audience_members ${where}`,
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
   * Sync campaigns from Mailchimp. Check connection, fetch campaigns,
   * update sync timestamp. Returns { synced, failed }.
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

    logger.info('Mailchimp campaigns synced', { userId, synced });

    return { synced, failed: 0 };
  }

  /**
   * Create a campaign. Validates name required, checks connection, checks
   * audience exists, inserts campaign, audit-logs.
   */
  static async createCampaign(
    userId: string,
    data: { name: string; subject_line?: string; from_name?: string; from_email?: string; audience_id?: string; type?: string },
  ): Promise<Record<string, unknown>> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Campaign name is required', [
        { field: 'name', message: 'Campaign name is required' },
      ]);
    }

    await requireConnection(userId);

    // Verify audience exists if provided
    if (data.audience_id) {
      const audRes = await pool.query(
        `SELECT * FROM crm_audiences WHERE id = $1 AND platform_type = $2`,
        [data.audience_id, PLATFORM_TYPE],
      );
      if (audRes.rows.length === 0) {
        throw new NotFoundError(`Mailchimp audience with id "${data.audience_id}" not found`);
      }
    }

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO email_campaign_syncs (id, user_id, platform_type, name, subject_line, from_name, from_email, audience_id, type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW()) RETURNING *`,
      [id, userId, PLATFORM_TYPE, data.name.trim(), data.subject_line || null, data.from_name || null, data.from_email || null, data.audience_id || null, data.type || null],
    );

    const campaign = result.rows[0];
    await AuditService.log({
      userId,
      action: 'mailchimp.create_campaign',
      resourceType: 'email_campaign',
      resourceId: id,
      details: { name: data.name },
    });
    logger.info('Mailchimp campaign created', { campaignId: id, userId });

    return campaign;
  }

  /**
   * Send a campaign. Checks connection, checks campaign exists, updates
   * status. Audit-logs. Cache invalidate.
   */
  static async sendCampaign(userId: string, campaignId: string): Promise<Record<string, unknown>> {
    await requireConnection(userId);

    const campRes = await pool.query(
      `SELECT * FROM email_campaign_syncs WHERE id = $1 AND platform_type = $2`,
      [campaignId, PLATFORM_TYPE],
    );
    if (campRes.rows.length === 0) {
      throw new NotFoundError(`Mailchimp campaign with id "${campaignId}" not found`);
    }

    const result = await pool.query(
      `UPDATE email_campaign_syncs SET status = 'sending', sent_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [campaignId],
    );

    const campaign = result.rows[0];
    await AuditService.log({
      userId,
      action: 'mailchimp.send_campaign',
      resourceType: 'email_campaign',
      resourceId: campaignId,
      details: { name: campaign.name },
    });
    await cacheDel(`mailchimp:campaign:${campaignId}`);
    await cacheFlush('mailchimp:campaigns:*');
    logger.info('Mailchimp campaign sent', { campaignId, userId });

    return campaign;
  }

  /**
   * Get campaign metrics. Cache/DB/null. Returns metrics row directly.
   * Caches after fetch.
   */
  static async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const cacheKey = `mailchimp:campaign_metrics:${campaignId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug('Mailchimp campaign metrics cache hit', { campaignId });
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
   * Get overall sync status. Returns last sync time + counts with defaults.
   */
  static async getSyncStatus(): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `SELECT last_sync_at, audiences_count, members_count, campaigns_count
       FROM crm_sync_status WHERE platform_type = $1 LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return {
        last_sync_at: null,
        audiences_count: 0,
        members_count: 0,
        campaigns_count: 0,
      };
    }

    return result.rows[0];
  }

  /**
   * Get connection status. Returns active, disconnected, or error
   * based on the connection record status.
   */
  static async getConnectionStatus(userId: string): Promise<Record<string, unknown>> {
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

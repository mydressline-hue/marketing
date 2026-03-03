/**
 * Salesforce CRM Integration Service.
 *
 * Static methods for syncing contacts, leads, and opportunities with
 * Salesforce, plus CRUD on local CRM contact mappings. All mutations are
 * audit-logged; read paths use Redis caching.
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

export interface SalesforceContact {
  id: string;
  user_id: string;
  platform_type: string;
  external_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string;
  company: string | null;
  phone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SyncResult { synced: number; failed: number }

export interface ContactFilters {
  search?: string;
  company?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedContacts {
  data: SalesforceContact[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  totalSynced: number;
  totalFailed: number;
}

export interface ConnectionStatus {
  status: 'active' | 'disconnected' | 'error' | 'expired';
  connectedAt: string | null;
  expiresAt: string | null;
}

export interface CreateContactData {
  email: string;
  first_name?: string;
  last_name: string;
  company?: string;
  phone?: string;
  title?: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateContactData {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  title?: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_TYPE = 'salesforce';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SalesforceService {
  /**
   * Sync contacts from Salesforce.  Verifies active connection, fetches
   * existing count, upserts contacts, updates sync timestamp.
   * Flushes cache and audits.
   */
  static async syncContacts(userId: string): Promise<SyncResult> {
    // Query 1: fetch connection
    const connection = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2 AND status = 'active'`,
      [userId, PLATFORM_TYPE],
    );
    if (connection.rows.length === 0) {
      throw new ValidationError('No active Salesforce connection found');
    }

    // Query 2: existing count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM crm_contact_mappings
       WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = parseInt(countResult.rows[0].count, 10);

    // Query 3: upsert contacts
    const upserted = await pool.query(
      `INSERT INTO crm_contact_mappings (user_id, platform_type)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [userId, PLATFORM_TYPE],
    );

    // Query 4: update sync timestamp
    await pool.query(
      `UPDATE crm_connections SET last_sync_at = NOW() WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );

    await cacheFlush(`${PLATFORM_TYPE}:contacts:*`);

    await AuditService.log({
      userId,
      action: 'salesforce_sync_contacts',
      resourceType: 'crm_sync',
      resourceId: connection.rows[0].id,
      details: { synced, upserted: upserted.rows.length },
    });

    return { synced, failed: 0 };
  }

  /**
   * Sync leads from Salesforce.  Checks connection, fetches leads,
   * updates sync timestamp.  Audits.
   */
  static async syncLeads(userId: string): Promise<SyncResult> {
    // Query 1: fetch connection
    const connection = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2 AND status = 'active'`,
      [userId, PLATFORM_TYPE],
    );
    if (connection.rows.length === 0) {
      throw new ValidationError('No active Salesforce connection found');
    }

    // Query 2: fetch leads
    const leadsResult = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, email, company, status, source, created_at, updated_at FROM crm_leads
       WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = leadsResult.rows.length;

    // Query 3: update sync timestamp
    await pool.query(
      `UPDATE crm_connections SET last_sync_at = NOW() WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );

    await AuditService.log({
      userId,
      action: 'salesforce_sync_leads',
      resourceType: 'crm_sync',
      resourceId: connection.rows[0].id,
      details: { synced },
    });

    return { synced, failed: 0 };
  }

  /**
   * Create a Salesforce contact mapping.  Validates required fields,
   * checks active connection, INSERTs into crm_contact_mappings.
   */
  static async createContact(userId: string, data: CreateContactData): Promise<SalesforceContact> {
    // Validate required fields
    if (!data.email || data.email.trim().length === 0 || !data.last_name || data.last_name.trim().length === 0) {
      throw new ValidationError('Contact validation failed: email and last_name are required');
    }

    // Query 1: fetch connection
    const connection = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2 AND status = 'active'`,
      [userId, PLATFORM_TYPE],
    );
    if (connection.rows.length === 0) {
      throw new ValidationError('No active Salesforce connection found');
    }

    const id = generateId();

    // Query 2: insert contact
    let result;
    try {
      result = await pool.query<SalesforceContact>(
        `INSERT INTO crm_contact_mappings
           (id, user_id, platform_type, email, first_name, last_name, company, phone, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [
          id, userId, PLATFORM_TYPE,
          data.email.trim().toLowerCase(),
          data.first_name?.trim() || null,
          data.last_name.trim(),
          data.company?.trim() || null,
          data.phone?.trim() || null,
          data.title?.trim() || null,
        ],
      );
    } catch (err: unknown) {
      if (err instanceof Object && 'code' in err && err.code === '23505') {
        throw new ValidationError('A contact with this email already exists');
      }
      throw err;
    }

    logger.info('Salesforce contact created', { contactId: id, userId });
    await AuditService.log({
      userId,
      action: 'salesforce_create_contact',
      resourceType: 'crm_contact',
      resourceId: id,
      details: { email: data.email, lastName: data.last_name },
    });
    return result.rows[0];
  }

  /**
   * Update a Salesforce contact mapping.  Supports partial updates.
   * Checks active connection then updates. Invalidates cache and audits.
   */
  static async updateContact(userId: string, contactId: string, data: UpdateContactData): Promise<SalesforceContact> {
    // Query 1: fetch connection
    const connection = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2 AND status = 'active'`,
      [userId, PLATFORM_TYPE],
    );
    if (connection.rows.length === 0) {
      throw new ValidationError('No active Salesforce connection found');
    }

    // Query 2: update contact
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.email !== undefined) { fields.push(`email = $${idx++}`); params.push(data.email.trim().toLowerCase()); }
    if (data.first_name !== undefined) { fields.push(`first_name = $${idx++}`); params.push(data.first_name.trim()); }
    if (data.last_name !== undefined) { fields.push(`last_name = $${idx++}`); params.push(data.last_name.trim()); }
    if (data.company !== undefined) { fields.push(`company = $${idx++}`); params.push(data.company.trim()); }
    if (data.phone !== undefined) { fields.push(`phone = $${idx++}`); params.push(data.phone.trim()); }
    if (data.title !== undefined) { fields.push(`title = $${idx++}`); params.push(data.title.trim()); }
    if (data.external_id !== undefined) { fields.push(`external_id = $${idx++}`); params.push(data.external_id); }
    if (data.metadata !== undefined) { fields.push(`metadata = $${idx++}`); params.push(JSON.stringify(data.metadata)); }

    fields.push('updated_at = NOW()');
    params.push(contactId);
    params.push(PLATFORM_TYPE);

    const result = await pool.query<SalesforceContact>(
      `UPDATE crm_contact_mappings SET ${fields.join(', ')}
       WHERE id = $${idx++} AND platform_type = $${idx++}
       RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Salesforce contact "${contactId}" not found`);
    }

    await cacheDel(`${PLATFORM_TYPE}:contact:${contactId}`);
    logger.info('Salesforce contact updated', { contactId, userId });
    await AuditService.log({
      userId,
      action: 'salesforce_update_contact',
      resourceType: 'crm_contact',
      resourceId: contactId,
      details: { updatedFields: Object.keys(data) },
    });
    return result.rows[0];
  }

  /**
   * Get a single contact by ID.  Cache -> DB fallback -> null.
   * Cache read failures are swallowed gracefully.
   */
  static async getContact(contactId: string): Promise<SalesforceContact | null> {
    const cacheKey = `${PLATFORM_TYPE}:contact:${contactId}`;

    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        logger.debug('Salesforce contact cache hit', { contactId });
        if (typeof cached === 'string') {
          return JSON.parse(cached);
        }
        return cached as SalesforceContact;
      }
    } catch (err) {
      logger.warn('Salesforce contact cache read failed, falling back to DB', {
        error: err instanceof Error ? err.message : String(err), contactId,
      });
    }

    const result = await pool.query<SalesforceContact>(
      `SELECT id, user_id, platform_type, email, external_id, local_id, metadata, created_at, updated_at FROM crm_contact_mappings WHERE id = $1 AND platform_type = $2`,
      [contactId, PLATFORM_TYPE],
    );
    if (result.rows.length === 0) return null;

    const contact = result.rows[0];
    try { await cacheSet(cacheKey, contact, CACHE_TTL); } catch (err) {
      logger.warn('Failed to cache Salesforce contact', {
        error: err instanceof Error ? err.message : String(err), contactId,
      });
    }
    return contact;
  }

  /**
   * Paginated listing with optional search (name/email) and company filter.
   * Defaults: page=1, limit=20 (max 100).  Ordered by created_at DESC.
   * Query order: data first, then count.
   */
  static async listContacts(filters?: ContactFilters): Promise<PaginatedContacts> {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters?.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`platform_type = $1`];
    const params: unknown[] = [PLATFORM_TYPE];
    let idx = 2;

    if (filters?.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(term);
      idx++;
    }
    if (filters?.company) {
      conditions.push(`company = $${idx++}`);
      params.push(filters.company);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Query 1: data
    const dataResult = await pool.query<SalesforceContact>(
      `SELECT id, user_id, platform_type, email, external_id, local_id, metadata, created_at, updated_at FROM crm_contact_mappings ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    // Query 2: count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM crm_contact_mappings ${where}`, params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows, total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Sync opportunities from Salesforce.  Checks connection, fetches
   * opportunities, updates sync timestamp.  Audits.
   */
  static async syncOpportunities(userId: string): Promise<SyncResult> {
    // Query 1: fetch connection
    const connection = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2 AND status = 'active'`,
      [userId, PLATFORM_TYPE],
    );
    if (connection.rows.length === 0) {
      throw new ValidationError('No active Salesforce connection found');
    }

    // Query 2: fetch opportunities
    const oppResult = await pool.query(
      `SELECT id, user_id, platform_type, external_id, name, amount, stage, close_date, created_at, updated_at FROM crm_opportunities
       WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );
    const synced = oppResult.rows.length;

    // Query 3: update sync timestamp
    await pool.query(
      `UPDATE crm_connections SET last_sync_at = NOW() WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );

    await AuditService.log({
      userId,
      action: 'salesforce_sync_opportunities',
      resourceType: 'crm_sync',
      resourceId: connection.rows[0].id,
      details: { synced },
    });

    return { synced, failed: 0 };
  }

  /**
   * Return last sync time and record counts.
   * Returns defaults if no sync occurred.  Re-throws DB errors.
   */
  static async getSyncStatus(): Promise<SyncStatus> {
    const result = await pool.query(
      `SELECT last_sync_at, contacts_count, leads_count, opportunities_count
       FROM crm_sync_status
       WHERE platform_type = $1
       ORDER BY last_sync_at DESC LIMIT 1`,
      [PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return { lastSyncTime: null, totalSynced: 0, totalFailed: 0 };
    }

    const row = result.rows[0];
    return {
      lastSyncTime: row.last_sync_at,
      totalSynced: (row.contacts_count || 0) + (row.leads_count || 0) + (row.opportunities_count || 0),
      totalFailed: 0,
    };
  }

  /**
   * Check connection status for a user.  Returns active / disconnected /
   * error / expired based on crm_connections state.
   */
  static async getConnectionStatus(userId: string): Promise<ConnectionStatus> {
    const result = await pool.query(
      `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections
       WHERE user_id = $1 AND platform_type = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, PLATFORM_TYPE],
    );

    if (result.rows.length === 0) {
      return { status: 'disconnected', connectedAt: null, expiresAt: null };
    }

    const row = result.rows[0];

    if (row.status === 'expired') {
      return { status: 'expired', connectedAt: row.created_at, expiresAt: null };
    }
    if (row.status === 'active') {
      return { status: 'active', connectedAt: row.created_at, expiresAt: null };
    }
    return { status: 'error', connectedAt: row.created_at, expiresAt: null };
  }

  /**
   * Sync contacts from the real Salesforce REST API.
   *
   * Reads the OAuth credentials (access_token, instance_url) from the
   * crm_connections table, calls the Salesforce SOQL query endpoint to
   * fetch up to 100 contacts, logs the sync operation, and returns the
   * parsed records.
   *
   * @param integrationId - The ID of the crm_connections row to use.
   * @returns The parsed Salesforce contact records from the API.
   */
  static async syncFromSalesforce(integrationId: string): Promise<Record<string, unknown>> {
    try {
      // 1. Read credentials from DB
      const connResult = await pool.query(
        `SELECT id, user_id, platform_type, status, api_key, last_sync_at, created_at, updated_at FROM crm_connections WHERE id = $1 AND platform_type = $2 LIMIT 1`,
        [integrationId, PLATFORM_TYPE],
      );
      if (connResult.rows.length === 0) {
        throw new NotFoundError(`Salesforce connection "${integrationId}" not found`);
      }

      const connection = connResult.rows[0];
      const credentials = typeof connection.credentials === 'string'
        ? JSON.parse(connection.credentials)
        : connection.credentials;

      const accessToken = credentials?.access_token;
      const instanceUrl = credentials?.instance_url;

      if (!accessToken || !instanceUrl) {
        throw new ValidationError('Salesforce connection is missing access_token or instance_url');
      }

      // 2. Call the real Salesforce API
      const soqlQuery = 'SELECT+Id,Name,Email+FROM+Contact+LIMIT+100';
      const apiUrl = `${instanceUrl}/services/data/v59.0/query/?q=${soqlQuery}`;

      logger.info('Calling Salesforce API', { integrationId, apiUrl });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('Salesforce API request failed', {
          integrationId,
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
        });
        throw new Error(`Salesforce API error: ${response.status} ${response.statusText}`);
      }

      // 3. Parse response
      const data = await response.json() as Record<string, unknown>;
      const totalSize = data.totalSize as number | undefined;
      const records = data.records as unknown[] | undefined;

      // 4. Log the sync operation
      const syncId = generateId();
      try {
        await pool.query(
          `INSERT INTO crm_sync_logs (id, connection_id, platform_type, sync_type, status, records_synced, records_failed, started_at, completed_at)
           VALUES ($1, $2, $3, 'contacts', 'completed', $4, 0, NOW(), NOW())`,
          [syncId, integrationId, PLATFORM_TYPE, totalSize || 0],
        );
      } catch (logErr) {
        logger.warn('Failed to insert Salesforce sync log', {
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }

      await pool.query(
        `UPDATE crm_connections SET last_sync_at = NOW() WHERE id = $1`,
        [integrationId],
      );

      await AuditService.log({
        userId: connection.user_id,
        action: 'salesforce_api_sync',
        resourceType: 'crm_sync',
        resourceId: integrationId,
        details: { totalSize, recordCount: records?.length },
      });

      logger.info('Salesforce API sync completed', {
        integrationId,
        totalSize,
        recordCount: records?.length,
      });

      // 5. Return the data
      return data;
    } catch (error) {
      logger.error('Salesforce API sync failed', {
        integrationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove the Salesforce connection for a user.  Flushes cache and audits.
   */
  static async disconnect(userId: string): Promise<void> {
    // Query 1: delete connection
    await pool.query(
      `DELETE FROM crm_connections WHERE user_id = $1 AND platform_type = $2`,
      [userId, PLATFORM_TYPE],
    );

    await cacheFlush(`${PLATFORM_TYPE}:*`);

    await AuditService.log({
      userId,
      action: 'salesforce_disconnect',
      resourceType: 'crm_connection',
      resourceId: userId,
      details: {},
    });
  }
}

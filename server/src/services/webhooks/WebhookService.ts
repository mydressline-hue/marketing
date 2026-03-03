/**
 * Webhook Ingest Layer Service.
 *
 * Provides static methods for registering webhook endpoints, verifying
 * inbound webhook signatures (HMAC-SHA256), processing and storing webhook
 * events, and querying webhook registrations and event history.
 *
 * Supported platforms:
 *   Ad:      google_ads, meta_ads, tiktok_ads, bing_ads, snapchat_ads
 *   Shopify: shopify
 *   CRM:     salesforce, hubspot, klaviyo, mailchimp, iterable
 */

import crypto from 'crypto';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { AuditService } from '../audit.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'webhooks';
const CACHE_TTL_REGISTRATIONS = 300; // 5 minutes

const SUPPORTED_PLATFORMS = [
  'google_ads',
  'meta_ads',
  'tiktok_ads',
  'bing_ads',
  'snapchat_ads',
  'shopify',
  'salesforce',
  'hubspot',
  'klaviyo',
  'mailchimp',
  'iterable',
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookRegistration {
  id: string;
  userId: string;
  platformType: string;
  webhookUrl: string | null;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  platformType: string;
  eventType: string;
  payload: object;
  status: string;
  userId: string | null;
  registrationId: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WebhookRegistrationConfig {
  webhookUrl?: string;
  secret?: string;
  events?: string[];
}

export interface WebhookEventFilters {
  eventType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedWebhookEvents {
  data: WebhookEvent[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

function rowToRegistration(row: Record<string, unknown>): WebhookRegistration {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    platformType: row.platform_type as string,
    webhookUrl: (row.webhook_url as string) ?? null,
    secret: row.secret as string,
    events: (row.events as string[]) ?? [],
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToEvent(row: Record<string, unknown>): WebhookEvent {
  return {
    id: row.id as string,
    platformType: row.platform_type as string,
    eventType: row.event_type as string,
    payload: (row.payload as object) ?? {},
    status: row.status as string,
    userId: (row.user_id as string) ?? null,
    registrationId: (row.registration_id as string) ?? null,
    processedAt: (row.processed_at as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WebhookService {
  /**
   * Register a webhook endpoint for a platform.
   *
   * Generates a cryptographic secret if one is not provided, stores the
   * registration in the `webhook_registrations` table, and invalidates
   * the cached registrations for the user.
   */
  static async registerWebhook(
    platformType: string,
    userId: string,
    config: WebhookRegistrationConfig,
  ): Promise<WebhookRegistration> {
    // Validate platform
    if (!SUPPORTED_PLATFORMS.includes(platformType as SupportedPlatform)) {
      throw new ValidationError(`Unsupported platform type: ${platformType}`, [
        { field: 'platformType', message: `Must be one of: ${SUPPORTED_PLATFORMS.join(', ')}` },
      ]);
    }

    const id = generateId();
    const secret = config.secret ?? crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO webhook_registrations
         (id, user_id, platform_type, webhook_url, secret, events, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
       RETURNING *`,
      [
        id,
        userId,
        platformType,
        config.webhookUrl ?? null,
        secret,
        config.events ?? [],
      ],
    );

    // Invalidate cached registrations for this user
    await cacheDel(`${CACHE_PREFIX}:registrations:${userId}`);

    logger.info('Webhook registered', {
      registrationId: id,
      platformType,
      userId,
    });

    await AuditService.log({
      userId,
      action: 'webhook.register',
      resourceType: 'webhook_registration',
      resourceId: id,
      details: { platformType, events: config.events },
    });

    return rowToRegistration(result.rows[0]);
  }

  /**
   * Verify an inbound webhook signature using HMAC-SHA256.
   *
   * Each platform encodes signatures differently:
   *   - Shopify:              Base64-encoded HMAC (X-Shopify-Hmac-Sha256)
   *   - Meta:                 Hex-encoded with `sha256=` prefix (X-Hub-Signature-256)
   *   - Google Ads:           Custom token equality check
   *   - Salesforce / HubSpot: Hex-encoded HMAC
   *   - Others:               Hex-encoded HMAC (default)
   *
   * Returns `true` when the computed digest matches the provided signature.
   */
  static verifySignature(
    platformType: string,
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    if (!signature || !secret) {
      return false;
    }

    try {
      switch (platformType) {
        case 'shopify': {
          // Shopify sends base64-encoded HMAC-SHA256
          const computed = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('base64');
          return crypto.timingSafeEqual(
            Buffer.from(computed),
            Buffer.from(signature),
          );
        }

        case 'meta_ads': {
          // Meta sends hex digest prefixed with "sha256="
          const computed = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
          const expected = `sha256=${computed}`;
          return crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(signature),
          );
        }

        case 'google_ads': {
          // Google Ads uses a simple token equality check
          return crypto.timingSafeEqual(
            Buffer.from(secret),
            Buffer.from(signature),
          );
        }

        case 'salesforce':
        case 'hubspot': {
          // Salesforce and HubSpot send hex-encoded HMAC-SHA256
          const computed = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
          return crypto.timingSafeEqual(
            Buffer.from(computed),
            Buffer.from(signature),
          );
        }

        default: {
          // Default: hex-encoded HMAC-SHA256
          const computed = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');
          return crypto.timingSafeEqual(
            Buffer.from(computed),
            Buffer.from(signature),
          );
        }
      }
    } catch (error) {
      logger.warn('Webhook signature verification failed', {
        platformType,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Store an inbound webhook event in the `webhook_events` table.
   *
   * The event is persisted with a status of `received` and can be later
   * updated to `processed` or `failed` by downstream consumers.
   *
   * @returns The generated event ID.
   */
  static async processWebhookEvent(
    platformType: string,
    eventType: string,
    payload: object,
    userId?: string,
    registrationId?: string,
  ): Promise<string> {
    const id = generateId();

    await pool.query(
      `INSERT INTO webhook_events
         (id, platform_type, event_type, payload, status, user_id, registration_id, created_at)
       VALUES ($1, $2, $3, $4, 'received', $5, $6, NOW())`,
      [
        id,
        platformType,
        eventType,
        JSON.stringify(payload),
        userId ?? null,
        registrationId ?? null,
      ],
    );

    logger.info('Webhook event stored', {
      eventId: id,
      platformType,
      eventType,
      userId: userId ?? 'unknown',
    });

    return id;
  }

  /**
   * Query paginated webhook events with optional filters.
   *
   * Supports filtering by platform, event type, status, and date range.
   */
  static async getWebhookEvents(
    platformType: string | undefined,
    userId: string,
    filters: WebhookEventFilters = {},
  ): Promise<PaginatedWebhookEvents> {
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (platformType) {
      conditions.push(`platform_type = $${paramIndex++}`);
      params.push(platformType);
    }

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total matching rows
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM webhook_events ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Pagination defaults
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT id, platform_type, event_type, payload, status, user_id, registration_id, processed_at, error_message, created_at FROM webhook_events ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(rowToEvent),
      total,
      page,
      totalPages,
    };
  }

  /**
   * List all active webhook registrations for a user.
   *
   * Results are cached for 5 minutes to reduce database load on repeated
   * reads.
   */
  static async getWebhookRegistrations(
    userId: string,
  ): Promise<WebhookRegistration[]> {
    const cacheKey = `${CACHE_PREFIX}:registrations:${userId}`;

    // Try cache first
    const cached = await cacheGet<WebhookRegistration[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT id, user_id, platform_type, webhook_url, secret, events, is_active, created_at, updated_at FROM webhook_registrations
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [userId],
    );

    const registrations = result.rows.map(rowToRegistration);

    // Cache the result
    await cacheSet(cacheKey, registrations, CACHE_TTL_REGISTRATIONS);

    return registrations;
  }

  /**
   * Look up an active webhook registration by platform type.
   *
   * Searches for registrations matching the given platform across all users,
   * returning the first active match. Used by the public inbound webhook
   * receiver to locate the correct secret for signature verification.
   */
  static async findRegistrationByPlatform(
    platformType: string,
  ): Promise<WebhookRegistration | null> {
    const result = await pool.query(
      `SELECT id, user_id, platform_type, webhook_url, secret, events, is_active, created_at, updated_at FROM webhook_registrations
       WHERE platform_type = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [platformType],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToRegistration(result.rows[0]);
  }

  /**
   * Mark a webhook event as processed.
   */
  static async markEventProcessed(eventId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE webhook_events
       SET status = 'processed', processed_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [eventId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Webhook event with id '${eventId}' not found`);
    }
  }

  /**
   * Mark a webhook event as failed with an error message.
   */
  static async markEventFailed(
    eventId: string,
    errorMessage: string,
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE webhook_events
       SET status = 'failed', error_message = $2, processed_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [eventId, errorMessage],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Webhook event with id '${eventId}' not found`);
    }
  }

  /**
   * Deactivate a webhook registration.
   */
  static async deactivateRegistration(
    registrationId: string,
    userId: string,
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE webhook_registrations
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [registrationId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(
        `Webhook registration with id '${registrationId}' not found`,
      );
    }

    // Invalidate cached registrations
    await cacheDel(`${CACHE_PREFIX}:registrations:${userId}`);

    logger.info('Webhook registration deactivated', {
      registrationId,
      userId,
    });

    await AuditService.log({
      userId,
      action: 'webhook.deactivate',
      resourceType: 'webhook_registration',
      resourceId: registrationId,
    });
  }
}

/**
 * Notification Service.
 *
 * Provides static methods for sending notifications across multiple channels
 * (email, slack, in_app, sms), managing notification lifecycle (read, delete),
 * and handling per-user notification preferences.
 *
 * Channel dispatch is delegated to the individual channel handlers in the
 * `channels/` directory. All channels except `in_app` are stubbed – they log
 * the send action and persist a delivery record but do not call external APIs.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';

import { EmailChannel } from './channels/EmailChannel';
import { SlackChannel } from './channels/SlackChannel';
import { InAppChannel } from './channels/InAppChannel';
import { SmsChannel } from './channels/SmsChannel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNREAD_COUNT_KEY_PREFIX = 'notifications:unread:';
const UNREAD_COUNT_TTL = 300; // 5 minutes

const VALID_CHANNELS = ['email', 'slack', 'in_app', 'sms'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const VALID_CATEGORIES = ['alert', 'system', 'campaign', 'integration', 'security'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationChannel = (typeof VALID_CHANNELS)[number];
export type NotificationPriority = (typeof VALID_PRIORITIES)[number];
export type NotificationCategory = (typeof VALID_CATEGORIES)[number];

export interface SendNotificationInput {
  userId: string;
  title: string;
  message: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  category: NotificationCategory;
  metadata?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  channels: string[];
  priority: string;
  category: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface NotificationFilters {
  channel?: string;
  category?: string;
  isRead?: boolean;
  priority?: string;
}

export interface NotificationPagination {
  page?: number;
  limit?: number;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  emailEnabled: boolean;
  slackEnabled: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
  alertChannels: string[];
  systemChannels: string[];
  campaignChannels: string[];
  integrationChannels: string[];
  securityChannels: string[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  slackEnabled?: boolean;
  inAppEnabled?: boolean;
  smsEnabled?: boolean;
  alertChannels?: string[];
  systemChannels?: string[];
  campaignChannels?: string[];
  integrationChannels?: string[];
  securityChannels?: string[];
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    message: row.message as string,
    channels: (row.channels as string[]) ?? [],
    priority: row.priority as string,
    category: row.category as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    isRead: row.is_read as boolean,
    readAt: (row.read_at as string) ?? null,
    isDeleted: row.is_deleted as boolean,
    createdAt: row.created_at as string,
  };
}

function rowToPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    emailEnabled: row.email_enabled as boolean,
    slackEnabled: row.slack_enabled as boolean,
    inAppEnabled: row.in_app_enabled as boolean,
    smsEnabled: row.sms_enabled as boolean,
    alertChannels: (row.alert_channels as string[]) ?? [],
    systemChannels: (row.system_channels as string[]) ?? [],
    campaignChannels: (row.campaign_channels as string[]) ?? [],
    integrationChannels: (row.integration_channels as string[]) ?? [],
    securityChannels: (row.security_channels as string[]) ?? [],
    quietHoursStart: (row.quiet_hours_start as string) ?? null,
    quietHoursEnd: (row.quiet_hours_end as string) ?? null,
    updatedAt: row.updated_at as string,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NotificationService {
  // -----------------------------------------------------------------------
  // Send
  // -----------------------------------------------------------------------

  /**
   * Send a notification across the requested channels.
   *
   * Persists the notification in the `notifications` table, then delegates
   * delivery to each requested channel handler.
   *
   * @returns The notification ID.
   */
  static async send(input: SendNotificationInput): Promise<string> {
    // Validate
    if (!input.title || !input.message) {
      throw new ValidationError('Title and message are required');
    }

    if (!input.channels || input.channels.length === 0) {
      throw new ValidationError('At least one channel is required');
    }

    for (const ch of input.channels) {
      if (!VALID_CHANNELS.includes(ch)) {
        throw new ValidationError(`Invalid channel: ${ch}`);
      }
    }

    if (!VALID_PRIORITIES.includes(input.priority)) {
      throw new ValidationError(`Invalid priority: ${input.priority}`);
    }

    if (!VALID_CATEGORIES.includes(input.category)) {
      throw new ValidationError(`Invalid category: ${input.category}`);
    }

    const id = generateId();

    // Persist notification
    await pool.query(
      `INSERT INTO notifications
         (id, user_id, title, message, channels, priority, category, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        input.userId,
        input.title,
        input.message,
        input.channels,
        input.priority,
        input.category,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    // Dispatch to each channel (fire-and-forget with error logging)
    await NotificationService.dispatchToChannels(id, input);

    logger.info('Notification sent', {
      notificationId: id,
      userId: input.userId,
      channels: input.channels,
      priority: input.priority,
      category: input.category,
    });

    return id;
  }

  /**
   * Send multiple notifications in a batch.
   *
   * @returns An array of notification IDs.
   */
  static async sendBulk(notifications: SendNotificationInput[]): Promise<string[]> {
    const ids: string[] = [];

    for (const notification of notifications) {
      try {
        const id = await NotificationService.send(notification);
        ids.push(id);
      } catch (error) {
        logger.error('Failed to send bulk notification', {
          userId: notification.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return ids;
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Get a user's notifications with optional filtering and pagination.
   */
  static async getNotifications(
    userId: string,
    filters?: NotificationFilters,
    pagination?: NotificationPagination,
  ): Promise<PaginatedNotifications> {
    const conditions: string[] = ['user_id = $1', 'is_deleted = false'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (filters?.channel) {
      conditions.push(`$${paramIndex++} = ANY(channels)`);
      params.push(filters.channel);
    }

    if (filters?.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(filters.category);
    }

    if (filters?.isRead !== undefined) {
      conditions.push(`is_read = $${paramIndex++}`);
      params.push(filters.isRead);
    }

    if (filters?.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(filters.priority);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total matching rows
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`,
      params,
    );
    const total: number = countResult.rows[0].total;

    // Pagination defaults
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT * FROM notifications ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(rowToNotification),
      total,
      page,
      totalPages,
    };
  }

  // -----------------------------------------------------------------------
  // Read / Unread
  // -----------------------------------------------------------------------

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_deleted = false
       RETURNING *`,
      [notificationId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Notification with id '${notificationId}' not found`);
    }

    // Invalidate cached unread count
    await cacheDel(`${UNREAD_COUNT_KEY_PREFIX}${userId}`);

    logger.info('Notification marked as read', { notificationId, userId });

    return rowToNotification(result.rows[0]);
  }

  /**
   * Mark all of a user's notifications as read.
   */
  static async markAllAsRead(userId: string): Promise<number> {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false AND is_deleted = false`,
      [userId],
    );

    const count = result.rowCount ?? 0;

    // Invalidate cached unread count
    await cacheDel(`${UNREAD_COUNT_KEY_PREFIX}${userId}`);

    logger.info('All notifications marked as read', { userId, count });

    return count;
  }

  /**
   * Get the unread notification count for a user.
   *
   * Returns a cached value when available, otherwise queries the database
   * and populates the cache.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    // Try cache first
    const cached = await cacheGet<number>(`${UNREAD_COUNT_KEY_PREFIX}${userId}`);
    if (cached !== null) {
      return cached;
    }

    // Query database
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false AND is_deleted = false`,
      [userId],
    );

    const count: number = result.rows[0]?.count ?? 0;

    // Cache the result
    await cacheSet(`${UNREAD_COUNT_KEY_PREFIX}${userId}`, count, UNREAD_COUNT_TTL);

    return count;
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  /**
   * Soft-delete a notification.
   */
  static async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE notifications
       SET is_deleted = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Notification with id '${notificationId}' not found`);
    }

    // If the notification was unread, invalidate the cached unread count
    if (!result.rows[0].is_read) {
      await cacheDel(`${UNREAD_COUNT_KEY_PREFIX}${userId}`);
    }

    logger.info('Notification deleted', { notificationId, userId });
  }

  // -----------------------------------------------------------------------
  // Preferences
  // -----------------------------------------------------------------------

  /**
   * Get a user's notification preferences.
   *
   * If no preferences exist yet a default record is created and returned.
   */
  static async getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId],
    );

    if (result.rows.length > 0) {
      return rowToPreferences(result.rows[0]);
    }

    // Create default preferences
    const id = generateId();
    const insertResult = await pool.query(
      `INSERT INTO notification_preferences (id, user_id, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING *`,
      [id, userId],
    );

    logger.info('Default notification preferences created', { userId });

    return rowToPreferences(insertResult.rows[0]);
  }

  /**
   * Update a user's notification preferences.
   */
  static async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<NotificationPreferences> {
    // Ensure preferences row exists
    await NotificationService.getPreferences(userId);

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.emailEnabled !== undefined) {
      setClauses.push(`email_enabled = $${paramIndex++}`);
      params.push(input.emailEnabled);
    }

    if (input.slackEnabled !== undefined) {
      setClauses.push(`slack_enabled = $${paramIndex++}`);
      params.push(input.slackEnabled);
    }

    if (input.inAppEnabled !== undefined) {
      setClauses.push(`in_app_enabled = $${paramIndex++}`);
      params.push(input.inAppEnabled);
    }

    if (input.smsEnabled !== undefined) {
      setClauses.push(`sms_enabled = $${paramIndex++}`);
      params.push(input.smsEnabled);
    }

    if (input.alertChannels !== undefined) {
      setClauses.push(`alert_channels = $${paramIndex++}`);
      params.push(input.alertChannels);
    }

    if (input.systemChannels !== undefined) {
      setClauses.push(`system_channels = $${paramIndex++}`);
      params.push(input.systemChannels);
    }

    if (input.campaignChannels !== undefined) {
      setClauses.push(`campaign_channels = $${paramIndex++}`);
      params.push(input.campaignChannels);
    }

    if (input.integrationChannels !== undefined) {
      setClauses.push(`integration_channels = $${paramIndex++}`);
      params.push(input.integrationChannels);
    }

    if (input.securityChannels !== undefined) {
      setClauses.push(`security_channels = $${paramIndex++}`);
      params.push(input.securityChannels);
    }

    if (input.quietHoursStart !== undefined) {
      setClauses.push(`quiet_hours_start = $${paramIndex++}`);
      params.push(input.quietHoursStart);
    }

    if (input.quietHoursEnd !== undefined) {
      setClauses.push(`quiet_hours_end = $${paramIndex++}`);
      params.push(input.quietHoursEnd);
    }

    params.push(userId);

    const result = await pool.query(
      `UPDATE notification_preferences
       SET ${setClauses.join(', ')}
       WHERE user_id = $${paramIndex}
       RETURNING *`,
      params,
    );

    logger.info('Notification preferences updated', { userId });

    return rowToPreferences(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // Channel dispatch (private)
  // -----------------------------------------------------------------------

  /**
   * Dispatch a notification to all requested channels.
   *
   * Errors from individual channels are logged but do not prevent delivery
   * on the remaining channels.
   */
  private static async dispatchToChannels(
    notificationId: string,
    input: SendNotificationInput,
  ): Promise<void> {
    const deliveryPromises = input.channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'email':
            await EmailChannel.send(
              input.userId, // In production: resolve to user's email address
              input.title,
              input.message,
              notificationId,
            );
            break;

          case 'slack':
            await SlackChannel.send(
              input.userId, // In production: resolve to Slack user/channel ID
              `*${input.title}*\n${input.message}`,
              notificationId,
            );
            break;

          case 'in_app':
            await InAppChannel.send(
              input.userId,
              {
                title: input.title,
                message: input.message,
                priority: input.priority,
                category: input.category,
                metadata: input.metadata,
              },
              notificationId,
            );
            break;

          case 'sms':
            await SmsChannel.send(
              input.userId, // In production: resolve to user's phone number
              `${input.title}: ${input.message}`,
              notificationId,
            );
            break;

          default:
            logger.warn('Unknown notification channel', { channel, notificationId });
        }
      } catch (error) {
        // Log the failure and persist an error delivery record
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('Channel delivery failed', {
          notificationId,
          channel,
          error: errorMessage,
        });

        await pool.query(
          `INSERT INTO notification_deliveries
             (id, notification_id, channel, status, error_message, created_at)
           VALUES ($1, $2, $3, 'failed', $4, NOW())`,
          [generateId(), notificationId, channel, errorMessage],
        ).catch((dbErr) => {
          logger.error('Failed to persist delivery error record', {
            notificationId,
            channel,
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });
      }
    });

    await Promise.allSettled(deliveryPromises);
  }
}

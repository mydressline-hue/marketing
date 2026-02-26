/**
 * In-App Channel – Fully functional in-app notification delivery.
 *
 * Unlike the other stub channels, InAppChannel stores notifications directly
 * in the database and updates the Redis unread-count cache so that clients
 * can poll for new notifications efficiently.
 */

import { pool } from '../../../config/database';
import { cacheSet, cacheDel } from '../../../config/redis';
import { generateId } from '../../../utils/helpers';
import { logger } from '../../../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Redis key prefix for the per-user unread notification count. */
const UNREAD_COUNT_KEY_PREFIX = 'notifications:unread:';

/** TTL for the cached unread count (5 minutes). */
const UNREAD_COUNT_TTL = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InAppNotificationPayload {
  title: string;
  message: string;
  priority: string;
  category: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export class InAppChannel {
  /**
   * Deliver an in-app notification.
   *
   * Stores a delivery record and refreshes the Redis unread-count cache for
   * the target user.
   */
  static async send(
    userId: string,
    notification: InAppNotificationPayload,
    notificationId: string,
  ): Promise<string> {
    const deliveryId = generateId();

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'in_app', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({
          userId,
          title: notification.title,
          category: notification.category,
        }),
      ],
    );

    // Refresh unread count cache
    await InAppChannel.refreshUnreadCount(userId);

    logger.info('InAppChannel.send: in-app notification delivered', {
      deliveryId,
      notificationId,
      userId,
      title: notification.title,
    });

    return deliveryId;
  }

  /**
   * Recalculate and cache the unread notification count for a user.
   */
  static async refreshUnreadCount(userId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false AND is_deleted = false`,
      [userId],
    );

    const count: number = result.rows[0]?.count ?? 0;

    await cacheSet(`${UNREAD_COUNT_KEY_PREFIX}${userId}`, count, UNREAD_COUNT_TTL);

    return count;
  }

  /**
   * Invalidate the cached unread count so it is recalculated on next access.
   */
  static async invalidateUnreadCount(userId: string): Promise<void> {
    await cacheDel(`${UNREAD_COUNT_KEY_PREFIX}${userId}`);
  }
}

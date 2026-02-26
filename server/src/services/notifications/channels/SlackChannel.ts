/**
 * Slack Channel – Stub implementation for Slack notification delivery.
 *
 * In production this class would call the Slack Web API (chat.postMessage)
 * using an OAuth token. For now every send operation is logged and a
 * delivery record is persisted in the `notification_deliveries` table with
 * a status of `sent`.
 */

import { pool } from '../../../config/database';
import { generateId } from '../../../utils/helpers';
import { logger } from '../../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackOptions {
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export class SlackChannel {
  /**
   * Send a plain-text Slack message to a channel or user.
   *
   * Stub: logs the operation and stores a delivery record. Replace the body
   * of this method with a real Slack API call when ready for production.
   */
  static async send(
    channelOrUser: string,
    message: string,
    notificationId: string,
    options?: SlackOptions,
  ): Promise<string> {
    const deliveryId = generateId();

    logger.info('SlackChannel.send (stub): Slack message dispatched', {
      deliveryId,
      notificationId,
      channelOrUser,
      messageLength: message.length,
      options: options ?? {},
    });

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'slack', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({ channelOrUser, options: options ?? {} }),
      ],
    );

    return deliveryId;
  }

  /**
   * Send a rich Slack Block Kit message.
   *
   * Stub: logs the operation and stores a delivery record. In production this
   * would use the Slack `chat.postMessage` endpoint with a `blocks` payload.
   */
  static async sendBlock(
    channelOrUser: string,
    blocks: SlackBlock[],
    notificationId: string,
  ): Promise<string> {
    const deliveryId = generateId();

    logger.info('SlackChannel.sendBlock (stub): Slack block message dispatched', {
      deliveryId,
      notificationId,
      channelOrUser,
      blockCount: blocks.length,
    });

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'slack', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({ channelOrUser, blocks }),
      ],
    );

    return deliveryId;
  }
}

/**
 * SMS Channel – Stub implementation for SMS notification delivery.
 *
 * In production this class would integrate with an SMS provider such as
 * Twilio or Amazon SNS. For now every send operation is logged and a
 * delivery record is persisted in the `notification_deliveries` table with
 * a status of `sent`.
 */

import { pool } from '../../../config/database';
import { generateId } from '../../../utils/helpers';
import { logger } from '../../../utils/logger';

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export class SmsChannel {
  /**
   * Send an SMS message to a phone number.
   *
   * Stub: logs the operation and stores a delivery record. Replace the body
   * of this method with a real Twilio / SNS call when ready for production.
   */
  static async send(
    phoneNumber: string,
    message: string,
    notificationId: string,
  ): Promise<string> {
    const deliveryId = generateId();

    logger.info('SmsChannel.send (stub): SMS dispatched', {
      deliveryId,
      notificationId,
      phoneNumber,
      messageLength: message.length,
    });

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'sms', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({ phoneNumber }),
      ],
    );

    return deliveryId;
  }
}

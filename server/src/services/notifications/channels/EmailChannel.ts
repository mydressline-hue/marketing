/**
 * Email Channel – Stub implementation for email notification delivery.
 *
 * In production this class would integrate with an email provider such as
 * SendGrid or Amazon SES. For now every send operation is logged and a
 * delivery record is persisted in the `notification_deliveries` table with
 * a status of `sent`.
 */

import { pool } from '../../../config/database';
import { generateId } from '../../../utils/helpers';
import { logger } from '../../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailOptions {
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export class EmailChannel {
  /**
   * Send a plain-text or HTML email.
   *
   * Stub: logs the operation and stores a delivery record. Replace the body
   * of this method with a real provider SDK call (e.g. SendGrid, SES) when
   * ready for production.
   */
  static async send(
    to: string,
    subject: string,
    body: string,
    notificationId: string,
    options?: EmailOptions,
  ): Promise<string> {
    const deliveryId = generateId();

    logger.info('EmailChannel.send (stub): email dispatched', {
      deliveryId,
      notificationId,
      to,
      subject,
      bodyLength: body.length,
      options: options ?? {},
    });

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'email', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({ to, subject, options: options ?? {} }),
      ],
    );

    return deliveryId;
  }

  /**
   * Send a templated email.
   *
   * Stub: logs the operation and stores a delivery record. In production this
   * would resolve the template on the provider side (e.g. SendGrid dynamic
   * templates).
   */
  static async sendTemplate(
    to: string,
    templateId: string,
    variables: Record<string, unknown>,
    notificationId: string,
  ): Promise<string> {
    const deliveryId = generateId();

    logger.info('EmailChannel.sendTemplate (stub): templated email dispatched', {
      deliveryId,
      notificationId,
      to,
      templateId,
      variables,
    });

    // Persist delivery record
    await pool.query(
      `INSERT INTO notification_deliveries
         (id, notification_id, channel, status, delivered_at, metadata, created_at)
       VALUES ($1, $2, 'email', 'sent', NOW(), $3, NOW())`,
      [
        deliveryId,
        notificationId,
        JSON.stringify({ to, templateId, variables }),
      ],
    );

    return deliveryId;
  }
}

/**
 * Webhooks Controller -- Express request handlers.
 *
 * Handlers delegate to WebhookService, returning structured JSON
 * envelopes: `{ success, data }` or `{ success, data, meta }` for
 * paginated responses.
 *
 * The `receiveWebhook` handler is public (no JWT auth) -- it relies on
 * HMAC signature verification instead. All other handlers require
 * authentication.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { WebhookService } from '../services/webhooks/WebhookService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Signature header mapping per platform
// ---------------------------------------------------------------------------

const SIGNATURE_HEADERS: Record<string, string> = {
  shopify: 'x-shopify-hmac-sha256',
  meta_ads: 'x-hub-signature-256',
  google_ads: 'x-goog-signature',
  salesforce: 'x-salesforce-signature',
  hubspot: 'x-hubspot-signature',
  tiktok_ads: 'x-tiktok-signature',
  bing_ads: 'x-bing-signature',
  snapchat_ads: 'x-snapchat-signature',
  klaviyo: 'x-klaviyo-signature',
  mailchimp: 'x-mailchimp-signature',
  iterable: 'x-iterable-signature',
};

// ===========================================================================
// Public Inbound Webhook Receiver
// ===========================================================================

/**
 * POST /webhooks/:platform/inbound
 *
 * Public endpoint -- no JWT authentication required. The request is
 * validated via HMAC signature verification using the secret stored in
 * the webhook registration for the given platform.
 */
export const receiveWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { platform } = req.params;

  // Look up the registration for this platform
  const registration = await WebhookService.findRegistrationByPlatform(platform);

  if (!registration) {
    throw new ValidationError(`No active webhook registration found for platform: ${platform}`, [
      { field: 'platform', message: `No active registration for platform '${platform}'` },
    ]);
  }

  // Determine the correct signature header for this platform
  const headerKey = SIGNATURE_HEADERS[platform] ?? 'x-webhook-signature';
  const signature = req.headers[headerKey] as string | undefined;

  if (!signature) {
    logger.warn('Webhook received without signature', { platform });
    throw new ValidationError('Missing webhook signature', [
      { field: 'signature', message: `Expected header '${headerKey}'` },
    ]);
  }

  // Verify the HMAC signature
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const isValid = WebhookService.verifySignature(platform, rawBody, signature, registration.secret);

  if (!isValid) {
    logger.warn('Webhook signature verification failed', { platform });
    throw new ValidationError('Invalid webhook signature', [
      { field: 'signature', message: 'HMAC signature verification failed' },
    ]);
  }

  // Extract the event type from the payload or headers
  const eventType =
    (req.headers['x-webhook-event'] as string) ??
    (req.body as Record<string, unknown>).event_type ??
    (req.body as Record<string, unknown>).topic ??
    'unknown';

  // Store the event
  const eventId = await WebhookService.processWebhookEvent(
    platform,
    String(eventType),
    req.body as object,
    registration.userId,
    registration.id,
  );

  logger.info('Webhook event received and stored', {
    eventId,
    platform,
    eventType,
  });

  res.status(200).json({
    success: true,
    data: { eventId },
  });
});

// ===========================================================================
// Authenticated Handlers
// ===========================================================================

/**
 * POST /webhooks/register
 *
 * Register a new webhook endpoint for a platform. Requires admin role.
 */
export const registerWebhook = asyncHandler(async (req: Request, res: Response) => {
  const { platform_type, webhook_url, secret, events } = req.body;
  const userId = req.user!.id;

  if (!platform_type) {
    throw new ValidationError('platform_type is required', [
      { field: 'platform_type', message: 'platform_type is required' },
    ]);
  }

  const registration = await WebhookService.registerWebhook(platform_type, userId, {
    webhookUrl: webhook_url,
    secret,
    events,
  });

  res.status(201).json({
    success: true,
    data: registration,
  });
});

/**
 * GET /webhooks/registrations
 *
 * List all active webhook registrations for the authenticated user.
 */
export const listRegistrations = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const registrations = await WebhookService.getWebhookRegistrations(userId);

  res.json({
    success: true,
    data: registrations,
  });
});

/**
 * GET /webhooks/events
 *
 * List webhook events with optional filtering and pagination.
 *
 * Query parameters:
 *   - platform_type  (optional) filter by platform
 *   - event_type     (optional) filter by event type
 *   - status         (optional) filter by status
 *   - start_date     (optional) ISO date lower bound
 *   - end_date       (optional) ISO date upper bound
 *   - page           (optional, default 1)
 *   - limit          (optional, default 20, max 100)
 */
export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { platform_type, event_type, status, start_date, end_date, page, limit } = req.query;

  const result = await WebhookService.getWebhookEvents(
    platform_type as string | undefined,
    userId,
    {
      eventType: event_type as string | undefined,
      status: status as string | undefined,
      startDate: start_date as string | undefined,
      endDate: end_date as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    },
  );

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

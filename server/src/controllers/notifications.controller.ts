/**
 * Notifications Controller – Express request handlers.
 *
 * Each handler delegates to `NotificationService` and returns a structured
 * JSON envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { NotificationService } from '../services/notifications/NotificationService';
import { ValidationError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /notifications/send
 * Send a notification across one or more channels.
 * Requires write:infrastructure permission (admin).
 */
export const sendNotification = asyncHandler(async (req: Request, res: Response) => {
  const { userId, title, message, channels, priority, category, metadata } = req.body;

  if (!userId || !title || !message) {
    throw new ValidationError('userId, title, and message are required');
  }

  const notificationId = await NotificationService.send({
    userId,
    title,
    message,
    channels: channels ?? ['in_app'],
    priority: priority ?? 'medium',
    category: category ?? 'system',
    metadata,
  });

  res.status(201).json({
    success: true,
    data: { notificationId },
  });
});

/**
 * GET /notifications
 * Get the authenticated user's notifications with optional filters and pagination.
 */
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { channel, category, is_read, priority, page, limit } = req.query;

  const filters = {
    channel: channel as string | undefined,
    category: category as string | undefined,
    isRead: is_read !== undefined ? is_read === 'true' : undefined,
    priority: priority as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  };

  const result = await NotificationService.getNotifications(req.user!.id, filters, pagination);

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

/**
 * GET /notifications/unread-count
 * Get the unread notification count for the authenticated user.
 */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await NotificationService.getUnreadCount(req.user!.id);

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * POST /notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await NotificationService.markAsRead(req.params.id, req.user!.id);

  res.json({
    success: true,
    data: notification,
  });
});

/**
 * POST /notifications/read-all
 * Mark all of the authenticated user's notifications as read.
 */
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const count = await NotificationService.markAllAsRead(req.user!.id);

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * DELETE /notifications/:id
 * Soft-delete a notification.
 */
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  await NotificationService.deleteNotification(req.params.id, req.user!.id);

  res.json({
    success: true,
    data: { deleted: true },
  });
});

/**
 * GET /notifications/preferences
 * Get the authenticated user's notification preferences.
 */
export const getPreferences = asyncHandler(async (req: Request, res: Response) => {
  const preferences = await NotificationService.getPreferences(req.user!.id);

  res.json({
    success: true,
    data: preferences,
  });
});

/**
 * PUT /notifications/preferences
 * Update the authenticated user's notification preferences.
 */
export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  const {
    emailEnabled,
    slackEnabled,
    inAppEnabled,
    smsEnabled,
    alertChannels,
    systemChannels,
    campaignChannels,
    integrationChannels,
    securityChannels,
    quietHoursStart,
    quietHoursEnd,
  } = req.body;

  const preferences = await NotificationService.updatePreferences(req.user!.id, {
    emailEnabled,
    slackEnabled,
    inAppEnabled,
    smsEnabled,
    alertChannels,
    systemChannels,
    campaignChannels,
    integrationChannels,
    securityChannels,
    quietHoursStart,
    quietHoursEnd,
  });

  res.json({
    success: true,
    data: preferences,
  });
});

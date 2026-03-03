/**
 * Notifications Routes – Express router for notification endpoints.
 *
 * All routes require authentication. The send endpoint additionally requires
 * the `write:infrastructure` permission (admin only). All other endpoints
 * require `read:campaigns` which is available to any authenticated user.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  sendNotificationSchema,
  updateNotificationPreferencesSchema,
  listNotificationsQuerySchema,
  idParamSchema,
} from '../validators/schemas';
import {
  sendNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
} from '../controllers/notifications.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /notifications/send – send a notification (requires write:infrastructure)
router.post('/send', authenticate, requirePermission('write:infrastructure'), validateBody(sendNotificationSchema), sendNotification);

// GET /notifications – get user's notifications (paginated, filterable)
router.get('/', authenticate, requirePermission('read:campaigns'), validateQuery(listNotificationsQuerySchema), getNotifications);

// GET /notifications/unread-count – get unread notification count
router.get('/unread-count', authenticate, requirePermission('read:campaigns'), getUnreadCount);

// GET /notifications/preferences – get notification preferences
router.get('/preferences', authenticate, requirePermission('read:campaigns'), getPreferences);

// PUT /notifications/preferences – update notification preferences (write operation)
router.put('/preferences', authenticate, requirePermission('write:campaigns'), validateBody(updateNotificationPreferencesSchema), updatePreferences);

// POST /notifications/read-all – mark all notifications as read (write operation)
router.post('/read-all', authenticate, requirePermission('write:campaigns'), markAllAsRead);

// POST /notifications/:id/read – mark a single notification as read (write operation)
router.post('/:id/read', authenticate, requirePermission('write:campaigns'), validateParams(idParamSchema), markAsRead);

// DELETE /notifications/:id – soft-delete a notification (write operation)
router.delete('/:id', authenticate, requirePermission('write:campaigns'), validateParams(idParamSchema), deleteNotification);

export default router;

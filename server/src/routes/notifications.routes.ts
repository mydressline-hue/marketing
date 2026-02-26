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
import { validateBody } from '../middleware/validation';
import {
  sendNotificationSchema,
  updateNotificationPreferencesSchema,
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
router.get('/', authenticate, requirePermission('read:campaigns'), getNotifications);

// GET /notifications/unread-count – get unread notification count
router.get('/unread-count', authenticate, requirePermission('read:campaigns'), getUnreadCount);

// GET /notifications/preferences – get notification preferences
router.get('/preferences', authenticate, requirePermission('read:campaigns'), getPreferences);

// PUT /notifications/preferences – update notification preferences
router.put('/preferences', authenticate, requirePermission('read:campaigns'), validateBody(updateNotificationPreferencesSchema), updatePreferences);

// POST /notifications/read-all – mark all notifications as read
router.post('/read-all', authenticate, requirePermission('read:campaigns'), markAllAsRead);

// POST /notifications/:id/read – mark a single notification as read
router.post('/:id/read', authenticate, requirePermission('read:campaigns'), markAsRead);

// DELETE /notifications/:id – soft-delete a notification
router.delete('/:id', authenticate, requirePermission('read:campaigns'), deleteNotification);

export default router;

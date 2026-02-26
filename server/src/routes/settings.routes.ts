/**
 * Settings Routes – Express router for system settings endpoints.
 *
 * Admin-only routes for managing system settings and API key configuration.
 * Notification and appearance updates are available to any authenticated user.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateBody } from '../middleware/validation';
import { updateSettingsSchema } from '../validators/schemas';
import {
  getAllSettings,
  getApiKeyConfig,
  setSetting,
  updateNotifications,
  updateAppearance,
} from '../controllers/settings.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// PUT /settings/notifications – update notification preferences (any authenticated user)
router.put('/notifications', authenticate, updateNotifications);

// PUT /settings/appearance – update appearance preferences (any authenticated user)
router.put('/appearance', authenticate, updateAppearance);

// GET /settings – retrieve all settings (admin only)
router.get('/', authenticate, requireRole('admin'), getAllSettings);

// GET /settings/api-keys – check API key configuration (admin only)
router.get('/api-keys', authenticate, requireRole('admin'), getApiKeyConfig);

// PUT /settings/:key – set a single setting (admin only)
router.put('/:key', authenticate, requireRole('admin'), validateBody(updateSettingsSchema), setSetting);

export default router;

/**
 * Settings Controller – Express request handlers.
 *
 * Each handler delegates to `SettingsService` and returns a structured JSON
 * envelope: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { SettingsService } from '../services/settings.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /settings
 * Retrieve all system settings.
 */
export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await SettingsService.getAll();

  res.json({
    success: true,
    data: settings,
  });
});

/**
 * GET /settings/api-keys
 * Check which API keys and platform integrations are configured.
 */
export const getApiKeyConfig = asyncHandler(async (_req: Request, res: Response) => {
  const config = await SettingsService.getApiKeyConfig();

  res.json({
    success: true,
    data: config,
  });
});

/**
 * PUT /settings/:key
 * Set a single system setting by key.
 */
export const setSetting = asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;

  await SettingsService.set(key, value, req.user!.id);

  res.json({
    success: true,
    data: { key, value },
  });
});

/**
 * PUT /settings/notifications
 * Update notification preferences.
 */
export const updateNotifications = asyncHandler(async (req: Request, res: Response) => {
  await SettingsService.updateNotifications(req.body, req.user!.id);

  res.json({
    success: true,
    data: { message: 'Notification settings updated successfully' },
  });
});

/**
 * PUT /settings/appearance
 * Update appearance / theme preferences.
 */
export const updateAppearance = asyncHandler(async (req: Request, res: Response) => {
  await SettingsService.updateAppearance(req.body, req.user!.id);

  res.json({
    success: true,
    data: { message: 'Appearance settings updated successfully' },
  });
});

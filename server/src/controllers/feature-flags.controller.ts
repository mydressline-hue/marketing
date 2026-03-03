/**
 * Feature Flags Controller -- Express request handlers.
 *
 * Each handler delegates to `FeatureFlagsService` and returns a structured
 * JSON envelope: `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { ValidationError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /feature-flags
 * Retrieve all feature flags.
 */
export const getAllFlags = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await FeatureFlagsService.getAll();

  res.json({
    success: true,
    data: flags,
  });
});

/**
 * GET /feature-flags/:name
 * Retrieve a single feature flag by name.
 */
export const getFlag = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.params;
  const flag = await FeatureFlagsService.get(name);

  res.json({
    success: true,
    data: flag,
  });
});

/**
 * POST /feature-flags
 * Create a new feature flag.
 */
export const createFlag = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, is_enabled, rollout_percentage } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Flag name is required', [
      { field: 'name', message: 'name is required and must be a non-empty string' },
    ]);
  }

  if (rollout_percentage !== undefined) {
    const pct = Number(rollout_percentage);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new ValidationError('Invalid rollout_percentage', [
        { field: 'rollout_percentage', message: 'must be an integer between 0 and 100' },
      ]);
    }
  }

  const flag = await FeatureFlagsService.create(name.trim(), description, {
    is_enabled,
    rollout_percentage,
    created_by: req.user?.id,
  });

  res.status(201).json({
    success: true,
    data: flag,
  });
});

/**
 * PUT /feature-flags/:name
 * Update an existing feature flag.
 */
export const updateFlag = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.params;
  const { description, is_enabled, rollout_percentage } = req.body;

  if (rollout_percentage !== undefined) {
    const pct = Number(rollout_percentage);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new ValidationError('Invalid rollout_percentage', [
        { field: 'rollout_percentage', message: 'must be an integer between 0 and 100' },
      ]);
    }
  }

  const flag = await FeatureFlagsService.update(name, {
    description,
    is_enabled,
    rollout_percentage,
  });

  res.json({
    success: true,
    data: flag,
  });
});

/**
 * DELETE /feature-flags/:name
 * Delete a feature flag.
 */
export const deleteFlag = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.params;

  await FeatureFlagsService.delete(name);

  res.json({
    success: true,
    data: { message: `Feature flag '${name}' deleted` },
  });
});

/**
 * GET /feature-flags/:name/check
 * Check whether a feature flag is enabled for the current user.
 */
export const checkFlag = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.params;
  const userId = req.user?.id;

  const enabled = await FeatureFlagsService.isEnabled(name, userId);

  res.json({
    success: true,
    data: {
      name,
      enabled,
    },
  });
});

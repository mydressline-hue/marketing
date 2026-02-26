/**
 * API Key Management Controllers.
 *
 * Express request handlers for creating, listing, updating, revoking,
 * and rotating scoped API keys. All handlers delegate to
 * {@link ApiKeyScopingService} and return structured JSON envelopes:
 * `{ success, data }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ApiKeyScopingService } from '../services/apikey-scoping/ApiKeyScopingService';
import { ApiKeyService } from '../services/apikey.service';
import { ValidationError, NotFoundError } from '../utils/errors';

// ===========================================================================
// Create
// ===========================================================================

/**
 * POST /apikeys
 * Create a scoped API key.
 *
 * Body: { name, scopes, platforms?, ip_whitelist?, expires_at?, rate_limit?, description? }
 */
export const createKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { name, scopes, platforms, ip_whitelist, expires_at, rate_limit, description } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Key name is required', [
      { field: 'name', message: 'Must be a non-empty string' },
    ]);
  }

  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    throw new ValidationError('At least one scope is required', [
      { field: 'scopes', message: 'Must be a non-empty array of scope strings' },
    ]);
  }

  const result = await ApiKeyScopingService.createScopedKey(userId, name.trim(), {
    scopes,
    platforms,
    ip_whitelist,
    expires_at,
    rate_limit,
    description,
  });

  res.status(201).json({
    success: true,
    data: {
      id: result.id,
      key: result.key,
      message: 'Store this key securely. It will not be shown again.',
    },
  });
});

// ===========================================================================
// List
// ===========================================================================

/**
 * GET /apikeys
 * List all API keys for the authenticated user with scoping details.
 */
export const listKeys = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const keys = await ApiKeyScopingService.listScopedKeys(userId);

  res.json({
    success: true,
    data: keys,
  });
});

// ===========================================================================
// Get by ID
// ===========================================================================

/**
 * GET /apikeys/:keyId
 * Get details for a specific API key.
 */
export const getKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { keyId } = req.params;

  const key = await ApiKeyScopingService.getKeyById(keyId, userId);

  if (!key) {
    throw new NotFoundError('API key not found');
  }

  res.json({
    success: true,
    data: key,
  });
});

// ===========================================================================
// Update
// ===========================================================================

/**
 * PUT /apikeys/:keyId
 * Update a key's scopes, platforms, IP whitelist, rate limit, or expiration.
 *
 * Body: { scopes?, platforms?, ip_whitelist?, expires_at?, rate_limit?, description? }
 */
export const updateKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { keyId } = req.params;
  const { scopes, platforms, ip_whitelist, expires_at, rate_limit, description } = req.body;

  // Ensure at least one field is being updated
  if (
    scopes === undefined &&
    platforms === undefined &&
    ip_whitelist === undefined &&
    expires_at === undefined &&
    rate_limit === undefined &&
    description === undefined
  ) {
    throw new ValidationError('At least one field must be provided for update', [
      { field: 'body', message: 'Provide at least one of: scopes, platforms, ip_whitelist, expires_at, rate_limit, description' },
    ]);
  }

  const updatedKey = await ApiKeyScopingService.updateKeyScopes(keyId, userId, {
    scopes,
    platforms,
    ip_whitelist,
    expires_at,
    rate_limit,
    description,
  });

  res.json({
    success: true,
    data: updatedKey,
  });
});

// ===========================================================================
// Revoke
// ===========================================================================

/**
 * DELETE /apikeys/:keyId
 * Revoke (deactivate) an API key.
 */
export const revokeKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { keyId } = req.params;

  await ApiKeyService.revoke(keyId, userId);

  res.json({
    success: true,
    data: { message: 'API key revoked successfully' },
  });
});

// ===========================================================================
// Rotate
// ===========================================================================

/**
 * POST /apikeys/:keyId/rotate
 * Rotate an API key. Revokes the old key and creates a new one with
 * the same name and scopes. Extended scoping is preserved.
 */
export const rotateKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { keyId } = req.params;

  // Fetch current scoping data before rotation
  const currentKey = await ApiKeyScopingService.getKeyById(keyId, userId);
  if (!currentKey) {
    throw new NotFoundError('API key not found');
  }

  // Rotate the base key (revokes old, creates new with same name/scopes)
  const newKey = await ApiKeyService.rotate(keyId, userId);

  // Migrate scoping data to the new key
  const scopeId = (await import('../utils/helpers')).generateId();
  const { pool: dbPool } = await import('../config/database');

  await dbPool.query(
    `INSERT INTO api_key_scopes (
      id, api_key_id, platforms, ip_whitelist, rate_limit_per_hour,
      expires_at, description, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    [
      scopeId,
      newKey.id,
      currentKey.platforms,
      currentKey.ipWhitelist,
      currentKey.rateLimitPerHour,
      currentKey.expiresAt,
      currentKey.description,
    ],
  );

  // Invalidate caches
  const { cacheDel: cacheDelFn } = await import('../config/redis');
  await cacheDelFn(`apikeys:user:${userId}`);
  await cacheDelFn(`apikey:scope:${keyId}`);

  res.json({
    success: true,
    data: {
      id: newKey.id,
      key: newKey.key,
      message: 'Key rotated successfully. Store the new key securely. It will not be shown again.',
    },
  });
});

// ===========================================================================
// Usage Stats
// ===========================================================================

/**
 * GET /apikeys/:keyId/usage
 * Get usage statistics for a specific API key.
 */
export const getKeyUsage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { keyId } = req.params;

  // Verify ownership
  const key = await ApiKeyScopingService.getKeyById(keyId, userId);
  if (!key) {
    throw new NotFoundError('API key not found');
  }

  const stats = await ApiKeyScopingService.getKeyUsageStats(keyId);

  res.json({
    success: true,
    data: stats,
  });
});

// ===========================================================================
// Revoke by Platform
// ===========================================================================

/**
 * DELETE /apikeys/platform/:platformType
 * Revoke all API keys scoped to a specific platform.
 */
export const revokeByPlatform = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { platformType } = req.params;

  if (!platformType || typeof platformType !== 'string') {
    throw new ValidationError('Platform type is required', [
      { field: 'platformType', message: 'Must be a non-empty string' },
    ]);
  }

  const result = await ApiKeyScopingService.revokeByPlatform(userId, platformType);

  res.json({
    success: true,
    data: {
      revokedCount: result.revokedCount,
      message: `${result.revokedCount} API key(s) for platform '${platformType}' revoked successfully`,
    },
  });
});

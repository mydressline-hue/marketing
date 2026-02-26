/**
 * API Key Management routes.
 *
 * Mounts CRUD endpoints for scoped API key management. All routes
 * require JWT authentication. Read endpoints require `read:infrastructure`
 * permission; write/mutate endpoints require `write:infrastructure`.
 *
 * Note: The platform-revoke route is registered BEFORE the `:keyId`
 * parameter routes to prevent Express from treating "platform" as a keyId.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createKey,
  listKeys,
  getKey,
  updateKey,
  revokeKey,
  rotateKey,
  getKeyUsage,
  revokeByPlatform,
} from '../controllers/apikeys.controller';

const router = Router();

// All API key management routes require JWT authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Collection routes
// ---------------------------------------------------------------------------

// POST /apikeys -- create a scoped API key (write:infrastructure)
router.post(
  '/',
  requirePermission('write:infrastructure'),
  createKey,
);

// GET /apikeys -- list all keys for the user (read:infrastructure)
router.get(
  '/',
  requirePermission('read:infrastructure'),
  listKeys,
);

// ---------------------------------------------------------------------------
// Platform-scoped revocation (must be before :keyId routes)
// ---------------------------------------------------------------------------

// DELETE /apikeys/platform/:platformType -- revoke all keys for a platform (write:infrastructure)
router.delete(
  '/platform/:platformType',
  requirePermission('write:infrastructure'),
  revokeByPlatform,
);

// ---------------------------------------------------------------------------
// Single-key routes
// ---------------------------------------------------------------------------

// GET /apikeys/:keyId -- get key details (read:infrastructure)
router.get(
  '/:keyId',
  requirePermission('read:infrastructure'),
  getKey,
);

// PUT /apikeys/:keyId -- update key scopes (write:infrastructure)
router.put(
  '/:keyId',
  requirePermission('write:infrastructure'),
  updateKey,
);

// DELETE /apikeys/:keyId -- revoke key (write:infrastructure)
router.delete(
  '/:keyId',
  requirePermission('write:infrastructure'),
  revokeKey,
);

// POST /apikeys/:keyId/rotate -- rotate key (write:infrastructure)
router.post(
  '/:keyId/rotate',
  requirePermission('write:infrastructure'),
  rotateKey,
);

// GET /apikeys/:keyId/usage -- get usage stats (read:infrastructure)
router.get(
  '/:keyId/usage',
  requirePermission('read:infrastructure'),
  getKeyUsage,
);

export default router;

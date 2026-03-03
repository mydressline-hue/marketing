/**
 * Webhooks Routes -- Express router for webhook ingest layer endpoints.
 *
 * The inbound webhook receiver (`POST /:platform/inbound`) is public and
 * uses HMAC signature verification instead of JWT authentication.
 *
 * All other endpoints require authentication, and the registration
 * endpoint additionally requires admin role.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole, requirePermission } from '../middleware/rbac';
import { validateBody, validateQuery } from '../middleware/validation';
import {
  registerWebhookSchema,
  listWebhookRegistrationsQuerySchema,
  listWebhookEventsQuerySchema,
} from '../validators/schemas';
import {
  receiveWebhook,
  registerWebhook,
  listRegistrations,
  listEvents,
} from '../controllers/webhooks.controller';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes (HMAC-verified, no JWT)
// ---------------------------------------------------------------------------

// POST /webhooks/:platform/inbound -- receive inbound webhook from platform
router.post('/:platform/inbound', receiveWebhook);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

// POST /webhooks/register -- register a new webhook endpoint (admin only)
router.post('/register', authenticate, requireRole('admin'), validateBody(registerWebhookSchema), registerWebhook);

// GET /webhooks/registrations -- list active webhook registrations (requires read:infrastructure)
router.get('/registrations', authenticate, requirePermission('read:infrastructure'), validateQuery(listWebhookRegistrationsQuerySchema), listRegistrations);

// GET /webhooks/events -- list webhook events with pagination and filtering (requires read:infrastructure)
router.get('/events', authenticate, requirePermission('read:infrastructure'), validateQuery(listWebhookEventsQuerySchema), listEvents);

export default router;

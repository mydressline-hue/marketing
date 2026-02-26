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
import { requireRole } from '../middleware/rbac';
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
router.post('/register', authenticate, requireRole('admin'), registerWebhook);

// GET /webhooks/registrations -- list active webhook registrations
router.get('/registrations', authenticate, listRegistrations);

// GET /webhooks/events -- list webhook events with pagination and filtering
router.get('/events', authenticate, listEvents);

export default router;

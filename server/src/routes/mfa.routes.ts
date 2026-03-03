/**
 * MFA Routes.
 *
 * Defines the Express router for multi-factor authentication endpoints
 * including setup, verification, validation, and disabling MFA.
 * All routes require authentication.
 */

import { Router } from 'express';
import {
  setupMfa,
  verifyMfa,
  validateMfa,
  disableMfa,
} from '../controllers/mfa.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ── Authenticated routes ───────────────────────────────────────────────────
router.post('/setup', authenticate, setupMfa);
router.post('/verify', authenticate, verifyMfa);
router.post('/validate', authenticate, validateMfa);
router.delete('/', authenticate, disableMfa);

export default router;

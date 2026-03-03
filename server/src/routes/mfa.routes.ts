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
import { validateBody } from '../middleware/validation';
import { verifyMfaSchema, validateMfaSchema } from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ── Authenticated routes ───────────────────────────────────────────────────
router.post('/setup', authenticate, setupMfa);
router.post('/verify', authenticate, validateBody(verifyMfaSchema), verifyMfa);
router.post('/validate', authenticate, validateBody(validateMfaSchema), validateMfa);
router.delete('/', authenticate, disableMfa);

export default router;

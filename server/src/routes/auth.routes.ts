/**
 * Authentication Routes.
 *
 * Defines the Express router for all authentication-related endpoints
 * including registration, login, logout, token refresh, and profile
 * management. Applies validation middleware and authentication guards
 * where appropriate.
 */

import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { createUserSchema, loginSchema } from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ── Public routes ──────────────────────────────────────────────────────────
router.post('/register', validateBody(createUserSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh-token', refreshToken);

// ── Authenticated routes ───────────────────────────────────────────────────
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

export default router;

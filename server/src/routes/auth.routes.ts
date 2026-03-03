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
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createUserSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/schemas';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ── Public routes ──────────────────────────────────────────────────────────
router.post('/register', validateBody(createUserSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), resetPassword);

// ── Google OAuth routes (no authentication required) ──────────────────────
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// ── Authenticated routes ───────────────────────────────────────────────────
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, validateBody(updateProfileSchema), updateProfile);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

export default router;

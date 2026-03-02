/**
 * Authentication Controller.
 *
 * Express request handlers for user authentication and profile management.
 * Each handler delegates to the AuthService and returns structured JSON
 * responses following the project's `{ success, data }` envelope convention.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthService } from '../services/auth.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /auth/register
 * Create a new user account and return tokens.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  // Force 'user' role on self-registration to prevent privilege escalation.
  // Admin role assignment must be done by an existing admin via user management.
  const result = await AuthService.register(email, password, name, 'user');

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    },
  });
});

/**
 * POST /auth/login
 * Authenticate a user and return tokens.
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const result = await AuthService.login(email, password);

  res.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    },
  });
});

/**
 * POST /auth/logout
 * Invalidate the current session.
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const token = req.headers.authorization!.split(' ')[1];

  await AuthService.logout(userId, token);

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

/**
 * POST /auth/refresh-token
 * Exchange a refresh token for a new access / refresh token pair.
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: refreshTkn } = req.body;

  const result = await AuthService.refreshToken(refreshTkn);

  res.json({
    success: true,
    data: {
      token: result.token,
      refreshToken: result.refreshToken,
    },
  });
});

/**
 * GET /auth/profile
 * Retrieve the authenticated user's profile.
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await AuthService.getProfile(req.user!.id);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * PATCH /auth/profile
 * Update the authenticated user's profile fields (name, email).
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email } = req.body;

  const user = await AuthService.updateProfile(req.user!.id, { name, email });

  res.json({
    success: true,
    data: user,
  });
});

/**
 * POST /auth/change-password
 * Change the authenticated user's password.
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  await AuthService.changePassword(req.user!.id, currentPassword, newPassword);

  res.json({
    success: true,
    data: { message: 'Password changed successfully' },
  });
});

/**
 * Authentication Controller.
 *
 * Express request handlers for user authentication and profile management.
 * Each handler delegates to the AuthService and returns structured JSON
 * responses following the project's `{ success, data }` envelope convention.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { env } from '../config/env';
import { AuthService } from '../services/auth.service';
import { PasswordResetService } from '../services/password-reset.service';
import { GoogleOAuthService } from '../services/google-oauth.service';
import { ValidationError } from '../utils/errors';

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
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

  const result = await AuthService.login(email, password, ipAddress);

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

/**
 * POST /auth/forgot-password
 * Request a password reset token for the given email.
 *
 * Always returns 200 regardless of whether the email exists to prevent
 * email enumeration attacks.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  // Fire-and-forget: we intentionally discard the token here.
  // In a real deployment the token would be sent via email.
  await PasswordResetService.requestReset(email);

  res.json({
    success: true,
    data: {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    },
  });
});

/**
 * POST /auth/reset-password
 * Reset a user's password using a valid reset token.
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  await PasswordResetService.resetPassword(token, newPassword);

  res.json({
    success: true,
    data: { message: 'Password has been reset successfully' },
  });
});

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

/**
 * GET /auth/google
 * Redirect the user to the Google OAuth consent screen.
 *
 * The generated CSRF `state` token is set as a secure, HTTP-only cookie
 * so it can be verified when the callback is received.
 */
export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const { url, state } = GoogleOAuthService.getAuthorizationUrl();

  // Store the state in a short-lived cookie for CSRF verification
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Handle the Google OAuth callback.
 *
 * Verifies the CSRF state, exchanges the authorization code for tokens,
 * fetches the user profile, finds or creates the local user, creates a
 * session, and returns the JWT tokens.
 */
export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // Google may redirect with an error param (e.g. user denied consent)
  if (error) {
    throw new ValidationError(`Google OAuth error: ${error}`);
  }

  if (!code || typeof code !== 'string') {
    throw new ValidationError('Missing authorization code from Google', [
      { field: 'code', message: 'Authorization code is required' },
    ]);
  }

  // Verify CSRF state
  const storedState = req.cookies?.oauth_state;
  if (!state || !storedState || state !== storedState) {
    throw new ValidationError('Invalid OAuth state parameter (possible CSRF attack)', [
      { field: 'state', message: 'OAuth state mismatch' },
    ]);
  }

  // Clear the state cookie
  res.clearCookie('oauth_state');

  // Exchange code for tokens
  const tokens = await GoogleOAuthService.exchangeCode(code);

  // Fetch user profile from Google
  const googleProfile = await GoogleOAuthService.getUserInfo(tokens.access_token);

  // Find or create local user and create session
  const result = await GoogleOAuthService.findOrCreateUser(googleProfile);

  res.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    },
  });
});

/**
 * MFA Controller.
 *
 * Express request handlers for multi-factor authentication management.
 * Each handler delegates to the MfaService and returns structured JSON
 * responses following the project's `{ success, data }` envelope convention.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { MfaService } from '../services/mfa.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /mfa/setup
 * Initiate MFA setup for the authenticated user. Returns the otpauth URI
 * (for QR code rendering) and a set of single-use recovery codes.
 */
export const setupMfa = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const result = await MfaService.setup(userId);

  res.status(201).json({
    success: true,
    data: {
      otpauthUri: result.otpauthUri,
      recoveryCodes: result.recoveryCodes,
    },
  });
});

/**
 * POST /mfa/verify
 * Verify the initial TOTP token to confirm authenticator app configuration.
 * This enables MFA on the account.
 */
export const verifyMfa = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { token } = req.body;

  await MfaService.verify(userId, token);

  res.json({
    success: true,
    data: { message: 'MFA has been verified and enabled' },
  });
});

/**
 * POST /mfa/validate
 * Validate a TOTP token or recovery code during the login flow.
 * Accepts either { token } for TOTP or { recoveryCode } for backup codes.
 */
export const validateMfa = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { token, recoveryCode } = req.body;

  if (recoveryCode) {
    await MfaService.validateRecoveryCode(userId, recoveryCode);
  } else {
    await MfaService.validate(userId, token);
  }

  res.json({
    success: true,
    data: { message: 'MFA validation successful' },
  });
});

/**
 * DELETE /mfa
 * Disable MFA for the authenticated user.
 */
export const disableMfa = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  await MfaService.disable(userId);

  res.status(204).send();
});

/**
 * Multi-Factor Authentication Service.
 *
 * Provides static methods for setting up, verifying, validating, and
 * disabling TOTP-based multi-factor authentication. Secrets are encrypted
 * at rest using AES-256-GCM via the shared encrypt/decrypt helpers.
 * Recovery codes are generated with crypto.randomBytes and also stored
 * encrypted.
 */

import crypto from 'crypto';
import { authenticator } from 'otplib';
import { pool } from '../config/database';
import { env } from '../config/env';
import { generateId, encrypt, decrypt } from '../utils/helpers';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 4; // 8 hex characters per code

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates an array of cryptographically random recovery codes.
 * Each code is an 8-character uppercase hex string.
 */
function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    codes.push(crypto.randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase());
  }
  return codes;
}

/**
 * Returns the encryption key from the environment configuration.
 */
function getEncryptionKey(): string {
  return env.ENCRYPTION_KEY as string;
}

// ---------------------------------------------------------------------------
// MfaService
// ---------------------------------------------------------------------------

export class MfaService {
  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  /**
   * Initiates MFA setup for a user. Generates a TOTP secret and recovery
   * codes, encrypts them, and stores the record in the database.
   *
   * Returns the otpauth:// URI (for QR code generation) and the plaintext
   * recovery codes so the client can display them once.
   *
   * If MFA is already enabled for the user, throws a ConflictError.
   * If a previous un-verified setup exists, it is replaced.
   */
  static async setup(
    userId: string,
  ): Promise<{ otpauthUri: string; recoveryCodes: string[] }> {
    // Check if MFA is already enabled
    const existing = await pool.query(
      'SELECT id, is_enabled FROM mfa_credentials WHERE user_id = $1',
      [userId],
    );

    if (existing.rows.length > 0 && existing.rows[0].is_enabled) {
      throw new ConflictError('MFA is already enabled for this account');
    }

    // Fetch user email for the otpauth URI
    const userResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const email = userResult.rows[0].email as string;

    // Generate TOTP secret and recovery codes
    const secret = authenticator.generateSecret();
    const recoveryCodes = generateRecoveryCodes();

    // Encrypt before storage
    const encryptionKey = getEncryptionKey();
    const encryptedSecret = encrypt(secret, encryptionKey);
    const encryptedRecoveryCodes = encrypt(
      JSON.stringify(recoveryCodes),
      encryptionKey,
    );

    const id = generateId();

    if (existing.rows.length > 0) {
      // Replace previous un-verified setup
      await pool.query(
        `UPDATE mfa_credentials
         SET secret = $1, recovery_codes = $2, is_enabled = FALSE, verified_at = NULL, created_at = NOW()
         WHERE user_id = $3`,
        [encryptedSecret, encryptedRecoveryCodes, userId],
      );
    } else {
      await pool.query(
        `INSERT INTO mfa_credentials (id, user_id, secret, recovery_codes, is_enabled, created_at)
         VALUES ($1, $2, $3, $4, FALSE, NOW())`,
        [id, userId, encryptedSecret, encryptedRecoveryCodes],
      );
    }

    // Build the otpauth URI
    const issuer = env.MFA_ISSUER || 'AIGrowthEngine';
    const otpauthUri = authenticator.keyuri(email, issuer, secret);

    logger.info('MFA setup initiated', { userId });

    return { otpauthUri, recoveryCodes };
  }

  // -----------------------------------------------------------------------
  // Verify (first-time confirmation)
  // -----------------------------------------------------------------------

  /**
   * Verifies the initial TOTP token during setup to confirm that the user
   * has correctly configured their authenticator app. On success the MFA
   * record is marked as enabled and verified.
   */
  static async verify(userId: string, token: string): Promise<void> {
    const result = await pool.query(
      'SELECT id, secret, is_enabled FROM mfa_credentials WHERE user_id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('MFA has not been set up for this account');
    }

    const row = result.rows[0];

    if (row.is_enabled) {
      throw new ConflictError('MFA is already verified and enabled');
    }

    // Decrypt the secret and verify the token
    const encryptionKey = getEncryptionKey();
    const secret = decrypt(row.secret as string, encryptionKey);

    const isValid = authenticator.check(token, secret);

    if (!isValid) {
      throw new AuthenticationError('Invalid MFA token');
    }

    await pool.query(
      `UPDATE mfa_credentials
       SET is_enabled = TRUE, verified_at = NOW()
       WHERE id = $1`,
      [row.id],
    );

    logger.info('MFA verified and enabled', { userId });
  }

  // -----------------------------------------------------------------------
  // Validate (login flow)
  // -----------------------------------------------------------------------

  /**
   * Validates a TOTP token during the login flow. Returns true if the
   * token is valid, throws an AuthenticationError otherwise.
   */
  static async validate(userId: string, token: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT secret, is_enabled FROM mfa_credentials WHERE user_id = $1',
      [userId],
    );

    if (result.rows.length === 0 || !result.rows[0].is_enabled) {
      throw new NotFoundError('MFA is not enabled for this account');
    }

    const encryptionKey = getEncryptionKey();
    const secret = decrypt(result.rows[0].secret as string, encryptionKey);

    const isValid = authenticator.check(token, secret);

    if (!isValid) {
      throw new AuthenticationError('Invalid MFA token');
    }

    logger.info('MFA token validated', { userId });

    return true;
  }

  // -----------------------------------------------------------------------
  // Validate Recovery Code
  // -----------------------------------------------------------------------

  /**
   * Validates and consumes a single-use recovery code. The code is removed
   * from the stored list so it cannot be reused. Returns true on success,
   * throws AuthenticationError if the code is invalid.
   */
  static async validateRecoveryCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const result = await pool.query(
      'SELECT id, recovery_codes, is_enabled FROM mfa_credentials WHERE user_id = $1',
      [userId],
    );

    if (result.rows.length === 0 || !result.rows[0].is_enabled) {
      throw new NotFoundError('MFA is not enabled for this account');
    }

    const row = result.rows[0];
    const encryptionKey = getEncryptionKey();
    const recoveryCodes: string[] = JSON.parse(
      decrypt(row.recovery_codes as string, encryptionKey),
    );

    const normalizedCode = code.toUpperCase().trim();
    const codeIndex = recoveryCodes.indexOf(normalizedCode);

    if (codeIndex === -1) {
      throw new AuthenticationError('Invalid recovery code');
    }

    // Remove the used code
    recoveryCodes.splice(codeIndex, 1);

    // Re-encrypt and store the updated list
    const encryptedRecoveryCodes = encrypt(
      JSON.stringify(recoveryCodes),
      encryptionKey,
    );

    await pool.query(
      'UPDATE mfa_credentials SET recovery_codes = $1 WHERE id = $2',
      [encryptedRecoveryCodes, row.id],
    );

    logger.info('MFA recovery code consumed', {
      userId,
      remainingCodes: recoveryCodes.length,
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Disable
  // -----------------------------------------------------------------------

  /**
   * Disables MFA for a user by removing their MFA credentials entirely.
   */
  static async disable(userId: string): Promise<void> {
    const result = await pool.query(
      'DELETE FROM mfa_credentials WHERE user_id = $1 RETURNING id',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('MFA is not configured for this account');
    }

    logger.info('MFA disabled', { userId });
  }

  // -----------------------------------------------------------------------
  // Is Enabled
  // -----------------------------------------------------------------------

  /**
   * Checks whether MFA is enabled for the given user.
   */
  static async isEnabled(userId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT is_enabled FROM mfa_credentials WHERE user_id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].is_enabled as boolean;
  }
}

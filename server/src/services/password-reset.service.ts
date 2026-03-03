/**
 * Password Reset Service.
 *
 * Handles the full password-reset lifecycle: requesting a reset token,
 * validating a token, and resetting the password.  Tokens are stored as
 * SHA-256 hashes so that a database leak cannot be used to reset accounts.
 * On successful reset all existing sessions for the user are invalidated.
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { generateId, hashPassword } from '../utils/helpers';
import { AuthenticationError } from '../utils/errors';
import { withTransaction } from '../utils/transaction';
import { env } from '../config/env';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produces a hex-encoded SHA-256 hash of the given token.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// PasswordResetService
// ---------------------------------------------------------------------------

export class PasswordResetService {
  // -----------------------------------------------------------------------
  // Request Reset
  // -----------------------------------------------------------------------

  /**
   * Initiates a password-reset flow for the given email address.
   *
   * 1. Looks up the user by email.
   * 2. Invalidates any existing un-used tokens for the user.
   * 3. Generates a cryptographically random token.
   * 4. Stores the SHA-256 hash of the token with an expiry.
   * 5. Returns the raw token (caller is responsible for delivering it,
   *    e.g. via email).
   *
   * Returns `null` if no user with the given email exists so the controller
   * can still return 200 (to prevent email enumeration).
   */
  static async requestReset(email: string): Promise<string | null> {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()],
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const userId: string = userResult.rows[0].id;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiryMinutes = env.PASSWORD_RESET_EXPIRY_MINUTES;

    await withTransaction(async (client) => {
      // Invalidate any existing unused tokens for this user
      await client.query(
        `UPDATE password_reset_tokens
            SET used_at = NOW()
          WHERE user_id = $1
            AND used_at IS NULL`,
        [userId],
      );

      // Insert the new token
      await client.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL, NOW())`,
        [generateId(), userId, tokenHash, String(expiryMinutes)],
      );
    });

    logger.info('Password reset requested', { userId });

    return rawToken;
  }

  // -----------------------------------------------------------------------
  // Validate Token
  // -----------------------------------------------------------------------

  /**
   * Hashes the provided raw token and looks it up in the database.
   * Verifies the token has not expired and has not already been used.
   *
   * @returns The `user_id` associated with the token.
   * @throws  {AuthenticationError} if the token is invalid, expired, or used.
   */
  static async validateToken(token: string): Promise<string> {
    const tokenHash = hashToken(token);

    const result = await pool.query(
      `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
        WHERE token_hash = $1`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('Invalid or expired password reset token');
    }

    const row = result.rows[0];

    if (row.used_at !== null) {
      throw new AuthenticationError('Password reset token has already been used');
    }

    if (new Date(row.expires_at) < new Date()) {
      throw new AuthenticationError('Password reset token has expired');
    }

    return row.user_id as string;
  }

  // -----------------------------------------------------------------------
  // Reset Password
  // -----------------------------------------------------------------------

  /**
   * Validates the token, updates the user's password, marks the token as
   * used, updates `password_updated_at`, and invalidates all existing
   * sessions for the user.
   */
  static async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const tokenHash = hashToken(token);

    await withTransaction(async (client) => {
      // Look up and validate the token inside the transaction
      const tokenResult = await client.query(
        `SELECT id, user_id, expires_at, used_at
           FROM password_reset_tokens
          WHERE token_hash = $1
            FOR UPDATE`,
        [tokenHash],
      );

      if (tokenResult.rows.length === 0) {
        throw new AuthenticationError('Invalid or expired password reset token');
      }

      const row = tokenResult.rows[0];

      if (row.used_at !== null) {
        throw new AuthenticationError('Password reset token has already been used');
      }

      if (new Date(row.expires_at) < new Date()) {
        throw new AuthenticationError('Password reset token has expired');
      }

      const userId: string = row.user_id;

      // Hash the new password
      const newHash = await hashPassword(newPassword);

      // Update the user's password and password_updated_at
      await client.query(
        `UPDATE users
            SET password_hash = $1,
                password_updated_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [newHash, userId],
      );

      // Mark the token as used
      await client.query(
        `UPDATE password_reset_tokens
            SET used_at = NOW()
          WHERE id = $1`,
        [row.id],
      );

      // Invalidate all sessions for this user
      await client.query(
        'DELETE FROM sessions WHERE user_id = $1',
        [userId],
      );

      // Log an audit event
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          generateId(),
          userId,
          'PASSWORD_RESET',
          JSON.stringify({ method: 'reset_token' }),
        ],
      );

      logger.info('Password reset completed', { userId });
    });
  }
}

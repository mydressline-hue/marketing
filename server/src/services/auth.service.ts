/**
 * Authentication Service.
 *
 * Provides static methods for user registration, login, logout, token
 * refresh, profile retrieval, profile updates, and password changes.
 * All database access goes through the shared connection pool and helpers
 * from the utils layer handle password hashing and ID generation.
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import {
  generateId,
  hashPassword,
  comparePassword,
} from '../utils/helpers';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';
import {
  generateToken,
  generateRefreshToken,
} from '../middleware/auth';
import { withTransaction } from '../utils/transaction';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AccountLockoutService } from './account-lockout.service';

/**
 * Produces a hex-encoded SHA-256 hash of the given token.
 * Used to store and look up session tokens without keeping the plaintext.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

export class AuthService {
  // -----------------------------------------------------------------------
  // Register
  // -----------------------------------------------------------------------

  /**
   * Creates a new user account, hashes the password, and returns the user
   * record together with a JWT access token and refresh token.
   */
  static async register(
    email: string,
    password: string,
    name: string,
    role: string = 'user',
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    const id = generateId();
    const passwordHash = await hashPassword(password);

    const user = await withTransaction(async (client) => {
      // Check for existing user inside the transaction to prevent race conditions
      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()],
      );

      if (existing.rows.length > 0) {
        throw new ConflictError('A user with this email already exists');
      }

      const result = await client.query(
        `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, email, name, role, created_at, updated_at`,
        [id, email.toLowerCase(), passwordHash, name, role],
      );

      return result.rows[0] as User;
    });

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshTkn = generateRefreshToken({ id: user.id });

    logger.info('User registered', { userId: user.id, email: user.email });

    return { user, token, refreshToken: refreshTkn };
  }

  // -----------------------------------------------------------------------
  // Login
  // -----------------------------------------------------------------------

  /**
   * Validates credentials, updates the last login timestamp, creates a
   * session record, logs an audit event, and returns tokens.
   *
   * Performs account-lockout checks before credential validation and
   * records failed attempts (or resets on success) for brute-force
   * protection.
   */
  static async login(
    email: string,
    password: string,
    ipAddress: string = 'unknown',
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    const result = await pool.query(
      `SELECT id, email, password_hash, name, role, created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('Invalid email or password');
    }

    const row = result.rows[0];

    // --- Lockout check: reject early if account is locked ----------------
    const locked = await AccountLockoutService.isLocked(row.id);
    if (locked) {
      const status = await AccountLockoutService.getLockoutStatus(row.id);
      const minutesRemaining = Math.ceil(status.timeRemainingMs / 60000);
      logger.warn('Login attempt on locked account', {
        userId: row.id,
        email: row.email,
        ipAddress,
        minutesRemaining,
      });
      throw new AuthenticationError(
        `Account is temporarily locked. Please try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
      );
    }

    // --- Credential validation -------------------------------------------
    const passwordValid = await comparePassword(password, row.password_hash);

    if (!passwordValid) {
      // Record the failed attempt (may trigger a lockout)
      await AccountLockoutService.recordFailedAttempt(row.id, ipAddress);
      throw new AuthenticationError('Invalid email or password');
    }

    // --- Successful login: reset any prior failed attempts ---------------
    const token = generateToken({
      id: row.id,
      email: row.email,
      role: row.role,
    });
    const refreshTkn = generateRefreshToken({ id: row.id });

    // Run post-login writes inside a transaction for atomicity
    const sessionId = generateId();
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [row.id],
      );
      await client.query(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '24 hours')`,
        [sessionId, row.id, hashToken(token)],
      );
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [generateId(), row.id, 'LOGIN', JSON.stringify({ email: row.email })],
      );
    });
    // Reset lockout attempts outside the transaction (non-critical)
    await AccountLockoutService.resetAttempts(row.id);

    const user: User = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    logger.info('User logged in', { userId: user.id, email: user.email });

    return { user, token, refreshToken: refreshTkn };
  }

  // -----------------------------------------------------------------------
  // Logout
  // -----------------------------------------------------------------------

  /**
   * Removes the user's session and logs an audit event.
   */
  static async logout(userId: string, token: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        'DELETE FROM sessions WHERE user_id = $1 AND token_hash = $2',
        [userId, hashToken(token)],
      );
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, details, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [generateId(), userId, 'LOGOUT', JSON.stringify({})],
      );
    });

    logger.info('User logged out', { userId });
  }

  // -----------------------------------------------------------------------
  // Refresh Token
  // -----------------------------------------------------------------------

  /**
   * Validates a refresh token and issues a new access / refresh token pair.
   */
  static async refreshToken(
    refreshTkn: string,
  ): Promise<{ token: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshTkn, env.JWT_SECRET!) as {
        id: string;
      };

      // Fetch the user to get current email & role for the new access token
      const result = await pool.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [decoded.id],
      );

      if (result.rows.length === 0) {
        throw new AuthenticationError('User not found');
      }

      const user = result.rows[0];

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      const newRefreshToken = generateRefreshToken({ id: user.id });

      return { token, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }

  // -----------------------------------------------------------------------
  // Get Profile
  // -----------------------------------------------------------------------

  /**
   * Returns the user record for the given id (without the password hash).
   */
  static async getProfile(userId: string): Promise<User> {
    const result = await pool.query(
      `SELECT id, email, name, role, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    return result.rows[0] as User;
  }

  // -----------------------------------------------------------------------
  // Update Profile
  // -----------------------------------------------------------------------

  /**
   * Updates the user's name and/or email.
   */
  static async updateProfile(
    userId: string,
    data: { name?: string; email?: string },
  ): Promise<User> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.email !== undefined) {
      // Check for duplicate email
      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [data.email.toLowerCase(), userId],
      );

      if (existing.rows.length > 0) {
        throw new ConflictError('A user with this email already exists');
      }

      fields.push(`email = $${paramIndex++}`);
      values.push(data.email.toLowerCase());
    }

    if (fields.length === 0) {
      return AuthService.getProfile(userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, name, role, created_at, updated_at`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    logger.info('User profile updated', { userId });

    return result.rows[0] as User;
  }

  // -----------------------------------------------------------------------
  // Change Password
  // -----------------------------------------------------------------------

  /**
   * Validates the current password, then updates to the new one.
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const passwordValid = await comparePassword(
      currentPassword,
      result.rows[0].password_hash,
    );

    if (!passwordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    const newHash = await hashPassword(newPassword);

    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId],
    );

    logger.info('User password changed', { userId });
  }
}

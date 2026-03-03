/**
 * Account Lockout Service.
 *
 * Provides brute-force protection by tracking failed login attempts per user
 * and IP address. When the number of consecutive failures exceeds a
 * configurable threshold the account is temporarily locked.
 *
 * Lockout durations escalate exponentially: base, base*2, base*4, etc.
 * All thresholds and durations are driven by environment variables so
 * operators can tune behaviour without code changes.
 */

import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { env } from '../config/env';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LockoutStatus {
  /** Total consecutive failed attempts recorded for this user. */
  attemptCount: number;
  /** Whether the account is currently locked. */
  isLocked: boolean;
  /** Milliseconds remaining until the lock expires (0 if not locked). */
  timeRemainingMs: number;
  /** ISO-8601 timestamp when the lock expires, or null if not locked. */
  lockedUntil: string | null;
}

// ---------------------------------------------------------------------------
// AccountLockoutService
// ---------------------------------------------------------------------------

export class AccountLockoutService {
  // -----------------------------------------------------------------------
  // Record Failed Attempt
  // -----------------------------------------------------------------------

  /**
   * Increments the failed-attempt counter for the given user / IP pair.
   * If the counter reaches the configured threshold the account is locked
   * for an exponentially increasing duration.
   */
  static async recordFailedAttempt(
    userId: string,
    ipAddress: string,
  ): Promise<void> {
    const threshold = env.LOCKOUT_THRESHOLD;
    const baseDurationMinutes = env.LOCKOUT_DURATION_MINUTES;

    // Upsert: create or increment the attempt row
    const upsertResult = await pool.query(
      `INSERT INTO login_attempts (id, user_id, ip_address, attempt_count, last_attempt_at)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT (user_id, ip_address) DO UPDATE
         SET attempt_count   = login_attempts.attempt_count + 1,
             last_attempt_at = NOW()
       RETURNING attempt_count`,
      [generateId(), userId, ipAddress],
    );

    const attemptCount: number = upsertResult.rows[0].attempt_count;

    if (attemptCount >= threshold) {
      // Calculate how many times the account has been locked so far.
      // Each time we hit the threshold we double the duration:
      //   1st lock  = base minutes
      //   2nd lock  = base * 2 minutes
      //   3rd lock  = base * 4 minutes  (capped at 4x base = 60 min when base = 15)
      const lockoutsTriggered = Math.floor(attemptCount / threshold);
      const exponent = Math.min(lockoutsTriggered - 1, 2); // cap at 2^2 = 4x
      const durationMinutes = baseDurationMinutes * Math.pow(2, exponent);

      await pool.query(
        `UPDATE login_attempts
            SET locked_until = NOW() + ($1 || ' minutes')::INTERVAL
          WHERE user_id = $2 AND ip_address = $3`,
        [String(durationMinutes), userId, ipAddress],
      );

      logger.warn('Account locked due to excessive failed login attempts', {
        userId,
        ipAddress,
        attemptCount,
        durationMinutes,
      });
    } else {
      logger.info('Failed login attempt recorded', {
        userId,
        ipAddress,
        attemptCount,
        threshold,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Is Locked
  // -----------------------------------------------------------------------

  /**
   * Returns `true` if the account is currently locked (i.e. there exists a
   * login_attempts row for this user whose `locked_until` is in the future).
   */
  static async isLocked(userId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM login_attempts
        WHERE user_id = $1
          AND locked_until IS NOT NULL
          AND locked_until > NOW()
        LIMIT 1`,
      [userId],
    );

    return result.rows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Reset Attempts
  // -----------------------------------------------------------------------

  /**
   * Resets all failed-attempt records for the given user. Called after a
   * successful login so the user starts with a clean slate.
   */
  static async resetAttempts(userId: string): Promise<void> {
    await pool.query(
      `DELETE FROM login_attempts WHERE user_id = $1`,
      [userId],
    );

    logger.info('Login attempt records reset after successful login', {
      userId,
    });
  }

  // -----------------------------------------------------------------------
  // Get Lockout Status
  // -----------------------------------------------------------------------

  /**
   * Returns a summary of the current lockout status for a user: the total
   * attempt count, whether the account is locked, and how much time remains.
   */
  static async getLockoutStatus(userId: string): Promise<LockoutStatus> {
    const result = await pool.query(
      `SELECT attempt_count,
              locked_until,
              CASE
                WHEN locked_until IS NOT NULL AND locked_until > NOW()
                  THEN EXTRACT(EPOCH FROM (locked_until - NOW())) * 1000
                ELSE 0
              END AS time_remaining_ms
         FROM login_attempts
        WHERE user_id = $1
        ORDER BY attempt_count DESC
        LIMIT 1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return {
        attemptCount: 0,
        isLocked: false,
        timeRemainingMs: 0,
        lockedUntil: null,
      };
    }

    const row = result.rows[0];
    const timeRemainingMs = Math.max(0, Math.round(Number(row.time_remaining_ms)));
    const isLocked = timeRemainingMs > 0;

    return {
      attemptCount: row.attempt_count,
      isLocked,
      timeRemainingMs,
      lockedUntil: isLocked && row.locked_until
        ? new Date(row.locked_until).toISOString()
        : null,
    };
  }
}

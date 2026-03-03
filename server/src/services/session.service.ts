/**
 * Session Management Service.
 *
 * Manages user sessions with a Redis-first, PostgreSQL-fallback strategy.
 * Sessions are created in both stores simultaneously, validated against
 * Redis for speed (falling back to the DB on cache miss), and destroyed
 * from both stores to ensure consistency.
 */

import crypto from 'crypto';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';
import { pool } from '../config/database';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

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

export interface Session {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_CACHE_PREFIX = 'session:';
const SESSION_TTL_SECONDS = 86400; // 24 hours

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SessionService {
  /**
   * Create a new session for a user.
   *
   * Stores the session in PostgreSQL as the source of truth and caches it
   * in Redis for fast subsequent lookups.
   *
   * @returns The newly created session ID.
   */
  static async create(
    userId: string,
    token: string,
    ip: string,
    userAgent: string,
  ): Promise<string> {
    const id = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

    const tokenHash = hashToken(token);

    // Persist to the database (store only the hash, never the plaintext token)
    await pool.query(
      `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, tokenHash, ip, userAgent, now.toISOString(), expiresAt.toISOString()],
    );

    // Cache in Redis (store the hash, not the plaintext token)
    const sessionData: Session = {
      id,
      userId,
      token: tokenHash,
      ipAddress: ip,
      userAgent,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await cacheSet(
      `${SESSION_CACHE_PREFIX}${id}`,
      sessionData,
      SESSION_TTL_SECONDS,
    );

    logger.info('Session created', { sessionId: id, userId });

    return id;
  }

  /**
   * Validate a session by its ID.
   *
   * Checks Redis first for speed; falls back to the database on a cache
   * miss and re-populates the cache if the session is still valid.
   *
   * Returns `null` if the session does not exist or has expired.
   */
  static async validate(sessionId: string): Promise<Session | null> {
    // Try Redis first
    const cached = await cacheGet<Session>(`${SESSION_CACHE_PREFIX}${sessionId}`);

    if (cached) {
      // Check expiry
      if (new Date(cached.expiresAt) < new Date()) {
        await SessionService.destroy(sessionId);
        return null;
      }
      return cached;
    }

    // Fallback to the database
    const result = await pool.query(
      `SELECT id, user_id, token_hash, ip_address, user_agent, created_at, expires_at
       FROM sessions
       WHERE id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const session: Session = {
      id: row.id,
      userId: row.user_id,
      token: row.token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };

    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      await SessionService.destroy(sessionId);
      return null;
    }

    // Re-populate the cache for future requests
    const remainingTtl = Math.max(
      0,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
    );

    if (remainingTtl > 0) {
      await cacheSet(
        `${SESSION_CACHE_PREFIX}${sessionId}`,
        session,
        remainingTtl,
      );
    }

    return session;
  }

  /**
   * Destroy a single session.
   *
   * Removes the session from both Redis and the database.
   */
  static async destroy(sessionId: string): Promise<void> {
    await Promise.all([
      cacheDel(`${SESSION_CACHE_PREFIX}${sessionId}`),
      pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]),
    ]);

    logger.info('Session destroyed', { sessionId });
  }

  /**
   * Destroy all sessions for a given user.
   *
   * Fetches all session IDs from the database, removes each from Redis,
   * then bulk-deletes them from the database.
   */
  static async destroyAllForUser(userId: string): Promise<void> {
    // Fetch all session IDs for the user
    const result = await pool.query(
      `SELECT id FROM sessions WHERE user_id = $1`,
      [userId],
    );

    const sessionIds: string[] = result.rows.map((row) => row.id);

    // Remove each session from Redis in parallel
    if (sessionIds.length > 0) {
      await Promise.all(
        sessionIds.map((id) => cacheDel(`${SESSION_CACHE_PREFIX}${id}`)),
      );
    }

    // Bulk-delete from the database
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);

    logger.info('All sessions destroyed for user', {
      userId,
      count: sessionIds.length,
    });
  }

  /**
   * List all active (non-expired) sessions for a user.
   */
  static async getActiveSessions(userId: string): Promise<Session[]> {
    const result = await pool.query(
      `SELECT id, user_id, token_hash, ip_address, user_agent, created_at, expires_at
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      token: row.token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }
}

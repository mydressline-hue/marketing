/**
 * SessionRepository – Data-access layer for the `sessions` table.
 *
 * Extends BaseRepository with session-specific query methods such as
 * lookup by token hash, finding active sessions for a user, deleting
 * expired sessions, and bulk-destroying all sessions for a user.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SessionRepository extends BaseRepository<Session> {
  constructor() {
    super('sessions');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find a session by its token hash.
   */
  async findByTokenHash(
    tokenHash: string,
    client?: PoolClient,
  ): Promise<Session | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM sessions WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all sessions belonging to a specific user.
   */
  async findByUserId(userId: string, client?: PoolClient): Promise<Session[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active (non-expired) sessions for a user.
   */
  async findActiveByUserId(userId: string, client?: PoolClient): Promise<Session[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Delete a session by user ID and token hash.
   * Returns `true` when a session was actually deleted.
   */
  async deleteByUserAndToken(
    userId: string,
    tokenHash: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const db = client || pool;
    const result = await db.query(
      `DELETE FROM sessions WHERE user_id = $1 AND token_hash = $2`,
      [userId, tokenHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete all sessions for a given user.
   * Returns the number of sessions deleted.
   */
  async deleteAllForUser(userId: string, client?: PoolClient): Promise<number> {
    const db = client || pool;
    const result = await db.query(
      `DELETE FROM sessions WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Delete all expired sessions across all users.
   * Returns the number of sessions cleaned up.
   */
  async deleteExpired(client?: PoolClient): Promise<number> {
    const db = client || pool;
    const result = await db.query(
      `DELETE FROM sessions WHERE expires_at <= NOW()`,
    );
    return result.rowCount ?? 0;
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      userId: (row.user_id as string) ?? '',
      tokenHash: (row.token_hash as string) ?? '',
      ipAddress: (row.ip_address as string) ?? null,
      userAgent: (row.user_agent as string) ?? null,
      expiresAt: (row.expires_at as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
    };
  }
}

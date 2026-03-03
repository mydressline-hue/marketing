/**
 * UserRepository – Data-access layer for the `users` table.
 *
 * Extends BaseRepository with user-specific query methods such as lookup
 * by email, filtering by role or active status. The `mapRow` method never
 * exposes the password hash to consumers.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  mfaEnabled: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Extended user type that includes the password hash.
 * Only used internally for authentication flows.
 */
export interface UserWithPassword extends User {
  passwordHash: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find a user by their email address (case-insensitive).
   */
  async findByEmail(email: string, client?: PoolClient): Promise<User | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT id, email, name, role, mfa_enabled, is_active, last_login_at, created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find a user by email and include the password hash for authentication.
   */
  async findByEmailWithPassword(
    email: string,
    client?: PoolClient,
  ): Promise<UserWithPassword | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT id, email, password_hash, name, role, mfa_enabled, is_active, last_login_at, created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );
    return result.rows[0] ? this.mapRowWithPassword(result.rows[0]) : null;
  }

  /**
   * Find all users with a specific role.
   */
  async findByRole(role: string, client?: PoolClient): Promise<User[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT id, email, name, role, mfa_enabled, is_active, last_login_at, created_at, updated_at
       FROM users WHERE role = $1
       ORDER BY created_at DESC`,
      [role],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active or inactive users.
   */
  async findByActiveStatus(isActive: boolean, client?: PoolClient): Promise<User[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT id, email, name, role, mfa_enabled, is_active, last_login_at, created_at, updated_at
       FROM users WHERE is_active = $1
       ORDER BY created_at DESC`,
      [isActive],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Check whether an email is already registered.
   */
  async existsByEmail(email: string, client?: PoolClient): Promise<boolean> {
    const db = client || pool;
    const result = await db.query(
      `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    return result.rows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: (row.email as string) ?? '',
      name: (row.name as string) ?? '',
      role: (row.role as string) ?? 'viewer',
      mfaEnabled: (row.mfa_enabled as boolean) ?? false,
      isActive: (row.is_active as boolean) ?? true,
      lastLoginAt: (row.last_login_at as string) ?? null,
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }

  private mapRowWithPassword(row: Record<string, unknown>): UserWithPassword {
    return {
      ...this.mapRow(row),
      passwordHash: (row.password_hash as string) ?? '',
    };
  }
}

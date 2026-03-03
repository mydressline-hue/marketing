/**
 * API Key Management Service.
 *
 * Provides static methods for creating, validating, revoking, listing, and
 * rotating API keys. Keys are generated as random hex strings, stored as
 * SHA-256 hashes for fast validation lookups, and the raw key is also
 * persisted in AES-256-GCM encrypted form so that it can be recovered
 * during rotation.
 */

import crypto from 'crypto';
import { pool } from '../config/database';
import { generateId, encrypt } from '../utils/helpers';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyInfo {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_KEY_PREFIX = 'mktg_';
const API_KEY_BYTE_LENGTH = 32;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApiKeyService {
  /**
   * Create a new API key for a user.
   *
   * The generated key is returned in plaintext **once**. It is stored as a
   * SHA-256 hash (for fast validation lookups) and also encrypted with
   * AES-256-GCM so it can be recovered during key rotation.
   */
  static async create(
    userId: string,
    name: string,
    scopes: string[],
  ): Promise<{ id: string; key: string }> {
    const id = generateId();
    const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(API_KEY_BYTE_LENGTH).toString('hex')}`;

    // SHA-256 hash for fast lookup during validation
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // AES-256-GCM encrypted copy so the key can be recovered for rotation
    const encryptionKey = env.ENCRYPTION_KEY as string;
    const encryptedKey = encrypt(rawKey, encryptionKey);

    await pool.query(
      `INSERT INTO api_keys (id, user_id, name, key_hash, encrypted_key, scopes, is_active, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NULL)`,
      [id, userId, name, keyHash, encryptedKey, JSON.stringify(scopes)],
    );

    logger.info('API key created', { keyId: id, userId, name });

    return { id, key: rawKey };
  }

  /**
   * Validate an API key.
   *
   * Computes the SHA-256 hash of the supplied key and looks it up in the
   * database. If found and active, returns the associated user ID and scopes.
   * Also updates `last_used_at` as a side-effect.
   */
  static async validate(
    key: string,
  ): Promise<{ userId: string; scopes: string[] } | null> {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const result = await pool.query(
      `SELECT id, user_id, scopes FROM api_keys
       WHERE key_hash = $1 AND is_active = true`,
      [keyHash],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Fire-and-forget update of last_used_at
    pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [row.id],
    ).catch((err) => {
      logger.error('Failed to update last_used_at for API key', {
        keyId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const scopes =
      typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes;

    return { userId: row.user_id, scopes };
  }

  /**
   * Revoke (deactivate) an API key.
   *
   * Soft-deletes the key by setting `is_active` to `false`. Only the owning
   * user can revoke their keys.
   */
  static async revoke(keyId: string, userId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2`,
      [keyId, userId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('API key not found or not owned by user');
    }

    logger.info('API key revoked', { keyId, userId });
  }

  /**
   * List all API keys belonging to a user.
   *
   * Returns metadata only -- the actual key values are never exposed.
   */
  static async list(userId: string): Promise<ApiKeyInfo[]> {
    const result = await pool.query(
      `SELECT id, name, scopes, is_active, created_at, last_used_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      scopes:
        typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      isActive: row.is_active,
    }));
  }

  /**
   * Rotate an API key.
   *
   * Revokes the existing key and creates a new one with the same name and
   * scopes. The caller receives the new key in plaintext.
   */
  static async rotate(
    keyId: string,
    userId: string,
  ): Promise<{ id: string; key: string }> {
    // Fetch the existing key's metadata so we can clone it
    const existing = await pool.query(
      `SELECT name, scopes FROM api_keys WHERE id = $1 AND user_id = $2 AND is_active = true`,
      [keyId, userId],
    );

    if (existing.rows.length === 0) {
      throw new Error('API key not found or already revoked');
    }

    const { name, scopes: rawScopes } = existing.rows[0];
    const scopes =
      typeof rawScopes === 'string' ? JSON.parse(rawScopes) : rawScopes;

    // Revoke the old key
    await ApiKeyService.revoke(keyId, userId);

    // Create a replacement key with the same name and scopes
    const newKey = await ApiKeyService.create(userId, name, scopes);

    logger.info('API key rotated', {
      oldKeyId: keyId,
      newKeyId: newKey.id,
      userId,
    });

    return newKey;
  }
}

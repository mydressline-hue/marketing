/**
 * Database Transaction Helper.
 *
 * Provides a `withTransaction` wrapper that acquires a client from the
 * connection pool, executes a callback inside a BEGIN / COMMIT block,
 * and automatically rolls back on error. The client is always released
 * back to the pool in the `finally` block.
 */

import { pool } from '../config/database';
import { PoolClient } from 'pg';

/**
 * Execute `fn` inside a database transaction.
 *
 * Usage:
 * ```ts
 * const result = await withTransaction(async (client) => {
 *   await client.query('UPDATE ...', [...]);
 *   await client.query('INSERT ...', [...]);
 *   return someValue;
 * });
 * ```
 *
 * - On success the transaction is committed and the return value of `fn`
 *   is forwarded to the caller.
 * - On error the transaction is rolled back and the error is re-thrown.
 * - The `PoolClient` is released in all cases.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

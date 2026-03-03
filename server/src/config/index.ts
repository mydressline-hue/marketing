// ---------------------------------------------------------------------------
// Central configuration re-export
// ---------------------------------------------------------------------------

export { env, envSchema } from './env';

export { pool, query, getClient, testConnection, closePool } from './database';

export {
  redis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheFlush,
  testRedisConnection,
  closeRedis,
} from './redis';

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

import { testConnection } from './database';
import { testRedisConnection } from './redis';
import { closePool } from './database';
import { closeRedis } from './redis';
import { logger } from '../utils/logger';
import { eventBus } from '../websocket/EventBus';

/**
 * Initialise all external connections (Postgres + Redis).
 *
 * Redis failure is treated as non-fatal so the server can still operate in
 * degraded mode (e.g. without caching) when Redis is unavailable.
 */
export async function initializeConnections(): Promise<void> {
  // Postgres – must succeed
  const dbOk = await testConnection();
  if (!dbOk) {
    throw new Error('Failed to establish database connection');
  }

  // Redis – best-effort
  try {
    const redisOk = await testRedisConnection();
    if (!redisOk) {
      logger.warn(
        'Redis is unavailable. The server will continue without caching.',
      );
    }

    // Initialise EventBus Redis pub/sub connections (separate from the
    // main Redis client used for caching). Non-fatal on failure.
    await eventBus.init();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Redis connection failed: ${message}. The server will continue without caching.`,
    );
  }

  logger.info('All connections initialised successfully.');
}

/**
 * Gracefully shut down every external connection.
 */
export async function closeConnections(): Promise<void> {
  logger.info('Shutting down connections...');
  await eventBus.close();
  await closePool();
  await closeRedis();
  logger.info('All connections shut down.');
}

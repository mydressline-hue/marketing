import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      logger.error('Redis: max retry attempts reached. Giving up.');
      return null;
    }
    const delay = Math.min(times * 500, 5000);
    logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})...`);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis client connected.');
});

redis.on('ready', () => {
  logger.info('Redis client ready to accept commands.');
});

redis.on('error', (err: Error) => {
  logger.error('Redis client error:', err.message);
});

redis.on('close', () => {
  logger.warn('Redis connection closed.');
});

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);

    if (data === null) {
      return null;
    }

    try {
      return JSON.parse(data) as T;
    } catch {
      logger.error(`Redis: failed to parse cached value for key "${key}".`);
      return null;
    }
  } catch (err) {
    logger.error(`Redis: cacheGet failed for key "${key}":`, err);
    return null;
  }
}

async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  try {
    const serialized = JSON.stringify(value);

    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await redis.set(key, serialized);
    }
  } catch (err) {
    logger.error(`Redis: cacheSet failed for key "${key}":`, err);
  }
}

async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.error(`Redis: cacheDel failed for key "${key}":`, err);
  }
}

async function cacheFlush(pattern: string): Promise<void> {
  try {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.error(`Redis: cacheFlush failed for pattern "${pattern}":`, err);
  }
}

async function testRedisConnection(): Promise<boolean> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Only call connect() if the client is not already connected or connecting.
      // ioredis with lazyConnect requires an explicit connect() call, but
      // subsequent retries should not call connect() again if the client is
      // already in a connecting/connected state.
      const status = redis.status;
      if (status === 'wait' || status === 'end' || status === 'close') {
        await redis.connect();
      }
      await redis.ping();
      logger.info('Redis connection established successfully.');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          `Redis connection attempt ${attempt}/${maxRetries} failed: ${message}. Retrying in ${delay}ms...`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(
          `Redis connection failed after ${maxRetries} attempts: ${message}`,
        );
      }
    }
  }

  return false;
}

async function closeRedis(): Promise<void> {
  logger.info('Closing Redis connection...');
  await redis.quit();
  logger.info('Redis connection closed.');
}

export { redis, cacheGet, cacheSet, cacheDel, cacheFlush, testRedisConnection, closeRedis };

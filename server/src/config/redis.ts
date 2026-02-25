import Redis from 'ioredis';
import { env } from './env';

const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      console.error('Redis: max retry attempts reached. Giving up.');
      return null;
    }
    const delay = Math.min(times * 500, 5000);
    console.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})...`);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => {
  console.log('Redis client connected.');
});

redis.on('ready', () => {
  console.log('Redis client ready to accept commands.');
});

redis.on('error', (err: Error) => {
  console.error('Redis client error:', err.message);
});

redis.on('close', () => {
  console.warn('Redis connection closed.');
});

async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);

  if (data === null) {
    return null;
  }

  try {
    return JSON.parse(data) as T;
  } catch {
    console.error(`Redis: failed to parse cached value for key "${key}".`);
    return null;
  }
}

async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const serialized = JSON.stringify(value);

  if (ttlSeconds !== undefined && ttlSeconds > 0) {
    await redis.set(key, serialized, 'EX', ttlSeconds);
  } else {
    await redis.set(key, serialized);
  }
}

async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

async function cacheFlush(pattern: string): Promise<void> {
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
}

async function testRedisConnection(): Promise<boolean> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await redis.connect();
      await redis.ping();
      console.log('Redis connection established successfully.');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `Redis connection attempt ${attempt}/${maxRetries} failed: ${message}. Retrying in ${delay}ms...`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `Redis connection failed after ${maxRetries} attempts: ${message}`,
        );
      }
    }
  }

  return false;
}

async function closeRedis(): Promise<void> {
  console.log('Closing Redis connection...');
  await redis.quit();
  console.log('Redis connection closed.');
}

export { redis, cacheGet, cacheSet, cacheDel, cacheFlush, testRedisConnection, closeRedis };

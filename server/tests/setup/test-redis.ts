import Redis from 'ioredis';

let testRedis: Redis | null = null;

export async function initTestRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const testDb = parseInt(process.env.REDIS_TEST_DB || '15', 10);

  testRedis = new Redis(redisUrl, { db: testDb, lazyConnect: true });

  try {
    await testRedis.connect();
    await testRedis.flushdb();
  } catch (err) {
    console.warn('Redis not available for tests, using mock mode');
    testRedis = null;
  }
}

export function getTestRedis(): Redis | null {
  return testRedis;
}

export async function cleanupTestRedis(): Promise<void> {
  if (testRedis) {
    await testRedis.flushdb().catch(() => {});
    await testRedis.quit().catch(() => {});
    testRedis = null;
  }
}

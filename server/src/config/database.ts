import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DB_POOL_MIN,
  max: env.DB_POOL_MAX,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle database client:', err);
});

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();

  const originalRelease = client.release.bind(client);
  let released = false;

  client.release = (err?: Error | boolean) => {
    if (released) {
      console.warn('Client has already been released. Ignoring duplicate release call.');
      return;
    }
    released = true;
    return originalRelease(err);
  };

  return client;
}

async function testConnection(): Promise<boolean> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connection established successfully.');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(
          `Database connection attempt ${attempt}/${maxRetries} failed: ${message}. Retrying in ${delay}ms...`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `Database connection failed after ${maxRetries} attempts: ${message}`,
        );
      }
    }
  }

  return false;
}

async function closePool(): Promise<void> {
  console.log('Closing database connection pool...');
  await pool.end();
  console.log('Database connection pool closed.');
}

export { pool, query, getClient, testConnection, closePool };

import fs from 'fs';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// SSL / TLS configuration for PostgreSQL connections
// ---------------------------------------------------------------------------
const isProduction = env.NODE_ENV === 'production';
const sslEnabled = env.DB_SSL_ENABLED || env.DB_SSL || isProduction;

function buildSslConfig(): false | Record<string, unknown> {
  if (!sslEnabled) {
    return false;
  }

  const sslConfig: Record<string, unknown> = {
    rejectUnauthorized: isProduction,
  };

  const certPaths = {
    ca: env.DB_SSL_CA,
    key: env.DB_SSL_KEY,
    cert: env.DB_SSL_CERT,
  };

  const hasCertPaths =
    certPaths.ca !== undefined ||
    certPaths.key !== undefined ||
    certPaths.cert !== undefined;

  if (hasCertPaths) {
    for (const [name, filePath] of Object.entries(certPaths)) {
      if (filePath === undefined) {
        continue;
      }

      const fileExists = fs.existsSync(filePath);

      if (!fileExists) {
        if (isProduction) {
          // In production, fail fast when configured cert files are missing.
          const message = `Database SSL certificate file not found: DB_SSL_${name.toUpperCase()}="${filePath}"`;
          logger.error(message);
          throw new Error(message);
        }

        // In development / test, warn but continue without the cert.
        logger.warn(
          `Database SSL certificate file not found (non-production, skipping): DB_SSL_${name.toUpperCase()}="${filePath}"`,
        );
        continue;
      }

      sslConfig[name] = fs.readFileSync(filePath);
    }
  }

  return sslConfig;
}

const sslConfig = buildSslConfig();

if (isProduction && sslConfig !== false) {
  logger.info('Database SSL/TLS is enabled for production.');
} else if (sslConfig !== false) {
  logger.info('Database SSL/TLS is enabled (non-production).');
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  min: env.DB_POOL_MIN,
  max: env.DB_POOL_MAX,
  ssl: sslConfig,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
  connectionTimeoutMillis: 5000,
});

// ---------------------------------------------------------------------------
// Pool event logging for debugging and observability
// ---------------------------------------------------------------------------
pool.on('connect', (_client) => {
  logger.debug('Pool: new client connected', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('acquire', () => {
  logger.debug('Pool: client acquired', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('remove', () => {
  logger.debug('Pool: client removed', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle database client:', err);
});

logger.info('Database connection pool configured', {
  min: env.DB_POOL_MIN,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
});

// ---------------------------------------------------------------------------
// Slow-query logging threshold (configurable via SLOW_QUERY_THRESHOLD_MS)
// ---------------------------------------------------------------------------
const slowQueryThresholdMs: number = env.SLOW_QUERY_THRESHOLD_MS;

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const durationMs = Date.now() - start;

  if (durationMs >= slowQueryThresholdMs) {
    const truncatedQuery =
      text.length > 200 ? text.substring(0, 200) + '...' : text;
    logger.warn('Slow query detected', {
      query: truncatedQuery,
      duration_ms: durationMs,
      rows: result.rowCount,
    });
  }

  return result;
}

async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();

  const originalRelease = client.release.bind(client);
  let released = false;

  client.release = (err?: Error | boolean) => {
    if (released) {
      logger.warn('Client has already been released. Ignoring duplicate release call.');
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
      logger.info('Database connection established successfully.');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          `Database connection attempt ${attempt}/${maxRetries} failed: ${message}. Retrying in ${delay}ms...`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(
          `Database connection failed after ${maxRetries} attempts: ${message}`,
        );
      }
    }
  }

  return false;
}

async function closePool(): Promise<void> {
  logger.info('Closing database connection pool...');
  await pool.end();
  logger.info('Database connection pool closed.');
}

export { pool, query, getClient, testConnection, closePool };

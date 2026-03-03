/**
 * Production Environment Configuration.
 *
 * Provides production-specific configuration values for database connections
 * (with SSL), Redis connections (with TLS), logging, rate limiting, and CORS.
 * Import this module to access typed production defaults that override or
 * augment the base env configuration when NODE_ENV === 'production'.
 */

import { env } from './env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseConfig {
  connectionString: string;
  pool: {
    min: number;
    max: number;
  };
  ssl: {
    rejectUnauthorized: boolean;
    ca?: string;
  };
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statementTimeout: number;
}

export interface RedisConfig {
  url: string;
  password: string | undefined;
  db: number;
  tls: {
    rejectUnauthorized: boolean;
    ca?: string;
  };
  maxRetriesPerRequest: number;
  connectTimeout: number;
  commandTimeout: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
}

export interface LoggingConfig {
  level: string;
  format: string;
  colorize: boolean;
  includeTimestamp: boolean;
  maxFiles: number;
  maxFileSize: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  /** Stricter limit for auth endpoints (login, register) */
  authWindowMs: number;
  authMaxRequests: number;
  /** Stricter limit for AI/agent endpoints */
  aiWindowMs: number;
  aiMaxRequests: number;
  /** Final outputs rate limit */
  finalOutputsWindowMs: number;
  finalOutputsMaxRequests: number;
}

export interface CorsConfig {
  origins: string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export interface ProductionConfig {
  database: DatabaseConfig;
  redis: RedisConfig;
  logging: LoggingConfig;
  rateLimit: RateLimitConfig;
  cors: CorsConfig;
  server: {
    port: number;
    gracefulShutdownTimeoutMs: number;
    keepAliveTimeoutMs: number;
    headersTimeoutMs: number;
    requestBodyLimit: string;
  };
  security: {
    jwtExpiresIn: string;
    jwtRefreshExpiresIn: string;
    bcryptRounds: number;
    maxLoginAttempts: number;
    lockoutDurationMs: number;
  };
  cache: {
    defaultTtlSeconds: number;
    finalOutputsTtlSeconds: number;
    countryDataTtlSeconds: number;
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const productionConfig: ProductionConfig = {
  // ── Database (PostgreSQL 15+ with SSL) ─────────────────────────────────
  database: {
    connectionString: env.DATABASE_URL || '',
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
    },
    ssl: {
      rejectUnauthorized: true,
      ca: env.DB_SSL_CA || undefined,
    },
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statementTimeout: 30_000,
  },

  // ── Redis (7+ with TLS) ────────────────────────────────────────────────
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    tls: {
      rejectUnauthorized: true,
      ca: env.REDIS_TLS_CA || undefined,
    },
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: false,
  },

  // ── Logging ────────────────────────────────────────────────────────────
  logging: {
    level: 'info',
    format: 'json',
    colorize: false,
    includeTimestamp: true,
    maxFiles: 30,
    maxFileSize: '50m',
  },

  // ── Rate Limiting ──────────────────────────────────────────────────────
  rateLimit: {
    // General API rate limit
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 200,

    // Auth endpoints (stricter)
    authWindowMs: 15 * 60 * 1000,
    authMaxRequests: 20,

    // AI/agent endpoints (resource-intensive)
    aiWindowMs: 60 * 60 * 1000, // 1 hour
    aiMaxRequests: 50,

    // Final outputs (cached, more lenient)
    finalOutputsWindowMs: 5 * 60 * 1000, // 5 minutes
    finalOutputsMaxRequests: 100,
  },

  // ── CORS ───────────────────────────────────────────────────────────────
  cors: {
    origins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-API-Key',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86_400, // 24 hours
  },

  // ── Server ─────────────────────────────────────────────────────────────
  server: {
    port: env.PORT,
    gracefulShutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    keepAliveTimeoutMs: 65_000,
    headersTimeoutMs: 66_000,
    requestBodyLimit: '10mb',
  },

  // ── Security ───────────────────────────────────────────────────────────
  security: {
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  },

  // ── Caching ────────────────────────────────────────────────────────────
  cache: {
    defaultTtlSeconds: 300,      // 5 minutes
    finalOutputsTtlSeconds: 600, // 10 minutes
    countryDataTtlSeconds: 3600, // 1 hour
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the application is running in production mode.
 */
export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Returns the appropriate configuration, applying production overrides when
 * running in production. In non-production environments, returns the
 * production config structure with relaxed defaults for development.
 */
export function getConfig(): ProductionConfig {
  if (isProduction()) {
    return productionConfig;
  }

  // Development / test overrides
  return {
    ...productionConfig,
    database: {
      ...productionConfig.database,
      ssl: {
        rejectUnauthorized: false,
      },
    },
    redis: {
      ...productionConfig.redis,
      tls: {
        rejectUnauthorized: false,
      },
    },
    logging: {
      ...productionConfig.logging,
      level: 'debug',
      colorize: true,
    },
    rateLimit: {
      ...productionConfig.rateLimit,
      maxRequests: 1000,
      authMaxRequests: 100,
      aiMaxRequests: 200,
      finalOutputsMaxRequests: 500,
    },
  };
}

export default productionConfig;

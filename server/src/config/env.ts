import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// ---------------------------------------------------------------------------
// Helper: coerce string → number (for env vars that arrive as strings)
// ---------------------------------------------------------------------------
const coerceNumber = (fallback: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return fallback;
      const parsed = Number(val);
      return Number.isNaN(parsed) ? fallback : parsed;
    });

// Helper: coerce string → boolean
const coerceBoolean = (fallback: boolean) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return fallback;
      if (typeof val === 'boolean') return val;
      return val === 'true' || val === '1';
    });

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const envSchema = z
  .object({
    // ── App ────────────────────────────────────────────────────────────
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: coerceNumber(3001),
    API_PREFIX: z.string().default('/api/v1'),

    // ── Database ───────────────────────────────────────────────────────
    DATABASE_URL: z.string().optional(),
    DB_POOL_MIN: coerceNumber(2),
    DB_POOL_MAX: coerceNumber(10),
    DB_IDLE_TIMEOUT: coerceNumber(30000),
    DB_SSL: coerceBoolean(false),
    DB_SSL_ENABLED: coerceBoolean(false),
    DB_SSL_CA: z.string().optional(),
    DB_SSL_KEY: z.string().optional(),
    DB_SSL_CERT: z.string().optional(),

    // ── Redis ──────────────────────────────────────────────────────────
    REDIS_URL: z.string().default('redis://localhost:6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: coerceNumber(0),
    REDIS_TLS_CA: z.string().optional(),

    // ── Auth / JWT ─────────────────────────────────────────────────────
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default('24h'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    SESSION_MAX_LIFETIME_HOURS: coerceNumber(24),

    // ── Encryption ─────────────────────────────────────────────────────
    ENCRYPTION_KEY: z.string().optional(),

    // ── Anthropic / AI ─────────────────────────────────────────────────
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_OPUS_MODEL: z.string().default('claude-opus-4-20250514'),
    ANTHROPIC_SONNET_MODEL: z.string().default('claude-sonnet-4-20250514'),

    // ── Kling AI Video ──────────────────────────────────────────────────
    KLING_API_KEY: z.string().optional(),

    // ── Password Reset ──────────────────────────────────────────────────
    PASSWORD_RESET_EXPIRY_MINUTES: coerceNumber(60),

    // ── Account Lockout ────────────────────────────────────────────────
    LOCKOUT_THRESHOLD: coerceNumber(5),
    LOCKOUT_DURATION_MINUTES: coerceNumber(15),

    // ── Rate Limiting ──────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_MS: coerceNumber(900000),
    RATE_LIMIT_MAX_REQUESTS: coerceNumber(100),

    // ── Per-User Rate Limiting ────────────────────────────────────────
    USER_RATE_LIMIT_MAX: coerceNumber(100),
    USER_RATE_LIMIT_WINDOW_SECONDS: coerceNumber(60),

    // ── Job Queue ─────────────────────────────────────────────────────
    MAX_JOB_RETRIES: coerceNumber(3),

    // ── Shutdown ─────────────────────────────────────────────────────────
    SHUTDOWN_TIMEOUT_MS: coerceNumber(30000),

    // ── Clustering ──────────────────────────────────────────────────────
    CLUSTER_ENABLED: coerceBoolean(false),
    CLUSTER_WORKERS: coerceNumber(0), // 0 = use os.cpus().length at runtime

    // ── Logging ────────────────────────────────────────────────────────
    LOG_LEVEL: z.string().default('info'),
    LOG_FORMAT: z.string().default('json'),

    // ── Database Query Logging ──────────────────────────────────────────
    SLOW_QUERY_THRESHOLD_MS: coerceNumber(100),

    // ── APM / Observability ─────────────────────────────────────────────
    SENTRY_DSN: z.string().optional(),
    APM_ENABLED: coerceBoolean(false),
    METRICS_ENABLED: coerceBoolean(true),

    // ── CORS ───────────────────────────────────────────────────────────
    // CORS_ORIGIN is the preferred single-value env var; CORS_ORIGINS
    // (comma-separated) is kept for backward compatibility.
    CORS_ORIGIN: z.string().optional(),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    // ── Google OAuth ──────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().default('/api/auth/google/callback'),

    // ── MFA ────────────────────────────────────────────────────────────
    MFA_ISSUER: z.string().default('AIGrowthEngine'),

    // ── Bandit / Contextual Bandits ─────────────────────────────────────
    BANDIT_DECAY_HALF_LIFE_DAYS: coerceNumber(30),
    BANDIT_EXPLORATION_BONUS: coerceNumber(0.1),

    // ── Derived ─────────────────────────────────────────────────────────
    AI_ENABLED: coerceBoolean(false), // Will be overridden after parse
  })
  // ── Cross-field production validations ──────────────────────────────
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is required in production',
        });
      }
      if (!data.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET is required in production',
        });
      }
      if (!data.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY is required in production',
        });
      }
      if (data.JWT_SECRET && data.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 32 characters in production',
        });
      }
      if (data.ENCRYPTION_KEY && data.ENCRYPTION_KEY.length !== 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY must be exactly 32 characters in production',
        });
      }
      if (!data.REDIS_URL || data.REDIS_URL === 'redis://localhost:6379') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL should be explicitly set in production (not localhost)',
        });
      }
      if (!data.CORS_ORIGINS || data.CORS_ORIGINS.includes('localhost')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS must be explicitly set to production domains',
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Parse & validate
// ---------------------------------------------------------------------------
type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const isDev =
      !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

    // In development / test we log warnings instead of crashing for
    // non-critical variables so local dev doesn't require every secret.
    if (isDev) {
      console.warn(
        '⚠  Environment validation warnings (non-production mode):',
      );
      for (const issue of result.error.issues) {
        console.warn(`   • ${issue.path.join('.')}: ${issue.message}`);
      }

      // Return a best-effort parse – fill in defaults where Zod couldn't
      // resolve them and let the app start.
      return envSchema.parse({
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-prod',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://localhost:5432/ai_growth_engine_dev',
        ENCRYPTION_KEY:
          process.env.ENCRYPTION_KEY ??
          'dev-encrypt-key-not-for-prod!!!!',
      });
    }

    // In production, fail hard so the service never starts misconfigured.
    console.error('❌  Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env: Env = loadEnv();

// Derive AI_ENABLED from ANTHROPIC_API_KEY presence
(env as Record<string, unknown>).AI_ENABLED = !!env.ANTHROPIC_API_KEY;
export const AI_ENABLED = !!env.ANTHROPIC_API_KEY;

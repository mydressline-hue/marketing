import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Module augmentation – attach `requestId` to every Express Request
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// ---------------------------------------------------------------------------
// 1. CORS
// ---------------------------------------------------------------------------
const corsOrigin = env.CORS_ORIGIN || env.CORS_ORIGINS;

export const corsMiddleware = cors({
  origin: corsOrigin.split(',').map((o: string) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-CSRF-Token',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400, // 24 hours – browsers cache preflight responses
});

// ---------------------------------------------------------------------------
// 2. Helmet  (core HTTP security headers)
// ---------------------------------------------------------------------------
const isDev = env.NODE_ENV === 'development';
const isProd = env.NODE_ENV === 'production';

export const helmetMiddleware = helmet({
  // ── Content-Security-Policy ────────────────────────────────────────────
  contentSecurityPolicy: isDev
    ? false
    : {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },

  // ── X-Content-Type-Options: nosniff ────────────────────────────────────
  xContentTypeOptions: true,

  // ── X-Frame-Options: DENY ──────────────────────────────────────────────
  frameguard: { action: 'deny' },

  // ── X-XSS-Protection: 0 (explicitly disabled – modern CSP supersedes) ─
  xXssProtection: false,

  // ── Referrer-Policy ────────────────────────────────────────────────────
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // ── Strict-Transport-Security (HSTS) – production only ─────────────────
  // In non-production environments we disable HSTS to avoid breaking local
  // HTTP dev servers and CI pipelines.
  strictTransportSecurity: isProd
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,

  // ── Cross-Origin policies ──────────────────────────────────────────────
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// ---------------------------------------------------------------------------
// 2b. Permissions-Policy  (not covered by Helmet out of the box)
// ---------------------------------------------------------------------------
export const permissionsPolicyMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  next();
};

// ---------------------------------------------------------------------------
// 3. Rate Limiter
// ---------------------------------------------------------------------------
export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests',
    message: 'You have exceeded the allowed number of requests. Please try again later.',
  },
});

// ---------------------------------------------------------------------------
// 4. HPP (HTTP Parameter Pollution protection)
// ---------------------------------------------------------------------------
export const hppMiddleware = hpp();

// ---------------------------------------------------------------------------
// 5. Compression
// ---------------------------------------------------------------------------
export const compressionMiddleware = compression({
  threshold: '1kb',
});

// ---------------------------------------------------------------------------
// 6. Request ID
// ---------------------------------------------------------------------------
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const existingId = req.headers['x-request-id'] as string | undefined;
  const requestId = existingId || uuidv4();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
};

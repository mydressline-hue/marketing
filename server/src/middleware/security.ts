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
export const corsMiddleware = cors({
  origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID', 'X-CSRF-Token'],
});

// ---------------------------------------------------------------------------
// 2. Helmet
// ---------------------------------------------------------------------------
const isDev = env.NODE_ENV === 'development';

export const helmetMiddleware = helmet({
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
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

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

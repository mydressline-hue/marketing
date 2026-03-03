import winston from 'winston';
import { env } from '../config/env';
import type { Request, Response, NextFunction } from 'express';
import {
  recordHttpRequest,
  recordHttpDuration,
} from '../services/observability/metrics';

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------
const SERVICE_NAME = 'ai-growth-engine';

// ---------------------------------------------------------------------------
// Custom formats
// ---------------------------------------------------------------------------

/**
 * Structured JSON format that includes timestamp, level, message, service
 * name, and any additional metadata passed via the `meta` splat.
 */
const structuredJson = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    info.service = SERVICE_NAME;
    return info;
  })(),
  winston.format.metadata({
    fillExcept: ['timestamp', 'level', 'message', 'service'],
  }),
  winston.format.json(),
);

/**
 * Pretty-printed console format for local development with colorization.
 */
const devConsole = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }),
);

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------
const isDev = env.NODE_ENV === 'development';

const consoleTransport = new winston.transports.Console({
  format: isDev ? devConsole : structuredJson,
});

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: structuredJson,
  defaultMeta: { service: SERVICE_NAME },
  transports: [consoleTransport],
});

// ---------------------------------------------------------------------------
// Child logger factory
// ---------------------------------------------------------------------------

/**
 * Creates a child logger pre-populated with the given context fields.
 * Useful for agent-specific or request-specific logging where you want every
 * log line to carry identifying metadata automatically.
 *
 * @example
 * const agentLog = createChildLogger({ agent: 'content-creator', taskId: '123' });
 * agentLog.info('Starting content generation');
 */
export function createChildLogger(
  context: Record<string, unknown>,
): winston.Logger {
  return logger.child(context);
}

/**
 * Creates a child logger bound to a specific HTTP request. Automatically
 * includes the request ID and other request context in every log line,
 * making it straightforward to correlate logs for a single request.
 *
 * @example
 * const reqLog = createRequestLogger(req);
 * reqLog.info('Processing campaign creation');
 */
export function createRequestLogger(req: Request): winston.Logger {
  return logger.child({
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl || req.url,
  });
}

// ---------------------------------------------------------------------------
// Request logger middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that logs every HTTP request with method, url, status
 * code, response time, and request ID. Also records metrics for HTTP
 * request counts and durations.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  // Capture the original end to hook into response completion
  const originalEnd = res.end;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).end = function (this: Response, ...args: any[]): any {
    const responseTime = Date.now() - start;
    const durationSeconds = responseTime / 1000;
    const path = req.originalUrl || req.url;

    // Record Prometheus metrics
    recordHttpRequest(req.method, path, res.statusCode);
    recordHttpDuration(req.method, path, durationSeconds);

    logger.info('HTTP Request', {
      requestId: req.requestId,
      method: req.method,
      url: path,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('Content-Length') || '-',
      userAgent: req.get('User-Agent') || '-',
    });

    return (originalEnd as Function).apply(res, args);
  };

  next();
}

export default logger;

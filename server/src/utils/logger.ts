import winston from 'winston';
import { env } from '../config/env';
import type { Request, Response, NextFunction } from 'express';

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
  context: Record<string, string>,
): winston.Logger {
  return logger.child(context);
}

// ---------------------------------------------------------------------------
// Request logger middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that logs every HTTP request with method, url, status
 * code, and response time in milliseconds.
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

    logger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl || req.url,
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

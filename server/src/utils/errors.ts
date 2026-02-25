/**
 * Custom error classes for the API.
 *
 * All application errors extend the base `AppError` class, which provides
 * a consistent structure for error responses including HTTP status codes,
 * machine-readable error codes, and an operational flag to distinguish
 * expected errors from programming mistakes.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Restore prototype chain (required when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture a clean stack trace, omitting the constructor frame
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// 4xx Client Errors
// ---------------------------------------------------------------------------

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
}

export class ValidationError extends AppError {
  public readonly details: FieldError[];

  constructor(message = 'Validation failed', details: FieldError[] = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// ---------------------------------------------------------------------------
// 5xx Server Errors
// ---------------------------------------------------------------------------

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message?: string) {
    super(
      message ?? `External service error: ${service}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      false,
    );
    this.service = service;
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred') {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}

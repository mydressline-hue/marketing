/**
 * Centralized Error Code Registry.
 *
 * Every machine-readable error code used across the application is defined
 * here. Keeping them in a single enum prevents typos, enables IDE
 * auto-completion, and makes it trivial to search for all usages of a
 * particular code.
 *
 * Convention:  DOMAIN_SPECIFIC_ERROR
 *   - DOMAIN   = Auth, Validation, Resource, RateLimit, External, Internal, Database
 *   - The string value is identical to the enum key for easy JSON serialisation.
 */

export enum ErrorCode {
  // ── Auth ──────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_MFA_REQUIRED = 'AUTH_MFA_REQUIRED',
  AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',

  // ── Validation ────────────────────────────────────────────────────────────
  VALIDATION_REQUIRED_FIELD = 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_DATE_RANGE = 'VALIDATION_DATE_RANGE',

  // ── Resources ─────────────────────────────────────────────────────────────
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_FORBIDDEN = 'RESOURCE_FORBIDDEN',

  // ── Rate Limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // ── External Services ─────────────────────────────────────────────────────
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_TIMEOUT = 'EXTERNAL_TIMEOUT',

  // ── Internal / Infrastructure ─────────────────────────────────────────────
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

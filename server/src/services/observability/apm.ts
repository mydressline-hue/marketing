/**
 * APM (Application Performance Monitoring) Client.
 *
 * Provides a Sentry-ready error tracking and transaction monitoring interface.
 * When SENTRY_DSN is configured and APM_ENABLED is true, this module is ready
 * to be wired into a real Sentry SDK. Until then, all methods are safe no-ops
 * that log to the application logger instead of crashing.
 *
 * Usage:
 *   import { apm } from '../services/observability/apm';
 *
 *   apm.captureException(error, { userId: '123', route: '/api/v1/campaigns' });
 *   apm.captureMessage('Fallback triggered', 'warning', { service: 'ai' });
 *
 *   const txn = apm.startTransaction('POST /api/v1/campaigns', 'http.server');
 *   // ... do work ...
 *   apm.finishTransaction(txn);
 */

import { logger } from '../../utils/logger';
import { env } from '../../config/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface ApmContext {
  /** Arbitrary key-value pairs attached to the event. */
  [key: string]: unknown;
}

export interface Transaction {
  /** Unique identifier for this transaction. */
  id: string;
  /** Human-readable transaction name (e.g. 'POST /api/v1/campaigns'). */
  name: string;
  /** Operation type (e.g. 'http.server', 'db.query', 'queue.process'). */
  op: string;
  /** High-resolution start time (ms since epoch). */
  startTime: number;
  /** Set when the transaction is finished. */
  endTime?: number;
  /** Duration in milliseconds, computed on finish. */
  durationMs?: number;
  /** Transaction status. */
  status: 'ok' | 'error' | 'cancelled';
}

// ---------------------------------------------------------------------------
// APM Client
// ---------------------------------------------------------------------------

export class ApmClient {
  private enabled: boolean;
  private dsn: string | undefined;
  private currentUser: string | undefined;
  private activeTransactions: Map<string, Transaction> = new Map();
  private transactionCounter = 0;

  constructor() {
    this.dsn = env.SENTRY_DSN;
    this.enabled = env.APM_ENABLED && !!this.dsn;

    if (this.enabled) {
      logger.info('APM client initialised', {
        dsn: this.redactDsn(this.dsn!),
      });
    } else if (env.APM_ENABLED && !this.dsn) {
      logger.warn(
        'APM_ENABLED is true but SENTRY_DSN is not set -- APM will run in no-op mode',
      );
    } else {
      logger.debug('APM client disabled (APM_ENABLED=false)');
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Whether the APM client is fully configured and active.
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Capture an exception and forward it to the APM backend.
   *
   * When not enabled, the error is logged at the `error` level so it is
   * still visible in structured logs.
   */
  captureException(error: Error, context?: ApmContext): void {
    const enrichedContext = this.enrichContext(context);

    if (this.enabled) {
      // TODO: Replace with Sentry.captureException(error, { extra: enrichedContext })
      // when @sentry/node is installed.
      logger.error('[APM] Exception captured (Sentry integration pending)', {
        error: error.message,
        stack: error.stack,
        ...enrichedContext,
      });
      return;
    }

    logger.error('[APM:no-op] Exception captured', {
      error: error.message,
      stack: error.stack,
      ...enrichedContext,
    });
  }

  /**
   * Capture an arbitrary message at the given severity level.
   */
  captureMessage(
    message: string,
    level: SeverityLevel = 'info',
    context?: ApmContext,
  ): void {
    const enrichedContext = this.enrichContext(context);

    if (this.enabled) {
      // TODO: Replace with Sentry.captureMessage(message, level)
      // when @sentry/node is installed.
      logger.log(this.severityToWinstonLevel(level), `[APM] ${message}`, enrichedContext);
      return;
    }

    logger.log(this.severityToWinstonLevel(level), `[APM:no-op] ${message}`, enrichedContext);
  }

  /**
   * Associate a user ID with subsequent APM events. Useful for tying errors
   * and transactions back to a specific user session.
   */
  setUser(userId: string | undefined): void {
    this.currentUser = userId;

    if (this.enabled) {
      // TODO: Replace with Sentry.setUser({ id: userId })
      // when @sentry/node is installed.
      logger.debug('[APM] User context set', { userId });
      return;
    }

    logger.debug('[APM:no-op] User context set', { userId });
  }

  /**
   * Start a named transaction for performance monitoring.
   *
   * Returns a Transaction handle that must be passed to `finishTransaction()`
   * when the operation completes.
   */
  startTransaction(name: string, op: string): Transaction {
    this.transactionCounter += 1;
    const id = `txn_${Date.now()}_${this.transactionCounter}`;

    const transaction: Transaction = {
      id,
      name,
      op,
      startTime: Date.now(),
      status: 'ok',
    };

    this.activeTransactions.set(id, transaction);

    if (this.enabled) {
      // TODO: Replace with Sentry.startTransaction({ name, op })
      // when @sentry/node is installed.
      logger.debug('[APM] Transaction started', { id, name, op });
    } else {
      logger.debug('[APM:no-op] Transaction started', { id, name, op });
    }

    return transaction;
  }

  /**
   * Finish a previously started transaction and record its duration.
   *
   * Optionally set the transaction status to 'error' or 'cancelled'.
   */
  finishTransaction(
    transaction: Transaction,
    status: 'ok' | 'error' | 'cancelled' = 'ok',
  ): void {
    transaction.endTime = Date.now();
    transaction.durationMs = transaction.endTime - transaction.startTime;
    transaction.status = status;

    this.activeTransactions.delete(transaction.id);

    if (this.enabled) {
      // TODO: Replace with transaction.finish() from Sentry SDK
      // when @sentry/node is installed.
      logger.debug('[APM] Transaction finished', {
        id: transaction.id,
        name: transaction.name,
        op: transaction.op,
        durationMs: transaction.durationMs,
        status,
      });
    } else {
      logger.debug('[APM:no-op] Transaction finished', {
        id: transaction.id,
        name: transaction.name,
        op: transaction.op,
        durationMs: transaction.durationMs,
        status,
      });
    }
  }

  /**
   * Returns the number of currently active (unfinished) transactions.
   * Useful for health checks and debugging.
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Enrich context with the current user ID if one has been set.
   */
  private enrichContext(context?: ApmContext): ApmContext {
    const enriched: ApmContext = { ...context };
    if (this.currentUser) {
      enriched.userId = this.currentUser;
    }
    return enriched;
  }

  /**
   * Redact the DSN so it can be logged safely (hide the secret portion).
   */
  private redactDsn(dsn: string): string {
    try {
      const url = new URL(dsn);
      if (url.password) {
        url.password = '***';
      }
      // Sentry DSNs encode the public key as the username
      // Keep first 4 chars, redact the rest
      if (url.username && url.username.length > 4) {
        url.username = url.username.slice(0, 4) + '***';
      }
      return url.toString();
    } catch {
      return '***redacted***';
    }
  }

  /**
   * Map APM severity levels to winston log levels.
   */
  private severityToWinstonLevel(level: SeverityLevel): string {
    switch (level) {
      case 'fatal':
        return 'error';
      case 'error':
        return 'error';
      case 'warning':
        return 'warn';
      case 'info':
        return 'info';
      case 'debug':
        return 'debug';
      default:
        return 'info';
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const apm = new ApmClient();

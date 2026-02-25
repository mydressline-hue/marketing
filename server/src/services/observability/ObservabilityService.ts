/**
 * Observability Service.
 *
 * Provides distributed tracing, error aggregation, confidence drift tracking,
 * log retention management, and health checking for the AI Growth Engine.
 *
 * Traces are stored in Redis for fast access (1-hour TTL) and persisted to
 * the database for durability. Dashboards and reports leverage short-lived
 * caches to reduce load while keeping data reasonably fresh.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceSpan {
  id: string;
  trace_id: string;
  parent_span_id?: string;
  operation: string;
  service: string;
  agent_type?: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  status: 'ok' | 'error';
  metadata: Record<string, unknown>;
}

export interface TraceContext {
  trace_id: string;
  spans: TraceSpan[];
  total_duration_ms: number;
  root_operation: string;
  status: 'ok' | 'partial_error' | 'error';
}

export interface ErrorAggregate {
  error_type: string;
  count: number;
  first_seen: string;
  last_seen: string;
  sample_message: string;
  affected_services: string[];
}

export interface ConfidenceDrift {
  agent_type: string;
  period: string;
  average_confidence: number;
  min_confidence: number;
  max_confidence: number;
  trend: 'improving' | 'declining' | 'stable';
  sample_count: number;
}

export interface LogRetentionPolicy {
  log_type: string;
  retention_days: number;
  archive_after_days?: number;
  is_active: boolean;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number;
  details?: Record<string, unknown>;
  checked_at: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  uptime_seconds: number;
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACE_REDIS_TTL = 3600; // 1 hour
const SPAN_REDIS_TTL = 3600; // 1 hour
const ERROR_DASHBOARD_CACHE_KEY = 'observability:error_dashboard';
const ERROR_DASHBOARD_CACHE_TTL = 120; // 2 minutes
const CONFIDENCE_DRIFT_CACHE_KEY = 'observability:confidence_drift_report';
const CONFIDENCE_DRIFT_CACHE_TTL = 1800; // 30 minutes
const LOG_RETENTION_CACHE_KEY = 'observability:log_retention_policies';
const LOG_RETENTION_CACHE_TTL = 300; // 5 minutes

const SERVICE_START_TIME = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function traceRedisKey(traceId: string): string {
  return `observability:trace:${traceId}`;
}

function spanRedisKey(spanId: string): string {
  return `observability:span:${spanId}`;
}

function computeTraceStatus(spans: TraceSpan[]): 'ok' | 'partial_error' | 'error' {
  const errorCount = spans.filter((s) => s.status === 'error').length;
  if (errorCount === 0) return 'ok';
  if (errorCount === spans.length) return 'error';
  return 'partial_error';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ObservabilityService {
  // -----------------------------------------------------------------------
  // Distributed Tracing
  // -----------------------------------------------------------------------

  /**
   * Start a new distributed trace. Creates a root span and persists both
   * to Redis (fast access, 1-hour TTL) and the database (durability).
   */
  static async startTrace(
    operation: string,
    service: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ trace_id: string; span_id: string }> {
    const traceId = generateId();
    const spanId = generateId();
    const now = new Date().toISOString();

    const rootSpan: TraceSpan = {
      id: spanId,
      trace_id: traceId,
      operation,
      service,
      start_time: now,
      status: 'ok',
      metadata,
    };

    // Persist to Redis for fast access
    await redis.set(
      traceRedisKey(traceId),
      JSON.stringify({ trace_id: traceId, spans: [rootSpan], created_at: now }),
      'EX',
      TRACE_REDIS_TTL,
    );
    await redis.set(
      spanRedisKey(spanId),
      JSON.stringify(rootSpan),
      'EX',
      SPAN_REDIS_TTL,
    );

    // Persist to DB for durability
    await pool.query(
      `INSERT INTO trace_spans
         (id, trace_id, parent_span_id, operation, service, agent_type, start_time, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        spanId,
        traceId,
        null,
        operation,
        service,
        metadata.agent_type || null,
        now,
        'ok',
        JSON.stringify(metadata),
      ],
    );

    logger.info('Trace started', { traceId, spanId, operation, service });

    return { trace_id: traceId, span_id: spanId };
  }

  /**
   * Add a child span to an existing trace.
   */
  static async startSpan(
    traceId: string,
    parentSpanId: string,
    operation: string,
    service: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ span_id: string }> {
    const spanId = generateId();
    const now = new Date().toISOString();

    const span: TraceSpan = {
      id: spanId,
      trace_id: traceId,
      parent_span_id: parentSpanId,
      operation,
      service,
      start_time: now,
      status: 'ok',
      metadata,
    };

    // Update trace in Redis
    const traceData = await redis.get(traceRedisKey(traceId));
    if (traceData) {
      const trace = JSON.parse(traceData);
      trace.spans.push(span);
      await redis.set(
        traceRedisKey(traceId),
        JSON.stringify(trace),
        'EX',
        TRACE_REDIS_TTL,
      );
    }

    // Store span in Redis
    await redis.set(
      spanRedisKey(spanId),
      JSON.stringify(span),
      'EX',
      SPAN_REDIS_TTL,
    );

    // Persist to DB
    await pool.query(
      `INSERT INTO trace_spans
         (id, trace_id, parent_span_id, operation, service, agent_type, start_time, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        spanId,
        traceId,
        parentSpanId,
        operation,
        service,
        metadata.agent_type || null,
        now,
        'ok',
        JSON.stringify(metadata),
      ],
    );

    logger.debug('Span started', { traceId, spanId, parentSpanId, operation });

    return { span_id: spanId };
  }

  /**
   * End a span, recording duration and final status.
   */
  static async endSpan(
    spanId: string,
    status: 'ok' | 'error',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const now = new Date().toISOString();

    // Retrieve span from Redis
    const spanData = await redis.get(spanRedisKey(spanId));
    if (spanData) {
      const span: TraceSpan = JSON.parse(spanData);
      const startTime = new Date(span.start_time).getTime();
      const endTime = new Date(now).getTime();
      const durationMs = endTime - startTime;

      span.end_time = now;
      span.duration_ms = durationMs;
      span.status = status;
      span.metadata = { ...span.metadata, ...metadata };

      // Update span in Redis
      await redis.set(
        spanRedisKey(spanId),
        JSON.stringify(span),
        'EX',
        SPAN_REDIS_TTL,
      );

      // Update span in trace
      const traceData = await redis.get(traceRedisKey(span.trace_id));
      if (traceData) {
        const trace = JSON.parse(traceData);
        const spanIndex = trace.spans.findIndex((s: TraceSpan) => s.id === spanId);
        if (spanIndex >= 0) {
          trace.spans[spanIndex] = span;
          await redis.set(
            traceRedisKey(span.trace_id),
            JSON.stringify(trace),
            'EX',
            TRACE_REDIS_TTL,
          );
        }
      }

      // Update DB
      await pool.query(
        `UPDATE trace_spans
         SET end_time = $1, duration_ms = $2, status = $3, metadata = $4
         WHERE id = $5`,
        [now, durationMs, status, JSON.stringify(span.metadata), spanId],
      );

      logger.debug('Span ended', { spanId, status, durationMs });
    } else {
      // Fallback: update DB directly if span not in Redis
      await pool.query(
        `UPDATE trace_spans
         SET end_time = $1, status = $2, metadata = metadata || $3::jsonb
         WHERE id = $4`,
        [now, status, JSON.stringify(metadata), spanId],
      );

      logger.warn('Span ended (Redis miss, DB-only update)', { spanId, status });
    }
  }

  /**
   * Retrieve a full trace with all spans. Cache-first (Redis), fallback to DB.
   */
  static async getTrace(traceId: string): Promise<TraceContext | null> {
    // Try Redis first
    const traceData = await redis.get(traceRedisKey(traceId));
    if (traceData) {
      const trace = JSON.parse(traceData);
      const spans: TraceSpan[] = trace.spans;

      const completedSpans = spans.filter((s) => s.duration_ms !== undefined);
      const totalDuration = completedSpans.length > 0
        ? Math.max(...completedSpans.map((s) => s.duration_ms!))
        : 0;

      const rootSpan = spans.find((s) => !s.parent_span_id);

      return {
        trace_id: traceId,
        spans,
        total_duration_ms: totalDuration,
        root_operation: rootSpan?.operation || 'unknown',
        status: computeTraceStatus(spans),
      };
    }

    // Fallback to DB
    const result = await pool.query(
      `SELECT id, trace_id, parent_span_id, operation, service, agent_type,
              start_time, end_time, duration_ms, status, metadata
       FROM trace_spans
       WHERE trace_id = $1
       ORDER BY start_time ASC`,
      [traceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const spans: TraceSpan[] = result.rows.map((row) => ({
      id: row.id,
      trace_id: row.trace_id,
      parent_span_id: row.parent_span_id || undefined,
      operation: row.operation,
      service: row.service,
      agent_type: row.agent_type || undefined,
      start_time: row.start_time,
      end_time: row.end_time || undefined,
      duration_ms: row.duration_ms != null ? Number(row.duration_ms) : undefined,
      status: row.status,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    }));

    const completedSpans = spans.filter((s) => s.duration_ms !== undefined);
    const totalDuration = completedSpans.length > 0
      ? Math.max(...completedSpans.map((s) => s.duration_ms!))
      : 0;

    const rootSpan = spans.find((s) => !s.parent_span_id);

    return {
      trace_id: traceId,
      spans,
      total_duration_ms: totalDuration,
      root_operation: rootSpan?.operation || 'unknown',
      status: computeTraceStatus(spans),
    };
  }

  // -----------------------------------------------------------------------
  // Error Aggregation
  // -----------------------------------------------------------------------

  /**
   * Aggregate errors from audit_logs by type over the given time window.
   */
  static async aggregateErrors(timeWindowHours: number): Promise<ErrorAggregate[]> {
    const result = await pool.query(
      `SELECT
         details->>'error_type' AS error_type,
         COUNT(*) AS count,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen,
         (array_agg(details->>'message' ORDER BY created_at DESC))[1] AS sample_message,
         array_agg(DISTINCT resource_type) AS affected_services
       FROM audit_logs
       WHERE action LIKE '%error%'
         AND created_at >= NOW() - INTERVAL '1 hour' * $1
       GROUP BY details->>'error_type'
       ORDER BY count DESC`,
      [timeWindowHours],
    );

    return result.rows.map((row) => ({
      error_type: row.error_type || 'unknown',
      count: parseInt(row.count as string, 10),
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      sample_message: row.sample_message || '',
      affected_services: row.affected_services || [],
    }));
  }

  /**
   * Get error aggregation for last 24h, 1h, and 15min windows. Cached for 2 minutes.
   */
  static async getErrorDashboard(): Promise<{
    last_24h: ErrorAggregate[];
    last_1h: ErrorAggregate[];
    last_15min: ErrorAggregate[];
  }> {
    const cached = await cacheGet<{
      last_24h: ErrorAggregate[];
      last_1h: ErrorAggregate[];
      last_15min: ErrorAggregate[];
    }>(ERROR_DASHBOARD_CACHE_KEY);

    if (cached) {
      return cached;
    }

    const [last24h, last1h, last15min] = await Promise.all([
      ObservabilityService.aggregateErrors(24),
      ObservabilityService.aggregateErrors(1),
      ObservabilityService.aggregateErrors(0.25),
    ]);

    const dashboard = {
      last_24h: last24h,
      last_1h: last1h,
      last_15min: last15min,
    };

    await cacheSet(ERROR_DASHBOARD_CACHE_KEY, dashboard, ERROR_DASHBOARD_CACHE_TTL);

    logger.debug('Error dashboard cached');

    return dashboard;
  }

  // -----------------------------------------------------------------------
  // Confidence Drift
  // -----------------------------------------------------------------------

  /**
   * Query agent_decisions for an agent type over a period, compute
   * average/min/max confidence and trend direction.
   */
  static async trackConfidenceDrift(
    agentType: string,
    period: string,
  ): Promise<ConfidenceDrift> {
    const result = await pool.query(
      `SELECT
         AVG(confidence_score) AS avg_confidence,
         MIN(confidence_score) AS min_confidence,
         MAX(confidence_score) AS max_confidence,
         COUNT(*) AS sample_count
       FROM agent_decisions
       WHERE agent_type = $1
         AND created_at >= NOW() - INTERVAL '1 day' * $2`,
      [agentType, parseInt(period, 10)],
    );

    const row = result.rows[0];
    const avgConfidence = row.avg_confidence != null ? parseFloat(row.avg_confidence) : 0;
    const minConfidence = row.min_confidence != null ? parseFloat(row.min_confidence) : 0;
    const maxConfidence = row.max_confidence != null ? parseFloat(row.max_confidence) : 0;
    const sampleCount = parseInt(row.sample_count as string, 10);

    // Determine trend by comparing first-half and second-half averages
    const trendResult = await pool.query(
      `SELECT
         AVG(CASE WHEN created_at < NOW() - INTERVAL '1 day' * $2 / 2 THEN confidence_score END) AS first_half_avg,
         AVG(CASE WHEN created_at >= NOW() - INTERVAL '1 day' * $2 / 2 THEN confidence_score END) AS second_half_avg
       FROM agent_decisions
       WHERE agent_type = $1
         AND created_at >= NOW() - INTERVAL '1 day' * $2`,
      [agentType, parseInt(period, 10)],
    );

    const firstHalf = trendResult.rows[0].first_half_avg != null
      ? parseFloat(trendResult.rows[0].first_half_avg)
      : null;
    const secondHalf = trendResult.rows[0].second_half_avg != null
      ? parseFloat(trendResult.rows[0].second_half_avg)
      : null;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (firstHalf !== null && secondHalf !== null) {
      const diff = secondHalf - firstHalf;
      if (diff > 0.02) {
        trend = 'improving';
      } else if (diff < -0.02) {
        trend = 'declining';
      }
    }

    return {
      agent_type: agentType,
      period,
      average_confidence: avgConfidence,
      min_confidence: minConfidence,
      max_confidence: maxConfidence,
      trend,
      sample_count: sampleCount,
    };
  }

  /**
   * Get confidence drift for all agent types over last 7 days. Cached for 30 minutes.
   */
  static async getConfidenceDriftReport(): Promise<ConfidenceDrift[]> {
    const cached = await cacheGet<ConfidenceDrift[]>(CONFIDENCE_DRIFT_CACHE_KEY);

    if (cached) {
      return cached;
    }

    // Get all distinct agent types with recent decisions
    const agentTypesResult = await pool.query(
      `SELECT DISTINCT agent_type
       FROM agent_decisions
       WHERE created_at >= NOW() - INTERVAL '7 days'
       ORDER BY agent_type`,
    );

    const drifts: ConfidenceDrift[] = [];
    for (const row of agentTypesResult.rows) {
      const drift = await ObservabilityService.trackConfidenceDrift(
        row.agent_type,
        '7',
      );
      drifts.push(drift);
    }

    await cacheSet(CONFIDENCE_DRIFT_CACHE_KEY, drifts, CONFIDENCE_DRIFT_CACHE_TTL);

    logger.debug('Confidence drift report cached', { agentCount: drifts.length });

    return drifts;
  }

  // -----------------------------------------------------------------------
  // Log Retention
  // -----------------------------------------------------------------------

  /**
   * Set or update a log retention policy for a given log type.
   */
  static async configureLogRetention(
    policy: LogRetentionPolicy,
  ): Promise<LogRetentionPolicy> {
    await pool.query(
      `INSERT INTO log_retention_policies
         (log_type, retention_days, archive_after_days, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (log_type) DO UPDATE SET
         retention_days = $2,
         archive_after_days = $3,
         is_active = $4,
         updated_at = NOW()`,
      [
        policy.log_type,
        policy.retention_days,
        policy.archive_after_days || null,
        policy.is_active,
      ],
    );

    await cacheDel(LOG_RETENTION_CACHE_KEY);

    logger.info('Log retention policy configured', {
      logType: policy.log_type,
      retentionDays: policy.retention_days,
    });

    return policy;
  }

  /**
   * Delete logs older than their retention period. Returns count of deleted records
   * per log type.
   */
  static async enforceLogRetention(): Promise<Record<string, number>> {
    const policies = await ObservabilityService.getLogRetentionPolicies();
    const deletedCounts: Record<string, number> = {};

    for (const policy of policies) {
      if (!policy.is_active) continue;

      const tableName = policy.log_type;

      try {
        const result = await pool.query(
          `DELETE FROM ${tableName}
           WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
          [policy.retention_days],
        );

        deletedCounts[tableName] = result.rowCount ?? 0;

        logger.info('Log retention enforced', {
          logType: tableName,
          deleted: deletedCounts[tableName],
          retentionDays: policy.retention_days,
        });
      } catch (error) {
        logger.error('Failed to enforce log retention', {
          logType: tableName,
          error: error instanceof Error ? error.message : String(error),
        });
        deletedCounts[tableName] = 0;
      }
    }

    return deletedCounts;
  }

  /**
   * Get all configured retention policies. Cached for 5 minutes.
   */
  static async getLogRetentionPolicies(): Promise<LogRetentionPolicy[]> {
    const cached = await cacheGet<LogRetentionPolicy[]>(LOG_RETENTION_CACHE_KEY);

    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT log_type, retention_days, archive_after_days, is_active
       FROM log_retention_policies
       ORDER BY log_type`,
    );

    const policies: LogRetentionPolicy[] = result.rows.map((row) => ({
      log_type: row.log_type,
      retention_days: Number(row.retention_days),
      archive_after_days: row.archive_after_days != null ? Number(row.archive_after_days) : undefined,
      is_active: row.is_active,
    }));

    await cacheSet(LOG_RETENTION_CACHE_KEY, policies, LOG_RETENTION_CACHE_TTL);

    return policies;
  }

  // -----------------------------------------------------------------------
  // Health Checks
  // -----------------------------------------------------------------------

  /**
   * Check health of all system components: database (ping), Redis (ping),
   * API (self-check). Returns SystemHealth with per-service breakdown.
   * Health checks must not throw -- they return degraded/unhealthy status instead.
   */
  static async healthCheck(): Promise<SystemHealth> {
    const checkedAt = new Date().toISOString();
    const services: HealthCheckResult[] = [];

    // Database health check
    const dbResult = await ObservabilityService.checkDatabase();
    services.push(dbResult);

    // Redis health check
    const redisResult = await ObservabilityService.checkRedis();
    services.push(redisResult);

    // API self-check
    const apiResult: HealthCheckResult = {
      service: 'api',
      status: 'healthy',
      latency_ms: 0,
      checked_at: checkedAt,
    };
    services.push(apiResult);

    // Compute overall status
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;
    const degradedCount = services.filter((s) => s.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const uptimeSeconds = Math.floor((Date.now() - SERVICE_START_TIME) / 1000);

    return {
      overall,
      services,
      uptime_seconds: uptimeSeconds,
      checked_at: checkedAt,
    };
  }

  /**
   * Extended health check including: DB connection pool stats, Redis memory usage,
   * agent states, and kill switch status.
   */
  static async getDetailedHealthCheck(): Promise<SystemHealth & {
    database_pool: Record<string, unknown>;
    redis_info: Record<string, unknown>;
    agent_states: Record<string, unknown>[];
    kill_switch_active: boolean;
  }> {
    const baseHealth = await ObservabilityService.healthCheck();

    // DB connection pool stats
    let databasePool: Record<string, unknown> = {};
    try {
      databasePool = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
    } catch {
      databasePool = { error: 'Unable to retrieve pool stats' };
    }

    // Redis memory usage
    let redisInfo: Record<string, unknown> = {};
    try {
      const info = await redis.info('memory');
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemoryHumanMatch = info.match(/used_memory_human:(.+)/);
      redisInfo = {
        used_memory: usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : null,
        used_memory_human: usedMemoryHumanMatch ? usedMemoryHumanMatch[1].trim() : null,
      };
    } catch {
      redisInfo = { error: 'Unable to retrieve Redis info' };
    }

    // Agent states
    let agentStates: Record<string, unknown>[] = [];
    try {
      const agentResult = await pool.query(
        `SELECT agent_type, status, last_run_at, error_message
         FROM agent_states
         ORDER BY agent_type`,
      );
      agentStates = agentResult.rows;
    } catch {
      agentStates = [];
    }

    // Kill switch status
    let killSwitchActive = false;
    try {
      const ksResult = await pool.query(
        `SELECT COUNT(*) AS active_count
         FROM kill_switch_state
         WHERE is_active = TRUE`,
      );
      killSwitchActive = parseInt(ksResult.rows[0].active_count as string, 10) > 0;
    } catch {
      killSwitchActive = false;
    }

    return {
      ...baseHealth,
      database_pool: databasePool,
      redis_info: redisInfo,
      agent_states: agentStates,
      kill_switch_active: killSwitchActive,
    };
  }

  // -----------------------------------------------------------------------
  // Private health check helpers
  // -----------------------------------------------------------------------

  private static async checkDatabase(): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const start = Date.now();

    try {
      await pool.query('SELECT 1');
      const latency = Date.now() - start;

      return {
        service: 'database',
        status: latency > 1000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        checked_at: checkedAt,
      };
    } catch (error) {
      const latency = Date.now() - start;

      return {
        service: 'database',
        status: 'unhealthy',
        latency_ms: latency,
        details: { error: error instanceof Error ? error.message : String(error) },
        checked_at: checkedAt,
      };
    }
  }

  private static async checkRedis(): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const start = Date.now();

    try {
      await redis.ping();
      const latency = Date.now() - start;

      return {
        service: 'redis',
        status: latency > 1000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        checked_at: checkedAt,
      };
    } catch (error) {
      const latency = Date.now() - start;

      return {
        service: 'redis',
        status: 'unhealthy',
        latency_ms: latency,
        details: { error: error instanceof Error ? error.message : String(error) },
        checked_at: checkedAt,
      };
    }
  }
}

/**
 * Health Check Service.
 *
 * Provides comprehensive health checking capabilities for the AI Growth
 * Engine, including basic status, deep infrastructure checks (PostgreSQL,
 * Redis, integrations, memory, disk), Kubernetes-style readiness and
 * liveness probes, and historical health snapshots stored in Redis.
 */

import { pool } from '../../config/database';
import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_HISTORY_PREFIX = 'health:history:';
const HEALTH_HISTORY_TTL = 86400; // 24 hours in seconds
const APP_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface BasicHealthResult {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

export interface PostgresCheck {
  status: 'up' | 'down';
  latency_ms: number;
  pool: {
    total: number;
    idle: number;
    waiting: number;
  };
  error?: string;
}

export interface RedisCheck {
  status: 'up' | 'down';
  latency_ms: number;
  memory_used: string;
  connected_clients: number;
  error?: string;
}

export interface IntegrationPlatform {
  platform_type: string;
  status: string;
  last_sync: string | null;
  error_count_24h: number;
}

export interface IntegrationsCheck {
  total_configured: number;
  healthy: number;
  degraded: number;
  disconnected: number;
  platforms: IntegrationPlatform[];
}

export interface MemoryCheck {
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
  external_mb: number;
}

export interface DiskCheck {
  status: 'ok' | 'warning' | 'critical';
}

export interface AgentSystemCheck {
  status: 'operational' | 'degraded' | 'down';
  total_agents: number;
  active_agents: number;
  last_decision_at: string | null;
  decisions_24h: number;
  avg_confidence: number;
  error?: string;
}

export interface FinalOutputsCheck {
  status: 'ready' | 'partial' | 'unavailable';
  deliverables_available: number;
  total_deliverables: number;
  last_generated_at: string | null;
  avg_confidence: number;
  error?: string;
}

export interface DeepHealthChecks {
  postgresql: PostgresCheck;
  redis: RedisCheck;
  integrations: IntegrationsCheck;
  agents: AgentSystemCheck;
  final_outputs: FinalOutputsCheck;
  memory: MemoryCheck;
  disk: DiskCheck;
}

export interface DeepHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: DeepHealthChecks;
}

export interface ReadinessResult {
  ready: boolean;
  checks: {
    postgresql: boolean;
    redis: boolean;
  };
}

export interface LivenessResult {
  alive: true;
  pid: number;
  uptime: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

/**
 * Parse a value from Redis INFO output. Lines are formatted as
 * `key:value\r\n`.
 */
function parseRedisInfoValue(info: string, key: string): string {
  const match = info.match(new RegExp(`^${key}:(.+)$`, 'm'));
  return match ? match[1].trim() : '0';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HealthCheckService {
  // -----------------------------------------------------------------------
  // Basic Health
  // -----------------------------------------------------------------------

  /**
   * Return a lightweight health status suitable for load-balancer pings.
   */
  static checkBasic(): BasicHealthResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION,
      environment: env.NODE_ENV,
    };
  }

  // -----------------------------------------------------------------------
  // Deep Health
  // -----------------------------------------------------------------------

  /**
   * Run comprehensive health checks against all subsystems and return a
   * detailed status report. The result is also stored in Redis for
   * historical tracking.
   */
  static async checkDeep(): Promise<DeepHealthResult> {
    const [
      postgresCheck,
      redisCheck,
      integrationsCheck,
      agentsCheck,
      finalOutputsCheck,
      memoryCheck,
      diskCheck,
    ] = await Promise.all([
      HealthCheckService.checkPostgres(),
      HealthCheckService.checkRedis(),
      HealthCheckService.checkIntegrations(),
      HealthCheckService.checkAgentSystem(),
      HealthCheckService.checkFinalOutputs(),
      HealthCheckService.checkMemory(),
      HealthCheckService.checkDisk(),
    ]);

    // Determine overall status
    const criticalDown =
      postgresCheck.status === 'down' || redisCheck.status === 'down';
    const anyDegraded =
      integrationsCheck.degraded > 0 ||
      integrationsCheck.disconnected > 0 ||
      diskCheck.status === 'warning' ||
      agentsCheck.status === 'degraded' ||
      finalOutputsCheck.status === 'partial';
    const diskCritical = diskCheck.status === 'critical';
    const agentsDown = agentsCheck.status === 'down';
    const outputsUnavailable = finalOutputsCheck.status === 'unavailable';

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalDown || diskCritical) {
      status = 'unhealthy';
    } else if (anyDegraded || agentsDown || outputsUnavailable) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: DeepHealthResult = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION,
      checks: {
        postgresql: postgresCheck,
        redis: redisCheck,
        integrations: integrationsCheck,
        agents: agentsCheck,
        final_outputs: finalOutputsCheck,
        memory: memoryCheck,
        disk: diskCheck,
      },
    };

    // Store snapshot in Redis for historical tracking (fire-and-forget)
    HealthCheckService.storeHealthSnapshot(result).catch((err) => {
      logger.warn('Failed to store health snapshot in Redis', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return result;
  }

  // -----------------------------------------------------------------------
  // Readiness Probe
  // -----------------------------------------------------------------------

  /**
   * Kubernetes-style readiness probe. Returns whether the service can
   * accept traffic by verifying PostgreSQL and Redis connectivity.
   */
  static async checkReadiness(): Promise<ReadinessResult> {
    let pgReady = false;
    let redisReady = false;

    try {
      await pool.query('SELECT 1');
      pgReady = true;
    } catch {
      // PostgreSQL is not ready
    }

    try {
      const pong = await redis.ping();
      redisReady = pong === 'PONG';
    } catch {
      // Redis is not ready
    }

    return {
      ready: pgReady && redisReady,
      checks: {
        postgresql: pgReady,
        redis: redisReady,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Liveness Probe
  // -----------------------------------------------------------------------

  /**
   * Kubernetes-style liveness probe. Simply confirms the process is alive.
   */
  static checkLiveness(): LivenessResult {
    return {
      alive: true,
      pid: process.pid,
      uptime: process.uptime(),
    };
  }

  // -----------------------------------------------------------------------
  // Historical Health
  // -----------------------------------------------------------------------

  /**
   * Retrieve historical health snapshots from Redis. Defaults to the last
   * 24 hours if no hours parameter is provided.
   */
  static async getHistoricalHealth(hours: number = 24): Promise<DeepHealthResult[]> {
    const results: DeepHealthResult[] = [];

    try {
      const cutoff = Date.now() - hours * 60 * 60 * 1000;

      // Scan for health history keys
      let cursor = '0';
      const matchingKeys: string[] = [];

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          `${HEALTH_HISTORY_PREFIX}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        for (const key of keys) {
          // Extract timestamp from key: health:history:{timestamp}
          const timestampStr = key.replace(HEALTH_HISTORY_PREFIX, '');
          const timestamp = parseInt(timestampStr, 10);

          if (timestamp >= cutoff) {
            matchingKeys.push(key);
          }
        }
      } while (cursor !== '0');

      if (matchingKeys.length === 0) {
        return results;
      }

      // Sort keys by timestamp descending
      matchingKeys.sort((a, b) => {
        const tsA = parseInt(a.replace(HEALTH_HISTORY_PREFIX, ''), 10);
        const tsB = parseInt(b.replace(HEALTH_HISTORY_PREFIX, ''), 10);
        return tsB - tsA;
      });

      // Fetch all matching snapshots
      const pipeline = redis.pipeline();
      for (const key of matchingKeys) {
        pipeline.get(key);
      }
      const pipelineResults = await pipeline.exec();

      if (pipelineResults) {
        for (const [err, value] of pipelineResults) {
          if (!err && value && typeof value === 'string') {
            try {
              results.push(JSON.parse(value) as DeepHealthResult);
            } catch {
              // Skip malformed entries
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to retrieve historical health data', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Private: Individual Check Methods
  // -----------------------------------------------------------------------

  /**
   * Check PostgreSQL connectivity and pool statistics.
   */
  private static async checkPostgres(): Promise<PostgresCheck> {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const latency = Date.now() - start;

      return {
        status: 'up',
        latency_ms: latency,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
      };
    } catch (err) {
      logger.error('PostgreSQL health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        status: 'down',
        latency_ms: -1,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check Redis connectivity, latency, memory usage, and client count.
   */
  private static async checkRedis(): Promise<RedisCheck> {
    try {
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;

      // Gather memory and client info
      const [memoryInfo, clientsInfo] = await Promise.all([
        redis.info('memory'),
        redis.info('clients'),
      ]);

      const memoryUsed = parseRedisInfoValue(memoryInfo, 'used_memory_human');
      const connectedClients = parseInt(
        parseRedisInfoValue(clientsInfo, 'connected_clients'),
        10,
      );

      return {
        status: 'up',
        latency_ms: latency,
        memory_used: memoryUsed,
        connected_clients: isNaN(connectedClients) ? 0 : connectedClients,
      };
    } catch (err) {
      logger.error('Redis health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        status: 'down',
        latency_ms: -1,
        memory_used: 'unknown',
        connected_clients: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check the status of configured platform, CRM, and analytics
   * integrations. Counts healthy, degraded, and disconnected connections.
   */
  private static async checkIntegrations(): Promise<IntegrationsCheck> {
    try {
      // Query all active connections across the three connection tables
      const connectionQuery = `
        SELECT platform_type, status, last_sync_at, 'platform' AS source
        FROM platform_connections
        WHERE is_active = true

        UNION ALL

        SELECT platform_type, status, last_sync_at, 'crm' AS source
        FROM crm_connections
        WHERE is_active = true

        UNION ALL

        SELECT platform_type, status, last_sync_at, 'analytics' AS source
        FROM analytics_connections
        WHERE is_active = true
      `;

      const connectionsResult = await pool.query(connectionQuery);
      const connections = connectionsResult.rows;

      // Query sync error counts in the last 24 hours
      let errorCounts: Record<string, number> = {};
      try {
        const errorQuery = `
          SELECT platform_type, COUNT(*) AS error_count
          FROM sync_logs
          WHERE status = 'error'
            AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY platform_type
        `;
        const errorResult = await pool.query(errorQuery);
        for (const row of errorResult.rows) {
          errorCounts[row.platform_type as string] = parseInt(
            row.error_count as string,
            10,
          );
        }
      } catch {
        // sync_logs table may not exist; proceed with zero error counts
        logger.debug('sync_logs query failed; proceeding with zero error counts');
      }

      const platforms: IntegrationPlatform[] = connections.map(
        (row: Record<string, unknown>) => ({
          platform_type: row.platform_type as string,
          status: row.status as string,
          last_sync: (row.last_sync_at as string) || null,
          error_count_24h: errorCounts[row.platform_type as string] || 0,
        }),
      );

      let healthy = 0;
      let degraded = 0;
      let disconnected = 0;

      for (const platform of platforms) {
        switch (platform.status) {
          case 'connected':
          case 'active':
            healthy++;
            break;
          case 'degraded':
          case 'rate_limited':
            degraded++;
            break;
          case 'disconnected':
          case 'error':
          case 'expired':
            disconnected++;
            break;
          default:
            degraded++;
            break;
        }
      }

      return {
        total_configured: platforms.length,
        healthy,
        degraded,
        disconnected,
        platforms,
      };
    } catch (err) {
      logger.warn('Integration health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        total_configured: 0,
        healthy: 0,
        degraded: 0,
        disconnected: 0,
        platforms: [],
      };
    }
  }

  /**
   * Check Node.js process memory usage.
   */
  private static async checkMemory(): Promise<MemoryCheck> {
    const mem = process.memoryUsage();

    return {
      rss_mb: bytesToMb(mem.rss),
      heap_used_mb: bytesToMb(mem.heapUsed),
      heap_total_mb: bytesToMb(mem.heapTotal),
      external_mb: bytesToMb(mem.external),
    };
  }

  /**
   * Check disk space status. Uses the root filesystem as a proxy.
   * Returns 'ok' for < 80% usage, 'warning' for 80-95%, 'critical'
   * for >= 95%.
   */
  private static async checkDisk(): Promise<DiskCheck> {
    try {
      const stats = fs.statfsSync('/');
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      const usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;

      if (usedPercent >= 95) {
        return { status: 'critical' };
      }
      if (usedPercent >= 80) {
        return { status: 'warning' };
      }
      return { status: 'ok' };
    } catch {
      // If we cannot determine disk status, report OK to avoid false alarms
      return { status: 'ok' };
    }
  }

  // -----------------------------------------------------------------------
  // Private: Agent System Check
  // -----------------------------------------------------------------------

  /**
   * Check the status of the AI agent system by verifying agent_decisions
   * table accessibility and recent activity.
   */
  private static async checkAgentSystem(): Promise<AgentSystemCheck> {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT agent_type) AS total_agents,
          COUNT(DISTINCT agent_type) FILTER (
            WHERE created_at >= NOW() - INTERVAL '24 hours'
          ) AS active_agents,
          MAX(created_at) AS last_decision_at,
          COUNT(*) FILTER (
            WHERE created_at >= NOW() - INTERVAL '24 hours'
          ) AS decisions_24h,
          AVG(confidence_score) AS avg_confidence
        FROM agent_decisions
      `);

      const row = result.rows[0] || {};
      const totalAgents = Number(row.total_agents) || 0;
      const activeAgents = Number(row.active_agents) || 0;
      const avgConfidence = Number(Number(row.avg_confidence || 0).toFixed(2));

      let status: 'operational' | 'degraded' | 'down';
      if (totalAgents === 0) {
        status = 'down';
      } else if (activeAgents < totalAgents || avgConfidence < 50) {
        status = 'degraded';
      } else {
        status = 'operational';
      }

      return {
        status,
        total_agents: totalAgents,
        active_agents: activeAgents,
        last_decision_at: row.last_decision_at
          ? new Date(row.last_decision_at).toISOString()
          : null,
        decisions_24h: Number(row.decisions_24h) || 0,
        avg_confidence: avgConfidence,
      };
    } catch (err) {
      logger.warn('Agent system health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        status: 'down',
        total_agents: 0,
        active_agents: 0,
        last_decision_at: null,
        decisions_24h: 0,
        avg_confidence: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private: Final Outputs Check
  // -----------------------------------------------------------------------

  /**
   * Check whether the system can generate final output deliverables by
   * verifying that agent decisions exist for the expected deliverable types.
   */
  private static async checkFinalOutputs(): Promise<FinalOutputsCheck> {
    const expectedDeliverables = [
      'country_strategy',
      'channel_allocation',
      'budget_model',
      'risk_assessment',
      'roi_projection',
      'execution_roadmap',
    ];

    try {
      const result = await pool.query(`
        SELECT agent_type,
               COUNT(*) AS cnt,
               MAX(created_at) AS last_at,
               AVG(confidence_score) AS avg_conf
        FROM agent_decisions
        WHERE agent_type = ANY($1)
        GROUP BY agent_type
      `, [expectedDeliverables]);

      const available = result.rows.length;
      const total = expectedDeliverables.length;

      let lastGenerated: string | null = null;
      let totalAvgConf = 0;

      for (const row of result.rows) {
        const ts = row.last_at ? new Date(row.last_at).toISOString() : null;
        if (ts && (!lastGenerated || ts > lastGenerated)) {
          lastGenerated = ts;
        }
        totalAvgConf += Number(row.avg_conf || 0);
      }

      const avgConfidence = available > 0
        ? Number((totalAvgConf / available).toFixed(2))
        : 0;

      let status: 'ready' | 'partial' | 'unavailable';
      if (available === total && avgConfidence >= 60) {
        status = 'ready';
      } else if (available > 0) {
        status = 'partial';
      } else {
        status = 'unavailable';
      }

      return {
        status,
        deliverables_available: available,
        total_deliverables: total,
        last_generated_at: lastGenerated,
        avg_confidence: avgConfidence,
      };
    } catch (err) {
      logger.warn('Final outputs health check failed', {
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        status: 'unavailable',
        deliverables_available: 0,
        total_deliverables: expectedDeliverables.length,
        last_generated_at: null,
        avg_confidence: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private: History Storage
  // -----------------------------------------------------------------------

  /**
   * Store a deep health check result in Redis for historical tracking.
   * Keys are namespaced with timestamp for efficient range queries.
   */
  private static async storeHealthSnapshot(
    result: DeepHealthResult,
  ): Promise<void> {
    const key = `${HEALTH_HISTORY_PREFIX}${Date.now()}`;
    await redis.set(key, JSON.stringify(result), 'EX', HEALTH_HISTORY_TTL);
  }
}

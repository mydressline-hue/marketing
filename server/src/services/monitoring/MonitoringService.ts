/**
 * Monitoring & Alerting Service.
 *
 * Provides real-time spend monitoring, metric anomaly detection, alerting
 * with multi-channel dispatch, escalation rule evaluation, and a consolidated
 * monitoring dashboard. All alert actions are audit-logged for traceability.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpendAnomaly {
  campaign_id: string;
  campaign_name: string;
  expected_spend: number;
  actual_spend: number;
  deviation_percent: number;
  severity: 'warning' | 'critical';
}

export interface SpendMonitorResult {
  total_spend_today: number;
  budget_remaining: number;
  spend_velocity: number;
  projected_daily_spend: number;
  anomalies: SpendAnomaly[];
  checked_at: string;
}

export interface MetricAnomaly {
  metric: string;
  campaign_id?: string;
  country_id?: string;
  expected_value: number;
  actual_value: number;
  deviation_percent: number;
  severity: 'warning' | 'critical';
  detected_at: string;
}

export interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  channels: AlertChannel[];
  is_enabled: boolean;
  cooldown_minutes: number;
}

export type AlertChannel = 'email' | 'slack' | 'webhook';

export interface Alert {
  id: string;
  config_id: string;
  metric: string;
  current_value: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  channels_notified: AlertChannel[];
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
}

export interface EscalationRule {
  id: string;
  name: string;
  condition: string;
  alert_count: number;
  time_window_minutes: number;
  escalation_action: string;
  is_enabled: boolean;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface AlertFilters {
  severity?: string;
  metric?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Cache keys and TTL
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'monitoring';
const CACHE_TTL = 30; // seconds
const DASHBOARD_CACHE_KEY = `${CACHE_PREFIX}:dashboard`;
const SPEND_CACHE_KEY = `${CACHE_PREFIX}:spend`;

// ---------------------------------------------------------------------------
// Thresholds (configuration-driven)
// ---------------------------------------------------------------------------

const SPEND_ANOMALY_THRESHOLD_PERCENT = 200;
const CTR_DEVIATION_THRESHOLD_PERCENT = 30;
const CPC_DEVIATION_THRESHOLD_PERCENT = 50;
const CONVERSION_DROP_THRESHOLD_PERCENT = 40;
const CRITICAL_DEVIATION_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MonitoringService {
  /**
   * Real-time spend monitoring.
   *
   * Queries all active campaigns for today's spend versus budget. Calculates
   * spend velocity (spend per hour elapsed today), projects total daily spend,
   * and flags anomalies where actual spend exceeds the expected baseline by
   * more than the configured threshold (default 200%).
   */
  static async monitorSpend(): Promise<SpendMonitorResult> {
    const cached = await cacheGet<SpendMonitorResult>(SPEND_CACHE_KEY);
    if (cached) {
      logger.debug('Spend monitor cache hit');
      return cached;
    }

    // Get today's total spend and budget across active campaigns
    const summaryResult = await pool.query(
      `SELECT
         COALESCE(SUM(c.spent), 0) AS total_spend_today,
         COALESCE(SUM(c.budget), 0) AS total_budget
       FROM campaigns c
       WHERE c.status = 'active'
         AND c.start_date <= CURRENT_DATE
         AND c.end_date >= CURRENT_DATE`
    );

    const totalSpendToday = parseFloat(summaryResult.rows[0].total_spend_today);
    const totalBudget = parseFloat(summaryResult.rows[0].total_budget);
    const budgetRemaining = totalBudget - totalSpendToday;

    // Calculate spend velocity (spend per hour based on hours elapsed today)
    const now = new Date();
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    const effectiveHours = Math.max(hoursElapsed, 1);
    const spendVelocity = totalSpendToday / effectiveHours;

    // Project daily spend (24-hour projection)
    const projectedDailySpend = spendVelocity * 24;

    // Detect per-campaign anomalies by comparing actual spend to expected
    // baseline (budget / number of days in campaign period)
    const campaignResult = await pool.query(
      `SELECT
         c.id AS campaign_id,
         c.name AS campaign_name,
         c.spent AS actual_spend,
         c.budget,
         GREATEST(
           EXTRACT(DAY FROM (c.end_date::timestamp - c.start_date::timestamp)),
           1
         ) AS campaign_days
       FROM campaigns c
       WHERE c.status = 'active'
         AND c.start_date <= CURRENT_DATE
         AND c.end_date >= CURRENT_DATE`
    );

    const anomalies: SpendAnomaly[] = [];

    for (const row of campaignResult.rows) {
      const expectedDailySpend = parseFloat(row.budget) / parseFloat(row.campaign_days);
      const actualSpend = parseFloat(row.actual_spend);
      const deviationPercent =
        expectedDailySpend > 0
          ? ((actualSpend - expectedDailySpend) / expectedDailySpend) * 100
          : 0;

      if (deviationPercent > SPEND_ANOMALY_THRESHOLD_PERCENT) {
        const severity: 'warning' | 'critical' =
          deviationPercent > SPEND_ANOMALY_THRESHOLD_PERCENT * CRITICAL_DEVIATION_MULTIPLIER
            ? 'critical'
            : 'warning';

        anomalies.push({
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          expected_spend: expectedDailySpend,
          actual_spend: actualSpend,
          deviation_percent: Math.round(deviationPercent * 100) / 100,
          severity,
        });
      }
    }

    const result: SpendMonitorResult = {
      total_spend_today: totalSpendToday,
      budget_remaining: budgetRemaining,
      spend_velocity: Math.round(spendVelocity * 100) / 100,
      projected_daily_spend: Math.round(projectedDailySpend * 100) / 100,
      anomalies,
      checked_at: now.toISOString(),
    };

    await cacheSet(SPEND_CACHE_KEY, result, CACHE_TTL);
    logger.info('Spend monitoring completed', {
      totalSpendToday,
      anomalyCount: anomalies.length,
    });

    return result;
  }

  /**
   * Detect CTR (click-through rate) anomalies.
   *
   * Compares each active campaign's current CTR against its 7-day average.
   * Flags campaigns whose CTR deviates by more than the configured threshold
   * (default 30%).
   */
  static async detectCTRAnomaly(): Promise<MetricAnomaly[]> {
    const result = await pool.query(
      `SELECT
         c.id AS campaign_id,
         c.country_id,
         CASE WHEN c.impressions > 0
           THEN (c.clicks::numeric / c.impressions) * 100
           ELSE 0
         END AS current_ctr,
         COALESCE(hist.avg_ctr, 0) AS avg_ctr
       FROM campaigns c
       LEFT JOIN (
         SELECT
           campaign_id,
           AVG(CASE WHEN impressions > 0 THEN (clicks::numeric / impressions) * 100 ELSE 0 END) AS avg_ctr
         FROM campaign_metrics_history
         WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY campaign_id
       ) hist ON hist.campaign_id = c.id
       WHERE c.status = 'active'`
    );

    const anomalies: MetricAnomaly[] = [];
    const now = new Date().toISOString();

    for (const row of result.rows) {
      const currentCTR = parseFloat(row.current_ctr);
      const avgCTR = parseFloat(row.avg_ctr);

      if (avgCTR === 0) continue;

      const deviationPercent = Math.abs(((currentCTR - avgCTR) / avgCTR) * 100);

      if (deviationPercent > CTR_DEVIATION_THRESHOLD_PERCENT) {
        const severity: 'warning' | 'critical' =
          deviationPercent > CTR_DEVIATION_THRESHOLD_PERCENT * CRITICAL_DEVIATION_MULTIPLIER
            ? 'critical'
            : 'warning';

        anomalies.push({
          metric: 'ctr',
          campaign_id: row.campaign_id,
          country_id: row.country_id,
          expected_value: Math.round(avgCTR * 100) / 100,
          actual_value: Math.round(currentCTR * 100) / 100,
          deviation_percent: Math.round(deviationPercent * 100) / 100,
          severity,
          detected_at: now,
        });
      }
    }

    logger.info('CTR anomaly detection completed', {
      anomalyCount: anomalies.length,
    });

    return anomalies;
  }

  /**
   * Detect CPC (cost per click) anomalies.
   *
   * Compares each active campaign's current CPC against its 7-day average.
   * Flags campaigns whose CPC exceeds the baseline by more than the configured
   * threshold (default 150%, i.e. 50% above baseline).
   */
  static async detectCPCAnomaly(): Promise<MetricAnomaly[]> {
    const result = await pool.query(
      `SELECT
         c.id AS campaign_id,
         c.country_id,
         CASE WHEN c.clicks > 0
           THEN c.spent::numeric / c.clicks
           ELSE 0
         END AS current_cpc,
         COALESCE(hist.avg_cpc, 0) AS avg_cpc
       FROM campaigns c
       LEFT JOIN (
         SELECT
           campaign_id,
           AVG(CASE WHEN clicks > 0 THEN spent::numeric / clicks ELSE 0 END) AS avg_cpc
         FROM campaign_metrics_history
         WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY campaign_id
       ) hist ON hist.campaign_id = c.id
       WHERE c.status = 'active'`
    );

    const anomalies: MetricAnomaly[] = [];
    const now = new Date().toISOString();

    for (const row of result.rows) {
      const currentCPC = parseFloat(row.current_cpc);
      const avgCPC = parseFloat(row.avg_cpc);

      if (avgCPC === 0) continue;

      const deviationPercent = ((currentCPC - avgCPC) / avgCPC) * 100;

      if (deviationPercent > CPC_DEVIATION_THRESHOLD_PERCENT) {
        const severity: 'warning' | 'critical' =
          deviationPercent > CPC_DEVIATION_THRESHOLD_PERCENT * CRITICAL_DEVIATION_MULTIPLIER
            ? 'critical'
            : 'warning';

        anomalies.push({
          metric: 'cpc',
          campaign_id: row.campaign_id,
          country_id: row.country_id,
          expected_value: Math.round(avgCPC * 100) / 100,
          actual_value: Math.round(currentCPC * 100) / 100,
          deviation_percent: Math.round(deviationPercent * 100) / 100,
          severity,
          detected_at: now,
        });
      }
    }

    logger.info('CPC anomaly detection completed', {
      anomalyCount: anomalies.length,
    });

    return anomalies;
  }

  /**
   * Detect conversion rate anomalies.
   *
   * Compares each active campaign's current conversion rate against its 7-day
   * average. Flags sudden drops exceeding the configured threshold (default 40%).
   */
  static async detectConversionAnomaly(): Promise<MetricAnomaly[]> {
    const result = await pool.query(
      `SELECT
         c.id AS campaign_id,
         c.country_id,
         CASE WHEN c.clicks > 0
           THEN (c.conversions::numeric / c.clicks) * 100
           ELSE 0
         END AS current_conv_rate,
         COALESCE(hist.avg_conv_rate, 0) AS avg_conv_rate
       FROM campaigns c
       LEFT JOIN (
         SELECT
           campaign_id,
           AVG(CASE WHEN clicks > 0 THEN (conversions::numeric / clicks) * 100 ELSE 0 END) AS avg_conv_rate
         FROM campaign_metrics_history
         WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY campaign_id
       ) hist ON hist.campaign_id = c.id
       WHERE c.status = 'active'`
    );

    const anomalies: MetricAnomaly[] = [];
    const now = new Date().toISOString();

    for (const row of result.rows) {
      const currentRate = parseFloat(row.current_conv_rate);
      const avgRate = parseFloat(row.avg_conv_rate);

      if (avgRate === 0) continue;

      // Only flag drops (negative deviation)
      const dropPercent = ((avgRate - currentRate) / avgRate) * 100;

      if (dropPercent > CONVERSION_DROP_THRESHOLD_PERCENT) {
        const severity: 'warning' | 'critical' =
          dropPercent > CONVERSION_DROP_THRESHOLD_PERCENT * CRITICAL_DEVIATION_MULTIPLIER
            ? 'critical'
            : 'warning';

        anomalies.push({
          metric: 'conversion_rate',
          campaign_id: row.campaign_id,
          country_id: row.country_id,
          expected_value: Math.round(avgRate * 100) / 100,
          actual_value: Math.round(currentRate * 100) / 100,
          deviation_percent: Math.round(dropPercent * 100) / 100,
          severity,
          detected_at: now,
        });
      }
    }

    logger.info('Conversion anomaly detection completed', {
      anomalyCount: anomalies.length,
    });

    return anomalies;
  }

  /**
   * Create and persist a new alert, then dispatch it to the configured channels.
   */
  static async createAlert(
    alert: Omit<Alert, 'id' | 'created_at' | 'channels_notified' | 'acknowledged'>,
  ): Promise<Alert> {
    const id = generateId();
    const createdAt = new Date().toISOString();

    const newAlert: Alert = {
      ...alert,
      id,
      channels_notified: [],
      acknowledged: false,
      created_at: createdAt,
    };

    await pool.query(
      `INSERT INTO monitoring_alerts
         (id, config_id, metric, current_value, threshold, severity, message,
          channels_notified, acknowledged, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newAlert.id,
        newAlert.config_id,
        newAlert.metric,
        newAlert.current_value,
        newAlert.threshold,
        newAlert.severity,
        newAlert.message,
        JSON.stringify(newAlert.channels_notified),
        newAlert.acknowledged,
        newAlert.created_at,
      ],
    );

    // Look up the alert config to determine channels
    const configResult = await pool.query(
      `SELECT channels FROM alert_configs WHERE id = $1 AND is_enabled = true`,
      [alert.config_id],
    );

    if (configResult.rows.length > 0) {
      const channels: AlertChannel[] =
        typeof configResult.rows[0].channels === 'string'
          ? JSON.parse(configResult.rows[0].channels)
          : configResult.rows[0].channels;

      await MonitoringService.dispatchAlert(newAlert, channels);
      newAlert.channels_notified = channels;

      // Update the record with dispatched channels
      await pool.query(
        `UPDATE monitoring_alerts SET channels_notified = $1 WHERE id = $2`,
        [JSON.stringify(channels), newAlert.id],
      );
    }

    await AuditService.log({
      action: 'alert.created',
      resourceType: 'monitoring_alert',
      resourceId: newAlert.id,
      details: {
        metric: newAlert.metric,
        severity: newAlert.severity,
        message: newAlert.message,
      },
    });

    // Invalidate dashboard cache
    await cacheDel(DASHBOARD_CACHE_KEY);

    logger.info('Alert created', { alertId: newAlert.id, severity: newAlert.severity });

    return newAlert;
  }

  /**
   * Dispatch an alert via the specified channels.
   *
   * - email: Logs the email notification (actual SMTP not required).
   * - slack: Logs a simulated HTTP POST to a Slack webhook endpoint.
   * - webhook: Logs a simulated HTTP POST to a generic webhook endpoint.
   *
   * All dispatches are recorded in the audit log.
   */
  static async dispatchAlert(alert: Alert, channels: AlertChannel[]): Promise<void> {
    for (const channel of channels) {
      switch (channel) {
        case 'email':
          logger.info('Dispatching alert via email', {
            alertId: alert.id,
            severity: alert.severity,
            metric: alert.metric,
            message: alert.message,
          });
          break;

        case 'slack':
          logger.info('Dispatching alert via Slack webhook', {
            alertId: alert.id,
            severity: alert.severity,
            payload: {
              text: `[${alert.severity.toUpperCase()}] ${alert.metric}: ${alert.message}`,
              channel: '#monitoring-alerts',
            },
          });
          break;

        case 'webhook':
          logger.info('Dispatching alert via webhook', {
            alertId: alert.id,
            severity: alert.severity,
            payload: {
              alert_id: alert.id,
              metric: alert.metric,
              current_value: alert.current_value,
              threshold: alert.threshold,
              severity: alert.severity,
              message: alert.message,
              created_at: alert.created_at,
            },
          });
          break;
      }

      await AuditService.log({
        action: 'alert.dispatched',
        resourceType: 'monitoring_alert',
        resourceId: alert.id,
        details: {
          channel,
          severity: alert.severity,
          metric: alert.metric,
        },
      });
    }
  }

  /**
   * Mark an alert as acknowledged by a specific user.
   */
  static async acknowledgeAlert(alertId: string, userId: string): Promise<Alert> {
    const acknowledgedAt = new Date().toISOString();

    const result = await pool.query(
      `UPDATE monitoring_alerts
       SET acknowledged = true, acknowledged_by = $1, acknowledged_at = $2
       WHERE id = $3
       RETURNING *`,
      [userId, acknowledgedAt, alertId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Alert not found: ${alertId}`);
    }

    const alert = MonitoringService.mapAlertRow(result.rows[0]);

    await AuditService.log({
      userId,
      action: 'alert.acknowledged',
      resourceType: 'monitoring_alert',
      resourceId: alertId,
      details: { acknowledgedAt },
    });

    await cacheDel(DASHBOARD_CACHE_KEY);

    logger.info('Alert acknowledged', { alertId, userId });

    return alert;
  }

  /**
   * Get unacknowledged (active) alerts with optional filtering and pagination.
   */
  static async getActiveAlerts(
    filters: AlertFilters = {},
  ): Promise<{ data: Alert[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['acknowledged = false'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.metric) {
      conditions.push(`metric = $${paramIndex++}`);
      params.push(filters.metric);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM monitoring_alerts ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT id, config_id, metric, current_value, threshold, severity, message, channels_notified, acknowledged, acknowledged_by, acknowledged_at, created_at FROM monitoring_alerts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data = dataResult.rows.map(MonitoringService.mapAlertRow);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all alerts (both acknowledged and unacknowledged) with pagination and
   * optional filters.
   */
  static async getAlertHistory(
    filters: AlertFilters = {},
  ): Promise<{ data: Alert[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(100, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.metric) {
      conditions.push(`metric = $${paramIndex++}`);
      params.push(filters.metric);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM monitoring_alerts ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT id, config_id, metric, current_value, threshold, severity, message, channels_notified, acknowledged, acknowledged_by, acknowledged_at, created_at FROM monitoring_alerts ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data = dataResult.rows.map(MonitoringService.mapAlertRow);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create or update an alert configuration.
   *
   * If a config with the given `id` already exists, it is updated; otherwise
   * a new configuration is created.
   */
  static async configureAlert(config: AlertConfig): Promise<AlertConfig> {
    if (!config.name || !config.metric) {
      throw new ValidationError('Alert config must include name and metric');
    }

    const existing = await pool.query(
      `SELECT id FROM alert_configs WHERE id = $1`,
      [config.id],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE alert_configs
         SET name = $1, metric = $2, condition = $3, threshold = $4,
             channels = $5, is_enabled = $6, cooldown_minutes = $7,
             updated_at = NOW()
         WHERE id = $8`,
        [
          config.name,
          config.metric,
          config.condition,
          config.threshold,
          JSON.stringify(config.channels),
          config.is_enabled,
          config.cooldown_minutes,
          config.id,
        ],
      );

      await AuditService.log({
        action: 'alert_config.updated',
        resourceType: 'alert_config',
        resourceId: config.id,
        details: { name: config.name, metric: config.metric },
      });

      logger.info('Alert config updated', { configId: config.id });
    } else {
      await pool.query(
        `INSERT INTO alert_configs
           (id, name, metric, condition, threshold, channels, is_enabled,
            cooldown_minutes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          config.id,
          config.name,
          config.metric,
          config.condition,
          config.threshold,
          JSON.stringify(config.channels),
          config.is_enabled,
          config.cooldown_minutes,
        ],
      );

      await AuditService.log({
        action: 'alert_config.created',
        resourceType: 'alert_config',
        resourceId: config.id,
        details: { name: config.name, metric: config.metric },
      });

      logger.info('Alert config created', { configId: config.id });
    }

    return config;
  }

  /**
   * Evaluate all enabled escalation rules.
   *
   * Checks whether the number of critical alerts within each rule's time
   * window exceeds its threshold. If so, creates an escalation alert and
   * logs the event.
   */
  static async evaluateEscalationRules(): Promise<Alert[]> {
    const rulesResult = await pool.query(
      `SELECT id, name, condition, alert_count, time_window_minutes, escalation_action, is_enabled FROM escalation_rules WHERE is_enabled = true`
    );

    const escalatedAlerts: Alert[] = [];

    for (const rule of rulesResult.rows as EscalationRule[]) {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS alert_count
         FROM monitoring_alerts
         WHERE severity = $1
           AND created_at >= NOW() - ($2 || ' minutes')::interval
           AND acknowledged = false`,
        [rule.condition, rule.time_window_minutes],
      );

      const alertCount = parseInt(countResult.rows[0].alert_count, 10);

      if (alertCount >= rule.alert_count) {
        const escalationAlert = await MonitoringService.createAlert({
          config_id: rule.id,
          metric: 'escalation',
          current_value: alertCount,
          threshold: rule.alert_count,
          severity: 'critical',
          message: `Escalation rule "${rule.name}" triggered: ${alertCount} ${rule.condition} alerts in ${rule.time_window_minutes} minutes. Action: ${rule.escalation_action}`,
        });

        escalatedAlerts.push(escalationAlert);

        await AuditService.log({
          action: 'escalation.triggered',
          resourceType: 'escalation_rule',
          resourceId: rule.id,
          details: {
            ruleName: rule.name,
            alertCount,
            timeWindowMinutes: rule.time_window_minutes,
            escalationAction: rule.escalation_action,
          },
        });

        logger.warn('Escalation rule triggered', {
          ruleId: rule.id,
          ruleName: rule.name,
          alertCount,
        });
      }
    }

    return escalatedAlerts;
  }

  /**
   * Aggregate monitoring data into a consolidated dashboard view.
   *
   * Returns current spend summary, active alert counts, recent anomaly
   * counts, and system health status. Results are cached briefly to reduce
   * database load.
   */
  static async getMonitoringDashboard(): Promise<{
    spend: SpendMonitorResult;
    active_alerts_count: number;
    anomaly_counts: {
      ctr: number;
      cpc: number;
      conversion_rate: number;
      spend: number;
    };
    system_health: 'healthy' | 'degraded' | 'critical';
    generated_at: string;
  }> {
    const cached = await cacheGet<{
      spend: SpendMonitorResult;
      active_alerts_count: number;
      anomaly_counts: {
        ctr: number;
        cpc: number;
        conversion_rate: number;
        spend: number;
      };
      system_health: 'healthy' | 'degraded' | 'critical';
      generated_at: string;
    }>(DASHBOARD_CACHE_KEY);

    if (cached) {
      logger.debug('Dashboard cache hit');
      return cached;
    }

    // Gather all monitoring data
    const spend = await MonitoringService.monitorSpend();

    const activeAlertsResult = await pool.query(
      `SELECT COUNT(*) AS count FROM monitoring_alerts WHERE acknowledged = false`
    );
    const activeAlertsCount = parseInt(activeAlertsResult.rows[0].count, 10);

    // Count recent anomalies by type (last 24 hours)
    const anomalyCountsResult = await pool.query(
      `SELECT metric, COUNT(*) AS count
       FROM monitoring_anomalies
       WHERE detected_at >= NOW() - INTERVAL '24 hours'
       GROUP BY metric`
    );

    const anomalyCounts = {
      ctr: 0,
      cpc: 0,
      conversion_rate: 0,
      spend: 0,
    };

    for (const row of anomalyCountsResult.rows) {
      const metric = row.metric as keyof typeof anomalyCounts;
      if (metric in anomalyCounts) {
        anomalyCounts[metric] = parseInt(row.count, 10);
      }
    }

    // Determine system health based on active alerts and anomalies
    const criticalAlertsResult = await pool.query(
      `SELECT COUNT(*) AS count FROM monitoring_alerts
       WHERE acknowledged = false AND severity = 'critical'`
    );
    const criticalCount = parseInt(criticalAlertsResult.rows[0].count, 10);

    let systemHealth: 'healthy' | 'degraded' | 'critical';
    if (criticalCount > 0) {
      systemHealth = 'critical';
    } else if (activeAlertsCount > 0) {
      systemHealth = 'degraded';
    } else {
      systemHealth = 'healthy';
    }

    const dashboard = {
      spend,
      active_alerts_count: activeAlertsCount,
      anomaly_counts: anomalyCounts,
      system_health: systemHealth,
      generated_at: new Date().toISOString(),
    };

    await cacheSet(DASHBOARD_CACHE_KEY, dashboard, CACHE_TTL);
    logger.info('Monitoring dashboard generated', { systemHealth, activeAlertsCount });

    return dashboard;
  }

  /**
   * Resolve an alert with a resolution note.
   *
   * Sets the alert as acknowledged and records the resolution details.
   */
  static async resolveAlert(
    alertId: string,
    userId: string,
    resolution: string,
  ): Promise<Alert> {
    const resolvedAt = new Date().toISOString();

    const result = await pool.query(
      `UPDATE monitoring_alerts
       SET acknowledged = true,
           acknowledged_by = $1,
           acknowledged_at = $2,
           resolution = $3
       WHERE id = $4
       RETURNING *`,
      [userId, resolvedAt, resolution, alertId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Alert not found: ${alertId}`);
    }

    const alert = MonitoringService.mapAlertRow(result.rows[0]);

    await AuditService.log({
      userId,
      action: 'alert.resolved',
      resourceType: 'monitoring_alert',
      resourceId: alertId,
      details: { resolution, resolvedAt },
    });

    await cacheDel(DASHBOARD_CACHE_KEY);

    logger.info('Alert resolved', { alertId, userId, resolution });

    return alert;
  }

  // -------------------------------------------------------------------------
  // Convenience aliases (used by the infrastructure controller)
  // -------------------------------------------------------------------------

  /**
   * Alias for monitorSpend -- used by the infrastructure controller layer.
   */
  static async getSpendMonitoring(...args: Parameters<typeof MonitoringService.monitorSpend>) {
    return MonitoringService.monitorSpend(...args);
  }

  /**
   * Alias for getActiveAlerts -- used by the infrastructure controller layer.
   */
  static async getAlerts(...args: Parameters<typeof MonitoringService.getActiveAlerts>) {
    return MonitoringService.getActiveAlerts(...args);
  }

  /**
   * High-level anomaly aggregation -- used by the infrastructure controller layer.
   */
  static async getAnomalies() {
    const [ctr, cpc, conversion] = await Promise.all([
      MonitoringService.detectCTRAnomaly(),
      MonitoringService.detectCPCAnomaly(),
      MonitoringService.detectConversionAnomaly(),
    ]);
    return [...ctr, ...cpc, ...conversion];
  }

  /**
   * Alias for configureAlert -- used by the infrastructure controller layer.
   */
  static async updateAlertConfig(...args: Parameters<typeof MonitoringService.configureAlert>) {
    return MonitoringService.configureAlert(...args);
  }

  /**
   * Alias for getMonitoringDashboard -- used by the infrastructure controller layer.
   */
  static async getDashboard() {
    return MonitoringService.getMonitoringDashboard();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Map a database row to an Alert object.
   */
  private static mapAlertRow(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      config_id: row.config_id as string,
      metric: row.metric as string,
      current_value: parseFloat(row.current_value as string),
      threshold: parseFloat(row.threshold as string),
      severity: row.severity as Alert['severity'],
      message: row.message as string,
      channels_notified:
        typeof row.channels_notified === 'string'
          ? JSON.parse(row.channels_notified)
          : (row.channels_notified as AlertChannel[]) ?? [],
      acknowledged: row.acknowledged as boolean,
      acknowledged_by: row.acknowledged_by as string | undefined,
      acknowledged_at: row.acknowledged_at as string | undefined,
      created_at: row.created_at as string,
    };
  }
}

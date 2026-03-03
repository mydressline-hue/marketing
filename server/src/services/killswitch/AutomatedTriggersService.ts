/**
 * Automated Triggers Service.
 *
 * Evaluates configurable trigger conditions (ROAS drops, spend anomalies,
 * conversion failures, CPC spikes, API error storms, and fraud alerts)
 * and activates the kill switch when thresholds are breached. Each trigger
 * respects a cooldown period to prevent duplicate activations, and every
 * evaluation is logged to an auditable event history.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { createChildLogger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import type { TriggerType, HaltLevel } from '../../types/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerConfig {
  type: TriggerType;
  threshold: number;
  is_enabled: boolean;
  cooldown_minutes: number;
  kill_switch_level: HaltLevel;
}

export interface TriggerEvaluation {
  type: TriggerType;
  fired: boolean;
  current_value: number;
  threshold: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface TriggerEvent {
  id: string;
  type: TriggerType;
  fired: boolean;
  current_value: number;
  threshold: number;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface TriggerHistoryFilters {
  type?: TriggerType;
  startDate?: string;
  endDate?: string;
  fired?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedTriggerEvents {
  data: TriggerEvent[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_TRIGGER_CONFIGS = 'killswitch:trigger_configs';
const CACHE_TTL_SECONDS = 300; // 5 minutes

const triggerLog = createChildLogger({ service: 'automated-triggers' });

const DEFAULT_TRIGGER_CONFIGS: TriggerConfig[] = [
  { type: 'roas_drop', threshold: 1.0, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 2 as HaltLevel },
  { type: 'spend_anomaly', threshold: 2.0, is_enabled: true, cooldown_minutes: 15, kill_switch_level: 3 as HaltLevel },
  { type: 'conversion_failure', threshold: 0, is_enabled: true, cooldown_minutes: 60, kill_switch_level: 2 as HaltLevel },
  { type: 'cpc_spike', threshold: 1.5, is_enabled: true, cooldown_minutes: 30, kill_switch_level: 1 as HaltLevel },
  { type: 'api_error_storm', threshold: 50, is_enabled: true, cooldown_minutes: 5, kill_switch_level: 3 as HaltLevel },
  { type: 'fraud_alert', threshold: 90, is_enabled: true, cooldown_minutes: 10, kill_switch_level: 3 as HaltLevel },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AutomatedTriggersService {
  // -----------------------------------------------------------------------
  // evaluateAllTriggers
  // -----------------------------------------------------------------------

  /**
   * Runs every enabled trigger and returns an array of evaluations that
   * fired. When at least one trigger fires the kill switch is activated
   * at the highest severity level among the fired triggers.
   */
  static async evaluateAllTriggers(): Promise<TriggerEvaluation[]> {
    triggerLog.info('Starting evaluation of all automated triggers');

    const configs = await AutomatedTriggersService.getTriggerConfigurations();
    const enabledConfigs = configs.filter((c) => c.is_enabled);

    const evaluators: Record<TriggerType, () => Promise<TriggerEvaluation>> = {
      manual: async () => ({ type: 'manual', fired: false, current_value: 0, threshold: 0, timestamp: new Date().toISOString() }),
      roas_drop: () => AutomatedTriggersService.evaluateROASTrigger(),
      spend_anomaly: () => AutomatedTriggersService.evaluateSpendAnomalyTrigger(),
      conversion_failure: () => AutomatedTriggersService.evaluateConversionFailureTrigger(),
      cpc_spike: () => AutomatedTriggersService.evaluateCPCSpikeTrigger(),
      api_error_storm: () => AutomatedTriggersService.evaluateAPIErrorStormTrigger(),
      fraud_alert: () => AutomatedTriggersService.evaluateFraudAlertTrigger(),
    };

    const results: TriggerEvaluation[] = [];

    for (const config of enabledConfigs) {
      const evaluator = evaluators[config.type];
      if (!evaluator || config.type === 'manual') continue;

      try {
        const evaluation = await evaluator();
        results.push(evaluation);
      } catch (error) {
        triggerLog.error(`Error evaluating trigger ${config.type}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({
          type: config.type,
          fired: false,
          current_value: 0,
          threshold: config.threshold,
          timestamp: new Date().toISOString(),
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    const firedTriggers = results.filter((r) => r.fired);

    if (firedTriggers.length > 0) {
      const maxLevel = Math.max(
        ...firedTriggers.map((t) => {
          const cfg = configs.find((c) => c.type === t.type);
          return cfg ? cfg.kill_switch_level : 1;
        }),
      ) as HaltLevel;

      triggerLog.warn('Kill switch activation triggered', {
        firedCount: firedTriggers.length,
        types: firedTriggers.map((t) => t.type),
        level: maxLevel,
      });

      await AutomatedTriggersService.activateKillSwitch(maxLevel, firedTriggers);
    }

    triggerLog.info('Trigger evaluation complete', {
      total: results.length,
      fired: firedTriggers.length,
    });

    return firedTriggers;
  }

  // -----------------------------------------------------------------------
  // evaluateROASTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks if the average ROAS across all active campaigns over the last
   * 24 hours has dropped below the configured threshold (default: 1.0).
   */
  static async evaluateROASTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('roas_drop');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'roas_drop', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    const result = await pool.query(
      `SELECT COALESCE(AVG(
        CASE WHEN spent > 0 THEN (COALESCE(revenue, 0)::numeric / spent::numeric) ELSE 0 END
      ), 0) AS avg_roas
       FROM campaigns
       WHERE status = 'active'
         AND updated_at >= NOW() - INTERVAL '24 hours'`,
    );

    const avgRoas = parseFloat(result.rows[0]?.avg_roas ?? '0');
    const fired = avgRoas < config.threshold && avgRoas >= 0;

    await AutomatedTriggersService.registerTriggerEvent('roas_drop', avgRoas, config.threshold, fired);

    if (fired) {
      triggerLog.warn('ROAS drop trigger fired', { avgRoas, threshold: config.threshold });
    }

    return {
      type: 'roas_drop',
      fired,
      current_value: avgRoas,
      threshold: config.threshold,
      timestamp,
      details: { avg_roas_24h: avgRoas },
    };
  }

  // -----------------------------------------------------------------------
  // evaluateSpendAnomalyTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks if current daily spend exceeds the configured multiplier
   * (default: 200%) of the 30-day rolling average daily spend.
   */
  static async evaluateSpendAnomalyTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('spend_anomaly');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'spend_anomaly', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    // 30-day rolling average daily spend
    const baselineResult = await pool.query(
      `SELECT COALESCE(AVG(daily_spend), 0) AS avg_daily_spend
       FROM (
         SELECT DATE(created_at) AS spend_date, SUM(amount) AS daily_spend
         FROM spend_records
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
       ) AS daily_totals`,
    );

    // Current day spend
    const todayResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS today_spend
       FROM spend_records
       WHERE DATE(created_at) = CURRENT_DATE`,
    );

    const baseline = parseFloat(baselineResult.rows[0]?.avg_daily_spend ?? '0');
    const todaySpend = parseFloat(todayResult.rows[0]?.today_spend ?? '0');

    const ratio = baseline > 0 ? todaySpend / baseline : 0;
    const fired = baseline > 0 && ratio > config.threshold;

    await AutomatedTriggersService.registerTriggerEvent('spend_anomaly', ratio, config.threshold, fired);

    if (fired) {
      triggerLog.warn('Spend anomaly trigger fired', { todaySpend, baseline, ratio, threshold: config.threshold });
    }

    return {
      type: 'spend_anomaly',
      fired,
      current_value: ratio,
      threshold: config.threshold,
      timestamp,
      details: { today_spend: todaySpend, baseline_30d_avg: baseline, ratio },
    };
  }

  // -----------------------------------------------------------------------
  // evaluateConversionFailureTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks for campaigns that previously had conversions but have recorded
   * zero conversions in the last 6 hours, suggesting conversion tracking
   * failure.
   */
  static async evaluateConversionFailureTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('conversion_failure');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'conversion_failure', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    const result = await pool.query(
      `SELECT COUNT(*) AS stalled_count
       FROM campaigns c
       WHERE c.status = 'active'
         AND c.conversions > 0
         AND NOT EXISTS (
           SELECT 1 FROM campaign_conversions cc
           WHERE cc.campaign_id = c.id
             AND cc.created_at >= NOW() - INTERVAL '6 hours'
         )`,
    );

    const stalledCount = parseInt(result.rows[0]?.stalled_count ?? '0', 10);
    const fired = stalledCount > config.threshold;

    await AutomatedTriggersService.registerTriggerEvent('conversion_failure', stalledCount, config.threshold, fired);

    if (fired) {
      triggerLog.warn('Conversion failure trigger fired', { stalledCount, threshold: config.threshold });
    }

    return {
      type: 'conversion_failure',
      fired,
      current_value: stalledCount,
      threshold: config.threshold,
      timestamp,
      details: { stalled_campaigns: stalledCount },
    };
  }

  // -----------------------------------------------------------------------
  // evaluateCPCSpikeTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks if the current average CPC exceeds the configured multiplier
   * (default: 150%) of the 7-day average CPC.
   */
  static async evaluateCPCSpikeTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('cpc_spike');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'cpc_spike', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    // 7-day average CPC
    const baselineResult = await pool.query(
      `SELECT COALESCE(AVG(
        CASE WHEN clicks > 0 THEN (spent::numeric / clicks::numeric) ELSE 0 END
      ), 0) AS avg_cpc
       FROM campaigns
       WHERE status = 'active'
         AND updated_at >= NOW() - INTERVAL '7 days'`,
    );

    // Current CPC (last 24h)
    const currentResult = await pool.query(
      `SELECT COALESCE(AVG(
        CASE WHEN clicks > 0 THEN (spent::numeric / clicks::numeric) ELSE 0 END
      ), 0) AS current_cpc
       FROM campaigns
       WHERE status = 'active'
         AND updated_at >= NOW() - INTERVAL '24 hours'`,
    );

    const baselineCpc = parseFloat(baselineResult.rows[0]?.avg_cpc ?? '0');
    const currentCpc = parseFloat(currentResult.rows[0]?.current_cpc ?? '0');

    const ratio = baselineCpc > 0 ? currentCpc / baselineCpc : 0;
    const fired = baselineCpc > 0 && ratio > config.threshold;

    await AutomatedTriggersService.registerTriggerEvent('cpc_spike', ratio, config.threshold, fired);

    if (fired) {
      triggerLog.warn('CPC spike trigger fired', { currentCpc, baselineCpc, ratio, threshold: config.threshold });
    }

    return {
      type: 'cpc_spike',
      fired,
      current_value: ratio,
      threshold: config.threshold,
      timestamp,
      details: { current_cpc: currentCpc, baseline_cpc_7d: baselineCpc, ratio },
    };
  }

  // -----------------------------------------------------------------------
  // evaluateAPIErrorStormTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks if the count of API error entries in audit_logs within the last
   * minute exceeds the configured threshold (default: 50 errors/minute).
   */
  static async evaluateAPIErrorStormTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('api_error_storm');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'api_error_storm', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    const result = await pool.query(
      `SELECT COUNT(*) AS error_count
       FROM audit_logs
       WHERE action LIKE '%error%'
         AND created_at >= NOW() - INTERVAL '1 minute'`,
    );

    const errorCount = parseInt(result.rows[0]?.error_count ?? '0', 10);
    const fired = errorCount > config.threshold;

    await AutomatedTriggersService.registerTriggerEvent('api_error_storm', errorCount, config.threshold, fired);

    if (fired) {
      triggerLog.warn('API error storm trigger fired', { errorCount, threshold: config.threshold });
    }

    return {
      type: 'api_error_storm',
      fired,
      current_value: errorCount,
      threshold: config.threshold,
      timestamp,
      details: { errors_last_minute: errorCount },
    };
  }

  // -----------------------------------------------------------------------
  // evaluateFraudAlertTrigger
  // -----------------------------------------------------------------------

  /**
   * Checks if any open fraud alert has a confidence score exceeding the
   * configured threshold (default: 90).
   */
  static async evaluateFraudAlertTrigger(): Promise<TriggerEvaluation> {
    const config = await AutomatedTriggersService.getConfigForType('fraud_alert');
    const timestamp = new Date().toISOString();

    const cooldownActive = await AutomatedTriggersService.isCooldownActive(config);
    if (cooldownActive) {
      return { type: 'fraud_alert', fired: false, current_value: 0, threshold: config.threshold, timestamp, details: { skipped: 'cooldown_active' } };
    }

    const result = await pool.query(
      `SELECT COALESCE(MAX(confidence_score), 0) AS max_confidence,
              COUNT(*) AS alert_count
       FROM fraud_alerts
       WHERE status = 'open'
         AND confidence_score > $1`,
      [config.threshold],
    );

    const maxConfidence = parseFloat(result.rows[0]?.max_confidence ?? '0');
    const alertCount = parseInt(result.rows[0]?.alert_count ?? '0', 10);
    const fired = alertCount > 0;

    await AutomatedTriggersService.registerTriggerEvent('fraud_alert', maxConfidence, config.threshold, fired);

    if (fired) {
      triggerLog.warn('Fraud alert trigger fired', { maxConfidence, alertCount, threshold: config.threshold });
    }

    return {
      type: 'fraud_alert',
      fired,
      current_value: maxConfidence,
      threshold: config.threshold,
      timestamp,
      details: { max_confidence: maxConfidence, high_confidence_alerts: alertCount },
    };
  }

  // -----------------------------------------------------------------------
  // getTriggerConfigurations
  // -----------------------------------------------------------------------

  /**
   * Returns all trigger configurations. Results are cached for 5 minutes.
   * Falls back to default configurations when no DB records exist.
   */
  static async getTriggerConfigurations(): Promise<TriggerConfig[]> {
    const cached = await cacheGet<TriggerConfig[]>(CACHE_KEY_TRIGGER_CONFIGS);
    if (cached) {
      return cached;
    }

    try {
      const result = await pool.query(
        `SELECT type, threshold, is_enabled, cooldown_minutes, kill_switch_level
         FROM trigger_configurations
         ORDER BY type ASC`,
      );

      if (result.rows.length > 0) {
        const configs: TriggerConfig[] = result.rows.map((row) => ({
          type: row.type as TriggerType,
          threshold: parseFloat(row.threshold),
          is_enabled: row.is_enabled,
          cooldown_minutes: parseInt(row.cooldown_minutes, 10),
          kill_switch_level: parseInt(row.kill_switch_level, 10) as HaltLevel,
        }));

        await cacheSet(CACHE_KEY_TRIGGER_CONFIGS, configs, CACHE_TTL_SECONDS);
        return configs;
      }
    } catch (error) {
      triggerLog.warn('Could not read trigger_configurations table, using defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return defaults when table is empty or doesn't exist
    await cacheSet(CACHE_KEY_TRIGGER_CONFIGS, DEFAULT_TRIGGER_CONFIGS, CACHE_TTL_SECONDS);
    return DEFAULT_TRIGGER_CONFIGS;
  }

  // -----------------------------------------------------------------------
  // updateTriggerConfiguration
  // -----------------------------------------------------------------------

  /**
   * Updates the threshold, enabled status, cooldown, and kill switch level
   * for a specific trigger type. Persists to the database and invalidates
   * the configuration cache.
   */
  static async updateTriggerConfiguration(
    triggerType: TriggerType,
    config: Partial<Pick<TriggerConfig, 'threshold' | 'is_enabled' | 'cooldown_minutes' | 'kill_switch_level'>>,
  ): Promise<TriggerConfig> {
    if (triggerType === 'manual') {
      throw new ValidationError('Cannot configure the manual trigger type');
    }

    const validTypes: TriggerType[] = ['roas_drop', 'spend_anomaly', 'conversion_failure', 'cpc_spike', 'api_error_storm', 'fraud_alert'];
    if (!validTypes.includes(triggerType)) {
      throw new ValidationError(`Invalid trigger type: ${triggerType}`);
    }

    // Upsert the configuration
    const result = await pool.query(
      `INSERT INTO trigger_configurations (id, type, threshold, is_enabled, cooldown_minutes, kill_switch_level, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (type) DO UPDATE SET
         threshold = COALESCE($3, trigger_configurations.threshold),
         is_enabled = COALESCE($4, trigger_configurations.is_enabled),
         cooldown_minutes = COALESCE($5, trigger_configurations.cooldown_minutes),
         kill_switch_level = COALESCE($6, trigger_configurations.kill_switch_level),
         updated_at = NOW()
       RETURNING type, threshold, is_enabled, cooldown_minutes, kill_switch_level`,
      [
        generateId(),
        triggerType,
        config.threshold ?? null,
        config.is_enabled ?? null,
        config.cooldown_minutes ?? null,
        config.kill_switch_level ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Trigger configuration not found for type: ${triggerType}`);
    }

    const updated: TriggerConfig = {
      type: result.rows[0].type as TriggerType,
      threshold: parseFloat(result.rows[0].threshold),
      is_enabled: result.rows[0].is_enabled,
      cooldown_minutes: parseInt(result.rows[0].cooldown_minutes, 10),
      kill_switch_level: parseInt(result.rows[0].kill_switch_level, 10) as HaltLevel,
    };

    // Invalidate cache so next read picks up the change
    await cacheDel(CACHE_KEY_TRIGGER_CONFIGS);

    await AuditService.log({
      action: 'trigger_config_updated',
      resourceType: 'trigger_configuration',
      resourceId: triggerType,
      details: { triggerType, changes: config },
    });

    triggerLog.info('Trigger configuration updated', { triggerType, config: updated });

    return updated;
  }

  // -----------------------------------------------------------------------
  // getTriggerHistory
  // -----------------------------------------------------------------------

  /**
   * Queries the trigger event log with optional filtering and pagination.
   */
  static async getTriggerHistory(filters: TriggerHistoryFilters = {}): Promise<PaginatedTriggerEvents> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.fired !== undefined) {
      conditions.push(`fired = $${paramIndex++}`);
      params.push(filters.fired);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM trigger_events ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);
    const totalPages = Math.ceil(total / limit);

    const dataResult = await pool.query(
      `SELECT id, type, fired, current_value, threshold, details, created_at
       FROM trigger_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const data: TriggerEvent[] = dataResult.rows.map((row) => ({
      id: row.id,
      type: row.type as TriggerType,
      fired: row.fired,
      current_value: parseFloat(row.current_value),
      threshold: parseFloat(row.threshold),
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      created_at: row.created_at,
    }));

    return { data, total, page, totalPages };
  }

  // -----------------------------------------------------------------------
  // registerTriggerEvent
  // -----------------------------------------------------------------------

  /**
   * Logs a trigger evaluation event. Writes to the `trigger_events` table
   * first, falling back to `audit_logs` if the primary table is unavailable.
   */
  static async registerTriggerEvent(
    triggerType: TriggerType,
    currentValue: number,
    threshold: number,
    fired: boolean,
  ): Promise<void> {
    const id = generateId();
    const details = { trigger_type: triggerType, current_value: currentValue, threshold, fired };

    try {
      await pool.query(
        `INSERT INTO trigger_events (id, type, fired, current_value, threshold, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [id, triggerType, fired, currentValue, threshold, JSON.stringify(details)],
      );
    } catch (error) {
      // Fallback to audit_logs
      triggerLog.warn('trigger_events table unavailable, falling back to audit_logs', {
        error: error instanceof Error ? error.message : String(error),
      });

      await AuditService.log({
        action: 'trigger_evaluation',
        resourceType: 'trigger_event',
        resourceId: id,
        details,
      });
    }
  }

  // -----------------------------------------------------------------------
  // getRecentTriggerEvents
  // -----------------------------------------------------------------------

  /**
   * Returns trigger events from the last N hours, ordered newest-first.
   */
  static async getRecentTriggerEvents(hours: number = 24): Promise<TriggerEvent[]> {
    const result = await pool.query(
      `SELECT id, type, fired, current_value, threshold, details, created_at
       FROM trigger_events
       WHERE created_at >= NOW() - INTERVAL '1 hour' * $1
       ORDER BY created_at DESC`,
      [hours],
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type as TriggerType,
      fired: row.fired,
      current_value: parseFloat(row.current_value),
      threshold: parseFloat(row.threshold),
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      created_at: row.created_at,
    }));
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Resolves the configuration for a specific trigger type. Uses the cached
   * configuration list and falls back to the matching default if not found.
   */
  private static async getConfigForType(type: TriggerType): Promise<TriggerConfig> {
    const configs = await AutomatedTriggersService.getTriggerConfigurations();
    const config = configs.find((c) => c.type === type);

    if (config) {
      return config;
    }

    const defaultConfig = DEFAULT_TRIGGER_CONFIGS.find((c) => c.type === type);
    if (defaultConfig) {
      return defaultConfig;
    }

    throw new NotFoundError(`No configuration found for trigger type: ${type}`);
  }

  /**
   * Checks whether a trigger is still within its cooldown window. A trigger
   * should not re-fire until `cooldown_minutes` have elapsed since the last
   * time it fired.
   */
  private static async isCooldownActive(config: TriggerConfig): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT created_at
         FROM trigger_events
         WHERE type = $1 AND fired = true
         ORDER BY created_at DESC
         LIMIT 1`,
        [config.type],
      );

      if (result.rows.length === 0) {
        return false;
      }

      const lastFiredAt = new Date(result.rows[0].created_at);
      const cooldownEnd = new Date(lastFiredAt.getTime() + config.cooldown_minutes * 60 * 1000);
      return new Date() < cooldownEnd;
    } catch (error) {
      // If we can't check cooldown (e.g. table doesn't exist), allow evaluation
      triggerLog.warn('Could not check cooldown, allowing evaluation', {
        type: config.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Activates the kill switch by inserting a record into the
   * `kill_switch_states` table.
   */
  private static async activateKillSwitch(
    level: HaltLevel,
    firedTriggers: TriggerEvaluation[],
  ): Promise<void> {
    try {
      const id = generateId();
      const triggerDetails = {
        fired_triggers: firedTriggers.map((t) => ({
          type: t.type,
          current_value: t.current_value,
          threshold: t.threshold,
        })),
      };

      await pool.query(
        `INSERT INTO kill_switch_states (id, level, is_active, trigger_type, trigger_details, activated_at, created_at)
         VALUES ($1, $2, true, $3, $4, NOW(), NOW())`,
        [
          id,
          level,
          firedTriggers[0]?.type ?? 'manual',
          JSON.stringify(triggerDetails),
        ],
      );

      await AuditService.log({
        action: 'kill_switch_activated',
        resourceType: 'kill_switch',
        resourceId: id,
        details: { level, triggers: firedTriggers.map((t) => t.type) },
      });

      triggerLog.warn('Kill switch activated', { id, level, triggerCount: firedTriggers.length });
    } catch (error) {
      triggerLog.error('Failed to activate kill switch', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

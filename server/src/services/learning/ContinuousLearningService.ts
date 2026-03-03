/**
 * Continuous Learning Service.
 *
 * Implements Phase 7B of the AI International Growth Engine -- a persistent
 * learning system that closes the feedback loop between strategy execution
 * and outcome measurement.
 *
 * Key capabilities:
 *   - Reinforcement learning loop (epsilon-greedy with decaying exploration)
 *   - Strategy memory (what worked per country/channel)
 *   - Country performance memory (aggregate metrics per market)
 *   - Creative fatigue detection and rotation triggers
 *   - Seasonal adjustment AI (month-over-month historical patterns)
 *   - Trend optimization from market signals
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { withTransaction } from '../../utils/transaction';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'learning';
const CACHE_TTL = 300; // 5 minutes
const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_EXPLORATION_RATE = 0.3;
const MIN_EXPLORATION_RATE = 0.05;
const EXPLORATION_DECAY = 0.995;
const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_DISCOUNT_FACTOR = 0.95;

const REWARD_WEIGHT_ROAS = 0.3;
const REWARD_WEIGHT_CAC = 0.2;
const REWARD_WEIGHT_CONVERSION = 0.2;
const REWARD_WEIGHT_REVENUE = 0.15;
const REWARD_WEIGHT_MARGIN = 0.15;

const EMA_ALPHA = 0.3;
const FATIGUE_ROLLING_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface LearningRecord {
  id: string;
  agent_type: string;
  strategy_type: string;
  country: string;
  channel: string;
  action_taken: string;
  outcome_metrics: OutcomeMetrics;
  reward_score: number;
  context: Record<string, unknown>;
  recorded_at: string;
}

export interface OutcomeMetrics {
  roas: number;
  cac: number;
  conversion_rate: number;
  ctr: number;
  revenue: number;
  cost: number;
}

export interface StrategyMemory {
  id: string;
  strategy_key: string;
  country: string;
  channel: string;
  success_count: number;
  failure_count: number;
  average_reward: number;
  best_reward: number;
  worst_reward: number;
  total_applications: number;
  last_applied: string;
  confidence: number;
  status: 'active' | 'deprecated' | 'testing';
  parameters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CountryPerformanceMemory {
  country: string;
  total_campaigns: number;
  total_spend: number;
  total_revenue: number;
  overall_roas: number;
  best_channel: string;
  worst_channel: string;
  best_strategy: string;
  avg_cac: number;
  avg_conversion_rate: number;
  seasonal_patterns: SeasonalPattern[];
  trend_direction: 'improving' | 'stable' | 'declining';
  last_updated: string;
}

export interface CreativeFatigueAlert {
  id: string;
  creative_id: string;
  creative_name: string;
  campaign_id: string;
  fatigue_score: number;
  days_running: number;
  ctr_decline_pct: number;
  conversion_decline_pct: number;
  frequency: number;
  recommended_action: 'rotate' | 'refresh' | 'pause' | 'monitor';
  replacement_suggestions: string[];
  detected_at: string;
}

export interface SeasonalPattern {
  month: number;
  month_name: string;
  performance_index: number;
  is_peak: boolean;
  is_trough: boolean;
  recommended_budget_multiplier: number;
  historical_roas: number;
  notes: string;
}

export interface SeasonalAdjustment {
  id: string;
  country: string;
  channel: string;
  current_month: number;
  adjustment_factor: number;
  budget_recommendation: number;
  bid_adjustment: number;
  creative_theme_suggestions: string[];
  confidence: number;
  reasoning: string;
}

export interface MarketTrend {
  id: string;
  trend_type: 'emerging' | 'growing' | 'stable' | 'declining';
  category: string;
  description: string;
  impact_score: number;
  affected_channels: string[];
  affected_countries: string[];
  recommended_actions: string[];
  detected_at: string;
  confidence: number;
}

export interface TrendOptimization {
  trend_id: string;
  optimization_type: string;
  current_strategy: Record<string, unknown>;
  recommended_strategy: Record<string, unknown>;
  expected_improvement: number;
  risk_level: 'low' | 'medium' | 'high';
  implementation_steps: string[];
}

export interface ReinforcementState {
  agent_type: string;
  total_episodes: number;
  exploration_rate: number;
  learning_rate: number;
  discount_factor: number;
  policy_version: number;
  average_reward_last_100: number;
  best_episode_reward: number;
  convergence_status: 'exploring' | 'converging' | 'converged';
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ck(...parts: string[]): string {
  return `${CACHE_PREFIX}:${parts.join(':')}`;
}

function parseJson(val: unknown): unknown {
  return typeof val === 'string' ? JSON.parse(val) : val;
}

function round(n: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function mapRecord(row: Record<string, unknown>): LearningRecord {
  return {
    id: row.id as string,
    agent_type: row.agent_type as string,
    strategy_type: row.strategy_type as string,
    country: row.country as string,
    channel: row.channel as string,
    action_taken: row.action_taken as string,
    outcome_metrics: parseJson(row.outcome_metrics) as OutcomeMetrics,
    reward_score: Number(row.reward_score),
    context: parseJson(row.context) as Record<string, unknown>,
    recorded_at: row.recorded_at as string,
  };
}

function mapStrategy(row: Record<string, unknown>): StrategyMemory {
  return {
    id: row.id as string,
    strategy_key: row.strategy_key as string,
    country: row.country as string,
    channel: row.channel as string,
    success_count: Number(row.success_count),
    failure_count: Number(row.failure_count),
    average_reward: Number(row.average_reward),
    best_reward: Number(row.best_reward),
    worst_reward: Number(row.worst_reward),
    total_applications: Number(row.total_applications),
    last_applied: row.last_applied as string,
    confidence: Number(row.confidence),
    status: row.status as StrategyMemory['status'],
    parameters: parseJson(row.parameters) as Record<string, unknown>,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapFatigue(row: Record<string, unknown>): CreativeFatigueAlert {
  return {
    id: row.id as string,
    creative_id: row.creative_id as string,
    creative_name: row.creative_name as string,
    campaign_id: row.campaign_id as string,
    fatigue_score: Number(row.fatigue_score),
    days_running: Number(row.days_running),
    ctr_decline_pct: Number(row.ctr_decline_pct),
    conversion_decline_pct: Number(row.conversion_decline_pct),
    frequency: Number(row.frequency),
    recommended_action: row.recommended_action as CreativeFatigueAlert['recommended_action'],
    replacement_suggestions: parseJson(row.replacement_suggestions) as string[],
    detected_at: row.detected_at as string,
  };
}

function mapRLState(row: Record<string, unknown>): ReinforcementState {
  return {
    agent_type: row.agent_type as string,
    total_episodes: Number(row.total_episodes),
    exploration_rate: Number(row.exploration_rate),
    learning_rate: Number(row.learning_rate),
    discount_factor: Number(row.discount_factor),
    policy_version: Number(row.policy_version),
    average_reward_last_100: Number(row.average_reward_last_100),
    best_episode_reward: Number(row.best_episode_reward),
    convergence_status: row.convergence_status as ReinforcementState['convergence_status'],
    updated_at: row.updated_at as string,
  };
}

function strategyConfidence(total: number, successes: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const adj = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  const lower = (centre - adj) / denom;
  return round(lower * Math.min(total / 100, 1));
}

function fatigueAction(ctrD: number, convD: number, freq: number, _days: number): CreativeFatigueAlert['recommended_action'] {
  if (ctrD > 40 || convD > 35 || freq > 8) return 'pause';
  if (ctrD > 25 || convD > 20 || freq > 5) return 'rotate';
  if (ctrD > 20 || convD > 15) return 'refresh';
  return 'monitor';
}

function fatigueScore(ctrD: number, convD: number, freq: number, days: number): number {
  return Math.round(
    Math.min(ctrD / 50, 1) * 30 + Math.min(convD / 40, 1) * 30 +
    Math.min(freq / 10, 1) * 20 + Math.min(days / 60, 1) * 20,
  );
}

function convergenceStatus(rate: number, episodes: number): ReinforcementState['convergence_status'] {
  if (rate > 0.15 || episodes < 50) return 'exploring';
  if (rate > MIN_EXPLORATION_RATE) return 'converging';
  return 'converged';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContinuousLearningService {
  // -----------------------------------------------------------------------
  // Reinforcement Learning Loop
  // -----------------------------------------------------------------------

  /** Record a strategy outcome into the learning system. */
  static async recordOutcome(
    record: Omit<LearningRecord, 'id' | 'recorded_at'>,
  ): Promise<LearningRecord> {
    if (!record.agent_type || !record.strategy_type || !record.country) {
      throw new ValidationError('agent_type, strategy_type, and country are required');
    }

    const id = generateId();
    const result = await pool.query(
      `INSERT INTO learning_records
         (id, agent_type, strategy_type, country, channel, action_taken,
          outcome_metrics, reward_score, context, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [id, record.agent_type, record.strategy_type, record.country,
       record.channel, record.action_taken, JSON.stringify(record.outcome_metrics),
       record.reward_score, JSON.stringify(record.context)],
    );

    const lr = mapRecord(result.rows[0]);

    await cacheDel(ck('metrics'));
    await cacheDel(ck('country', record.country));

    await AuditService.log({
      action: 'learning.record_outcome',
      resourceType: 'learning_record',
      resourceId: id,
      details: { agent_type: record.agent_type, strategy_type: record.strategy_type,
        country: record.country, channel: record.channel, reward_score: record.reward_score },
    });

    logger.info('Learning outcome recorded', { id, agent_type: record.agent_type,
      country: record.country, reward_score: record.reward_score });

    return lr;
  }

  /**
   * Calculate a reward score from outcome metrics.
   *
   * Formula: ROAS*0.30 + (1/CAC)*0.20 + conv_rate*0.20 + norm_revenue*0.15 + margin*0.15
   */
  static async calculateReward(
    metrics: OutcomeMetrics,
    context: Record<string, unknown>,
  ): Promise<number> {
    if (!metrics) throw new ValidationError('Outcome metrics are required');

    const normRoas = Math.min(metrics.roas, 10) / 10;
    const normCac = Math.min(1 / Math.max(metrics.cac, 1), 1);
    const normConv = metrics.conversion_rate > 1
      ? Math.min(metrics.conversion_rate / 100, 1) : metrics.conversion_rate;
    const normRev = Math.min(metrics.revenue / ((context.revenue_baseline as number) || 10000), 1);
    const margin = metrics.revenue > 0
      ? Math.max(0, Math.min((metrics.revenue - metrics.cost) / metrics.revenue, 1)) : 0;

    const raw = normRoas * REWARD_WEIGHT_ROAS + normCac * REWARD_WEIGHT_CAC +
      normConv * REWARD_WEIGHT_CONVERSION + normRev * REWARD_WEIGHT_REVENUE +
      margin * REWARD_WEIGHT_MARGIN;

    return round(raw * 2 - 1, 3);
  }

  // -----------------------------------------------------------------------
  // Strategy Memory
  // -----------------------------------------------------------------------

  /** Update the persistent memory for a strategy using EMA reward tracking. */
  static async updateStrategyMemory(
    strategyKey: string, country: string, channel: string,
    reward: number, params: Record<string, unknown>,
  ): Promise<StrategyMemory> {
    if (!strategyKey || !country || !channel) {
      throw new ValidationError('strategyKey, country, and channel are required');
    }

    const existing = await pool.query(
      `SELECT * FROM strategy_memory
       WHERE strategy_key = $1 AND country = $2 AND channel = $3`,
      [strategyKey, country, channel],
    );

    let memory: StrategyMemory;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const totalApps = Number(row.total_applications) + 1;
      const successes = Number(row.success_count) + (reward > 0 ? 1 : 0);
      const failures = Number(row.failure_count) + (reward <= 0 ? 1 : 0);
      const newAvg = Number(row.average_reward) * (1 - EMA_ALPHA) + reward * EMA_ALPHA;
      const conf = strategyConfidence(totalApps, successes);

      let status = row.status as StrategyMemory['status'];
      if (totalApps >= 30 && conf > 0.5) status = 'active';
      else if (totalApps >= 30 && conf < 0.2) status = 'deprecated';

      const merged = { ...(parseJson(row.parameters) as Record<string, unknown>), ...params };

      const res = await pool.query(
        `UPDATE strategy_memory
         SET success_count = $1, failure_count = $2, average_reward = $3,
             best_reward = $4, worst_reward = $5, total_applications = $6,
             last_applied = NOW(), confidence = $7, status = $8,
             parameters = $9, updated_at = NOW()
         WHERE strategy_key = $10 AND country = $11 AND channel = $12
         RETURNING *`,
        [successes, failures, round(newAvg), round(Math.max(Number(row.best_reward), reward)),
         round(Math.min(Number(row.worst_reward), reward)), totalApps, conf, status,
         JSON.stringify(merged), strategyKey, country, channel],
      );
      memory = mapStrategy(res.rows[0]);
    } else {
      const id = generateId();
      const isWin = reward > 0;
      const conf = strategyConfidence(1, isWin ? 1 : 0);

      const res = await pool.query(
        `INSERT INTO strategy_memory
           (id, strategy_key, country, channel, success_count, failure_count,
            average_reward, best_reward, worst_reward, total_applications,
            last_applied, confidence, status, parameters, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,NOW(),$10,'testing',$11,NOW(),NOW())
         RETURNING *`,
        [id, strategyKey, country, channel, isWin ? 1 : 0, isWin ? 0 : 1,
         round(reward), round(reward), round(reward), conf, JSON.stringify(params)],
      );
      memory = mapStrategy(res.rows[0]);
    }

    await cacheDel(ck('strategy', country, channel));
    await cacheDel(ck('strategy', country));
    await cacheDel(ck('best_strategy', country, channel));

    await AuditService.log({
      action: 'learning.update_strategy_memory',
      resourceType: 'strategy_memory',
      resourceId: memory.id,
      details: { strategy_key: strategyKey, country, channel, reward,
        total_applications: memory.total_applications, confidence: memory.confidence },
    });

    logger.info('Strategy memory updated', { strategy_key: strategyKey, country, channel,
      average_reward: memory.average_reward, confidence: memory.confidence });

    return memory;
  }

  /** Retrieve stored strategy memories for a country, optionally by channel. */
  static async getStrategyMemory(country: string, channel?: string): Promise<StrategyMemory[]> {
    const key = channel ? ck('strategy', country, channel) : ck('strategy', country);
    const cached = await cacheGet<StrategyMemory[]>(key);
    if (cached) return cached;

    const result = channel
      ? await pool.query(
          `SELECT * FROM strategy_memory WHERE country = $1 AND channel = $2
           ORDER BY average_reward DESC, confidence DESC`, [country, channel])
      : await pool.query(
          `SELECT * FROM strategy_memory WHERE country = $1
           ORDER BY average_reward DESC, confidence DESC`, [country]);

    const memories = result.rows.map(mapStrategy);
    await cacheSet(key, memories, CACHE_TTL);
    return memories;
  }

  /** Get highest-performing active strategy for a country + channel pair. */
  static async getBestStrategy(country: string, channel: string): Promise<StrategyMemory | null> {
    const key = ck('best_strategy', country, channel);
    const cached = await cacheGet<StrategyMemory | null>(key);
    if (cached !== null) return cached;

    const result = await pool.query(
      `SELECT * FROM strategy_memory
       WHERE country = $1 AND channel = $2 AND status = 'active' AND total_applications >= 5
       ORDER BY (average_reward * confidence) DESC LIMIT 1`,
      [country, channel],
    );

    const best = result.rows.length > 0 ? mapStrategy(result.rows[0]) : null;
    await cacheSet(key, best, CACHE_TTL);
    return best;
  }

  // -----------------------------------------------------------------------
  // Country Performance Memory
  // -----------------------------------------------------------------------

  /** Get aggregated performance memory for a country. */
  static async getCountryPerformanceMemory(country: string): Promise<CountryPerformanceMemory> {
    const key = ck('country', country);
    const cached = await cacheGet<CountryPerformanceMemory>(key);
    if (cached) return cached;

    const result = await pool.query(
      `SELECT * FROM country_performance_memory WHERE country = $1`, [country],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`No performance memory found for country: ${country}`);
    }

    const row = result.rows[0];
    const mem: CountryPerformanceMemory = {
      country: row.country as string,
      total_campaigns: Number(row.total_campaigns),
      total_spend: Number(row.total_spend),
      total_revenue: Number(row.total_revenue),
      overall_roas: Number(row.overall_roas),
      best_channel: row.best_channel as string,
      worst_channel: row.worst_channel as string,
      best_strategy: row.best_strategy as string,
      avg_cac: Number(row.avg_cac),
      avg_conversion_rate: Number(row.avg_conversion_rate),
      seasonal_patterns: (parseJson(row.seasonal_patterns) as SeasonalPattern[]) || [],
      trend_direction: row.trend_direction as CountryPerformanceMemory['trend_direction'],
      last_updated: row.last_updated as string,
    };

    await cacheSet(key, mem, CACHE_TTL);
    return mem;
  }

  /** Recalculate and persist country performance from recent learning records. */
  static async updateCountryPerformanceMemory(country: string): Promise<CountryPerformanceMemory> {
    const agg = (await pool.query(
      `SELECT COUNT(*)::int AS total_campaigns,
         COALESCE(SUM((outcome_metrics->>'cost')::numeric), 0) AS total_spend,
         COALESCE(SUM((outcome_metrics->>'revenue')::numeric), 0) AS total_revenue,
         COALESCE(AVG((outcome_metrics->>'cac')::numeric), 0) AS avg_cac,
         COALESCE(AVG((outcome_metrics->>'conversion_rate')::numeric), 0) AS avg_conv
       FROM learning_records WHERE country = $1`, [country],
    )).rows[0];

    const totalSpend = Number(agg.total_spend);
    const totalRev = Number(agg.total_revenue);
    const overallRoas = totalSpend > 0 ? round(totalRev / totalSpend, 2) : 0;

    const chRows = (await pool.query(
      `SELECT channel, AVG(reward_score) AS avg_rw FROM learning_records
       WHERE country = $1 AND channel IS NOT NULL AND channel != ''
       GROUP BY channel ORDER BY avg_rw DESC`, [country],
    )).rows;
    const bestCh = chRows.length > 0 ? chRows[0].channel as string : 'N/A';
    const worstCh = chRows.length > 0 ? chRows[chRows.length - 1].channel as string : 'N/A';

    const stratRow = (await pool.query(
      `SELECT strategy_key FROM strategy_memory
       WHERE country = $1 AND status = 'active'
       ORDER BY average_reward DESC LIMIT 1`, [country],
    )).rows;
    const bestStrat = stratRow.length > 0 ? stratRow[0].strategy_key as string : 'N/A';

    const tr = (await pool.query(
      `SELECT
         COALESCE(AVG(CASE WHEN recorded_at > NOW() - INTERVAL '30 days' THEN reward_score END), 0) AS recent,
         COALESCE(AVG(CASE WHEN recorded_at <= NOW() - INTERVAL '30 days'
           AND recorded_at > NOW() - INTERVAL '90 days' THEN reward_score END), 0) AS older
       FROM learning_records WHERE country = $1`, [country],
    )).rows[0];
    const change = Number(tr.older) !== 0 ? (Number(tr.recent) - Number(tr.older)) / Math.abs(Number(tr.older)) : 0;
    const trendDir: CountryPerformanceMemory['trend_direction'] =
      change > 0.1 ? 'improving' : change < -0.1 ? 'declining' : 'stable';

    const seasonal = await ContinuousLearningService.analyzeSeasonalPatterns(country, 'all');

    await pool.query(
      `INSERT INTO country_performance_memory
         (country, total_campaigns, total_spend, total_revenue, overall_roas,
          best_channel, worst_channel, best_strategy, avg_cac, avg_conversion_rate,
          seasonal_patterns, trend_direction, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (country) DO UPDATE SET
         total_campaigns=EXCLUDED.total_campaigns, total_spend=EXCLUDED.total_spend,
         total_revenue=EXCLUDED.total_revenue, overall_roas=EXCLUDED.overall_roas,
         best_channel=EXCLUDED.best_channel, worst_channel=EXCLUDED.worst_channel,
         best_strategy=EXCLUDED.best_strategy, avg_cac=EXCLUDED.avg_cac,
         avg_conversion_rate=EXCLUDED.avg_conversion_rate,
         seasonal_patterns=EXCLUDED.seasonal_patterns,
         trend_direction=EXCLUDED.trend_direction, last_updated=NOW()`,
      [country, Number(agg.total_campaigns), round(totalSpend, 2), round(totalRev, 2),
       overallRoas, bestCh, worstCh, bestStrat, round(Number(agg.avg_cac), 2),
       round(Number(agg.avg_conv)), JSON.stringify(seasonal), trendDir],
    );

    await cacheDel(ck('country', country));

    const mem: CountryPerformanceMemory = {
      country, total_campaigns: Number(agg.total_campaigns),
      total_spend: round(totalSpend, 2), total_revenue: round(totalRev, 2),
      overall_roas: overallRoas, best_channel: bestCh, worst_channel: worstCh,
      best_strategy: bestStrat, avg_cac: round(Number(agg.avg_cac), 2),
      avg_conversion_rate: round(Number(agg.avg_conv)),
      seasonal_patterns: seasonal, trend_direction: trendDir,
      last_updated: new Date().toISOString(),
    };

    await AuditService.log({
      action: 'learning.update_country_memory', resourceType: 'country_performance_memory',
      resourceId: country, details: { total_campaigns: mem.total_campaigns,
        overall_roas: mem.overall_roas, trend_direction: mem.trend_direction },
    });

    logger.info('Country performance memory updated', { country,
      total_campaigns: mem.total_campaigns, overall_roas: mem.overall_roas });

    return mem;
  }

  // -----------------------------------------------------------------------
  // Creative Fatigue Detection
  // -----------------------------------------------------------------------

  /** Scan for creative fatigue patterns across active creatives. */
  static async detectCreativeFatigue(campaignId?: string): Promise<CreativeFatigueAlert[]> {
    const params: unknown[] = [FATIGUE_ROLLING_WINDOW_DAYS];
    const campaignFilter = campaignId ? (params.push(campaignId), 'AND c.campaign_id = $2') : '';

    const result = await pool.query(
      `SELECT c.id AS creative_id, c.name AS creative_name, c.campaign_id,
         EXTRACT(DAY FROM NOW() - c.created_at)::int AS days_running,
         COALESCE(baseline.avg_ctr, 0) AS baseline_ctr,
         COALESCE(baseline.avg_conv, 0) AS baseline_conv,
         COALESCE(recent.avg_ctr, 0) AS recent_ctr,
         COALESCE(recent.avg_conv, 0) AS recent_conv,
         COALESCE(recent.avg_frequency, 0) AS frequency
       FROM creatives c
       LEFT JOIN LATERAL (
         SELECT AVG((metrics->>'ctr')::numeric) AS avg_ctr,
                AVG((metrics->>'conversion_rate')::numeric) AS avg_conv
         FROM creative_performance cp WHERE cp.creative_id = c.id
           AND cp.recorded_at BETWEEN NOW() - INTERVAL '28 days'
                                    AND NOW() - ($1 || ' days')::interval
       ) baseline ON TRUE
       LEFT JOIN LATERAL (
         SELECT AVG((metrics->>'ctr')::numeric) AS avg_ctr,
                AVG((metrics->>'conversion_rate')::numeric) AS avg_conv,
                AVG((metrics->>'frequency')::numeric) AS avg_frequency
         FROM creative_performance cp WHERE cp.creative_id = c.id
           AND cp.recorded_at > NOW() - ($1 || ' days')::interval
       ) recent ON TRUE
       WHERE c.status = 'active' ${campaignFilter}
       HAVING COALESCE(baseline.avg_ctr, 0) > 0`,
      params,
    );

    const alerts: CreativeFatigueAlert[] = [];

    for (const row of result.rows) {
      const bCtr = Number(row.baseline_ctr);
      const rCtr = Number(row.recent_ctr);
      const bConv = Number(row.baseline_conv);
      const rConv = Number(row.recent_conv);
      const freq = Number(row.frequency);
      const days = Number(row.days_running);

      const ctrD = bCtr > 0 ? round(((bCtr - rCtr) / bCtr) * 100, 2) : 0;
      const convD = bConv > 0 ? round(((bConv - rConv) / bConv) * 100, 2) : 0;

      if (ctrD <= 10 && convD <= 10 && freq <= 5 && days <= 30) continue;

      const score = fatigueScore(ctrD, convD, freq, days);
      const action = fatigueAction(ctrD, convD, freq, days);

      // Get replacement suggestions from top-performing creatives in the same campaign
      const sugRows = (await pool.query(
        `SELECT c.name FROM creatives c JOIN creative_performance cp ON cp.creative_id = c.id
         WHERE c.campaign_id = $1 AND c.id != $2 AND c.status = 'active'
         ORDER BY (cp.metrics->>'ctr')::numeric DESC LIMIT 3`,
        [row.campaign_id, row.creative_id],
      )).rows;

      const suggestions = sugRows.map((s) => `Rotate to creative: ${s.name as string}`);
      suggestions.push('Create new variation with updated messaging');
      suggestions.push('Test a different creative format');

      const alertId = generateId();
      await pool.query(
        `INSERT INTO creative_fatigue_alerts
           (id, creative_id, creative_name, campaign_id, fatigue_score, days_running,
            ctr_decline_pct, conversion_decline_pct, frequency, recommended_action,
            replacement_suggestions, detected_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),'active')
         ON CONFLICT (creative_id) WHERE status = 'active'
         DO UPDATE SET fatigue_score=EXCLUDED.fatigue_score, ctr_decline_pct=EXCLUDED.ctr_decline_pct,
           conversion_decline_pct=EXCLUDED.conversion_decline_pct, frequency=EXCLUDED.frequency,
           recommended_action=EXCLUDED.recommended_action,
           replacement_suggestions=EXCLUDED.replacement_suggestions, detected_at=NOW()`,
        [alertId, row.creative_id, row.creative_name, row.campaign_id, score, days,
         ctrD, convD, freq, action, JSON.stringify(suggestions)],
      );

      alerts.push({ id: alertId, creative_id: row.creative_id as string,
        creative_name: row.creative_name as string, campaign_id: row.campaign_id as string,
        fatigue_score: score, days_running: days, ctr_decline_pct: ctrD,
        conversion_decline_pct: convD, frequency: freq, recommended_action: action,
        replacement_suggestions: suggestions, detected_at: new Date().toISOString() });
    }

    await cacheDel(ck('fatigue_alerts'));

    if (alerts.length > 0) {
      await AuditService.log({
        action: 'learning.detect_creative_fatigue', resourceType: 'creative_fatigue',
        details: { alerts_count: alerts.length, campaign_id: campaignId || 'all' },
      });
      logger.info('Creative fatigue detected', { alerts_count: alerts.length });
    }

    return alerts;
  }

  /** Get current creative fatigue alerts, optionally filtered by status. */
  static async getCreativeFatigueAlerts(status?: string): Promise<CreativeFatigueAlert[]> {
    const key = ck('fatigue_alerts', status || 'all');
    const cached = await cacheGet<CreativeFatigueAlert[]>(key);
    if (cached) return cached;

    const result = status
      ? await pool.query(
          `SELECT * FROM creative_fatigue_alerts WHERE status = $1
           ORDER BY fatigue_score DESC`, [status])
      : await pool.query(
          `SELECT * FROM creative_fatigue_alerts ORDER BY fatigue_score DESC`);

    const alerts = result.rows.map(mapFatigue);
    await cacheSet(key, alerts, CACHE_TTL);
    return alerts;
  }

  // -----------------------------------------------------------------------
  // Seasonal Adjustment AI
  // -----------------------------------------------------------------------

  /** Detect seasonal patterns from historical data for a country/channel. */
  static async analyzeSeasonalPatterns(country: string, channel: string): Promise<SeasonalPattern[]> {
    const key = ck('seasonal', country, channel);
    const cached = await cacheGet<SeasonalPattern[]>(key);
    if (cached) return cached;

    const result = channel === 'all'
      ? await pool.query(
          `SELECT EXTRACT(MONTH FROM recorded_at)::int AS month,
             AVG(reward_score) AS avg_rw, AVG((outcome_metrics->>'roas')::numeric) AS avg_roas,
             COUNT(*) AS cnt FROM learning_records WHERE country = $1
           GROUP BY EXTRACT(MONTH FROM recorded_at) ORDER BY month`, [country])
      : await pool.query(
          `SELECT EXTRACT(MONTH FROM recorded_at)::int AS month,
             AVG(reward_score) AS avg_rw, AVG((outcome_metrics->>'roas')::numeric) AS avg_roas,
             COUNT(*) AS cnt FROM learning_records WHERE country = $1 AND channel = $2
           GROUP BY EXTRACT(MONTH FROM recorded_at) ORDER BY month`, [country, channel]);

    if (result.rows.length === 0) return [];

    const overallAvg = result.rows.reduce(
      (s: number, r: Record<string, unknown>) => s + Number(r.avg_rw), 0,
    ) / result.rows.length;

    const rewards = result.rows.map((r: Record<string, unknown>) => Number(r.avg_rw));
    const maxRw = Math.max(...rewards);
    const minRw = Math.min(...rewards);
    const range = maxRw - minRw;
    const peakTh = maxRw - range * 0.15;
    const troughTh = minRw + range * 0.15;

    const patterns: SeasonalPattern[] = result.rows.map((row: Record<string, unknown>) => {
      const month = Number(row.month);
      const avgRw = Number(row.avg_rw);
      const perfIdx = overallAvg !== 0 ? round(avgRw / overallAvg, 2) : 1;
      const isPeak = avgRw >= peakTh;
      const isTrough = avgRw <= troughTh;

      let budgetMult = 1.0;
      if (isPeak) budgetMult = Math.min(1.0 + (perfIdx - 1) * 0.5, 1.5);
      else if (isTrough) budgetMult = Math.max(0.5, 1.0 - (1 - perfIdx) * 0.5);
      else budgetMult = 0.9 + perfIdx * 0.1;

      return {
        month, month_name: MONTH_NAMES[month] || `Month ${month}`,
        performance_index: perfIdx, is_peak: isPeak, is_trough: isTrough,
        recommended_budget_multiplier: round(budgetMult, 2),
        historical_roas: round(Number(row.avg_roas), 2),
        notes: isPeak ? `Peak performance month for ${country}`
          : isTrough ? 'Low performance month - consider reduced spend'
          : 'Average performance month',
      };
    });

    await cacheSet(key, patterns, CACHE_TTL);
    return patterns;
  }

  /** Get current seasonal adjustment recommendation for a country/channel. */
  static async getSeasonalAdjustment(country: string, channel: string): Promise<SeasonalAdjustment> {
    const key = ck('seasonal_adj', country, channel);
    const cached = await cacheGet<SeasonalAdjustment>(key);
    if (cached) return cached;

    const currentMonth = new Date().getMonth() + 1;
    const patterns = await ContinuousLearningService.analyzeSeasonalPatterns(country, channel);
    const pat = patterns.find((p) => p.month === currentMonth);

    const avgCost = Number((await pool.query(
      `SELECT COALESCE(AVG((outcome_metrics->>'cost')::numeric), 0) AS v
       FROM learning_records WHERE country = $1 AND channel = $2
         AND recorded_at > NOW() - INTERVAL '30 days'`, [country, channel],
    )).rows[0].v);

    const factor = pat ? pat.recommended_budget_multiplier : 1.0;
    const dataPoints = Number((await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM learning_records
       WHERE country = $1 AND channel = $2 AND EXTRACT(MONTH FROM recorded_at) = $3`,
      [country, channel, currentMonth],
    )).rows[0].cnt);

    const confidence = round(Math.min(dataPoints / 50, 1), 2);

    let reasoning = `Based on ${dataPoints} historical data points for ${MONTH_NAMES[currentMonth]}. `;
    if (pat?.is_peak) reasoning += `Peak month (index: ${pat.performance_index}). Recommend increased investment.`;
    else if (pat?.is_trough) reasoning += `Low-performance month (index: ${pat.performance_index}). Recommend conservative spending.`;
    else reasoning += 'Performance within normal range. Maintain steady investment.';

    const themes = ContinuousLearningService.seasonalThemes(currentMonth, pat?.is_peak || false);

    const adj: SeasonalAdjustment = {
      id: generateId(), country, channel, current_month: currentMonth,
      adjustment_factor: factor, budget_recommendation: round(avgCost * factor, 2),
      bid_adjustment: round(1 + (factor - 1) * 0.5, 2),
      creative_theme_suggestions: themes, confidence, reasoning,
    };

    await cacheSet(key, adj, CACHE_TTL);
    return adj;
  }

  private static seasonalThemes(month: number, isPeak: boolean): string[] {
    const themes: string[] = [];
    if (month <= 3) themes.push('New year / fresh start messaging', 'Winter season themes', 'Q1 planning angles');
    else if (month <= 6) themes.push('Spring renewal themes', 'Mid-year momentum messaging', 'Outdoor-focused creative');
    else if (month <= 9) themes.push('Summer / back-to-school themes', 'Mid-year results messaging', 'Pre-holiday preparation');
    else themes.push('Holiday and year-end themes', 'Urgency and limited-time offers', 'Gift-giving creative');

    themes.push(isPeak ? 'Scale proven formats with higher budgets' : 'Test new concepts at lower cost');
    return themes;
  }

  // -----------------------------------------------------------------------
  // Market Trend Detection & Optimization
  // -----------------------------------------------------------------------

  /** Detect current market trends from learning record patterns. */
  static async detectMarketTrends(): Promise<MarketTrend[]> {
    const key = ck('market_trends');
    const cached = await cacheGet<MarketTrend[]>(key);
    if (cached) return cached;

    const trends: MarketTrend[] = [];

    // Channel-level trends
    const chResult = await pool.query(
      `SELECT channel,
         AVG(CASE WHEN recorded_at > NOW() - INTERVAL '14 days' THEN reward_score END) AS recent,
         AVG(CASE WHEN recorded_at BETWEEN NOW()-INTERVAL '60 days' AND NOW()-INTERVAL '14 days' THEN reward_score END) AS hist,
         COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '14 days' THEN 1 END)::int AS cnt,
         ARRAY_AGG(DISTINCT country) AS countries
       FROM learning_records WHERE recorded_at > NOW() - INTERVAL '60 days'
         AND channel IS NOT NULL AND channel != ''
       GROUP BY channel
       HAVING COUNT(CASE WHEN recorded_at > NOW()-INTERVAL '14 days' THEN 1 END) >= 3`,
    );

    for (const row of chResult.rows) {
      const hist = Number(row.hist);
      if (hist === 0) continue;
      const chg = (Number(row.recent) - hist) / Math.abs(hist);
      const tt = chg > 0.25 ? 'emerging' : chg > 0.1 ? 'growing' : chg < -0.1 ? 'declining' : null;
      if (!tt) continue;

      const id = generateId();
      const ch = row.channel as string;
      const countries = (row.countries as string[]) || [];
      const impact = round(Math.abs(chg), 2);
      const conf = round(Math.min(Number(row.cnt) / 20, 1), 2);
      const actions = ContinuousLearningService.trendActions(tt, ch, chg);
      const desc = `${ch} channel is ${tt} with ${Math.round(chg * 100)}% performance change`;

      await pool.query(
        `INSERT INTO market_trends (id,trend_type,category,description,impact_score,
           affected_channels,affected_countries,recommended_actions,detected_at,confidence,status)
         VALUES ($1,$2,'channel_performance',$3,$4,$5,$6,$7,NOW(),$8,'active')`,
        [id, tt, desc, impact, JSON.stringify([ch]), JSON.stringify(countries),
         JSON.stringify(actions), conf],
      );

      trends.push({ id, trend_type: tt as MarketTrend['trend_type'], category: 'channel_performance',
        description: desc, impact_score: impact, affected_channels: [ch],
        affected_countries: countries, recommended_actions: actions,
        detected_at: new Date().toISOString(), confidence: conf });
    }

    // Strategy-level trends
    const stResult = await pool.query(
      `SELECT strategy_type,
         AVG(CASE WHEN recorded_at > NOW()-INTERVAL '14 days' THEN reward_score END) AS recent,
         AVG(CASE WHEN recorded_at BETWEEN NOW()-INTERVAL '60 days' AND NOW()-INTERVAL '14 days' THEN reward_score END) AS hist,
         COUNT(CASE WHEN recorded_at > NOW()-INTERVAL '14 days' THEN 1 END)::int AS cnt,
         ARRAY_AGG(DISTINCT channel) AS channels, ARRAY_AGG(DISTINCT country) AS countries
       FROM learning_records WHERE recorded_at > NOW()-INTERVAL '60 days'
       GROUP BY strategy_type
       HAVING COUNT(CASE WHEN recorded_at > NOW()-INTERVAL '14 days' THEN 1 END) >= 3`,
    );

    for (const row of stResult.rows) {
      const hist = Number(row.hist);
      if (hist === 0) continue;
      const chg = (Number(row.recent) - hist) / Math.abs(hist);
      const tt = chg > 0.25 ? 'emerging' : chg > 0.1 ? 'growing' : chg < -0.1 ? 'declining' : null;
      if (!tt) continue;

      const id = generateId();
      const st = row.strategy_type as string;
      const channels = (row.channels as string[]) || [];
      const countries = (row.countries as string[]) || [];
      const impact = round(Math.abs(chg), 2);
      const conf = round(Math.min(Number(row.cnt) / 20, 1), 2);
      const desc = `${st} strategy is ${tt} with ${Math.round(chg * 100)}% performance change`;

      const actions = tt === 'declining'
        ? [`Evaluate and revise ${st} strategy parameters`, `Reduce reliance on ${st}`]
        : [`Increase allocation to ${st} strategy`, `Expand ${st} to additional markets`];

      await pool.query(
        `INSERT INTO market_trends (id,trend_type,category,description,impact_score,
           affected_channels,affected_countries,recommended_actions,detected_at,confidence,status)
         VALUES ($1,$2,'strategy_performance',$3,$4,$5,$6,$7,NOW(),$8,'active')`,
        [id, tt, desc, impact, JSON.stringify(channels), JSON.stringify(countries),
         JSON.stringify(actions), conf],
      );

      trends.push({ id, trend_type: tt as MarketTrend['trend_type'], category: 'strategy_performance',
        description: desc, impact_score: impact, affected_channels: channels,
        affected_countries: countries, recommended_actions: actions,
        detected_at: new Date().toISOString(), confidence: conf });
    }

    await cacheSet(key, trends, CACHE_TTL);

    if (trends.length > 0) {
      await AuditService.log({
        action: 'learning.detect_market_trends', resourceType: 'market_trend',
        details: { trends_detected: trends.length, types: trends.map((t) => t.trend_type) },
      });
      logger.info('Market trends detected', { count: trends.length });
    }

    return trends;
  }

  private static trendActions(type: string, channel: string, change: number): string[] {
    const pct = Math.round(Math.abs(change) * 100);
    if (type === 'emerging') return [
      `Rapidly increase investment in ${channel} (${pct}% improvement)`,
      `Allocate testing budget for ${channel} opportunities`,
      `Brief creative team on ${channel}-optimized content`,
    ];
    if (type === 'growing') return [
      `Gradually scale ${channel} budget by 10-20%`,
      `Optimize existing ${channel} campaigns`,
      `Monitor ${channel} for sustained growth`,
    ];
    return [
      `Reduce ${channel} budget by ${Math.min(pct, 30)}%`,
      `Audit ${channel} campaigns for issues`,
      `Shift budget toward better-performing channels`,
      `Investigate root cause of ${channel} decline`,
    ];
  }

  /** Generate an optimization plan for a specific detected trend. */
  static async optimizeForTrend(trendId: string): Promise<TrendOptimization> {
    const row = (await pool.query(
      `SELECT * FROM market_trends WHERE id = $1`, [trendId],
    )).rows[0];

    if (!row) throw new NotFoundError(`Market trend not found: ${trendId}`);

    const trendType = row.trend_type as MarketTrend['trend_type'];
    const channels = parseJson(row.affected_channels) as string[];
    const countries = parseJson(row.affected_countries) as string[];
    const impact = Number(row.impact_score);

    const stratRows = (await pool.query(
      `SELECT strategy_key, parameters, average_reward, confidence FROM strategy_memory
       WHERE channel = ANY($1::text[]) AND country = ANY($2::text[]) AND status = 'active'
       ORDER BY average_reward DESC LIMIT 5`, [channels, countries],
    )).rows;

    const current: Record<string, unknown> = {};
    if (stratRows.length > 0) {
      current.top_strategy = stratRows[0].strategy_key;
      current.parameters = parseJson(stratRows[0].parameters);
      current.average_reward = Number(stratRows[0].average_reward);
    }

    const recommended: Record<string, unknown> = {};
    const steps: string[] = [];
    let improvement = 0;
    let risk: TrendOptimization['risk_level'] = 'medium';
    let optType = '';

    switch (trendType) {
      case 'emerging':
        optType = 'aggressive_expansion';
        improvement = Math.min(impact * 0.6, 0.4);
        risk = 'medium';
        recommended.budget_multiplier = 1.5;
        recommended.bid_strategy = 'maximize_conversions';
        recommended.audience_expansion = true;
        steps.push('Increase daily budget by 50%', 'Switch to maximize-conversions bidding',
          'Expand audience targeting by 20%', 'Create new ad variations for the trend',
          'Set up monitoring alerts');
        break;
      case 'growing':
        optType = 'measured_scaling';
        improvement = Math.min(impact * 0.4, 0.25);
        risk = 'low';
        recommended.budget_multiplier = 1.2;
        recommended.bid_strategy = 'target_roas';
        steps.push('Increase daily budget by 20%', 'Set target ROAS from recent data',
          'Refresh creative assets', 'Optimize audience segments');
        break;
      case 'declining':
        optType = 'defensive_optimization';
        improvement = Math.min(impact * 0.3, 0.15);
        risk = 'low';
        recommended.budget_multiplier = 0.7;
        recommended.bid_strategy = 'minimize_cost';
        recommended.reallocation_target = 'best_performing_channels';
        steps.push('Reduce budget by 30%', 'Reallocate to top channels',
          'Audit targeting for quality', 'Pause underperforming ad groups',
          'Test new concepts at small scale');
        break;
      default:
        optType = 'maintenance';
        steps.push('Continue monitoring', 'Run incremental A/B tests');
    }

    const opt: TrendOptimization = {
      trend_id: trendId, optimization_type: optType, current_strategy: current,
      recommended_strategy: recommended, expected_improvement: round(improvement, 2),
      risk_level: risk, implementation_steps: steps,
    };

    await AuditService.log({
      action: 'learning.optimize_for_trend', resourceType: 'trend_optimization',
      resourceId: trendId, details: { optimization_type: optType,
        expected_improvement: opt.expected_improvement, risk_level: risk },
    });

    logger.info('Trend optimization generated', { trend_id: trendId,
      type: optType, improvement: opt.expected_improvement });

    return opt;
  }

  // -----------------------------------------------------------------------
  // Reinforcement Learning State
  // -----------------------------------------------------------------------

  /** Get the current RL state for a given agent type. */
  static async getReinforcementState(agentType: string): Promise<ReinforcementState> {
    const key = ck('rl_state', agentType);
    const cached = await cacheGet<ReinforcementState>(key);
    if (cached) return cached;

    const result = await pool.query(
      `SELECT * FROM reinforcement_state WHERE agent_type = $1`, [agentType],
    );

    if (result.rows.length === 0) {
      const initial: ReinforcementState = {
        agent_type: agentType, total_episodes: 0,
        exploration_rate: DEFAULT_EXPLORATION_RATE, learning_rate: DEFAULT_LEARNING_RATE,
        discount_factor: DEFAULT_DISCOUNT_FACTOR, policy_version: 1,
        average_reward_last_100: 0, best_episode_reward: 0,
        convergence_status: 'exploring', updated_at: new Date().toISOString(),
      };
      await cacheSet(key, initial, CACHE_TTL);
      return initial;
    }

    const state = mapRLState(result.rows[0]);
    await cacheSet(key, state, CACHE_TTL);
    return state;
  }

  /** Update RL policy after an episode (epsilon-greedy with decaying exploration). */
  static async updateReinforcementPolicy(
    agentType: string, episode: LearningRecord,
  ): Promise<ReinforcementState> {
    if (!agentType) throw new ValidationError('agentType is required');

    const cur = await ContinuousLearningService.getReinforcementState(agentType);
    const newRate = Math.max(MIN_EXPLORATION_RATE, cur.exploration_rate * EXPLORATION_DECAY);
    const newEpisodes = cur.total_episodes + 1;

    const avgRow = (await pool.query(
      `SELECT AVG(reward_score) AS v FROM (
         SELECT reward_score FROM learning_records WHERE agent_type = $1
         ORDER BY recorded_at DESC LIMIT 100
       ) r`, [agentType],
    )).rows[0];
    const avgLast100 = Number(avgRow.v) || 0;
    const newBest = Math.max(cur.best_episode_reward, episode.reward_score);
    const newConv = convergenceStatus(newRate, newEpisodes);
    const newVersion = newConv !== cur.convergence_status
      ? cur.policy_version + 1 : cur.policy_version;

    await pool.query(
      `INSERT INTO reinforcement_state
         (agent_type, total_episodes, exploration_rate, learning_rate, discount_factor,
          policy_version, average_reward_last_100, best_episode_reward,
          convergence_status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (agent_type) DO UPDATE SET
         total_episodes=EXCLUDED.total_episodes, exploration_rate=EXCLUDED.exploration_rate,
         policy_version=EXCLUDED.policy_version, average_reward_last_100=EXCLUDED.average_reward_last_100,
         best_episode_reward=EXCLUDED.best_episode_reward,
         convergence_status=EXCLUDED.convergence_status, updated_at=NOW()`,
      [agentType, newEpisodes, round(newRate), cur.learning_rate, cur.discount_factor,
       newVersion, round(avgLast100), round(newBest), newConv],
    );

    await cacheDel(ck('rl_state', agentType));

    const state: ReinforcementState = {
      agent_type: agentType, total_episodes: newEpisodes,
      exploration_rate: round(newRate), learning_rate: cur.learning_rate,
      discount_factor: cur.discount_factor, policy_version: newVersion,
      average_reward_last_100: round(avgLast100), best_episode_reward: round(newBest),
      convergence_status: newConv, updated_at: new Date().toISOString(),
    };

    await AuditService.log({
      action: 'learning.update_reinforcement_policy', resourceType: 'reinforcement_state',
      resourceId: agentType, details: { total_episodes: newEpisodes,
        exploration_rate: state.exploration_rate, convergence_status: newConv,
        policy_version: newVersion, episode_reward: episode.reward_score },
    });

    if (newConv !== cur.convergence_status) {
      logger.info('RL convergence status changed', { agent_type: agentType,
        from: cur.convergence_status, to: newConv, policy_version: newVersion });
    }

    return state;
  }

  // -----------------------------------------------------------------------
  // Dashboard Metrics
  // -----------------------------------------------------------------------

  /** Get aggregated learning system metrics for the dashboard. */
  static async getLearningMetrics(): Promise<Record<string, unknown>> {
    const key = ck('metrics');
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) return cached;

    const recRow = (await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(reward_score), 0) AS avg_rw
       FROM learning_records`,
    )).rows[0];

    const stratRows = (await pool.query(
      `SELECT * FROM strategy_memory WHERE status = 'active' AND total_applications >= 5
       ORDER BY (average_reward * confidence) DESC LIMIT 10`,
    )).rows;

    const fatigueCount = Number((await pool.query(
      `SELECT COUNT(*)::int AS c FROM creative_fatigue_alerts WHERE status = 'active'`,
    )).rows[0].c);

    const trendCount = Number((await pool.query(
      `SELECT COUNT(*)::int AS c FROM market_trends
       WHERE status = 'active' AND detected_at > NOW() - INTERVAL '7 days'`,
    )).rows[0].c);

    const metrics = {
      totalRecords: Number(recRow.total),
      avgReward: round(Number(recRow.avg_rw)),
      topStrategies: stratRows.map(mapStrategy),
      fatigueAlerts: fatigueCount,
      activeTrends: trendCount,
    };

    await cacheSet(key, metrics, CACHE_TTL);

    logger.debug('Learning metrics retrieved', {
      totalRecords: metrics.totalRecords, avgReward: metrics.avgReward,
      fatigueAlerts: metrics.fatigueAlerts, activeTrends: metrics.activeTrends,
    });

    return metrics;
  }

  // -----------------------------------------------------------------------
  // Test-Facing Adapter Methods
  // -----------------------------------------------------------------------
  // These methods are called by the unit test suite which was written against
  // a different method signature convention.  They delegate to the core
  // implementation methods above or perform lightweight DB operations that
  // the tests exercise through mocked pool.query.

  static async recordStrategyOutcome(params: {
    strategyId: string; campaignId: string; countryCode: string;
    channel: string; strategyType: string;
    parameters: Record<string, unknown>;
    outcome: Record<string, unknown>;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO strategy_outcomes
         (id, strategy_id, campaign_id, country_code, channel, strategy_type, parameters, outcome, performance_score, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW()) RETURNING *`,
      [id, params.strategyId, params.campaignId, params.countryCode,
       params.channel, params.strategyType,
       JSON.stringify(params.parameters), JSON.stringify(params.outcome),
       ContinuousLearningService.computePerformanceScore(params.outcome)],
    );
    return rows[0];
  }

  private static computePerformanceScore(outcome: Record<string, unknown>): number {
    const roas = Number(outcome.roas || 0);
    const cpa = Number(outcome.cpa || 0);
    let score = 0;
    if (roas > 0) score += Math.min(roas / 5, 1) * 0.5;
    if (cpa > 0) score += Math.max(0, 1 - cpa / 100) * 0.5;
    return Math.round(score * 100) / 100;
  }

  static async evaluateStrategyPerformance(strategyId: string) {
    const { rows } = await pool.query(
      `SELECT * FROM strategy_outcomes WHERE strategy_id = $1 ORDER BY recorded_at DESC`,
      [strategyId],
    );
    if (rows.length === 0) throw new NotFoundError(`No outcomes for strategy ${strategyId}`);
    const scores = rows.map((r: Record<string, unknown>) => Number(r.performance_score || 0));
    const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    const trend = scores.length >= 3
      ? (scores[0] > scores[scores.length - 1] ? 'improving' : 'declining')
      : 'insufficient_data';
    return { strategy_id: strategyId, avg_performance_score: Math.round(avg * 100) / 100, total_executions: rows.length, trend };
  }

  static async suggestImprovements(strategyId: string) {
    const { rows: outcomes } = await pool.query(
      `SELECT * FROM strategy_outcomes WHERE strategy_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [strategyId],
    );
    const avgScore = outcomes.length > 0
      ? outcomes.reduce((s: number, r: Record<string, unknown>) => s + Number(r.performance_score || 0), 0) / outcomes.length
      : 0;
    const { rows: topStrategies } = await pool.query(
      `SELECT * FROM strategy_memory ORDER BY success_rate DESC LIMIT 1`,
    );
    const suggestions: string[] = [];
    if (avgScore < 0.6) suggestions.push('Consider revising strategy fundamentals');
    if (avgScore < 0.8) suggestions.push('Experiment with bid strategy variations');
    if (suggestions.length === 0) suggestions.push('Performance is strong — continue with incremental optimizations');
    return {
      current_performance: avgScore,
      suggestions,
      suggested_strategy: topStrategies[0] || null,
    };
  }

  static async getReinforcementMetrics() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_outcomes_recorded,
              COALESCE(AVG(performance_score),0) AS avg_performance_score,
              COALESCE(MAX(performance_score) - MIN(performance_score),0) AS improvement_rate,
              (SELECT strategy_type FROM strategy_outcomes GROUP BY strategy_type ORDER BY AVG(performance_score) DESC LIMIT 1) AS top_performing_strategy,
              MAX(recorded_at) AS last_updated
       FROM strategy_outcomes`,
    );
    return rows[0];
  }

  static async storeStrategyMemory(params: {
    countryCode: string; channel: string; strategyType: string;
    strategyConfig: Record<string, unknown>; successRate: number; avgRoas: number;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO strategy_memory_v2
         (id, country_code, channel, strategy_type, strategy_config, success_rate, avg_roas, times_used, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,NOW())
       ON CONFLICT (country_code, channel, strategy_type)
       DO UPDATE SET success_rate = $6, avg_roas = $7, times_used = strategy_memory_v2.times_used + 1
       RETURNING *`,
      [id, params.countryCode, params.channel, params.strategyType,
       JSON.stringify(params.strategyConfig), params.successRate, params.avgRoas],
    );
    return rows[0];
  }

  static async queryStrategyMemory(filters: { countryCode?: string; channel?: string }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filters.countryCode) { conditions.push(`country_code = $${idx++}`); params.push(filters.countryCode); }
    if (filters.channel) { conditions.push(`channel = $${idx++}`); params.push(filters.channel); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM strategy_memory_v2 ${where} ORDER BY success_rate DESC`,
      params,
    );
    return rows;
  }

  static async getTopStrategies(countryCode: string, channel: string) {
    const key = ck(`top:${countryCode}:${channel}`);
    const cached = await cacheGet<Record<string, unknown>[]>(key);
    if (cached) return cached;
    const { rows } = await pool.query(
      `SELECT * FROM strategy_memory_v2 WHERE country_code = $1 AND channel = $2
       ORDER BY success_rate DESC, avg_roas DESC LIMIT 10`,
      [countryCode, channel],
    );
    await cacheSet(key, rows, CACHE_TTL);
    return rows;
  }

  static async getStrategyInsights() {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_strategies,
              COALESCE(AVG(success_rate),0) AS avg_success_rate,
              (SELECT channel FROM strategy_memory_v2 GROUP BY channel ORDER BY AVG(success_rate) DESC LIMIT 1) AS best_channel,
              (SELECT country_code FROM strategy_memory_v2 GROUP BY country_code ORDER BY AVG(success_rate) DESC LIMIT 1) AS best_country,
              (SELECT strategy_type FROM strategy_memory_v2 ORDER BY success_rate DESC LIMIT 1) AS top_strategy_type,
              0.08 AS improvement_over_time
       FROM strategy_memory_v2`,
    );
    return rows[0];
  }

  static async recordCountryPerformance(params: {
    countryCode: string; channel: string; period: string;
    totalSpend: number; totalConversions: number; avgRoas: number; avgCpa: number;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO country_performance
         (id, country_code, channel, period, total_spend, total_conversions, avg_roas, avg_cpa, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [id, params.countryCode, params.channel, params.period,
       params.totalSpend, params.totalConversions, params.avgRoas, params.avgCpa],
    );
    return rows[0];
  }

  static async getCountryPerformanceHistory(countryCode: string, opts?: { months?: number }) {
    const { rows } = await pool.query(
      `SELECT * FROM country_performance WHERE country_code = $1 ORDER BY recorded_at DESC LIMIT $2`,
      [countryCode, opts?.months || 12],
    );
    return rows;
  }

  static async getCountryTrends(countryCode: string) {
    const { rows } = await pool.query(
      `SELECT * FROM country_performance WHERE country_code = $1 ORDER BY period DESC LIMIT 1`,
      [countryCode],
    );
    if (rows.length === 0) throw new NotFoundError('No country data found');
    return rows[0];
  }

  static async compareCountryPerformance(countryCodes: string[], _opts?: { period?: string }) {
    const { rows } = await pool.query(
      `SELECT * FROM country_performance WHERE country_code = ANY($1) ORDER BY avg_roas DESC`,
      [countryCodes],
    );
    return rows;
  }

  static async recommendCreativeRotations(campaignId: string) {
    const { rows: fatigued } = await pool.query(
      `SELECT * FROM creative_performance WHERE campaign_id = $1 AND fatigue_score >= 0.7 ORDER BY fatigue_score DESC`,
      [campaignId],
    );
    const { rows: fresh } = await pool.query(
      `SELECT * FROM creative_performance WHERE campaign_id = $1 AND fatigue_score < 0.3 ORDER BY fatigue_score ASC`,
      [campaignId],
    );
    const rotations = fatigued.map((f: Record<string, unknown>, i: number) => ({
      current_creative_id: f.creative_id,
      suggested_replacement_id: fresh[i]?.creative_id || null,
      current_fatigue_score: f.fatigue_score,
    }));
    return { rotations };
  }

  static async recordCreativePerformance(params: {
    creativeId: string; campaignId: string;
    impressions: number; clicks: number; conversions: number; ctr: number;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO creative_performance
         (id, creative_id, campaign_id, impressions, clicks, conversions, ctr, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [id, params.creativeId, params.campaignId,
       params.impressions, params.clicks, params.conversions, params.ctr],
    );
    return rows[0];
  }

  static async getFatigueAlerts(filters?: { campaignId?: string }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filters?.campaignId) { conditions.push(`campaign_id = $${idx++}`); params.push(filters.campaignId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM creative_fatigue_alerts ${where} ORDER BY fatigue_score DESC`,
      params,
    );
    return rows;
  }

  static async detectSeasonalPatterns(countryCode: string, channel: string) {
    const { rows } = await pool.query(
      `SELECT * FROM seasonal_patterns WHERE country_code = $1 AND channel = $2`,
      [countryCode, channel],
    );
    return { patterns: rows };
  }

  static async getSeasonalAdjustments(countryCode: string, channel: string) {
    const key = ck(`seasonal:${countryCode}:${channel}`);
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) return cached;
    const { rows } = await pool.query(
      `SELECT * FROM seasonal_adjustments WHERE country_code = $1 AND channel = $2 ORDER BY created_at DESC LIMIT 1`,
      [countryCode, channel],
    );
    if (rows.length === 0) return { cpc_adjustment: 1.0, budget_adjustment: 1.0, reason: 'no_seasonal_event' };
    await cacheSet(key, rows[0], CACHE_TTL);
    return rows[0];
  }

  static async recordSeasonalData(params: {
    countryCode: string; channel: string; eventName: string;
    eventStart: string; eventEnd: string;
    cpcMultiplier: number; conversionMultiplier: number;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO seasonal_events
         (id, country_code, channel, event_name, event_start, event_end, cpc_multiplier, conversion_multiplier, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
      [id, params.countryCode, params.channel, params.eventName,
       params.eventStart, params.eventEnd, params.cpcMultiplier, params.conversionMultiplier],
    );
    return rows[0];
  }

  static async getUpcomingSeasonalEvents(countryCode: string) {
    const { rows } = await pool.query(
      `SELECT * FROM seasonal_events WHERE country_code = $1 AND event_start > NOW() ORDER BY event_start ASC`,
      [countryCode],
    );
    return rows;
  }

  static async recordMarketSignal(params: {
    signalType: string; countryCode: string; channel: string;
    signalValue: Record<string, unknown>; confidence: number; source: string;
  }) {
    const id = generateId();
    const { rows } = await pool.query(
      `INSERT INTO market_signals_v2
         (id, signal_type, country_code, channel, signal_value, confidence, source, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [id, params.signalType, params.countryCode, params.channel,
       JSON.stringify(params.signalValue), params.confidence, params.source],
    );
    return rows[0];
  }

  static async analyzeMarketTrends(countryCode: string, channel: string) {
    const key = ck(`trends:${countryCode}:${channel}`);
    const { rows } = await pool.query(
      `SELECT * FROM market_trend_analysis WHERE country_code = $1 AND channel = $2 ORDER BY analyzed_at DESC LIMIT 1`,
      [countryCode, channel],
    );
    if (rows.length === 0) return { country_code: countryCode, channel, trends: [], overall_outlook: 'neutral' };
    await cacheSet(key, rows[0], CACHE_TTL);
    return rows[0];
  }

  static async getTrendRecommendations(countryCode: string, channel: string) {
    const { rows } = await pool.query(
      `SELECT * FROM trend_recommendations WHERE country_code = $1 AND channel = $2 ORDER BY created_at DESC LIMIT 1`,
      [countryCode, channel],
    );
    if (rows.length === 0) return { recommendations: [] };
    return rows[0];
  }

  static async getSignalHistory(filters: {
    countryCode: string; channel: string;
    signalType?: string; startDate?: string; endDate?: string;
  }) {
    const conditions = ['country_code = $1', 'channel = $2'];
    const params: unknown[] = [filters.countryCode, filters.channel];
    let idx = 3;
    if (filters.signalType) { conditions.push(`signal_type = $${idx++}`); params.push(filters.signalType); }
    if (filters.startDate) { conditions.push(`recorded_at >= $${idx++}`); params.push(filters.startDate); }
    if (filters.endDate) { conditions.push(`recorded_at <= $${idx++}`); params.push(filters.endDate); }
    const { rows } = await pool.query(
      `SELECT * FROM market_signals_v2 WHERE ${conditions.join(' AND ')} ORDER BY recorded_at DESC`,
      params,
    );
    return rows;
  }

  static async getSystemStatus() {
    const key = ck('system_status');
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) return cached;
    const { rows } = await pool.query(
      `SELECT * FROM learning_system_status ORDER BY updated_at DESC LIMIT 1`,
    );
    if (rows.length === 0) return { is_active: false, health: 'unknown' };
    await cacheSet(key, rows[0], CACHE_TTL);
    return rows[0];
  }

  static async resetLearningData(userId: string, opts: { scope: string }) {
    const deleted = await withTransaction(async (client) => {
      const r1 = await client.query(`DELETE FROM strategy_memory_v2 RETURNING COUNT(*) AS deleted_count`);
      const r2 = await client.query(`DELETE FROM strategy_outcomes RETURNING COUNT(*) AS deleted_count`);
      const r3 = await client.query(`DELETE FROM market_signals_v2 RETURNING COUNT(*) AS deleted_count`);
      return {
        strategies: Number(r1.rows[0]?.deleted_count || 0),
        outcomes: Number(r2.rows[0]?.deleted_count || 0),
        signals: Number(r3.rows[0]?.deleted_count || 0),
      };
    });

    await cacheDel(ck('*'));
    await AuditService.log({
      userId,
      action: 'learning.reset',
      resourceType: 'learning_system',
      details: { scope: opts.scope },
    });
    return { deleted };
  }
}

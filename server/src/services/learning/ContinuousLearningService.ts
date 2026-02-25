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
 *
 * Every learning event is audit-logged for full traceability.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
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

// Reinforcement learning defaults
const DEFAULT_EXPLORATION_RATE = 0.3;
const MIN_EXPLORATION_RATE = 0.05;
const EXPLORATION_DECAY = 0.995;
const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_DISCOUNT_FACTOR = 0.95;

// Reward weight constants
const REWARD_WEIGHT_ROAS = 0.3;
const REWARD_WEIGHT_CAC = 0.2;
const REWARD_WEIGHT_CONVERSION = 0.2;
const REWARD_WEIGHT_REVENUE = 0.15;
const REWARD_WEIGHT_MARGIN = 0.15;

// Exponential moving average smoothing factor for strategy memory
const EMA_ALPHA = 0.3;

// Creative fatigue thresholds
const FATIGUE_CTR_DECLINE_THRESHOLD = 20; // percent decline
const FATIGUE_CONVERSION_DECLINE_THRESHOLD = 15; // percent decline
const FATIGUE_HIGH_FREQUENCY_THRESHOLD = 5; // impressions per user
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

function cacheKey(...parts: string[]): string {
  return `${CACHE_PREFIX}:${parts.join(':')}`;
}

function mapRowToLearningRecord(row: Record<string, unknown>): LearningRecord {
  return {
    id: row.id as string,
    agent_type: row.agent_type as string,
    strategy_type: row.strategy_type as string,
    country: row.country as string,
    channel: row.channel as string,
    action_taken: row.action_taken as string,
    outcome_metrics:
      typeof row.outcome_metrics === 'string'
        ? JSON.parse(row.outcome_metrics)
        : (row.outcome_metrics as OutcomeMetrics),
    reward_score: Number(row.reward_score),
    context:
      typeof row.context === 'string'
        ? JSON.parse(row.context)
        : (row.context as Record<string, unknown>),
    recorded_at: row.recorded_at as string,
  };
}

function mapRowToStrategyMemory(row: Record<string, unknown>): StrategyMemory {
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
    parameters:
      typeof row.parameters === 'string'
        ? JSON.parse(row.parameters)
        : (row.parameters as Record<string, unknown>),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapRowToFatigueAlert(row: Record<string, unknown>): CreativeFatigueAlert {
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
    replacement_suggestions:
      typeof row.replacement_suggestions === 'string'
        ? JSON.parse(row.replacement_suggestions)
        : (row.replacement_suggestions as string[]),
    detected_at: row.detected_at as string,
  };
}

function mapRowToReinforcementState(row: Record<string, unknown>): ReinforcementState {
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

/**
 * Determine convergence status based on exploration rate and total episodes.
 */
function determineConvergenceStatus(
  explorationRate: number,
  totalEpisodes: number,
): ReinforcementState['convergence_status'] {
  if (explorationRate > 0.15 || totalEpisodes < 50) {
    return 'exploring';
  }
  if (explorationRate > MIN_EXPLORATION_RATE) {
    return 'converging';
  }
  return 'converged';
}

/**
 * Determine the recommended action for a creative based on fatigue indicators.
 */
function determineFatigueAction(
  ctrDecline: number,
  convDecline: number,
  frequency: number,
  daysRunning: number,
): CreativeFatigueAlert['recommended_action'] {
  if (ctrDecline > 40 || convDecline > 35 || frequency > 8) {
    return 'pause';
  }
  if (ctrDecline > 25 || convDecline > 20 || frequency > FATIGUE_HIGH_FREQUENCY_THRESHOLD) {
    return 'rotate';
  }
  if (ctrDecline > FATIGUE_CTR_DECLINE_THRESHOLD || convDecline > FATIGUE_CONVERSION_DECLINE_THRESHOLD) {
    return 'refresh';
  }
  if (daysRunning > 21 || ctrDecline > 10) {
    return 'monitor';
  }
  return 'monitor';
}

/**
 * Calculate a fatigue score on a 0-100 scale from decline metrics.
 */
function calculateFatigueScore(
  ctrDecline: number,
  convDecline: number,
  frequency: number,
  daysRunning: number,
): number {
  const ctrComponent = Math.min(ctrDecline / 50, 1) * 30;
  const convComponent = Math.min(convDecline / 40, 1) * 30;
  const freqComponent = Math.min(frequency / 10, 1) * 20;
  const daysComponent = Math.min(daysRunning / 60, 1) * 20;
  return Math.round(ctrComponent + convComponent + freqComponent + daysComponent);
}

/**
 * Calculate confidence score for a strategy based on sample size and consistency.
 */
function calculateStrategyConfidence(
  totalApplications: number,
  successCount: number,
  failureCount: number,
): number {
  if (totalApplications === 0) return 0;

  const successRate = successCount / totalApplications;
  // Wilson score interval lower bound for confidence
  const z = 1.96; // 95% confidence
  const n = totalApplications;
  const p = successRate;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const adjustment = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const lowerBound = (centre - adjustment) / denominator;

  // Scale to 0-1 and factor in sample size
  const sampleSizeFactor = Math.min(n / 100, 1);
  return Math.round(lowerBound * sampleSizeFactor * 100) / 100;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContinuousLearningService {
  // -------------------------------------------------------------------------
  // Reinforcement Learning Loop
  // -------------------------------------------------------------------------

  /**
   * Record a strategy outcome into the learning system.
   *
   * Inserts a new learning record capturing the action taken, the resulting
   * outcome metrics, and a computed reward score. This feeds the
   * reinforcement learning loop and strategy memory.
   */
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
      [
        id,
        record.agent_type,
        record.strategy_type,
        record.country,
        record.channel,
        record.action_taken,
        JSON.stringify(record.outcome_metrics),
        record.reward_score,
        JSON.stringify(record.context),
      ],
    );

    const learningRecord = mapRowToLearningRecord(result.rows[0]);

    // Invalidate related caches
    await cacheDel(cacheKey('metrics'));
    await cacheDel(cacheKey('country', record.country));
    await cacheDel(cacheKey('strategy', record.country, record.channel));

    await AuditService.log({
      action: 'learning.record_outcome',
      resourceType: 'learning_record',
      resourceId: id,
      details: {
        agent_type: record.agent_type,
        strategy_type: record.strategy_type,
        country: record.country,
        channel: record.channel,
        reward_score: record.reward_score,
      },
    });

    logger.info('Learning outcome recorded', {
      id,
      agent_type: record.agent_type,
      strategy_type: record.strategy_type,
      country: record.country,
      reward_score: record.reward_score,
    });

    return learningRecord;
  }

  /**
   * Calculate a reward score from outcome metrics.
   *
   * Uses a weighted formula combining ROAS, inverse CAC, conversion rate,
   * revenue, and profit margin. Context can provide normalization baselines.
   *
   * Formula:
   *   ROAS * 0.30
   * + (1 / CAC) * 0.20
   * + conversion_rate * 0.20
   * + normalized_revenue * 0.15
   * + margin * 0.15
   */
  static async calculateReward(
    metrics: OutcomeMetrics,
    context: Record<string, unknown>,
  ): Promise<number> {
    if (!metrics) {
      throw new ValidationError('Outcome metrics are required for reward calculation');
    }

    // Normalize ROAS: cap at 10x for scoring so outliers don't dominate
    const normalizedRoas = Math.min(metrics.roas, 10) / 10;

    // Inverse CAC: lower CAC is better; cap sensitivity at $1 floor
    const safeCac = Math.max(metrics.cac, 1);
    const normalizedInverseCac = Math.min(1 / safeCac, 1);

    // Conversion rate: already 0-1 (or percentage, normalize)
    const normalizedConversion = metrics.conversion_rate > 1
      ? Math.min(metrics.conversion_rate / 100, 1)
      : metrics.conversion_rate;

    // Revenue: normalize against baseline from context or use a default
    const revenueBaseline = (context.revenue_baseline as number) || 10000;
    const normalizedRevenue = Math.min(metrics.revenue / revenueBaseline, 1);

    // Margin: (revenue - cost) / revenue, capped at [0, 1]
    const margin = metrics.revenue > 0
      ? Math.max(0, Math.min((metrics.revenue - metrics.cost) / metrics.revenue, 1))
      : 0;

    const reward =
      normalizedRoas * REWARD_WEIGHT_ROAS +
      normalizedInverseCac * REWARD_WEIGHT_CAC +
      normalizedConversion * REWARD_WEIGHT_CONVERSION +
      normalizedRevenue * REWARD_WEIGHT_REVENUE +
      margin * REWARD_WEIGHT_MARGIN;

    // Scale to -1..1 range (shift and scale from 0..1 to -1..1)
    const scaledReward = Math.round((reward * 2 - 1) * 1000) / 1000;

    logger.debug('Reward calculated', {
      metrics,
      components: {
        normalizedRoas,
        normalizedInverseCac,
        normalizedConversion,
        normalizedRevenue,
        margin,
      },
      reward: scaledReward,
    });

    return scaledReward;
  }

  // -------------------------------------------------------------------------
  // Strategy Memory
  // -------------------------------------------------------------------------

  /**
   * Update the persistent memory for a strategy.
   *
   * Uses an exponential moving average (EMA) to smooth reward tracking.
   * If the strategy does not exist yet it is created with initial values.
   * Success and failure counts are updated based on reward sign.
   */
  static async updateStrategyMemory(
    strategyKey: string,
    country: string,
    channel: string,
    reward: number,
    params: Record<string, unknown>,
  ): Promise<StrategyMemory> {
    if (!strategyKey || !country || !channel) {
      throw new ValidationError('strategyKey, country, and channel are required');
    }

    // Check if strategy memory already exists
    const existing = await pool.query(
      `SELECT * FROM strategy_memory
       WHERE strategy_key = $1 AND country = $2 AND channel = $3`,
      [strategyKey, country, channel],
    );

    let memory: StrategyMemory;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const currentAvg = Number(row.average_reward);
      const currentBest = Number(row.best_reward);
      const currentWorst = Number(row.worst_reward);
      const totalApps = Number(row.total_applications) + 1;
      const successCount = Number(row.success_count) + (reward > 0 ? 1 : 0);
      const failureCount = Number(row.failure_count) + (reward <= 0 ? 1 : 0);

      // Exponential moving average for reward tracking
      const newAvgReward = currentAvg * (1 - EMA_ALPHA) + reward * EMA_ALPHA;
      const newBest = Math.max(currentBest, reward);
      const newWorst = Math.min(currentWorst, reward);

      const confidence = calculateStrategyConfidence(totalApps, successCount, failureCount);

      // Determine status based on confidence and performance
      let status: StrategyMemory['status'] = row.status as StrategyMemory['status'];
      if (totalApps >= 30 && confidence > 0.5) {
        status = 'active';
      } else if (totalApps >= 30 && confidence < 0.2) {
        status = 'deprecated';
      }

      const mergedParams = {
        ...(typeof row.parameters === 'string'
          ? JSON.parse(row.parameters)
          : row.parameters),
        ...params,
      };

      const result = await pool.query(
        `UPDATE strategy_memory
         SET success_count = $1,
             failure_count = $2,
             average_reward = $3,
             best_reward = $4,
             worst_reward = $5,
             total_applications = $6,
             last_applied = NOW(),
             confidence = $7,
             status = $8,
             parameters = $9,
             updated_at = NOW()
         WHERE strategy_key = $10 AND country = $11 AND channel = $12
         RETURNING *`,
        [
          successCount,
          failureCount,
          Math.round(newAvgReward * 10000) / 10000,
          Math.round(newBest * 10000) / 10000,
          Math.round(newWorst * 10000) / 10000,
          totalApps,
          confidence,
          status,
          JSON.stringify(mergedParams),
          strategyKey,
          country,
          channel,
        ],
      );

      memory = mapRowToStrategyMemory(result.rows[0]);
    } else {
      // Create new strategy memory entry
      const id = generateId();
      const isSuccess = reward > 0;
      const confidence = calculateStrategyConfidence(1, isSuccess ? 1 : 0, isSuccess ? 0 : 1);

      const result = await pool.query(
        `INSERT INTO strategy_memory
           (id, strategy_key, country, channel, success_count, failure_count,
            average_reward, best_reward, worst_reward, total_applications,
            last_applied, confidence, status, parameters, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), $10, 'testing', $11, NOW(), NOW())
         RETURNING *`,
        [
          id,
          strategyKey,
          country,
          channel,
          isSuccess ? 1 : 0,
          isSuccess ? 0 : 1,
          Math.round(reward * 10000) / 10000,
          Math.round(reward * 10000) / 10000,
          Math.round(reward * 10000) / 10000,
          confidence,
          JSON.stringify(params),
        ],
      );

      memory = mapRowToStrategyMemory(result.rows[0]);
    }

    // Invalidate strategy caches
    await cacheDel(cacheKey('strategy', country, channel));
    await cacheDel(cacheKey('strategy', country));
    await cacheDel(cacheKey('best_strategy', country, channel));

    await AuditService.log({
      action: 'learning.update_strategy_memory',
      resourceType: 'strategy_memory',
      resourceId: memory.id,
      details: {
        strategy_key: strategyKey,
        country,
        channel,
        reward,
        total_applications: memory.total_applications,
        confidence: memory.confidence,
      },
    });

    logger.info('Strategy memory updated', {
      strategy_key: strategyKey,
      country,
      channel,
      average_reward: memory.average_reward,
      confidence: memory.confidence,
      status: memory.status,
    });

    return memory;
  }

  /**
   * Retrieve stored strategy memories for a country with optional channel
   * filter. Cached for 5 minutes.
   */
  static async getStrategyMemory(
    country: string,
    channel?: string,
  ): Promise<StrategyMemory[]> {
    const ck = channel
      ? cacheKey('strategy', country, channel)
      : cacheKey('strategy', country);

    const cached = await cacheGet<StrategyMemory[]>(ck);
    if (cached) return cached;

    let result;
    if (channel) {
      result = await pool.query(
        `SELECT * FROM strategy_memory
         WHERE country = $1 AND channel = $2
         ORDER BY average_reward DESC, confidence DESC`,
        [country, channel],
      );
    } else {
      result = await pool.query(
        `SELECT * FROM strategy_memory
         WHERE country = $1
         ORDER BY average_reward DESC, confidence DESC`,
        [country],
      );
    }

    const memories = result.rows.map(mapRowToStrategyMemory);
    await cacheSet(ck, memories, CACHE_TTL);

    return memories;
  }

  /**
   * Get the highest-performing active strategy for a country + channel pair.
   *
   * Ranks strategies by average reward weighted by confidence. Only active
   * strategies with at least 5 applications are considered.
   */
  static async getBestStrategy(
    country: string,
    channel: string,
  ): Promise<StrategyMemory | null> {
    const ck = cacheKey('best_strategy', country, channel);
    const cached = await cacheGet<StrategyMemory | null>(ck);
    if (cached !== null) return cached;

    const result = await pool.query(
      `SELECT * FROM strategy_memory
       WHERE country = $1
         AND channel = $2
         AND status = 'active'
         AND total_applications >= 5
       ORDER BY (average_reward * confidence) DESC
       LIMIT 1`,
      [country, channel],
    );

    if (result.rows.length === 0) {
      await cacheSet(ck, null, CACHE_TTL);
      return null;
    }

    const best = mapRowToStrategyMemory(result.rows[0]);
    await cacheSet(ck, best, CACHE_TTL);

    return best;
  }

  // -------------------------------------------------------------------------
  // Country Performance Memory
  // -------------------------------------------------------------------------

  /**
   * Get aggregated performance memory for a country. Cached for 5 minutes.
   */
  static async getCountryPerformanceMemory(
    country: string,
  ): Promise<CountryPerformanceMemory> {
    const ck = cacheKey('country', country);
    const cached = await cacheGet<CountryPerformanceMemory>(ck);
    if (cached) return cached;

    const result = await pool.query(
      `SELECT * FROM country_performance_memory WHERE country = $1`,
      [country],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`No performance memory found for country: ${country}`);
    }

    const row = result.rows[0];
    const memory: CountryPerformanceMemory = {
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
      seasonal_patterns:
        typeof row.seasonal_patterns === 'string'
          ? JSON.parse(row.seasonal_patterns)
          : (row.seasonal_patterns as SeasonalPattern[]) || [],
      trend_direction: row.trend_direction as CountryPerformanceMemory['trend_direction'],
      last_updated: row.last_updated as string,
    };

    await cacheSet(ck, memory, CACHE_TTL);
    return memory;
  }

  /**
   * Recalculate and persist country performance from recent learning records.
   *
   * Aggregates all learning records for the given country, determines the
   * best/worst channels and strategies, computes trend direction, and
   * upserts the country_performance_memory row.
   */
  static async updateCountryPerformanceMemory(
    country: string,
  ): Promise<CountryPerformanceMemory> {
    // Aggregate metrics from learning records for this country
    const aggregateResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_campaigns,
         COALESCE(SUM((outcome_metrics->>'cost')::numeric), 0) AS total_spend,
         COALESCE(SUM((outcome_metrics->>'revenue')::numeric), 0) AS total_revenue,
         COALESCE(AVG((outcome_metrics->>'cac')::numeric), 0) AS avg_cac,
         COALESCE(AVG((outcome_metrics->>'conversion_rate')::numeric), 0) AS avg_conversion_rate
       FROM learning_records
       WHERE country = $1`,
      [country],
    );

    const agg = aggregateResult.rows[0];
    const totalSpend = Number(agg.total_spend);
    const totalRevenue = Number(agg.total_revenue);
    const overallRoas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0;

    // Determine best and worst channels by average reward
    const channelResult = await pool.query(
      `SELECT channel, AVG(reward_score) AS avg_reward
       FROM learning_records
       WHERE country = $1 AND channel IS NOT NULL AND channel != ''
       GROUP BY channel
       ORDER BY avg_reward DESC`,
      [country],
    );

    const bestChannel = channelResult.rows.length > 0
      ? (channelResult.rows[0].channel as string)
      : 'N/A';
    const worstChannel = channelResult.rows.length > 0
      ? (channelResult.rows[channelResult.rows.length - 1].channel as string)
      : 'N/A';

    // Determine best strategy by average reward from strategy memory
    const strategyResult = await pool.query(
      `SELECT strategy_key FROM strategy_memory
       WHERE country = $1 AND status = 'active'
       ORDER BY average_reward DESC
       LIMIT 1`,
      [country],
    );

    const bestStrategy = strategyResult.rows.length > 0
      ? (strategyResult.rows[0].strategy_key as string)
      : 'N/A';

    // Determine trend direction by comparing recent vs older performance
    const trendResult = await pool.query(
      `SELECT
         COALESCE(AVG(CASE WHEN recorded_at > NOW() - INTERVAL '30 days'
           THEN reward_score END), 0) AS recent_avg,
         COALESCE(AVG(CASE WHEN recorded_at <= NOW() - INTERVAL '30 days'
           AND recorded_at > NOW() - INTERVAL '90 days'
           THEN reward_score END), 0) AS older_avg
       FROM learning_records
       WHERE country = $1`,
      [country],
    );

    const recentAvg = Number(trendResult.rows[0].recent_avg);
    const olderAvg = Number(trendResult.rows[0].older_avg);
    let trendDirection: CountryPerformanceMemory['trend_direction'] = 'stable';
    if (olderAvg !== 0) {
      const changeRate = (recentAvg - olderAvg) / Math.abs(olderAvg);
      if (changeRate > 0.1) trendDirection = 'improving';
      else if (changeRate < -0.1) trendDirection = 'declining';
    }

    // Fetch or compute seasonal patterns
    const seasonalPatterns = await ContinuousLearningService.analyzeSeasonalPatterns(
      country,
      'all',
    );

    // Upsert country performance memory
    await pool.query(
      `INSERT INTO country_performance_memory
         (country, total_campaigns, total_spend, total_revenue, overall_roas,
          best_channel, worst_channel, best_strategy, avg_cac,
          avg_conversion_rate, seasonal_patterns, trend_direction, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (country) DO UPDATE SET
         total_campaigns = EXCLUDED.total_campaigns,
         total_spend = EXCLUDED.total_spend,
         total_revenue = EXCLUDED.total_revenue,
         overall_roas = EXCLUDED.overall_roas,
         best_channel = EXCLUDED.best_channel,
         worst_channel = EXCLUDED.worst_channel,
         best_strategy = EXCLUDED.best_strategy,
         avg_cac = EXCLUDED.avg_cac,
         avg_conversion_rate = EXCLUDED.avg_conversion_rate,
         seasonal_patterns = EXCLUDED.seasonal_patterns,
         trend_direction = EXCLUDED.trend_direction,
         last_updated = NOW()`,
      [
        country,
        Number(agg.total_campaigns),
        Math.round(totalSpend * 100) / 100,
        Math.round(totalRevenue * 100) / 100,
        overallRoas,
        bestChannel,
        worstChannel,
        bestStrategy,
        Math.round(Number(agg.avg_cac) * 100) / 100,
        Math.round(Number(agg.avg_conversion_rate) * 10000) / 10000,
        JSON.stringify(seasonalPatterns),
        trendDirection,
      ],
    );

    // Invalidate cache
    await cacheDel(cacheKey('country', country));

    const memory: CountryPerformanceMemory = {
      country,
      total_campaigns: Number(agg.total_campaigns),
      total_spend: Math.round(totalSpend * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      overall_roas: overallRoas,
      best_channel: bestChannel,
      worst_channel: worstChannel,
      best_strategy: bestStrategy,
      avg_cac: Math.round(Number(agg.avg_cac) * 100) / 100,
      avg_conversion_rate: Math.round(Number(agg.avg_conversion_rate) * 10000) / 10000,
      seasonal_patterns: seasonalPatterns,
      trend_direction: trendDirection,
      last_updated: new Date().toISOString(),
    };

    await AuditService.log({
      action: 'learning.update_country_memory',
      resourceType: 'country_performance_memory',
      resourceId: country,
      details: {
        total_campaigns: memory.total_campaigns,
        overall_roas: memory.overall_roas,
        trend_direction: memory.trend_direction,
      },
    });

    logger.info('Country performance memory updated', {
      country,
      total_campaigns: memory.total_campaigns,
      overall_roas: memory.overall_roas,
      trend_direction: memory.trend_direction,
    });

    return memory;
  }

  // -------------------------------------------------------------------------
  // Creative Fatigue Detection
  // -------------------------------------------------------------------------

  /**
   * Scan for creative fatigue patterns across active creatives.
   *
   * Compares current CTR and conversion rate against the rolling window
   * baseline (7-14 days). Generates alerts for creatives showing
   * significant performance decline.
   */
  static async detectCreativeFatigue(
    campaignId?: string,
  ): Promise<CreativeFatigueAlert[]> {
    const params: unknown[] = [FATIGUE_ROLLING_WINDOW_DAYS];
    let campaignFilter = '';

    if (campaignId) {
      campaignFilter = 'AND c.campaign_id = $2';
      params.push(campaignId);
    }

    // Query creatives with their performance trajectory over the rolling window
    const result = await pool.query(
      `SELECT
         c.id AS creative_id,
         c.name AS creative_name,
         c.campaign_id,
         EXTRACT(DAY FROM NOW() - c.created_at)::int AS days_running,
         COALESCE(baseline.avg_ctr, 0) AS baseline_ctr,
         COALESCE(baseline.avg_conv, 0) AS baseline_conv,
         COALESCE(recent.avg_ctr, 0) AS recent_ctr,
         COALESCE(recent.avg_conv, 0) AS recent_conv,
         COALESCE(recent.avg_frequency, 0) AS frequency
       FROM creatives c
       LEFT JOIN LATERAL (
         SELECT
           AVG((metrics->>'ctr')::numeric) AS avg_ctr,
           AVG((metrics->>'conversion_rate')::numeric) AS avg_conv
         FROM creative_performance cp
         WHERE cp.creative_id = c.id
           AND cp.recorded_at BETWEEN NOW() - INTERVAL '28 days'
                                   AND NOW() - ($1 || ' days')::interval
       ) baseline ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           AVG((metrics->>'ctr')::numeric) AS avg_ctr,
           AVG((metrics->>'conversion_rate')::numeric) AS avg_conv,
           AVG((metrics->>'frequency')::numeric) AS avg_frequency
         FROM creative_performance cp
         WHERE cp.creative_id = c.id
           AND cp.recorded_at > NOW() - ($1 || ' days')::interval
       ) recent ON TRUE
       WHERE c.status = 'active'
         ${campaignFilter}
       HAVING COALESCE(baseline.avg_ctr, 0) > 0`,
      params,
    );

    const alerts: CreativeFatigueAlert[] = [];

    for (const row of result.rows) {
      const baselineCtr = Number(row.baseline_ctr);
      const recentCtr = Number(row.recent_ctr);
      const baselineConv = Number(row.baseline_conv);
      const recentConv = Number(row.recent_conv);
      const frequency = Number(row.frequency);
      const daysRunning = Number(row.days_running);

      // Calculate percentage declines
      const ctrDeclinePct = baselineCtr > 0
        ? Math.round(((baselineCtr - recentCtr) / baselineCtr) * 10000) / 100
        : 0;
      const convDeclinePct = baselineConv > 0
        ? Math.round(((baselineConv - recentConv) / baselineConv) * 10000) / 100
        : 0;

      // Only generate alert if there is meaningful decline
      if (
        ctrDeclinePct > 10 ||
        convDeclinePct > 10 ||
        frequency > FATIGUE_HIGH_FREQUENCY_THRESHOLD ||
        daysRunning > 30
      ) {
        const fatigueScore = calculateFatigueScore(
          ctrDeclinePct,
          convDeclinePct,
          frequency,
          daysRunning,
        );

        const recommendedAction = determineFatigueAction(
          ctrDeclinePct,
          convDeclinePct,
          frequency,
          daysRunning,
        );

        // Generate replacement suggestions based on context
        const replacementSuggestions = await ContinuousLearningService.generateReplacementSuggestions(
          row.campaign_id as string,
          row.creative_id as string,
        );

        const alertId = generateId();

        // Persist the alert
        await pool.query(
          `INSERT INTO creative_fatigue_alerts
             (id, creative_id, creative_name, campaign_id, fatigue_score,
              days_running, ctr_decline_pct, conversion_decline_pct, frequency,
              recommended_action, replacement_suggestions, detected_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'active')
           ON CONFLICT (creative_id) WHERE status = 'active'
           DO UPDATE SET
             fatigue_score = EXCLUDED.fatigue_score,
             ctr_decline_pct = EXCLUDED.ctr_decline_pct,
             conversion_decline_pct = EXCLUDED.conversion_decline_pct,
             frequency = EXCLUDED.frequency,
             recommended_action = EXCLUDED.recommended_action,
             replacement_suggestions = EXCLUDED.replacement_suggestions,
             detected_at = NOW()`,
          [
            alertId,
            row.creative_id,
            row.creative_name,
            row.campaign_id,
            fatigueScore,
            daysRunning,
            ctrDeclinePct,
            convDeclinePct,
            frequency,
            recommendedAction,
            JSON.stringify(replacementSuggestions),
          ],
        );

        alerts.push({
          id: alertId,
          creative_id: row.creative_id as string,
          creative_name: row.creative_name as string,
          campaign_id: row.campaign_id as string,
          fatigue_score: fatigueScore,
          days_running: daysRunning,
          ctr_decline_pct: ctrDeclinePct,
          conversion_decline_pct: convDeclinePct,
          frequency,
          recommended_action: recommendedAction,
          replacement_suggestions: replacementSuggestions,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // Invalidate fatigue alert cache
    await cacheDel(cacheKey('fatigue_alerts'));

    if (alerts.length > 0) {
      await AuditService.log({
        action: 'learning.detect_creative_fatigue',
        resourceType: 'creative_fatigue',
        details: {
          alerts_count: alerts.length,
          campaign_id: campaignId || 'all',
          severities: alerts.map((a) => ({
            creative_id: a.creative_id,
            score: a.fatigue_score,
            action: a.recommended_action,
          })),
        },
      });

      logger.info('Creative fatigue detection completed', {
        alerts_count: alerts.length,
        campaign_id: campaignId || 'all',
      });
    }

    return alerts;
  }

  /**
   * Generate replacement suggestions for a fatigued creative.
   * Looks at high-performing creatives in the same campaign for inspiration.
   */
  private static async generateReplacementSuggestions(
    campaignId: string,
    excludeCreativeId: string,
  ): Promise<string[]> {
    const result = await pool.query(
      `SELECT c.name, cp.metrics
       FROM creatives c
       JOIN creative_performance cp ON cp.creative_id = c.id
       WHERE c.campaign_id = $1
         AND c.id != $2
         AND c.status = 'active'
       ORDER BY (cp.metrics->>'ctr')::numeric DESC
       LIMIT 3`,
      [campaignId, excludeCreativeId],
    );

    const suggestions: string[] = [];

    if (result.rows.length > 0) {
      for (const row of result.rows) {
        suggestions.push(`Rotate to creative: ${row.name as string}`);
      }
    }

    suggestions.push('Create new variation with updated messaging');
    suggestions.push('Test a different creative format');

    return suggestions;
  }

  /**
   * Get current creative fatigue alerts, optionally filtered by status.
   * Cached for 5 minutes.
   */
  static async getCreativeFatigueAlerts(
    status?: string,
  ): Promise<CreativeFatigueAlert[]> {
    const ck = cacheKey('fatigue_alerts', status || 'all');
    const cached = await cacheGet<CreativeFatigueAlert[]>(ck);
    if (cached) return cached;

    let result;
    if (status) {
      result = await pool.query(
        `SELECT * FROM creative_fatigue_alerts
         WHERE status = $1
         ORDER BY fatigue_score DESC, detected_at DESC`,
        [status],
      );
    } else {
      result = await pool.query(
        `SELECT * FROM creative_fatigue_alerts
         ORDER BY fatigue_score DESC, detected_at DESC`,
      );
    }

    const alerts = result.rows.map(mapRowToFatigueAlert);
    await cacheSet(ck, alerts, CACHE_TTL);

    return alerts;
  }

  // -------------------------------------------------------------------------
  // Seasonal Adjustment AI
  // -------------------------------------------------------------------------

  /**
   * Analyze historical data to detect seasonal patterns for a country/channel.
   *
   * Groups learning records by month, calculates a performance index
   * relative to the annual average, and identifies peaks and troughs.
   */
  static async analyzeSeasonalPatterns(
    country: string,
    channel: string,
  ): Promise<SeasonalPattern[]> {
    const ck = cacheKey('seasonal', country, channel);
    const cached = await cacheGet<SeasonalPattern[]>(ck);
    if (cached) return cached;

    let result;
    if (channel === 'all') {
      result = await pool.query(
        `SELECT
           EXTRACT(MONTH FROM recorded_at)::int AS month,
           AVG(reward_score) AS avg_reward,
           AVG((outcome_metrics->>'roas')::numeric) AS avg_roas,
           COUNT(*) AS sample_count
         FROM learning_records
         WHERE country = $1
         GROUP BY EXTRACT(MONTH FROM recorded_at)
         ORDER BY month`,
        [country],
      );
    } else {
      result = await pool.query(
        `SELECT
           EXTRACT(MONTH FROM recorded_at)::int AS month,
           AVG(reward_score) AS avg_reward,
           AVG((outcome_metrics->>'roas')::numeric) AS avg_roas,
           COUNT(*) AS sample_count
         FROM learning_records
         WHERE country = $1 AND channel = $2
         GROUP BY EXTRACT(MONTH FROM recorded_at)
         ORDER BY month`,
        [country, channel],
      );
    }

    if (result.rows.length === 0) {
      return [];
    }

    // Calculate overall average performance
    const overallAvg =
      result.rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.avg_reward), 0) /
      result.rows.length;

    // Find max and min for peak/trough detection
    const rewards = result.rows.map((r: Record<string, unknown>) => Number(r.avg_reward));
    const maxReward = Math.max(...rewards);
    const minReward = Math.min(...rewards);
    const range = maxReward - minReward;
    const peakThreshold = maxReward - range * 0.15;
    const troughThreshold = minReward + range * 0.15;

    const patterns: SeasonalPattern[] = result.rows.map((row: Record<string, unknown>) => {
      const month = Number(row.month);
      const avgReward = Number(row.avg_reward);
      const avgRoas = Number(row.avg_roas);
      const performanceIndex =
        overallAvg !== 0 ? Math.round((avgReward / overallAvg) * 100) / 100 : 1;

      const isPeak = avgReward >= peakThreshold;
      const isTrough = avgReward <= troughThreshold;

      // Budget multiplier: scale up during peaks, scale down during troughs
      let budgetMultiplier = 1.0;
      if (isPeak) {
        budgetMultiplier = Math.min(1.0 + (performanceIndex - 1) * 0.5, 1.5);
      } else if (isTrough) {
        budgetMultiplier = Math.max(0.5, 1.0 - (1 - performanceIndex) * 0.5);
      } else {
        budgetMultiplier = 0.9 + performanceIndex * 0.1;
      }

      let notes = '';
      if (isPeak) notes = `Peak performance month for ${country}`;
      else if (isTrough) notes = `Low performance month - consider reduced spend`;
      else notes = `Average performance month`;

      return {
        month,
        month_name: MONTH_NAMES[month] || `Month ${month}`,
        performance_index: performanceIndex,
        is_peak: isPeak,
        is_trough: isTrough,
        recommended_budget_multiplier: Math.round(budgetMultiplier * 100) / 100,
        historical_roas: Math.round(avgRoas * 100) / 100,
        notes,
      };
    });

    await cacheSet(ck, patterns, CACHE_TTL);

    return patterns;
  }

  /**
   * Get the current seasonal adjustment recommendation for a country/channel.
   *
   * Looks at the current month's seasonal pattern, computes budget and bid
   * adjustments, and suggests creative themes appropriate for the season.
   */
  static async getSeasonalAdjustment(
    country: string,
    channel: string,
  ): Promise<SeasonalAdjustment> {
    const ck = cacheKey('seasonal_adj', country, channel);
    const cached = await cacheGet<SeasonalAdjustment>(ck);
    if (cached) return cached;

    const currentMonth = new Date().getMonth() + 1; // 1-12

    // Get seasonal patterns for this country/channel
    const patterns = await ContinuousLearningService.analyzeSeasonalPatterns(
      country,
      channel,
    );

    const currentPattern = patterns.find((p) => p.month === currentMonth);

    // Get the current average daily budget for this country/channel
    const budgetResult = await pool.query(
      `SELECT COALESCE(AVG((outcome_metrics->>'cost')::numeric), 0) AS avg_daily_cost
       FROM learning_records
       WHERE country = $1
         AND channel = $2
         AND recorded_at > NOW() - INTERVAL '30 days'`,
      [country, channel],
    );

    const currentDailyCost = Number(budgetResult.rows[0].avg_daily_cost);

    const adjustmentFactor = currentPattern
      ? currentPattern.recommended_budget_multiplier
      : 1.0;

    const budgetRecommendation = Math.round(currentDailyCost * adjustmentFactor * 100) / 100;

    // Bid adjustment mirrors budget but with dampened magnitude
    const bidAdjustment = Math.round((1 + (adjustmentFactor - 1) * 0.5) * 100) / 100;

    // Determine creative theme suggestions based on month and performance
    const themeSuggestions = ContinuousLearningService.getCreativeThemeSuggestions(
      currentMonth,
      currentPattern?.is_peak || false,
    );

    // Calculate confidence based on available data
    const dataPointResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM learning_records
       WHERE country = $1 AND channel = $2
         AND EXTRACT(MONTH FROM recorded_at) = $3`,
      [country, channel, currentMonth],
    );
    const dataPoints = Number(dataPointResult.rows[0].cnt);
    const confidence = Math.min(dataPoints / 50, 1);

    // Build reasoning
    let reasoning = `Based on ${dataPoints} historical data points for ${MONTH_NAMES[currentMonth]}. `;
    if (currentPattern?.is_peak) {
      reasoning += `This is historically a peak performance month (index: ${currentPattern.performance_index}). Recommend increased investment.`;
    } else if (currentPattern?.is_trough) {
      reasoning += `This is historically a low-performance month (index: ${currentPattern.performance_index}). Recommend conservative spending.`;
    } else {
      reasoning += `Performance is within normal range for this period. Maintain steady investment.`;
    }

    const adjustment: SeasonalAdjustment = {
      id: generateId(),
      country,
      channel,
      current_month: currentMonth,
      adjustment_factor: adjustmentFactor,
      budget_recommendation: budgetRecommendation,
      bid_adjustment: bidAdjustment,
      creative_theme_suggestions: themeSuggestions,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
    };

    await cacheSet(ck, adjustment, CACHE_TTL);

    return adjustment;
  }

  /**
   * Generate creative theme suggestions based on month and performance status.
   */
  private static getCreativeThemeSuggestions(
    month: number,
    isPeak: boolean,
  ): string[] {
    const suggestions: string[] = [];

    // Seasonal themes based on quarter
    if (month >= 1 && month <= 3) {
      suggestions.push('New year / fresh start messaging');
      suggestions.push('Winter season themes');
      suggestions.push('Q1 planning and goal-setting angles');
    } else if (month >= 4 && month <= 6) {
      suggestions.push('Spring renewal and growth themes');
      suggestions.push('Mid-year momentum messaging');
      suggestions.push('Outdoor and activity-focused creative');
    } else if (month >= 7 && month <= 9) {
      suggestions.push('Summer / back-to-school themes');
      suggestions.push('Mid-year review and results messaging');
      suggestions.push('Pre-holiday preparation angles');
    } else {
      suggestions.push('Holiday and end-of-year themes');
      suggestions.push('Urgency and limited-time offers');
      suggestions.push('Gift-giving and celebration creative');
    }

    if (isPeak) {
      suggestions.push('Capitalize on high engagement - test bold creative');
      suggestions.push('Scale proven ad formats with higher budgets');
    } else {
      suggestions.push('Focus on value propositions and trust-building');
      suggestions.push('Test new creative concepts at lower cost');
    }

    return suggestions;
  }

  // -------------------------------------------------------------------------
  // Market Trend Detection & Optimization
  // -------------------------------------------------------------------------

  /**
   * Detect current market trends from learning record patterns.
   *
   * Analyzes performance shifts across channels and countries to identify
   * emerging, growing, stable, or declining trends.
   */
  static async detectMarketTrends(): Promise<MarketTrend[]> {
    const ck = cacheKey('market_trends');
    const cached = await cacheGet<MarketTrend[]>(ck);
    if (cached) return cached;

    // Detect channel-level trends by comparing recent vs. historical performance
    const channelTrendResult = await pool.query(
      `SELECT
         channel,
         AVG(CASE WHEN recorded_at > NOW() - INTERVAL '14 days'
             THEN reward_score END) AS recent_reward,
         AVG(CASE WHEN recorded_at BETWEEN NOW() - INTERVAL '60 days'
             AND NOW() - INTERVAL '14 days'
             THEN reward_score END) AS historical_reward,
         COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '14 days'
             THEN 1 END)::int AS recent_count,
         ARRAY_AGG(DISTINCT country) AS countries
       FROM learning_records
       WHERE recorded_at > NOW() - INTERVAL '60 days'
         AND channel IS NOT NULL AND channel != ''
       GROUP BY channel
       HAVING COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '14 days' THEN 1 END) >= 3`,
    );

    const trends: MarketTrend[] = [];

    for (const row of channelTrendResult.rows) {
      const recentReward = Number(row.recent_reward);
      const historicalReward = Number(row.historical_reward);
      const recentCount = Number(row.recent_count);
      const channel = row.channel as string;
      const countries = (row.countries as string[]) || [];

      if (historicalReward === 0) continue;

      const changeRate = (recentReward - historicalReward) / Math.abs(historicalReward);

      let trendType: MarketTrend['trend_type'];
      if (changeRate > 0.25) trendType = 'emerging';
      else if (changeRate > 0.1) trendType = 'growing';
      else if (changeRate > -0.1) trendType = 'stable';
      else trendType = 'declining';

      // Only report non-stable trends
      if (trendType === 'stable') continue;

      const impactScore = Math.round(Math.abs(changeRate) * 100) / 100;
      const confidence = Math.min(recentCount / 20, 1);

      const recommendedActions = ContinuousLearningService.generateTrendActions(
        trendType,
        channel,
        changeRate,
      );

      const trendId = generateId();

      // Persist the detected trend
      await pool.query(
        `INSERT INTO market_trends
           (id, trend_type, category, description, impact_score,
            affected_channels, affected_countries, recommended_actions,
            detected_at, confidence, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, 'active')`,
        [
          trendId,
          trendType,
          'channel_performance',
          `${channel} channel is ${trendType} with ${Math.round(changeRate * 100)}% performance change`,
          impactScore,
          JSON.stringify([channel]),
          JSON.stringify(countries),
          JSON.stringify(recommendedActions),
          Math.round(confidence * 100) / 100,
        ],
      );

      trends.push({
        id: trendId,
        trend_type: trendType,
        category: 'channel_performance',
        description: `${channel} channel is ${trendType} with ${Math.round(changeRate * 100)}% performance change`,
        impact_score: impactScore,
        affected_channels: [channel],
        affected_countries: countries,
        recommended_actions: recommendedActions,
        detected_at: new Date().toISOString(),
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    // Detect strategy-level trends
    const strategyTrendResult = await pool.query(
      `SELECT
         strategy_type,
         AVG(CASE WHEN recorded_at > NOW() - INTERVAL '14 days'
             THEN reward_score END) AS recent_reward,
         AVG(CASE WHEN recorded_at BETWEEN NOW() - INTERVAL '60 days'
             AND NOW() - INTERVAL '14 days'
             THEN reward_score END) AS historical_reward,
         COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '14 days'
             THEN 1 END)::int AS recent_count,
         ARRAY_AGG(DISTINCT channel) AS channels,
         ARRAY_AGG(DISTINCT country) AS countries
       FROM learning_records
       WHERE recorded_at > NOW() - INTERVAL '60 days'
       GROUP BY strategy_type
       HAVING COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '14 days' THEN 1 END) >= 3`,
    );

    for (const row of strategyTrendResult.rows) {
      const recentReward = Number(row.recent_reward);
      const historicalReward = Number(row.historical_reward);
      const recentCount = Number(row.recent_count);
      const strategyType = row.strategy_type as string;
      const channels = (row.channels as string[]) || [];
      const countries = (row.countries as string[]) || [];

      if (historicalReward === 0) continue;

      const changeRate = (recentReward - historicalReward) / Math.abs(historicalReward);

      let trendType: MarketTrend['trend_type'];
      if (changeRate > 0.25) trendType = 'emerging';
      else if (changeRate > 0.1) trendType = 'growing';
      else if (changeRate > -0.1) trendType = 'stable';
      else trendType = 'declining';

      if (trendType === 'stable') continue;

      const impactScore = Math.round(Math.abs(changeRate) * 100) / 100;
      const confidence = Math.min(recentCount / 20, 1);

      const recommendedActions: string[] = [];
      if (trendType === 'emerging' || trendType === 'growing') {
        recommendedActions.push(`Increase allocation to ${strategyType} strategy`);
        recommendedActions.push(`Expand ${strategyType} to additional markets`);
      } else {
        recommendedActions.push(`Evaluate and revise ${strategyType} strategy parameters`);
        recommendedActions.push(`Consider reducing reliance on ${strategyType}`);
      }

      const trendId = generateId();

      await pool.query(
        `INSERT INTO market_trends
           (id, trend_type, category, description, impact_score,
            affected_channels, affected_countries, recommended_actions,
            detected_at, confidence, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, 'active')`,
        [
          trendId,
          trendType,
          'strategy_performance',
          `${strategyType} strategy is ${trendType} with ${Math.round(changeRate * 100)}% performance change`,
          impactScore,
          JSON.stringify(channels),
          JSON.stringify(countries),
          JSON.stringify(recommendedActions),
          Math.round(confidence * 100) / 100,
        ],
      );

      trends.push({
        id: trendId,
        trend_type: trendType,
        category: 'strategy_performance',
        description: `${strategyType} strategy is ${trendType} with ${Math.round(changeRate * 100)}% performance change`,
        impact_score: impactScore,
        affected_channels: channels,
        affected_countries: countries,
        recommended_actions: recommendedActions,
        detected_at: new Date().toISOString(),
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    await cacheSet(ck, trends, CACHE_TTL);

    if (trends.length > 0) {
      await AuditService.log({
        action: 'learning.detect_market_trends',
        resourceType: 'market_trend',
        details: {
          trends_detected: trends.length,
          trend_types: trends.map((t) => t.trend_type),
        },
      });

      logger.info('Market trends detected', {
        trends_count: trends.length,
        emerging: trends.filter((t) => t.trend_type === 'emerging').length,
        growing: trends.filter((t) => t.trend_type === 'growing').length,
        declining: trends.filter((t) => t.trend_type === 'declining').length,
      });
    }

    return trends;
  }

  /**
   * Generate recommended actions for a detected trend.
   */
  private static generateTrendActions(
    trendType: MarketTrend['trend_type'],
    channel: string,
    changeRate: number,
  ): string[] {
    const actions: string[] = [];
    const changePct = Math.round(Math.abs(changeRate) * 100);

    switch (trendType) {
      case 'emerging':
        actions.push(`Rapidly increase investment in ${channel} (${changePct}% improvement detected)`);
        actions.push(`Allocate testing budget to explore ${channel} opportunities`);
        actions.push(`Brief creative team on ${channel}-optimized content`);
        break;
      case 'growing':
        actions.push(`Gradually scale ${channel} budget by 10-20%`);
        actions.push(`Optimize existing ${channel} campaigns for higher efficiency`);
        actions.push(`Monitor ${channel} for sustained growth before major scaling`);
        break;
      case 'declining':
        actions.push(`Reduce ${channel} budget allocation by ${Math.min(changePct, 30)}%`);
        actions.push(`Audit ${channel} campaigns for performance issues`);
        actions.push(`Shift budget toward better-performing channels`);
        actions.push(`Investigate root cause of ${channel} decline`);
        break;
      default:
        actions.push(`Maintain current ${channel} strategy`);
    }

    return actions;
  }

  /**
   * Generate an optimization plan for a specific detected trend.
   *
   * Looks up the trend, analyzes related strategies, and produces
   * actionable recommendations with expected improvement estimates.
   */
  static async optimizeForTrend(trendId: string): Promise<TrendOptimization> {
    // Fetch the trend
    const trendResult = await pool.query(
      `SELECT * FROM market_trends WHERE id = $1`,
      [trendId],
    );

    if (trendResult.rows.length === 0) {
      throw new NotFoundError(`Market trend not found: ${trendId}`);
    }

    const row = trendResult.rows[0];
    const trendType = row.trend_type as MarketTrend['trend_type'];
    const affectedChannels: string[] =
      typeof row.affected_channels === 'string'
        ? JSON.parse(row.affected_channels)
        : (row.affected_channels as string[]);
    const affectedCountries: string[] =
      typeof row.affected_countries === 'string'
        ? JSON.parse(row.affected_countries)
        : (row.affected_countries as string[]);
    const impactScore = Number(row.impact_score);

    // Get current strategy parameters for affected channels/countries
    const currentStrategyResult = await pool.query(
      `SELECT strategy_key, parameters, average_reward, confidence
       FROM strategy_memory
       WHERE channel = ANY($1::text[])
         AND country = ANY($2::text[])
         AND status = 'active'
       ORDER BY average_reward DESC
       LIMIT 5`,
      [affectedChannels, affectedCountries],
    );

    const currentStrategy: Record<string, unknown> = {};
    const recommendedStrategy: Record<string, unknown> = {};
    const implementationSteps: string[] = [];

    if (currentStrategyResult.rows.length > 0) {
      const topStrategy = currentStrategyResult.rows[0];
      currentStrategy.top_strategy = topStrategy.strategy_key;
      currentStrategy.parameters =
        typeof topStrategy.parameters === 'string'
          ? JSON.parse(topStrategy.parameters)
          : topStrategy.parameters;
      currentStrategy.average_reward = Number(topStrategy.average_reward);
    }

    // Build recommendations based on trend type
    let expectedImprovement = 0;
    let riskLevel: TrendOptimization['risk_level'] = 'medium';
    let optimizationType = '';

    switch (trendType) {
      case 'emerging':
        optimizationType = 'aggressive_expansion';
        expectedImprovement = Math.min(impactScore * 0.6, 0.4);
        riskLevel = 'medium';
        recommendedStrategy.budget_multiplier = 1.5;
        recommendedStrategy.bid_strategy = 'maximize_conversions';
        recommendedStrategy.audience_expansion = true;
        implementationSteps.push('Increase daily budget by 50% for affected channels');
        implementationSteps.push('Switch bid strategy to maximize conversions');
        implementationSteps.push('Expand audience targeting by 20%');
        implementationSteps.push('Create new ad variations tailored to emerging trend');
        implementationSteps.push('Set up monitoring alerts for performance changes');
        break;

      case 'growing':
        optimizationType = 'measured_scaling';
        expectedImprovement = Math.min(impactScore * 0.4, 0.25);
        riskLevel = 'low';
        recommendedStrategy.budget_multiplier = 1.2;
        recommendedStrategy.bid_strategy = 'target_roas';
        recommendedStrategy.creative_refresh = true;
        implementationSteps.push('Increase daily budget by 20% for affected channels');
        implementationSteps.push('Set target ROAS based on recent performance data');
        implementationSteps.push('Refresh creative assets to maintain engagement');
        implementationSteps.push('Review and optimize audience segments');
        break;

      case 'declining':
        optimizationType = 'defensive_optimization';
        expectedImprovement = Math.min(impactScore * 0.3, 0.15);
        riskLevel = 'low';
        recommendedStrategy.budget_multiplier = 0.7;
        recommendedStrategy.bid_strategy = 'minimize_cost';
        recommendedStrategy.reallocation_target = 'best_performing_channels';
        implementationSteps.push('Reduce budget by 30% for declining channels');
        implementationSteps.push('Reallocate budget to top-performing channels');
        implementationSteps.push('Audit campaign targeting for quality issues');
        implementationSteps.push('Pause underperforming ad groups');
        implementationSteps.push('Test new creative concepts at small scale');
        break;

      default:
        optimizationType = 'maintenance';
        expectedImprovement = 0;
        riskLevel = 'low';
        implementationSteps.push('Continue monitoring current strategy');
        implementationSteps.push('Run incremental A/B tests');
    }

    const optimization: TrendOptimization = {
      trend_id: trendId,
      optimization_type: optimizationType,
      current_strategy: currentStrategy,
      recommended_strategy: recommendedStrategy,
      expected_improvement: Math.round(expectedImprovement * 100) / 100,
      risk_level: riskLevel,
      implementation_steps: implementationSteps,
    };

    await AuditService.log({
      action: 'learning.optimize_for_trend',
      resourceType: 'trend_optimization',
      resourceId: trendId,
      details: {
        optimization_type: optimizationType,
        expected_improvement: optimization.expected_improvement,
        risk_level: riskLevel,
      },
    });

    logger.info('Trend optimization generated', {
      trend_id: trendId,
      optimization_type: optimizationType,
      expected_improvement: optimization.expected_improvement,
    });

    return optimization;
  }

  // -------------------------------------------------------------------------
  // Reinforcement Learning State
  // -------------------------------------------------------------------------

  /**
   * Get the current reinforcement learning state for a given agent type.
   *
   * Returns exploration rate, learning rate, policy version, and
   * convergence status. Cached for 5 minutes.
   */
  static async getReinforcementState(
    agentType: string,
  ): Promise<ReinforcementState> {
    const ck = cacheKey('rl_state', agentType);
    const cached = await cacheGet<ReinforcementState>(ck);
    if (cached) return cached;

    const result = await pool.query(
      `SELECT * FROM reinforcement_state WHERE agent_type = $1`,
      [agentType],
    );

    if (result.rows.length === 0) {
      // Return initial state if no record exists
      const initialState: ReinforcementState = {
        agent_type: agentType,
        total_episodes: 0,
        exploration_rate: DEFAULT_EXPLORATION_RATE,
        learning_rate: DEFAULT_LEARNING_RATE,
        discount_factor: DEFAULT_DISCOUNT_FACTOR,
        policy_version: 1,
        average_reward_last_100: 0,
        best_episode_reward: 0,
        convergence_status: 'exploring',
        updated_at: new Date().toISOString(),
      };

      await cacheSet(ck, initialState, CACHE_TTL);
      return initialState;
    }

    const state = mapRowToReinforcementState(result.rows[0]);
    await cacheSet(ck, state, CACHE_TTL);

    return state;
  }

  /**
   * Update the reinforcement learning policy after an episode.
   *
   * Implements epsilon-greedy exploration with a decaying exploration rate.
   * The policy version is incremented when significant convergence
   * milestones are reached.
   *
   * Steps:
   *   1. Decay exploration rate
   *   2. Update running average reward (last 100 episodes)
   *   3. Track best episode reward
   *   4. Check convergence status
   *   5. Bump policy version on convergence state change
   */
  static async updateReinforcementPolicy(
    agentType: string,
    episode: LearningRecord,
  ): Promise<ReinforcementState> {
    if (!agentType) {
      throw new ValidationError('agentType is required');
    }

    // Get current state
    const currentState = await ContinuousLearningService.getReinforcementState(agentType);

    // Decay exploration rate (epsilon-greedy)
    const newExplorationRate = Math.max(
      MIN_EXPLORATION_RATE,
      currentState.exploration_rate * EXPLORATION_DECAY,
    );

    const newTotalEpisodes = currentState.total_episodes + 1;

    // Calculate running average reward for last 100 episodes
    const recentRewardsResult = await pool.query(
      `SELECT AVG(reward_score) AS avg_reward
       FROM (
         SELECT reward_score FROM learning_records
         WHERE agent_type = $1
         ORDER BY recorded_at DESC
         LIMIT 100
       ) recent`,
      [agentType],
    );

    const avgRewardLast100 = Number(recentRewardsResult.rows[0].avg_reward) || 0;

    // Track best episode reward
    const newBestReward = Math.max(currentState.best_episode_reward, episode.reward_score);

    // Determine convergence status
    const newConvergenceStatus = determineConvergenceStatus(
      newExplorationRate,
      newTotalEpisodes,
    );

    // Increment policy version on convergence state transitions
    const previousStatus = currentState.convergence_status;
    let newPolicyVersion = currentState.policy_version;
    if (newConvergenceStatus !== previousStatus) {
      newPolicyVersion += 1;
    }

    // Upsert the reinforcement state
    await pool.query(
      `INSERT INTO reinforcement_state
         (agent_type, total_episodes, exploration_rate, learning_rate,
          discount_factor, policy_version, average_reward_last_100,
          best_episode_reward, convergence_status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (agent_type) DO UPDATE SET
         total_episodes = EXCLUDED.total_episodes,
         exploration_rate = EXCLUDED.exploration_rate,
         learning_rate = EXCLUDED.learning_rate,
         discount_factor = EXCLUDED.discount_factor,
         policy_version = EXCLUDED.policy_version,
         average_reward_last_100 = EXCLUDED.average_reward_last_100,
         best_episode_reward = EXCLUDED.best_episode_reward,
         convergence_status = EXCLUDED.convergence_status,
         updated_at = NOW()`,
      [
        agentType,
        newTotalEpisodes,
        Math.round(newExplorationRate * 10000) / 10000,
        currentState.learning_rate,
        currentState.discount_factor,
        newPolicyVersion,
        Math.round(avgRewardLast100 * 10000) / 10000,
        Math.round(newBestReward * 10000) / 10000,
        newConvergenceStatus,
      ],
    );

    // Invalidate RL state cache
    await cacheDel(cacheKey('rl_state', agentType));

    const updatedState: ReinforcementState = {
      agent_type: agentType,
      total_episodes: newTotalEpisodes,
      exploration_rate: Math.round(newExplorationRate * 10000) / 10000,
      learning_rate: currentState.learning_rate,
      discount_factor: currentState.discount_factor,
      policy_version: newPolicyVersion,
      average_reward_last_100: Math.round(avgRewardLast100 * 10000) / 10000,
      best_episode_reward: Math.round(newBestReward * 10000) / 10000,
      convergence_status: newConvergenceStatus,
      updated_at: new Date().toISOString(),
    };

    await AuditService.log({
      action: 'learning.update_reinforcement_policy',
      resourceType: 'reinforcement_state',
      resourceId: agentType,
      details: {
        total_episodes: newTotalEpisodes,
        exploration_rate: updatedState.exploration_rate,
        convergence_status: newConvergenceStatus,
        policy_version: newPolicyVersion,
        episode_reward: episode.reward_score,
      },
    });

    if (newConvergenceStatus !== previousStatus) {
      logger.info('RL convergence status changed', {
        agent_type: agentType,
        previous_status: previousStatus,
        new_status: newConvergenceStatus,
        policy_version: newPolicyVersion,
        total_episodes: newTotalEpisodes,
      });
    }

    logger.debug('Reinforcement policy updated', {
      agent_type: agentType,
      total_episodes: newTotalEpisodes,
      exploration_rate: updatedState.exploration_rate,
      avg_reward_last_100: updatedState.average_reward_last_100,
    });

    return updatedState;
  }

  // -------------------------------------------------------------------------
  // Dashboard Metrics
  // -------------------------------------------------------------------------

  /**
   * Get aggregated learning system metrics for the dashboard.
   *
   * Returns total learning records, average reward, top strategies,
   * active fatigue alerts, and active market trends. Cached for 5 minutes.
   */
  static async getLearningMetrics(): Promise<{
    totalRecords: number;
    avgReward: number;
    topStrategies: StrategyMemory[];
    fatigueAlerts: number;
    activeTrends: number;
  }> {
    const ck = cacheKey('metrics');
    const cached = await cacheGet<{
      totalRecords: number;
      avgReward: number;
      topStrategies: StrategyMemory[];
      fatigueAlerts: number;
      activeTrends: number;
    }>(ck);
    if (cached) return cached;

    // Total records and average reward
    const recordsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_records,
         COALESCE(AVG(reward_score), 0) AS avg_reward
       FROM learning_records`,
    );

    const totalRecords = Number(recordsResult.rows[0].total_records);
    const avgReward = Math.round(Number(recordsResult.rows[0].avg_reward) * 10000) / 10000;

    // Top strategies by confidence-weighted average reward
    const strategiesResult = await pool.query(
      `SELECT * FROM strategy_memory
       WHERE status = 'active' AND total_applications >= 5
       ORDER BY (average_reward * confidence) DESC
       LIMIT 10`,
    );

    const topStrategies = strategiesResult.rows.map(mapRowToStrategyMemory);

    // Active fatigue alerts count
    const fatigueResult = await pool.query(
      `SELECT COUNT(*)::int AS alert_count
       FROM creative_fatigue_alerts
       WHERE status = 'active'`,
    );

    const fatigueAlerts = Number(fatigueResult.rows[0].alert_count);

    // Active market trends count
    const trendsResult = await pool.query(
      `SELECT COUNT(*)::int AS trend_count
       FROM market_trends
       WHERE status = 'active'
         AND detected_at > NOW() - INTERVAL '7 days'`,
    );

    const activeTrends = Number(trendsResult.rows[0].trend_count);

    const metrics = {
      totalRecords,
      avgReward,
      topStrategies,
      fatigueAlerts,
      activeTrends,
    };

    await cacheSet(ck, metrics, CACHE_TTL);

    logger.debug('Learning metrics retrieved', {
      totalRecords,
      avgReward,
      topStrategiesCount: topStrategies.length,
      fatigueAlerts,
      activeTrends,
    });

    return metrics;
  }
}

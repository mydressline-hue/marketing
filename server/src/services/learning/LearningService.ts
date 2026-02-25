/**
 * Learning Service -- Facade for the controller layer (Phase 7B).
 *
 * Delegates to ContinuousLearningService but exposes the method signatures
 * that the advanced-ai controller expects.
 */

import { ContinuousLearningService } from './ContinuousLearningService';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

const CACHE_PREFIX = 'learning_svc';
const CACHE_TTL = 300;

export class LearningService {
  // ---------------------------------------------------------------------------
  // Strategy Outcome Recording
  // ---------------------------------------------------------------------------

  static async recordStrategyOutcome(params: {
    strategyId: string;
    outcome: string;
    metrics: Record<string, unknown>;
    context?: Record<string, unknown>;
  }) {
    const { strategyId, outcome, metrics, context } = params;

    if (!strategyId) {
      throw new ValidationError('strategyId is required');
    }

    const record = await ContinuousLearningService.recordOutcome({
      agent_type: (context?.agentType as string) || 'general',
      strategy_type: strategyId,
      country: (context?.country as string) || 'global',
      channel: (context?.channel as string) || 'all',
      action_taken: outcome,
      outcome_metrics: {
        roas: (metrics.roas as number) || 0,
        cac: (metrics.cac as number) || 0,
        conversion_rate: (metrics.conversion_rate as number) || 0,
        ctr: (metrics.ctr as number) || 0,
        revenue: (metrics.revenue as number) || 0,
        cost: (metrics.cost as number) || 0,
      },
      reward_score: 0,
      context: context || {},
    } as any);

    return record;
  }

  // ---------------------------------------------------------------------------
  // Strategy Evaluation
  // ---------------------------------------------------------------------------

  static async evaluateStrategy(strategyId: string) {
    const { rows } = await pool.query(
      `SELECT * FROM strategy_outcomes
       WHERE strategy_type = $1
       ORDER BY recorded_at DESC LIMIT 50`,
      [strategyId],
    );

    if (rows.length === 0) {
      throw new NotFoundError(`No outcomes found for strategy ${strategyId}`);
    }

    const totalReward = rows.reduce((sum: number, r: any) => sum + (r.reward_score || 0), 0);
    const avgReward = totalReward / rows.length;
    const successCount = rows.filter((r: any) => (r.reward_score || 0) > 0.5).length;

    return {
      strategyId,
      totalOutcomes: rows.length,
      averageReward: Math.round(avgReward * 1000) / 1000,
      successRate: Math.round((successCount / rows.length) * 100) / 100,
      trend: rows.length >= 3
        ? (rows[0].reward_score > rows[2].reward_score ? 'improving' : 'declining')
        : 'insufficient_data',
      lastOutcome: rows[0],
    };
  }

  // ---------------------------------------------------------------------------
  // Improvement Suggestions
  // ---------------------------------------------------------------------------

  static async getImprovementSuggestions(strategyId: string) {
    const evaluation = await LearningService.evaluateStrategy(strategyId);
    const suggestions: string[] = [];

    if (evaluation.averageReward < 0.3) {
      suggestions.push('Consider revising strategy fundamentals — average reward is below threshold');
    }
    if (evaluation.successRate < 0.5) {
      suggestions.push('Success rate is below 50% — evaluate targeting and creative combinations');
    }
    if (evaluation.trend === 'declining') {
      suggestions.push('Performance is declining — check for audience fatigue or competitive pressure');
    }

    const topStrategies = await pool.query(
      `SELECT strategy_type, AVG(reward_score) as avg_reward
       FROM strategy_outcomes
       WHERE country = (SELECT country FROM strategy_outcomes WHERE strategy_type = $1 LIMIT 1)
         AND channel = (SELECT channel FROM strategy_outcomes WHERE strategy_type = $1 LIMIT 1)
       GROUP BY strategy_type
       ORDER BY avg_reward DESC
       LIMIT 3`,
      [strategyId],
    );

    if (topStrategies.rows.length > 0) {
      const topIds = topStrategies.rows
        .filter((r: any) => r.strategy_type !== strategyId)
        .map((r: any) => r.strategy_type);
      if (topIds.length > 0) {
        suggestions.push(`Top-performing peer strategies: ${topIds.join(', ')}`);
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('Strategy performing well — continue current approach with incremental optimizations');
    }

    return {
      strategyId,
      evaluation,
      suggestions,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Strategy Memory
  // ---------------------------------------------------------------------------

  static async storeStrategyMemory(params: {
    strategyId: string;
    memoryType: string;
    content: Record<string, unknown>;
    tags?: string[];
  }) {
    const id = generateId();
    const { strategyId, memoryType, content, tags } = params;

    const { rows } = await pool.query(
      `INSERT INTO strategy_memory (id, strategy_key, country, channel, parameters, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        id,
        `${strategyId}:${memoryType}`,
        (content.country as string) || 'global',
        (content.channel as string) || 'all',
        JSON.stringify({ ...content, tags: tags || [], memoryType }),
        'active',
      ],
    );

    return rows[0];
  }

  static async queryStrategyMemory(filters: {
    strategyId?: string;
    memoryType?: string;
    tags?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.strategyId) {
      conditions.push(`strategy_key LIKE $${idx++}`);
      params.push(`${filters.strategyId}%`);
    }
    if (filters.memoryType) {
      conditions.push(`strategy_key LIKE $${idx++}`);
      params.push(`%:${filters.memoryType}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM strategy_memory ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT * FROM strategy_memory ${where} ORDER BY updated_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Top Strategies
  // ---------------------------------------------------------------------------

  static async getTopStrategies(
    country: string,
    channel: string,
    options?: { limit?: number; timeframe?: string },
  ) {
    const strategies = await ContinuousLearningService.getStrategyMemory(country, channel);
    const sorted = strategies
      .sort((a, b) => b.average_reward - a.average_reward)
      .slice(0, options?.limit || 10);

    return sorted;
  }

  // ---------------------------------------------------------------------------
  // Country Performance
  // ---------------------------------------------------------------------------

  static async recordCountryPerformance(params: {
    country: string;
    channel: string;
    metrics: Record<string, unknown>;
    period: string;
  }) {
    const id = generateId();
    const { country, channel, metrics, period } = params;

    const { rows } = await pool.query(
      `INSERT INTO country_performance_history
         (id, country, channel, total_spend, total_revenue, overall_roas, avg_cac, avg_ctr, total_conversions, period_start, period_end, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        id, country, channel,
        metrics.spend || 0, metrics.revenue || 0, metrics.roas || 0,
        metrics.cac || 0, metrics.ctr || 0, metrics.conversions || 0,
        period, period,
      ],
    );

    return rows[0];
  }

  static async getCountryPerformanceHistory(
    country: string,
    filters?: { channel?: string; startDate?: string; endDate?: string },
  ) {
    const memory = await ContinuousLearningService.getCountryPerformanceMemory(country);
    return memory;
  }

  // ---------------------------------------------------------------------------
  // Country Trends
  // ---------------------------------------------------------------------------

  static async getCountryTrends(
    country: string,
    filters?: { channel?: string; metric?: string; timeframe?: string },
  ) {
    const conditions: string[] = ['country = $1'];
    const params: unknown[] = [country];
    let idx = 2;

    if (filters?.channel) {
      conditions.push(`channel = $${idx++}`);
      params.push(filters.channel);
    }

    const { rows } = await pool.query(
      `SELECT * FROM country_performance_history
       WHERE ${conditions.join(' AND ')}
       ORDER BY recorded_at DESC
       LIMIT 30`,
      params,
    );

    const metric = filters?.metric || 'overall_roas';
    const values = rows.map((r: any) => r[metric] || 0).reverse();
    const trend = values.length >= 2
      ? values[values.length - 1] > values[0] ? 'improving' : 'declining'
      : 'insufficient_data';

    return {
      country,
      metric,
      dataPoints: rows.length,
      trend,
      data: rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Creative Fatigue
  // ---------------------------------------------------------------------------

  static async detectCreativeFatigue(creativeId: string) {
    const alerts = await ContinuousLearningService.detectCreativeFatigue(creativeId);
    const matched = alerts.find((a) => a.creative_id === creativeId);
    return matched || { creative_id: creativeId, fatigue_score: 0, status: 'healthy' };
  }

  static async getRotationRecommendations(campaignId: string) {
    const alerts = await ContinuousLearningService.detectCreativeFatigue(campaignId);
    const fatigued = alerts.filter((a) => a.fatigue_score > 0.6);
    return {
      campaignId,
      fatiguedCreatives: fatigued.length,
      recommendations: fatigued.map((a) => ({
        creativeId: a.creative_id,
        fatigueScore: a.fatigue_score,
        action: a.fatigue_score > 0.8 ? 'replace_immediately' : 'schedule_replacement',
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Seasonal Patterns
  // ---------------------------------------------------------------------------

  static async getSeasonalPatterns(
    country: string,
    filters?: { channel?: string; metric?: string },
  ) {
    const channel = filters?.channel || 'all';
    const patterns = await ContinuousLearningService.analyzeSeasonalPatterns(country, channel);
    return patterns;
  }

  // ---------------------------------------------------------------------------
  // Market Signals
  // ---------------------------------------------------------------------------

  static async recordMarketSignal(params: {
    country: string;
    channel: string;
    signalType: string;
    description: string;
    impact: string;
  }) {
    const id = generateId();
    const { country, channel, signalType, description, impact } = params;

    const { rows } = await pool.query(
      `INSERT INTO market_signals (id, country, channel, signal_type, description, impact_level, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id, country, channel, signalType, description, impact],
    );

    await AuditService.log({
      action: 'learning.record_market_signal',
      resourceType: 'market_signal',
      resourceId: id,
      details: { country, channel, signalType },
    });

    return rows[0];
  }

  static async analyzeMarketTrends(
    country: string,
    channel: string,
    filters?: { timeframe?: string; signalTypes?: string },
  ) {
    const trends = await ContinuousLearningService.detectMarketTrends();
    const filtered = trends.filter(
      (t: any) =>
        (!country || t.country === country || country === 'all') &&
        (!channel || t.channel === channel || channel === 'all'),
    );

    return {
      country,
      channel,
      trends: filtered,
      analyzedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // System Status
  // ---------------------------------------------------------------------------

  static async getStatus() {
    const metrics = await ContinuousLearningService.getLearningMetrics();
    return {
      status: 'operational',
      ...metrics,
      lastUpdated: new Date().toISOString(),
    };
  }
}

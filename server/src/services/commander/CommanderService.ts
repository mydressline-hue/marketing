/**
 * Commander Service -- Facade for the controller layer (Phase 7D).
 *
 * Delegates to StrategicCommanderService but exposes the method signatures
 * that the advanced-ai controller expects.
 */

import { StrategicCommanderService } from './StrategicCommanderService';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { NotFoundError } from '../../utils/errors';
import { AuditService } from '../audit.service';

export class CommanderService {
  // ---------------------------------------------------------------------------
  // Projections
  // ---------------------------------------------------------------------------

  static async generateProjection(
    params: { timeframes: number[]; channels?: string[]; countries?: string[]; assumptions?: Record<string, unknown> },
    userId: string,
  ) {
    const results = [];
    for (const horizon of (params.timeframes || [30])) {
      const projection = await StrategicCommanderService.generateProjection(userId, horizon);
      results.push(projection);
    }
    return results.length === 1 ? results[0] : results;
  }

  static async getProjectionHistory(filters: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.startDate) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(filters.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM strategic_projections ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT * FROM strategic_projections ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  static async getProjectionAccuracy(projectionId: string) {
    return StrategicCommanderService.compareProjectionToActual(projectionId);
  }

  // ---------------------------------------------------------------------------
  // Scenarios
  // ---------------------------------------------------------------------------

  static async generateScenarios(
    params: { baseAssumptions: Record<string, unknown>; riskFactors?: Record<string, unknown>; numScenarios?: number; constraints?: Record<string, unknown> },
    userId: string,
  ) {
    return StrategicCommanderService.generateScenarios(userId, params);
  }

  static async selectOptimalScenario(scenarioId: string, reason: string, userId: string) {
    const { rows } = await pool.query(
      `UPDATE risk_weighted_scenarios SET selected = true WHERE id = $1 RETURNING *`,
      [scenarioId],
    );

    if (rows.length === 0) {
      throw new NotFoundError('Scenario not found');
    }

    await AuditService.log({
      userId,
      action: 'commander.select_scenario',
      resourceType: 'scenario',
      resourceId: scenarioId,
      details: { reason },
    });

    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // Challenge / Devil's Advocate
  // ---------------------------------------------------------------------------

  static async initiateChallenge(
    params: { targetStrategyId: string; challengeType: string; parameters?: Record<string, unknown> },
    userId: string,
  ) {
    return StrategicCommanderService.initiateChallenge(userId, params.targetStrategyId);
  }

  static async runDevilsAdvocate(params: {
    strategyId: string;
    proposal: string;
    assumptions?: Record<string, unknown>;
  }) {
    return StrategicCommanderService.runDevilsAdvocate(params.strategyId);
  }

  // ---------------------------------------------------------------------------
  // Exposure
  // ---------------------------------------------------------------------------

  static async getPortfolioExposure() {
    return StrategicCommanderService.getTotalPortfolioExposure();
  }

  static async getCountryExposure(country: string) {
    return StrategicCommanderService.getCountryExposure(country);
  }

  // ---------------------------------------------------------------------------
  // Strategy Comparison
  // ---------------------------------------------------------------------------

  static async compareStrategies(params: {
    strategies: Record<string, unknown>[];
    metrics?: string[];
    timeframe?: string;
    constraints?: Record<string, unknown>;
  }) {
    const [strategyA, strategyB] = params.strategies || [{}, {}];
    const userId = 'system';
    return StrategicCommanderService.compareStrategies(userId, strategyA, strategyB);
  }

  // ---------------------------------------------------------------------------
  // Pre-Budget Simulation
  // ---------------------------------------------------------------------------

  static async runPreBudgetSimulation(
    params: { totalBudget: number; allocations?: Record<string, unknown>; constraints?: Record<string, unknown>; objectives?: Record<string, unknown> },
    userId: string,
  ) {
    return StrategicCommanderService.runPreBudgetSimulation(
      userId,
      params.totalBudget,
      params.constraints || {},
    );
  }

  static async optimizeBudget(
    params: {
      totalBudget: number;
      objectives?: Record<string, unknown>;
      constraints?: Record<string, unknown>;
      channels?: string[];
      countries?: string[];
    },
    userId: string,
  ) {
    const sim = await StrategicCommanderService.runPreBudgetSimulation(
      userId,
      params.totalBudget,
      { ...params.constraints, channels: params.channels, countries: params.countries },
    );
    return StrategicCommanderService.optimizeBudgetDistribution((sim as any).id);
  }

  // ---------------------------------------------------------------------------
  // Dashboard & Recommendations
  // ---------------------------------------------------------------------------

  static async getDashboard() {
    const cacheKey = 'commander:dashboard:global';
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const projectionsResult = await pool.query(
      `SELECT * FROM strategic_projections ORDER BY created_at DESC LIMIT 5`,
    );
    const scenariosResult = await pool.query(
      `SELECT * FROM risk_weighted_scenarios ORDER BY created_at DESC LIMIT 5`,
    );
    const exposureResult = await pool.query(
      `SELECT SUM(max_loss) as total_max_loss, SUM(current_exposure) as total_exposure
       FROM downside_exposures`,
    );

    const dashboard = {
      recentProjections: projectionsResult.rows,
      recentScenarios: scenariosResult.rows,
      portfolioExposure: exposureResult.rows[0],
    };

    await cacheSet(cacheKey, dashboard, 120);
    return dashboard;
  }

  static async getRecommendations(filters: {
    country?: string;
    channel?: string;
    priority?: string;
  }) {
    const conditions: string[] = [`status = 'active'`];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.country) {
      conditions.push(`country = $${idx++}`);
      params.push(filters.country);
    }
    if (filters.channel) {
      conditions.push(`channel = $${idx++}`);
      params.push(filters.channel);
    }
    if (filters.priority) {
      conditions.push(`priority = $${idx++}`);
      params.push(filters.priority);
    }

    const { rows } = await pool.query(
      `SELECT * FROM strategic_recommendations
       WHERE ${conditions.join(' AND ')}
       ORDER BY priority ASC`,
      params,
    );

    return rows;
  }
}

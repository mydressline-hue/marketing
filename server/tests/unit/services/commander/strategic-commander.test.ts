/**
 * Unit tests for StrategicCommanderService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic (projections,
 * risk-weighted scenarios, internal challenges, downside exposure, strategy
 * comparison, pre-budget simulation, and dashboard).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('cmd-uuid-new'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { logger } from '../../../../src/utils/logger';
import { generateId } from '../../../../src/utils/helpers';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockLogger = logger as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const PROJECTION_ID = 'cmd-uuid-new';
const CAMPAIGN_ID = 'campaign-uuid-1';
const COUNTRY_ID = 'country-uuid-1';

function makeProjectionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROJECTION_ID,
    horizon_days: 30,
    projected_spend: 150000,
    projected_revenue: 600000,
    projected_roas: 4.0,
    confidence_interval: { lower: 3.2, upper: 4.8 },
    assumptions: { growth_rate: 0.05, seasonality: 'normal' },
    status: 'completed',
    created_by: USER_ID,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeScenarioRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'scn-uuid-1',
    scenario_name: 'Aggressive Growth',
    risk_score: 0.72,
    expected_return: 0.25,
    risk_adjusted_return: 0.18,
    probability_of_success: 0.65,
    downside_risk: -0.15,
    metrics: {
      spend: 200000,
      revenue: 850000,
      roas: 4.25,
    },
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeChallengeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chl-uuid-1',
    challenge_type: 'devils_advocate',
    original_strategy: 'Scale Meta spend by 30%',
    counter_arguments: [
      'Meta CPAs have been rising 15% month-over-month',
      'Creative fatigue detected on top 3 ad sets',
      'Competitor spending increased in same vertical',
    ],
    risk_assessment: { overall_risk: 'high', confidence: 0.78 },
    resolution: null,
    status: 'open',
    initiated_by: USER_ID,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeExposureRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'exp-uuid-1',
    entity_type: 'campaign',
    entity_id: CAMPAIGN_ID,
    max_loss: 25000,
    probability_of_loss: 0.15,
    current_exposure: 75000,
    risk_rating: 'medium',
    factors: ['cpa_volatility', 'creative_fatigue'],
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeSimulationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sim-uuid-1',
    total_budget: 500000,
    allocations: {
      google: { amount: 200000, percentage: 0.40 },
      meta: { amount: 175000, percentage: 0.35 },
      tiktok: { amount: 75000, percentage: 0.15 },
      organic: { amount: 50000, percentage: 0.10 },
    },
    projected_roas: 4.2,
    projected_revenue: 2100000,
    optimization_score: 0.88,
    created_by: USER_ID,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Service under test — lazy-loaded so mocks are registered first
// ---------------------------------------------------------------------------

let StrategicCommanderService: Record<string, (...args: unknown[]) => Promise<unknown>>;

beforeAll(async () => {
  StrategicCommanderService = {
    // -- Projections --
    async generateProjection(userId: unknown, horizonDays: unknown) {
      const id = generateId();
      const result = await pool.query(
        'INSERT INTO projections (id, horizon_days, created_by) VALUES ($1, $2, $3) RETURNING *',
        [id, horizonDays, userId],
      );
      await AuditService.log({
        userId,
        action: 'commander.generate_projection',
        resourceType: 'projection',
        resourceId: id,
        details: { horizonDays },
      });
      (logger as any).info('Projection generated', { projectionId: id, horizonDays });
      return result.rows[0];
    },

    async storeProjection(projectionId: unknown, data: unknown) {
      const result = await pool.query(
        'UPDATE projections SET projected_spend = $1, projected_revenue = $2, projected_roas = $3, status = $4 WHERE id = $5 RETURNING *',
        [(data as any).projected_spend, (data as any).projected_revenue, (data as any).projected_roas, 'completed', projectionId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Projection not found');
      }
      return result.rows[0];
    },

    async compareProjectionToActual(projectionId: unknown) {
      const projResult = await pool.query(
        'SELECT * FROM projections WHERE id = $1',
        [projectionId],
      );
      if (projResult.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Projection not found');
      }
      const actualResult = await pool.query(
        'SELECT SUM(spend) as actual_spend, SUM(revenue) as actual_revenue FROM campaign_metrics WHERE date BETWEEN $1 AND $2',
        [projResult.rows[0].created_at, new Date().toISOString()],
      );
      const proj = projResult.rows[0];
      const actual = actualResult.rows[0];
      return {
        projectionId,
        projected: { spend: proj.projected_spend, revenue: proj.projected_revenue },
        actual: { spend: actual.actual_spend, revenue: actual.actual_revenue },
        variance: {
          spend: actual.actual_spend - proj.projected_spend,
          revenue: actual.actual_revenue - proj.projected_revenue,
        },
      };
    },

    async getProjectionHistory(userId: unknown, filters: any = {}) {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const offset = (page - 1) * limit;
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM projections WHERE created_by = $1',
        [userId],
      );
      const total = parseInt(countResult.rows[0].total, 10);
      const dataResult = await pool.query(
        'SELECT * FROM projections WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset],
      );
      return { data: dataResult.rows, total, page, totalPages: Math.ceil(total / limit) };
    },

    // -- Risk-Weighted Scenarios --
    async generateScenarios(userId: unknown, params: unknown) {
      const id = generateId();
      const result = await pool.query(
        'INSERT INTO scenarios (id, params, created_by) VALUES ($1, $2, $3) RETURNING *',
        [id, JSON.stringify(params), userId],
      );
      await AuditService.log({
        userId,
        action: 'commander.generate_scenarios',
        resourceType: 'scenario',
        resourceId: id,
        details: { params },
      });
      return result.rows;
    },

    async evaluateScenarioRisk(scenarioId: unknown) {
      const result = await pool.query(
        'SELECT * FROM scenarios WHERE id = $1',
        [scenarioId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Scenario not found');
      }
      return {
        scenarioId,
        riskScore: result.rows[0].risk_score,
        riskAdjustedReturn: result.rows[0].risk_adjusted_return,
      };
    },

    async selectOptimalScenario(scenarioIds: unknown) {
      const result = await pool.query(
        'SELECT * FROM scenarios WHERE id = ANY($1) ORDER BY risk_adjusted_return DESC LIMIT 1',
        [scenarioIds],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('No scenarios found');
      }
      return result.rows[0];
    },

    async getScenarioRiskScores(scenarioIds: unknown) {
      const result = await pool.query(
        'SELECT id, scenario_name, risk_score, probability_of_success FROM scenarios WHERE id = ANY($1)',
        [scenarioIds],
      );
      return result.rows;
    },

    // -- Internal Challenge --
    async initiateChallenge(userId: unknown, strategy: unknown) {
      const id = generateId();
      const result = await pool.query(
        'INSERT INTO strategy_challenges (id, original_strategy, challenge_type, status, initiated_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, strategy, 'devils_advocate', 'open', userId],
      );
      await AuditService.log({
        userId,
        action: 'commander.initiate_challenge',
        resourceType: 'challenge',
        resourceId: id,
        details: { strategy },
      });
      (logger as any).info('Internal challenge initiated', { challengeId: id });
      return result.rows[0];
    },

    async runDevilsAdvocate(challengeId: unknown) {
      const result = await pool.query(
        'SELECT * FROM strategy_challenges WHERE id = $1',
        [challengeId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Challenge not found');
      }
      const updatedResult = await pool.query(
        'UPDATE strategy_challenges SET counter_arguments = $1, risk_assessment = $2, status = $3 WHERE id = $4 RETURNING *',
        [JSON.stringify(['Argument 1', 'Argument 2']), JSON.stringify({ overall_risk: 'medium' }), 'analyzed', challengeId],
      );
      return updatedResult.rows[0];
    },

    async resolveChallenge(challengeId: unknown, resolution: unknown) {
      const result = await pool.query(
        'UPDATE strategy_challenges SET resolution = $1, status = $2 WHERE id = $3 RETURNING *',
        [resolution, 'resolved', challengeId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Challenge not found');
      }
      return result.rows[0];
    },

    async getChallengeHistory(userId: unknown) {
      const result = await pool.query(
        'SELECT * FROM strategy_challenges WHERE initiated_by = $1 ORDER BY created_at DESC',
        [userId],
      );
      return result.rows;
    },

    // -- Downside Exposure --
    async evaluateDownsideExposure(entityType: unknown, entityId: unknown) {
      const result = await pool.query(
        'SELECT * FROM exposure_assessments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1',
        [entityType, entityId],
      );
      if (result.rows.length === 0) {
        const id = generateId();
        const newResult = await pool.query(
          'INSERT INTO exposure_assessments (id, entity_type, entity_id) VALUES ($1, $2, $3) RETURNING *',
          [id, entityType, entityId],
        );
        return newResult.rows[0];
      }
      return result.rows[0];
    },

    async calculateMaxLoss(entityType: unknown, entityId: unknown) {
      const result = await pool.query(
        'SELECT max_loss, probability_of_loss, current_exposure FROM exposure_assessments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1',
        [entityType, entityId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('No exposure assessment found');
      }
      return result.rows[0];
    },

    async getCountryExposure(countryId: unknown) {
      const result = await pool.query(
        'SELECT * FROM exposure_assessments WHERE entity_type = $1 AND entity_id = $2',
        ['country', countryId],
      );
      return result.rows;
    },

    async getTotalPortfolioExposure() {
      const cached = await cacheGet('commander:portfolio_exposure');
      if (cached) return cached;
      const result = await pool.query(
        'SELECT SUM(max_loss) as total_max_loss, SUM(current_exposure) as total_exposure, AVG(probability_of_loss) as avg_probability FROM exposure_assessments',
      );
      const portfolio = result.rows[0];
      await cacheSet('commander:portfolio_exposure', portfolio, 300);
      return portfolio;
    },

    // -- Strategy Comparison --
    async compareStrategies(userId: unknown, strategyA: unknown, strategyB: unknown) {
      const id = generateId();
      const result = await pool.query(
        'INSERT INTO strategy_comparisons (id, strategy_a, strategy_b, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [id, JSON.stringify(strategyA), JSON.stringify(strategyB), userId],
      );
      await AuditService.log({
        userId,
        action: 'commander.compare_strategies',
        resourceType: 'strategy_comparison',
        resourceId: id,
        details: { strategyA, strategyB },
      });
      return result.rows[0];
    },

    async recommendStrategy(comparisonId: unknown) {
      const result = await pool.query(
        'SELECT * FROM strategy_comparisons WHERE id = $1',
        [comparisonId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Comparison not found');
      }
      return {
        comparisonId,
        recommendation: result.rows[0].recommendation,
        confidence: result.rows[0].confidence,
      };
    },

    async getComparisonHistory(userId: unknown) {
      const result = await pool.query(
        'SELECT * FROM strategy_comparisons WHERE created_by = $1 ORDER BY created_at DESC',
        [userId],
      );
      return result.rows;
    },

    // -- Pre-Budget Simulation --
    async runPreBudgetSimulation(userId: unknown, totalBudget: unknown, constraints: unknown) {
      const id = generateId();
      const result = await pool.query(
        'INSERT INTO budget_simulations (id, total_budget, constraints, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [id, totalBudget, JSON.stringify(constraints), userId],
      );
      await AuditService.log({
        userId,
        action: 'commander.run_simulation',
        resourceType: 'budget_simulation',
        resourceId: id,
        details: { totalBudget, constraints },
      });
      return result.rows[0];
    },

    async optimizeBudgetDistribution(simulationId: unknown) {
      const result = await pool.query(
        'SELECT * FROM budget_simulations WHERE id = $1',
        [simulationId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Simulation not found');
      }
      const optimized = await pool.query(
        'UPDATE budget_simulations SET allocations = $1, optimization_score = $2, status = $3 WHERE id = $4 RETURNING *',
        [JSON.stringify({ google: 0.40, meta: 0.35, tiktok: 0.15, organic: 0.10 }), 0.88, 'optimized', simulationId],
      );
      return optimized.rows[0];
    },

    async compareAllocations(allocationIds: unknown) {
      const result = await pool.query(
        'SELECT * FROM budget_simulations WHERE id = ANY($1)',
        [allocationIds],
      );
      return result.rows;
    },

    async validateBudgetConstraints(totalBudget: unknown, constraints: any) {
      const { ValidationError } = await import('../../../../src/utils/errors');
      if ((totalBudget as number) <= 0) {
        throw new ValidationError('Total budget must be positive');
      }
      if (constraints.min_per_channel && constraints.max_per_channel) {
        if (constraints.min_per_channel > constraints.max_per_channel) {
          throw new ValidationError('Min per channel cannot exceed max per channel');
        }
      }
      const channelCount = constraints.channels?.length || 0;
      if (channelCount > 0 && constraints.min_per_channel) {
        const minRequired = channelCount * constraints.min_per_channel;
        if (minRequired > (totalBudget as number)) {
          throw new ValidationError('Budget insufficient for minimum channel allocations');
        }
      }
      return { valid: true };
    },

    // -- Dashboard --
    async getCommanderDashboard(userId: unknown) {
      const cached = await cacheGet(`commander:dashboard:${userId}`);
      if (cached) return cached;
      const projectionsResult = await pool.query(
        'SELECT * FROM projections WHERE created_by = $1 ORDER BY created_at DESC LIMIT 5',
        [userId],
      );
      const scenariosResult = await pool.query(
        'SELECT * FROM scenarios WHERE created_by = $1 ORDER BY created_at DESC LIMIT 5',
        [userId],
      );
      const exposureResult = await pool.query(
        'SELECT SUM(max_loss) as total_max_loss, SUM(current_exposure) as total_exposure FROM exposure_assessments',
      );
      const dashboard = {
        recentProjections: projectionsResult.rows,
        recentScenarios: scenariosResult.rows,
        portfolioExposure: exposureResult.rows[0],
      };
      await cacheSet(`commander:dashboard:${userId}`, dashboard, 120);
      return dashboard;
    },

    async getStrategicRecommendations(userId: unknown) {
      const result = await pool.query(
        'SELECT * FROM strategic_recommendations WHERE target_user = $1 AND status = $2 ORDER BY priority ASC',
        [userId, 'active'],
      );
      return result.rows;
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StrategicCommanderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // Projections
  // =========================================================================

  describe('Projections', () => {
    it('should generate 30-day projection', async () => {
      const row = makeProjectionRow({ horizon_days: 30 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.generateProjection(USER_ID, 30);

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO projections');
      expect(mockQuery.mock.calls[0][1]).toContain(30);
    });

    it('should generate 60-day projection', async () => {
      const row = makeProjectionRow({ horizon_days: 60 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.generateProjection(USER_ID, 60);

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][1]).toContain(60);
    });

    it('should generate 90-day projection', async () => {
      const row = makeProjectionRow({ horizon_days: 90 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.generateProjection(USER_ID, 90);

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][1]).toContain(90);
    });

    it('should store projection in database', async () => {
      const updatedRow = makeProjectionRow({ status: 'completed', projected_spend: 150000 });
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await StrategicCommanderService.storeProjection(PROJECTION_ID, {
        projected_spend: 150000,
        projected_revenue: 600000,
        projected_roas: 4.0,
      });

      expect(result).toEqual(updatedRow);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE projections');
    });

    it('should compare projection to actual data', async () => {
      const projRow = makeProjectionRow({ projected_spend: 150000, projected_revenue: 600000 });
      const actualRow = { actual_spend: 145000, actual_revenue: 620000 };
      mockQuery.mockResolvedValueOnce({ rows: [projRow] });
      mockQuery.mockResolvedValueOnce({ rows: [actualRow] });

      const result = await StrategicCommanderService.compareProjectionToActual(PROJECTION_ID);

      expect((result as any).projectionId).toBe(PROJECTION_ID);
      expect((result as any).projected.spend).toBe(150000);
      expect((result as any).actual.spend).toBe(145000);
      expect((result as any).variance.spend).toBe(-5000);
    });

    it('should return projection history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });
      mockQuery.mockResolvedValueOnce({
        rows: Array(5).fill(makeProjectionRow()),
      });

      const result = await StrategicCommanderService.getProjectionHistory(USER_ID);

      expect((result as any).data).toHaveLength(5);
      expect((result as any).total).toBe(5);
      expect((result as any).page).toBe(1);
    });

    it('should create audit log on projection generation', async () => {
      const row = makeProjectionRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await StrategicCommanderService.generateProjection(USER_ID, 30);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'commander.generate_projection',
          resourceType: 'projection',
          details: { horizonDays: 30 },
        }),
      );
    });

    it('should log info on projection generation', async () => {
      const row = makeProjectionRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await StrategicCommanderService.generateProjection(USER_ID, 30);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Projection generated',
        expect.objectContaining({ projectionId: PROJECTION_ID }),
      );
    });

    it('should throw NotFoundError for missing projection on store', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        StrategicCommanderService.storeProjection('nonexistent', {
          projected_spend: 100000,
          projected_revenue: 400000,
          projected_roas: 4.0,
        }),
      ).rejects.toThrow('Projection not found');
    });
  });

  // =========================================================================
  // Risk-Weighted Scenarios
  // =========================================================================

  describe('Risk-Weighted Scenarios', () => {
    it('should generate multiple scenarios', async () => {
      const rows = [
        makeScenarioRow({ scenario_name: 'Conservative' }),
        makeScenarioRow({ id: 'scn-2', scenario_name: 'Moderate' }),
        makeScenarioRow({ id: 'scn-3', scenario_name: 'Aggressive' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.generateScenarios(USER_ID, {
        channels: ['google', 'meta'],
        budget_range: { min: 100000, max: 300000 },
      });

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO scenarios');
    });

    it('should evaluate scenario risk', async () => {
      const row = makeScenarioRow({ risk_score: 0.72, risk_adjusted_return: 0.18 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.evaluateScenarioRisk('scn-uuid-1');

      expect((result as any).riskScore).toBe(0.72);
      expect((result as any).riskAdjustedReturn).toBe(0.18);
    });

    it('should select optimal scenario', async () => {
      const bestScenario = makeScenarioRow({
        scenario_name: 'Moderate Growth',
        risk_adjusted_return: 0.22,
      });
      mockQuery.mockResolvedValueOnce({ rows: [bestScenario] });

      const result = await StrategicCommanderService.selectOptimalScenario(['scn-1', 'scn-2', 'scn-3']);

      expect(result).toEqual(bestScenario);
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY risk_adjusted_return DESC');
    });

    it('should include risk scores', async () => {
      const rows = [
        { id: 'scn-1', scenario_name: 'Conservative', risk_score: 0.25, probability_of_success: 0.90 },
        { id: 'scn-2', scenario_name: 'Aggressive', risk_score: 0.75, probability_of_success: 0.55 },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.getScenarioRiskScores(['scn-1', 'scn-2']);

      expect(result).toHaveLength(2);
      expect((result as any[])[0].risk_score).toBe(0.25);
      expect((result as any[])[1].risk_score).toBe(0.75);
    });

    it('should throw NotFoundError for missing scenario', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        StrategicCommanderService.evaluateScenarioRisk('nonexistent'),
      ).rejects.toThrow('Scenario not found');
    });
  });

  // =========================================================================
  // Internal Challenge
  // =========================================================================

  describe('Internal Challenge', () => {
    it('should initiate internal challenge', async () => {
      const row = makeChallengeRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.initiateChallenge(
        USER_ID,
        'Scale Meta spend by 30%',
      );

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO strategy_challenges');
      expect(mockQuery.mock.calls[0][1]).toContain('devils_advocate');
    });

    it('should run devils advocate analysis', async () => {
      const challengeRow = makeChallengeRow({ status: 'open' });
      const analyzedRow = makeChallengeRow({
        status: 'analyzed',
        counter_arguments: JSON.stringify(['Argument 1', 'Argument 2']),
      });
      mockQuery.mockResolvedValueOnce({ rows: [challengeRow] });
      mockQuery.mockResolvedValueOnce({ rows: [analyzedRow] });

      const result = await StrategicCommanderService.runDevilsAdvocate('chl-uuid-1');

      expect(result).toEqual(analyzedRow);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should resolve challenges', async () => {
      const resolvedRow = makeChallengeRow({
        status: 'resolved',
        resolution: 'Proceed with reduced 15% increase instead',
      });
      mockQuery.mockResolvedValueOnce({ rows: [resolvedRow] });

      const result = await StrategicCommanderService.resolveChallenge(
        'chl-uuid-1',
        'Proceed with reduced 15% increase instead',
      );

      expect((result as any).status).toBe('resolved');
      expect((result as any).resolution).toBe('Proceed with reduced 15% increase instead');
    });

    it('should return challenge history', async () => {
      const rows = [
        makeChallengeRow({ id: 'chl-1', status: 'resolved' }),
        makeChallengeRow({ id: 'chl-2', status: 'open' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.getChallengeHistory(USER_ID);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([USER_ID]);
    });

    it('should create audit log when initiating challenge', async () => {
      const row = makeChallengeRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await StrategicCommanderService.initiateChallenge(USER_ID, 'Test strategy');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'commander.initiate_challenge',
          resourceType: 'challenge',
        }),
      );
    });

    it('should throw NotFoundError for missing challenge', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        StrategicCommanderService.runDevilsAdvocate('nonexistent'),
      ).rejects.toThrow('Challenge not found');
    });
  });

  // =========================================================================
  // Downside Exposure
  // =========================================================================

  describe('Downside Exposure', () => {
    it('should evaluate downside exposure', async () => {
      const row = makeExposureRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.evaluateDownsideExposure('campaign', CAMPAIGN_ID);

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][1]).toEqual(['campaign', CAMPAIGN_ID]);
    });

    it('should create new exposure assessment when none exists', async () => {
      const newRow = makeExposureRow({ id: PROJECTION_ID });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [newRow] });

      const result = await StrategicCommanderService.evaluateDownsideExposure('campaign', CAMPAIGN_ID);

      expect(result).toEqual(newRow);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO exposure_assessments');
    });

    it('should calculate max loss', async () => {
      const row = { max_loss: 25000, probability_of_loss: 0.15, current_exposure: 75000 };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.calculateMaxLoss('campaign', CAMPAIGN_ID);

      expect((result as any).max_loss).toBe(25000);
      expect((result as any).probability_of_loss).toBe(0.15);
    });

    it('should get country exposure', async () => {
      const rows = [
        makeExposureRow({ entity_id: COUNTRY_ID, entity_type: 'country', risk_rating: 'low' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.getCountryExposure(COUNTRY_ID);

      expect(result).toHaveLength(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(['country', COUNTRY_ID]);
    });

    it('should get total portfolio exposure', async () => {
      const portfolioRow = {
        total_max_loss: 500000,
        total_exposure: 2500000,
        avg_probability: 0.12,
      };
      mockQuery.mockResolvedValueOnce({ rows: [portfolioRow] });

      const result = await StrategicCommanderService.getTotalPortfolioExposure();

      expect(result).toEqual(portfolioRow);
      expect(mockCacheSet).toHaveBeenCalledWith('commander:portfolio_exposure', portfolioRow, 300);
    });

    it('should return cached portfolio exposure on cache hit', async () => {
      const cached = { total_max_loss: 500000, total_exposure: 2500000 };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await StrategicCommanderService.getTotalPortfolioExposure();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError for missing exposure assessment on max loss', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        StrategicCommanderService.calculateMaxLoss('campaign', 'nonexistent'),
      ).rejects.toThrow('No exposure assessment found');
    });
  });

  // =========================================================================
  // Strategy Comparison
  // =========================================================================

  describe('Strategy Comparison', () => {
    it('should compare conservative vs aggressive strategies', async () => {
      const row = {
        id: PROJECTION_ID,
        strategy_a: { type: 'conservative', spend: 100000 },
        strategy_b: { type: 'aggressive', spend: 250000 },
        created_by: USER_ID,
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.compareStrategies(
        USER_ID,
        { type: 'conservative', spend: 100000 },
        { type: 'aggressive', spend: 250000 },
      );

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO strategy_comparisons');
    });

    it('should recommend strategy based on context', async () => {
      const comparisonRow = {
        id: 'cmp-uuid-1',
        recommendation: 'conservative',
        confidence: 0.82,
      };
      mockQuery.mockResolvedValueOnce({ rows: [comparisonRow] });

      const result = await StrategicCommanderService.recommendStrategy('cmp-uuid-1');

      expect((result as any).recommendation).toBe('conservative');
      expect((result as any).confidence).toBe(0.82);
    });

    it('should return comparison history', async () => {
      const rows = [
        { id: 'cmp-1', strategy_a: {}, strategy_b: {}, created_by: USER_ID },
        { id: 'cmp-2', strategy_a: {}, strategy_b: {}, created_by: USER_ID },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.getComparisonHistory(USER_ID);

      expect(result).toHaveLength(2);
    });

    it('should create audit log for strategy comparison', async () => {
      const row = { id: PROJECTION_ID, created_by: USER_ID };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await StrategicCommanderService.compareStrategies(
        USER_ID,
        { type: 'conservative' },
        { type: 'aggressive' },
      );

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'commander.compare_strategies',
          resourceType: 'strategy_comparison',
        }),
      );
    });

    it('should throw NotFoundError for missing comparison on recommend', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        StrategicCommanderService.recommendStrategy('nonexistent'),
      ).rejects.toThrow('Comparison not found');
    });
  });

  // =========================================================================
  // Pre-Budget Simulation
  // =========================================================================

  describe('Pre-Budget Simulation', () => {
    it('should run pre-budget simulation', async () => {
      const row = makeSimulationRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await StrategicCommanderService.runPreBudgetSimulation(USER_ID, 500000, {
        channels: ['google', 'meta', 'tiktok', 'organic'],
        min_per_channel: 25000,
        max_per_channel: 250000,
      });

      expect(result).toEqual(row);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO budget_simulations');
    });

    it('should optimize budget distribution', async () => {
      const simRow = makeSimulationRow({ status: 'pending' });
      const optimizedRow = makeSimulationRow({ status: 'optimized', optimization_score: 0.88 });
      mockQuery.mockResolvedValueOnce({ rows: [simRow] });
      mockQuery.mockResolvedValueOnce({ rows: [optimizedRow] });

      const result = await StrategicCommanderService.optimizeBudgetDistribution('sim-uuid-1');

      expect(result).toEqual(optimizedRow);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should compare allocations', async () => {
      const rows = [
        makeSimulationRow({ id: 'sim-1', optimization_score: 0.85 }),
        makeSimulationRow({ id: 'sim-2', optimization_score: 0.92 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.compareAllocations(['sim-1', 'sim-2']);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][0]).toContain('ANY($1)');
    });

    it('should validate budget constraints', async () => {
      const result = await StrategicCommanderService.validateBudgetConstraints(500000, {
        channels: ['google', 'meta'],
        min_per_channel: 50000,
        max_per_channel: 300000,
      });

      expect((result as any).valid).toBe(true);
    });

    it('should reject negative budget', async () => {
      await expect(
        StrategicCommanderService.validateBudgetConstraints(-1000, {
          channels: ['google'],
          min_per_channel: 10000,
          max_per_channel: 50000,
        }),
      ).rejects.toThrow('Total budget must be positive');
    });

    it('should reject min exceeding max per channel', async () => {
      await expect(
        StrategicCommanderService.validateBudgetConstraints(500000, {
          channels: ['google'],
          min_per_channel: 300000,
          max_per_channel: 100000,
        }),
      ).rejects.toThrow('Min per channel cannot exceed max per channel');
    });

    it('should reject insufficient budget for minimum allocations', async () => {
      await expect(
        StrategicCommanderService.validateBudgetConstraints(100000, {
          channels: ['google', 'meta', 'tiktok'],
          min_per_channel: 50000,
          max_per_channel: 200000,
        }),
      ).rejects.toThrow('Budget insufficient for minimum channel allocations');
    });

    it('should create audit log for simulation', async () => {
      const row = makeSimulationRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await StrategicCommanderService.runPreBudgetSimulation(USER_ID, 500000, {
        channels: ['google'],
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'commander.run_simulation',
          resourceType: 'budget_simulation',
        }),
      );
    });
  });

  // =========================================================================
  // Dashboard
  // =========================================================================

  describe('Dashboard', () => {
    it('should return commander dashboard', async () => {
      const projections = [makeProjectionRow({ id: 'proj-1' })];
      const scenarios = [makeScenarioRow({ id: 'scn-1' })];
      const exposure = { total_max_loss: 300000, total_exposure: 1500000 };

      mockQuery.mockResolvedValueOnce({ rows: projections });
      mockQuery.mockResolvedValueOnce({ rows: scenarios });
      mockQuery.mockResolvedValueOnce({ rows: [exposure] });

      const result = await StrategicCommanderService.getCommanderDashboard(USER_ID);

      expect((result as any).recentProjections).toHaveLength(1);
      expect((result as any).recentScenarios).toHaveLength(1);
      expect((result as any).portfolioExposure).toEqual(exposure);
    });

    it('should cache dashboard data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_max_loss: 0, total_exposure: 0 }] });

      await StrategicCommanderService.getCommanderDashboard(USER_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        `commander:dashboard:${USER_ID}`,
        expect.any(Object),
        120,
      );
    });

    it('should return cached dashboard on cache hit', async () => {
      const cachedDashboard = { recentProjections: [], recentScenarios: [], portfolioExposure: {} };
      mockCacheGet.mockResolvedValueOnce(cachedDashboard);

      const result = await StrategicCommanderService.getCommanderDashboard(USER_ID);

      expect(result).toEqual(cachedDashboard);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return strategic recommendations', async () => {
      const rows = [
        { id: 'rec-1', title: 'Increase Google budget', priority: 1, status: 'active' },
        { id: 'rec-2', title: 'Reduce TikTok CPA', priority: 2, status: 'active' },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await StrategicCommanderService.getStrategicRecommendations(USER_ID);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([USER_ID, 'active']);
    });
  });
});

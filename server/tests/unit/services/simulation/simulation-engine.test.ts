/**
 * Unit tests for SimulationEngineService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic (campaign
 * simulation, scaling prediction, competitor modelling, sandbox testing,
 * risk assessment, and history retrieval).
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
  generateId: jest.fn().mockReturnValue('sim-uuid-new'),
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

import { SimulationEngineService } from '../../../../src/services/simulation/SimulationEngineService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { generateId } from '../../../../src/utils/helpers';
import { logger } from '../../../../src/utils/logger';

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
const SIM_ID = 'sim-uuid-new';
const CAMPAIGN_ID = 'campaign-uuid-1';
const COUNTRY_CODE = 'US';

function makeSimulationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SIM_ID,
    type: 'campaign',
    campaign_id: CAMPAIGN_ID,
    parameters: { budget: 10000, duration_days: 30, channel: 'google_ads' },
    results: {
      projected_spend: 9500,
      projected_conversions: 320,
      projected_roas: 3.4,
      projected_cpa: 29.7,
    },
    confidence_score: 0.85,
    status: 'completed',
    created_by: USER_ID,
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeCampaignRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAMPAIGN_ID,
    name: 'Test Campaign',
    platform: 'google_ads',
    country_code: COUNTRY_CODE,
    daily_budget: 500,
    status: 'active',
    total_spend: 12000,
    total_conversions: 400,
    avg_cpc: 1.25,
    avg_ctr: 0.035,
    roas: 3.2,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeScalingPredictionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pred-uuid-1',
    campaign_id: CAMPAIGN_ID,
    current_budget: 500,
    projected_budget: 1000,
    projected_conversions: 720,
    diminishing_returns_factor: 0.82,
    confidence_score: 0.78,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeRiskAssessmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'risk-uuid-1',
    simulation_id: SIM_ID,
    risk_score: 35,
    risk_level: 'medium',
    risk_factors: [
      { factor: 'budget_concentration', severity: 'medium', description: 'High spend in single channel' },
      { factor: 'audience_overlap', severity: 'low', description: 'Moderate audience overlap detected' },
    ],
    recommendation: 'go',
    mitigation_steps: [
      'Diversify channel allocation',
      'Monitor audience frequency caps',
    ],
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SimulationEngineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // simulateCampaign
  // =========================================================================

  describe('simulateCampaign', () => {
    it('should run a campaign simulation and return results', async () => {
      const row = makeSimulationRow();
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] }); // campaign lookup
      mockQuery.mockResolvedValueOnce({ rows: [row] }); // insert simulation

      const result = await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 10000,
        durationDays: 30,
      });

      expect(result.id).toBe(SIM_ID);
      expect(result.results).toBeDefined();
      expect(result.results.projected_spend).toBeDefined();
      expect(result.results.projected_roas).toBeDefined();
    });

    it('should store simulation results in database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });

      await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 10000,
        durationDays: 30,
      });

      // First call is campaign lookup; second is the INSERT
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const insertSql = mockQuery.mock.calls[1][0] as string;
      expect(insertSql).toContain('INSERT INTO');
    });

    it('should cache simulation results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });

      await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 10000,
        durationDays: 30,
      });

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('simulation:'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should include confidence score in results', async () => {
      const row = makeSimulationRow({ confidence_score: 0.92 });
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 10000,
        durationDays: 30,
      });

      expect(result.confidence_score).toBe(0.92);
    });

    it('should validate campaign parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });

      const result = await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 5000,
        durationDays: 14,
      });

      expect(result.parameters).toBeDefined();
      expect(mockQuery.mock.calls[0][1]).toContain(CAMPAIGN_ID);
    });

    it('should throw ValidationError for invalid params', async () => {
      await expect(
        SimulationEngineService.simulateCampaign(USER_ID, {
          campaignId: '',
          budget: -100,
          durationDays: 0,
        }),
      ).rejects.toThrow(ValidationError);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should create audit log on simulation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });

      await SimulationEngineService.simulateCampaign(USER_ID, {
        campaignId: CAMPAIGN_ID,
        budget: 10000,
        durationDays: 30,
      });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'simulation.campaign',
          resourceType: 'simulation',
          resourceId: SIM_ID,
        }),
      );
    });
  });

  // =========================================================================
  // predictScalingOutcome
  // =========================================================================

  describe('predictScalingOutcome', () => {
    it('should predict scaling outcomes for a campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] }); // campaign lookup
      mockQuery.mockResolvedValueOnce({ rows: [makeScalingPredictionRow()] }); // insert prediction

      const result = await SimulationEngineService.predictScalingOutcome(CAMPAIGN_ID, {
        targetBudget: 1000,
      });

      expect(result.projected_conversions).toBeDefined();
      expect(result.projected_budget).toBe(1000);
      expect(result.confidence_score).toBeDefined();
    });

    it('should model diminishing returns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeScalingPredictionRow({ diminishing_returns_factor: 0.65 })],
      });

      const result = await SimulationEngineService.predictScalingOutcome(CAMPAIGN_ID, {
        targetBudget: 5000,
      });

      expect(result.diminishing_returns_factor).toBe(0.65);
      expect(result.diminishing_returns_factor).toBeLessThan(1);
    });

    it('should throw NotFoundError for non-existent campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SimulationEngineService.predictScalingOutcome('nonexistent-id', {
          targetBudget: 1000,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // modelCompetitorReaction
  // =========================================================================

  describe('modelCompetitorReaction', () => {
    it('should model competitor reactions', async () => {
      const competitorRow = {
        id: 'comp-uuid-1',
        campaign_id: CAMPAIGN_ID,
        estimated_competitors: 5,
        market_share: 0.18,
        competitor_aggressiveness: 'moderate',
        projected_cpc_change: 0.12,
        projected_market_share_shift: -0.02,
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [competitorRow] });

      const result = await SimulationEngineService.modelCompetitorReaction(CAMPAIGN_ID, {
        budgetIncrease: 2000,
      });

      expect(result.estimated_competitors).toBe(5);
      expect(result.competitor_aggressiveness).toBe('moderate');
    });

    it('should estimate CPC impact', async () => {
      const competitorRow = {
        id: 'comp-uuid-1',
        campaign_id: CAMPAIGN_ID,
        projected_cpc_change: 0.25,
        projected_market_share_shift: -0.03,
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [competitorRow] });

      const result = await SimulationEngineService.modelCompetitorReaction(CAMPAIGN_ID, {
        budgetIncrease: 5000,
      });

      expect(result.projected_cpc_change).toBe(0.25);
      expect(typeof result.projected_cpc_change).toBe('number');
    });

    it('should estimate market share shift', async () => {
      const competitorRow = {
        id: 'comp-uuid-1',
        campaign_id: CAMPAIGN_ID,
        projected_cpc_change: 0.1,
        projected_market_share_shift: 0.05,
        market_share: 0.23,
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [competitorRow] });

      const result = await SimulationEngineService.modelCompetitorReaction(CAMPAIGN_ID, {
        budgetIncrease: 3000,
      });

      expect(result.projected_market_share_shift).toBe(0.05);
      expect(result.market_share).toBe(0.23);
    });
  });

  // =========================================================================
  // modelCPCInflation
  // =========================================================================

  describe('modelCPCInflation', () => {
    it('should project CPC trends', async () => {
      const cpcRow = {
        id: 'cpc-uuid-1',
        campaign_id: CAMPAIGN_ID,
        current_cpc: 1.25,
        projected_cpc_30d: 1.35,
        projected_cpc_60d: 1.48,
        projected_cpc_90d: 1.55,
        trend: 'increasing',
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [cpcRow] });

      const result = await SimulationEngineService.modelCPCInflation(CAMPAIGN_ID);

      expect(result.current_cpc).toBe(1.25);
      expect(result.projected_cpc_30d).toBeDefined();
      expect(result.projected_cpc_90d).toBeDefined();
      expect(result.trend).toBe('increasing');
    });

    it('should factor in seasonality', async () => {
      const cpcRow = {
        id: 'cpc-uuid-2',
        campaign_id: CAMPAIGN_ID,
        current_cpc: 1.25,
        projected_cpc_30d: 1.60,
        seasonality_factor: 1.28,
        seasonal_event: 'holiday_season',
        trend: 'increasing',
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [cpcRow] });

      const result = await SimulationEngineService.modelCPCInflation(CAMPAIGN_ID, {
        includeSeasonality: true,
      });

      expect(result.seasonality_factor).toBe(1.28);
      expect(result.seasonal_event).toBe('holiday_season');
    });

    it('should factor in competition', async () => {
      const cpcRow = {
        id: 'cpc-uuid-3',
        campaign_id: CAMPAIGN_ID,
        current_cpc: 1.25,
        projected_cpc_30d: 1.50,
        competition_factor: 1.15,
        competitor_count: 8,
        trend: 'increasing',
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [cpcRow] });

      const result = await SimulationEngineService.modelCPCInflation(CAMPAIGN_ID, {
        includeCompetition: true,
      });

      expect(result.competition_factor).toBe(1.15);
      expect(result.competitor_count).toBe(8);
    });
  });

  // =========================================================================
  // modelAudienceSaturation
  // =========================================================================

  describe('modelAudienceSaturation', () => {
    it('should predict audience saturation', async () => {
      const saturationRow = {
        id: 'sat-uuid-1',
        campaign_id: CAMPAIGN_ID,
        current_reach: 250000,
        total_addressable_audience: 1000000,
        saturation_percentage: 0.25,
        days_to_saturation: 120,
        frequency: 3.2,
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [saturationRow] });

      const result = await SimulationEngineService.modelAudienceSaturation(CAMPAIGN_ID);

      expect(result.saturation_percentage).toBe(0.25);
      expect(result.days_to_saturation).toBe(120);
      expect(result.total_addressable_audience).toBe(1000000);
    });

    it('should model frequency fatigue', async () => {
      const saturationRow = {
        id: 'sat-uuid-2',
        campaign_id: CAMPAIGN_ID,
        frequency: 8.5,
        frequency_fatigue_score: 0.72,
        optimal_frequency: 4.0,
        fatigue_onset_day: 45,
        recommendation: 'reduce_frequency',
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [saturationRow] });

      const result = await SimulationEngineService.modelAudienceSaturation(CAMPAIGN_ID);

      expect(result.frequency_fatigue_score).toBe(0.72);
      expect(result.optimal_frequency).toBe(4.0);
      expect(result.recommendation).toBe('reduce_frequency');
    });

    it('should model diminishing reach', async () => {
      const saturationRow = {
        id: 'sat-uuid-3',
        campaign_id: CAMPAIGN_ID,
        current_reach: 800000,
        total_addressable_audience: 1000000,
        saturation_percentage: 0.80,
        incremental_reach_cost: 5.50,
        diminishing_reach_factor: 0.35,
      };
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [saturationRow] });

      const result = await SimulationEngineService.modelAudienceSaturation(CAMPAIGN_ID);

      expect(result.saturation_percentage).toBe(0.80);
      expect(result.diminishing_reach_factor).toBe(0.35);
      expect(result.incremental_reach_cost).toBe(5.50);
    });
  });

  // =========================================================================
  // runSandboxSimulation
  // =========================================================================

  describe('runSandboxSimulation', () => {
    it('should test strategy against historical data', async () => {
      const sandboxRow = {
        id: 'sandbox-uuid-1',
        strategy: { channel: 'google_ads', budget: 15000, targeting: 'broad' },
        historical_period: { start: '2025-10-01', end: '2025-12-31' },
        simulated_results: { spend: 14200, conversions: 480, roas: 3.1 },
        actual_results: { spend: 13800, conversions: 450, roas: 2.9 },
        variance: { spend: 0.029, conversions: 0.067, roas: 0.069 },
        status: 'completed',
        created_at: '2026-02-25T00:00:00Z',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '90' }] }); // historical data check
      mockQuery.mockResolvedValueOnce({ rows: [sandboxRow] }); // insert sandbox run

      const result = await SimulationEngineService.runSandboxSimulation(USER_ID, {
        strategy: { channel: 'google_ads', budget: 15000, targeting: 'broad' },
        historicalPeriod: { start: '2025-10-01', end: '2025-12-31' },
      });

      expect(result.simulated_results).toBeDefined();
      expect(result.status).toBe('completed');
    });

    it('should compare simulated vs actual outcomes', async () => {
      const sandboxRow = {
        id: 'sandbox-uuid-2',
        simulated_results: { spend: 14200, conversions: 480, roas: 3.1 },
        actual_results: { spend: 13800, conversions: 450, roas: 2.9 },
        variance: { spend: 0.029, conversions: 0.067, roas: 0.069 },
        accuracy_score: 0.93,
        status: 'completed',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '90' }] });
      mockQuery.mockResolvedValueOnce({ rows: [sandboxRow] });

      const result = await SimulationEngineService.runSandboxSimulation(USER_ID, {
        strategy: { channel: 'google_ads', budget: 15000, targeting: 'broad' },
        historicalPeriod: { start: '2025-10-01', end: '2025-12-31' },
      });

      expect(result.variance).toBeDefined();
      expect(result.actual_results).toBeDefined();
      expect(result.accuracy_score).toBe(0.93);
    });

    it('should validate historical period', async () => {
      await expect(
        SimulationEngineService.runSandboxSimulation(USER_ID, {
          strategy: { channel: 'google_ads', budget: 15000 },
          historicalPeriod: { start: '2027-01-01', end: '2027-03-31' },
        }),
      ).rejects.toThrow(ValidationError);

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // assessPreLaunchRisk
  // =========================================================================

  describe('assessPreLaunchRisk', () => {
    it('should produce comprehensive risk assessment', async () => {
      const riskRow = makeRiskAssessmentRow();
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] }); // simulation lookup
      mockQuery.mockResolvedValueOnce({ rows: [riskRow] }); // insert risk assessment

      const result = await SimulationEngineService.assessPreLaunchRisk(SIM_ID);

      expect(result.risk_score).toBeDefined();
      expect(result.risk_level).toBeDefined();
      expect(result.risk_factors).toBeInstanceOf(Array);
      expect(result.risk_factors.length).toBeGreaterThan(0);
    });

    it('should return risk score and factors', async () => {
      const riskRow = makeRiskAssessmentRow({ risk_score: 72, risk_level: 'high' });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [riskRow] });

      const result = await SimulationEngineService.assessPreLaunchRisk(SIM_ID);

      expect(result.risk_score).toBe(72);
      expect(result.risk_level).toBe('high');
      expect(result.risk_factors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            factor: expect.any(String),
            severity: expect.any(String),
          }),
        ]),
      );
    });

    it('should provide go/no-go recommendation', async () => {
      const riskRow = makeRiskAssessmentRow({ recommendation: 'no-go', risk_score: 85 });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [riskRow] });

      const result = await SimulationEngineService.assessPreLaunchRisk(SIM_ID);

      expect(['go', 'no-go', 'conditional']).toContain(result.recommendation);
      expect(result.recommendation).toBe('no-go');
    });

    it('should include mitigation steps', async () => {
      const riskRow = makeRiskAssessmentRow();
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [riskRow] });

      const result = await SimulationEngineService.assessPreLaunchRisk(SIM_ID);

      expect(result.mitigation_steps).toBeInstanceOf(Array);
      expect(result.mitigation_steps.length).toBeGreaterThan(0);
      expect(typeof result.mitigation_steps[0]).toBe('string');
    });

    it('should throw NotFoundError for non-existent simulation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SimulationEngineService.assessPreLaunchRisk('nonexistent-sim'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should create audit log for risk assessment', async () => {
      const riskRow = makeRiskAssessmentRow();
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [riskRow] });

      await SimulationEngineService.assessPreLaunchRisk(SIM_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'simulation.risk_assessment',
          resourceType: 'simulation',
          resourceId: SIM_ID,
        }),
      );
    });
  });

  // =========================================================================
  // getSimulationHistory
  // =========================================================================

  describe('getSimulationHistory', () => {
    it('should return past simulations', async () => {
      const rows = [
        makeSimulationRow({ id: 'sim-1' }),
        makeSimulationRow({ id: 'sim-2', type: 'scaling' }),
        makeSimulationRow({ id: 'sim-3', type: 'sandbox' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await SimulationEngineService.getSimulationHistory();

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow({ type: 'scaling' })] });

      await SimulationEngineService.getSimulationHistory({ type: 'scaling' });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('type');
      expect(mockQuery.mock.calls[0][1]).toContain('scaling');
    });

    it('should return from cache when available', async () => {
      const cached = {
        data: [makeSimulationRow()],
        total: 1,
        page: 1,
        totalPages: 1,
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await SimulationEngineService.getSimulationHistory();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should paginate results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '25' }] });
      mockQuery.mockResolvedValueOnce({ rows: Array(10).fill(makeSimulationRow()) });

      const result = await SimulationEngineService.getSimulationHistory({
        page: 2,
        limit: 10,
      });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });

    it('should cache query results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow()] });

      await SimulationEngineService.getSimulationHistory();

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('simulation:history'),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // =========================================================================
  // getSimulationById
  // =========================================================================

  describe('getSimulationById', () => {
    it('should return a specific simulation', async () => {
      const row = makeSimulationRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await SimulationEngineService.getSimulationById(SIM_ID);

      expect(result.id).toBe(SIM_ID);
      expect(result.results).toBeDefined();
      expect(mockQuery.mock.calls[0][1]).toContain(SIM_ID);
    });

    it('should throw NotFoundError when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SimulationEngineService.getSimulationById('nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should return from cache if available', async () => {
      const cached = makeSimulationRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await SimulationEngineService.getSimulationById(SIM_ID);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should cache simulation after DB fetch', async () => {
      const row = makeSimulationRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await SimulationEngineService.getSimulationById(SIM_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining(SIM_ID),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // =========================================================================
  // compareSimulations
  // =========================================================================

  describe('compareSimulations', () => {
    it('should compare multiple simulation results', async () => {
      const sim1 = makeSimulationRow({ id: 'sim-1', results: { projected_roas: 3.4, projected_cpa: 29.7 } });
      const sim2 = makeSimulationRow({ id: 'sim-2', results: { projected_roas: 2.8, projected_cpa: 35.2 } });
      mockQuery.mockResolvedValueOnce({ rows: [sim1, sim2] });

      const result = await SimulationEngineService.compareSimulations(['sim-1', 'sim-2']);

      expect(result.simulations).toHaveLength(2);
      expect(result.comparison).toBeDefined();
      expect(result.winner).toBeDefined();
    });

    it('should validate simulation IDs exist', async () => {
      // Only one of two simulations found
      mockQuery.mockResolvedValueOnce({ rows: [makeSimulationRow({ id: 'sim-1' })] });

      await expect(
        SimulationEngineService.compareSimulations(['sim-1', 'nonexistent']),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when fewer than 2 IDs provided', async () => {
      await expect(
        SimulationEngineService.compareSimulations(['sim-1']),
      ).rejects.toThrow(ValidationError);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should include metric deltas in comparison', async () => {
      const sim1 = makeSimulationRow({
        id: 'sim-1',
        results: { projected_roas: 3.4, projected_conversions: 320 },
      });
      const sim2 = makeSimulationRow({
        id: 'sim-2',
        results: { projected_roas: 2.8, projected_conversions: 280 },
      });
      mockQuery.mockResolvedValueOnce({ rows: [sim1, sim2] });

      const result = await SimulationEngineService.compareSimulations(['sim-1', 'sim-2']);

      expect(result.comparison).toBeDefined();
      expect(result.comparison.roas_delta).toBeDefined();
    });
  });
});

/**
 * Unit tests for ROIProjectionOutputService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests exercise
 * only the service logic (ROI projection generation, country-specific ROI,
 * trend analysis, scenario building, LTV/CAC calculations, and confidence
 * scoring).
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

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ROIProjectionOutputService } from '../../../../src/services/final-outputs/ROIProjectionOutputService';
import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet } from '../../../../src/config/redis';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCampaignRows() {
  return [
    {
      platform: 'google_ads',
      spend: '5000',
      conversions: '100',
      revenue: '15000',
      start_date: '2025-11-01',
      country_id: 'US',
    },
    {
      platform: 'meta',
      spend: '3000',
      conversions: '60',
      revenue: '9000',
      start_date: '2025-12-01',
      country_id: 'US',
    },
    {
      platform: 'google_ads',
      spend: '2000',
      conversions: '40',
      revenue: '7000',
      start_date: '2026-01-01',
      country_id: 'DE',
    },
  ];
}

function makeSimulationRows() {
  return [
    {
      id: 'sim-1',
      type: 'campaign',
      parameters: { budget: 10000, duration_days: 30 },
      results: { projected_spend: 9500, projected_roas: 3.0 },
      confidence_score: '0.85',
    },
  ];
}

function makeMonthlyRevenueRows() {
  return [
    { period: '2025-11', revenue: '15000' },
    { period: '2025-12', revenue: '9000' },
    { period: '2026-01', revenue: '7000' },
  ];
}

function makeOverallLTVCACRow() {
  return {
    total_revenue: '31000',
    total_spend: '10000',
    total_conversions: '200',
  };
}

function makeCountryLTVCACRows() {
  return [
    { country_code: 'US', revenue: '24000', spend: '8000', conversions: '160' },
    { country_code: 'DE', revenue: '7000', spend: '2000', conversions: '40' },
  ];
}

function makeTrendRows() {
  return [
    { period: '2025-11', spend: '5000', revenue: '15000' },
    { period: '2025-12', spend: '3000', revenue: '9000' },
    { period: '2026-01', spend: '2000', revenue: '7000' },
  ];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ROIProjectionOutputService', () => {
  // =========================================================================
  // generateROIProjection
  // =========================================================================

  describe('generateROIProjection', () => {
    it('should return cached result when available', async () => {
      const cachedData = { projections: {}, generated_at: '2026-01-01T00:00:00Z' };
      mockCacheGet.mockResolvedValueOnce(cachedData);

      const result = await ROIProjectionOutputService.generateROIProjection();

      expect(result).toEqual(cachedData);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should generate full ROI projection from DB data', async () => {
      // Campaign metrics query
      mockQuery.mockResolvedValueOnce({ rows: makeCampaignRows() });
      // Simulations query
      mockQuery.mockResolvedValueOnce({ rows: makeSimulationRows() });
      // Historical growth rate query
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      // Monthly revenues query (for payback period)
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      // Overall LTV/CAC query
      mockQuery.mockResolvedValueOnce({ rows: [makeOverallLTVCACRow()] });
      // Country LTV/CAC query
      mockQuery.mockResolvedValueOnce({ rows: makeCountryLTVCACRows() });

      const result = await ROIProjectionOutputService.generateROIProjection();

      expect(result).toHaveProperty('projections');
      expect(result).toHaveProperty('roi_summary');
      expect(result).toHaveProperty('ltv_cac_analysis');
      expect(result).toHaveProperty('channel_roi');
      expect(result).toHaveProperty('monthly_forecast');
      expect(result).toHaveProperty('generated_at');
      expect(result).toHaveProperty('confidence_score');

      // Verify scenario projections structure
      expect(result.projections).toHaveProperty('conservative');
      expect(result.projections).toHaveProperty('base');
      expect(result.projections).toHaveProperty('aggressive');

      expect(result.projections.conservative.scenario).toBe('conservative');
      expect(result.projections.base.scenario).toBe('base');
      expect(result.projections.aggressive.scenario).toBe('aggressive');

      // Verify each scenario has required fields
      for (const scenario of [result.projections.conservative, result.projections.base, result.projections.aggressive]) {
        expect(scenario).toHaveProperty('revenue_30d');
        expect(scenario).toHaveProperty('revenue_60d');
        expect(scenario).toHaveProperty('revenue_90d');
        expect(scenario).toHaveProperty('total_spend');
        expect(scenario).toHaveProperty('roi_pct');
        expect(scenario).toHaveProperty('confidence');
        expect(typeof scenario.confidence).toBe('number');
      }

      // Verify result was cached
      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should compute correct ROI summary values from campaign data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: makeCampaignRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeSimulationRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      mockQuery.mockResolvedValueOnce({ rows: [makeOverallLTVCACRow()] });
      mockQuery.mockResolvedValueOnce({ rows: makeCountryLTVCACRows() });

      const result = await ROIProjectionOutputService.generateROIProjection();

      // Total investment = 5000 + 3000 + 2000 = 10000
      expect(result.roi_summary.total_investment).toBe(10000);
      // Total projected revenue = 15000 + 9000 + 7000 = 31000
      expect(result.roi_summary.projected_revenue).toBe(31000);
      // ROI = (31000 - 10000) / 10000 * 100 = 210%
      expect(result.roi_summary.projected_roi_pct).toBe(210);
      expect(result.roi_summary.payback_period_months).toBeGreaterThan(0);
      expect(result.roi_summary.break_even_date).toBeDefined();
    });

    it('should build correct channel ROI breakdown', async () => {
      mockQuery.mockResolvedValueOnce({ rows: makeCampaignRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeSimulationRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      mockQuery.mockResolvedValueOnce({ rows: makeMonthlyRevenueRows() });
      mockQuery.mockResolvedValueOnce({ rows: [makeOverallLTVCACRow()] });
      mockQuery.mockResolvedValueOnce({ rows: makeCountryLTVCACRows() });

      const result = await ROIProjectionOutputService.generateROIProjection();

      // Should have google_ads and meta channels
      expect(result.channel_roi.length).toBe(2);
      const googleChannel = result.channel_roi.find((c) => c.channel === 'google_ads');
      const metaChannel = result.channel_roi.find((c) => c.channel === 'meta');

      expect(googleChannel).toBeDefined();
      expect(metaChannel).toBeDefined();

      // google_ads: spend = 5000 + 2000 = 7000, revenue = 15000 + 7000 = 22000
      expect(googleChannel!.investment).toBe(7000);
      expect(googleChannel!.projected_return).toBe(22000);

      // meta: spend = 3000, revenue = 9000
      expect(metaChannel!.investment).toBe(3000);
      expect(metaChannel!.projected_return).toBe(9000);
    });

    it('should handle empty campaign data gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // campaigns
      mockQuery.mockResolvedValueOnce({ rows: [] }); // simulations
      mockQuery.mockResolvedValueOnce({ rows: [] }); // growth rate
      mockQuery.mockResolvedValueOnce({ rows: [] }); // monthly revenues
      mockQuery.mockResolvedValueOnce({ rows: [{ total_revenue: '0', total_spend: '0', total_conversions: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // country LTV/CAC

      const result = await ROIProjectionOutputService.generateROIProjection();

      expect(result.roi_summary.total_investment).toBe(0);
      expect(result.roi_summary.projected_revenue).toBe(0);
      expect(result.roi_summary.projected_roi_pct).toBe(0);
      expect(result.channel_roi).toEqual([]);
      expect(result.monthly_forecast).toEqual([]);
      expect(result.ltv_cac_analysis.avg_ltv).toBe(0);
      expect(result.ltv_cac_analysis.avg_cac).toBe(0);
    });
  });

  // =========================================================================
  // getROIByCountry
  // =========================================================================

  describe('getROIByCountry', () => {
    it('should return country-specific ROI projection', async () => {
      // Country query
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'US', name: 'United States' }],
      });
      // Campaign data for country
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'google_ads', spend: '5000', conversions: '100', revenue: '15000' },
          { platform: 'meta', spend: '3000', conversions: '60', revenue: '9000' },
        ],
      });

      const result = await ROIProjectionOutputService.getROIByCountry('US');

      expect(result.country_code).toBe('US');
      expect(result.country_name).toBe('United States');
      expect(result.total_investment).toBe(8000);
      expect(result.projected_revenue).toBe(24000);
      expect(result.roi_pct).toBe(200);
      expect(result.ltv).toBe(150); // 24000 / 160
      expect(result.cac).toBe(50); // 8000 / 160
      expect(result.ltv_cac_ratio).toBe(3); // 150 / 50
      expect(result.channel_roi.length).toBe(2);
      expect(result.confidence_score).toBeGreaterThan(0);
    });

    it('should return cached country ROI when available', async () => {
      const cachedData = { country_code: 'US', roi_pct: 150 };
      mockCacheGet.mockResolvedValueOnce(cachedData);

      const result = await ROIProjectionOutputService.getROIByCountry('US');

      expect(result).toEqual(cachedData);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle country with no campaign data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'ZZ', name: 'Unknown Country' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ROIProjectionOutputService.getROIByCountry('ZZ');

      expect(result.country_code).toBe('ZZ');
      expect(result.total_investment).toBe(0);
      expect(result.projected_revenue).toBe(0);
      expect(result.roi_pct).toBe(0);
      expect(result.ltv).toBe(0);
      expect(result.cac).toBe(0);
      expect(result.channel_roi).toEqual([]);
    });
  });

  // =========================================================================
  // getROITrend
  // =========================================================================

  describe('getROITrend', () => {
    it('should return historical ROI trend with correct values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: makeTrendRows() });

      const result = await ROIProjectionOutputService.getROITrend();

      expect(result).toHaveProperty('trend');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('avg_roi');
      expect(result).toHaveProperty('generated_at');

      expect(result.trend.length).toBe(3);

      // First period: spend=5000, revenue=15000, ROI=(15000-5000)/5000*100=200%
      expect(result.trend[0].period).toBe('2025-11');
      expect(result.trend[0].spend).toBe(5000);
      expect(result.trend[0].revenue).toBe(15000);
      expect(result.trend[0].roi_pct).toBe(200);

      // Verify cumulative ROI for first period matches period ROI
      expect(result.trend[0].cumulative_roi).toBe(200);
    });

    it('should determine declining trend direction correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { period: '2025-10', spend: '1000', revenue: '5000' },  // ROI=400%
          { period: '2025-11', spend: '1000', revenue: '4000' },  // ROI=300%
          { period: '2025-12', spend: '1000', revenue: '2000' },  // ROI=100%
          { period: '2026-01', spend: '1000', revenue: '1500' },  // ROI=50%
        ],
      });

      const result = await ROIProjectionOutputService.getROITrend();

      expect(result.direction).toBe('declining');
    });

    it('should return cached trend when available', async () => {
      const cachedTrend = { trend: [], direction: 'stable', avg_roi: 0 };
      mockCacheGet.mockResolvedValueOnce(cachedTrend);

      const result = await ROIProjectionOutputService.getROITrend();

      expect(result).toEqual(cachedTrend);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle empty trend data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await ROIProjectionOutputService.getROITrend();

      expect(result.trend).toEqual([]);
      expect(result.direction).toBe('stable');
      expect(result.avg_roi).toBe(0);
    });
  });
});

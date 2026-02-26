/**
 * E2E tests for ROI Projection workflow (Phase 10 Deliverable #6).
 *
 * Tests complete workflow scenarios:
 *   1. Full ROI projection lifecycle
 *   2. Country-specific ROI analysis
 *   3. Historical ROI trend analysis
 *   4. Multi-channel ROI computation
 *   5. Scenario projection comparison
 *   6. LTV/CAC analysis with country breakdown
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import { ROIProjectionOutputService } from '../../../src/services/final-outputs/ROIProjectionOutputService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMultiCountryCampaignData() {
  return [
    {
      platform: 'google_ads', spend: '10000', conversions: '200',
      revenue: '30000', start_date: '2025-10-01', country_id: 'US',
    },
    {
      platform: 'meta', spend: '8000', conversions: '150',
      revenue: '24000', start_date: '2025-10-15', country_id: 'US',
    },
    {
      platform: 'google_ads', spend: '5000', conversions: '80',
      revenue: '16000', start_date: '2025-11-01', country_id: 'DE',
    },
    {
      platform: 'tiktok', spend: '3000', conversions: '60',
      revenue: '9000', start_date: '2025-11-15', country_id: 'JP',
    },
    {
      platform: 'meta', spend: '4000', conversions: '70',
      revenue: '14000', start_date: '2025-12-01', country_id: 'US',
    },
    {
      platform: 'google_ads', spend: '6000', conversions: '110',
      revenue: '20000', start_date: '2026-01-01', country_id: 'DE',
    },
  ];
}

function makeSimulationData() {
  return [
    {
      id: 'sim-1', type: 'campaign',
      parameters: JSON.stringify({ budget: 20000, duration_days: 30 }),
      results: JSON.stringify({ projected_spend: 19000, projected_roas: 3.2 }),
      confidence_score: '0.82',
    },
    {
      id: 'sim-2', type: 'campaign',
      parameters: JSON.stringify({ budget: 15000, duration_days: 30 }),
      results: JSON.stringify({ projected_spend: 14250, projected_roas: 2.8 }),
      confidence_score: '0.78',
    },
  ];
}

function makeGrowthRows() {
  return [
    { period: '2025-10', revenue: '54000' },
    { period: '2025-11', revenue: '25000' },
    { period: '2025-12', revenue: '14000' },
    { period: '2026-01', revenue: '20000' },
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

describe('ROI Projection Workflow E2E', () => {
  describe('Workflow 1: Full ROI Projection Lifecycle', () => {
    it('should generate a comprehensive ROI projection with all components', async () => {
      // Setup DB responses for full projection
      mockQuery.mockResolvedValueOnce({ rows: makeMultiCountryCampaignData() }); // campaign metrics
      mockQuery.mockResolvedValueOnce({ rows: makeSimulationData() }); // simulations
      mockQuery.mockResolvedValueOnce({ rows: makeGrowthRows() }); // growth rate
      mockQuery.mockResolvedValueOnce({ rows: makeGrowthRows() }); // monthly revenues
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '113000', total_spend: '36000', total_conversions: '670' }],
      }); // overall LTV/CAC
      mockQuery.mockResolvedValueOnce({
        rows: [
          { country_code: 'US', revenue: '68000', spend: '22000', conversions: '420' },
          { country_code: 'DE', revenue: '36000', spend: '11000', conversions: '190' },
          { country_code: 'JP', revenue: '9000', spend: '3000', conversions: '60' },
        ],
      }); // country LTV/CAC

      const projection = await ROIProjectionOutputService.generateROIProjection();

      // Verify full structure
      expect(projection.projections.conservative.scenario).toBe('conservative');
      expect(projection.projections.base.scenario).toBe('base');
      expect(projection.projections.aggressive.scenario).toBe('aggressive');

      // All scenario projections should have numeric revenue values
      expect(typeof projection.projections.aggressive.revenue_90d).toBe('number');
      expect(typeof projection.projections.base.revenue_90d).toBe('number');
      expect(typeof projection.projections.conservative.revenue_90d).toBe('number');

      // Each scenario should have distinct revenue figures (different multipliers)
      expect(projection.projections.conservative.revenue_90d).not.toBe(
        projection.projections.aggressive.revenue_90d,
      );

      // Verify ROI summary
      expect(projection.roi_summary.total_investment).toBe(36000);
      expect(projection.roi_summary.projected_revenue).toBe(113000);
      expect(projection.roi_summary.projected_roi_pct).toBeGreaterThan(0);
      expect(typeof projection.roi_summary.payback_period_months).toBe('number');
      expect(projection.roi_summary.break_even_date).toBeDefined();

      // Verify LTV/CAC analysis
      expect(projection.ltv_cac_analysis.avg_ltv).toBeGreaterThan(0);
      expect(projection.ltv_cac_analysis.avg_cac).toBeGreaterThan(0);
      expect(projection.ltv_cac_analysis.ltv_cac_ratio).toBeGreaterThan(0);
      expect(projection.ltv_cac_analysis.by_country.length).toBe(3);

      // Verify channel ROI
      expect(projection.channel_roi.length).toBe(3); // google_ads, meta, tiktok
      for (const channel of projection.channel_roi) {
        expect(channel).toHaveProperty('channel');
        expect(channel).toHaveProperty('investment');
        expect(channel).toHaveProperty('projected_return');
        expect(channel).toHaveProperty('roi_pct');
      }

      // Verify monthly forecast
      expect(projection.monthly_forecast.length).toBeGreaterThan(0);
      for (const entry of projection.monthly_forecast) {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('revenue');
        expect(entry).toHaveProperty('spend');
        expect(entry).toHaveProperty('profit');
        expect(entry).toHaveProperty('cumulative_roi');
      }

      // Verify confidence and timestamp
      expect(projection.confidence_score).toBeGreaterThan(0);
      expect(projection.confidence_score).toBeLessThanOrEqual(0.95);
      expect(projection.generated_at).toBeDefined();
    });
  });

  describe('Workflow 2: Country ROI Comparison', () => {
    it('should generate and compare ROI across multiple countries', async () => {
      // US ROI
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'US', name: 'United States' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'google_ads', spend: '10000', conversions: '200', revenue: '30000' },
          { platform: 'meta', spend: '12000', conversions: '220', revenue: '38000' },
        ],
      });

      const usROI = await ROIProjectionOutputService.getROIByCountry('US');

      // DE ROI
      mockQuery.mockResolvedValueOnce({
        rows: [{ code: 'DE', name: 'Germany' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'google_ads', spend: '11000', conversions: '190', revenue: '36000' },
        ],
      });

      const deROI = await ROIProjectionOutputService.getROIByCountry('DE');

      // Both countries should have valid ROI data
      expect(usROI.country_code).toBe('US');
      expect(deROI.country_code).toBe('DE');

      expect(usROI.total_investment).toBeGreaterThan(0);
      expect(deROI.total_investment).toBeGreaterThan(0);

      expect(usROI.roi_pct).toBeGreaterThan(0);
      expect(deROI.roi_pct).toBeGreaterThan(0);

      // US should have more channels than DE
      expect(usROI.channel_roi.length).toBe(2);
      expect(deROI.channel_roi.length).toBe(1);

      // Both should have LTV/CAC analysis
      expect(usROI.ltv_cac_ratio).toBeGreaterThan(0);
      expect(deROI.ltv_cac_ratio).toBeGreaterThan(0);
    });
  });

  describe('Workflow 3: ROI Trend Analysis', () => {
    it('should track ROI trend over time and detect direction', async () => {
      // Improving trend - ROI increases over time
      mockQuery.mockResolvedValueOnce({
        rows: [
          { period: '2025-09', spend: '10000', revenue: '15000' },
          { period: '2025-10', spend: '10000', revenue: '18000' },
          { period: '2025-11', spend: '10000', revenue: '22000' },
          { period: '2025-12', spend: '10000', revenue: '28000' },
        ],
      });

      const trend = await ROIProjectionOutputService.getROITrend();

      expect(trend.direction).toBe('improving');
      expect(trend.trend.length).toBe(4);
      expect(trend.avg_roi).toBeGreaterThan(0);

      // Verify cumulative ROI is computed correctly
      const lastEntry = trend.trend[trend.trend.length - 1];
      expect(lastEntry.cumulative_roi).toBeGreaterThan(0);

      // Verify monthly profit is revenue - spend
      for (const entry of trend.trend) {
        const expectedROI = (entry.revenue - entry.spend) / entry.spend * 100;
        expect(entry.roi_pct).toBeCloseTo(expectedROI, 1);
      }
    });
  });

  describe('Workflow 4: Multi-Channel ROI Breakdown', () => {
    it('should compute correct per-channel ROI from campaign data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'google_ads', spend: '15000', conversions: '300', revenue: '45000', start_date: '2025-11-01', country_id: 'US' },
          { platform: 'meta', spend: '10000', conversions: '150', revenue: '20000', start_date: '2025-11-01', country_id: 'US' },
          { platform: 'tiktok', spend: '5000', conversions: '100', revenue: '18000', start_date: '2025-11-01', country_id: 'US' },
        ],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // simulations
      mockQuery.mockResolvedValueOnce({ rows: [{ period: '2025-11', revenue: '83000' }] }); // growth rate
      mockQuery.mockResolvedValueOnce({ rows: [{ period: '2025-11', revenue: '83000' }] }); // monthly revenues
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_revenue: '83000', total_spend: '30000', total_conversions: '550' }],
      }); // overall LTV/CAC
      mockQuery.mockResolvedValueOnce({
        rows: [{ country_code: 'US', revenue: '83000', spend: '30000', conversions: '550' }],
      }); // country LTV/CAC

      const projection = await ROIProjectionOutputService.generateROIProjection();

      // Verify all 3 channels present
      expect(projection.channel_roi.length).toBe(3);

      const google = projection.channel_roi.find((c) => c.channel === 'google_ads')!;
      const meta = projection.channel_roi.find((c) => c.channel === 'meta')!;
      const tiktok = projection.channel_roi.find((c) => c.channel === 'tiktok')!;

      // Google: spend=15000, revenue=45000, ROI=200%
      expect(google.investment).toBe(15000);
      expect(google.projected_return).toBe(45000);
      expect(google.roi_pct).toBe(200);

      // Meta: spend=10000, revenue=20000, ROI=100%
      expect(meta.investment).toBe(10000);
      expect(meta.projected_return).toBe(20000);
      expect(meta.roi_pct).toBe(100);

      // TikTok: spend=5000, revenue=18000, ROI=260%
      expect(tiktok.investment).toBe(5000);
      expect(tiktok.projected_return).toBe(18000);
      expect(tiktok.roi_pct).toBe(260);
    });
  });

  describe('Workflow 5: LTV/CAC Analysis with Country Breakdown', () => {
    it('should compute correct LTV/CAC ratios across countries', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: makeMultiCountryCampaignData(),
      }); // campaigns
      mockQuery.mockResolvedValueOnce({ rows: makeSimulationData() }); // simulations
      mockQuery.mockResolvedValueOnce({ rows: makeGrowthRows() }); // growth rate
      mockQuery.mockResolvedValueOnce({ rows: makeGrowthRows() }); // monthly revenues
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_revenue: '113000',
          total_spend: '36000',
          total_conversions: '670',
        }],
      }); // overall LTV/CAC
      mockQuery.mockResolvedValueOnce({
        rows: [
          { country_code: 'US', revenue: '68000', spend: '22000', conversions: '420' },
          { country_code: 'DE', revenue: '36000', spend: '11000', conversions: '190' },
          { country_code: 'JP', revenue: '9000', spend: '3000', conversions: '60' },
        ],
      }); // country LTV/CAC

      const projection = await ROIProjectionOutputService.generateROIProjection();
      const analysis = projection.ltv_cac_analysis;

      // Overall averages: LTV = 113000/670, CAC = 36000/670
      expect(analysis.avg_ltv).toBeGreaterThan(0);
      expect(analysis.avg_cac).toBeGreaterThan(0);
      expect(analysis.ltv_cac_ratio).toBeGreaterThan(1); // Should be profitable

      // Country breakdown
      expect(analysis.by_country.length).toBe(3);

      const usEntry = analysis.by_country.find((c) => c.country_code === 'US')!;
      expect(usEntry.ltv).toBeCloseTo(68000 / 420, 1);
      expect(usEntry.cac).toBeCloseTo(22000 / 420, 1);
      expect(usEntry.ratio).toBeGreaterThan(0);

      const deEntry = analysis.by_country.find((c) => c.country_code === 'DE')!;
      expect(deEntry.ltv).toBeCloseTo(36000 / 190, 1);

      const jpEntry = analysis.by_country.find((c) => c.country_code === 'JP')!;
      expect(jpEntry.ltv).toBeCloseTo(9000 / 60, 1);
      expect(jpEntry.cac).toBeCloseTo(3000 / 60, 1);
    });
  });
});

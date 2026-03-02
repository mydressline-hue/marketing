/**
 * Dashboard Integration Tests (Phase 12C - Batch 2).
 *
 * Validates dashboard overview aggregation, KPI calculations, revenue chart
 * generation, top countries ranking, system confidence, channel spend,
 * agent status aggregation, alert list, caching behavior, and data shapes.
 */

// ---------------------------------------------------------------------------
// Mocks
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
    NODE_ENV: 'test', PORT: 3001, API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h', JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000, RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error', LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('dash-test-uuid'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted'),
  decrypt: jest.fn().mockReturnValue('decrypted'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet } from '../../../src/config/redis';
import { DashboardService } from '../../../src/services/dashboard/DashboardService';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sets up the 14 parallel queries for getOverview to return realistic data. */
function setupOverviewMocks() {
  mockQuery
    // 1. total spend
    .mockResolvedValueOnce({ rows: [{ total_spend: '25000.50' }] })
    // 2. spend by platform
    .mockResolvedValueOnce({ rows: [{ platform: 'google_ads', spend: '15000' }, { platform: 'meta_ads', spend: '10000.50' }] })
    // 3. spend trend
    .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', amount: '800' }, { date: '2026-01-02', amount: '900' }] })
    // 4. campaign status counts
    .mockResolvedValueOnce({ rows: [{ total: '50', active: '30', paused: '10', draft: '10' }] })
    // 5. campaigns by platform
    .mockResolvedValueOnce({ rows: [{ platform: 'google_ads', count: '25' }, { platform: 'meta_ads', count: '25' }] })
    // 6. ad platform connections
    .mockResolvedValueOnce({ rows: [{ platform_type: 'google_ads', is_active: true, updated_at: new Date().toISOString() }] })
    // 7. CRM platform connections
    .mockResolvedValueOnce({ rows: [{ platform_type: 'hubspot', is_active: true, updated_at: new Date().toISOString() }] })
    // 8. analytics platform connections
    .mockResolvedValueOnce({ rows: [] })
    // 9. CRM contact counts
    .mockResolvedValueOnce({ rows: [{ platform_type: 'hubspot', count: '500' }] })
    // 10. CRM recent syncs
    .mockResolvedValueOnce({ rows: [{ platform_type: 'hubspot', started_at: '2026-01-01T00:00:00Z', records_synced: '100' }] })
    // 11. agent status counts
    .mockResolvedValueOnce({ rows: [{ total: '20', active: '5', paused: '2', idle: '13' }] })
    // 12. alerts
    .mockResolvedValueOnce({ rows: [{ total_active: '8', critical: '2', warning: '3', info: '3', unacknowledged: '4' }] })
    // 13. kill switch
    .mockResolvedValueOnce({ rows: [] })
    // 14. countries
    .mockResolvedValueOnce({ rows: [{ countries_active: '15', market_readiness_avg: '72.50' }] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Dashboard overview aggregation
  // =========================================================================

  describe('Dashboard overview aggregation', () => {
    it('should aggregate all dashboard sections into a single overview', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview).toHaveProperty('spend');
      expect(overview).toHaveProperty('campaigns');
      expect(overview).toHaveProperty('integrations');
      expect(overview).toHaveProperty('crm');
      expect(overview).toHaveProperty('agents');
      expect(overview).toHaveProperty('alerts');
      expect(overview).toHaveProperty('system');
    });

    it('should cache the overview result', async () => {
      setupOverviewMocks();

      await DashboardService.getOverview('user-1');

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining('dashboard:overview:user-1'),
        expect.any(Object),
        60,
      );
    });
  });

  // =========================================================================
  // KPI calculations
  // =========================================================================

  describe('KPI calculation', () => {
    it('should calculate total revenue (spend) from campaigns', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.spend.total_spend).toBe(25000.50);
      expect(typeof overview.spend.total_spend).toBe('number');
    });

    it('should calculate campaign counts by status', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.campaigns.total).toBe(50);
      expect(overview.campaigns.active).toBe(30);
      expect(overview.campaigns.paused).toBe(10);
      expect(overview.campaigns.draft).toBe(10);
      expect(overview.campaigns.active + overview.campaigns.paused + overview.campaigns.draft).toBeLessThanOrEqual(overview.campaigns.total);
    });

    it('should compute country count and market readiness average', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.system.countries_active).toBe(15);
      expect(overview.system.market_readiness_avg).toBe(72.5);
    });
  });

  // =========================================================================
  // Revenue chart data generation (spend trend)
  // =========================================================================

  describe('Revenue chart data generation', () => {
    it('should return spend trend data with dates and amounts', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.spend.spend_trend).toHaveLength(2);
      expect(overview.spend.spend_trend[0]).toHaveProperty('date');
      expect(overview.spend.spend_trend[0]).toHaveProperty('amount');
      expect(typeof overview.spend.spend_trend[0].amount).toBe('number');
    });
  });

  // =========================================================================
  // Channel spend summary
  // =========================================================================

  describe('Channel spend summary', () => {
    it('should return spend breakdown by platform', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.spend.spend_by_platform).toHaveLength(2);
      expect(overview.spend.spend_by_platform[0].platform).toBe('google_ads');
      expect(overview.spend.spend_by_platform[0].spend).toBe(15000);
      expect(overview.spend.spend_by_platform[0].currency).toBe('USD');
    });
  });

  // =========================================================================
  // Agent status aggregation for dashboard
  // =========================================================================

  describe('Agent status aggregation for dashboard', () => {
    it('should return agent counts by status', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.agents.total).toBe(20);
      expect(overview.agents.active).toBe(5);
      expect(overview.agents.paused).toBe(2);
      expect(overview.agents.idle).toBe(13);
    });
  });

  // =========================================================================
  // Alert list for dashboard
  // =========================================================================

  describe('Alert list for dashboard', () => {
    it('should return alert counts by severity', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.alerts.total_active).toBe(8);
      expect(overview.alerts.critical).toBe(2);
      expect(overview.alerts.warning).toBe(3);
      expect(overview.alerts.info).toBe(3);
      expect(overview.alerts.unacknowledged).toBe(4);
    });
  });

  // =========================================================================
  // System confidence / kill switch metrics
  // =========================================================================

  describe('System confidence metrics', () => {
    it('should report no active kill switch when none exists', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.system.kill_switch_active).toBe(false);
      expect(overview.system.kill_switch_level).toBeNull();
    });

    it('should report active kill switch level when one exists', async () => {
      // Override the kill switch mock (query index 12)
      const mocks = [
        { rows: [{ total_spend: '10000' }] },
        { rows: [] }, { rows: [] },
        { rows: [{ total: '10', active: '5', paused: '3', draft: '2' }] },
        { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] },
        { rows: [] }, { rows: [] },
        { rows: [{ total: '20', active: '5', paused: '2', idle: '13' }] },
        { rows: [{ total_active: '0', critical: '0', warning: '0', info: '0', unacknowledged: '0' }] },
        { rows: [{ level: 3, is_active: true }] }, // Kill switch active!
        { rows: [{ countries_active: '10', market_readiness_avg: '65.00' }] },
      ];
      mocks.forEach(m => mockQuery.mockResolvedValueOnce(m));

      const overview = await DashboardService.getOverview('user-1');

      expect(overview.system.kill_switch_active).toBe(true);
      expect(overview.system.kill_switch_level).toBe(3);
    });
  });

  // =========================================================================
  // Caching behavior
  // =========================================================================

  describe('Caching behavior', () => {
    it('should return cached overview on second call', async () => {
      const cachedOverview = {
        spend: { total_spend: 5000, spend_by_platform: [], spend_trend: [] },
        campaigns: { total: 10, active: 5, paused: 3, draft: 2, by_platform: [] },
        integrations: { total_connected: 1, total_available: 13, platforms: [], sync_health: { healthy: 1, degraded: 0, error: 0 } },
        crm: { total_contacts: 100, contacts_by_platform: [], recent_syncs: [] },
        agents: { total: 20, active: 5, paused: 2, idle: 13 },
        alerts: { total_active: 0, critical: 0, warning: 0, info: 0, unacknowledged: 0 },
        system: { kill_switch_level: null, kill_switch_active: false, countries_active: 10, market_readiness_avg: 60 },
      };
      mockCacheGet.mockResolvedValueOnce(cachedOverview);

      const result = await DashboardService.getOverview('user-1');

      expect(result).toEqual(cachedOverview);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Dashboard data shapes
  // =========================================================================

  describe('Dashboard data shapes', () => {
    it('should have correctly shaped spend overview', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(typeof overview.spend.total_spend).toBe('number');
      expect(Array.isArray(overview.spend.spend_by_platform)).toBe(true);
      expect(Array.isArray(overview.spend.spend_trend)).toBe(true);
    });

    it('should have correctly shaped campaigns overview', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(typeof overview.campaigns.total).toBe('number');
      expect(typeof overview.campaigns.active).toBe('number');
      expect(Array.isArray(overview.campaigns.by_platform)).toBe(true);
    });

    it('should have correctly shaped integrations overview', async () => {
      setupOverviewMocks();

      const overview = await DashboardService.getOverview('user-1');

      expect(typeof overview.integrations.total_connected).toBe('number');
      expect(typeof overview.integrations.total_available).toBe('number');
      expect(overview.integrations.total_available).toBe(13); // 5 ad + 5 CRM + 3 BI
      expect(overview.integrations.sync_health).toHaveProperty('healthy');
      expect(overview.integrations.sync_health).toHaveProperty('degraded');
      expect(overview.integrations.sync_health).toHaveProperty('error');
    });
  });

  // =========================================================================
  // Spend breakdown
  // =========================================================================

  describe('Spend breakdown', () => {
    it('should return detailed spend breakdown by platform, country, and daily', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_spend: '15000' }] })
        .mockResolvedValueOnce({ rows: [{ platform: 'google_ads', spend: '10000' }] })
        .mockResolvedValueOnce({ rows: [{ country: 'United States', spend: '8000' }, { country: 'Germany', spend: '7000' }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-01-01', amount: '500' }] });

      const breakdown = await DashboardService.getSpendBreakdown('user-1');

      expect(breakdown.total_spend).toBe(15000);
      expect(breakdown.by_platform).toHaveLength(1);
      expect(breakdown.by_country).toHaveLength(2);
      expect(breakdown.daily_spend).toHaveLength(1);
    });
  });

  // =========================================================================
  // Campaign performance
  // =========================================================================

  describe('Campaign performance', () => {
    it('should compute derived KPIs (CTR, CPC, CPA, ROAS)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'c1', name: 'Campaign A', platform: 'google_ads', status: 'active',
          budget: '5000', spent: '2000', impressions: '100000', clicks: '5000',
          conversions: '100', revenue: '10000',
        }],
      });

      const result = await DashboardService.getCampaignPerformance('user-1');

      expect(result).toHaveLength(1);
      const camp = result[0];
      expect(camp.ctr).toBe(5); // (5000/100000)*100
      expect(camp.cpc).toBe(0.4); // 2000/5000
      expect(camp.cpa).toBe(20); // 2000/100
      expect(camp.roas).toBe(5); // 10000/2000
    });

    it('should handle zero division gracefully in KPI calculations', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'c2', name: 'Campaign B', platform: 'meta_ads', status: 'draft',
          budget: '1000', spent: '0', impressions: '0', clicks: '0',
          conversions: '0', revenue: '0',
        }],
      });

      const result = await DashboardService.getCampaignPerformance('user-1');

      expect(result[0].ctr).toBe(0);
      expect(result[0].cpc).toBe(0);
      expect(result[0].cpa).toBe(0);
      expect(result[0].roas).toBe(0);
    });
  });
});

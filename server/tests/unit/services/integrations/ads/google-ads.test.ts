/**
 * Unit tests for GoogleAdsService.
 *
 * All external dependencies (database, cache, logger, audit) are fully mocked
 * so tests exercise only the service logic: campaign CRUD, bidding management,
 * reporting, and sync operations.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn(), cacheFlush: jest.fn(),
}));
jest.mock('../../../../../../src/config/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('gads-uuid-1'),
}));
jest.mock('../../../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { GoogleAdsService } from '../../../../../../src/services/integrations/ads/GoogleAdsService';
import { pool } from '../../../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../../../../src/config/redis';
import { AuditService } from '../../../../../../src/services/audit.service';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const CAMPAIGN_ID = 'campaign-uuid-1';
const CONNECTION_ID = 'conn-uuid-1';

function makeCampaignRow(overrides = {}) {
  return {
    id: 'gads-uuid-1',
    platform_type: 'google_ads',
    external_campaign_id: 'gads-ext-123',
    internal_campaign_id: CAMPAIGN_ID,
    sync_data: { name: 'Test Campaign', status: 'ENABLED', budget_micros: 10000000 },
    sync_status: 'synced',
    last_synced_at: '2026-02-25T00:00:00Z',
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeReportRow(overrides = {}) {
  return {
    id: 'report-uuid-1',
    platform_type: 'google_ads',
    campaign_id: CAMPAIGN_ID,
    report_type: 'campaign_performance',
    date_range_start: '2026-02-01',
    date_range_end: '2026-02-25',
    metrics: { impressions: 50000, clicks: 2500, conversions: 125, cost: 5000, ctr: 0.05, cpc: 2.0 },
    fetched_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeConnectionRow(overrides = {}) {
  return {
    id: CONNECTION_ID,
    platform_type: 'google_ads',
    account_id: 'gads-account-123',
    access_token: 'encrypted:token',
    refresh_token: 'encrypted:refresh',
    token_expires_at: '2026-03-25T00:00:00Z',
    is_active: true,
    connected_by: USER_ID,
    config: { customer_id: '123-456-7890' },
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

const CREATE_CAMPAIGN_DATA = {
  name: 'Google Search - Spring Launch',
  budget_micros: 15000000,
  status: 'ENABLED',
  bidding_strategy: 'manual_cpc',
  start_date: '2026-03-01',
  end_date: '2026-05-31',
  targeting: { locations: ['US', 'CA'], languages: ['en'] },
};

const UPDATE_CAMPAIGN_DATA = {
  name: 'Google Search - Spring Launch v2',
  budget_micros: 20000000,
  status: 'ENABLED',
};

const BIDDING_CONFIG_MANUAL = {
  strategy: 'manual_cpc',
  max_cpc_bid_micros: 2500000,
};

const BIDDING_CONFIG_TARGET_CPA = {
  strategy: 'target_cpa',
  target_cpa_micros: 10000000,
};

const BIDDING_CONFIG_TARGET_ROAS = {
  strategy: 'target_roas',
  target_roas: 4.0,
};

const BIDDING_CONFIG_MAX_CONV = {
  strategy: 'maximize_conversions',
};

const DATE_RANGE = {
  start_date: '2026-02-01',
  end_date: '2026-02-25',
};

const LIST_FILTERS = {
  status: 'ENABLED',
  page: 1,
  limit: 20,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoogleAdsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  describe('createCampaign', () => {
    it('should create a new campaign and return the created record', async () => {
      // Lookup Google Ads connection
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      // INSERT campaign
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ id: 'gads-uuid-1', sync_data: { ...CREATE_CAMPAIGN_DATA } })],
      });

      const result = await GoogleAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.sync_data.name).toBe(CREATE_CAMPAIGN_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should assign platform_type as google_ads', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ id: 'gads-uuid-1', platform_type: 'google_ads' })],
      });

      const result = await GoogleAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.platform_type).toBe('google_ads');
    });

    it('should throw an error when required fields are missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });

      const invalidData = { name: '' };

      await expect(
        GoogleAdsService.createCampaign(USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should throw an error when no Google Ads account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ id: 'gads-uuid-1' })],
      });

      await GoogleAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ id: 'gads-uuid-1' })],
      });

      await GoogleAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateCampaign
  // -------------------------------------------------------------------------

  describe('updateCampaign', () => {
    it('should update an existing campaign with provided fields', async () => {
      // Fetch existing campaign
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      // UPDATE query
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...UPDATE_CAMPAIGN_DATA } })],
      });

      const result = await GoogleAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.sync_data.name).toBe(UPDATE_CAMPAIGN_DATA.name);
      expect(result.sync_data.budget_micros).toBe(UPDATE_CAMPAIGN_DATA.budget_micros);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.updateCampaign(USER_ID, 'nonexistent-id', UPDATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should invalidate cache after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...UPDATE_CAMPAIGN_DATA } })],
      });

      await GoogleAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...UPDATE_CAMPAIGN_DATA } })],
      });

      await GoogleAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // pauseCampaign
  // -------------------------------------------------------------------------

  describe('pauseCampaign', () => {
    it('should set campaign status to PAUSED', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'ENABLED', budget_micros: 10000000 } })],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'PAUSED', budget_micros: 10000000 } })],
      });

      const result = await GoogleAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(result.sync_data.status).toBe('PAUSED');
    });

    it('should throw an error when campaign is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.pauseCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should log an audit entry when pausing a campaign', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'ENABLED', budget_micros: 10000000 } })],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'PAUSED', budget_micros: 10000000 } })],
      });

      await GoogleAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should invalidate cache after pausing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'ENABLED', budget_micros: 10000000 } })],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { name: 'Test Campaign', status: 'PAUSED', budget_micros: 10000000 } })],
      });

      await GoogleAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaign
  // -------------------------------------------------------------------------

  describe('getCampaign', () => {
    it('should return campaign details from the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });

      const result = await GoogleAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(makeCampaignRow());
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cached campaign on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(makeCampaignRow());

      const result = await GoogleAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(makeCampaignRow());
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should populate cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });

      await GoogleAdsService.getCampaign(CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should throw an error when campaign is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.getCampaign('nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // listCampaigns
  // -------------------------------------------------------------------------

  describe('listCampaigns', () => {
    it('should return paginated list of campaigns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow(), makeCampaignRow({ id: 'gads-uuid-2' }), makeCampaignRow({ id: 'gads-uuid-3' })],
      });

      const result = await GoogleAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
    });

    it('should filter campaigns by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });

      await GoogleAdsService.listCampaigns(USER_ID, { status: 'ENABLED', page: 1, limit: 20 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('status');
    });

    it('should return empty array when no campaigns exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GoogleAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should scope results to google_ads platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });

      await GoogleAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      const selectSql = mockQuery.mock.calls[1][0] as string;
      expect(selectSql.toLowerCase()).toContain('google_ads');
    });

    it('should return cached list on cache hit', async () => {
      const cachedResult = {
        data: [makeCampaignRow()],
        total: 1,
        page: 1,
      };
      mockCacheGet.mockResolvedValueOnce(cachedResult);

      const result = await GoogleAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result).toEqual(cachedResult);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // deleteCampaign
  // -------------------------------------------------------------------------

  describe('deleteCampaign', () => {
    it('should delete a campaign by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await GoogleAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.deleteCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should invalidate cache after deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await GoogleAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await GoogleAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getReport
  // -------------------------------------------------------------------------

  describe('getReport', () => {
    it('should return performance report with metrics for the date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeReportRow()] });

      const result = await GoogleAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result).toBeDefined();
      expect(result[0].metrics.impressions).toBe(50000);
      expect(result[0].metrics.clicks).toBe(2500);
      expect(result[0].metrics.conversions).toBe(125);
      expect(result[0].metrics.cost).toBe(5000);
      expect(result[0].metrics.ctr).toBe(0.05);
      expect(result[0].metrics.cpc).toBe(2.0);
    });

    it('should return empty results when no data exists for the date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GoogleAdsService.getReport(CAMPAIGN_ID, {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      });

      expect(result).toHaveLength(0);
    });

    it('should query with the correct campaign id and date parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeReportRow()] });

      await GoogleAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(CAMPAIGN_ID);
      expect(params).toContain(DATE_RANGE.start_date);
      expect(params).toContain(DATE_RANGE.end_date);
    });

    it('should scope report query to google_ads platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeReportRow()] });

      await GoogleAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('google_ads');
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------

  describe('syncCampaigns', () => {
    it('should sync campaigns from Google Ads and return sync results', async () => {
      // Fetch Google Ads connection
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      // Upsert synced campaigns
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()], rowCount: 1 });

      const result = await GoogleAdsService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return synced, failed, and skipped counts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow(), makeCampaignRow({ id: 'gads-uuid-2' })],
        rowCount: 2,
      });

      const result = await GoogleAdsService.syncCampaigns(USER_ID);

      expect(result).toHaveProperty('synced');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('skipped');
    });

    it('should throw an error when no Google Ads account is found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.syncCampaigns(USER_ID),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()], rowCount: 1 });

      await GoogleAdsService.syncCampaigns(USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should log an audit entry after successful sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()], rowCount: 1 });

      await GoogleAdsService.syncCampaigns(USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateBidding
  // -------------------------------------------------------------------------

  describe('updateBidding', () => {
    it('should update bidding strategy for a campaign with manual_cpc', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'manual_cpc' } })],
      });

      const result = await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_MANUAL);

      expect(result).toBeDefined();
    });

    it('should update bidding strategy with target_cpa', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'target_cpa' } })],
      });

      const result = await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_TARGET_CPA);

      expect(result).toBeDefined();
    });

    it('should update bidding strategy with target_roas', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'target_roas' } })],
      });

      const result = await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_TARGET_ROAS);

      expect(result).toBeDefined();
    });

    it('should update bidding strategy with maximize_conversions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'maximize_conversions' } })],
      });

      const result = await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_MAX_CONV);

      expect(result).toBeDefined();
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        GoogleAdsService.updateBidding(USER_ID, 'nonexistent-id', BIDDING_CONFIG_MANUAL),
      ).rejects.toThrow();
    });

    it('should throw an error for an invalid bidding strategy type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });

      const invalidConfig = { strategy: 'invalid_strategy' };

      await expect(
        GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, invalidConfig as any),
      ).rejects.toThrow();
    });

    it('should invalidate cache after bidding update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'target_cpa' } })],
      });

      await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_TARGET_CPA);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry after bidding update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCampaignRow()] });
      mockQuery.mockResolvedValueOnce({
        rows: [makeCampaignRow({ sync_data: { ...makeCampaignRow().sync_data, bidding_strategy: 'target_cpa' } })],
      });

      await GoogleAdsService.updateBidding(USER_ID, CAMPAIGN_ID, BIDDING_CONFIG_TARGET_CPA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------

  describe('getConnectionStatus', () => {
    it('should return connected status when account exists and is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });

      const result = await GoogleAdsService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(true);
      expect(result.account_id).toBe('gads-account-123');
    });

    it('should return disconnected status when no account exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await GoogleAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected status when account is inactive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeConnectionRow({ is_active: false })],
      });

      const result = await GoogleAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should query for google_ads platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });

      await GoogleAdsService.getConnectionStatus(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('google_ads');
    });

    it('should return customer_id in config when connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeConnectionRow()] });

      const result = await GoogleAdsService.getConnectionStatus(USER_ID);

      expect(result.config).toBeDefined();
      expect(result.config.customer_id).toBe('123-456-7890');
    });
  });
});

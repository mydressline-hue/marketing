/**
 * Unit tests for SnapchatAdsService.
 *
 * All external dependencies (database, cache, logger, audit) are fully mocked
 * so tests exercise only the service logic: campaign CRUD, reporting,
 * sync, and connection status.
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
  generateId: jest.fn().mockReturnValue('test-uuid-1'),
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

import { SnapchatAdsService } from '../../../../../../src/services/integrations/ads/SnapchatAdsService';
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
const CAMPAIGN_ID = 'snap-campaign-uuid-1';

const SNAP_ACCOUNT_ROW = {
  id: 'integration-uuid-1',
  user_id: USER_ID,
  platform_type: 'snapchat_ads',
  organization_id: 'snap-org-123',
  ad_account_id: 'snap-ad-account-456',
  access_token: 'snap-access-token',
  refresh_token: 'snap-refresh-token',
  status: 'active',
  created_at: '2025-04-01T00:00:00Z',
  updated_at: '2025-04-01T00:00:00Z',
};

const CAMPAIGN_ROW = {
  id: CAMPAIGN_ID,
  user_id: USER_ID,
  platform_type: 'snapchat_ads',
  organization_id: 'snap-org-123',
  external_campaign_id: 'snap-ext-campaign-001',
  name: 'Snap Summer Blitz',
  status: 'active',
  budget: 12000,
  daily_budget: 400,
  objective: 'awareness',
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  targeting: { age_groups: ['18-24', '25-34'], geos: ['US'], interests: ['fashion', 'tech'] },
  created_at: '2025-05-10T00:00:00Z',
  updated_at: '2025-05-15T00:00:00Z',
};

const REPORT_ROW = {
  campaign_id: CAMPAIGN_ID,
  date: '2025-07-15',
  impressions: 120000,
  clicks: 4800,
  conversions: 210,
  cost: 3600.00,
  ctr: 4.0,
  cpc: 0.75,
  cpa: 17.14,
  swipe_ups: 3200,
};

const CREATE_CAMPAIGN_DATA = {
  name: 'Snap Back-to-School',
  budget: 15000,
  daily_budget: 500,
  objective: 'conversions',
  start_date: '2026-08-01',
  end_date: '2026-09-30',
  targeting: { age_groups: ['13-17', '18-24'], geos: ['US', 'CA'], interests: ['education'] },
};

const UPDATE_CAMPAIGN_DATA = {
  name: 'Snap Back-to-School - Extended',
  budget: 20000,
  daily_budget: 650,
};

const DATE_RANGE = {
  start_date: '2025-07-01',
  end_date: '2025-07-31',
};

const LIST_FILTERS = {
  status: 'active',
  page: 1,
  limit: 20,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SnapchatAdsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  describe('createCampaign', () => {
    it('should create a new campaign and return the created record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', name: CREATE_CAMPAIGN_DATA.name }],
      });

      const result = await SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(CREATE_CAMPAIGN_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should assign platform_type as snapchat_ads', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', platform_type: 'snapchat_ads' }],
      });

      const result = await SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.platform_type).toBe('snapchat_ads');
    });

    it('should throw an error when no Snapchat account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should propagate database errors during campaign creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockRejectedValueOnce(new Error('INSERT failed: unique constraint'));

      await expect(
        SnapchatAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateCampaign
  // -------------------------------------------------------------------------

  describe('updateCampaign', () => {
    it('should update an existing campaign with provided fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      const result = await SnapchatAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(UPDATE_CAMPAIGN_DATA.name);
      expect(result.budget).toBe(UPDATE_CAMPAIGN_DATA.budget);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.updateCampaign(USER_ID, 'nonexistent-id', UPDATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should invalidate cache after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await SnapchatAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry after campaign update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await SnapchatAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // pauseCampaign
  // -------------------------------------------------------------------------

  describe('pauseCampaign', () => {
    it('should set campaign status to paused', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'active' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, status: 'paused' }],
      });

      const result = await SnapchatAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(result.status).toBe('paused');
    });

    it('should throw an error when campaign is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.pauseCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should throw an error when campaign is already paused', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'paused' }] });

      await expect(
        SnapchatAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID),
      ).rejects.toThrow();
    });

    it('should invalidate cache after pausing a campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'active' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, status: 'paused' }],
      });

      await SnapchatAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaign
  // -------------------------------------------------------------------------

  describe('getCampaign', () => {
    it('should return campaign details from the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await SnapchatAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cached campaign on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(CAMPAIGN_ROW);

      const result = await SnapchatAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should populate cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await SnapchatAdsService.getCampaign(CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should throw an error when campaign is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.getCampaign('nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // listCampaigns
  // -------------------------------------------------------------------------

  describe('listCampaigns', () => {
    it('should return paginated list of campaigns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [CAMPAIGN_ROW, CAMPAIGN_ROW, CAMPAIGN_ROW, CAMPAIGN_ROW],
      });

      const result = await SnapchatAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(4);
      expect(result.total).toBe(4);
      expect(result.page).toBe(1);
    });

    it('should filter campaigns by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW, CAMPAIGN_ROW] });

      await SnapchatAdsService.listCampaigns(USER_ID, { status: 'active', page: 1, limit: 20 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('status');
    });

    it('should return empty array when no campaigns exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SnapchatAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should scope results to snapchat_ads platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await SnapchatAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      const selectSql = mockQuery.mock.calls[1][0] as string;
      expect(selectSql.toLowerCase()).toContain('snapchat_ads');
    });

    it('should respect pagination limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await SnapchatAdsService.listCampaigns(USER_ID, { status: 'active', page: 3, limit: 10 });

      const selectSql = mockQuery.mock.calls[1][0] as string;
      expect(selectSql.toLowerCase()).toContain('limit');
    });
  });

  // -------------------------------------------------------------------------
  // deleteCampaign
  // -------------------------------------------------------------------------

  describe('deleteCampaign', () => {
    it('should delete a campaign by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await SnapchatAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.deleteCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should invalidate cache after deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await SnapchatAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await SnapchatAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should propagate database errors during deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockRejectedValueOnce(new Error('FK constraint violation'));

      await expect(
        SnapchatAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getReport
  // -------------------------------------------------------------------------

  describe('getReport', () => {
    it('should return performance report with metrics for the date range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [REPORT_ROW],
      });

      const result = await SnapchatAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result).toBeDefined();
      expect(result[0].impressions).toBe(120000);
      expect(result[0].clicks).toBe(4800);
      expect(result[0].conversions).toBe(210);
      expect(result[0].cost).toBe(3600.00);
    });

    it('should return empty results when no data exists for the date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SnapchatAdsService.getReport(CAMPAIGN_ID, {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      });

      expect(result).toHaveLength(0);
    });

    it('should query with the correct campaign id and date parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REPORT_ROW] });

      await SnapchatAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(CAMPAIGN_ID);
      expect(params).toContain(DATE_RANGE.start_date);
      expect(params).toContain(DATE_RANGE.end_date);
    });

    it('should return multiple rows for multi-day reports', async () => {
      const secondRow = { ...REPORT_ROW, date: '2025-07-16', impressions: 115000 };
      mockQuery.mockResolvedValueOnce({ rows: [REPORT_ROW, secondRow] });

      const result = await SnapchatAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result).toHaveLength(2);
      expect(result[1].date).toBe('2025-07-16');
    });

    it('should include swipe_ups metric specific to Snapchat', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REPORT_ROW] });

      const result = await SnapchatAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result[0].swipe_ups).toBe(3200);
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------

  describe('syncCampaigns', () => {
    it('should sync campaigns from Snapchat and upsert records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      const result = await SnapchatAdsService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should throw an error when no Snapchat account is found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        SnapchatAdsService.syncCampaigns(USER_ID),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      await SnapchatAdsService.syncCampaigns(USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should handle sync when Snapchat returns zero campaigns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await SnapchatAdsService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------

  describe('getConnectionStatus', () => {
    it('should return connected status when account exists and is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });

      const result = await SnapchatAdsService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(true);
      expect(result.organization_id).toBe('snap-org-123');
    });

    it('should return disconnected status when no account exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SnapchatAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected status when account is inactive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...SNAP_ACCOUNT_ROW, status: 'inactive' }],
      });

      const result = await SnapchatAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should query for snapchat_ads platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [SNAP_ACCOUNT_ROW] });

      await SnapchatAdsService.getConnectionStatus(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('snapchat_ads');
    });

    it('should handle database errors during connection check gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        SnapchatAdsService.getConnectionStatus(USER_ID),
      ).rejects.toThrow();
    });
  });
});

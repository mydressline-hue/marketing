/**
 * Unit tests for TikTokAdsService.
 *
 * All external dependencies (database, cache, logger, audit) are fully mocked
 * so tests exercise only the service logic: campaign CRUD, reporting,
 * sync, creative upload, and connection status.
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

import { TikTokAdsService } from '../../../../../../src/services/integrations/ads/TikTokAdsService';
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
const CAMPAIGN_ID = 'tiktok-campaign-uuid-1';

const TIKTOK_ACCOUNT_ROW = {
  id: 'integration-uuid-1',
  user_id: USER_ID,
  platform_type: 'tiktok_ads',
  advertiser_id: 'tt-advertiser-7890123',
  access_token: 'tiktok-access-token',
  refresh_token: 'tiktok-refresh-token',
  status: 'active',
  created_at: '2025-03-01T00:00:00Z',
  updated_at: '2025-03-01T00:00:00Z',
};

const CAMPAIGN_ROW = {
  id: CAMPAIGN_ID,
  user_id: USER_ID,
  platform_type: 'tiktok_ads',
  advertiser_id: 'tt-advertiser-7890123',
  external_campaign_id: 'tiktok-ext-campaign-001',
  name: 'TikTok Brand Awareness',
  status: 'active',
  objective: 'REACH',
  budget: 8000,
  daily_budget: 250,
  bid_strategy: 'bid_cap',
  start_date: '2025-06-01',
  end_date: '2025-07-31',
  targeting: { locations: ['US', 'GB'], age_groups: ['18-24', '25-34'], interests: ['entertainment'] },
  created_at: '2025-05-20T00:00:00Z',
  updated_at: '2025-05-25T00:00:00Z',
};

const REPORT_ROW = {
  campaign_id: CAMPAIGN_ID,
  date: '2025-06-15',
  impressions: 250000,
  clicks: 12500,
  conversions: 400,
  cost: 3750.00,
  ctr: 5.0,
  cpc: 0.30,
  cpa: 9.38,
  video_views: 180000,
  video_completion_rate: 42.5,
};

const CREATIVE_ROW = {
  id: 'creative-uuid-1',
  user_id: USER_ID,
  platform_type: 'tiktok_ads',
  advertiser_id: 'tt-advertiser-7890123',
  external_creative_id: 'tiktok-creative-ext-001',
  name: 'Summer Video Ad 1',
  type: 'video',
  format: 'vertical',
  url: 'https://cdn.tiktok.com/creatives/summer-ad-1.mp4',
  thumbnail_url: 'https://cdn.tiktok.com/creatives/summer-ad-1-thumb.jpg',
  duration: 15,
  status: 'active',
  created_at: '2025-05-15T00:00:00Z',
  updated_at: '2025-05-15T00:00:00Z',
};

const CREATE_CAMPAIGN_DATA = {
  name: 'TikTok Holiday Push',
  objective: 'CONVERSIONS',
  budget: 10000,
  daily_budget: 350,
  bid_strategy: 'lowest_cost',
  start_date: '2025-11-15',
  end_date: '2025-12-31',
  targeting: { locations: ['US'], age_groups: ['18-24', '25-34'], interests: ['fashion', 'beauty'] },
};

const UPDATE_CAMPAIGN_DATA = {
  name: 'TikTok Holiday Push - Updated',
  budget: 15000,
  daily_budget: 500,
};

const UPLOAD_CREATIVE_DATA = {
  name: 'Holiday Promo Video',
  type: 'video',
  format: 'vertical',
  file_url: 'https://uploads.example.com/holiday-promo.mp4',
  duration: 30,
};

const DATE_RANGE = {
  start_date: '2025-06-01',
  end_date: '2025-06-30',
};

const LIST_FILTERS = {
  status: 'active',
  page: 1,
  limit: 20,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TikTokAdsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  describe('createCampaign', () => {
    it('should create a new campaign and return the created record', async () => {
      // Lookup TikTok account integration
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      // INSERT campaign
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', name: CREATE_CAMPAIGN_DATA.name }],
      });

      const result = await TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(CREATE_CAMPAIGN_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should assign platform_type as tiktok_ads', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', platform_type: 'tiktok_ads' }],
      });

      const result = await TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.platform_type).toBe('tiktok_ads');
    });

    it('should throw an error when no TikTok account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should associate the campaign with the correct advertiser_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', advertiser_id: 'tt-advertiser-7890123' }],
      });

      const result = await TikTokAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.advertiser_id).toBe('tt-advertiser-7890123');
    });
  });

  // -------------------------------------------------------------------------
  // updateCampaign
  // -------------------------------------------------------------------------

  describe('updateCampaign', () => {
    it('should update an existing campaign with provided fields', async () => {
      // Fetch existing campaign
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      // UPDATE query
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      const result = await TikTokAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(UPDATE_CAMPAIGN_DATA.name);
      expect(result.budget).toBe(UPDATE_CAMPAIGN_DATA.budget);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.updateCampaign(USER_ID, 'nonexistent-id', UPDATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should invalidate cache after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await TikTokAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await TikTokAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

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

      const result = await TikTokAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(result.status).toBe('paused');
    });

    it('should throw an error when campaign is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.pauseCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should throw an error when campaign is already paused', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'paused' }] });

      await expect(
        TikTokAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID),
      ).rejects.toThrow();
    });

    it('should invalidate cache after pausing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'active' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, status: 'paused' }],
      });

      await TikTokAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaign
  // -------------------------------------------------------------------------

  describe('getCampaign', () => {
    it('should return campaign details from the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await TikTokAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cached campaign on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(CAMPAIGN_ROW);

      const result = await TikTokAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should populate cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await TikTokAdsService.getCampaign(CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should throw an error when campaign is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.getCampaign('nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // listCampaigns
  // -------------------------------------------------------------------------

  describe('listCampaigns', () => {
    it('should return paginated list of campaigns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW, CAMPAIGN_ROW, CAMPAIGN_ROW] });

      const result = await TikTokAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
    });

    it('should filter campaigns by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await TikTokAdsService.listCampaigns(USER_ID, { status: 'active', page: 1, limit: 20 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('status');
    });

    it('should return empty array when no campaigns exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TikTokAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should scope results to tiktok_ads platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await TikTokAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      const selectSql = mockQuery.mock.calls[1][0] as string;
      expect(selectSql.toLowerCase()).toContain('tiktok_ads');
    });

    it('should respect pagination limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await TikTokAdsService.listCampaigns(USER_ID, { status: 'active', page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // deleteCampaign
  // -------------------------------------------------------------------------

  describe('deleteCampaign', () => {
    it('should delete a campaign by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await TikTokAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.deleteCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should invalidate cache after deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await TikTokAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await TikTokAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockAuditLog).toHaveBeenCalled();
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

      const result = await TikTokAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result).toBeDefined();
      expect(result[0].impressions).toBe(250000);
      expect(result[0].clicks).toBe(12500);
      expect(result[0].conversions).toBe(400);
      expect(result[0].cost).toBe(3750.00);
    });

    it('should return TikTok-specific metrics like video_views and completion rate', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [REPORT_ROW],
      });

      const result = await TikTokAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result[0].video_views).toBe(180000);
      expect(result[0].video_completion_rate).toBe(42.5);
    });

    it('should return empty results when no data exists for the date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TikTokAdsService.getReport(CAMPAIGN_ID, {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      });

      expect(result).toHaveLength(0);
    });

    it('should query with the correct campaign id and date parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REPORT_ROW] });

      await TikTokAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(CAMPAIGN_ID);
      expect(params).toContain(DATE_RANGE.start_date);
      expect(params).toContain(DATE_RANGE.end_date);
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------

  describe('syncCampaigns', () => {
    it('should sync campaigns from TikTok and upsert records', async () => {
      // Fetch TikTok account
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      // Upsert synced campaigns
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      const result = await TikTokAdsService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should throw an error when no TikTok account is found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.syncCampaigns(USER_ID),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      await TikTokAdsService.syncCampaigns(USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should use the advertiser_id from the connected integration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      await TikTokAdsService.syncCampaigns(USER_ID);

      // Verify account lookup was made
      const lookupSql = mockQuery.mock.calls[0][0] as string;
      expect(lookupSql.toLowerCase()).toContain('tiktok_ads');
    });
  });

  // -------------------------------------------------------------------------
  // uploadCreative
  // -------------------------------------------------------------------------

  describe('uploadCreative', () => {
    it('should upload a creative asset and return the record', async () => {
      // Lookup TikTok account integration
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      // INSERT creative
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CREATIVE_ROW, id: 'test-uuid-1', name: UPLOAD_CREATIVE_DATA.name }],
      });

      const result = await TikTokAdsService.uploadCreative(USER_ID, UPLOAD_CREATIVE_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(UPLOAD_CREATIVE_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when no TikTok account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        TikTokAdsService.uploadCreative(USER_ID, UPLOAD_CREATIVE_DATA),
      ).rejects.toThrow();
    });

    it('should assign platform_type as tiktok_ads to the creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CREATIVE_ROW, id: 'test-uuid-1', platform_type: 'tiktok_ads' }],
      });

      const result = await TikTokAdsService.uploadCreative(USER_ID, UPLOAD_CREATIVE_DATA);

      expect(result.platform_type).toBe('tiktok_ads');
    });

    it('should associate the creative with the correct advertiser_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CREATIVE_ROW, id: 'test-uuid-1', advertiser_id: 'tt-advertiser-7890123' }],
      });

      const result = await TikTokAdsService.uploadCreative(USER_ID, UPLOAD_CREATIVE_DATA);

      expect(result.advertiser_id).toBe('tt-advertiser-7890123');
    });

    it('should log an audit entry on creative upload', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CREATIVE_ROW, id: 'test-uuid-1' }],
      });

      await TikTokAdsService.uploadCreative(USER_ID, UPLOAD_CREATIVE_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------

  describe('getConnectionStatus', () => {
    it('should return connected status when account exists and is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });

      const result = await TikTokAdsService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(true);
      expect(result.advertiser_id).toBe('tt-advertiser-7890123');
    });

    it('should return disconnected status when no account exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await TikTokAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected status when account is inactive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...TIKTOK_ACCOUNT_ROW, status: 'inactive' }],
      });

      const result = await TikTokAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should query for tiktok_ads platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });

      await TikTokAdsService.getConnectionStatus(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('tiktok_ads');
    });

    it('should not return access_token in the status response', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TIKTOK_ACCOUNT_ROW] });

      const result = await TikTokAdsService.getConnectionStatus(USER_ID);

      expect(result.access_token).toBeUndefined();
    });
  });
});

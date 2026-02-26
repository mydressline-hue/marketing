/**
 * Unit tests for MetaAdsService.
 *
 * All external dependencies (database, cache, logger, audit) are fully mocked
 * so tests exercise only the service logic: campaign CRUD, reporting,
 * sync, audience management, and connection status.
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

import { MetaAdsService } from '../../../../../../src/services/integrations/ads/MetaAdsService';
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
const CAMPAIGN_ID = 'meta-campaign-uuid-1';

const META_ACCOUNT_ROW = {
  id: 'integration-uuid-1',
  user_id: USER_ID,
  platform_type: 'meta_ads',
  ad_account_id: 'act_123456789',
  pixel_id: 'pixel-987654321',
  access_token: 'meta-access-token',
  refresh_token: 'meta-refresh-token',
  status: 'active',
  created_at: '2025-03-01T00:00:00Z',
  updated_at: '2025-03-01T00:00:00Z',
};

const CAMPAIGN_ROW = {
  id: CAMPAIGN_ID,
  user_id: USER_ID,
  platform_type: 'meta_ads',
  ad_account_id: 'act_123456789',
  pixel_id: 'pixel-987654321',
  external_campaign_id: 'meta-ext-campaign-001',
  name: 'Meta Summer Promo',
  status: 'active',
  objective: 'CONVERSIONS',
  budget: 12000,
  daily_budget: 400,
  bid_strategy: 'lowest_cost',
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  targeting: { locations: ['US', 'UK'], age_min: 18, age_max: 65, interests: ['technology'] },
  created_at: '2025-05-15T00:00:00Z',
  updated_at: '2025-05-20T00:00:00Z',
};

const REPORT_ROW = {
  campaign_id: CAMPAIGN_ID,
  date: '2025-07-15',
  impressions: 120000,
  clicks: 6000,
  conversions: 300,
  cost: 4500.00,
  ctr: 5.0,
  cpc: 0.75,
  cpa: 15.00,
  reach: 95000,
  frequency: 1.26,
};

const AUDIENCE_ROW = {
  id: 'audience-uuid-1',
  user_id: USER_ID,
  platform_type: 'meta_ads',
  ad_account_id: 'act_123456789',
  external_audience_id: 'meta-audience-ext-001',
  name: 'Website Visitors 30d',
  type: 'custom',
  subtype: 'website',
  size: 45000,
  status: 'ready',
  created_at: '2025-04-01T00:00:00Z',
  updated_at: '2025-04-10T00:00:00Z',
};

const CREATE_CAMPAIGN_DATA = {
  name: 'Meta Holiday Launch',
  objective: 'CONVERSIONS',
  budget: 15000,
  daily_budget: 500,
  bid_strategy: 'lowest_cost',
  start_date: '2025-11-01',
  end_date: '2025-12-31',
  targeting: { locations: ['US'], age_min: 25, age_max: 55, interests: ['shopping'] },
};

const UPDATE_CAMPAIGN_DATA = {
  name: 'Meta Holiday Launch - Updated',
  budget: 20000,
  daily_budget: 650,
};

const CREATE_AUDIENCE_DATA = {
  name: 'High-Value Purchasers',
  type: 'custom',
  subtype: 'customer_list',
  description: 'Customers who spent over $500',
  retention_days: 180,
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

describe('MetaAdsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  describe('createCampaign', () => {
    it('should create a new campaign and return the created record', async () => {
      // Lookup Meta account integration
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      // INSERT campaign
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', name: CREATE_CAMPAIGN_DATA.name }],
      });

      const result = await MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(CREATE_CAMPAIGN_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should assign platform_type as meta_ads', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', platform_type: 'meta_ads' }],
      });

      const result = await MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.platform_type).toBe('meta_ads');
    });

    it('should throw an error when no Meta account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1' }],
      });

      await MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should associate the campaign with the correct ad_account_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'test-uuid-1', ad_account_id: 'act_123456789' }],
      });

      const result = await MetaAdsService.createCampaign(USER_ID, CREATE_CAMPAIGN_DATA);

      expect(result.ad_account_id).toBe('act_123456789');
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

      const result = await MetaAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(UPDATE_CAMPAIGN_DATA.name);
      expect(result.budget).toBe(UPDATE_CAMPAIGN_DATA.budget);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.updateCampaign(USER_ID, 'nonexistent-id', UPDATE_CAMPAIGN_DATA),
      ).rejects.toThrow();
    });

    it('should invalidate cache after update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await MetaAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on campaign update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, ...UPDATE_CAMPAIGN_DATA }],
      });

      await MetaAdsService.updateCampaign(USER_ID, CAMPAIGN_ID, UPDATE_CAMPAIGN_DATA);

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

      const result = await MetaAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(result.status).toBe('paused');
    });

    it('should throw an error when campaign is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.pauseCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should throw an error when campaign is already paused', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'paused' }] });

      await expect(
        MetaAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID),
      ).rejects.toThrow();
    });

    it('should invalidate cache after pausing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'active' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, status: 'paused' }],
      });

      await MetaAdsService.pauseCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaign
  // -------------------------------------------------------------------------

  describe('getCampaign', () => {
    it('should return campaign details from the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await MetaAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cached campaign on cache hit', async () => {
      mockCacheGet.mockResolvedValueOnce(CAMPAIGN_ROW);

      const result = await MetaAdsService.getCampaign(CAMPAIGN_ID);

      expect(result).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should populate cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await MetaAdsService.getCampaign(CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalled();
    });

    it('should throw an error when campaign is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.getCampaign('nonexistent-id'),
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

      const result = await MetaAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
    });

    it('should filter campaigns by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await MetaAdsService.listCampaigns(USER_ID, { status: 'active', page: 1, limit: 20 });

      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql.toLowerCase()).toContain('status');
    });

    it('should return empty array when no campaigns exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MetaAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should scope results to meta_ads platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      await MetaAdsService.listCampaigns(USER_ID, LIST_FILTERS);

      const selectSql = mockQuery.mock.calls[1][0] as string;
      expect(selectSql.toLowerCase()).toContain('meta_ads');
    });

    it('should respect pagination limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await MetaAdsService.listCampaigns(USER_ID, { status: 'active', page: 3, limit: 10 });

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

      await MetaAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when campaign does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.deleteCampaign(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('should invalidate cache after deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await MetaAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should log an audit entry on deletion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await MetaAdsService.deleteCampaign(USER_ID, CAMPAIGN_ID);

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

      const result = await MetaAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result).toBeDefined();
      expect(result[0].impressions).toBe(120000);
      expect(result[0].clicks).toBe(6000);
      expect(result[0].conversions).toBe(300);
      expect(result[0].cost).toBe(4500.00);
    });

    it('should return Meta-specific metrics like reach and frequency', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [REPORT_ROW],
      });

      const result = await MetaAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

      expect(result[0].reach).toBe(95000);
      expect(result[0].frequency).toBe(1.26);
    });

    it('should return empty results when no data exists for the date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MetaAdsService.getReport(CAMPAIGN_ID, {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
      });

      expect(result).toHaveLength(0);
    });

    it('should query with the correct campaign id and date parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REPORT_ROW] });

      await MetaAdsService.getReport(CAMPAIGN_ID, DATE_RANGE);

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
    it('should sync campaigns from Meta and upsert records', async () => {
      // Fetch Meta account
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      // Upsert synced campaigns
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      const result = await MetaAdsService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should throw an error when no Meta account is found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.syncCampaigns(USER_ID),
      ).rejects.toThrow();
    });

    it('should flush campaign cache after sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      await MetaAdsService.syncCampaigns(USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should use the ad_account_id from the connected integration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW], rowCount: 1 });

      await MetaAdsService.syncCampaigns(USER_ID);

      // Verify account lookup was made
      const lookupSql = mockQuery.mock.calls[0][0] as string;
      expect(lookupSql.toLowerCase()).toContain('meta_ads');
    });
  });

  // -------------------------------------------------------------------------
  // createAudience
  // -------------------------------------------------------------------------

  describe('createAudience', () => {
    it('should create a custom audience and return the record', async () => {
      // Lookup Meta account integration
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      // INSERT audience
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AUDIENCE_ROW, id: 'test-uuid-1', name: CREATE_AUDIENCE_DATA.name }],
      });

      const result = await MetaAdsService.createAudience(USER_ID, CREATE_AUDIENCE_DATA);

      expect(result).toBeDefined();
      expect(result.name).toBe(CREATE_AUDIENCE_DATA.name);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw an error when no Meta account is connected', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MetaAdsService.createAudience(USER_ID, CREATE_AUDIENCE_DATA),
      ).rejects.toThrow();
    });

    it('should assign platform_type as meta_ads to the audience', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AUDIENCE_ROW, id: 'test-uuid-1', platform_type: 'meta_ads' }],
      });

      const result = await MetaAdsService.createAudience(USER_ID, CREATE_AUDIENCE_DATA);

      expect(result.platform_type).toBe('meta_ads');
    });

    it('should log an audit entry on audience creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...AUDIENCE_ROW, id: 'test-uuid-1' }],
      });

      await MetaAdsService.createAudience(USER_ID, CREATE_AUDIENCE_DATA);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listAudiences
  // -------------------------------------------------------------------------

  describe('listAudiences', () => {
    it('should return a list of audiences for the user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [AUDIENCE_ROW, AUDIENCE_ROW] });

      const result = await MetaAdsService.listAudiences(USER_ID);

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no audiences exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MetaAdsService.listAudiences(USER_ID);

      expect(result).toHaveLength(0);
    });

    it('should scope results to meta_ads platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [AUDIENCE_ROW] });

      await MetaAdsService.listAudiences(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('meta_ads');
    });

    it('should pass the correct user_id parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await MetaAdsService.listAudiences(USER_ID);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------

  describe('getConnectionStatus', () => {
    it('should return connected status when account exists and is active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });

      const result = await MetaAdsService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
      expect(result.connected).toBe(true);
      expect(result.ad_account_id).toBe('act_123456789');
    });

    it('should include pixel_id in the connection status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });

      const result = await MetaAdsService.getConnectionStatus(USER_ID);

      expect(result.pixel_id).toBe('pixel-987654321');
    });

    it('should return disconnected status when no account exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MetaAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should return disconnected status when account is inactive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...META_ACCOUNT_ROW, status: 'inactive' }],
      });

      const result = await MetaAdsService.getConnectionStatus(USER_ID);

      expect(result.connected).toBe(false);
    });

    it('should query for meta_ads platform type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [META_ACCOUNT_ROW] });

      await MetaAdsService.getConnectionStatus(USER_ID);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql.toLowerCase()).toContain('meta_ads');
    });
  });
});

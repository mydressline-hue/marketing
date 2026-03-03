/**
 * Unit tests for CampaignsService.
 *
 * Database pool and Redis cache utilities are fully mocked so tests
 * exercise only the service logic (filtering, status transitions,
 * metric computation, spend aggregation).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
  },
}));

jest.mock('../../../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (fn: Function) => {
    const { pool: mockPool } = require('../../../src/config/database');
    return fn({ query: mockPool.query });
  }),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../src/websocket/EventBus', () => ({
  eventBus: { broadcast: jest.fn(), emit: jest.fn(), on: jest.fn(), off: jest.fn() },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('campaign-uuid-new'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { CampaignsService } from '../../../src/services/campaigns.service';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheFlush } from '../../../src/config/redis';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAMPAIGN_ROW = {
  id: 'campaign-uuid-1',
  name: 'Summer Sale DE',
  country_id: 'country-uuid-1',
  country_name: 'Germany',
  platform: 'meta',
  type: 'conversion',
  status: 'draft',
  budget: 10000,
  spent: 2500,
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  impressions: 100000,
  clicks: 5000,
  conversions: 250,
  revenue: 12500,
  created_by: 'user-uuid-1',
  created_at: '2025-05-01T00:00:00Z',
  updated_at: '2025-05-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CampaignsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns paginated campaigns', async () => {
      // COUNT query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // SELECT query with JOIN
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const result = await CampaignsService.list(
        undefined,
        { page: 1, limit: 20 },
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toEqual(CAMPAIGN_ROW);

      // Should cache the result
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
    });

    it('returns cached result on cache hit', async () => {
      const cached = {
        data: [CAMPAIGN_ROW],
        total: 1,
        page: 1,
        totalPages: 1,
      };
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await CampaignsService.list();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns a campaign', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const campaign = await CampaignsService.getById('campaign-uuid-1');

      expect(campaign).toEqual(CAMPAIGN_ROW);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.id = $1'),
        ['campaign-uuid-1'],
      );
    });

    it('throws NotFoundError when id does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CampaignsService.getById('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    const createInput = {
      name: 'Summer Sale DE',
      countryId: 'country-uuid-1',
      platform: 'meta' as const,
      type: 'conversion',
      budget: 10000,
      startDate: '2025-06-01',
      endDate: '2025-08-31',
    };

    it('validates that country exists', async () => {
      // Country lookup → not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CampaignsService.create(createInput, 'user-uuid-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('inserts campaign with status draft', async () => {
      // Country lookup → exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'country-uuid-1' }] });
      // INSERT → return new campaign
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...CAMPAIGN_ROW, id: 'campaign-uuid-new' }],
      });

      const campaign = await CampaignsService.create(createInput, 'user-uuid-1');

      expect(campaign.id).toBe('campaign-uuid-new');

      // Verify INSERT SQL includes 'draft' status
      const insertSql = mockQuery.mock.calls[1][0] as string;
      expect(insertSql).toContain("'draft'");

      // Cache should have been flushed
      expect(mockCacheFlush).toHaveBeenCalledWith('campaigns:*');
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus
  // -----------------------------------------------------------------------

  describe('updateStatus', () => {
    it('allows valid transition: draft -> active', async () => {
      // getById → return campaign with status = 'draft'
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'draft' }] });
      // UPDATE status
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'active' }] });
      // INSERT audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignsService.updateStatus(
        'campaign-uuid-1',
        'active',
        'user-uuid-1',
      );

      expect(result.status).toBe('active');
      expect(mockCacheFlush).toHaveBeenCalledWith('campaigns:*');
    });

    it('rejects invalid transition: completed -> draft', async () => {
      // getById → return campaign with status = 'completed'
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'completed' }] });

      await expect(
        CampaignsService.updateStatus('campaign-uuid-1', 'draft', 'user-uuid-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid transition: archived -> active', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...CAMPAIGN_ROW, status: 'archived' }] });

      await expect(
        CampaignsService.updateStatus('campaign-uuid-1', 'active', 'user-uuid-1'),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -----------------------------------------------------------------------
  // getMetrics
  // -----------------------------------------------------------------------

  describe('getMetrics', () => {
    it('returns computed metrics (CTR, CPC, CPA, ROAS)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [CAMPAIGN_ROW] });

      const metrics = await CampaignsService.getMetrics('campaign-uuid-1');

      expect(metrics.impressions).toBe(100000);
      expect(metrics.clicks).toBe(5000);
      expect(metrics.conversions).toBe(250);
      expect(metrics.spend).toBe(2500);

      // CTR = (5000 / 100000) * 100 = 5.0
      expect(metrics.ctr).toBe(5);
      // CPC = 2500 / 5000 = 0.5
      expect(metrics.cpc).toBe(0.5);
      // CPA = 2500 / 250 = 10
      expect(metrics.cpa).toBe(10);
      // ROAS = 12500 / 2500 = 5.0
      expect(metrics.roas).toBe(5);
    });

    it('handles zero values without division errors', async () => {
      const zeroRow = {
        ...CAMPAIGN_ROW,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spent: 0,
        revenue: 0,
      };
      mockQuery.mockResolvedValueOnce({ rows: [zeroRow] });

      const metrics = await CampaignsService.getMetrics('campaign-uuid-1');

      expect(metrics.ctr).toBe(0);
      expect(metrics.cpc).toBe(0);
      expect(metrics.cpa).toBe(0);
      expect(metrics.roas).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getSpendSummary
  // -----------------------------------------------------------------------

  describe('getSpendSummary', () => {
    it('aggregates spend by platform and country', async () => {
      // Total spend query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_spend: '25000.50' }],
      });
      // By platform query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { platform: 'meta', total: '15000' },
          { platform: 'google', total: '10000.50' },
        ],
      });
      // By country query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { country_name: 'Germany', total: '20000' },
          { country_name: 'France', total: '5000.50' },
        ],
      });

      const summary = await CampaignsService.getSpendSummary();

      expect(summary.totalSpend).toBe(25000.5);
      expect(summary.byPlatform).toEqual({
        meta: 15000,
        google: 10000.5,
      });
      expect(summary.byCountry).toEqual({
        Germany: 20000,
        France: 5000.5,
      });
    });

    it('applies date range filters when provided', async () => {
      // Total spend
      mockQuery.mockResolvedValueOnce({ rows: [{ total_spend: '5000' }] });
      // By platform
      mockQuery.mockResolvedValueOnce({ rows: [{ platform: 'meta', total: '5000' }] });
      // By country
      mockQuery.mockResolvedValueOnce({ rows: [{ country_name: 'Germany', total: '5000' }] });

      await CampaignsService.getSpendSummary({
        startDate: '2025-06-01',
        endDate: '2025-08-31',
      });

      // Verify the total spend query includes date filters
      const firstCallSql = mockQuery.mock.calls[0][0] as string;
      expect(firstCallSql).toContain('start_date');
      expect(mockQuery.mock.calls[0][1]).toContain('2025-06-01');
    });
  });
});

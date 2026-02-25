/**
 * Unit tests for PowerBIService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic: data export,
 * dashboard CRUD, data feed configuration, dataset refresh, connection
 * status, and sync status.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../../../src/config/env', () => ({
  env: { NODE_ENV: 'test' },
}));

jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('analytics-uuid-1'),
}));

jest.mock('../../../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { PowerBIService } from '../../../../../../src/services/integrations/analytics/PowerBIService';
import { pool } from '../../../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../../../../src/config/redis';
import { AuditService } from '../../../../../../src/services/audit.service';
import { NotFoundError, ValidationError } from '../../../../../../src/utils/errors';
import { generateId } from '../../../../../../src/utils/helpers';
import { logger } from '../../../../../../src/utils/logger';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockLogger = logger as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const DASHBOARD_ID = 'analytics-uuid-1';
const DATASET_ID = 'dataset-uuid-1';
const WORKSPACE_ID = 'pbi-workspace-1';

function makeDashboardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DASHBOARD_ID,
    user_id: USER_ID,
    platform_type: 'powerbi',
    workspace_id: WORKSPACE_ID,
    name: 'Sales Analytics',
    description: 'Sales pipeline and revenue tracking dashboard',
    config: JSON.stringify({ report_id: 'rpt-001', dataset_id: 'ds-001' }),
    is_active: true,
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeExportRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DASHBOARD_ID,
    user_id: USER_ID,
    platform_type: 'powerbi',
    workspace_id: WORKSPACE_ID,
    export_type: 'dataset',
    record_count: 3200,
    status: 'completed',
    config: JSON.stringify({ dataset: 'campaign_metrics', format: 'pbix' }),
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeDataFeedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'feed-uuid-1',
    user_id: USER_ID,
    platform_type: 'powerbi',
    workspace_id: WORKSPACE_ID,
    feed_type: 'streaming',
    name: 'Real-time Campaign Feed',
    config: JSON.stringify({ endpoint: 'https://api.powerbi.com/v1/push', refresh_interval: 300 }),
    status: 'active',
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeConnectionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conn-uuid-1',
    user_id: USER_ID,
    platform_type: 'powerbi',
    workspace_id: WORKSPACE_ID,
    status: 'connected',
    last_sync_at: '2026-02-25T00:00:00Z',
    created_at: '2026-02-24T00:00:00Z',
    ...overrides,
  };
}

function makeSyncRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    platform_type: 'powerbi',
    total_syncs: 73,
    successful_syncs: 70,
    failed_syncs: 3,
    last_sync_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PowerBIService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockGenerateId.mockReturnValue('analytics-uuid-1');
  });

  // =========================================================================
  // exportData
  // =========================================================================

  describe('exportData', () => {
    const queryConfig = {
      dataset: 'campaign_metrics',
      format: 'pbix',
      filters: { workspace: WORKSPACE_ID },
    };

    it('exports data successfully and returns record count', async () => {
      const row = makeExportRow({ record_count: 3200 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.exportData(USER_ID, queryConfig);

      expect(result.record_count).toBe(3200);
      expect(result.status).toBe('completed');
      expect(result.platform_type).toBe('powerbi');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates an export record in the database', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.exportData(USER_ID, queryConfig);

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([DASHBOARD_ID, USER_ID]),
      );
    });

    it('logs audit entry on successful export', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.exportData(USER_ID, queryConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.export_data',
          resourceType: 'analytics_export',
          resourceId: DASHBOARD_ID,
        }),
      );
    });

    it('handles export with zero records', async () => {
      const row = makeExportRow({ record_count: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.exportData(USER_ID, queryConfig);

      expect(result.record_count).toBe(0);
      expect(result.status).toBe('completed');
    });

    it('passes export config fields to the database insert', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.exportData(USER_ID, queryConfig);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual(expect.arrayContaining([USER_ID]));
    });
  });

  // =========================================================================
  // createDashboard
  // =========================================================================

  describe('createDashboard', () => {
    const dashboardConfig = {
      name: 'Sales Analytics',
      description: 'Sales pipeline and revenue tracking dashboard',
      report_id: 'rpt-001',
      dataset_id: 'ds-001',
    };

    it('creates a new dashboard successfully', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.createDashboard(USER_ID, dashboardConfig);

      expect(result.id).toBe(DASHBOARD_ID);
      expect(result.name).toBe('Sales Analytics');
      expect(result.platform_type).toBe('powerbi');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
    });

    it('logs audit entry on dashboard creation', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.createDashboard(USER_ID, dashboardConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.create_dashboard',
          resourceType: 'analytics_dashboard',
          resourceId: DASHBOARD_ID,
        }),
      );
    });

    it('invalidates dashboard list cache on creation', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.createDashboard(USER_ID, dashboardConfig);

      expect(mockCacheFlush).toHaveBeenCalledWith('powerbi:dashboards:*');
    });

    it('assigns generated id to the new dashboard', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.createDashboard(USER_ID, dashboardConfig);

      expect(mockGenerateId).toHaveBeenCalled();
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([DASHBOARD_ID]),
      );
    });
  });

  // =========================================================================
  // updateDashboard
  // =========================================================================

  describe('updateDashboard', () => {
    const updateConfig = {
      name: 'Updated Power BI Dashboard',
      description: 'Updated description for Power BI',
    };

    it('updates an existing dashboard successfully', async () => {
      const row = makeDashboardRow({ name: 'Updated Power BI Dashboard', description: 'Updated description for Power BI' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(result.name).toBe('Updated Power BI Dashboard');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([DASHBOARD_ID]),
      );
    });

    it('throws NotFoundError when dashboard does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        PowerBIService.updateDashboard(USER_ID, 'nonexistent-id', updateConfig),
      ).rejects.toThrow(NotFoundError);
    });

    it('invalidates dashboard cache on update', async () => {
      const row = makeDashboardRow({ name: 'Updated Power BI Dashboard' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(mockCacheDel).toHaveBeenCalledWith(`powerbi:dashboard:${DASHBOARD_ID}`);
    });

    it('logs audit entry on dashboard update', async () => {
      const row = makeDashboardRow({ name: 'Updated Power BI Dashboard' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.update_dashboard',
          resourceType: 'analytics_dashboard',
          resourceId: DASHBOARD_ID,
        }),
      );
    });
  });

  // =========================================================================
  // listDashboards
  // =========================================================================

  describe('listDashboards', () => {
    it('returns paginated list of dashboards', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeDashboardRow({ id: 'dash-1', name: 'Dashboard A' }),
          makeDashboardRow({ id: 'dash-2', name: 'Dashboard B' }),
        ],
      });

      const result = await PowerBIService.listDashboards({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies platform_type filter for powerbi', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeDashboardRow()] });

      await PowerBIService.listDashboards({ platform_type: 'powerbi' });

      expect(mockQuery.mock.calls[0][0]).toContain('platform_type');
      expect(mockQuery.mock.calls[0][1]).toContain('powerbi');
    });

    it('returns empty data when no dashboards found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await PowerBIService.listDashboards({});

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('handles custom pagination parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: Array(10).fill(makeDashboardRow()) });

      const result = await PowerBIService.listDashboards({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(5);
      const dataSql = mockQuery.mock.calls[1][0] as string;
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });
  });

  // =========================================================================
  // getDashboard
  // =========================================================================

  describe('getDashboard', () => {
    it('returns dashboard from database when cache is empty', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeDashboardRow()] });

      const result = await PowerBIService.getDashboard(DASHBOARD_ID);

      expect(result.id).toBe(DASHBOARD_ID);
      expect(result.platform_type).toBe('powerbi');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns cached dashboard on cache hit', async () => {
      const cached = makeDashboardRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await PowerBIService.getDashboard(DASHBOARD_ID);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches dashboard result after DB fetch', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.getDashboard(DASHBOARD_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        `powerbi:dashboard:${DASHBOARD_ID}`,
        expect.objectContaining({ id: DASHBOARD_ID }),
        expect.any(Number),
      );
    });

    it('throws NotFoundError when dashboard does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        PowerBIService.getDashboard('nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // deleteDashboard
  // =========================================================================

  describe('deleteDashboard', () => {
    it('deletes a dashboard successfully', async () => {
      const row = makeDashboardRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(result.is_active).toBe(false);
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE');
    });

    it('throws NotFoundError when deleting non-existent dashboard', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        PowerBIService.deleteDashboard(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });

    it('invalidates cache on deletion', async () => {
      const row = makeDashboardRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(mockCacheDel).toHaveBeenCalledWith(`powerbi:dashboard:${DASHBOARD_ID}`);
      expect(mockCacheFlush).toHaveBeenCalledWith('powerbi:dashboards:*');
    });

    it('logs audit entry on dashboard deletion', async () => {
      const row = makeDashboardRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.delete_dashboard',
          resourceType: 'analytics_dashboard',
          resourceId: DASHBOARD_ID,
        }),
      );
    });
  });

  // =========================================================================
  // configureDataFeed
  // =========================================================================

  describe('configureDataFeed', () => {
    const feedConfig = {
      feed_type: 'streaming',
      name: 'Real-time Campaign Feed',
      endpoint: 'https://api.powerbi.com/v1/push',
      refresh_interval: 300,
    };

    it('configures a data feed successfully', async () => {
      const row = makeDataFeedRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.configureDataFeed(USER_ID, feedConfig);

      expect(result.feed_type).toBe('streaming');
      expect(result.platform_type).toBe('powerbi');
      expect(result.status).toBe('active');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates a feed record in the database', async () => {
      const row = makeDataFeedRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.configureDataFeed(USER_ID, feedConfig);

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([USER_ID]),
      );
    });

    it('validates feed config before creation', async () => {
      const invalidConfig = { ...feedConfig, feed_type: '' };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        PowerBIService.configureDataFeed(USER_ID, invalidConfig),
      ).rejects.toThrow();
    });

    it('logs audit entry on feed configuration', async () => {
      const row = makeDataFeedRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.configureDataFeed(USER_ID, feedConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.configure_data_feed',
          resourceType: 'analytics_feed',
        }),
      );
    });

    it('invalidates feed cache on configuration', async () => {
      const row = makeDataFeedRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.configureDataFeed(USER_ID, feedConfig);

      expect(mockCacheFlush).toHaveBeenCalledWith('powerbi:feeds:*');
    });
  });

  // =========================================================================
  // refreshDataset
  // =========================================================================

  describe('refreshDataset', () => {
    it('refreshes dataset successfully', async () => {
      const row = makeExportRow({ export_type: 'refresh', status: 'completed' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.refreshDataset(USER_ID, DATASET_ID);

      expect(result.status).toBe('completed');
      expect(result.export_type).toBe('refresh');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates an export record for the refresh operation', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.refreshDataset(USER_ID, DATASET_ID);

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([USER_ID]),
      );
    });

    it('logs audit entry on dataset refresh', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.refreshDataset(USER_ID, DATASET_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'powerbi.refresh_dataset',
          resourceType: 'analytics_export',
          details: expect.objectContaining({ datasetId: DATASET_ID }),
        }),
      );
    });

    it('invalidates related caches on refresh', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.refreshDataset(USER_ID, DATASET_ID);

      expect(mockCacheFlush).toHaveBeenCalledWith('powerbi:data:*');
    });
  });

  // =========================================================================
  // getConnectionStatus
  // =========================================================================

  describe('getConnectionStatus', () => {
    it('returns connection status for the user', async () => {
      const row = makeConnectionRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.getConnectionStatus(USER_ID);

      expect(result.status).toBe('connected');
      expect(result.platform_type).toBe('powerbi');
      expect(result.user_id).toBe(USER_ID);
    });

    it('returns disconnected status when no connection found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await PowerBIService.getConnectionStatus(USER_ID);

      expect(result.status).toBe('disconnected');
    });

    it('returns cached connection status on cache hit', async () => {
      const cached = makeConnectionRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await PowerBIService.getConnectionStatus(USER_ID);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getSyncStatus
  // =========================================================================

  describe('getSyncStatus', () => {
    it('returns sync status summary', async () => {
      const row = makeSyncRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await PowerBIService.getSyncStatus();

      expect(result.platform_type).toBe('powerbi');
      expect(result.total_syncs).toBe(73);
      expect(result.successful_syncs).toBe(70);
      expect(result.failed_syncs).toBe(3);
    });

    it('returns cached sync status on cache hit', async () => {
      const cached = makeSyncRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await PowerBIService.getSyncStatus();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches sync status after DB fetch', async () => {
      const row = makeSyncRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await PowerBIService.getSyncStatus();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'powerbi:sync_status',
        expect.objectContaining({ platform_type: 'powerbi' }),
        expect.any(Number),
      );
    });

    it('returns default values when no sync records exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await PowerBIService.getSyncStatus();

      expect(result.total_syncs).toBe(0);
      expect(result.successful_syncs).toBe(0);
      expect(result.failed_syncs).toBe(0);
    });
  });
});

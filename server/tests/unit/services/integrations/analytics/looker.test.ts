/**
 * Unit tests for LookerService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic: data export,
 * dashboard CRUD, data refresh, connection status, and sync status.
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

import { LookerService } from '../../../../../../src/services/integrations/analytics/LookerService';
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
const DATA_SOURCE_ID = 'datasource-uuid-1';

function makeDashboardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DASHBOARD_ID,
    user_id: USER_ID,
    platform_type: 'looker',
    name: 'Campaign Performance',
    description: 'Overview of campaign KPIs',
    config: JSON.stringify({ model: 'marketing', explore: 'campaigns' }),
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
    platform_type: 'looker',
    export_type: 'query',
    record_count: 1500,
    status: 'completed',
    config: JSON.stringify({ model: 'marketing', explore: 'campaigns', fields: ['campaign.name', 'campaign.spend'] }),
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeConnectionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conn-uuid-1',
    user_id: USER_ID,
    platform_type: 'looker',
    status: 'connected',
    last_sync_at: '2026-02-25T00:00:00Z',
    created_at: '2026-02-24T00:00:00Z',
    ...overrides,
  };
}

function makeSyncRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    platform_type: 'looker',
    total_syncs: 42,
    successful_syncs: 40,
    failed_syncs: 2,
    last_sync_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LookerService', () => {
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
      model: 'marketing',
      explore: 'campaigns',
      fields: ['campaign.name', 'campaign.spend'],
      filters: { 'campaign.status': 'active' },
    };

    it('exports data successfully and returns record count', async () => {
      const row = makeExportRow({ record_count: 1500 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.exportData(USER_ID, queryConfig);

      expect(result.record_count).toBe(1500);
      expect(result.status).toBe('completed');
      expect(result.platform_type).toBe('looker');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates an export record in the database', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.exportData(USER_ID, queryConfig);

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([DASHBOARD_ID, USER_ID]),
      );
    });

    it('logs audit entry on successful export', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.exportData(USER_ID, queryConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'looker.export_data',
          resourceType: 'analytics_export',
          resourceId: DASHBOARD_ID,
        }),
      );
    });

    it('handles export with zero records', async () => {
      const row = makeExportRow({ record_count: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.exportData(USER_ID, queryConfig);

      expect(result.record_count).toBe(0);
      expect(result.status).toBe('completed');
    });

    it('passes query config fields to the database insert', async () => {
      const row = makeExportRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.exportData(USER_ID, queryConfig);

      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual(expect.arrayContaining([USER_ID]));
    });
  });

  // =========================================================================
  // createDashboard
  // =========================================================================

  describe('createDashboard', () => {
    const dashboardConfig = {
      name: 'Campaign Performance',
      description: 'Overview of campaign KPIs',
      model: 'marketing',
      explore: 'campaigns',
    };

    it('creates a new dashboard successfully', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.createDashboard(USER_ID, dashboardConfig);

      expect(result.id).toBe(DASHBOARD_ID);
      expect(result.name).toBe('Campaign Performance');
      expect(result.platform_type).toBe('looker');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
    });

    it('logs audit entry on dashboard creation', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.createDashboard(USER_ID, dashboardConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'looker.create_dashboard',
          resourceType: 'analytics_dashboard',
          resourceId: DASHBOARD_ID,
        }),
      );
    });

    it('invalidates dashboard list cache on creation', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.createDashboard(USER_ID, dashboardConfig);

      expect(mockCacheFlush).toHaveBeenCalledWith('looker:dashboards:*');
    });

    it('assigns generated id to the new dashboard', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.createDashboard(USER_ID, dashboardConfig);

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
      name: 'Updated Dashboard',
      description: 'Updated description',
    };

    it('updates an existing dashboard successfully', async () => {
      const row = makeDashboardRow({ name: 'Updated Dashboard', description: 'Updated description' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(result.name).toBe('Updated Dashboard');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([DASHBOARD_ID]),
      );
    });

    it('throws NotFoundError when dashboard does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        LookerService.updateDashboard(USER_ID, 'nonexistent-id', updateConfig),
      ).rejects.toThrow(NotFoundError);
    });

    it('invalidates dashboard cache on update', async () => {
      const row = makeDashboardRow({ name: 'Updated Dashboard' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(mockCacheDel).toHaveBeenCalledWith(`looker:dashboard:${DASHBOARD_ID}`);
    });

    it('logs audit entry on dashboard update', async () => {
      const row = makeDashboardRow({ name: 'Updated Dashboard' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.updateDashboard(USER_ID, DASHBOARD_ID, updateConfig);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'looker.update_dashboard',
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

      const result = await LookerService.listDashboards({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies platform_type filter for looker', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [makeDashboardRow()] });

      await LookerService.listDashboards({ platform_type: 'looker' });

      expect(mockQuery.mock.calls[0][0]).toContain('platform_type');
      expect(mockQuery.mock.calls[0][1]).toContain('looker');
    });

    it('returns empty data when no dashboards found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await LookerService.listDashboards({});

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('handles custom pagination parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '25' }] });
      mockQuery.mockResolvedValueOnce({ rows: Array(5).fill(makeDashboardRow()) });

      const result = await LookerService.listDashboards({ page: 3, limit: 5 });

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

      const result = await LookerService.getDashboard(DASHBOARD_ID);

      expect(result.id).toBe(DASHBOARD_ID);
      expect(result.platform_type).toBe('looker');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns cached dashboard on cache hit', async () => {
      const cached = makeDashboardRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await LookerService.getDashboard(DASHBOARD_ID);

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches dashboard result after DB fetch', async () => {
      const row = makeDashboardRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.getDashboard(DASHBOARD_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        `looker:dashboard:${DASHBOARD_ID}`,
        expect.objectContaining({ id: DASHBOARD_ID }),
        expect.any(Number),
      );
    });

    it('throws NotFoundError when dashboard does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        LookerService.getDashboard('nonexistent-id'),
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

      const result = await LookerService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(result.is_active).toBe(false);
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE');
    });

    it('throws NotFoundError when deleting non-existent dashboard', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        LookerService.deleteDashboard(USER_ID, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundError);
    });

    it('invalidates cache on deletion', async () => {
      const row = makeDashboardRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(mockCacheDel).toHaveBeenCalledWith(`looker:dashboard:${DASHBOARD_ID}`);
      expect(mockCacheFlush).toHaveBeenCalledWith('looker:dashboards:*');
    });

    it('logs audit entry on dashboard deletion', async () => {
      const row = makeDashboardRow({ is_active: false });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.deleteDashboard(USER_ID, DASHBOARD_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'looker.delete_dashboard',
          resourceType: 'analytics_dashboard',
          resourceId: DASHBOARD_ID,
        }),
      );
    });
  });

  // =========================================================================
  // refreshData
  // =========================================================================

  describe('refreshData', () => {
    it('refreshes data source successfully', async () => {
      const row = makeExportRow({ export_type: 'refresh', status: 'completed' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.refreshData(USER_ID, DATA_SOURCE_ID);

      expect(result.status).toBe('completed');
      expect(result.export_type).toBe('refresh');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('creates an export record for the refresh operation', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.refreshData(USER_ID, DATA_SOURCE_ID);

      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO');
      expect(mockQuery.mock.calls[0][1]).toEqual(
        expect.arrayContaining([USER_ID]),
      );
    });

    it('logs audit entry on data refresh', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.refreshData(USER_ID, DATA_SOURCE_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: 'looker.refresh_data',
          resourceType: 'analytics_export',
          details: expect.objectContaining({ dataSourceId: DATA_SOURCE_ID }),
        }),
      );
    });

    it('invalidates related caches on refresh', async () => {
      const row = makeExportRow({ export_type: 'refresh' });
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.refreshData(USER_ID, DATA_SOURCE_ID);

      expect(mockCacheFlush).toHaveBeenCalledWith('looker:data:*');
    });
  });

  // =========================================================================
  // getConnectionStatus
  // =========================================================================

  describe('getConnectionStatus', () => {
    it('returns connection status for the user', async () => {
      const row = makeConnectionRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await LookerService.getConnectionStatus(USER_ID);

      expect(result.status).toBe('connected');
      expect(result.platform_type).toBe('looker');
      expect(result.user_id).toBe(USER_ID);
    });

    it('returns disconnected status when no connection found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await LookerService.getConnectionStatus(USER_ID);

      expect(result.status).toBe('disconnected');
    });

    it('returns cached connection status on cache hit', async () => {
      const cached = makeConnectionRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await LookerService.getConnectionStatus(USER_ID);

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

      const result = await LookerService.getSyncStatus();

      expect(result.platform_type).toBe('looker');
      expect(result.total_syncs).toBe(42);
      expect(result.successful_syncs).toBe(40);
      expect(result.failed_syncs).toBe(2);
    });

    it('returns cached sync status on cache hit', async () => {
      const cached = makeSyncRow();
      mockCacheGet.mockResolvedValueOnce(cached);

      const result = await LookerService.getSyncStatus();

      expect(result).toEqual(cached);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('caches sync status after DB fetch', async () => {
      const row = makeSyncRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await LookerService.getSyncStatus();

      expect(mockCacheSet).toHaveBeenCalledWith(
        'looker:sync_status',
        expect.objectContaining({ platform_type: 'looker' }),
        expect.any(Number),
      );
    });

    it('returns default values when no sync records exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await LookerService.getSyncStatus();

      expect(result.total_syncs).toBe(0);
      expect(result.successful_syncs).toBe(0);
      expect(result.failed_syncs).toBe(0);
    });
  });
});

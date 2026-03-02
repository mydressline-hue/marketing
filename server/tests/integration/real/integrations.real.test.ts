/**
 * External Integration Services Integration Tests (Phase 12C - Batch 2).
 *
 * Validates platform connection management, sync operations, status tracking,
 * error handling, rate limiting, CRM operations, and analytics exports.
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
  generateId: jest.fn().mockReturnValue('int-test-uuid'),
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

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// Mock all platform-specific services
jest.mock('../../../src/services/integrations/ads/GoogleAdsService', () => ({
  GoogleAdsService: { syncCampaigns: jest.fn().mockResolvedValue({ synced: 10, failed: 0 }) },
}));
jest.mock('../../../src/services/integrations/ads/MetaAdsService', () => ({
  MetaAdsService: { syncCampaigns: jest.fn().mockResolvedValue({ synced: 8, failed: 1 }) },
}));
jest.mock('../../../src/services/integrations/ads/TikTokAdsService', () => ({
  TikTokAdsService: { syncCampaigns: jest.fn().mockResolvedValue({ synced: 5, failed: 0 }) },
}));
jest.mock('../../../src/services/integrations/ads/BingAdsService', () => ({
  BingAdsService: { syncCampaigns: jest.fn().mockResolvedValue({ synced: 3, failed: 0 }) },
}));
jest.mock('../../../src/services/integrations/ads/SnapchatAdsService', () => ({
  SnapchatAdsService: { syncCampaigns: jest.fn().mockResolvedValue({ synced: 2, failed: 0 }) },
}));
jest.mock('../../../src/services/integrations/shopify/ShopifyAdminService', () => ({
  ShopifyAdminService: { syncProducts: jest.fn().mockResolvedValue({ synced: 50, failed: 2 }) },
}));
jest.mock('../../../src/services/integrations/crm/SalesforceService', () => ({
  SalesforceService: {
    syncContacts: jest.fn().mockResolvedValue({ synced: 100, failed: 0, contacts_created: 80, contacts_updated: 20, contacts_failed: 0, contacts_skipped: 0, total_processed: 100 }),
    listContacts: jest.fn().mockResolvedValue({ data: [{ id: 'c1', name: 'Contact 1' }], total: 1 }),
  },
}));
jest.mock('../../../src/services/integrations/crm/HubSpotService', () => ({
  HubSpotService: {
    syncContacts: jest.fn().mockResolvedValue({ synced: 75, failed: 5, contacts_created: 50, contacts_updated: 25, contacts_failed: 5, contacts_skipped: 0, total_processed: 80 }),
    listContacts: jest.fn().mockResolvedValue({ data: [{ id: 'h1', name: 'HubSpot Contact' }], total: 1 }),
  },
}));
jest.mock('../../../src/services/integrations/crm/KlaviyoService', () => ({
  KlaviyoService: {
    syncProfiles: jest.fn().mockResolvedValue({ synced: 200, failed: 0 }),
    listProfiles: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));
jest.mock('../../../src/services/integrations/crm/MailchimpService', () => ({
  MailchimpService: {
    syncAudiences: jest.fn().mockResolvedValue({ synced: 150, failed: 0 }),
    listMembers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));
jest.mock('../../../src/services/integrations/crm/IterableService', () => ({
  IterableService: {
    syncUsers: jest.fn().mockResolvedValue({ synced: 300, failed: 0 }),
    listUsers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  },
}));
jest.mock('../../../src/services/integrations/analytics/LookerService', () => ({
  LookerService: {
    refreshData: jest.fn().mockResolvedValue({ records_exported: 25 }),
    exportData: jest.fn().mockResolvedValue({ records_exported: 25 }),
    listDashboards: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }),
  },
}));
jest.mock('../../../src/services/integrations/analytics/TableauService', () => ({
  TableauService: {
    refreshData: jest.fn().mockResolvedValue({ records_exported: 15 }),
    exportData: jest.fn().mockResolvedValue({ records_exported: 15 }),
    listDashboards: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }),
  },
}));
jest.mock('../../../src/services/integrations/analytics/PowerBIService', () => ({
  PowerBIService: {
    refreshData: jest.fn().mockResolvedValue({ records_exported: 20 }),
    exportData: jest.fn().mockResolvedValue({ records_exported: 20 }),
    listDashboards: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from '@jest/globals';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import { IntegrationsService } from '../../../src/services/integrations/IntegrationsService';
import { AuditService } from '../../../src/services/audit.service';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('External Integration Services Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockAuditLog.mockResolvedValue(undefined);
  });

  // =========================================================================
  // Google Ads service operations
  // =========================================================================

  describe('Google Ads service operations', () => {
    it('should connect Google Ads platform', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no existing connection
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert

      const result = await IntegrationsService.connectPlatform({
        platform_type: 'google_ads',
        credentials: { client_id: 'gads-id', client_secret: 'gads-secret' },
        user_id: 'user-1',
      });

      expect(result.platform_type).toBe('google_ads');
      expect(result.status).toBe('active');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.connected' }),
      );
    });

    it('should sync Google Ads campaigns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-1', credentials: '{}', config: null }] }) // connection exists
        .mockResolvedValueOnce({ rows: [] }) // insert sync log
        .mockResolvedValueOnce({ rows: [] }) // update sync log completed
        .mockResolvedValueOnce({ rows: [] }); // update connection last_synced_at

      const result = await IntegrationsService.triggerSync('google_ads', 'user-1');

      expect(result.platform_type).toBe('google_ads');
      expect(result.status).toBe('completed');
      expect(result.records_synced).toBe(10);
      expect(result.records_failed).toBe(0);
    });
  });

  // =========================================================================
  // Meta Ads service operations
  // =========================================================================

  describe('Meta Ads service operations', () => {
    it('should connect Meta Ads platform', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await IntegrationsService.connectPlatform({
        platform_type: 'meta_ads',
        credentials: { access_token: 'meta-token' },
        user_id: 'user-1',
      });

      expect(result.platform_type).toBe('meta_ads');
      expect(result.status).toBe('active');
    });

    it('should sync Meta Ads with partial failures', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-2', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await IntegrationsService.triggerSync('meta_ads', 'user-1');

      expect(result.records_synced).toBe(8);
      expect(result.records_failed).toBe(1);
    });
  });

  // =========================================================================
  // TikTok Ads service operations
  // =========================================================================

  describe('TikTok Ads service operations', () => {
    it('should sync TikTok Ads campaigns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-3', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await IntegrationsService.triggerSync('tiktok_ads', 'user-1');

      expect(result.records_synced).toBe(5);
      expect(result.platform_type).toBe('tiktok_ads');
    });
  });

  // =========================================================================
  // Shopify service operations
  // =========================================================================

  describe('Shopify service operations', () => {
    it('should sync Shopify products', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-shopify', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await IntegrationsService.triggerSync('shopify', 'user-1');

      expect(result.records_synced).toBe(50);
      expect(result.records_failed).toBe(2);
      expect(result.platform_type).toBe('shopify');
    });
  });

  // =========================================================================
  // CRM service operations
  // =========================================================================

  describe('CRM service operations', () => {
    it('should sync Salesforce contacts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-sf', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] }); // insert crm_sync_logs

      const result = await IntegrationsService.syncCrmContacts('salesforce', 'user-1');

      expect(result.platform_type).toBe('salesforce');
      expect(result.contacts_created).toBe(80);
      expect(result.contacts_updated).toBe(20);
      expect(result.total_processed).toBe(100);
    });

    it('should sync HubSpot contacts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-hs', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await IntegrationsService.syncCrmContacts('hubspot', 'user-1');

      expect(result.platform_type).toBe('hubspot');
      expect(result.contacts_created).toBe(50);
      expect(result.contacts_failed).toBe(5);
    });

    it('should list Salesforce contacts with pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-sf' }] }); // connection check

      const result = await IntegrationsService.listCrmContacts('salesforce', 'user-1', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should reject non-CRM platform in syncCrmContacts', async () => {
      await expect(
        IntegrationsService.syncCrmContacts('google_ads', 'user-1'),
      ).rejects.toThrow('not a CRM platform');
    });
  });

  // =========================================================================
  // Integration status tracking
  // =========================================================================

  describe('Integration status tracking', () => {
    it('should return all platform statuses for a user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ platform_type: 'google_ads', status: 'active', last_synced_at: '2026-01-01T00:00:00Z' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const statuses = await IntegrationsService.getAllStatuses('user-1');

      expect(statuses.length).toBeGreaterThan(0);
      const googleAds = statuses.find((s: any) => s.platform_type === 'google_ads');
      expect(googleAds).toBeDefined();
      expect(googleAds!.status).toBe('connected');
    });

    it('should return disconnected status for unconnected platforms', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const statuses = await IntegrationsService.getAllStatuses('user-1');

      const tiktok = statuses.find((s: any) => s.platform_type === 'tiktok_ads');
      expect(tiktok).toBeDefined();
      expect(tiktok!.status).toBe('disconnected');
    });

    it('should get detailed platform status including metrics', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'conn-1', platform_type: 'google_ads', status: 'active',
            connected_at: '2026-01-01T00:00:00Z', last_synced_at: '2026-01-15T00:00:00Z',
            sync_frequency: 'hourly', config: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_campaigns_synced: '15', total_records: '100', error_count_24h: '2' }],
        });

      const status = await IntegrationsService.getPlatformStatus('google_ads', 'user-1');

      expect(status.platform_type).toBe('google_ads');
      expect(status.status).toBe('connected');
      expect(status.metrics.total_campaigns_synced).toBe(15);
      expect(status.metrics.error_count_24h).toBe(2);
    });

    it('should return disconnected status for unconfigured platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const status = await IntegrationsService.getPlatformStatus('meta_ads', 'user-1');

      expect(status.status).toBe('disconnected');
      expect(status.health).toBe('n/a');
    });
  });

  // =========================================================================
  // Error handling for failed API calls
  // =========================================================================

  describe('Error handling for failed API calls', () => {
    it('should throw NotFoundError when syncing a disconnected platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no connection

      await expect(
        IntegrationsService.triggerSync('google_ads', 'user-1'),
      ).rejects.toThrow('not connected');
    });

    it('should throw NotFoundError when disconnecting a non-connected platform', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await expect(
        IntegrationsService.disconnectPlatform('google_ads', 'user-1'),
      ).rejects.toThrow('not connected');
    });

    it('should throw ValidationError for unsupported platform type', async () => {
      await expect(
        IntegrationsService.connectPlatform({
          platform_type: 'unsupported_platform',
          credentials: {},
          user_id: 'user-1',
        }),
      ).rejects.toThrow('Unsupported platform type');
    });
  });

  // =========================================================================
  // Sync status tracking
  // =========================================================================

  describe('Sync status tracking', () => {
    it('should return sync status including last sync details', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-1', sync_frequency: 'hourly' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'sync-1', status: 'completed', started_at: '2026-01-01T00:00:00Z',
            completed_at: '2026-01-01T00:01:00Z', records_synced: '50', error_message: null,
          }],
        });

      const syncStatus = await IntegrationsService.getSyncStatus('google_ads', 'user-1');

      expect(syncStatus.platform_type).toBe('google_ads');
      expect(syncStatus.last_sync).toBeDefined();
      expect(syncStatus.last_sync!.status).toBe('completed');
      expect(syncStatus.sync_frequency).toBe('hourly');
      expect(syncStatus.is_syncing).toBe(false);
    });

    it('should detect an in-progress sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-1', sync_frequency: null }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'sync-2', status: 'in_progress', started_at: '2026-01-01T00:00:00Z',
            completed_at: null, records_synced: '0', error_message: null,
          }],
        });

      const syncStatus = await IntegrationsService.getSyncStatus('meta_ads', 'user-1');

      expect(syncStatus.is_syncing).toBe(true);
    });

    it('should return null sync status for unconnected platform', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const syncStatus = await IntegrationsService.getSyncStatus('tiktok_ads', 'user-1');

      expect(syncStatus.last_sync).toBeNull();
      expect(syncStatus.is_syncing).toBe(false);
    });
  });

  // =========================================================================
  // Platform reports
  // =========================================================================

  describe('Platform reports', () => {
    it('should return paginated platform reports', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '25' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'r1', campaign_name: 'Camp A', impressions: 1000, clicks: 50, conversions: 5, spend: 100, ctr: 5.0, cpc: 2.0, date: '2026-01-01' },
          ],
        });

      const result = await IntegrationsService.getPlatformReports('google_ads', 'user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
    });
  });

  // =========================================================================
  // Reconnection handling
  // =========================================================================

  describe('Reconnection handling', () => {
    it('should update credentials when reconnecting an already-active platform', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-existing' }], rowCount: 1 }) // existing active
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update

      const result = await IntegrationsService.connectPlatform({
        platform_type: 'google_ads',
        credentials: { client_id: 'new-id', client_secret: 'new-secret' },
        user_id: 'user-1',
      });

      expect(result.id).toBe('conn-existing');
      expect(result.status).toBe('active');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.reconnected' }),
      );
    });
  });

  // =========================================================================
  // Disconnect platform
  // =========================================================================

  describe('Disconnect platform', () => {
    it('should disconnect a connected platform', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'conn-1' }] });

      const result = await IntegrationsService.disconnectPlatform('google_ads', 'user-1');

      expect(result.status).toBe('disconnected');
      expect(result.disconnected_at).toBeDefined();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.disconnected' }),
      );
    });
  });

  // =========================================================================
  // Analytics export
  // =========================================================================

  describe('Analytics export', () => {
    it('should export analytics data from Looker', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'conn-looker', credentials: '{}', config: null }] })
        .mockResolvedValueOnce({ rows: [] }); // insert analytics_exports

      const result = await IntegrationsService.exportAnalyticsData('looker', 'user-1', {
        format: 'csv',
        metrics: ['impressions', 'clicks'],
      });

      expect(result.platform_type).toBe('looker');
      expect(result.status).toBe('processing');
      expect(result.format).toBe('csv');
    });

    it('should reject non-analytics platform for export', async () => {
      await expect(
        IntegrationsService.exportAnalyticsData('google_ads', 'user-1', { format: 'csv' }),
      ).rejects.toThrow('not an analytics platform');
    });
  });
});

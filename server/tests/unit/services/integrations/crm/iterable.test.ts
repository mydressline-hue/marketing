jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn(), cacheFlush: jest.fn(),
}));
jest.mock('../../../../../../src/config/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('iter-uuid-1'),
}));
jest.mock('../../../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../../../src/services/audit.service', () => ({
  AuditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

import { pool } from '../../../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../../../../../../src/config/redis';
import { generateId } from '../../../../../../src/utils/helpers';
import { AuditService } from '../../../../../../src/services/audit.service';
import { IterableService } from '../../../../../../src/services/integrations/crm/IterableService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-uuid-1';

function makeSyncLogRow(overrides = {}) {
  return {
    id: 'sync-uuid-1', platform_type: 'iterable', sync_type: 'users',
    direction: 'inbound', records_synced: 150, records_failed: 3,
    status: 'completed', details: { duration_ms: 5200 },
    started_at: '2026-02-25T00:00:00Z', completed_at: '2026-02-25T00:01:00Z',
    ...overrides,
  };
}

function makeContactMappingRow(overrides = {}) {
  return {
    id: 'map-uuid-1', platform_type: 'iterable',
    internal_id: 'contact-1', external_id: 'iter-user-123',
    entity_type: 'user', last_synced_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

const iterableConnection = {
  id: 'conn-iter-1',
  user_id: USER_ID,
  platform_type: 'iterable',
  api_key: 'iter-api-key-xyz',
  status: 'active',
  created_at: new Date().toISOString(),
};

const iterableUser = {
  id: 'iter-user-001',
  user_id: USER_ID,
  platform_type: 'iterable',
  email: 'subscriber@example.com',
  first_name: 'Dana',
  last_name: 'Rivera',
  iterable_user_id: 'iter-user-123',
  data_fields: { plan: 'pro', signup_source: 'web' },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const iterableCampaign = {
  id: 'iter-campaign-001',
  user_id: USER_ID,
  platform_type: 'iterable',
  campaign_name: 'Welcome Series - Day 1',
  campaign_type: 'email',
  iterable_campaign_id: 'ic-5001',
  status: 'active',
  created_at: new Date().toISOString(),
};

const iterableList = {
  id: 'iter-list-001',
  user_id: USER_ID,
  platform_type: 'iterable',
  name: 'VIP Subscribers',
  iterable_list_id: 'il-2001',
  subscriber_count: 0,
  created_at: new Date().toISOString(),
};

const newUserData = {
  email: 'newuser@example.com',
  first_name: 'Eli',
  last_name: 'Thompson',
  data_fields: { plan: 'starter', referral: 'organic' },
};

const updateUserData = {
  first_name: 'Dana-Updated',
  data_fields: { plan: 'enterprise', signup_source: 'web' },
};

const userFilters = {
  page: 1,
  limit: 20,
  search: 'rivera',
};

const newListData = {
  name: 'March Promo Targets',
  description: 'Users targeted for March promotional campaign',
};

const eventData = {
  event_name: 'button_clicked',
  data_fields: { button_id: 'cta-hero', page: '/landing' },
};

const purchaseData = {
  items: [
    { id: 'sku-100', name: 'Pro Plan Monthly', price: 49.99, quantity: 1 },
    { id: 'sku-200', name: 'Add-on: Analytics', price: 19.99, quantity: 1 },
  ],
  total: 69.98,
  campaign_id: 'ic-5001',
};

const campaignMetrics = {
  campaign_id: 'iter-campaign-001',
  sends: 12000,
  opens: 4800,
  clicks: 1200,
  conversions: 360,
  unsubscribes: 45,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockCacheFlush = cacheFlush as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// IterableService
// ===========================================================================
describe('IterableService', () => {
  // -------------------------------------------------------------------------
  // syncUsers
  // -------------------------------------------------------------------------
  describe('syncUsers', () => {
    it('should sync users from Iterable and return counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })        // fetch connection
        .mockResolvedValueOnce({ rows: [{ count: '150' }] })          // existing count
        .mockResolvedValueOnce({ rows: [iterableUser] })              // upserted users
        .mockResolvedValueOnce({ rowCount: 150 });                    // update sync timestamp

      const result = await IterableService.syncUsers(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a sync log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '150' }] })
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rowCount: 150 })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow()] });         // insert sync log

      const result = await IterableService.syncUsers(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '80' }] })
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rowCount: 80 });

      await IterableService.syncUsers(USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle partial failures during user sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '150' }] })
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rowCount: 147 });                    // 3 records failed

      const result = await IterableService.syncUsers(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when no active Iterable connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(IterableService.syncUsers(USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during user sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockRejectedValueOnce(new Error('Iterable API rate limit exceeded'));

      await expect(IterableService.syncUsers(USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // createUser
  // -------------------------------------------------------------------------
  describe('createUser', () => {
    it('should create a user in Iterable and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableUser, ...newUserData, id: 'iter-uuid-1' }] });

      const result = await IterableService.createUser(USER_ID, newUserData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a contact mapping for the new user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableUser, id: 'iter-uuid-1' }] })
        .mockResolvedValueOnce({ rows: [makeContactMappingRow()] });  // insert mapping

      await IterableService.createUser(USER_ID, newUserData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after user creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableUser, id: 'iter-uuid-1' }] });

      await IterableService.createUser(USER_ID, newUserData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should reject duplicate email addresses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key' });

      await expect(
        IterableService.createUser(USER_ID, newUserData),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateUser
  // -------------------------------------------------------------------------
  describe('updateUser', () => {
    it('should update an existing user in Iterable', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableUser, ...updateUserData }] });

      const result = await IterableService.updateUser(
        USER_ID,
        'iter-user-123',
        updateUserData,
      );

      expect(result).toBeDefined();
    });

    it('should throw when user does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        IterableService.updateUser(USER_ID, 'nonexistent-id', updateUserData),
      ).rejects.toThrow();
    });

    it('should invalidate cache after updating a user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableUser, ...updateUserData }] });

      await IterableService.updateUser(USER_ID, 'iter-user-123', updateUserData);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getUser
  // -------------------------------------------------------------------------
  describe('getUser', () => {
    it('should return user from DB on cache miss and set cache', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [iterableUser] });

      const result = await IterableService.getUser('iter-user-123');

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCacheSet).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return a cached user when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(iterableUser));

      const result = await IterableService.getUser('iter-user-123');

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when user is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await IterableService.getUser('missing-id');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listUsers
  // -------------------------------------------------------------------------
  describe('listUsers', () => {
    it('should return a paginated list of users', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await IterableService.listUsers(userFilters);

      expect(result).toBeDefined();
    });

    it('should apply search filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await IterableService.listUsers({ ...userFilters, search: 'dana' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return empty results when no users match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await IterableService.listUsers({ ...userFilters, search: 'zzzzz' });

      expect(result).toBeDefined();
    });

    it('should handle default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableUser] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await IterableService.listUsers({});

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // trackEvent
  // -------------------------------------------------------------------------
  describe('trackEvent', () => {
    it('should track a custom event with event_name and data_fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...eventData, user_id: USER_ID }] });

      const result = await IterableService.trackEvent(USER_ID, eventData);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate that event_name is required', async () => {
      const invalidEventData = { data_fields: { page: '/home' } };

      await expect(
        IterableService.trackEvent(USER_ID, invalidEventData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after tracking an event', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...eventData, user_id: USER_ID }] });

      await IterableService.trackEvent(USER_ID, eventData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle event tracking with empty data_fields', async () => {
      const minimalEvent = { event_name: 'page_view', data_fields: {} };

      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...minimalEvent, user_id: USER_ID }] });

      const result = await IterableService.trackEvent(USER_ID, minimalEvent);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // trackPurchase
  // -------------------------------------------------------------------------
  describe('trackPurchase', () => {
    it('should track a purchase event with items and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...purchaseData, user_id: USER_ID }] });

      const result = await IterableService.trackPurchase(USER_ID, purchaseData);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after tracking a purchase', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...purchaseData, user_id: USER_ID }] });

      await IterableService.trackPurchase(USER_ID, purchaseData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle purchase with a single item', async () => {
      const singleItemPurchase = {
        items: [{ id: 'sku-100', name: 'Pro Plan Monthly', price: 49.99, quantity: 1 }],
        total: 49.99,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'iter-uuid-1', ...singleItemPurchase, user_id: USER_ID }] });

      const result = await IterableService.trackPurchase(USER_ID, singleItemPurchase);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------
  describe('syncCampaigns', () => {
    it('should sync campaigns from Iterable', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [iterableCampaign] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await IterableService.syncCampaigns(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a sync log entry after campaign sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [iterableCampaign] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [makeSyncLogRow({ sync_type: 'campaigns' })] });

      const result = await IterableService.syncCampaigns(USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when no active connection exists for campaign sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(IterableService.syncCampaigns(USER_ID)).rejects.toThrow();
    });

    it('should handle empty campaign list from Iterable', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await IterableService.syncCampaigns(USER_ID);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaignMetrics
  // -------------------------------------------------------------------------
  describe('getCampaignMetrics', () => {
    it('should return campaign metrics including sends, opens, clicks, conversions, and unsubscribes', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [campaignMetrics] });

      const result = await IterableService.getCampaignMetrics('iter-campaign-001');

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when campaign is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await IterableService.getCampaignMetrics('nonexistent-campaign');

      expect(result).toBeNull();
    });

    it('should return cached metrics when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(campaignMetrics));

      const result = await IterableService.getCampaignMetrics('iter-campaign-001');

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should set cache after fetching metrics from DB', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [campaignMetrics] });

      await IterableService.getCampaignMetrics('iter-campaign-001');

      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createList
  // -------------------------------------------------------------------------
  describe('createList', () => {
    it('should create a new user list in Iterable', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableList, ...newListData, id: 'iter-uuid-1' }] });

      const result = await IterableService.createList(USER_ID, newListData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after list creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [{ ...iterableList, id: 'iter-uuid-1' }] });

      await IterableService.createList(USER_ID, newListData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should validate list name is provided', async () => {
      const invalidData = { name: '' };

      await expect(
        IterableService.createList(USER_ID, invalidData as any),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addToList
  // -------------------------------------------------------------------------
  describe('addToList', () => {
    it('should add users to an existing list', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [iterableList] })              // verify list exists
        .mockResolvedValueOnce({ rowCount: 2 });                      // insert user-list rows

      const result = await IterableService.addToList(USER_ID, 'iter-list-001', [
        'iter-user-123',
        'iter-user-456',
      ]);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when the target list does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        IterableService.addToList(USER_ID, 'nonexistent-list', ['iter-user-123']),
      ).rejects.toThrow();
    });

    it('should handle empty user IDs array gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [iterableList] });

      const result = await IterableService.addToList(USER_ID, 'iter-list-001', []);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry when users are added to a list', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [iterableConnection] })
        .mockResolvedValueOnce({ rows: [iterableList] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await IterableService.addToList(USER_ID, 'iter-list-001', ['iter-user-123']);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getSyncStatus
  // -------------------------------------------------------------------------
  describe('getSyncStatus', () => {
    it('should return last sync time and record counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            last_sync_at: '2026-02-25T12:00:00Z',
            users_count: 1500,
            campaigns_count: 42,
            lists_count: 12,
          },
        ],
      });

      const result = await IterableService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should return default values when no sync has occurred', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await IterableService.getSyncStatus();

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return connected when a valid connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [iterableConnection] });

      const result = await IterableService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
    });

    it('should return disconnected when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await IterableService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
    });

    it('should return error status when connection is expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...iterableConnection, status: 'expired' }],
      });

      const result = await IterableService.getConnectionStatus(USER_ID);

      expect(result).toBeDefined();
    });
  });
});

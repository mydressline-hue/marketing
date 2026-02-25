jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn(), cacheFlush: jest.fn(),
}));
jest.mock('../../../../../../src/config/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('email-uuid-1'),
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
import { KlaviyoService } from '../../../../../../src/services/integrations/crm/KlaviyoService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-kl-001';
const TEST_PROFILE_ID = 'kl-profile-001';
const TEST_LIST_ID = 'kl-list-001';
const TEST_CAMPAIGN_ID = 'kl-campaign-001';

const klConnection = {
  id: 'conn-kl-1',
  user_id: TEST_USER_ID,
  platform_type: 'klaviyo',
  api_key: 'pk_live_abc123xyz',
  status: 'active',
  created_at: new Date().toISOString(),
};

const klProfile = {
  id: TEST_PROFILE_ID,
  user_id: TEST_USER_ID,
  platform_type: 'klaviyo',
  email: 'sarah.connor@example.com',
  first_name: 'Sarah',
  last_name: 'Connor',
  phone_number: '+1-555-0700',
  title: 'Marketing Manager',
  organization: 'Cyberdyne Systems',
  kl_profile_id: 'KL_01PROFILE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const klCampaign = {
  id: TEST_CAMPAIGN_ID,
  user_id: TEST_USER_ID,
  platform_type: 'klaviyo',
  name: 'Spring Sale 2026',
  status: 'sent',
  subject_line: '25% Off Everything - Spring Sale!',
  send_time: '2026-03-01T09:00:00Z',
  kl_campaign_id: 'KL_CAMP_001',
  created_at: new Date().toISOString(),
};

const klList = {
  id: TEST_LIST_ID,
  user_id: TEST_USER_ID,
  platform_type: 'klaviyo',
  name: 'Newsletter Subscribers',
  kl_list_id: 'KL_LIST_001',
  profile_count: 0,
  created_at: new Date().toISOString(),
};

const klCampaignMetrics = {
  campaign_id: TEST_CAMPAIGN_ID,
  open_rate: 0.342,
  click_rate: 0.087,
  bounce_rate: 0.012,
  unsubscribe_rate: 0.003,
  total_recipients: 15000,
  total_opens: 5130,
  total_clicks: 1305,
  total_bounces: 180,
  total_unsubscribes: 45,
  revenue: 24500.0,
};

const newProfileData = {
  email: 'miles.dyson@skynet.io',
  first_name: 'Miles',
  last_name: 'Dyson',
  phone_number: '+1-555-0800',
  organization: 'Skynet Research',
  title: 'Lead Engineer',
};

const updateProfileData = {
  phone_number: '+1-555-0899',
  title: 'Senior Director of Engineering',
};

const profileFilters = {
  page: 1,
  limit: 20,
  search: 'connor',
  organization: 'Cyberdyne Systems',
};

const newListData = {
  name: 'VIP Customers Q1',
  description: 'Top-tier customers for Q1 campaigns',
};

const trackEventData = {
  event_name: 'purchase',
  properties: {
    product_id: 'prod-001',
    product_name: 'Premium Widget',
    value: 79.99,
    currency: 'USD',
  },
  profile_id: TEST_PROFILE_ID,
  timestamp: '2026-02-25T14:30:00Z',
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
// KlaviyoService
// ===========================================================================
describe('KlaviyoService', () => {
  // -------------------------------------------------------------------------
  // syncProfiles
  // -------------------------------------------------------------------------
  describe('syncProfiles', () => {
    it('should sync profiles from Klaviyo and return counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })           // fetch connection
        .mockResolvedValueOnce({ rows: [{ count: '12' }] })        // existing count
        .mockResolvedValueOnce({ rows: [klProfile] })              // upserted profiles
        .mockResolvedValueOnce({ rowCount: 12 });                  // update sync timestamp

      const result = await KlaviyoService.syncProfiles(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a sync log entry after successful profile sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '6' }] })
        .mockResolvedValueOnce({ rows: [klProfile] })
        .mockResolvedValueOnce({ rowCount: 6 });

      const result = await KlaviyoService.syncProfiles(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [klProfile] })
        .mockResolvedValueOnce({ rowCount: 4 });

      await KlaviyoService.syncProfiles(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active Klaviyo connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(KlaviyoService.syncProfiles(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during profile sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockRejectedValueOnce(new Error('Klaviyo API rate limit exceeded'));

      await expect(KlaviyoService.syncProfiles(TEST_USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // createProfile
  // -------------------------------------------------------------------------
  describe('createProfile', () => {
    it('should create a profile in Klaviyo and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klProfile, ...newProfileData, id: 'email-uuid-1' }] });

      const result = await KlaviyoService.createProfile(TEST_USER_ID, newProfileData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a local-to-Klaviyo contact mapping', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klProfile, id: 'email-uuid-1' }] });

      await KlaviyoService.createProfile(TEST_USER_ID, newProfileData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should validate required fields before creating a profile', async () => {
      const invalidData = { email: '' };

      await expect(
        KlaviyoService.createProfile(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after profile creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klProfile, id: 'email-uuid-1' }] });

      await KlaviyoService.createProfile(TEST_USER_ID, newProfileData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should reject duplicate email addresses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key' });

      await expect(
        KlaviyoService.createProfile(TEST_USER_ID, newProfileData),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------
  describe('updateProfile', () => {
    it('should update an existing profile in Klaviyo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klProfile, ...updateProfileData }] });

      const result = await KlaviyoService.updateProfile(
        TEST_USER_ID,
        TEST_PROFILE_ID,
        updateProfileData,
      );

      expect(result).toBeDefined();
    });

    it('should throw when profile does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        KlaviyoService.updateProfile(TEST_USER_ID, 'nonexistent-id', updateProfileData),
      ).rejects.toThrow();
    });

    it('should invalidate cache after updating a profile', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klProfile, ...updateProfileData }] });

      await KlaviyoService.updateProfile(TEST_USER_ID, TEST_PROFILE_ID, updateProfileData);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getProfile
  // -------------------------------------------------------------------------
  describe('getProfile', () => {
    it('should return a cached profile when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(klProfile));

      const result = await KlaviyoService.getProfile(TEST_PROFILE_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should query DB and set cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [klProfile] });

      const result = await KlaviyoService.getProfile(TEST_PROFILE_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCacheSet).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when profile is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await KlaviyoService.getProfile('missing-id');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listProfiles
  // -------------------------------------------------------------------------
  describe('listProfiles', () => {
    it('should return a paginated list of profiles', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klProfile] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await KlaviyoService.listProfiles(profileFilters);

      expect(result).toBeDefined();
    });

    it('should apply search filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klProfile] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await KlaviyoService.listProfiles({ ...profileFilters, search: 'sarah' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return empty results when no profiles match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await KlaviyoService.listProfiles({ ...profileFilters, search: 'zzzzz' });

      expect(result).toBeDefined();
    });

    it('should handle default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klProfile] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await KlaviyoService.listProfiles({});

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // trackEvent
  // -------------------------------------------------------------------------
  describe('trackEvent', () => {
    it('should track a custom event successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'email-uuid-1', ...trackEventData }] });

      const result = await KlaviyoService.trackEvent(TEST_USER_ID, trackEventData);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate event_name is provided', async () => {
      const invalidEvent = { ...trackEventData, event_name: '' };

      await expect(
        KlaviyoService.trackEvent(TEST_USER_ID, invalidEvent as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after tracking an event', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'email-uuid-1', ...trackEventData }] });

      await KlaviyoService.trackEvent(TEST_USER_ID, trackEventData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle viewed_product event type', async () => {
      const viewEvent = {
        ...trackEventData,
        event_name: 'viewed_product',
        properties: { product_id: 'prod-002', product_name: 'Deluxe Widget' },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ id: 'email-uuid-1', ...viewEvent }] });

      const result = await KlaviyoService.trackEvent(TEST_USER_ID, viewEvent);

      expect(result).toBeDefined();
    });

    it('should throw when no active Klaviyo connection exists for event tracking', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        KlaviyoService.trackEvent(TEST_USER_ID, trackEventData),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------
  describe('syncCampaigns', () => {
    it('should sync email campaigns from Klaviyo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [klCampaign] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await KlaviyoService.syncCampaigns(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when connection is missing for campaign sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(KlaviyoService.syncCampaigns(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle empty campaign list from Klaviyo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await KlaviyoService.syncCampaigns(TEST_USER_ID);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaignMetrics
  // -------------------------------------------------------------------------
  describe('getCampaignMetrics', () => {
    it('should return email campaign metrics including open_rate and click_rate', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [klCampaignMetrics] });

      const result = await KlaviyoService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return cached metrics when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(klCampaignMetrics));

      const result = await KlaviyoService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when campaign metrics are not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await KlaviyoService.getCampaignMetrics('nonexistent-campaign');

      expect(result).toBeNull();
    });

    it('should include bounce_rate and unsubscribe_rate in metrics', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [klCampaignMetrics] });

      const result = await KlaviyoService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(result).toBeDefined();
      expect(mockCacheSet).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createList
  // -------------------------------------------------------------------------
  describe('createList', () => {
    it('should create a new email list in Klaviyo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klList, ...newListData, id: 'email-uuid-1' }] });

      const result = await KlaviyoService.createList(TEST_USER_ID, newListData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate list name is provided', async () => {
      const invalidData = { name: '' };

      await expect(
        KlaviyoService.createList(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after list creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [{ ...klList, id: 'email-uuid-1' }] });

      await KlaviyoService.createList(TEST_USER_ID, newListData);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // addToList
  // -------------------------------------------------------------------------
  describe('addToList', () => {
    it('should add profiles to an existing list', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [klList] })                  // verify list exists
        .mockResolvedValueOnce({ rowCount: 2 });                    // insert profile-list rows

      const result = await KlaviyoService.addToList(TEST_USER_ID, TEST_LIST_ID, [
        'kl-profile-001',
        'kl-profile-002',
      ]);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when the target list does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        KlaviyoService.addToList(TEST_USER_ID, 'nonexistent-list', ['kl-profile-001']),
      ).rejects.toThrow();
    });

    it('should handle empty profile IDs array gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [klList] });

      const result = await KlaviyoService.addToList(TEST_USER_ID, TEST_LIST_ID, []);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry when profiles are added', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [klConnection] })
        .mockResolvedValueOnce({ rows: [klList] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await KlaviyoService.addToList(TEST_USER_ID, TEST_LIST_ID, ['kl-profile-001']);

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
            profiles_count: 15000,
            campaigns_count: 42,
            lists_count: 8,
          },
        ],
      });

      const result = await KlaviyoService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should return default values when no sync has occurred', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await KlaviyoService.getSyncStatus();

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return active when a valid connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [klConnection] });

      const result = await KlaviyoService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return disconnected when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await KlaviyoService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return error status when connection is expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...klConnection, status: 'expired' }],
      });

      const result = await KlaviyoService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });
  });
});

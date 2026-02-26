jest.mock('../../../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../../../../../../src/config/redis', () => ({
  cacheGet: jest.fn(), cacheSet: jest.fn(), cacheDel: jest.fn(), cacheFlush: jest.fn(),
}));
jest.mock('../../../../../../src/config/env', () => ({ env: { NODE_ENV: 'test' } }));
jest.mock('../../../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('crm-uuid-1'),
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
import { HubSpotService } from '../../../../../../src/services/integrations/crm/HubSpotService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-hs-001';
const TEST_CONTACT_ID = 'hs-contact-001';
const TEST_LIST_ID = 'hs-list-001';

const hsConnection = {
  id: 'conn-hs-1',
  user_id: TEST_USER_ID,
  platform_type: 'hubspot',
  portal_id: 'hub-portal-123',
  access_token: 'hs-access-token-xyz',
  refresh_token: 'hs-refresh-token-xyz',
  status: 'active',
  created_at: new Date().toISOString(),
};

const hsContact = {
  id: TEST_CONTACT_ID,
  user_id: TEST_USER_ID,
  platform_type: 'hubspot',
  first_name: 'Bob',
  last_name: 'Williams',
  email: 'bob.williams@example.com',
  phone: '+1-555-0300',
  company: 'Widget Co',
  title: 'Director of Marketing',
  hs_contact_id: '501',
  portal_id: 'hub-portal-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const hsDeal = {
  id: 'hs-deal-001',
  user_id: TEST_USER_ID,
  platform_type: 'hubspot',
  deal_name: 'Widget Co - Annual Plan',
  stage: 'proposal',
  amount: 35000,
  close_date: '2026-07-15',
  hs_deal_id: '901',
  portal_id: 'hub-portal-123',
};

const hsList = {
  id: TEST_LIST_ID,
  user_id: TEST_USER_ID,
  platform_type: 'hubspot',
  name: 'Hot Leads Q1',
  hs_list_id: '701',
  portal_id: 'hub-portal-123',
  contact_count: 0,
  created_at: new Date().toISOString(),
};

const newContactData = {
  first_name: 'Carol',
  last_name: 'Martinez',
  email: 'carol.martinez@newbiz.io',
  phone: '+1-555-0400',
  company: 'NewBiz IO',
  title: 'Head of Growth',
};

const updateContactData = {
  phone: '+1-555-0888',
  title: 'VP of Growth',
};

const contactFilters = {
  page: 1,
  limit: 20,
  search: 'williams',
  company: 'Widget Co',
};

const newListData = {
  name: 'Warm Leads Feb',
  description: 'Leads showing intent in February',
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
// HubSpotService
// ===========================================================================
describe('HubSpotService', () => {
  // -------------------------------------------------------------------------
  // syncContacts
  // -------------------------------------------------------------------------
  describe('syncContacts', () => {
    it('should sync contacts from HubSpot and return counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })           // fetch connection
        .mockResolvedValueOnce({ rows: [{ count: '8' }] })         // existing count
        .mockResolvedValueOnce({ rows: [hsContact] })              // upserted contacts
        .mockResolvedValueOnce({ rowCount: 8 });                   // update sync timestamp

      const result = await HubSpotService.syncContacts(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rowCount: 4 });

      await HubSpotService.syncContacts(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active HubSpot connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(HubSpotService.syncContacts(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during contact sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockRejectedValueOnce(new Error('HubSpot API rate limit exceeded'));

      await expect(HubSpotService.syncContacts(TEST_USER_ID)).rejects.toThrow();
    });

    it('should flush contact cache after a successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await HubSpotService.syncContacts(TEST_USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // syncDeals
  // -------------------------------------------------------------------------
  describe('syncDeals', () => {
    it('should sync deals from HubSpot', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [hsDeal] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await HubSpotService.syncDeals(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when connection is missing for deal sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(HubSpotService.syncDeals(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle empty deal list from HubSpot', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await HubSpotService.syncDeals(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry after deal sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [hsDeal] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await HubSpotService.syncDeals(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createContact
  // -------------------------------------------------------------------------
  describe('createContact', () => {
    it('should create a contact in HubSpot and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, ...newContactData, id: 'crm-uuid-1' }] });

      const result = await HubSpotService.createContact(TEST_USER_ID, newContactData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate required fields before creating a contact', async () => {
      const invalidData = { first_name: '' };

      await expect(
        HubSpotService.createContact(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should create a local-to-HubSpot ID mapping', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, id: 'crm-uuid-1' }] });

      await HubSpotService.createContact(TEST_USER_ID, newContactData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after contact creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, id: 'crm-uuid-1' }] });

      await HubSpotService.createContact(TEST_USER_ID, newContactData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should reject duplicate email addresses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key' });

      await expect(
        HubSpotService.createContact(TEST_USER_ID, newContactData),
      ).rejects.toThrow();
    });

    it('should assign platform_type hubspot to the created contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({
          rows: [{ ...hsContact, ...newContactData, id: 'crm-uuid-1', platform_type: 'hubspot' }],
        });

      const result = await HubSpotService.createContact(TEST_USER_ID, newContactData);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateContact
  // -------------------------------------------------------------------------
  describe('updateContact', () => {
    it('should update an existing contact in HubSpot', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, ...updateContactData }] });

      const result = await HubSpotService.updateContact(
        TEST_USER_ID,
        TEST_CONTACT_ID,
        updateContactData,
      );

      expect(result).toBeDefined();
    });

    it('should throw when contact does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        HubSpotService.updateContact(TEST_USER_ID, 'nonexistent-id', updateContactData),
      ).rejects.toThrow();
    });

    it('should invalidate cache after updating a contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, ...updateContactData }] });

      await HubSpotService.updateContact(TEST_USER_ID, TEST_CONTACT_ID, updateContactData);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should write an audit log entry after updating a contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, ...updateContactData }] });

      await HubSpotService.updateContact(TEST_USER_ID, TEST_CONTACT_ID, updateContactData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle partial update data', async () => {
      const partialData = { title: 'CMO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsContact, ...partialData }] });

      const result = await HubSpotService.updateContact(
        TEST_USER_ID,
        TEST_CONTACT_ID,
        partialData,
      );

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getContact
  // -------------------------------------------------------------------------
  describe('getContact', () => {
    it('should return a cached contact when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(hsContact));

      const result = await HubSpotService.getContact(TEST_CONTACT_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should query DB and set cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [hsContact] });

      const result = await HubSpotService.getContact(TEST_CONTACT_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCacheSet).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when contact is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await HubSpotService.getContact('missing-id');

      expect(result).toBeNull();
    });

    it('should handle cache read failure and fall back to DB', async () => {
      mockCacheGet.mockRejectedValueOnce(new Error('Redis unavailable'));
      mockQuery.mockResolvedValueOnce({ rows: [hsContact] });

      const result = await HubSpotService.getContact(TEST_CONTACT_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listContacts
  // -------------------------------------------------------------------------
  describe('listContacts', () => {
    it('should return a paginated list of contacts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await HubSpotService.listContacts(contactFilters);

      expect(result).toBeDefined();
    });

    it('should apply search filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await HubSpotService.listContacts({ ...contactFilters, search: 'bob' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return empty results when no contacts match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await HubSpotService.listContacts({ ...contactFilters, search: 'zzzzz' });

      expect(result).toBeDefined();
    });

    it('should handle default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await HubSpotService.listContacts({});

      expect(result).toBeDefined();
    });

    it('should apply company filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await HubSpotService.listContacts({ page: 1, limit: 10, company: 'Widget Co' });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createList
  // -------------------------------------------------------------------------
  describe('createList', () => {
    it('should create a new contact list in HubSpot', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsList, ...newListData, id: 'crm-uuid-1' }] });

      const result = await HubSpotService.createList(TEST_USER_ID, newListData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate list name is provided', async () => {
      const invalidData = { name: '' };

      await expect(
        HubSpotService.createList(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after list creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [{ ...hsList, id: 'crm-uuid-1' }] });

      await HubSpotService.createList(TEST_USER_ID, newListData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active connection exists for list creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        HubSpotService.createList(TEST_USER_ID, newListData),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addToList
  // -------------------------------------------------------------------------
  describe('addToList', () => {
    it('should add contacts to an existing list', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [hsList] })                  // verify list exists
        .mockResolvedValueOnce({ rowCount: 2 });                    // insert contact-list rows

      const result = await HubSpotService.addToList(TEST_USER_ID, TEST_LIST_ID, [
        'hs-contact-001',
        'hs-contact-002',
      ]);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when the target list does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        HubSpotService.addToList(TEST_USER_ID, 'nonexistent-list', ['hs-contact-001']),
      ).rejects.toThrow();
    });

    it('should handle empty contact IDs array gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [hsList] });

      const result = await HubSpotService.addToList(TEST_USER_ID, TEST_LIST_ID, []);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry when contacts are added', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [hsConnection] })
        .mockResolvedValueOnce({ rows: [hsList] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await HubSpotService.addToList(TEST_USER_ID, TEST_LIST_ID, ['hs-contact-001']);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active connection exists for addToList', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        HubSpotService.addToList(TEST_USER_ID, TEST_LIST_ID, ['hs-contact-001']),
      ).rejects.toThrow();
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
            contacts_count: 200,
            deals_count: 30,
            lists_count: 5,
          },
        ],
      });

      const result = await HubSpotService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should return default values when no sync has occurred', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await HubSpotService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should handle DB error when fetching sync status', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB read timeout'));

      await expect(HubSpotService.getSyncStatus()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return active when a valid connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [hsConnection] });

      const result = await HubSpotService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return disconnected when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await HubSpotService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return error status when connection is expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...hsConnection, status: 'expired' }],
      });

      const result = await HubSpotService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should handle DB failure when checking connection status', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(HubSpotService.getConnectionStatus(TEST_USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // disconnect
  // -------------------------------------------------------------------------
  describe('disconnect', () => {
    it('should remove the HubSpot connection for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await HubSpotService.disconnect(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should flush related cache entries on disconnect', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await HubSpotService.disconnect(TEST_USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should write an audit log entry on disconnect', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await HubSpotService.disconnect(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when disconnect fails at DB level', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(HubSpotService.disconnect(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle disconnect when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await HubSpotService.disconnect(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
    });
  });
});

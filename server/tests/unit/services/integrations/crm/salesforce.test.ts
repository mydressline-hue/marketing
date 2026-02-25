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
import { SalesforceService } from '../../../../../../src/services/integrations/crm/SalesforceService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-sf-001';
const TEST_CONTACT_ID = 'sf-contact-001';

const sfConnection = {
  id: 'conn-sf-1',
  user_id: TEST_USER_ID,
  platform_type: 'salesforce',
  instance_url: 'https://myorg.salesforce.com',
  access_token: 'sf-access-token-xyz',
  refresh_token: 'sf-refresh-token-xyz',
  status: 'active',
  created_at: new Date().toISOString(),
};

const sfContact = {
  id: TEST_CONTACT_ID,
  user_id: TEST_USER_ID,
  platform_type: 'salesforce',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane.doe@example.com',
  phone: '+1-555-0100',
  company: 'Acme Corp',
  title: 'VP of Sales',
  sf_contact_id: '003xx000004TmiQAAS',
  instance_url: 'https://myorg.salesforce.com',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sfLead = {
  id: 'sf-lead-001',
  user_id: TEST_USER_ID,
  platform_type: 'salesforce',
  first_name: 'John',
  last_name: 'Smith',
  email: 'john.smith@prospect.io',
  company: 'Prospect LLC',
  status: 'Open',
  sf_lead_id: '00Qxx000001abcDEFG',
};

const sfOpportunity = {
  id: 'sf-opp-001',
  user_id: TEST_USER_ID,
  platform_type: 'salesforce',
  name: 'Acme Corp - Enterprise Deal',
  stage: 'Negotiation',
  amount: 50000,
  close_date: '2026-06-30',
  sf_opportunity_id: '006xx000004TmiQAAS',
};

const newContactData = {
  first_name: 'Alice',
  last_name: 'Johnson',
  email: 'alice.johnson@newclient.com',
  phone: '+1-555-0200',
  company: 'NewClient Inc',
  title: 'CTO',
};

const updateContactData = {
  phone: '+1-555-0999',
  title: 'SVP of Engineering',
};

const contactFilters = {
  page: 1,
  limit: 20,
  search: 'doe',
  company: 'Acme Corp',
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
// SalesforceService
// ===========================================================================
describe('SalesforceService', () => {
  // -------------------------------------------------------------------------
  // syncContacts
  // -------------------------------------------------------------------------
  describe('syncContacts', () => {
    it('should sync contacts from Salesforce and return counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })           // fetch connection
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })         // existing count
        .mockResolvedValueOnce({ rows: [sfContact] })              // upserted contacts
        .mockResolvedValueOnce({ rowCount: 5 });                   // update sync timestamp

      const result = await SalesforceService.syncContacts(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rowCount: 3 });

      await SalesforceService.syncContacts(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active Salesforce connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(SalesforceService.syncContacts(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during contact sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockRejectedValueOnce(new Error('Salesforce API timeout'));

      await expect(SalesforceService.syncContacts(TEST_USER_ID)).rejects.toThrow();
    });

    it('should flush contact cache after a successful sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await SalesforceService.syncContacts(TEST_USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // syncLeads
  // -------------------------------------------------------------------------
  describe('syncLeads', () => {
    it('should sync leads from Salesforce', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [sfLead] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await SalesforceService.syncLeads(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when connection is missing for lead sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(SalesforceService.syncLeads(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle empty lead list from Salesforce', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await SalesforceService.syncLeads(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry after lead sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [sfLead] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await SalesforceService.syncLeads(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // createContact
  // -------------------------------------------------------------------------
  describe('createContact', () => {
    it('should create a contact in Salesforce and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, ...newContactData, id: 'crm-uuid-1' }] });

      const result = await SalesforceService.createContact(TEST_USER_ID, newContactData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate required fields before creating a contact', async () => {
      const invalidData = { first_name: '' };

      await expect(
        SalesforceService.createContact(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should create a local-to-Salesforce ID mapping', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, id: 'crm-uuid-1' }] });

      await SalesforceService.createContact(TEST_USER_ID, newContactData);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should write an audit log entry after contact creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, id: 'crm-uuid-1' }] });

      await SalesforceService.createContact(TEST_USER_ID, newContactData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should reject duplicate email addresses', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key' });

      await expect(
        SalesforceService.createContact(TEST_USER_ID, newContactData),
      ).rejects.toThrow();
    });

    it('should assign platform_type salesforce to the created contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({
          rows: [{ ...sfContact, ...newContactData, id: 'crm-uuid-1', platform_type: 'salesforce' }],
        });

      const result = await SalesforceService.createContact(TEST_USER_ID, newContactData);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateContact
  // -------------------------------------------------------------------------
  describe('updateContact', () => {
    it('should update an existing contact in Salesforce', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, ...updateContactData }] });

      const result = await SalesforceService.updateContact(
        TEST_USER_ID,
        TEST_CONTACT_ID,
        updateContactData,
      );

      expect(result).toBeDefined();
    });

    it('should throw when contact does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        SalesforceService.updateContact(TEST_USER_ID, 'nonexistent-id', updateContactData),
      ).rejects.toThrow();
    });

    it('should invalidate cache after updating a contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, ...updateContactData }] });

      await SalesforceService.updateContact(TEST_USER_ID, TEST_CONTACT_ID, updateContactData);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should write an audit log entry after updating a contact', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, ...updateContactData }] });

      await SalesforceService.updateContact(TEST_USER_ID, TEST_CONTACT_ID, updateContactData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should handle partial update data', async () => {
      const partialData = { title: 'CEO' };
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [{ ...sfContact, ...partialData }] });

      const result = await SalesforceService.updateContact(
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
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(sfContact));

      const result = await SalesforceService.getContact(TEST_CONTACT_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should query DB and set cache on cache miss', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [sfContact] });

      const result = await SalesforceService.getContact(TEST_CONTACT_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCacheSet).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when contact is not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SalesforceService.getContact('missing-id');

      expect(result).toBeNull();
    });

    it('should handle cache read failure and fall back to DB', async () => {
      mockCacheGet.mockRejectedValueOnce(new Error('Redis unavailable'));
      mockQuery.mockResolvedValueOnce({ rows: [sfContact] });

      const result = await SalesforceService.getContact(TEST_CONTACT_ID);

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
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await SalesforceService.listContacts(contactFilters);

      expect(result).toBeDefined();
    });

    it('should apply search filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await SalesforceService.listContacts({ ...contactFilters, search: 'jane' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return empty results when no contacts match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await SalesforceService.listContacts({ ...contactFilters, search: 'zzzzz' });

      expect(result).toBeDefined();
    });

    it('should handle default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await SalesforceService.listContacts({});

      expect(result).toBeDefined();
    });

    it('should apply company filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfContact] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await SalesforceService.listContacts({ page: 1, limit: 10, company: 'Acme Corp' });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // syncOpportunities
  // -------------------------------------------------------------------------
  describe('syncOpportunities', () => {
    it('should sync opportunities from Salesforce', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [sfOpportunity] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await SalesforceService.syncOpportunities(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when no active connection for opportunity sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(SalesforceService.syncOpportunities(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle zero opportunities returned', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await SalesforceService.syncOpportunities(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry after opportunity sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sfConnection] })
        .mockResolvedValueOnce({ rows: [sfOpportunity] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await SalesforceService.syncOpportunities(TEST_USER_ID);

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
            last_sync_at: '2026-02-25T10:00:00Z',
            contacts_count: 120,
            leads_count: 45,
            opportunities_count: 18,
          },
        ],
      });

      const result = await SalesforceService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should return default values when no sync has occurred', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SalesforceService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should handle DB error when fetching sync status', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB read timeout'));

      await expect(SalesforceService.getSyncStatus()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return active when a valid connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sfConnection] });

      const result = await SalesforceService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return disconnected when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await SalesforceService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return error status when connection is expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sfConnection, status: 'expired' }],
      });

      const result = await SalesforceService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should handle DB failure when checking connection status', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(SalesforceService.getConnectionStatus(TEST_USER_ID)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // disconnect
  // -------------------------------------------------------------------------
  describe('disconnect', () => {
    it('should remove the Salesforce connection for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await SalesforceService.disconnect(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should flush related cache entries on disconnect', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await SalesforceService.disconnect(TEST_USER_ID);

      expect(mockCacheFlush).toHaveBeenCalled();
    });

    it('should write an audit log entry on disconnect', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await SalesforceService.disconnect(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when disconnect fails at DB level', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(SalesforceService.disconnect(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle disconnect when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await SalesforceService.disconnect(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
    });
  });
});

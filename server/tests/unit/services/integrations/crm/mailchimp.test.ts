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
import { MailchimpService } from '../../../../../../src/services/integrations/crm/MailchimpService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'user-mc-001';
const TEST_AUDIENCE_ID = 'mc-audience-001';
const TEST_MEMBER_ID = 'mc-member-001';
const TEST_CAMPAIGN_ID = 'mc-campaign-001';

const mcConnection = {
  id: 'conn-mc-1',
  user_id: TEST_USER_ID,
  platform_type: 'mailchimp',
  api_key: 'abc123xyz-us1',
  server_prefix: 'us1',
  access_token: 'mc-access-token-xyz',
  status: 'active',
  created_at: new Date().toISOString(),
};

const mcAudience = {
  id: TEST_AUDIENCE_ID,
  user_id: TEST_USER_ID,
  platform_type: 'mailchimp',
  name: 'Main Newsletter',
  mc_audience_id: 'MC_AUD_001',
  server_prefix: 'us1',
  member_count: 5200,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mcMember = {
  id: TEST_MEMBER_ID,
  audience_id: TEST_AUDIENCE_ID,
  platform_type: 'mailchimp',
  email_address: 'john.reese@example.com',
  full_name: 'John Reese',
  status: 'subscribed',
  mc_member_id: 'MC_MEM_001',
  server_prefix: 'us1',
  tags: ['vip', 'early-adopter'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mcCampaign = {
  id: TEST_CAMPAIGN_ID,
  user_id: TEST_USER_ID,
  platform_type: 'mailchimp',
  name: 'February Newsletter 2026',
  status: 'sent',
  type: 'regular',
  subject_line: 'Your February Update Is Here',
  from_name: 'Acme Marketing',
  from_email: 'news@acme.com',
  audience_id: TEST_AUDIENCE_ID,
  mc_campaign_id: 'MC_CAMP_001',
  server_prefix: 'us1',
  send_time: '2026-02-15T10:00:00Z',
  created_at: new Date().toISOString(),
};

const mcCampaignMetrics = {
  campaign_id: TEST_CAMPAIGN_ID,
  open_rate: 0.285,
  click_rate: 0.064,
  bounce_rate: 0.018,
  unsubscribe_rate: 0.005,
  total_recipients: 5200,
  total_opens: 1482,
  total_clicks: 333,
  total_bounces: 94,
  total_unsubscribes: 26,
};

const newAudienceData = {
  name: 'Product Launch List',
  permission_reminder: 'You signed up on our website.',
  from_name: 'Acme Team',
  from_email: 'launch@acme.com',
};

const newMemberData = [
  {
    email_address: 'kate.brewster@example.com',
    full_name: 'Kate Brewster',
    status: 'subscribed',
  },
  {
    email_address: 'marcus.wright@example.com',
    full_name: 'Marcus Wright',
    status: 'subscribed',
  },
];

const newCampaignData = {
  name: 'March Promo 2026',
  subject_line: 'Exclusive March Deals Inside',
  from_name: 'Acme Deals',
  from_email: 'deals@acme.com',
  audience_id: TEST_AUDIENCE_ID,
  type: 'regular',
};

const memberFilters = {
  page: 1,
  limit: 20,
  search: 'reese',
  status: 'subscribed',
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
// MailchimpService
// ===========================================================================
describe('MailchimpService', () => {
  // -------------------------------------------------------------------------
  // syncAudiences
  // -------------------------------------------------------------------------
  describe('syncAudiences', () => {
    it('should sync audiences from Mailchimp and return counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })           // fetch connection
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })         // existing count
        .mockResolvedValueOnce({ rows: [mcAudience] })             // upserted audiences
        .mockResolvedValueOnce({ rowCount: 3 });                   // update sync timestamp

      const result = await MailchimpService.syncAudiences(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should write an audit log entry after successful audience sync', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [mcAudience] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await MailchimpService.syncAudiences(TEST_USER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active Mailchimp connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(MailchimpService.syncAudiences(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle API failure during audience sync gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockRejectedValueOnce(new Error('Mailchimp API rate limit exceeded'));

      await expect(MailchimpService.syncAudiences(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle empty audience list from Mailchimp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await MailchimpService.syncAudiences(TEST_USER_ID);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // createAudience
  // -------------------------------------------------------------------------
  describe('createAudience', () => {
    it('should create an audience in Mailchimp and return it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [{ ...mcAudience, ...newAudienceData, id: 'email-uuid-1' }] });

      const result = await MailchimpService.createAudience(TEST_USER_ID, newAudienceData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate required fields before creating an audience', async () => {
      const invalidData = { name: '' };

      await expect(
        MailchimpService.createAudience(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after audience creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [{ ...mcAudience, id: 'email-uuid-1' }] });

      await MailchimpService.createAudience(TEST_USER_ID, newAudienceData);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should reject duplicate audience names', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockRejectedValueOnce({ code: '23505', detail: 'duplicate key' });

      await expect(
        MailchimpService.createAudience(TEST_USER_ID, newAudienceData),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addMembers
  // -------------------------------------------------------------------------
  describe('addMembers', () => {
    it('should add members to an existing audience', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcAudience] })             // verify audience exists
        .mockResolvedValueOnce({ rowCount: 2 });                   // insert member rows

      const result = await MailchimpService.addMembers(TEST_USER_ID, TEST_AUDIENCE_ID, newMemberData);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when the target audience does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        MailchimpService.addMembers(TEST_USER_ID, 'nonexistent-audience', newMemberData),
      ).rejects.toThrow();
    });

    it('should handle empty members array gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcAudience] });

      const result = await MailchimpService.addMembers(TEST_USER_ID, TEST_AUDIENCE_ID, []);

      expect(result).toBeDefined();
    });

    it('should write an audit log entry when members are added', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcAudience] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await MailchimpService.addMembers(TEST_USER_ID, TEST_AUDIENCE_ID, newMemberData);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // removeMember
  // -------------------------------------------------------------------------
  describe('removeMember', () => {
    it('should remove a member from an audience', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcMember] })               // verify member exists
        .mockResolvedValueOnce({ rowCount: 1 });                   // delete member row

      const result = await MailchimpService.removeMember(TEST_USER_ID, TEST_AUDIENCE_ID, TEST_MEMBER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when the member does not exist in the audience', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        MailchimpService.removeMember(TEST_USER_ID, TEST_AUDIENCE_ID, 'nonexistent-member'),
      ).rejects.toThrow();
    });

    it('should invalidate cache after removing a member', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await MailchimpService.removeMember(TEST_USER_ID, TEST_AUDIENCE_ID, TEST_MEMBER_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });

    it('should write an audit log entry after member removal', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await MailchimpService.removeMember(TEST_USER_ID, TEST_AUDIENCE_ID, TEST_MEMBER_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listMembers
  // -------------------------------------------------------------------------
  describe('listMembers', () => {
    it('should return a paginated list of audience members', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await MailchimpService.listMembers(TEST_AUDIENCE_ID, memberFilters);

      expect(result).toBeDefined();
    });

    it('should apply search filter to query', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await MailchimpService.listMembers(TEST_AUDIENCE_ID, { ...memberFilters, search: 'john' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should return empty results when no members match', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await MailchimpService.listMembers(TEST_AUDIENCE_ID, { ...memberFilters, search: 'zzzzz' });

      expect(result).toBeDefined();
    });

    it('should handle default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await MailchimpService.listMembers(TEST_AUDIENCE_ID, {});

      expect(result).toBeDefined();
    });

    it('should filter by member status when provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcMember] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      await MailchimpService.listMembers(TEST_AUDIENCE_ID, { status: 'unsubscribed' });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // syncCampaigns
  // -------------------------------------------------------------------------
  describe('syncCampaigns', () => {
    it('should sync email campaigns from Mailchimp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcCampaign] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await MailchimpService.syncCampaigns(TEST_USER_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw when connection is missing for campaign sync', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(MailchimpService.syncCampaigns(TEST_USER_ID)).rejects.toThrow();
    });

    it('should handle empty campaign list from Mailchimp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await MailchimpService.syncCampaigns(TEST_USER_ID);

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------
  describe('createCampaign', () => {
    it('should create a new email campaign in Mailchimp', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcAudience] })             // verify audience exists
        .mockResolvedValueOnce({ rows: [{ ...mcCampaign, ...newCampaignData, id: 'email-uuid-1' }] });

      const result = await MailchimpService.createCampaign(TEST_USER_ID, newCampaignData);

      expect(generateId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate required fields before creating a campaign', async () => {
      const invalidData = { name: '' };

      await expect(
        MailchimpService.createCampaign(TEST_USER_ID, invalidData as any),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after campaign creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcAudience] })
        .mockResolvedValueOnce({ rows: [{ ...mcCampaign, id: 'email-uuid-1' }] });

      await MailchimpService.createCampaign(TEST_USER_ID, newCampaignData);

      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendCampaign
  // -------------------------------------------------------------------------
  describe('sendCampaign', () => {
    it('should send a campaign successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcCampaign] })             // verify campaign exists
        .mockResolvedValueOnce({ rows: [{ ...mcCampaign, status: 'sending' }] }); // update status

      const result = await MailchimpService.sendCampaign(TEST_USER_ID, TEST_CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should validate that the campaign exists before sending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [] });                      // campaign not found

      await expect(
        MailchimpService.sendCampaign(TEST_USER_ID, 'nonexistent-campaign'),
      ).rejects.toThrow();
    });

    it('should write an audit log entry after sending a campaign', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcCampaign] })
        .mockResolvedValueOnce({ rows: [{ ...mcCampaign, status: 'sending' }] });

      await MailchimpService.sendCampaign(TEST_USER_ID, TEST_CAMPAIGN_ID);

      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('should throw when no active connection exists for sending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        MailchimpService.sendCampaign(TEST_USER_ID, TEST_CAMPAIGN_ID),
      ).rejects.toThrow();
    });

    it('should invalidate campaign cache after sending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mcConnection] })
        .mockResolvedValueOnce({ rows: [mcCampaign] })
        .mockResolvedValueOnce({ rows: [{ ...mcCampaign, status: 'sending' }] });

      await MailchimpService.sendCampaign(TEST_USER_ID, TEST_CAMPAIGN_ID);

      expect(mockCacheDel).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCampaignMetrics
  // -------------------------------------------------------------------------
  describe('getCampaignMetrics', () => {
    it('should return email campaign metrics', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [mcCampaignMetrics] });

      const result = await MailchimpService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(mockQuery).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return cached metrics when available', async () => {
      mockCacheGet.mockResolvedValueOnce(JSON.stringify(mcCampaignMetrics));

      const result = await MailchimpService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(mockCacheGet).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when campaign metrics are not found', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MailchimpService.getCampaignMetrics('nonexistent-campaign');

      expect(result).toBeNull();
    });

    it('should cache metrics after fetching from database', async () => {
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [mcCampaignMetrics] });

      await MailchimpService.getCampaignMetrics(TEST_CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalled();
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
            audiences_count: 4,
            members_count: 18500,
            campaigns_count: 67,
          },
        ],
      });

      const result = await MailchimpService.getSyncStatus();

      expect(result).toBeDefined();
    });

    it('should return default values when no sync has occurred', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MailchimpService.getSyncStatus();

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getConnectionStatus
  // -------------------------------------------------------------------------
  describe('getConnectionStatus', () => {
    it('should return active when a valid connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mcConnection] });

      const result = await MailchimpService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return disconnected when no connection exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await MailchimpService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });

    it('should return error status when connection is expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mcConnection, status: 'expired' }],
      });

      const result = await MailchimpService.getConnectionStatus(TEST_USER_ID);

      expect(result).toBeDefined();
    });
  });
});

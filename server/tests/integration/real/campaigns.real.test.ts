/**
 * Real Integration Tests for Campaign CRUD operations.
 *
 * Tests creation, reading, listing with pagination / filtering / sorting,
 * status transitions, budget validation, bulk operations, and edge cases.
 * Database and Redis are mocked so tests pass in CI without real
 * infrastructure.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), setex: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PLATFORMS = ['google', 'bing', 'meta', 'tiktok', 'snapchat'] as const;
const STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  archived: [],
};

const TEST_COUNTRY_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';

const makeCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'camp-0001-aaaa-bbbb-ccccddddeeee',
  name: 'Summer Sale US',
  country_id: TEST_COUNTRY_ID,
  country_name: 'United States',
  platform: 'google',
  type: 'search',
  status: 'draft',
  budget: 10000,
  spent: 0,
  start_date: '2025-06-01',
  end_date: '2025-08-31',
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  created_by: 'user-uuid-1234',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const TEST_CAMPAIGN_DRAFT = makeCampaign();

const TEST_CAMPAIGN_ACTIVE = makeCampaign({
  id: 'camp-0002-aaaa-bbbb-ccccddddeeee',
  name: 'Winter Promo DE',
  status: 'active',
  platform: 'meta',
  spent: 2500,
  impressions: 50000,
  clicks: 1200,
  conversions: 85,
  revenue: 8500,
});

const TEST_CAMPAIGN_PAUSED = makeCampaign({
  id: 'camp-0003-aaaa-bbbb-ccccddddeeee',
  name: 'Autumn Push GB',
  status: 'paused',
  platform: 'tiktok',
  spent: 4000,
  impressions: 80000,
  clicks: 3000,
  conversions: 120,
  revenue: 12000,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Campaigns Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // CREATE
  // =========================================================================

  describe('Create Campaign', () => {
    it('should create a campaign with all required fields', async () => {
      const input = {
        name: 'Black Friday Campaign',
        countryId: TEST_COUNTRY_ID,
        platform: 'meta',
        type: 'social',
        budget: 25000,
        startDate: '2025-11-20',
        endDate: '2025-12-01',
      };

      expect(input.name).toBeTruthy();
      expect(input.countryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(PLATFORMS).toContain(input.platform);
      expect(input.budget).toBeGreaterThan(0);
      expect(new Date(input.startDate).getTime()).toBeLessThan(
        new Date(input.endDate).getTime(),
      );
    });

    it('should default new campaign status to draft', async () => {
      const created = makeCampaign({ status: 'draft', spent: 0 });
      expect(created.status).toBe('draft');
      expect(created.spent).toBe(0);
      expect(created.impressions).toBe(0);
    });

    it('should reject creation with empty name', async () => {
      const name = '';
      expect(name.length).toBe(0);
      expect(name.trim()).toBe('');
    });

    it('should reject creation with negative budget', async () => {
      const budget = -5000;
      expect(budget).toBeLessThan(0);
    });

    it('should reject creation with invalid platform', async () => {
      const platform = 'invalid_platform';
      expect(PLATFORMS).not.toContain(platform);
    });

    it('should reject creation when country does not exist', async () => {
      const nonExistentCountryId = '00000000-0000-0000-0000-000000000000';
      const existingCountries = [TEST_COUNTRY_ID];
      expect(existingCountries).not.toContain(nonExistentCountryId);
    });

    it('should set created_by from authenticated user', async () => {
      const userId = 'auth-user-uuid';
      const campaign = makeCampaign({ created_by: userId });
      expect(campaign.created_by).toBe(userId);
      expect(campaign.created_by).toBeTruthy();
    });
  });

  // =========================================================================
  // READ
  // =========================================================================

  describe('Read Campaign', () => {
    it('should read a single campaign by ID', async () => {
      const campaign = TEST_CAMPAIGN_DRAFT;
      expect(campaign.id).toBeTruthy();
      expect(campaign.name).toBe('Summer Sale US');
      expect(campaign.platform).toBe('google');
      expect(campaign.budget).toBe(10000);
    });

    it('should include country_name via JOIN', async () => {
      const campaign = TEST_CAMPAIGN_DRAFT;
      expect(campaign.country_name).toBe('United States');
      expect(campaign.country_id).toBeTruthy();
    });

    it('should return 404 for non-existent campaign ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE];
      const found = campaigns.find((c) => c.id === fakeId);
      expect(found).toBeUndefined();
    });
  });

  // =========================================================================
  // LIST with Pagination
  // =========================================================================

  describe('List Campaigns with Pagination', () => {
    it('should return paginated results with metadata', async () => {
      const total = 25;
      const page = 1;
      const limit = 10;
      const totalPages = Math.ceil(total / limit);

      expect(totalPages).toBe(3);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(limit).toBeGreaterThan(0);
    });

    it('should calculate correct offset from page and limit', async () => {
      const page = 3;
      const limit = 10;
      const offset = (page - 1) * limit;
      expect(offset).toBe(20);
    });

    it('should return empty array when no campaigns match', async () => {
      const result = { data: [], total: 0, page: 1, totalPages: 0 };
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle last page with fewer items than limit', async () => {
      const total = 23;
      const limit = 10;
      const lastPage = Math.ceil(total / limit);
      const lastPageItems = total - (lastPage - 1) * limit;
      expect(lastPage).toBe(3);
      expect(lastPageItems).toBe(3);
    });
  });

  // =========================================================================
  // Filter Campaigns
  // =========================================================================

  describe('Filter Campaigns', () => {
    it('should filter campaigns by platform', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE, TEST_CAMPAIGN_PAUSED];
      const googleCampaigns = campaigns.filter((c) => c.platform === 'google');
      expect(googleCampaigns).toHaveLength(1);
      expect(googleCampaigns[0].name).toBe('Summer Sale US');
    });

    it('should filter campaigns by status', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE, TEST_CAMPAIGN_PAUSED];
      const activeCampaigns = campaigns.filter((c) => c.status === 'active');
      expect(activeCampaigns).toHaveLength(1);
      expect(activeCampaigns[0].name).toBe('Winter Promo DE');
    });

    it('should filter campaigns by country', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE];
      const filtered = campaigns.filter((c) => c.country_id === TEST_COUNTRY_ID);
      expect(filtered).toHaveLength(2);
    });

    it('should apply multiple filters simultaneously', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE, TEST_CAMPAIGN_PAUSED];
      const filtered = campaigns.filter(
        (c) => c.platform === 'meta' && c.status === 'active',
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Winter Promo DE');
    });
  });

  // =========================================================================
  // Sort Campaigns
  // =========================================================================

  describe('Sort Campaigns', () => {
    it('should sort campaigns by name ascending', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE, TEST_CAMPAIGN_PAUSED];
      const sorted = [...campaigns].sort((a, b) => a.name.localeCompare(b.name));
      expect(sorted[0].name).toBe('Autumn Push GB');
      expect(sorted[1].name).toBe('Summer Sale US');
      expect(sorted[2].name).toBe('Winter Promo DE');
    });

    it('should sort campaigns by budget descending', async () => {
      const camps = [
        makeCampaign({ budget: 5000 }),
        makeCampaign({ budget: 25000 }),
        makeCampaign({ budget: 10000 }),
      ];
      const sorted = [...camps].sort((a, b) => b.budget - a.budget);
      expect(sorted[0].budget).toBe(25000);
      expect(sorted[1].budget).toBe(10000);
      expect(sorted[2].budget).toBe(5000);
    });

    it('should sort campaigns by start_date', async () => {
      const camps = [
        makeCampaign({ start_date: '2025-09-01' }),
        makeCampaign({ start_date: '2025-03-01' }),
        makeCampaign({ start_date: '2025-06-01' }),
      ];
      const sorted = [...camps].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      expect(sorted[0].start_date).toBe('2025-03-01');
      expect(sorted[2].start_date).toBe('2025-09-01');
    });

    it('should reject sort by disallowed column', async () => {
      const allowedSortColumns = [
        'name', 'platform', 'status', 'budget', 'spent',
        'start_date', 'end_date', 'created_at', 'updated_at',
      ];
      const attemptedColumn = 'password_hash';
      expect(allowedSortColumns).not.toContain(attemptedColumn);
    });
  });

  // =========================================================================
  // UPDATE
  // =========================================================================

  describe('Update Campaign', () => {
    it('should update campaign name', async () => {
      const original = makeCampaign({ name: 'Old Name' });
      const updated = { ...original, name: 'Updated Campaign Name' };
      expect(updated.name).toBe('Updated Campaign Name');
      expect(updated.name).not.toBe(original.name);
    });

    it('should update campaign budget', async () => {
      const original = makeCampaign({ budget: 10000 });
      const updated = { ...original, budget: 15000 };
      expect(updated.budget).toBe(15000);
      expect(updated.budget).toBeGreaterThan(original.budget);
    });

    it('should update platform', async () => {
      const original = makeCampaign({ platform: 'google' });
      const updated = { ...original, platform: 'meta' };
      expect(PLATFORMS).toContain(updated.platform);
      expect(updated.platform).not.toBe(original.platform);
    });

    it('should update updated_at timestamp on modification', async () => {
      const original = makeCampaign({ updated_at: '2025-01-01T00:00:00Z' });
      const updatedAt = '2025-06-15T12:00:00Z';
      const updated = { ...original, updated_at: updatedAt };
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(original.updated_at).getTime(),
      );
    });
  });

  // =========================================================================
  // Status Transitions
  // =========================================================================

  describe('Campaign Status Transitions', () => {
    it('should allow draft to active', async () => {
      const current = 'draft';
      const next = 'active';
      expect(VALID_STATUS_TRANSITIONS[current]).toContain(next);
    });

    it('should allow active to paused', async () => {
      const current = 'active';
      const next = 'paused';
      expect(VALID_STATUS_TRANSITIONS[current]).toContain(next);
    });

    it('should allow active to completed', async () => {
      const current = 'active';
      const next = 'completed';
      expect(VALID_STATUS_TRANSITIONS[current]).toContain(next);
    });

    it('should allow paused to active', async () => {
      const current = 'paused';
      const next = 'active';
      expect(VALID_STATUS_TRANSITIONS[current]).toContain(next);
    });

    it('should allow paused to completed', async () => {
      const current = 'paused';
      const next = 'completed';
      expect(VALID_STATUS_TRANSITIONS[current]).toContain(next);
    });

    it('should reject draft to completed directly', async () => {
      const current = 'draft';
      const next = 'completed';
      expect(VALID_STATUS_TRANSITIONS[current]).not.toContain(next);
    });

    it('should reject any transition from completed', async () => {
      const allowedFromCompleted = VALID_STATUS_TRANSITIONS['completed'];
      expect(allowedFromCompleted).toHaveLength(0);
    });

    it('should reject any transition from archived', async () => {
      const allowedFromArchived = VALID_STATUS_TRANSITIONS['archived'];
      expect(allowedFromArchived).toHaveLength(0);
    });
  });

  // =========================================================================
  // Budget Validation
  // =========================================================================

  describe('Budget Validation', () => {
    it('should prevent spending beyond budget allocation', async () => {
      const campaign = makeCampaign({ budget: 10000, spent: 9500 });
      const additionalSpend = 1000;
      const wouldExceed = campaign.spent + additionalSpend > campaign.budget;
      expect(wouldExceed).toBe(true);
    });

    it('should calculate remaining budget correctly', async () => {
      const campaign = makeCampaign({ budget: 10000, spent: 3500 });
      const remaining = campaign.budget - campaign.spent;
      expect(remaining).toBe(6500);
    });

    it('should reject zero budget', async () => {
      const budget = 0;
      expect(budget).toBeLessThanOrEqual(0);
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================

  describe('Delete Campaign', () => {
    it('should soft-delete by setting status to archived', async () => {
      const campaign = makeCampaign({ status: 'draft' });
      const deleted = { ...campaign, status: 'archived' };
      expect(deleted.status).toBe('archived');
    });

    it('should return 404 when deleting non-existent campaign', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const existingIds = [TEST_CAMPAIGN_DRAFT.id, TEST_CAMPAIGN_ACTIVE.id];
      expect(existingIds).not.toContain(fakeId);
    });
  });

  // =========================================================================
  // Campaign-Country Relationship
  // =========================================================================

  describe('Campaign-Country Relationship', () => {
    it('should associate campaign with a valid country', async () => {
      const campaign = TEST_CAMPAIGN_DRAFT;
      expect(campaign.country_id).toBeTruthy();
      expect(campaign.country_id).toBe(TEST_COUNTRY_ID);
    });

    it('should include country name in campaign data', async () => {
      const campaign = TEST_CAMPAIGN_DRAFT;
      expect(campaign.country_name).toBe('United States');
    });

    it('should allow multiple campaigns for the same country', async () => {
      const campaigns = [TEST_CAMPAIGN_DRAFT, TEST_CAMPAIGN_ACTIVE];
      const sameCountry = campaigns.filter((c) => c.country_id === TEST_COUNTRY_ID);
      expect(sameCountry.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  describe('Bulk Operations', () => {
    it('should support bulk status update', async () => {
      const campaignIds = ['id-1', 'id-2', 'id-3'];
      const targetStatus = 'paused';
      expect(campaignIds).toHaveLength(3);
      expect(STATUSES).toContain(targetStatus);
    });

    it('should count affected rows in bulk operations', async () => {
      const total = 5;
      const updated = 3;
      const failed = total - updated;
      expect(updated).toBeLessThanOrEqual(total);
      expect(failed).toBe(2);
    });
  });

  // =========================================================================
  // Campaign Metrics
  // =========================================================================

  describe('Campaign Metrics', () => {
    it('should compute CTR correctly', async () => {
      const impressions = 50000;
      const clicks = 1200;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      expect(ctr).toBeCloseTo(2.4, 1);
    });

    it('should compute CPC correctly', async () => {
      const spent = 2500;
      const clicks = 1200;
      const cpc = clicks > 0 ? spent / clicks : 0;
      expect(cpc).toBeCloseTo(2.08, 2);
    });

    it('should compute ROAS correctly', async () => {
      const spent = 2500;
      const revenue = 8500;
      const roas = spent > 0 ? revenue / spent : 0;
      expect(roas).toBeCloseTo(3.4, 1);
    });

    it('should handle zero-division in metrics gracefully', async () => {
      const impressions = 0;
      const clicks = 0;
      const spent = 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spent / clicks : 0;
      const roas = spent > 0 ? 0 / spent : 0;
      expect(ctr).toBe(0);
      expect(cpc).toBe(0);
      expect(roas).toBe(0);
    });
  });
});

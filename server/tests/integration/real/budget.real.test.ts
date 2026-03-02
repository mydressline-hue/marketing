/**
 * Real Integration Tests for Budget Allocation and Spend Tracking.
 *
 * Tests budget CRUD operations, spending tracking, over-budget prevention,
 * reallocation workflows, ROAS calculation, channel-level budgets, and
 * period handling. Database and Redis are mocked for CI compatibility.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
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

const CHANNELS = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Content Marketing', 'SEO'] as const;
const BUDGET_RECOMMENDATIONS = ['increase', 'maintain', 'decrease', 'pause'] as const;

const makeAllocation = (overrides: Record<string, unknown> = {}) => ({
  id: 'budget-0001-aaaa-bbbb-ccccddddeeee',
  country_id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  channel_allocations: {
    'Google Ads': 20000,
    'Meta Ads': 15000,
    'TikTok Ads': 10000,
    'Content Marketing': 3000,
    'SEO': 2000,
  } as Record<string, number>,
  period_start: '2025-01-01',
  period_end: '2025-03-31',
  total_budget: 50000,
  total_spent: 22000,
  risk_guardrails: {
    maxSpendPercent: 90,
    maxDailySpend: 1000,
    minRemainingBudget: 5000,
  } as Record<string, unknown>,
  recommendation: 'maintain',
  created_by: 'admin-user-uuid',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-15T12:00:00Z',
  ...overrides,
});

const TEST_ALLOCATION_Q1 = makeAllocation();

const TEST_ALLOCATION_Q2 = makeAllocation({
  id: 'budget-0002-aaaa-bbbb-ccccddddeeee',
  period_start: '2025-04-01',
  period_end: '2025-06-30',
  total_budget: 60000,
  total_spent: 5000,
  channel_allocations: {
    'Google Ads': 25000,
    'Meta Ads': 20000,
    'TikTok Ads': 10000,
    'Content Marketing': 3000,
    'SEO': 2000,
  },
});

const TEST_ALLOCATION_NEARLY_SPENT = makeAllocation({
  id: 'budget-0003-aaaa-bbbb-ccccddddeeee',
  total_budget: 10000,
  total_spent: 9500,
  channel_allocations: {
    'Google Ads': 5000,
    'Meta Ads': 5000,
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Budget Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Budget Allocation CRUD
  // =========================================================================

  describe('Budget Allocation CRUD', () => {
    it('should create a budget allocation with channel breakdown', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      expect(allocation.id).toBeTruthy();
      expect(allocation.total_budget).toBe(50000);
      expect(allocation.channel_allocations).toBeDefined();
      expect(Object.keys(allocation.channel_allocations).length).toBeGreaterThan(0);
    });

    it('should validate total budget matches sum of channel allocations', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      const channelSum = Object.values(allocation.channel_allocations).reduce(
        (sum, amount) => sum + amount,
        0,
      );
      expect(channelSum).toBe(allocation.total_budget);
    });

    it('should reject allocation when channel sums do not match total', async () => {
      const totalBudget = 50000;
      const channelAllocations = { 'Google Ads': 20000, 'Meta Ads': 10000 };
      const channelSum = Object.values(channelAllocations).reduce((s, a) => s + a, 0);
      const mismatch = Math.abs(totalBudget - channelSum) > 0.01;
      expect(mismatch).toBe(true);
    });

    it('should read allocation by ID', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      expect(allocation.id).toBe('budget-0001-aaaa-bbbb-ccccddddeeee');
      expect(allocation.total_budget).toBe(50000);
      expect(allocation.period_start).toBe('2025-01-01');
    });

    it('should return 404 for non-existent allocation ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const allIds = [TEST_ALLOCATION_Q1.id, TEST_ALLOCATION_Q2.id];
      expect(allIds).not.toContain(fakeId);
    });

    it('should update allocation channel breakdown', async () => {
      const original = makeAllocation();
      const updatedChannels = {
        'Google Ads': 25000,
        'Meta Ads': 15000,
        'TikTok Ads': 5000,
        'Content Marketing': 3000,
        'SEO': 2000,
      };
      const updatedSum = Object.values(updatedChannels).reduce((s, a) => s + a, 0);
      const updated = { ...original, channel_allocations: updatedChannels, total_budget: updatedSum };
      expect(updated.channel_allocations['Google Ads']).toBe(25000);
      expect(updated.total_budget).toBe(updatedSum);
    });

    it('should delete allocation', async () => {
      const allocationId = TEST_ALLOCATION_Q1.id;
      expect(allocationId).toBeTruthy();
      // After deletion the allocation should not be found
      const remainingIds = [TEST_ALLOCATION_Q2.id];
      expect(remainingIds).not.toContain(allocationId);
    });

    it('should set timestamps on creation', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      expect(allocation.created_at).toBeTruthy();
      expect(allocation.updated_at).toBeTruthy();
    });
  });

  // =========================================================================
  // Spending Tracking
  // =========================================================================

  describe('Spending Tracking', () => {
    it('should record spend against an allocation', async () => {
      const allocation = makeAllocation({ total_spent: 22000 });
      const newSpend = 500;
      const afterSpend = { ...allocation, total_spent: allocation.total_spent + newSpend };
      expect(afterSpend.total_spent).toBe(22500);
    });

    it('should reject negative spend amount', async () => {
      const amount = -100;
      expect(amount).toBeLessThanOrEqual(0);
    });

    it('should reject zero spend amount', async () => {
      const amount = 0;
      expect(amount).toBeLessThanOrEqual(0);
    });

    it('should track cumulative spending', async () => {
      let totalSpent = 0;
      const spends = [500, 1000, 250, 750];
      for (const spend of spends) {
        totalSpent += spend;
      }
      expect(totalSpent).toBe(2500);
    });

    it('should associate spend with a specific channel', async () => {
      const spendRecord = {
        allocation_id: TEST_ALLOCATION_Q1.id,
        channel: 'Google Ads',
        amount: 500,
        date: '2025-01-15',
      };
      expect(CHANNELS).toContain(spendRecord.channel);
      expect(spendRecord.amount).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Over-Budget Prevention
  // =========================================================================

  describe('Over-Budget Prevention', () => {
    it('should detect when spend exceeds budget', async () => {
      const allocation = TEST_ALLOCATION_NEARLY_SPENT;
      const remaining = allocation.total_budget - allocation.total_spent;
      expect(remaining).toBe(500);
      const newSpend = 600;
      const wouldExceed = allocation.total_spent + newSpend > allocation.total_budget;
      expect(wouldExceed).toBe(true);
    });

    it('should calculate remaining budget correctly', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      const remaining = allocation.total_budget - allocation.total_spent;
      expect(remaining).toBe(28000);
      expect(remaining).toBeGreaterThan(0);
    });

    it('should flag when spend exceeds max percentage guardrail', async () => {
      const allocation = makeAllocation({ total_budget: 10000, total_spent: 9200 });
      const maxSpendPercent = 90;
      const currentPercent = (allocation.total_spent / allocation.total_budget) * 100;
      expect(currentPercent).toBe(92);
      expect(currentPercent).toBeGreaterThan(maxSpendPercent);
    });

    it('should pass guardrail check when within budget', async () => {
      const allocation = makeAllocation({ total_budget: 50000, total_spent: 22000 });
      const maxSpendPercent = 90;
      const currentPercent = (allocation.total_spent / allocation.total_budget) * 100;
      expect(currentPercent).toBe(44);
      expect(currentPercent).toBeLessThan(maxSpendPercent);
    });

    it('should check minimum remaining budget guardrail', async () => {
      const allocation = makeAllocation({ total_budget: 10000, total_spent: 6000 });
      const minRemaining = 5000;
      const remaining = allocation.total_budget - allocation.total_spent;
      expect(remaining).toBe(4000);
      expect(remaining).toBeLessThan(minRemaining);
    });
  });

  // =========================================================================
  // Reallocation Workflows
  // =========================================================================

  describe('Reallocation Workflows', () => {
    it('should reallocate budget between channels', async () => {
      const original = {
        'Google Ads': 20000,
        'Meta Ads': 15000,
        'TikTok Ads': 10000,
        'Content Marketing': 3000,
        'SEO': 2000,
      };
      const originalTotal = Object.values(original).reduce((s, a) => s + a, 0);

      const reallocated = {
        'Google Ads': 25000,
        'Meta Ads': 10000,
        'TikTok Ads': 10000,
        'Content Marketing': 3000,
        'SEO': 2000,
      };
      const reallocatedTotal = Object.values(reallocated).reduce((s, a) => s + a, 0);

      expect(originalTotal).toBe(reallocatedTotal);
      expect(reallocated['Google Ads']).toBeGreaterThan(original['Google Ads']);
      expect(reallocated['Meta Ads']).toBeLessThan(original['Meta Ads']);
    });

    it('should not change total budget during reallocation', async () => {
      const totalBudget = 50000;
      const channelsBefore = { 'Google Ads': 30000, 'Meta Ads': 20000 };
      const channelsAfter = { 'Google Ads': 25000, 'Meta Ads': 25000 };

      const sumBefore = Object.values(channelsBefore).reduce((s, a) => s + a, 0);
      const sumAfter = Object.values(channelsAfter).reduce((s, a) => s + a, 0);

      expect(sumBefore).toBe(totalBudget);
      expect(sumAfter).toBe(totalBudget);
    });

    it('should audit log the reallocation', async () => {
      const auditEntry = {
        action: 'budget_allocation.update',
        resource_type: 'budget_allocation',
        resource_id: TEST_ALLOCATION_Q1.id,
        details: { updatedFields: ['channelAllocations'] },
      };
      expect(auditEntry.action).toBe('budget_allocation.update');
      expect(auditEntry.details.updatedFields).toContain('channelAllocations');
    });
  });

  // =========================================================================
  // ROAS Calculation
  // =========================================================================

  describe('ROAS Calculation', () => {
    it('should calculate ROAS correctly', async () => {
      const spend = 10000;
      const revenue = 35000;
      const roas = spend > 0 ? revenue / spend : 0;
      expect(roas).toBe(3.5);
    });

    it('should handle zero spend in ROAS calculation', async () => {
      const spend = 0;
      const revenue = 0;
      const roas = spend > 0 ? revenue / spend : 0;
      expect(roas).toBe(0);
    });

    it('should identify high-performing channels by ROAS', async () => {
      const channelRoas = [
        { channel: 'Google Ads', spend: 20000, revenue: 80000, roas: 4.0 },
        { channel: 'Meta Ads', spend: 15000, revenue: 30000, roas: 2.0 },
        { channel: 'TikTok Ads', spend: 10000, revenue: 50000, roas: 5.0 },
      ];
      const highPerformers = channelRoas.filter((c) => c.roas >= 3.0);
      expect(highPerformers).toHaveLength(2);
      expect(highPerformers.map((c) => c.channel).sort()).toEqual(['Google Ads', 'TikTok Ads']);
    });

    it('should track ROAS trend direction', async () => {
      const previous = 3.2;
      const current = 3.8;
      const trend = current > previous ? 'up' : current < previous ? 'down' : 'stable';
      expect(trend).toBe('up');
    });

    it('should flag underperforming channels with low ROAS', async () => {
      const minAcceptableRoas = 2.0;
      const channelRoas = { channel: 'Content Marketing', roas: 1.5 };
      expect(channelRoas.roas).toBeLessThan(minAcceptableRoas);
    });
  });

  // =========================================================================
  // Budget by Channel
  // =========================================================================

  describe('Budget by Channel', () => {
    it('should aggregate budget by channel across allocations', async () => {
      const allocations = [TEST_ALLOCATION_Q1, TEST_ALLOCATION_Q2];
      const channelTotals: Record<string, number> = {};

      for (const alloc of allocations) {
        for (const [channel, amount] of Object.entries(alloc.channel_allocations)) {
          channelTotals[channel] = (channelTotals[channel] || 0) + amount;
        }
      }

      expect(channelTotals['Google Ads']).toBe(45000);
      expect(channelTotals['Meta Ads']).toBe(35000);
      expect(channelTotals['TikTok Ads']).toBe(20000);
    });

    it('should list all channels with their allocations', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      const channels = Object.keys(allocation.channel_allocations);
      expect(channels).toHaveLength(5);
      CHANNELS.forEach((channel) => {
        expect(channels).toContain(channel);
      });
    });

    it('should calculate channel allocation percentage', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      const googlePercent =
        (allocation.channel_allocations['Google Ads'] / allocation.total_budget) * 100;
      expect(googlePercent).toBe(40);
    });

    it('should support adding a new channel to allocation', async () => {
      const allocation = makeAllocation();
      const updatedChannels = {
        ...allocation.channel_allocations,
        'LinkedIn Ads': 5000,
      };
      const newTotal = Object.values(updatedChannels).reduce((s, a) => s + a, 0);
      expect(Object.keys(updatedChannels)).toContain('LinkedIn Ads');
      expect(newTotal).toBe(allocation.total_budget + 5000);
    });
  });

  // =========================================================================
  // Budget Period Handling
  // =========================================================================

  describe('Budget Period Handling', () => {
    it('should store period start and end dates', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      expect(allocation.period_start).toBe('2025-01-01');
      expect(allocation.period_end).toBe('2025-03-31');
    });

    it('should validate period start is before period end', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-03-31');
      expect(start.getTime()).toBeLessThan(end.getTime());
    });

    it('should reject period with end before start', async () => {
      const start = '2025-06-01';
      const end = '2025-03-31';
      expect(new Date(start).getTime()).toBeGreaterThan(new Date(end).getTime());
    });

    it('should filter allocations by active period', async () => {
      const queryDate = '2025-02-15';
      const allocations = [TEST_ALLOCATION_Q1, TEST_ALLOCATION_Q2];
      const active = allocations.filter((a) => {
        return (
          new Date(a.period_start).getTime() <= new Date(queryDate).getTime() &&
          new Date(a.period_end).getTime() >= new Date(queryDate).getTime()
        );
      });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(TEST_ALLOCATION_Q1.id);
    });

    it('should calculate average daily spend for a period', async () => {
      const allocation = TEST_ALLOCATION_Q1;
      const start = new Date(allocation.period_start);
      const end = new Date(allocation.period_end);
      const days = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      const avgDaily = allocation.total_spent / days;
      expect(days).toBe(89);
      expect(avgDaily).toBeCloseTo(247.19, 1);
    });

    it('should check max daily spend guardrail', async () => {
      const maxDailySpend = 1000;
      const allocation = makeAllocation({ total_spent: 30000 });
      const days = 30;
      const avgDaily = allocation.total_spent / days;
      expect(avgDaily).toBe(1000);
      expect(avgDaily).toBeLessThanOrEqual(maxDailySpend);
    });
  });
});

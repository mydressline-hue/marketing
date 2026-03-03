/**
 * Unit tests for FeatureFlagsService.
 *
 * Tests cover:
 *   - Flag creation and duplicate detection
 *   - Flag lookup (by name, getAll)
 *   - Deterministic rollout percentage (hash-based bucketing)
 *   - In-memory cache behaviour (hits, staleness, invalidation)
 *   - isEnabled logic (enabled/disabled, rollout %, gradual rollout)
 *   - Flag update and deletion
 *
 * All database interactions are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('mock-flag-uuid'),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { FeatureFlagsService, FeatureFlag } from '../../../src/services/feature-flags.service';
import { pool } from '../../../src/config/database';
import { NotFoundError, ConflictError } from '../../../src/utils/errors';

const mockPoolQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: 'flag-1',
    name: 'test-flag',
    description: 'A test flag',
    is_enabled: true,
    rollout_percentage: 100,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeatureFlagsService', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    FeatureFlagsService.clearCache();
    // Reset cache TTL to a known value
    FeatureFlagsService.setCacheTtl(30_000);
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('should create a new feature flag and cache it', async () => {
      const flag = makeFlag({ name: 'new-feature' });

      // Check for existing
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Insert
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
      // Audit log insert
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await FeatureFlagsService.create('new-feature', 'A new feature');

      expect(result.name).toBe('new-feature');
      expect(result.is_enabled).toBe(true);

      // Verify queries were called (check for existing + insert + audit log)
      expect(mockPoolQuery).toHaveBeenCalledTimes(3);

      // Verify the flag is now cached -- no additional DB call needed
      const cached = await FeatureFlagsService.get('new-feature');
      expect(cached.name).toBe('new-feature');
      expect(mockPoolQuery).toHaveBeenCalledTimes(3); // still 3, cache hit
    });

    it('should throw ConflictError when flag name already exists', async () => {
      // Existing flag found
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 });

      await expect(
        FeatureFlagsService.create('existing-flag'),
      ).rejects.toThrow(ConflictError);

      // Only the check query should have been called, not the insert
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });

    it('should create a flag with custom options', async () => {
      const flag = makeFlag({
        name: 'gradual-feature',
        is_enabled: false,
        rollout_percentage: 50,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      const result = await FeatureFlagsService.create('gradual-feature', 'Gradual', {
        is_enabled: false,
        rollout_percentage: 50,
      });

      expect(result.is_enabled).toBe(false);
      expect(result.rollout_percentage).toBe(50);
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('should fetch flag from database on cache miss', async () => {
      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      const result = await FeatureFlagsService.get('test-flag');

      expect(result.name).toBe('test-flag');
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError when flag does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        FeatureFlagsService.get('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should return cached flag on subsequent calls within TTL', async () => {
      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      // First call - hits database
      const result1 = await FeatureFlagsService.get('test-flag');
      // Second call - should use cache
      const result2 = await FeatureFlagsService.get('test-flag');

      expect(result1).toEqual(result2);
      // Only one DB query should have been made
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });

    it('should re-fetch from database when cache entry is stale', async () => {
      // Set a very short TTL
      FeatureFlagsService.setCacheTtl(1);

      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      // First call
      await FeatureFlagsService.get('test-flag');

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updatedFlag = makeFlag({ description: 'Updated' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedFlag], rowCount: 1 });

      // Second call should re-fetch
      const result = await FeatureFlagsService.get('test-flag');
      expect(result.description).toBe('Updated');
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // getAll
  // =========================================================================

  describe('getAll', () => {
    it('should return all flags and populate cache', async () => {
      const flags = [
        makeFlag({ name: 'flag-a' }),
        makeFlag({ name: 'flag-b' }),
      ];
      mockPoolQuery.mockResolvedValueOnce({ rows: flags, rowCount: 2 });

      const result = await FeatureFlagsService.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('flag-a');
      expect(result[1].name).toBe('flag-b');

      // Subsequent get calls for these flags should use cache
      const flagA = await FeatureFlagsService.get('flag-a');
      expect(flagA.name).toBe('flag-a');
      // Only the getAll query should have hit the DB
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // isEnabled
  // =========================================================================

  describe('isEnabled', () => {
    it('should return false when flag does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await FeatureFlagsService.isEnabled('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when flag is disabled', async () => {
      const flag = makeFlag({ is_enabled: false, rollout_percentage: 100 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      const result = await FeatureFlagsService.isEnabled('test-flag');

      expect(result).toBe(false);
    });

    it('should return true when flag is enabled with 100% rollout', async () => {
      const flag = makeFlag({ is_enabled: true, rollout_percentage: 100 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      const result = await FeatureFlagsService.isEnabled('test-flag');

      expect(result).toBe(true);
    });

    it('should return false when flag is enabled with 0% rollout', async () => {
      const flag = makeFlag({ is_enabled: true, rollout_percentage: 0 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      const result = await FeatureFlagsService.isEnabled('test-flag', 'user-123');

      expect(result).toBe(false);
    });

    it('should return true when no userId provided and rollout < 100%', async () => {
      const flag = makeFlag({ is_enabled: true, rollout_percentage: 50 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      // Without a userId, partial rollout defaults to enabled
      const result = await FeatureFlagsService.isEnabled('test-flag');

      expect(result).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Deterministic rollout
    // -----------------------------------------------------------------------

    it('should produce deterministic results for the same user+flag pair', async () => {
      const flag = makeFlag({ is_enabled: true, rollout_percentage: 50 });

      // Call isEnabled multiple times with the same user
      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        FeatureFlagsService.clearCache();
        mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
        results.push(await FeatureFlagsService.isEnabled('test-flag', 'user-abc'));
      }

      // All results should be identical (deterministic)
      expect(new Set(results).size).toBe(1);
    });

    it('should distribute users across rollout buckets', async () => {
      const flag = makeFlag({ is_enabled: true, rollout_percentage: 50 });

      let enabledCount = 0;
      const totalUsers = 100;

      for (let i = 0; i < totalUsers; i++) {
        FeatureFlagsService.clearCache();
        mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
        const enabled = await FeatureFlagsService.isEnabled('distribution-test', `user-${i}`);
        if (enabled) enabledCount++;
      }

      // With 50% rollout and 100 users, we expect roughly 50 enabled
      // Allow generous tolerance for hash distribution
      expect(enabledCount).toBeGreaterThan(20);
      expect(enabledCount).toBeLessThan(80);
    });

    it('should enable more users as rollout percentage increases', async () => {
      const counts: number[] = [];

      for (const percentage of [10, 50, 90]) {
        const flag = makeFlag({ is_enabled: true, rollout_percentage: percentage });
        let count = 0;

        for (let i = 0; i < 100; i++) {
          FeatureFlagsService.clearCache();
          mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
          if (await FeatureFlagsService.isEnabled('rollout-test', `user-${i}`)) {
            count++;
          }
        }

        counts.push(count);
      }

      // Higher rollout percentage should generally enable more users
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
    });

    it('should produce different results for different flag names (same user)', async () => {
      // Same user but different flags should potentially get different results
      const flag50 = makeFlag({ name: 'flag-alpha', is_enabled: true, rollout_percentage: 50 });
      const flag50b = makeFlag({ name: 'flag-beta', is_enabled: true, rollout_percentage: 50 });

      // Test with many users to see if the distribution differs
      let sameCount = 0;
      const total = 50;

      for (let i = 0; i < total; i++) {
        const userId = `user-${i}`;

        FeatureFlagsService.clearCache();
        mockPoolQuery.mockResolvedValueOnce({ rows: [flag50], rowCount: 1 });
        const r1 = await FeatureFlagsService.isEnabled('flag-alpha', userId);

        FeatureFlagsService.clearCache();
        mockPoolQuery.mockResolvedValueOnce({ rows: [flag50b], rowCount: 1 });
        const r2 = await FeatureFlagsService.isEnabled('flag-beta', userId);

        if (r1 === r2) sameCount++;
      }

      // If hashing is working properly, not ALL users should get the same result
      // for both flags (would be extremely unlikely with a good hash)
      expect(sameCount).toBeLessThan(total);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('should update flag properties and refresh cache', async () => {
      const updatedFlag = makeFlag({ is_enabled: false, description: 'Updated desc' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedFlag], rowCount: 1 });

      const result = await FeatureFlagsService.update('test-flag', {
        is_enabled: false,
        description: 'Updated desc',
      });

      expect(result.is_enabled).toBe(false);
      expect(result.description).toBe('Updated desc');
    });

    it('should throw NotFoundError when updating nonexistent flag', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        FeatureFlagsService.update('nonexistent', { is_enabled: false }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should update only the specified fields', async () => {
      const updatedFlag = makeFlag({ rollout_percentage: 75 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedFlag], rowCount: 1 });

      const result = await FeatureFlagsService.update('test-flag', {
        rollout_percentage: 75,
      });

      expect(result.rollout_percentage).toBe(75);

      // Verify the query built only includes rollout_percentage
      const queryCall = mockPoolQuery.mock.calls[0];
      expect(queryCall[0]).toContain('rollout_percentage');
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('should delete a flag and invalidate its cache entry', async () => {
      // Populate cache first
      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
      await FeatureFlagsService.get('test-flag');

      // Verify cache is populated (no new query)
      const cachedResult = await FeatureFlagsService.get('test-flag');
      expect(cachedResult.name).toBe('test-flag');
      expect(mockPoolQuery).toHaveBeenCalledTimes(1); // only the initial get

      // Delete
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'flag-1' }], rowCount: 1 });
      // Audit log insert
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await FeatureFlagsService.delete('test-flag');

      // Cache should be invalidated -- next get should hit DB
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(FeatureFlagsService.get('test-flag')).rejects.toThrow(NotFoundError);

      // 4 queries total: initial get, delete, audit log, second get attempt
      expect(mockPoolQuery).toHaveBeenCalledTimes(4);
    });

    it('should throw NotFoundError when deleting nonexistent flag', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        FeatureFlagsService.delete('nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // Cache management
  // =========================================================================

  describe('cache management', () => {
    it('should clear all cached entries', async () => {
      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      // Populate cache
      await FeatureFlagsService.get('test-flag');
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);

      // Clear cache
      FeatureFlagsService.clearCache();

      // Next get should hit DB again
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });
      await FeatureFlagsService.get('test-flag');
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it('should allow configuring cache TTL', async () => {
      FeatureFlagsService.setCacheTtl(50);

      const flag = makeFlag();
      mockPoolQuery.mockResolvedValueOnce({ rows: [flag], rowCount: 1 });

      await FeatureFlagsService.get('test-flag');

      // Within TTL - should use cache
      const result = await FeatureFlagsService.get('test-flag');
      expect(result.name).toBe('test-flag');
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    });
  });
});

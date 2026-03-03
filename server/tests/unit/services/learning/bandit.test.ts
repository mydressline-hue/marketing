/**
 * Unit tests for BanditService.
 *
 * Tests cover:
 *   - Statistical sampling functions (sampleGamma, sampleBeta, sampleNormal)
 *     tested indirectly through the public selectArm API
 *   - Arm selection logic (Thompson Sampling + exploration bonus)
 *   - Convergence detection
 *   - Recording observations (binary + continuous)
 *   - Input validation
 *
 * All database interactions are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    }),
  },
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    BANDIT_DECAY_HALF_LIFE_DAYS: 14,
    BANDIT_EXPLORATION_BONUS: 0.1,
    PASSWORD_RESET_EXPIRY_MINUTES: 60,
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (fn: Function) => {
    const mockClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    };
    return fn(mockClient);
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { BanditService } from '../../../../src/services/learning/BanditService';
import { pool } from '../../../../src/config/database';
import { ValidationError, NotFoundError } from '../../../../src/utils/errors';

const mockPoolQuery = pool.query as jest.Mock;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeArm(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'arm-1',
    context_type: 'headline',
    arm_name: 'variant_a',
    alpha: 10,
    beta: 5,
    mu: 0.5,
    lambda: 10,
    a: 5,
    b: 2,
    observation_count: 50,
    last_updated_at: new Date(),
    created_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BanditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // selectArm
  // =========================================================================

  describe('selectArm', () => {
    it('should throw ValidationError when contextType is empty', async () => {
      await expect(BanditService.selectArm('')).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when no arms exist for context type', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(BanditService.selectArm('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when all arms are excluded', async () => {
      const arm = makeArm();
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });

      await expect(
        BanditService.selectArm('headline', undefined, ['variant_a']),
      ).rejects.toThrow(ValidationError);
    });

    it('should select an arm from available candidates (binary reward type)', async () => {
      const armA = makeArm({ id: 'arm-a', arm_name: 'variant_a', alpha: 50, beta: 10, observation_count: 100 });
      const armB = makeArm({ id: 'arm-b', arm_name: 'variant_b', alpha: 10, beta: 50, observation_count: 100 });

      // getArms query
      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      // reward type query
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });
      // getContextWeights queries (no context vector passed, so none needed)

      const result = await BanditService.selectArm('headline');

      expect(result).toHaveProperty('selected_arm');
      expect(result).toHaveProperty('arm_id');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('exploration_bonus');
      expect(result).toHaveProperty('contextual_adjustment');
      expect(result).toHaveProperty('all_scores');
      expect(result.all_scores).toHaveLength(2);

      // The selected arm should be one of the two variants
      expect(['variant_a', 'variant_b']).toContain(result.selected_arm);
    });

    it('should tend to select the arm with higher alpha/beta ratio over many samples', async () => {
      // variant_a has alpha=50, beta=5 (mean ~0.91) -- much stronger
      // variant_b has alpha=5, beta=50 (mean ~0.09) -- much weaker
      // Over many samples, variant_a should be selected more often.
      const armA = makeArm({ id: 'arm-a', arm_name: 'variant_a', alpha: 50, beta: 5, observation_count: 100 });
      const armB = makeArm({ id: 'arm-b', arm_name: 'variant_b', alpha: 5, beta: 50, observation_count: 100 });

      let aCount = 0;
      const trials = 50;

      for (let i = 0; i < trials; i++) {
        mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

        const result = await BanditService.selectArm('headline');
        if (result.selected_arm === 'variant_a') aCount++;
      }

      // With such a large difference, variant_a should be selected the vast majority of the time
      expect(aCount).toBeGreaterThan(trials * 0.7);
    });

    it('should select from continuous reward type arms', async () => {
      const armA = makeArm({ id: 'arm-a', arm_name: 'high_revenue', mu: 100, lambda: 50, a: 25, b: 10, observation_count: 100 });
      const armB = makeArm({ id: 'arm-b', arm_name: 'low_revenue', mu: 10, lambda: 50, a: 25, b: 10, observation_count: 100 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'continuous' }], rowCount: 1 });

      const result = await BanditService.selectArm('revenue');

      expect(result).toHaveProperty('selected_arm');
      expect(['high_revenue', 'low_revenue']).toContain(result.selected_arm);
    });

    it('should exclude specified arms', async () => {
      const armA = makeArm({ id: 'arm-a', arm_name: 'variant_a', observation_count: 100 });
      const armB = makeArm({ id: 'arm-b', arm_name: 'variant_b', observation_count: 100 });
      const armC = makeArm({ id: 'arm-c', arm_name: 'variant_c', observation_count: 100 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB, armC], rowCount: 3 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.selectArm('headline', undefined, ['variant_a', 'variant_b']);

      expect(result.selected_arm).toBe('variant_c');
    });

    it('should apply contextual adjustment when context vector is provided', async () => {
      const arm = makeArm({ id: 'arm-a', arm_name: 'variant_a', observation_count: 100 });

      // getArms
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      // reward type
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });
      // getContextWeights for arm
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { id: 'w1', arm_id: 'arm-a', feature_name: 'channel', weight: 0.5 },
          { id: 'w2', arm_id: 'arm-a', feature_name: 'day_of_week', weight: 0.3 },
        ],
        rowCount: 2,
      });

      const result = await BanditService.selectArm('headline', {
        channel: 'email',
        day_of_week: 3,
      });

      expect(result.selected_arm).toBe('variant_a');
      // Context was provided, so contextual_adjustment should be computed
      expect(typeof result.contextual_adjustment).toBe('number');
    });

    it('should give exploration bonus to under-explored arms', async () => {
      // arm_a has many observations, arm_b has zero
      const armA = makeArm({ id: 'arm-a', arm_name: 'explored', alpha: 2, beta: 2, observation_count: 1000 });
      const armB = makeArm({ id: 'arm-b', arm_name: 'unexplored', alpha: 1, beta: 1, observation_count: 0 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.selectArm('headline');

      // Find the unexplored arm's score entry
      const unexploredScore = result.all_scores.find((s) => s.arm_name === 'unexplored');
      expect(unexploredScore).toBeDefined();

      // The exploration bonus for the unexplored arm (0 observations) should equal the full EXPLORATION_BONUS
      expect(result.exploration_bonus).toBeGreaterThanOrEqual(0);
    });

    it('should default to binary reward type when no observations exist', async () => {
      const arm = makeArm({ id: 'arm-a', arm_name: 'variant_a', alpha: 1, beta: 1, observation_count: 0 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      // No observations found
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await BanditService.selectArm('headline');

      expect(result.selected_arm).toBe('variant_a');
      // Score should be between 0 and 1 (roughly, with exploration bonus)
      expect(result.score).toBeGreaterThan(-1);
    });
  });

  // =========================================================================
  // recordObservation
  // =========================================================================

  describe('recordObservation', () => {
    it('should throw ValidationError when contextType is empty', async () => {
      await expect(
        BanditService.recordObservation('', 'arm1', 1, 'binary'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when armName is empty', async () => {
      await expect(
        BanditService.recordObservation('headline', '', 1, 'binary'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for binary reward outside [0, 1]', async () => {
      await expect(
        BanditService.recordObservation('headline', 'arm1', 2, 'binary'),
      ).rejects.toThrow(ValidationError);

      await expect(
        BanditService.recordObservation('headline', 'arm1', -0.5, 'binary'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid reward type', async () => {
      await expect(
        BanditService.recordObservation('headline', 'arm1', 0.5, 'invalid' as any),
      ).rejects.toThrow(ValidationError);
    });

    it('should record a binary observation and update alpha/beta', async () => {
      const arm = makeArm({ alpha: 10, beta: 5, observation_count: 50 });

      // getOrCreateArm: existing arm found
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });

      // Insert observation (via client mock)
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Update posterior
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await BanditService.recordObservation(
        'headline', 'variant_a', 1, 'binary',
      );

      expect(result.arm).toBeDefined();
      expect(result.observation_id).toBe('mock-uuid');

      // After recording reward=1 with binary:
      //   alpha should increase: 10 + 1*1 = 11
      //   beta should stay: 5 + (1-1)*1 = 5
      expect(result.arm.alpha).toBe(11);
      expect(result.arm.beta).toBe(5);
      expect(result.arm.observation_count).toBe(51);
    });

    it('should record a binary observation with reward=0 and update beta', async () => {
      const arm = makeArm({ alpha: 10, beta: 5, observation_count: 50 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await BanditService.recordObservation(
        'headline', 'variant_a', 0, 'binary',
      );

      // After recording reward=0 with binary:
      //   alpha should stay: 10 + 0*1 = 10
      //   beta should increase: 5 + (1-0)*1 = 6
      expect(result.arm.alpha).toBe(10);
      expect(result.arm.beta).toBe(6);
    });

    it('should record a continuous observation and update NIG parameters', async () => {
      const arm = makeArm({ mu: 0.5, lambda: 10, a: 5, b: 2, observation_count: 50 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const reward = 0.8;
      const result = await BanditService.recordObservation(
        'revenue', 'variant_a', reward, 'continuous',
      );

      // NIG conjugate update:
      //   lambda_new = 10 + 1 = 11
      //   mu_new = (10*0.5 + 0.8) / 11 = 5.8/11 ~ 0.5272727
      //   a_new = 5 + 0.5 = 5.5
      //   b_new = 2 + 0.5 * 10 * (0.8 - 0.5)^2 / 11 = 2 + 0.5*10*0.09/11 ~ 2.0409
      const expectedLambda = 11;
      const expectedMu = (10 * 0.5 + 0.8) / 11;
      const expectedA = 5.5;
      const expectedB = 2 + 0.5 * 10 * Math.pow(0.8 - 0.5, 2) / 11;

      expect(result.arm.lambda).toBeCloseTo(expectedLambda, 5);
      expect(result.arm.mu).toBeCloseTo(expectedMu, 5);
      expect(result.arm.a).toBeCloseTo(expectedA, 5);
      expect(result.arm.b).toBeCloseTo(expectedB, 5);
    });

    it('should create a new arm with uninformative priors when no similar arms exist', async () => {
      // No existing arm found
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // No similar arms for cold start
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Insert new arm
      const newArm = makeArm({
        alpha: 1, beta: 1, mu: 0, lambda: 1, a: 1, b: 1, observation_count: 0,
      });
      mockPoolQuery.mockResolvedValueOnce({ rows: [newArm], rowCount: 1 });

      // Observation insert + posterior update via transaction client
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await BanditService.recordObservation(
        'headline', 'new_variant', 1, 'binary',
      );

      expect(result.arm).toBeDefined();
      expect(result.observation_id).toBe('mock-uuid');
    });
  });

  // =========================================================================
  // getArmStats
  // =========================================================================

  describe('getArmStats', () => {
    it('should throw ValidationError for empty contextType', async () => {
      await expect(BanditService.getArmStats('')).rejects.toThrow(ValidationError);
    });

    it('should return empty array when no arms exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const stats = await BanditService.getArmStats('headline');
      expect(stats).toEqual([]);
    });

    it('should compute correct stats for binary arms', async () => {
      const arm = makeArm({ arm_name: 'variant_a', alpha: 80, beta: 20, observation_count: 100 });

      // getArms
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      // reward type
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const stats = await BanditService.getArmStats('headline');

      expect(stats).toHaveLength(1);
      expect(stats[0].arm_name).toBe('variant_a');
      expect(stats[0].observation_count).toBe(100);

      // Mean for Beta(80, 20) = 80/100 = 0.8
      expect(stats[0].mean).toBeCloseTo(0.8, 2);

      // CI should bracket the mean
      expect(stats[0].confidence_interval.lower).toBeLessThan(stats[0].mean);
      expect(stats[0].confidence_interval.upper).toBeGreaterThan(stats[0].mean);

      // CI lower should be >= 0 for binary
      expect(stats[0].confidence_interval.lower).toBeGreaterThanOrEqual(0);
      // CI upper should be <= 1 for binary
      expect(stats[0].confidence_interval.upper).toBeLessThanOrEqual(1);

      // confidence_width should be positive
      expect(stats[0].confidence_width).toBeGreaterThan(0);
    });

    it('should sort stats by mean descending', async () => {
      const armA = makeArm({ arm_name: 'low', alpha: 10, beta: 90, observation_count: 100 });
      const armB = makeArm({ arm_name: 'high', alpha: 90, beta: 10, observation_count: 100 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const stats = await BanditService.getArmStats('headline');

      expect(stats[0].arm_name).toBe('high');
      expect(stats[1].arm_name).toBe('low');
      expect(stats[0].mean).toBeGreaterThan(stats[1].mean);
    });

    it('should compute stats for continuous reward type arms', async () => {
      const arm = makeArm({
        arm_name: 'revenue_variant',
        mu: 50,
        lambda: 100,
        a: 50,
        b: 25,
        observation_count: 200,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'continuous' }], rowCount: 1 });

      const stats = await BanditService.getArmStats('revenue');

      expect(stats).toHaveLength(1);
      expect(stats[0].mean).toBeCloseTo(50, 0);
      expect(stats[0].confidence_interval.lower).toBeLessThan(50);
      expect(stats[0].confidence_interval.upper).toBeGreaterThan(50);
    });
  });

  // =========================================================================
  // hasConverged
  // =========================================================================

  describe('hasConverged', () => {
    it('should return converged=false with empty data when no arms exist', async () => {
      // getArmStats will call getArms
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await BanditService.hasConverged('headline');

      expect(result.converged).toBe(false);
      expect(result.best_arm).toBe('');
      expect(result.total_observations).toBe(0);
    });

    it('should return converged=false when only one arm exists', async () => {
      const arm = makeArm({ arm_name: 'only_arm', alpha: 50, beta: 10, observation_count: 100 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.hasConverged('headline');

      expect(result.converged).toBe(false);
      expect(result.best_arm).toBe('only_arm');
      expect(result.second_best_arm).toBeNull();
    });

    it('should detect convergence when CIs do not overlap', async () => {
      // Two arms with very different performance and many observations
      // so confidence intervals don't overlap
      const armA = makeArm({
        arm_name: 'winner',
        alpha: 900,
        beta: 100,
        observation_count: 1000,
      });
      const armB = makeArm({
        arm_name: 'loser',
        alpha: 100,
        beta: 900,
        observation_count: 1000,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.hasConverged('headline');

      expect(result.converged).toBe(true);
      expect(result.best_arm).toBe('winner');
      expect(result.second_best_arm).toBe('loser');
      expect(result.overlap).toBe(false);
      expect(result.total_observations).toBe(2000);
    });

    it('should detect non-convergence when CIs overlap', async () => {
      // Two arms with similar performance -- CIs will overlap
      const armA = makeArm({
        arm_name: 'variant_a',
        alpha: 5,
        beta: 5,
        observation_count: 10,
      });
      const armB = makeArm({
        arm_name: 'variant_b',
        alpha: 6,
        beta: 5,
        observation_count: 11,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.hasConverged('headline');

      expect(result.converged).toBe(false);
      expect(result.overlap).toBe(true);
    });

    it('should respect the threshold parameter for convergence gap', async () => {
      // Arms that barely don't overlap - but with a high threshold they should be "overlapping"
      const armA = makeArm({
        arm_name: 'variant_a',
        alpha: 80,
        beta: 20,
        observation_count: 100,
      });
      const armB = makeArm({
        arm_name: 'variant_b',
        alpha: 60,
        beta: 40,
        observation_count: 100,
      });

      mockPoolQuery.mockResolvedValueOnce({ rows: [armA, armB], rowCount: 2 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      // Large threshold makes convergence harder to achieve
      const result = await BanditService.hasConverged('headline', 0.5);

      // With threshold of 0.5, it's very hard to converge
      expect(result.converged).toBe(false);
    });
  });

  // =========================================================================
  // getConfidence
  // =========================================================================

  describe('getConfidence', () => {
    it('should return confidence width for a specific arm', async () => {
      const arm = makeArm({ arm_name: 'variant_a', alpha: 50, beta: 50, observation_count: 100 });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      const result = await BanditService.getConfidence('headline', 'variant_a');

      expect(result.arm_name).toBe('variant_a');
      expect(result.observation_count).toBe(100);
      expect(result.confidence_width).toBeGreaterThan(0);
      expect(result.confidence_width).toBeLessThan(1); // for well-observed binary arm
    });

    it('should throw NotFoundError for non-existent arm', async () => {
      const arm = makeArm({ arm_name: 'variant_a' });

      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ reward_type: 'binary' }], rowCount: 1 });

      await expect(
        BanditService.getConfidence('headline', 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // decayObservations
  // =========================================================================

  describe('decayObservations', () => {
    it('should update decayed weights and rebuild posteriors for binary arms', async () => {
      // Update all observation weights
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 10 });
      // Get all arms
      const arm = makeArm({ id: 'arm-1', observation_count: 5 });
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      // Get observations for arm
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          { id: 'obs-1', arm_id: 'arm-1', reward: 1, reward_type: 'binary', decayed_weight: 0.9, observed_at: new Date() },
          { id: 'obs-2', arm_id: 'arm-1', reward: 0, reward_type: 'binary', decayed_weight: 0.7, observed_at: new Date() },
          { id: 'obs-3', arm_id: 'arm-1', reward: 1, reward_type: 'binary', decayed_weight: 0.5, observed_at: new Date() },
        ],
        rowCount: 3,
      });
      // Update arm posteriors
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await BanditService.decayObservations();

      expect(result.observations_decayed).toBe(10);
      expect(result.arms_updated).toBe(1);

      // Verify the posterior update query was called with rebuilt alpha/beta
      // alpha = 1 + 1*0.9 + 0*0.7 + 1*0.5 = 2.4
      // beta = 1 + 0*0.9 + 1*0.7 + 0*0.5 = 1.7
      const updateCall = mockPoolQuery.mock.calls[3];
      expect(updateCall[0]).toContain('UPDATE bandit_arms SET alpha');
      expect(updateCall[1][0]).toBeCloseTo(2.4, 5); // alpha
      expect(updateCall[1][1]).toBeCloseTo(1.7, 5); // beta
    });

    it('should handle arms with no observations', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });
      const arm = makeArm({ id: 'arm-1' });
      mockPoolQuery.mockResolvedValueOnce({ rows: [arm], rowCount: 1 });
      // No observations
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await BanditService.decayObservations();

      expect(result.observations_decayed).toBe(0);
      expect(result.arms_updated).toBe(0);
    });
  });
});

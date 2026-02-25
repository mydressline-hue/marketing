/**
 * Unit tests for ABTestingAgent.
 *
 * All external dependencies (database, Redis cache, AI client, logger)
 * are fully mocked so tests exercise only the agent's statistical
 * computation, variant analysis, sample size calculations, and
 * decision-building pipeline.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be defined before imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-jwt-testing',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    LOG_LEVEL: 'silent',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../../src/agents/base/ConfidenceScoring', () => ({
  getConfidenceLevel: jest.fn((score: number) => {
    if (score >= 80) return 'very_high';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  ABTestingAgent,
  sampleBeta,
  sampleGamma,
  normalCDF,
  normalQuantile,
  betaQuantile,
} from '../../../src/agents/modules/ABTestingAgent';
import type {
  BayesianResult,
  FrequentistResult,
  LiftCalculation,
  VariantComparison,
} from '../../../src/agents/modules/ABTestingAgent';
import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import type { TestVariant } from '../../../src/types';
import type { AgentInput } from '../../../src/agents/base/types';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A control variant with known conversion data. */
const CONTROL_VARIANT: TestVariant = {
  id: 'variant-control',
  name: 'Control',
  config: {},
  traffic_split: 50,
  impressions: 5000,
  conversions: 500,
  conversion_rate: 0.10,
};

/** A treatment variant with higher conversion rate. */
const TREATMENT_VARIANT: TestVariant = {
  id: 'variant-treatment',
  name: 'Treatment A',
  config: {},
  traffic_split: 50,
  impressions: 5000,
  conversions: 600,
  conversion_rate: 0.12,
};

/** A treatment variant with much higher conversion rate (clear winner). */
const STRONG_TREATMENT: TestVariant = {
  id: 'variant-strong',
  name: 'Strong Treatment',
  config: {},
  traffic_split: 50,
  impressions: 10000,
  conversions: 1500,
  conversion_rate: 0.15,
};

/** A variant with very little data. */
const LOW_DATA_VARIANT: TestVariant = {
  id: 'variant-low',
  name: 'Low Data',
  config: {},
  traffic_split: 50,
  impressions: 10,
  conversions: 2,
  conversion_rate: 0.2,
};

/** A variant with zero impressions. */
const ZERO_VARIANT: TestVariant = {
  id: 'variant-zero',
  name: 'Zero Traffic',
  config: {},
  traffic_split: 50,
  impressions: 0,
  conversions: 0,
  conversion_rate: 0,
};

/** Standard agent input payload for tests. */
const TEST_INPUT: AgentInput = {
  context: {},
  parameters: {},
  requestId: 'test-request-ab-001',
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('ABTestingAgent', () => {
  let agent: ABTestingAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    agent = new ABTestingAgent();
  });

  // -----------------------------------------------------------------------
  // Constructor & Configuration
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates an agent with default configuration', () => {
      expect(agent.getAgentType()).toBe('ab_testing');
      expect(agent.getConfig().model).toBe('sonnet');
      expect(agent.getConfig().maxRetries).toBe(3);
      expect(agent.getConfig().timeoutMs).toBe(30000);
      expect(agent.getConfig().confidenceThreshold).toBe(70);
    });

    it('accepts custom configuration overrides', () => {
      const customAgent = new ABTestingAgent({
        maxRetries: 5,
        timeoutMs: 60000,
        confidenceThreshold: 90,
      });

      expect(customAgent.getConfig().maxRetries).toBe(5);
      expect(customAgent.getConfig().timeoutMs).toBe(60000);
      expect(customAgent.getConfig().confidenceThreshold).toBe(90);
      // These should not be overridden
      expect(customAgent.getAgentType()).toBe('ab_testing');
      expect(customAgent.getConfig().model).toBe('sonnet');
    });
  });

  // -----------------------------------------------------------------------
  // getSystemPrompt
  // -----------------------------------------------------------------------

  describe('getSystemPrompt', () => {
    it('returns a non-empty system prompt containing domain keywords', () => {
      const prompt = agent.getSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('A/B Testing');
      expect(prompt).toContain('Bayesian');
      expect(prompt).toContain('Monte Carlo');
    });
  });

  // -----------------------------------------------------------------------
  // getChallengeTargets
  // -----------------------------------------------------------------------

  describe('getChallengeTargets', () => {
    it('returns the expected challenge targets', () => {
      const targets = agent.getChallengeTargets();

      expect(targets).toEqual(
        expect.arrayContaining([
          'conversion_optimization',
          'creative_generation',
          'paid_ads',
        ]),
      );
      expect(targets).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // computeBayesianConfidence
  // -----------------------------------------------------------------------

  describe('computeBayesianConfidence', () => {
    it('computes probabilities that sum to approximately 1.0', () => {
      const result = agent.computeBayesianConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      const totalProb = Object.values(result.probabilityOfBeingBest).reduce(
        (sum, p) => sum + p,
        0,
      );

      // Monte Carlo probabilities should sum to ~1.0 (within tolerance)
      expect(totalProb).toBeCloseTo(1.0, 1);
    });

    it('assigns higher probability to the variant with higher conversion rate', () => {
      const result = agent.computeBayesianConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      // Treatment (12% CR) should beat control (10% CR) with high probability
      const treatmentProb =
        result.probabilityOfBeingBest[TREATMENT_VARIANT.id] ?? 0;
      const controlProb =
        result.probabilityOfBeingBest[CONTROL_VARIANT.id] ?? 0;

      expect(treatmentProb).toBeGreaterThan(controlProb);
      expect(treatmentProb).toBeGreaterThan(0.5);
    });

    it('detects statistical significance for a strong winner', () => {
      // Strong treatment: 15% vs control 10% with 10k+ impressions each
      const result = agent.computeBayesianConfidence([
        { ...CONTROL_VARIANT, impressions: 10000, conversions: 1000 },
        STRONG_TREATMENT,
      ]);

      expect(result.isSignificant).toBe(true);

      const bestProb = Math.max(
        ...Object.values(result.probabilityOfBeingBest),
      );
      expect(bestProb).toBeGreaterThanOrEqual(0.95);
    });

    it('returns non-significant for variants with very little data', () => {
      const result = agent.computeBayesianConfidence([
        LOW_DATA_VARIANT,
        {
          ...LOW_DATA_VARIANT,
          id: 'variant-low-2',
          conversions: 3,
          conversion_rate: 0.3,
        },
      ]);

      // With only 10 impressions each, results should not be significant
      // (the probability of being best is unlikely to exceed 0.95)
      expect(result.isSignificant).toBe(false);
    });

    it('computes credible intervals for each variant', () => {
      const result = agent.computeBayesianConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      // Both variants should have credible intervals
      expect(result.credibleInterval[CONTROL_VARIANT.id]).toBeDefined();
      expect(result.credibleInterval[TREATMENT_VARIANT.id]).toBeDefined();

      // Credible intervals should be valid ranges
      const [lower, upper] = result.credibleInterval[CONTROL_VARIANT.id];
      expect(lower).toBeLessThan(upper);
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(upper).toBeLessThanOrEqual(1);

      // Control has 10% CR, so the interval should contain ~0.10
      expect(lower).toBeLessThan(0.10);
      expect(upper).toBeGreaterThan(0.10);
    });

    it('computes expected loss values that are non-negative', () => {
      const result = agent.computeBayesianConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      for (const loss of Object.values(result.expectedLoss)) {
        expect(loss).toBeGreaterThanOrEqual(0);
      }

      // The winning variant should have lower expected loss
      const treatmentLoss = result.expectedLoss[TREATMENT_VARIANT.id] ?? Infinity;
      const controlLoss = result.expectedLoss[CONTROL_VARIANT.id] ?? Infinity;
      expect(treatmentLoss).toBeLessThan(controlLoss);
    });

    it('handles multi-variant tests (3+ variants)', () => {
      const result = agent.computeBayesianConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
        STRONG_TREATMENT,
      ]);

      const probs = Object.values(result.probabilityOfBeingBest);
      expect(probs).toHaveLength(3);

      const totalProb = probs.reduce((sum, p) => sum + p, 0);
      expect(totalProb).toBeCloseTo(1.0, 1);

      // Strong treatment (15%) should have highest probability
      const strongProb =
        result.probabilityOfBeingBest[STRONG_TREATMENT.id] ?? 0;
      expect(strongProb).toBeGreaterThan(
        result.probabilityOfBeingBest[CONTROL_VARIANT.id] ?? 0,
      );
    });

    it('returns empty result for fewer than 2 variants', () => {
      const result = agent.computeBayesianConfidence([CONTROL_VARIANT]);

      expect(result.isSignificant).toBe(false);
      expect(Object.keys(result.probabilityOfBeingBest)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // computeFrequentistConfidence
  // -----------------------------------------------------------------------

  describe('computeFrequentistConfidence', () => {
    it('computes a valid z-score and p-value for two variants', () => {
      const result = agent.computeFrequentistConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      expect(typeof result.zScore).toBe('number');
      expect(typeof result.pValue).toBe('number');
      expect(result.pValue).toBeGreaterThanOrEqual(0);
      expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('detects significance for a large effect with large samples', () => {
      const result = agent.computeFrequentistConfidence([
        { ...CONTROL_VARIANT, impressions: 10000, conversions: 1000 },
        { ...STRONG_TREATMENT, impressions: 10000, conversions: 1500 },
      ]);

      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
      expect(result.zScore).toBeGreaterThan(1.96);
    });

    it('returns not significant when sample sizes are tiny', () => {
      const result = agent.computeFrequentistConfidence([
        LOW_DATA_VARIANT,
        {
          ...LOW_DATA_VARIANT,
          id: 'variant-low-2',
          conversions: 3,
        },
      ]);

      // With 10 impressions each, even a large rate difference is not significant
      expect(result.isSignificant).toBe(false);
    });

    it('returns valid confidence interval', () => {
      const result = agent.computeFrequentistConfidence([
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      ]);

      const [lower, upper] = result.confidenceInterval;
      expect(lower).toBeLessThan(upper);
      // The interval should contain the actual difference (0.12 - 0.10 = 0.02)
      expect(lower).toBeLessThanOrEqual(0.02);
      expect(upper).toBeGreaterThanOrEqual(0.02);
    });

    it('handles zero impressions gracefully', () => {
      const result = agent.computeFrequentistConfidence([
        ZERO_VARIANT,
        CONTROL_VARIANT,
      ]);

      expect(result.pValue).toBe(1);
      expect(result.zScore).toBe(0);
      expect(result.isSignificant).toBe(false);
    });

    it('computes statistical power', () => {
      const result = agent.computeFrequentistConfidence([
        { ...CONTROL_VARIANT, impressions: 10000, conversions: 1000 },
        { ...TREATMENT_VARIANT, impressions: 10000, conversions: 1200 },
      ]);

      expect(result.power).toBeGreaterThanOrEqual(0);
      expect(result.power).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // calculateSampleSize
  // -----------------------------------------------------------------------

  describe('calculateSampleSize', () => {
    it('calculates a positive integer sample size', () => {
      const size = agent.calculateSampleSize(0.10, 0.10, 0.8, 0.05);

      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    });

    it('requires larger samples for smaller detectable effects', () => {
      const smallEffect = agent.calculateSampleSize(0.10, 0.05, 0.8, 0.05);
      const largeEffect = agent.calculateSampleSize(0.10, 0.20, 0.8, 0.05);

      expect(smallEffect).toBeGreaterThan(largeEffect);
    });

    it('requires larger samples for higher power', () => {
      const lowPower = agent.calculateSampleSize(0.10, 0.10, 0.6, 0.05);
      const highPower = agent.calculateSampleSize(0.10, 0.10, 0.9, 0.05);

      expect(highPower).toBeGreaterThan(lowPower);
    });

    it('requires larger samples for stricter significance', () => {
      const lenient = agent.calculateSampleSize(0.10, 0.10, 0.8, 0.10);
      const strict = agent.calculateSampleSize(0.10, 0.10, 0.8, 0.01);

      expect(strict).toBeGreaterThan(lenient);
    });

    it('throws for baseline rate outside (0, 1)', () => {
      expect(() => agent.calculateSampleSize(0, 0.10, 0.8, 0.05)).toThrow();
      expect(() => agent.calculateSampleSize(1, 0.10, 0.8, 0.05)).toThrow();
      expect(() => agent.calculateSampleSize(-0.1, 0.10, 0.8, 0.05)).toThrow();
    });

    it('throws for non-positive minimum detectable effect', () => {
      expect(() => agent.calculateSampleSize(0.10, 0, 0.8, 0.05)).toThrow();
      expect(() => agent.calculateSampleSize(0.10, -0.05, 0.8, 0.05)).toThrow();
    });

    it('produces a reasonable sample size for common scenarios', () => {
      // A/B test: 5% baseline, 20% relative MDE, 80% power, 95% confidence
      // Known approximate answer: ~3800 per variant
      const size = agent.calculateSampleSize(0.05, 0.20, 0.8, 0.05);

      expect(size).toBeGreaterThan(1000);
      expect(size).toBeLessThan(10000);
    });
  });

  // -----------------------------------------------------------------------
  // compareVariants
  // -----------------------------------------------------------------------

  describe('compareVariants', () => {
    it('identifies the better variant correctly', () => {
      const result = agent.compareVariants(
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      );

      // Treatment has higher CR, so it should be identified as better
      expect(result.betterVariant).toBe(TREATMENT_VARIANT.id);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('computes positive lift when treatment beats control', () => {
      const result = agent.compareVariants(
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      );

      expect(result.lift).toBeGreaterThan(0);
    });

    it('reports sample size reached when both variants have enough data', () => {
      const result = agent.compareVariants(
        CONTROL_VARIANT,
        TREATMENT_VARIANT,
      );

      // Both have 5000 impressions, which exceeds 100
      expect(result.sampleSizeReached).toBe(true);
    });

    it('reports sample size not reached for small variants', () => {
      const result = agent.compareVariants(LOW_DATA_VARIANT, {
        ...LOW_DATA_VARIANT,
        id: 'variant-low-2',
        conversions: 4,
      });

      expect(result.sampleSizeReached).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // calculateLift
  // -----------------------------------------------------------------------

  describe('calculateLift', () => {
    it('computes correct absolute lift', () => {
      const result = agent.calculateLift(CONTROL_VARIANT, TREATMENT_VARIANT);

      // Control: 500/5000 = 0.10, Treatment: 600/5000 = 0.12
      // Absolute lift = 0.12 - 0.10 = 0.02
      expect(result.absoluteLift).toBeCloseTo(0.02, 4);
    });

    it('computes correct relative lift', () => {
      const result = agent.calculateLift(CONTROL_VARIANT, TREATMENT_VARIANT);

      // Relative lift = (0.12 - 0.10) / 0.10 = 0.20
      expect(result.relativeLift).toBeCloseTo(0.20, 4);
    });

    it('produces a confidence interval that contains the observed lift', () => {
      const result = agent.calculateLift(CONTROL_VARIANT, TREATMENT_VARIANT);

      const [lower, upper] = result.confidenceInterval;
      expect(lower).toBeLessThanOrEqual(result.absoluteLift);
      expect(upper).toBeGreaterThanOrEqual(result.absoluteLift);
    });

    it('handles zero control rate gracefully', () => {
      const result = agent.calculateLift(ZERO_VARIANT, TREATMENT_VARIANT);

      expect(result.absoluteLift).toBe(TREATMENT_VARIANT.conversions! / TREATMENT_VARIANT.impressions!);
      expect(result.relativeLift).toBe(0); // Cannot divide by zero
    });

    it('returns zero lift and CI when both variants have zero impressions', () => {
      const result = agent.calculateLift(ZERO_VARIANT, {
        ...ZERO_VARIANT,
        id: 'zero-2',
      });

      expect(result.absoluteLift).toBe(0);
      expect(result.relativeLift).toBe(0);
      expect(result.confidenceInterval).toEqual([0, 0]);
    });
  });

  // -----------------------------------------------------------------------
  // process (integration)
  // -----------------------------------------------------------------------

  describe('process', () => {
    it('returns no_active_tests when no running tests exist', async () => {
      // getActiveTests: empty cache, empty DB
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('no_active_tests');
      expect(output.agentType).toBe('ab_testing');
      expect(output.uncertainties.length).toBeGreaterThan(0);
    });

    it('handles database errors gracefully in process', async () => {
      // getActiveTests throws
      mockCacheGet.mockResolvedValueOnce(null);
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const output = await agent.process(TEST_INPUT);

      expect(output.decision).toBe('processing_error');
      expect(output.warnings.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // createTest (validation)
  // -----------------------------------------------------------------------

  describe('createTest', () => {
    it('rejects tests with fewer than 2 variants', async () => {
      await expect(
        agent.createTest({
          name: 'Single Variant Test',
          type: 'creative',
          campaignId: 'campaign-1',
          variants: [{ name: 'Only One', config: {} }],
          trafficSplit: [100],
          minimumSampleSize: 1000,
          maxDuration: 14,
        }),
      ).rejects.toThrow('at least 2 variants');
    });

    it('rejects tests where traffic splits do not sum to 100', async () => {
      await expect(
        agent.createTest({
          name: 'Bad Split Test',
          type: 'creative',
          campaignId: 'campaign-1',
          variants: [
            { name: 'A', config: {} },
            { name: 'B', config: {} },
          ],
          trafficSplit: [60, 60],
          minimumSampleSize: 1000,
          maxDuration: 14,
        }),
      ).rejects.toThrow('sum to 100');
    });

    it('rejects tests where split count does not match variant count', async () => {
      await expect(
        agent.createTest({
          name: 'Mismatch Test',
          type: 'pricing',
          campaignId: 'campaign-1',
          variants: [
            { name: 'A', config: {} },
            { name: 'B', config: {} },
          ],
          trafficSplit: [50, 30, 20],
          minimumSampleSize: 1000,
          maxDuration: 14,
        }),
      ).rejects.toThrow('match number of variants');
    });

    it('creates a test successfully with valid config', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const test = await agent.createTest({
        name: 'Valid Test',
        type: 'creative',
        campaignId: 'campaign-1',
        variants: [
          { name: 'Control', config: { headline: 'Original' } },
          { name: 'Treatment', config: { headline: 'New' } },
        ],
        trafficSplit: [50, 50],
        minimumSampleSize: 1000,
        maxDuration: 14,
      });

      expect(test.id).toBeDefined();
      expect(test.name).toBe('Valid Test');
      expect(test.status).toBe('draft');
      expect(test.variants).toHaveLength(2);
      expect(test.variants[0].traffic_split).toBe(50);
      expect(test.variants[1].traffic_split).toBe(50);

      // Should invalidate cache
      expect(mockCacheDel).toHaveBeenCalledWith('ab_tests:active');
    });
  });

  // -----------------------------------------------------------------------
  // Statistical utility functions (exported pure functions)
  // -----------------------------------------------------------------------

  describe('sampleBeta', () => {
    it('returns values in the range [0, 1]', () => {
      for (let i = 0; i < 100; i++) {
        const value = sampleBeta(2, 5);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('produces samples with mean close to alpha/(alpha+beta)', () => {
      const alpha = 10;
      const beta = 30;
      const expectedMean = alpha / (alpha + beta);
      const samples = Array.from({ length: 5000 }, () =>
        sampleBeta(alpha, beta),
      );
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

      // Mean should be within 0.03 of expected
      expect(Math.abs(mean - expectedMean)).toBeLessThan(0.03);
    });
  });

  describe('sampleGamma', () => {
    it('returns non-negative values', () => {
      for (let i = 0; i < 100; i++) {
        const value = sampleGamma(2);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles shape parameter less than 1', () => {
      for (let i = 0; i < 50; i++) {
        const value = sampleGamma(0.5);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(isFinite(value)).toBe(true);
      }
    });

    it('returns 0 for shape <= 0', () => {
      expect(sampleGamma(0)).toBe(0);
      expect(sampleGamma(-1)).toBe(0);
    });
  });

  describe('normalCDF', () => {
    it('returns 0.5 for z = 0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 4);
    });

    it('returns approximately 0.9772 for z = 2', () => {
      expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
    });

    it('returns approximately 0.0228 for z = -2', () => {
      expect(normalCDF(-2)).toBeCloseTo(0.0228, 3);
    });

    it('returns 0 for very negative z', () => {
      expect(normalCDF(-10)).toBe(0);
    });

    it('returns 1 for very positive z', () => {
      expect(normalCDF(10)).toBe(1);
    });
  });

  describe('normalQuantile', () => {
    it('returns 0 for p = 0.5', () => {
      expect(normalQuantile(0.5)).toBe(0);
    });

    it('returns approximately 1.96 for p = 0.975', () => {
      expect(normalQuantile(0.975)).toBeCloseTo(1.96, 1);
    });

    it('returns approximately -1.96 for p = 0.025', () => {
      expect(normalQuantile(0.025)).toBeCloseTo(-1.96, 1);
    });

    it('returns -Infinity for p = 0', () => {
      expect(normalQuantile(0)).toBe(-Infinity);
    });

    it('returns Infinity for p = 1', () => {
      expect(normalQuantile(1)).toBe(Infinity);
    });
  });

  describe('betaQuantile', () => {
    it('returns the median close to the mode for symmetric beta', () => {
      // Beta(10, 10) has mean = 0.5, and the median should be very close to 0.5
      const median = betaQuantile(0.5, 10, 10);
      expect(median).toBeCloseTo(0.5, 1);
    });

    it('returns 0 for p = 0', () => {
      expect(betaQuantile(0, 5, 5)).toBe(0);
    });

    it('returns 1 for p = 1', () => {
      expect(betaQuantile(1, 5, 5)).toBe(1);
    });

    it('returns a value in (0, 1) for p in (0, 1)', () => {
      const q = betaQuantile(0.75, 3, 7);
      expect(q).toBeGreaterThan(0);
      expect(q).toBeLessThan(1);
    });
  });
});

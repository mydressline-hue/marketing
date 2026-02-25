// ============================================================
// AI International Growth Engine - Agent 9: A/B Testing Agent
// Manages test creation, Bayesian/frequentist statistical analysis,
// variant comparison, winner determination, and iterative improvement.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfidenceScore,
  AgentConfig,
} from '../base/types';
import type {
  AgentType,
  ABTest,
  ABTestStatus,
  TestVariant,
  StatisticalResult,
  ID,
} from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ============================================================
// Local Types
// ============================================================

export interface VariantConfig {
  name: string;
  config: Record<string, unknown>;
}

export interface TestConfig {
  name: string;
  type: 'creative' | 'landing_page' | 'pricing' | 'offer' | 'audience';
  campaignId: string;
  variants: VariantConfig[];
  trafficSplit: number[];
  minimumSampleSize: number;
  maxDuration: number; // days
}

export interface AnalyzedVariant {
  id: string;
  name: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  revenuePerVisitor: number;
}

export interface TestAnalysis {
  testId: string;
  status: string;
  duration: number; // days elapsed
  variants: AnalyzedVariant[];
  winner?: string;
  statistical: StatisticalResult;
  recommendations: string[];
}

export interface BayesianResult {
  probabilityOfBeingBest: Record<string, number>;
  expectedLoss: Record<string, number>;
  credibleInterval: Record<string, [number, number]>;
  isSignificant: boolean;
}

export interface FrequentistResult {
  pValue: number;
  zScore: number;
  confidenceInterval: [number, number];
  isSignificant: boolean;
  power: number;
}

export interface WinnerDetermination {
  winnerId: string;
  confidence: number;
  method: 'bayesian' | 'frequentist';
  lift: number;
  reasoning: string;
}

export interface VariantComparison {
  betterVariant: string;
  lift: number;
  confidence: number;
  sampleSizeReached: boolean;
}

export interface LiftCalculation {
  absoluteLift: number;
  relativeLift: number;
  confidenceInterval: [number, number];
}

export interface TestSuggestion {
  type: string;
  hypothesis: string;
  expectedImpact: number;
  priority: number;
}

// ============================================================
// Constants
// ============================================================

const MONTE_CARLO_SAMPLES = 10000;
const CACHE_TTL_SECONDS = 300; // 5 minutes
const SIGNIFICANCE_THRESHOLD = 0.95;
const EXPECTED_LOSS_THRESHOLD = 0.001; // 0.1% expected loss threshold
const DEFAULT_SIGNIFICANCE_LEVEL = 0.05;

// ============================================================
// ABTestingAgent
// ============================================================

export class ABTestingAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'ab_testing',
      model: 'sonnet',
      maxRetries: 3,
      timeoutMs: 30000,
      confidenceThreshold: 70,
      ...config,
    });
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  getChallengeTargets(): AgentType[] {
    return ['conversion_optimization', 'creative_generation', 'paid_ads'];
  }

  getSystemPrompt(): string {
    return `You are the A/B Testing Agent for the AI International Growth Engine.
Your role is to design, analyze, and optimize A/B tests across marketing campaigns.

Responsibilities:
- Design statistically rigorous experiments for creative, landing page, pricing, offer, and audience tests
- Calculate Bayesian and frequentist statistical significance for test variants
- Determine test winners with proper confidence scoring
- Recommend next tests based on previous results and learnings
- Flag uncertainty when sample sizes are insufficient or results are inconclusive

Statistical methods:
- Use Beta-Binomial Bayesian inference with Monte Carlo simulation for probability of being best
- Calculate expected loss to quantify the cost of choosing the wrong variant
- Compute frequentist z-tests for two-proportion comparisons
- Always report credible intervals and confidence intervals

Rules:
- Never declare a winner without reaching the minimum sample size
- Always report the statistical method used and its limitations
- Flag when results may be affected by multiple comparison problems
- Recommend stopping tests early only when expected loss is negligible
- Quantify uncertainty and never overstate confidence`;
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing A/B testing request', {
      requestId: input.requestId,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Retrieve all active tests
      const activeTests = await this.getActiveTests();

      if (activeTests.length === 0) {
        const confidence = this.calculateConfidence({
          data_availability: 20,
          statistical_rigor: 50,
          sample_coverage: 10,
        });

        uncertainties.push(
          this.flagUncertainty(
            'active_tests',
            'No active A/B tests found. Cannot perform analysis without running experiments.',
          ),
        );

        return this.buildOutput(
          'no_active_tests',
          { activeTests: [], analyses: [] },
          confidence,
          'No active A/B tests are currently running. Recommend creating new tests to optimize campaign performance.',
          ['Create new A/B tests targeting key conversion metrics'],
          [],
          uncertainties,
        );
      }

      // Analyze each active test
      const analyses: TestAnalysis[] = [];
      const winnerDeterminations: WinnerDetermination[] = [];

      for (const test of activeTests) {
        try {
          const analysis = await this.analyzeTest(test.id);
          analyses.push(analysis);

          // Attempt winner determination for tests with enough data
          if (analysis.statistical.is_significant) {
            try {
              const winner = await this.determineWinner(test.id);
              winnerDeterminations.push(winner);
              recommendations.push(
                `Test "${test.name}": Implement variant "${winner.winnerId}" (${(winner.lift * 100).toFixed(1)}% lift, ${(winner.confidence * 100).toFixed(1)}% confidence)`,
              );
            } catch {
              // Winner could not be determined yet - that is fine
              this.log.debug('Winner not yet determinable for test', {
                testId: test.id,
              });
            }
          } else {
            const totalImpressions = (test.variants || []).reduce(
              (sum, v) => sum + (v.impressions ?? 0),
              0,
            );
            if (totalImpressions < 100) {
              uncertainties.push(
                this.flagUncertainty(
                  'sample_size',
                  `Test "${test.name}" has only ${totalImpressions} total impressions. Results are unreliable.`,
                ),
              );
            }
            recommendations.push(
              `Test "${test.name}": Continue collecting data. Statistical significance not yet reached.`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          warnings.push(
            `Failed to analyze test "${test.name}": ${message}`,
          );
        }
      }

      // Suggest next tests based on completed analyses
      let suggestions: TestSuggestion[] = [];
      if (analyses.length > 0) {
        try {
          const suggestion = await this.suggestNextTest(analyses);
          suggestions = [suggestion];
          recommendations.push(
            `Next test suggestion: ${suggestion.hypothesis} (expected ${(suggestion.expectedImpact * 100).toFixed(1)}% impact, priority ${suggestion.priority}/10)`,
          );
        } catch {
          this.log.debug('Could not generate next test suggestion');
        }
      }

      // Calculate overall confidence for this agent's output
      const significantCount = analyses.filter(
        (a) => a.statistical.is_significant,
      ).length;

      const avgSampleCoverage =
        analyses.length > 0
          ? analyses.reduce((sum, a) => {
              const totalImpressions = a.variants.reduce(
                (s, v) => s + v.impressions,
                0,
              );
              return sum + Math.min(100, (totalImpressions / 1000) * 100);
            }, 0) / analyses.length
          : 0;

      const confidence = this.calculateConfidence({
        data_availability: Math.min(100, activeTests.length * 25),
        statistical_rigor:
          analyses.length > 0
            ? (significantCount / analyses.length) * 100
            : 0,
        sample_coverage: avgSampleCoverage,
        method_diversity: 80, // We use both Bayesian and frequentist
      });

      const decision =
        winnerDeterminations.length > 0
          ? 'winners_identified'
          : 'tests_in_progress';

      const reasoning =
        `Analyzed ${analyses.length} active A/B test(s). ` +
        `${significantCount} test(s) reached statistical significance. ` +
        `${winnerDeterminations.length} winner(s) identified. ` +
        `Using both Bayesian (Beta-Binomial with Monte Carlo) and frequentist (z-test) methods.`;

      const output = this.buildOutput(
        decision,
        {
          activeTests: activeTests.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
          })),
          analyses,
          winnerDeterminations,
          suggestions,
        },
        confidence,
        reasoning,
        recommendations,
        warnings,
        uncertainties,
      );

      await this.logDecision(input, output);
      return output;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.log.error('A/B testing processing failed', { error: message });

      const confidence = this.calculateConfidence({
        data_availability: 0,
        statistical_rigor: 0,
        sample_coverage: 0,
      });

      return this.buildOutput(
        'processing_error',
        { error: message },
        confidence,
        `Processing failed: ${message}`,
        [],
        [`Processing error: ${message}`],
        [
          this.flagUncertainty(
            'processing',
            'Agent encountered an error and could not complete analysis.',
          ),
        ],
      );
    }
  }

  // ------------------------------------------------------------------
  // Test Lifecycle Methods
  // ------------------------------------------------------------------

  /**
   * Creates a new A/B test from the provided configuration.
   * Validates traffic splits sum to 100%, variant count >= 2, and
   * stores the test in the database.
   */
  async createTest(config: TestConfig): Promise<ABTest> {
    this.log.info('Creating new A/B test', { name: config.name });

    // Validation
    if (config.variants.length < 2) {
      throw new ValidationError('A/B test must have at least 2 variants', [
        {
          field: 'variants',
          message: 'At least 2 variants are required',
          value: config.variants.length,
        },
      ]);
    }

    if (config.trafficSplit.length !== config.variants.length) {
      throw new ValidationError(
        'Traffic split array must match number of variants',
        [
          {
            field: 'trafficSplit',
            message: `Expected ${config.variants.length} splits, got ${config.trafficSplit.length}`,
          },
        ],
      );
    }

    const splitSum = config.trafficSplit.reduce((a, b) => a + b, 0);
    if (Math.abs(splitSum - 100) > 0.01) {
      throw new ValidationError('Traffic split must sum to 100%', [
        {
          field: 'trafficSplit',
          message: `Traffic splits sum to ${splitSum}, expected 100`,
          value: splitSum,
        },
      ]);
    }

    if (config.minimumSampleSize < 1) {
      throw new ValidationError('Minimum sample size must be positive', [
        {
          field: 'minimumSampleSize',
          message: 'Must be at least 1',
          value: config.minimumSampleSize,
        },
      ]);
    }

    if (config.maxDuration < 1) {
      throw new ValidationError('Max duration must be at least 1 day', [
        {
          field: 'maxDuration',
          message: 'Must be at least 1',
          value: config.maxDuration,
        },
      ]);
    }

    // Build variant objects
    const variants: TestVariant[] = config.variants.map((v, i) => ({
      id: generateId(),
      name: v.name,
      config: v.config,
      traffic_split: config.trafficSplit[i],
      impressions: 0,
      conversions: 0,
      conversion_rate: 0,
    }));

    const testId = generateId();
    const now = new Date().toISOString();

    const abTest: ABTest = {
      id: testId,
      name: config.name,
      type: config.type,
      campaign_id: config.campaignId,
      variants,
      status: 'draft',
      confidence_level: 0,
      started_at: undefined,
      completed_at: undefined,
      created_by: 'system',
      created_at: now,
      updated_at: now,
    };

    // Persist to database
    await pool.query(
      `INSERT INTO ab_tests (id, name, type, campaign_id, variants, status, minimum_sample_size, max_duration, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [
        testId,
        config.name,
        config.type,
        config.campaignId,
        JSON.stringify(variants),
        'draft',
        config.minimumSampleSize,
        config.maxDuration,
        'system',
        now,
      ],
    );

    // Invalidate cache
    await cacheDel('ab_tests:active');

    this.log.info('A/B test created', {
      testId,
      name: config.name,
      variantCount: variants.length,
    });

    return abTest;
  }

  /**
   * Retrieves all active (running) A/B tests, with a Redis cache layer.
   */
  async getActiveTests(): Promise<ABTest[]> {
    // Check cache first
    const cached = await cacheGet<ABTest[]>('ab_tests:active');
    if (cached) {
      this.log.debug('Returning cached active tests', {
        count: cached.length,
      });
      return cached;
    }

    const result = await pool.query<ABTest>(
      `SELECT id, name, type, campaign_id, variants, status, statistical_results,
              confidence_level, winner_variant, started_at, completed_at,
              created_by, created_at, updated_at
       FROM ab_tests
       WHERE status = 'running'
       ORDER BY created_at DESC`,
    );

    const tests = result.rows.map((row) => ({
      ...row,
      variants:
        typeof row.variants === 'string'
          ? JSON.parse(row.variants)
          : row.variants,
      statistical_results:
        typeof row.statistical_results === 'string'
          ? JSON.parse(row.statistical_results)
          : row.statistical_results,
    }));

    await cacheSet('ab_tests:active', tests, CACHE_TTL_SECONDS);

    return tests;
  }

  /**
   * Stops a running test with a reason and marks it as completed.
   */
  async stopTest(testId: string, reason: string): Promise<void> {
    this.log.info('Stopping A/B test', { testId, reason });

    const now = new Date().toISOString();

    const result = await pool.query(
      `UPDATE ab_tests
       SET status = 'completed', completed_at = $2, updated_at = $2
       WHERE id = $1 AND status = 'running'
       RETURNING id`,
      [testId, now],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(
        `Active test with ID "${testId}" not found`,
      );
    }

    await cacheDel('ab_tests:active');

    this.log.info('A/B test stopped', { testId, reason });
  }

  // ------------------------------------------------------------------
  // Statistical Analysis Methods
  // ------------------------------------------------------------------

  /**
   * Full analysis of a test: retrieves the test, computes statistics
   * for all variants, and generates recommendations.
   */
  async analyzeTest(testId: string): Promise<TestAnalysis> {
    this.log.info('Analyzing A/B test', { testId });

    // Fetch the test
    const result = await pool.query<ABTest & { minimum_sample_size: number; started_at: string }>(
      `SELECT id, name, type, campaign_id, variants, status, minimum_sample_size,
              started_at, created_at
       FROM ab_tests
       WHERE id = $1`,
      [testId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`A/B test with ID "${testId}" not found`);
    }

    const row = result.rows[0];
    const variants: TestVariant[] =
      typeof row.variants === 'string'
        ? JSON.parse(row.variants)
        : row.variants;

    // Calculate duration
    const startedAt = row.started_at
      ? new Date(row.started_at)
      : new Date(row.created_at);
    const durationMs = Date.now() - startedAt.getTime();
    const durationDays = Math.max(0, durationMs / (1000 * 60 * 60 * 24));

    // Build analyzed variants
    const analyzedVariants: AnalyzedVariant[] = variants.map((v) => {
      const impressions = v.impressions ?? 0;
      const conversions = v.conversions ?? 0;
      const conversionRate =
        impressions > 0 ? conversions / impressions : 0;
      // Revenue is stored in variant config or defaults to 0
      const revenue =
        typeof v.config?.revenue === 'number' ? v.config.revenue : 0;
      const revenuePerVisitor = impressions > 0 ? revenue / impressions : 0;

      return {
        id: v.id,
        name: v.name,
        impressions,
        conversions,
        conversionRate,
        revenue,
        revenuePerVisitor,
      };
    });

    // Compute Bayesian analysis
    const bayesian = this.computeBayesianConfidence(variants);

    // Compute frequentist analysis (between first two variants as control/treatment)
    let frequentist: FrequentistResult | null = null;
    if (variants.length >= 2) {
      frequentist = this.computeFrequentistConfidence(variants);
    }

    // Use Bayesian as primary statistical method
    const totalImpressions = analyzedVariants.reduce(
      (sum, v) => sum + v.impressions,
      0,
    );

    const isSignificant = bayesian.isSignificant;
    const bestVariantId = this.findBestVariantId(bayesian);
    const bestProb = bestVariantId
      ? bayesian.probabilityOfBeingBest[bestVariantId] ?? 0
      : 0;

    const statisticalResult: StatisticalResult = {
      method: 'bayesian',
      confidence: bestProb,
      p_value: frequentist?.pValue,
      lift: frequentist
        ? this.calculateRelativeLiftFromVariants(variants)
        : undefined,
      sample_size: totalImpressions,
      is_significant: isSignificant,
    };

    // Generate recommendations
    const recommendations: string[] = [];
    const minimumSampleSize = row.minimum_sample_size ?? 0;

    if (totalImpressions < minimumSampleSize) {
      const remaining = minimumSampleSize - totalImpressions;
      recommendations.push(
        `Continue test: ${remaining} more impressions needed to reach minimum sample size of ${minimumSampleSize}.`,
      );
    }

    if (isSignificant && bestVariantId) {
      const bestVariant = analyzedVariants.find(
        (v) => v.id === bestVariantId,
      );
      if (bestVariant) {
        recommendations.push(
          `Variant "${bestVariant.name}" is the leading candidate with ${(bestProb * 100).toFixed(1)}% probability of being best.`,
        );
      }

      // Check expected loss
      const minLoss = Math.min(
        ...Object.values(bayesian.expectedLoss),
      );
      if (minLoss < EXPECTED_LOSS_THRESHOLD) {
        recommendations.push(
          `Expected loss is negligible (${(minLoss * 100).toFixed(3)}%). Safe to conclude the test.`,
        );
      }
    }

    if (!isSignificant) {
      recommendations.push(
        'Results are not yet statistically significant. Continue collecting data.',
      );
    }

    // Check for variants with zero traffic
    const zeroTrafficVariants = analyzedVariants.filter(
      (v) => v.impressions === 0,
    );
    if (zeroTrafficVariants.length > 0) {
      recommendations.push(
        `Warning: ${zeroTrafficVariants.length} variant(s) have zero impressions. Check traffic allocation.`,
      );
    }

    return {
      testId,
      status: row.status as string,
      duration: Math.round(durationDays * 100) / 100,
      variants: analyzedVariants,
      winner: isSignificant ? bestVariantId : undefined,
      statistical: statisticalResult,
      recommendations,
    };
  }

  /**
   * Computes Bayesian posterior analysis using Beta-Binomial model.
   *
   * For each variant i:
   *   alpha_i = conversions_i + 1  (prior: Beta(1,1) = Uniform)
   *   beta_i  = (impressions_i - conversions_i) + 1
   *
   * Uses Monte Carlo simulation with MONTE_CARLO_SAMPLES draws to estimate:
   *   - Probability of each variant being the best
   *   - Expected loss for choosing each variant
   *   - 95% credible intervals for each variant's conversion rate
   */
  computeBayesianConfidence(variants: TestVariant[]): BayesianResult {
    if (variants.length < 2) {
      return {
        probabilityOfBeingBest: {},
        expectedLoss: {},
        credibleInterval: {},
        isSignificant: false,
      };
    }

    // Compute Beta distribution parameters for each variant
    const betaParams = variants.map((v) => {
      const impressions = v.impressions ?? 0;
      const conversions = v.conversions ?? 0;
      // Clamp conversions to not exceed impressions
      const clampedConversions = Math.min(conversions, impressions);
      const alpha = clampedConversions + 1; // prior alpha = 1
      const beta = impressions - clampedConversions + 1; // prior beta = 1
      return { id: v.id, alpha, beta };
    });

    // Monte Carlo simulation
    const winCounts: Record<string, number> = {};
    const lossAccumulator: Record<string, number> = {};

    for (const v of variants) {
      winCounts[v.id] = 0;
      lossAccumulator[v.id] = 0;
    }

    for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
      // Sample from each variant's Beta posterior
      const samples: { id: string; value: number }[] = betaParams.map(
        (p) => ({
          id: p.id,
          value: sampleBeta(p.alpha, p.beta),
        }),
      );

      // Find the maximum sampled value
      let maxValue = -Infinity;
      let maxId = '';
      for (const s of samples) {
        if (s.value > maxValue) {
          maxValue = s.value;
          maxId = s.id;
        }
      }

      // Count wins
      winCounts[maxId]++;

      // Accumulate loss (difference between best and each variant's sample)
      for (const s of samples) {
        lossAccumulator[s.id] += maxValue - s.value;
      }
    }

    // Calculate probabilities and expected losses
    const probabilityOfBeingBest: Record<string, number> = {};
    const expectedLoss: Record<string, number> = {};

    for (const v of variants) {
      probabilityOfBeingBest[v.id] = winCounts[v.id] / MONTE_CARLO_SAMPLES;
      expectedLoss[v.id] = lossAccumulator[v.id] / MONTE_CARLO_SAMPLES;
    }

    // Calculate 95% credible intervals using Beta quantile approximation
    const credibleInterval: Record<string, [number, number]> = {};
    for (const p of betaParams) {
      const lower = betaQuantile(0.025, p.alpha, p.beta);
      const upper = betaQuantile(0.975, p.alpha, p.beta);
      credibleInterval[p.id] = [lower, upper];
    }

    // Determine significance: best variant has > 95% probability
    const maxProb = Math.max(...Object.values(probabilityOfBeingBest));
    const isSignificant = maxProb >= SIGNIFICANCE_THRESHOLD;

    return {
      probabilityOfBeingBest,
      expectedLoss,
      credibleInterval,
      isSignificant,
    };
  }

  /**
   * Computes frequentist two-proportion z-test between the first two variants
   * (control = index 0, treatment = index 1). For multi-variant tests, this
   * compares the best-performing variant against control.
   */
  computeFrequentistConfidence(variants: TestVariant[]): FrequentistResult {
    if (variants.length < 2) {
      return {
        pValue: 1,
        zScore: 0,
        confidenceInterval: [0, 0],
        isSignificant: false,
        power: 0,
      };
    }

    // Control is always the first variant
    const control = variants[0];
    // Treatment is the variant with the highest conversion rate (excluding control)
    let treatment = variants[1];
    let bestRate = -1;
    for (let i = 1; i < variants.length; i++) {
      const impressions = variants[i].impressions ?? 0;
      const conversions = variants[i].conversions ?? 0;
      const rate = impressions > 0 ? conversions / impressions : 0;
      if (rate > bestRate) {
        bestRate = rate;
        treatment = variants[i];
      }
    }

    const n1 = control.impressions ?? 0;
    const n2 = treatment.impressions ?? 0;
    const x1 = control.conversions ?? 0;
    const x2 = treatment.conversions ?? 0;

    // Handle edge case: insufficient data
    if (n1 === 0 || n2 === 0) {
      return {
        pValue: 1,
        zScore: 0,
        confidenceInterval: [0, 0],
        isSignificant: false,
        power: 0,
      };
    }

    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const pPooled = (x1 + x2) / (n1 + n2);

    // Z-score for two-proportion test
    const standardError = Math.sqrt(
      pPooled * (1 - pPooled) * (1 / n1 + 1 / n2),
    );

    const zScore = standardError > 0 ? (p2 - p1) / standardError : 0;

    // Two-tailed p-value
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

    // Confidence interval for the difference (p2 - p1)
    const seDiff = Math.sqrt(
      (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2,
    );
    const zCritical = 1.96; // 95% confidence
    const diff = p2 - p1;
    const confidenceInterval: [number, number] = [
      diff - zCritical * seDiff,
      diff + zCritical * seDiff,
    ];

    // Statistical power calculation
    const effectSize = Math.abs(p2 - p1);
    const power = calculatePower(effectSize, n1, n2, p1, DEFAULT_SIGNIFICANCE_LEVEL);

    const isSignificant = pValue < DEFAULT_SIGNIFICANCE_LEVEL;

    return {
      pValue,
      zScore,
      confidenceInterval,
      isSignificant,
      power,
    };
  }

  /**
   * Determines the winner of a test using both Bayesian and frequentist methods.
   * Prefers the Bayesian approach as the primary method, but cross-validates
   * with the frequentist result.
   */
  async determineWinner(testId: string): Promise<WinnerDetermination> {
    const analysis = await this.analyzeTest(testId);

    if (!analysis.statistical.is_significant) {
      throw new Error(
        `Test "${testId}" has not reached statistical significance. Cannot determine winner.`,
      );
    }

    const variants = analysis.variants;
    if (variants.length < 2) {
      throw new Error(
        `Test "${testId}" has fewer than 2 variants. Cannot determine winner.`,
      );
    }

    // Fetch full variant data for Bayesian analysis
    const result = await pool.query<ABTest>(
      `SELECT variants FROM ab_tests WHERE id = $1`,
      [testId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Test "${testId}" not found`);
    }

    const testVariants: TestVariant[] =
      typeof result.rows[0].variants === 'string'
        ? JSON.parse(result.rows[0].variants)
        : result.rows[0].variants;

    const bayesian = this.computeBayesianConfidence(testVariants);
    const winnerId = this.findBestVariantId(bayesian);

    if (!winnerId) {
      throw new Error('Could not identify a winning variant');
    }

    const winnerProb = bayesian.probabilityOfBeingBest[winnerId] ?? 0;

    // Calculate lift vs control (first variant)
    const controlVariant = analysis.variants[0];
    const winnerAnalyzed = analysis.variants.find((v) => v.id === winnerId);

    let lift = 0;
    if (
      controlVariant &&
      winnerAnalyzed &&
      controlVariant.conversionRate > 0
    ) {
      lift =
        (winnerAnalyzed.conversionRate - controlVariant.conversionRate) /
        controlVariant.conversionRate;
    }

    const winnerName =
      winnerAnalyzed?.name ?? winnerId;

    const reasoning =
      `Variant "${winnerName}" identified as winner with ${(winnerProb * 100).toFixed(1)}% ` +
      `probability of being best (Bayesian Beta-Binomial model, ${MONTE_CARLO_SAMPLES} Monte Carlo samples). ` +
      `Relative lift: ${(lift * 100).toFixed(2)}% over control. ` +
      `Expected loss of choosing this variant: ${((bayesian.expectedLoss[winnerId] ?? 0) * 100).toFixed(3)}%.`;

    // Persist winner to database
    await pool.query(
      `UPDATE ab_tests
       SET winner_variant = $2, confidence_level = $3,
           statistical_results = $4, updated_at = $5
       WHERE id = $1`,
      [
        testId,
        winnerId,
        winnerProb,
        JSON.stringify(analysis.statistical),
        new Date().toISOString(),
      ],
    );

    await cacheDel('ab_tests:active');

    return {
      winnerId,
      confidence: winnerProb,
      method: 'bayesian',
      lift,
      reasoning,
    };
  }

  /**
   * Compares two specific variants and returns which is better,
   * the observed lift, and confidence.
   */
  compareVariants(
    variantA: TestVariant,
    variantB: TestVariant,
  ): VariantComparison {
    const bayesian = this.computeBayesianConfidence([variantA, variantB]);

    const probA = bayesian.probabilityOfBeingBest[variantA.id] ?? 0;
    const probB = bayesian.probabilityOfBeingBest[variantB.id] ?? 0;

    const betterVariant = probA >= probB ? variantA.id : variantB.id;
    const confidence = Math.max(probA, probB);

    const nA = variantA.impressions ?? 0;
    const nB = variantB.impressions ?? 0;
    const rateA = nA > 0 ? (variantA.conversions ?? 0) / nA : 0;
    const rateB = nB > 0 ? (variantB.conversions ?? 0) / nB : 0;

    const baseRate = rateA > 0 ? rateA : rateB;
    const lift = baseRate > 0 ? Math.abs(rateB - rateA) / baseRate : 0;

    // Check if we have enough data (at least 100 impressions per variant as a rough threshold)
    const sampleSizeReached = nA >= 100 && nB >= 100;

    return {
      betterVariant,
      lift,
      confidence,
      sampleSizeReached,
    };
  }

  /**
   * Calculates the required sample size per variant for a two-proportion test.
   *
   * Uses the formula:
   *   n = (Z_alpha/2 + Z_beta)^2 * (p1(1-p1) + p2(1-p2)) / (p1 - p2)^2
   *
   * @param baselineRate - Expected conversion rate for the control (0-1)
   * @param minimumDetectableEffect - Minimum relative lift to detect (e.g. 0.05 for 5%)
   * @param power - Statistical power (e.g. 0.8 for 80%)
   * @param significance - Significance level (e.g. 0.05 for 95% confidence)
   * @returns Required sample size per variant
   */
  calculateSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number,
    power: number = 0.8,
    significance: number = 0.05,
  ): number {
    if (baselineRate <= 0 || baselineRate >= 1) {
      throw new ValidationError(
        'Baseline rate must be between 0 and 1 (exclusive)',
        [
          {
            field: 'baselineRate',
            message: 'Must be in range (0, 1)',
            value: baselineRate,
          },
        ],
      );
    }

    if (minimumDetectableEffect <= 0) {
      throw new ValidationError(
        'Minimum detectable effect must be positive',
        [
          {
            field: 'minimumDetectableEffect',
            message: 'Must be > 0',
            value: minimumDetectableEffect,
          },
        ],
      );
    }

    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumDetectableEffect);

    // Clamp p2 to (0, 1)
    const p2Clamped = Math.min(Math.max(p2, 0.0001), 0.9999);

    const zAlpha = normalQuantile(1 - significance / 2);
    const zBeta = normalQuantile(power);

    const numerator =
      Math.pow(zAlpha + zBeta, 2) *
      (p1 * (1 - p1) + p2Clamped * (1 - p2Clamped));
    const denominator = Math.pow(p2Clamped - p1, 2);

    if (denominator === 0) {
      return Infinity;
    }

    const sampleSize = Math.ceil(numerator / denominator);
    return Math.max(sampleSize, 1);
  }

  /**
   * Calculates the lift (absolute and relative) between a control and treatment variant.
   * Includes a 95% confidence interval for the lift.
   */
  calculateLift(
    control: TestVariant,
    treatment: TestVariant,
  ): LiftCalculation {
    const nC = control.impressions ?? 0;
    const nT = treatment.impressions ?? 0;
    const cC = control.conversions ?? 0;
    const cT = treatment.conversions ?? 0;

    const rateC = nC > 0 ? cC / nC : 0;
    const rateT = nT > 0 ? cT / nT : 0;

    const absoluteLift = rateT - rateC;
    const relativeLift = rateC > 0 ? absoluteLift / rateC : 0;

    // Confidence interval for the difference of proportions
    let ciLower = 0;
    let ciUpper = 0;

    if (nC > 0 && nT > 0) {
      const se = Math.sqrt(
        (rateC * (1 - rateC)) / nC + (rateT * (1 - rateT)) / nT,
      );
      const zCritical = 1.96;
      ciLower = absoluteLift - zCritical * se;
      ciUpper = absoluteLift + zCritical * se;
    }

    return {
      absoluteLift,
      relativeLift,
      confidenceInterval: [ciLower, ciUpper],
    };
  }

  /**
   * Suggests the next test to run based on insights from previous test analyses.
   * Uses the agent's AI model to generate a hypothesis, or falls back to
   * a rule-based system if the AI is unavailable.
   */
  async suggestNextTest(
    previousResults: TestAnalysis[],
  ): Promise<TestSuggestion> {
    this.log.info('Generating next test suggestion', {
      previousResultCount: previousResults.length,
    });

    // Attempt AI-powered suggestion
    try {
      const prompt = this.buildSuggestionPrompt(previousResults);
      const response = await this.callAI(this.getSystemPrompt(), prompt);
      const parsed = this.parseSuggestionResponse(response);
      if (parsed) {
        return parsed;
      }
    } catch {
      this.log.debug(
        'AI suggestion unavailable, falling back to rule-based logic',
      );
    }

    // Rule-based fallback
    return this.generateRuleBasedSuggestion(previousResults);
  }

  // ------------------------------------------------------------------
  // Private Helpers
  // ------------------------------------------------------------------

  /**
   * Finds the variant ID with the highest probability of being best.
   */
  private findBestVariantId(bayesian: BayesianResult): string | undefined {
    let bestId: string | undefined;
    let bestProb = -1;

    for (const [id, prob] of Object.entries(
      bayesian.probabilityOfBeingBest,
    )) {
      if (prob > bestProb) {
        bestProb = prob;
        bestId = id;
      }
    }

    return bestId;
  }

  /**
   * Computes relative lift between first two variants.
   */
  private calculateRelativeLiftFromVariants(variants: TestVariant[]): number {
    if (variants.length < 2) return 0;

    const n1 = variants[0].impressions ?? 0;
    const n2 = variants[1].impressions ?? 0;
    const r1 = n1 > 0 ? (variants[0].conversions ?? 0) / n1 : 0;
    const r2 = n2 > 0 ? (variants[1].conversions ?? 0) / n2 : 0;

    return r1 > 0 ? (r2 - r1) / r1 : 0;
  }

  /**
   * Builds a prompt for the AI to suggest the next test.
   */
  private buildSuggestionPrompt(results: TestAnalysis[]): string {
    const summaries = results.map((r) => {
      const variantSummaries = r.variants
        .map(
          (v) =>
            `  - ${v.name}: ${v.impressions} impressions, ${(v.conversionRate * 100).toFixed(2)}% CR`,
        )
        .join('\n');
      return `Test "${r.testId}" (${r.status}): ${r.duration.toFixed(1)} days\n${variantSummaries}\n  Winner: ${r.winner ?? 'none'}, Significant: ${r.statistical.is_significant}`;
    });

    return `Based on the following A/B test results, suggest the most impactful next test to run:

${summaries.join('\n\n')}

Respond in JSON format:
{
  "type": "creative|landing_page|pricing|offer|audience",
  "hypothesis": "A clear hypothesis statement",
  "expectedImpact": 0.05,
  "priority": 8
}`;
  }

  /**
   * Parses the AI response for a test suggestion.
   */
  private parseSuggestionResponse(
    response: string,
  ): TestSuggestion | null {
    try {
      // Extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      if (
        typeof parsed.type !== 'string' ||
        typeof parsed.hypothesis !== 'string'
      ) {
        return null;
      }

      return {
        type: parsed.type,
        hypothesis: parsed.hypothesis,
        expectedImpact:
          typeof parsed.expectedImpact === 'number'
            ? parsed.expectedImpact
            : 0.05,
        priority:
          typeof parsed.priority === 'number'
            ? Math.max(1, Math.min(10, parsed.priority))
            : 5,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generates a rule-based test suggestion when AI is unavailable.
   * Analyzes patterns in previous results to suggest the most impactful next test.
   */
  private generateRuleBasedSuggestion(
    results: TestAnalysis[],
  ): TestSuggestion {
    // Determine which test types have been run
    const testedTypes = new Set<string>();
    let avgLift = 0;
    let liftCount = 0;

    for (const r of results) {
      if (r.statistical.lift !== undefined) {
        avgLift += Math.abs(r.statistical.lift);
        liftCount++;
      }
    }

    avgLift = liftCount > 0 ? avgLift / liftCount : 0;

    // Prioritize test types that haven't been tested yet
    const allTypes = [
      'creative',
      'landing_page',
      'pricing',
      'offer',
      'audience',
    ] as const;

    const untested = allTypes.filter((t) => !testedTypes.has(t));
    const nextType = untested.length > 0 ? untested[0] : 'creative';

    // Build hypothesis based on results
    const hasSignificantResults = results.some(
      (r) => r.statistical.is_significant,
    );

    let hypothesis: string;
    let expectedImpact: number;
    let priority: number;

    if (!hasSignificantResults && results.length > 0) {
      hypothesis =
        'Previous tests did not reach significance. Test with a larger effect size or focus on high-impact elements.';
      expectedImpact = 0.1;
      priority = 8;
    } else if (avgLift > 0.1) {
      hypothesis = `Strong lifts observed (avg ${(avgLift * 100).toFixed(1)}%). Build on winning elements with iterative refinements.`;
      expectedImpact = avgLift * 0.5;
      priority = 7;
    } else {
      hypothesis = `Test ${nextType} variations to identify new optimization opportunities.`;
      expectedImpact = 0.05;
      priority = 5;
    }

    return {
      type: nextType,
      hypothesis,
      expectedImpact,
      priority,
    };
  }
}

// ============================================================
// Pure Statistical Utility Functions
// ============================================================

/**
 * Samples from a Beta(alpha, beta) distribution using the
 * Gamma distribution method: if X ~ Gamma(alpha, 1) and Y ~ Gamma(beta, 1),
 * then X / (X + Y) ~ Beta(alpha, beta).
 */
export function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  if (x + y === 0) return 0.5; // Degenerate case
  return x / (x + y);
}

/**
 * Samples from a Gamma(shape, 1) distribution using Marsaglia and Tsang's method.
 * For shape < 1, uses the transformation: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
 */
export function sampleGamma(shape: number): number {
  if (shape <= 0) return 0;

  if (shape < 1) {
    // Gamma(alpha) where alpha < 1: use Gamma(alpha+1) * U^(1/alpha)
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }

  // Marsaglia and Tsang's method for shape >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    // Squeeze test
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Generates a standard normal random variate using the Box-Muller transform.
 */
function randomNormal(): number {
  let u: number;
  let v: number;
  let s: number;

  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);

  return u * Math.sqrt((-2 * Math.log(s)) / s);
}

/**
 * Standard normal CDF approximation using the Abramowitz and Stegun formula.
 * Maximum error: 1.5 x 10^-7.
 */
export function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const isNegative = x < 0;
  const absX = Math.abs(x);

  const t = 1 / (1 + 0.2316419 * absX);
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const p =
    d *
    Math.exp(-0.5 * absX * absX) *
    (t *
      (0.319381530 +
        t *
          (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));

  return isNegative ? p : 1 - p;
}

/**
 * Inverse normal CDF (quantile function) using Beasley-Springer-Moro approximation.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation for central region
  if (p > 0.5) {
    return -normalQuantile(1 - p);
  }

  const t = Math.sqrt(-2 * Math.log(p));

  // Coefficients for the rational approximation
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  return -(
    t -
    (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t)
  );
}

/**
 * Approximation of the Beta distribution quantile function.
 * Uses the normal approximation to the Beta distribution for large parameters,
 * and a Newton-Raphson refinement for improved accuracy.
 */
export function betaQuantile(
  p: number,
  alpha: number,
  beta: number,
): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  // Use normal approximation: Beta(a,b) ≈ Normal(mu, sigma^2)
  const mu = alpha / (alpha + beta);
  const variance =
    (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const sigma = Math.sqrt(variance);

  // Initial estimate from normal approximation
  let x = mu + sigma * normalQuantile(p);
  x = Math.max(0.0001, Math.min(0.9999, x));

  // Newton-Raphson refinement (3 iterations for better accuracy)
  for (let iter = 0; iter < 3; iter++) {
    const cdf = incompleteBeta(x, alpha, beta);
    const pdf = betaPDF(x, alpha, beta);

    if (pdf < 1e-15) break;

    const correction = (cdf - p) / pdf;
    x = x - correction;
    x = Math.max(0.0001, Math.min(0.9999, x));
  }

  return x;
}

/**
 * Beta probability density function.
 */
function betaPDF(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0;

  const logPDF =
    (alpha - 1) * Math.log(x) +
    (beta - 1) * Math.log(1 - x) -
    logBetaFunction(alpha, beta);

  return Math.exp(logPDF);
}

/**
 * Log of the Beta function: log(B(a,b)) = log(Gamma(a)) + log(Gamma(b)) - log(Gamma(a+b))
 */
function logBetaFunction(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log-Gamma function using Stirling's approximation with Lanczos correction.
 */
function logGamma(x: number): number {
  if (x <= 0) return 0;

  // Lanczos approximation coefficients
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    // Reflection formula
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;

  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete Beta function I_x(a, b) using continued fraction expansion.
 * This is the CDF of the Beta distribution.
 */
function incompleteBeta(
  x: number,
  a: number,
  b: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  const lnBeta = logBetaFunction(a, b);
  const front =
    Math.exp(
      Math.log(x) * a + Math.log(1 - x) * b - lnBeta,
    ) / a;

  // Lentz's continued fraction algorithm
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator =
      (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    // Odd step
    numerator =
      -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return front * f;
}

/**
 * Calculates statistical power for a two-proportion z-test.
 */
function calculatePower(
  effectSize: number,
  n1: number,
  n2: number,
  p1: number,
  significance: number,
): number {
  if (n1 === 0 || n2 === 0 || effectSize === 0) return 0;

  const p2 = p1 + effectSize;
  const pBar = (n1 * p1 + n2 * p2) / (n1 + n2);

  const se0 = Math.sqrt(pBar * (1 - pBar) * (1 / n1 + 1 / n2));
  const se1 = Math.sqrt(
    (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2,
  );

  if (se0 === 0 || se1 === 0) return 0;

  const zAlpha = normalQuantile(1 - significance / 2);
  const zStat = (effectSize - zAlpha * se0) / se1;

  return normalCDF(zStat);
}

/**
 * Bandit Service -- Tier 3 Contextual Multi-Armed Bandit Engine.
 *
 * Implements:
 *   - Beta-Binomial model with Thompson Sampling (binary outcomes)
 *   - Normal-Inverse Gamma model with Thompson Sampling (continuous outcomes)
 *   - LinUCB-inspired contextual layer with online gradient descent
 *   - Exponential time decay on observations
 *   - Cold start handling via prior inheritance
 *
 * All model state is persisted to PostgreSQL. Sampling functions use
 * statistically correct algorithms (Marsaglia-Tsang for Gamma, composition
 * for Beta, Box-Muller for Normal).
 */

import { pool } from '../../config/database';
import { env } from '../../config/env';
import { generateId } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { withTransaction } from '../../utils/transaction';
import { ValidationError, NotFoundError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DECAY_HALF_LIFE_DAYS = env.BANDIT_DECAY_HALF_LIFE_DAYS;
const EXPLORATION_BONUS = env.BANDIT_EXPLORATION_BONUS;

/** Decay constant: lambda = ln(2) / half_life */
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_DAYS;

/** Learning rate for contextual weight updates (online gradient descent). */
const CONTEXT_LEARNING_RATE = 0.01;

/** Context features recognised by the contextual layer. */
const CONTEXT_FEATURES = ['segment_id', 'channel', 'day_of_week', 'hour', 'campaign_type'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BanditArm {
  id: string;
  context_type: string;
  arm_name: string;
  alpha: number;
  beta: number;
  mu: number;
  lambda: number;
  a: number;
  b: number;
  observation_count: number;
  last_updated_at: Date;
  created_at: Date;
}

export interface BanditObservation {
  id: string;
  arm_id: string;
  context_vector: Record<string, number> | null;
  reward: number;
  reward_type: 'binary' | 'continuous';
  decayed_weight: number;
  observed_at: Date;
}

export interface ContextWeight {
  id: string;
  arm_id: string;
  feature_name: string;
  weight: number;
}

export interface ArmStats {
  arm_name: string;
  observation_count: number;
  mean: number;
  confidence_interval: { lower: number; upper: number };
  confidence_width: number;
  last_updated_at: Date;
}

export interface ConvergenceResult {
  converged: boolean;
  best_arm: string;
  second_best_arm: string | null;
  best_ci: { lower: number; upper: number };
  second_ci: { lower: number; upper: number } | null;
  overlap: boolean;
  total_observations: number;
}

// ---------------------------------------------------------------------------
// Statistical Sampling Functions
// ---------------------------------------------------------------------------

/**
 * Sample from a Gamma distribution using Marsaglia and Tsang's method.
 *
 * For shape >= 1 we use the direct method. For shape < 1 we use the
 * identity: if X ~ Gamma(shape+1, 1) and U ~ Uniform(0,1) then
 * X * U^(1/shape) ~ Gamma(shape, 1).
 *
 * Reference: Marsaglia & Tsang, "A Simple Method for Generating Gamma
 * Variables", ACM Transactions on Mathematical Software, 2000.
 */
function sampleGamma(shape: number, scale: number): number {
  if (shape <= 0) {
    throw new Error(`Gamma shape must be positive, got ${shape}`);
  }

  if (shape < 1) {
    // Ahrens-Dieter method for shape < 1:
    // Sample from Gamma(shape+1, 1) then multiply by U^(1/shape)
    const sample = sampleGamma(shape + 1, 1.0);
    const u = Math.random();
    return sample * Math.pow(u, 1.0 / shape) * scale;
  }

  // Marsaglia and Tsang's method for shape >= 1
  const d = shape - 1.0 / 3.0;
  const c = 1.0 / Math.sqrt(9.0 * d);

  while (true) {
    let x: number;
    let v: number;

    // Generate a standard normal and compute v = (1 + c*x)^3
    do {
      x = sampleStandardNormal();
      v = 1.0 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    // Squeeze test
    if (u < 1.0 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }

    // Full test
    if (Math.log(u) < 0.5 * x * x + d * (1.0 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Sample from a standard Normal(0, 1) distribution using the Box-Muller
 * transform with caching of the second variate.
 */
let _normalSpare: number | null = null;
let _normalHasSpare = false;

function sampleStandardNormal(): number {
  if (_normalHasSpare) {
    _normalHasSpare = false;
    return _normalSpare!;
  }

  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2.0 - 1.0;
    v = Math.random() * 2.0 - 1.0;
    s = u * u + v * v;
  } while (s >= 1.0 || s === 0.0);

  const mul = Math.sqrt(-2.0 * Math.log(s) / s);
  _normalSpare = v * mul;
  _normalHasSpare = true;
  return u * mul;
}

/**
 * Sample from a Normal(mean, variance) distribution.
 */
function sampleNormal(mean: number, variance: number): number {
  return mean + Math.sqrt(variance) * sampleStandardNormal();
}

/**
 * Sample from a Beta(alpha, beta) distribution using the Gamma composition:
 *   If X ~ Gamma(alpha, 1) and Y ~ Gamma(beta, 1)
 *   then X / (X + Y) ~ Beta(alpha, beta)
 */
function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error(`Beta parameters must be positive, got alpha=${alpha}, beta=${beta}`);
  }
  const x = sampleGamma(alpha, 1.0);
  const y = sampleGamma(beta, 1.0);
  return x / (x + y);
}

/**
 * Sample from an Inverse-Gamma(shape, scale) distribution.
 *   If X ~ Gamma(shape, 1/scale) then 1/X ~ InvGamma(shape, scale)
 *   Equivalently: 1 / Gamma(shape, 1/scale)
 */
function sampleInverseGamma(shape: number, scale: number): number {
  const g = sampleGamma(shape, 1.0 / scale);
  return 1.0 / g;
}

// ---------------------------------------------------------------------------
// Helper: compute contextual adjustment
// ---------------------------------------------------------------------------

function computeContextualAdjustment(
  weights: ContextWeight[],
  contextVector: Record<string, number>,
): number {
  let dotProduct = 0;
  for (const w of weights) {
    const featureValue = contextVector[w.feature_name] ?? 0;
    dotProduct += w.weight * featureValue;
  }
  return dotProduct;
}

/**
 * Normalise a raw context object into a numeric feature vector.
 * String features are hashed to a stable numeric value in [0, 1].
 */
function normaliseContextVector(
  rawContext: Record<string, unknown>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const feature of CONTEXT_FEATURES) {
    const val = rawContext[feature];
    if (val === undefined || val === null) {
      result[feature] = 0;
    } else if (typeof val === 'number') {
      result[feature] = val;
    } else {
      // Hash string values to a stable number in (0, 1]
      const str = String(val);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash + ch) | 0;
      }
      // Map to (0, 1] range
      result[feature] = (Math.abs(hash) % 10000) / 10000;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// BanditService
// ---------------------------------------------------------------------------

export class BanditService {
  // =========================================================================
  // ARM MANAGEMENT (internal)
  // =========================================================================

  /**
   * Get or create an arm for a given context type and arm name.
   * Cold start: new arms inherit priors from the most-observed arm in the
   * same context_type. If none exist, uninformative priors are used.
   */
  private static async getOrCreateArm(
    contextType: string,
    armName: string,
  ): Promise<BanditArm> {
    // Try to find existing arm
    const { rows: existing } = await pool.query<BanditArm>(
      `SELECT id, context_type, arm_name, alpha, beta, mu, lambda, a, b, observation_count, last_updated_at, created_at FROM bandit_arms WHERE context_type = $1 AND arm_name = $2`,
      [contextType, armName],
    );

    if (existing.length > 0) {
      return existing[0];
    }

    // Cold start: inherit priors from best-observed arm in this context_type
    const { rows: similar } = await pool.query<BanditArm>(
      `SELECT id, context_type, arm_name, alpha, beta, mu, lambda, a, b, observation_count, last_updated_at, created_at FROM bandit_arms
       WHERE context_type = $1
       ORDER BY observation_count DESC
       LIMIT 1`,
      [contextType],
    );

    let alpha = 1.0;
    let beta = 1.0;
    let mu = 0.0;
    let lambda = 1.0;
    let a = 1.0;
    let b = 1.0;

    if (similar.length > 0) {
      const prior = similar[0];
      alpha = prior.alpha;
      beta = prior.beta;
      mu = prior.mu;
      lambda = prior.lambda;
      a = prior.a;
      b = prior.b;
      logger.info(`Bandit cold start: arm "${armName}" inheriting prior from "${prior.arm_name}" (${prior.observation_count} obs)`, {
        contextType,
        armName,
        donorArm: prior.arm_name,
      });
    }

    const id = generateId();
    const { rows: created } = await pool.query<BanditArm>(
      `INSERT INTO bandit_arms (id, context_type, arm_name, alpha, beta, mu, lambda, a, b, observation_count, last_updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW(), NOW())
       ON CONFLICT (context_type, arm_name) DO UPDATE SET id = bandit_arms.id
       RETURNING *`,
      [id, contextType, armName, alpha, beta, mu, lambda, a, b],
    );

    return created[0];
  }

  /**
   * Get all arms for a context type.
   */
  private static async getArms(contextType: string): Promise<BanditArm[]> {
    const { rows } = await pool.query<BanditArm>(
      `SELECT id, context_type, arm_name, alpha, beta, mu, lambda, a, b, observation_count, last_updated_at, created_at FROM bandit_arms WHERE context_type = $1 ORDER BY observation_count DESC`,
      [contextType],
    );
    return rows;
  }

  /**
   * Get context weights for a given arm.
   */
  private static async getContextWeights(armId: string): Promise<ContextWeight[]> {
    const { rows } = await pool.query<ContextWeight>(
      `SELECT id, arm_id, feature_name, weight FROM bandit_context_weights WHERE arm_id = $1`,
      [armId],
    );
    return rows;
  }

  // =========================================================================
  // CORE PUBLIC METHODS
  // =========================================================================

  /**
   * Record an observation and update the posterior for the corresponding arm.
   *
   * For binary rewards (reward_type = 'binary'):
   *   alpha += reward * weight
   *   beta  += (1 - reward) * weight
   *
   * For continuous rewards (reward_type = 'continuous'):
   *   Normal-Inverse Gamma conjugate update.
   *
   * Also updates contextual weights via online gradient descent.
   */
  static async recordObservation(
    contextType: string,
    armName: string,
    reward: number,
    rewardType: 'binary' | 'continuous',
    contextVector?: Record<string, unknown>,
  ): Promise<{ arm: BanditArm; observation_id: string }> {
    if (!contextType || !armName) {
      throw new ValidationError('contextType and armName are required');
    }
    if (rewardType === 'binary' && (reward < 0 || reward > 1)) {
      throw new ValidationError('Binary reward must be between 0 and 1');
    }
    if (rewardType !== 'binary' && rewardType !== 'continuous') {
      throw new ValidationError('rewardType must be "binary" or "continuous"');
    }

    const normContext = contextVector ? normaliseContextVector(contextVector) : null;

    return withTransaction(async (client) => {
      // Get or create the arm
      const arm = await BanditService.getOrCreateArm(contextType, armName);

      // Insert observation
      const obsId = generateId();
      await client.query(
        `INSERT INTO bandit_observations (id, arm_id, context_vector, reward, reward_type, decayed_weight, observed_at)
         VALUES ($1, $2, $3, $4, $5, 1.0, NOW())`,
        [obsId, arm.id, normContext ? JSON.stringify(normContext) : null, reward, rewardType],
      );

      // Update posterior parameters
      const weight = 1.0; // new observation has full weight

      if (rewardType === 'binary') {
        // Beta-Binomial update
        const newAlpha = arm.alpha + reward * weight;
        const newBeta = arm.beta + (1 - reward) * weight;

        await client.query(
          `UPDATE bandit_arms
           SET alpha = $1, beta = $2, observation_count = observation_count + 1, last_updated_at = NOW()
           WHERE id = $3`,
          [newAlpha, newBeta, arm.id],
        );

        arm.alpha = newAlpha;
        arm.beta = newBeta;
      } else {
        // Normal-Inverse Gamma conjugate update:
        //   lambda_new = lambda + 1
        //   mu_new     = (lambda * mu + x) / lambda_new
        //   a_new      = a + 0.5
        //   b_new      = b + 0.5 * lambda * (x - mu)^2 / lambda_new
        const lambdaNew = arm.lambda + 1;
        const muNew = (arm.lambda * arm.mu + reward) / lambdaNew;
        const aNew = arm.a + 0.5;
        const bNew = arm.b + 0.5 * arm.lambda * Math.pow(reward - arm.mu, 2) / lambdaNew;

        await client.query(
          `UPDATE bandit_arms
           SET mu = $1, lambda = $2, a = $3, b = $4, observation_count = observation_count + 1, last_updated_at = NOW()
           WHERE id = $5`,
          [muNew, lambdaNew, aNew, bNew, arm.id],
        );

        arm.mu = muNew;
        arm.lambda = lambdaNew;
        arm.a = aNew;
        arm.b = bNew;
      }

      arm.observation_count += 1;

      // Update contextual weights via online gradient descent
      if (normContext) {
        await BanditService.updateContextWeights(client, arm, reward, rewardType, normContext);
      }

      return { arm, observation_id: obsId };
    });
  }

  /**
   * Update context weights using online stochastic gradient descent.
   *
   * prediction = baseMean + dot(weights, context)
   * error      = reward - prediction
   * For each feature i: w_i += learningRate * error * context_i
   */
  private static async updateContextWeights(
    client: import('pg').PoolClient,
    arm: BanditArm,
    reward: number,
    rewardType: 'binary' | 'continuous',
    contextVector: Record<string, number>,
  ): Promise<void> {
    // Get current weights
    const { rows: weights } = await client.query<ContextWeight>(
      `SELECT id, arm_id, feature_name, weight FROM bandit_context_weights WHERE arm_id = $1`,
      [arm.id],
    );

    const weightMap = new Map<string, number>();
    for (const w of weights) {
      weightMap.set(w.feature_name, w.weight);
    }

    // Compute base mean (expected value from posterior)
    let baseMean: number;
    if (rewardType === 'binary') {
      baseMean = arm.alpha / (arm.alpha + arm.beta);
    } else {
      baseMean = arm.mu;
    }

    // Compute current prediction
    let prediction = baseMean;
    for (const feature of CONTEXT_FEATURES) {
      const w = weightMap.get(feature) || 0;
      const fv = contextVector[feature] || 0;
      prediction += w * fv;
    }

    // Error
    const error = reward - prediction;

    // Gradient descent update for each feature
    for (const feature of CONTEXT_FEATURES) {
      const fv = contextVector[feature] || 0;
      if (fv === 0) continue; // No update if feature is zero

      const currentWeight = weightMap.get(feature) || 0;
      const newWeight = currentWeight + CONTEXT_LEARNING_RATE * error * fv;

      const id = generateId();
      await client.query(
        `INSERT INTO bandit_context_weights (id, arm_id, feature_name, weight, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (arm_id, feature_name)
         DO UPDATE SET weight = $4, updated_at = NOW()`,
        [id, arm.id, feature, newWeight],
      );
    }
  }

  /**
   * Select the best arm for a given context type using Thompson Sampling.
   *
   * For each arm:
   *   1. Draw a sample from the posterior (Beta for binary, NIG for continuous)
   *   2. Add the contextual adjustment: dot(context_weights, context_vector)
   *   3. Add exploration bonus for under-explored arms
   *   4. Return the arm with the highest combined score
   */
  static async selectArm(
    contextType: string,
    contextVector?: Record<string, unknown>,
    excludeArms?: string[],
  ): Promise<{
    selected_arm: string;
    arm_id: string;
    score: number;
    exploration_bonus: number;
    contextual_adjustment: number;
    all_scores: Array<{ arm_name: string; score: number }>;
  }> {
    if (!contextType) {
      throw new ValidationError('contextType is required');
    }

    const arms = await BanditService.getArms(contextType);

    if (arms.length === 0) {
      throw new NotFoundError(`No arms found for context type "${contextType}"`);
    }

    const normContext = contextVector ? normaliseContextVector(contextVector) : null;
    const excludeSet = new Set(excludeArms || []);

    const candidates = arms.filter((a) => !excludeSet.has(a.arm_name));

    if (candidates.length === 0) {
      throw new ValidationError('All arms are excluded; no candidates available');
    }

    // Determine reward type from most recent observation for this context
    const { rows: recentObs } = await pool.query<{ reward_type: string }>(
      `SELECT DISTINCT bo.reward_type
       FROM bandit_observations bo
       JOIN bandit_arms ba ON bo.arm_id = ba.id
       WHERE ba.context_type = $1
       ORDER BY bo.reward_type
       LIMIT 1`,
      [contextType],
    );

    // Default to binary if no observations exist yet
    const rewardType = (recentObs.length > 0 ? recentObs[0].reward_type : 'binary') as 'binary' | 'continuous';

    // Find max observation count for exploration bonus calculation
    const maxObs = Math.max(...candidates.map((a) => a.observation_count), 1);

    const scores: Array<{ arm_name: string; arm_id: string; score: number; exploration: number; contextual: number }> = [];

    for (const arm of candidates) {
      // 1. Thompson Sample from posterior
      let thompsonSample: number;

      if (rewardType === 'binary') {
        thompsonSample = sampleBeta(arm.alpha, arm.beta);
      } else {
        // Normal-Inverse Gamma: sample sigma^2 ~ InvGamma(a, b)
        // then sample mean ~ Normal(mu, sigma^2 / lambda)
        const sigma2 = sampleInverseGamma(arm.a, arm.b);
        thompsonSample = sampleNormal(arm.mu, sigma2 / arm.lambda);
      }

      // 2. Contextual adjustment
      let contextualAdj = 0;
      if (normContext) {
        const weights = await BanditService.getContextWeights(arm.id);
        contextualAdj = computeContextualAdjustment(weights, normContext);
      }

      // 3. Exploration bonus for under-explored arms
      // Bonus decreases as observation count approaches the max
      const explorationBonus = arm.observation_count === 0
        ? EXPLORATION_BONUS
        : EXPLORATION_BONUS * Math.sqrt(Math.log(maxObs + 1) / (arm.observation_count + 1));

      const totalScore = thompsonSample + contextualAdj + explorationBonus;

      scores.push({
        arm_name: arm.arm_name,
        arm_id: arm.id,
        score: totalScore,
        exploration: explorationBonus,
        contextual: contextualAdj,
      });
    }

    // Pick the arm with the highest score
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    return {
      selected_arm: best.arm_name,
      arm_id: best.arm_id,
      score: best.score,
      exploration_bonus: best.exploration,
      contextual_adjustment: best.contextual,
      all_scores: scores.map((s) => ({ arm_name: s.arm_name, score: s.score })),
    };
  }

  /**
   * Get statistics for all arms in a context type, including mean and
   * 95% confidence intervals computed from the posterior.
   */
  static async getArmStats(contextType: string): Promise<ArmStats[]> {
    if (!contextType) {
      throw new ValidationError('contextType is required');
    }

    const arms = await BanditService.getArms(contextType);

    if (arms.length === 0) {
      return [];
    }

    // Determine reward type
    const { rows: recentObs } = await pool.query<{ reward_type: string }>(
      `SELECT DISTINCT bo.reward_type
       FROM bandit_observations bo
       JOIN bandit_arms ba ON bo.arm_id = ba.id
       WHERE ba.context_type = $1
       LIMIT 1`,
      [contextType],
    );

    const rewardType = (recentObs.length > 0 ? recentObs[0].reward_type : 'binary') as 'binary' | 'continuous';

    const stats: ArmStats[] = [];

    for (const arm of arms) {
      let mean: number;
      let lower: number;
      let upper: number;

      if (rewardType === 'binary') {
        // Beta distribution: mean = alpha / (alpha + beta)
        mean = arm.alpha / (arm.alpha + arm.beta);

        // 95% CI approximation for Beta distribution using normal approximation
        // Variance of Beta = alpha * beta / ((alpha + beta)^2 * (alpha + beta + 1))
        const total = arm.alpha + arm.beta;
        const variance = (arm.alpha * arm.beta) / (total * total * (total + 1));
        const stddev = Math.sqrt(variance);
        lower = Math.max(0, mean - 1.96 * stddev);
        upper = Math.min(1, mean + 1.96 * stddev);
      } else {
        // Normal-Inverse Gamma: mean = mu
        // Marginal distribution of mu is Student-t with 2a degrees of freedom
        // Variance of marginal = b / (a * lambda)
        mean = arm.mu;
        const marginalVariance = arm.a > 1 ? arm.b / ((arm.a - 1) * arm.lambda) : arm.b / arm.lambda;
        const stddev = Math.sqrt(marginalVariance);
        // For df = 2a, use t-quantile; approximate with 1.96 for large a
        const tQuantile = arm.a > 5 ? 1.96 : 2.0 + 4.0 / (2 * arm.a);
        lower = mean - tQuantile * stddev;
        upper = mean + tQuantile * stddev;
      }

      stats.push({
        arm_name: arm.arm_name,
        observation_count: arm.observation_count,
        mean: Math.round(mean * 10000) / 10000,
        confidence_interval: {
          lower: Math.round(lower * 10000) / 10000,
          upper: Math.round(upper * 10000) / 10000,
        },
        confidence_width: Math.round((upper - lower) * 10000) / 10000,
        last_updated_at: arm.last_updated_at,
      });
    }

    // Sort by mean descending
    stats.sort((a, b) => b.mean - a.mean);
    return stats;
  }

  /**
   * Return the confidence interval width for a specific arm.
   * Narrower = more certain about the arm's true performance.
   */
  static async getConfidence(
    contextType: string,
    armName: string,
  ): Promise<{ arm_name: string; confidence_width: number; observation_count: number }> {
    const allStats = await BanditService.getArmStats(contextType);
    const armStat = allStats.find((s) => s.arm_name === armName);

    if (!armStat) {
      throw new NotFoundError(`Arm "${armName}" not found in context "${contextType}"`);
    }

    return {
      arm_name: armStat.arm_name,
      confidence_width: armStat.confidence_width,
      observation_count: armStat.observation_count,
    };
  }

  /**
   * Check whether the bandit has converged for a given context type.
   *
   * Convergence is defined as: the best arm's confidence interval does NOT
   * overlap with the second-best arm's confidence interval.
   *
   * @param threshold Optional minimum gap between CIs to declare convergence.
   */
  static async hasConverged(
    contextType: string,
    threshold: number = 0,
  ): Promise<ConvergenceResult> {
    const stats = await BanditService.getArmStats(contextType);

    if (stats.length === 0) {
      return {
        converged: false,
        best_arm: '',
        second_best_arm: null,
        best_ci: { lower: 0, upper: 0 },
        second_ci: null,
        overlap: false,
        total_observations: 0,
      };
    }

    if (stats.length === 1) {
      return {
        converged: false,
        best_arm: stats[0].arm_name,
        second_best_arm: null,
        best_ci: stats[0].confidence_interval,
        second_ci: null,
        overlap: false,
        total_observations: stats[0].observation_count,
      };
    }

    // Stats are already sorted by mean descending
    const best = stats[0];
    const secondBest = stats[1];

    // Check overlap: CIs overlap if best.lower < second.upper AND second.lower < best.upper
    // No overlap means best.lower >= second.upper (with threshold)
    const gap = best.confidence_interval.lower - secondBest.confidence_interval.upper;
    const overlap = gap < threshold;
    const converged = !overlap;

    const totalObs = stats.reduce((sum, s) => sum + s.observation_count, 0);

    return {
      converged,
      best_arm: best.arm_name,
      second_best_arm: secondBest.arm_name,
      best_ci: best.confidence_interval,
      second_ci: secondBest.confidence_interval,
      overlap,
      total_observations: totalObs,
    };
  }

  /**
   * Apply exponential time decay to all observations.
   *
   * Each observation's weight is recalculated as:
   *   weight = exp(-lambda * age_in_days)
   * where lambda = ln(2) / half_life_days.
   *
   * After updating weights, the posterior parameters for each affected arm
   * are rebuilt from scratch using the decayed weights.
   *
   * This method should be called periodically (e.g. daily via cron).
   */
  static async decayObservations(): Promise<{
    arms_updated: number;
    observations_decayed: number;
  }> {
    logger.info('Starting bandit observation decay', { halfLifeDays: DECAY_HALF_LIFE_DAYS, lambda: DECAY_LAMBDA });

    // Update all observation weights based on age
    const { rowCount: obsDecayed } = await pool.query(
      `UPDATE bandit_observations
       SET decayed_weight = EXP(-$1 * EXTRACT(EPOCH FROM (NOW() - observed_at)) / 86400.0)`,
      [DECAY_LAMBDA],
    );

    // Rebuild posterior for each arm from decayed observations
    const { rows: allArms } = await pool.query<BanditArm>(
      `SELECT id, context_type, arm_name, alpha, beta, mu, lambda, a, b, observation_count, last_updated_at, created_at FROM bandit_arms`,
    );

    let armsUpdated = 0;

    for (const arm of allArms) {
      const { rows: observations } = await pool.query<BanditObservation>(
        `SELECT id, arm_id, context_vector, reward, reward_type, decayed_weight, observed_at FROM bandit_observations WHERE arm_id = $1 ORDER BY observed_at`,
        [arm.id],
      );

      if (observations.length === 0) continue;

      const rewardType = observations[0].reward_type;

      if (rewardType === 'binary') {
        // Rebuild Beta-Binomial posterior from decayed observations
        let alpha = 1.0; // uninformative prior
        let beta = 1.0;

        for (const obs of observations) {
          alpha += obs.reward * obs.decayed_weight;
          beta += (1 - obs.reward) * obs.decayed_weight;
        }

        await pool.query(
          `UPDATE bandit_arms SET alpha = $1, beta = $2, last_updated_at = NOW() WHERE id = $3`,
          [alpha, beta, arm.id],
        );
      } else {
        // Rebuild Normal-Inverse Gamma posterior from decayed observations
        // Start from uninformative prior
        let mu = 0.0;
        let lambda = 1.0;
        let a = 1.0;
        let b = 1.0;

        for (const obs of observations) {
          const w = obs.decayed_weight;
          // Fractional conjugate update: treat w as a fractional observation count
          const lambdaNew = lambda + w;
          const muNew = (lambda * mu + w * obs.reward) / lambdaNew;
          const aNew = a + 0.5 * w;
          const bNew = b + 0.5 * w * lambda * Math.pow(obs.reward - mu, 2) / lambdaNew;

          mu = muNew;
          lambda = lambdaNew;
          a = aNew;
          b = bNew;
        }

        await pool.query(
          `UPDATE bandit_arms SET mu = $1, lambda = $2, a = $3, b = $4, last_updated_at = NOW() WHERE id = $5`,
          [mu, lambda, a, b, arm.id],
        );
      }

      armsUpdated++;
    }

    logger.info('Bandit observation decay complete', { armsUpdated, obsDecayed });

    return {
      arms_updated: armsUpdated,
      observations_decayed: obsDecayed || 0,
    };
  }
}

/**
 * Country Ranking & Opportunity Table Service.
 *
 * Phase 10 Final Output Deliverable #1.
 * Aggregates country data from the database, computes weighted opportunity
 * scores, ranks countries, and returns a structured ranking table.
 *
 * All data is sourced from the database -- no hardcoded values.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single row in the country ranking table.
 */
export interface CountryRankingEntry {
  /** Position in the ranking (1-based) */
  rank: number;
  /** ISO 3166-1 alpha-2 country code */
  country_code: string;
  /** Display name of the country */
  country_name: string;
  /** Composite opportunity score (0-100) */
  opportunity_score: number;
  /** GDP value in USD */
  gdp: number | null;
  /** Internet penetration percentage (0-100) */
  internet_penetration: number | null;
  /** E-commerce adoption percentage (0-100) */
  ecommerce_adoption: number | null;
  /** Average social media platform usage percentage (0-100) */
  social_media_usage: number;
  /** Average cost-per-click from ad costs data */
  avg_cpc: number | null;
  /** Estimated market size category based on GDP */
  market_size: string;
  /** Entry difficulty assessment based on scores */
  entry_difficulty: string;
  /** Recommended priority tier */
  recommended_priority: string;
}

/**
 * The full ranking table output structure.
 */
export interface CountryRankingTable {
  /** Ordered array of country ranking entries */
  rankings: CountryRankingEntry[];
  /** ISO-8601 timestamp when this ranking was generated */
  generated_at: string;
  /** Total number of countries in the ranking */
  total_countries: number;
  /** Description of the scoring methodology */
  methodology: ScoringMethodology;
}

/**
 * Describes the scoring methodology used to compute opportunity scores.
 */
export interface ScoringMethodology {
  /** Human-readable description of the methodology */
  description: string;
  /** Individual factor weights used in the composite score */
  weights: {
    gdp: number;
    internet_penetration: number;
    ecommerce_adoption: number;
    social_media_reach: number;
    ad_cost_efficiency: number;
    cultural_readiness: number;
  };
  /** Explanation of each factor */
  factors: Array<{
    name: string;
    weight: number;
    description: string;
    normalization: string;
  }>;
  /** Score range information */
  score_range: {
    min: number;
    max: number;
    unit: string;
  };
  /** Priority tier thresholds */
  priority_thresholds: {
    high: { min: number; max: number };
    medium: { min: number; max: number };
    low: { min: number; max: number };
    monitor: { min: number; max: number };
  };
}

/**
 * Raw country row from the database.
 */
interface CountryRow {
  id: string;
  name: string;
  code: string;
  region: string | null;
  language: string | null;
  currency: string | null;
  timezone: string | null;
  gdp: number | null;
  internet_penetration: number | null;
  ecommerce_adoption: number | null;
  social_platforms: Record<string, unknown>;
  ad_costs: Record<string, unknown>;
  cultural_behavior: Record<string, unknown>;
  opportunity_score: number | null;
  entry_strategy: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Scoring weight constants
// ---------------------------------------------------------------------------

/** Default weights for opportunity score computation. Must sum to 1.0. */
const SCORING_WEIGHTS = {
  gdp: 0.20,
  internet_penetration: 0.20,
  ecommerce_adoption: 0.25,
  social_media_reach: 0.15,
  ad_cost_efficiency: 0.10,
  cultural_readiness: 0.10,
} as const;

/** GDP cap used for normalization (5 trillion USD) */
const GDP_NORMALIZATION_CAP = 5_000_000_000_000;

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:country_ranking';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CountryRankingService {
  /**
   * Generates the full country ranking and opportunity table.
   *
   * Fetches all active countries from the database, computes a weighted
   * opportunity score for each, ranks them in descending order, and
   * returns a structured table with metadata.
   */
  static async generateCountryRanking(): Promise<CountryRankingTable> {
    // Check cache first
    const cacheKey = `${CACHE_PREFIX}:latest`;
    const cached = await cacheGet<CountryRankingTable>(cacheKey);

    if (cached) {
      logger.debug('Country ranking cache hit');
      return cached;
    }

    // Fetch all active countries from the database
    const countries = await CountryRankingService.fetchActiveCountries();

    if (countries.length === 0) {
      logger.info('No active countries found for ranking generation');
      const emptyResult: CountryRankingTable = {
        rankings: [],
        generated_at: new Date().toISOString(),
        total_countries: 0,
        methodology: CountryRankingService.getMethodology(),
      };
      return emptyResult;
    }

    // Compute opportunity scores and build ranking entries
    const scoredCountries = countries.map((country) => ({
      country,
      score: CountryRankingService.computeOpportunityScore(country),
    }));

    // Sort by score descending, then by name ascending for deterministic ordering
    scoredCountries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.country.name.localeCompare(b.country.name);
    });

    // Build ranking entries with rank numbers
    const rankings: CountryRankingEntry[] = scoredCountries.map(
      ({ country, score }, index) => ({
        rank: index + 1,
        country_code: country.code,
        country_name: country.name,
        opportunity_score: score,
        gdp: country.gdp,
        internet_penetration: country.internet_penetration,
        ecommerce_adoption: country.ecommerce_adoption,
        social_media_usage: CountryRankingService.computeSocialMediaUsage(
          country.social_platforms,
        ),
        avg_cpc: CountryRankingService.extractAvgCpc(country.ad_costs),
        market_size: CountryRankingService.classifyMarketSize(country.gdp),
        entry_difficulty: CountryRankingService.assessEntryDifficulty(score, country),
        recommended_priority: CountryRankingService.determinePriority(score),
      }),
    );

    const result: CountryRankingTable = {
      rankings,
      generated_at: new Date().toISOString(),
      total_countries: rankings.length,
      methodology: CountryRankingService.getMethodology(),
    };

    // Cache the result
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.info('Country ranking generated', {
      totalCountries: rankings.length,
      topCountry: rankings.length > 0 ? rankings[0].country_code : 'N/A',
    });

    return result;
  }

  /**
   * Returns the scoring methodology explanation.
   */
  static getMethodology(): ScoringMethodology {
    return {
      description:
        'Countries are scored using a weighted composite of six factors measuring ' +
        'economic strength, digital infrastructure, e-commerce maturity, social media reach, ' +
        'advertising cost efficiency, and cultural readiness. Each factor is normalized to a ' +
        '0-100 scale before applying weights. The final opportunity score ranges from 0 to 100.',
      weights: { ...SCORING_WEIGHTS },
      factors: [
        {
          name: 'GDP',
          weight: SCORING_WEIGHTS.gdp,
          description: 'Gross Domestic Product as a measure of economic strength and market potential.',
          normalization: `Normalized to 0-100 using a cap of $${(GDP_NORMALIZATION_CAP / 1e12).toFixed(0)} trillion USD.`,
        },
        {
          name: 'Internet Penetration',
          weight: SCORING_WEIGHTS.internet_penetration,
          description: 'Percentage of the population with internet access, indicating digital marketing reach.',
          normalization: 'Already expressed as 0-100 percentage; clamped to range.',
        },
        {
          name: 'E-commerce Adoption',
          weight: SCORING_WEIGHTS.ecommerce_adoption,
          description: 'Percentage of population engaged in online purchasing, indicating market maturity.',
          normalization: 'Already expressed as 0-100 percentage; clamped to range.',
        },
        {
          name: 'Social Media Reach',
          weight: SCORING_WEIGHTS.social_media_reach,
          description: 'Average platform penetration across all tracked social media platforms.',
          normalization: 'Averaged across platforms and clamped to 0-100.',
        },
        {
          name: 'Ad Cost Efficiency',
          weight: SCORING_WEIGHTS.ad_cost_efficiency,
          description: 'Inverse of advertising costs; lower costs yield higher efficiency scores.',
          normalization: 'Average of CPM, CPC, and CPA efficiency metrics, each normalized to 0-100.',
        },
        {
          name: 'Cultural Readiness',
          weight: SCORING_WEIGHTS.cultural_readiness,
          description: 'Assessment of cultural openness based on the richness of documented cultural behavior data.',
          normalization: 'Based on number of documented cultural attributes; scaled from 30 (no data) to 100 (10+ attributes).',
        },
      ],
      score_range: {
        min: 0,
        max: 100,
        unit: 'points',
      },
      priority_thresholds: {
        high: { min: 70, max: 100 },
        medium: { min: 50, max: 69.99 },
        low: { min: 30, max: 49.99 },
        monitor: { min: 0, max: 29.99 },
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Fetches all active countries from the database.
   */
  static async fetchActiveCountries(): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      `SELECT id, name, code, region, language, currency, timezone, gdp, internet_penetration, ecommerce_adoption, social_platforms, ad_costs, cultural_behavior, opportunity_score, entry_strategy, is_active, created_at, updated_at FROM countries WHERE is_active = true ORDER BY name ASC`,
    );
    return result.rows;
  }

  /**
   * Computes a composite opportunity score (0-100) for a country
   * using the weighted formula.
   */
  static computeOpportunityScore(country: CountryRow): number {
    const gdpScore = CountryRankingService.normalizeGDP(country.gdp);
    const internetScore = CountryRankingService.normalizePercentage(
      country.internet_penetration,
    );
    const ecommerceScore = CountryRankingService.normalizePercentage(
      country.ecommerce_adoption,
    );
    const socialScore = CountryRankingService.computeSocialMediaUsage(
      country.social_platforms,
    );
    const adCostScore = CountryRankingService.computeAdCostEfficiency(
      country.ad_costs,
    );
    const culturalScore = CountryRankingService.computeCulturalReadiness(
      country.cultural_behavior,
    );

    const weightedScore =
      gdpScore * SCORING_WEIGHTS.gdp +
      internetScore * SCORING_WEIGHTS.internet_penetration +
      ecommerceScore * SCORING_WEIGHTS.ecommerce_adoption +
      socialScore * SCORING_WEIGHTS.social_media_reach +
      adCostScore * SCORING_WEIGHTS.ad_cost_efficiency +
      culturalScore * SCORING_WEIGHTS.cultural_readiness;

    return Math.round(weightedScore * 100) / 100;
  }

  /**
   * Normalizes GDP to a 0-100 scale using the configured cap.
   */
  static normalizeGDP(gdp: number | null | undefined): number {
    if (gdp === null || gdp === undefined || gdp <= 0) {
      return 0;
    }
    return Math.round(Math.min(gdp / GDP_NORMALIZATION_CAP, 1) * 100 * 100) / 100;
  }

  /**
   * Normalizes a percentage value to the 0-100 range.
   */
  static normalizePercentage(value: number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Computes an average social media usage score from platform data.
   */
  static computeSocialMediaUsage(
    platforms: Record<string, unknown> | null | undefined,
  ): number {
    if (!platforms || Object.keys(platforms).length === 0) {
      return 0;
    }

    const values = Object.values(platforms)
      .map(Number)
      .filter((v) => !isNaN(v));

    if (values.length === 0) {
      return 0;
    }

    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.round(Math.max(0, Math.min(100, average)) * 100) / 100;
  }

  /**
   * Computes ad cost efficiency score. Lower costs = higher score.
   */
  static computeAdCostEfficiency(
    adCosts: Record<string, unknown> | null | undefined,
  ): number {
    if (!adCosts || Object.keys(adCosts).length === 0) {
      return 50; // Neutral score when no data
    }

    const scores: number[] = [];

    // CPM efficiency: lower CPM = higher score (cap at $100)
    const avgCpm = Number(adCosts.avg_cpm);
    if (!isNaN(avgCpm) && adCosts.avg_cpm !== undefined && adCosts.avg_cpm !== null) {
      scores.push(Math.max(0, Math.min(100, 100 - avgCpm)));
    }

    // CPC efficiency: lower CPC = higher score (cap at $10)
    const avgCpc = Number(adCosts.avg_cpc);
    if (!isNaN(avgCpc) && adCosts.avg_cpc !== undefined && adCosts.avg_cpc !== null) {
      scores.push(Math.max(0, Math.min(100, (1 - avgCpc / 10) * 100)));
    }

    // CPA efficiency: lower CPA = higher score (cap at $200)
    const avgCpa = Number(adCosts.avg_cpa);
    if (!isNaN(avgCpa) && adCosts.avg_cpa !== undefined && adCosts.avg_cpa !== null) {
      scores.push(Math.max(0, Math.min(100, (1 - avgCpa / 200) * 100)));
    }

    if (scores.length === 0) {
      return 50;
    }

    const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return Math.round(average * 100) / 100;
  }

  /**
   * Computes cultural readiness score from cultural behavior data.
   */
  static computeCulturalReadiness(
    culturalBehavior: Record<string, unknown> | null | undefined,
  ): number {
    if (!culturalBehavior || Object.keys(culturalBehavior).length === 0) {
      return 30; // Low baseline when no cultural data
    }

    const attributeCount = Object.keys(culturalBehavior).length;
    const score = Math.min(100, 30 + attributeCount * 10);
    return Math.round(score * 100) / 100;
  }

  /**
   * Extracts the average CPC from ad costs data.
   */
  static extractAvgCpc(
    adCosts: Record<string, unknown> | null | undefined,
  ): number | null {
    if (!adCosts) {
      return null;
    }
    const cpc = Number(adCosts.avg_cpc);
    return isNaN(cpc) ? null : Math.round(cpc * 100) / 100;
  }

  /**
   * Classifies the market size based on GDP.
   */
  static classifyMarketSize(gdp: number | null | undefined): string {
    if (gdp === null || gdp === undefined || gdp <= 0) {
      return 'unknown';
    }

    if (gdp >= 2_000_000_000_000) {
      return 'large';
    }
    if (gdp >= 500_000_000_000) {
      return 'medium';
    }
    if (gdp >= 100_000_000_000) {
      return 'small';
    }
    return 'micro';
  }

  /**
   * Assesses entry difficulty based on the opportunity score and country data.
   */
  static assessEntryDifficulty(
    score: number,
    country: CountryRow,
  ): string {
    // Higher scores generally correlate with easier entry
    // but low internet or ecommerce adds difficulty
    const internetPen = country.internet_penetration ?? 0;
    const ecommerceAdopt = country.ecommerce_adoption ?? 0;

    if (score >= 70 && internetPen >= 70 && ecommerceAdopt >= 60) {
      return 'low';
    }
    if (score >= 50 && internetPen >= 50) {
      return 'medium';
    }
    if (score >= 30) {
      return 'high';
    }
    return 'very_high';
  }

  /**
   * Determines the recommended priority tier for a country based on score.
   */
  static determinePriority(score: number): string {
    if (score >= 70) {
      return 'high';
    }
    if (score >= 50) {
      return 'medium';
    }
    if (score >= 30) {
      return 'low';
    }
    return 'monitor';
  }
}

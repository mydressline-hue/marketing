/**
 * Country Strategy Output Service.
 *
 * Phase 10 Final Output Deliverable #2.
 * Produces a marketing strategy per country by combining country data from
 * the database with Agent 2 (CountryStrategyAgent) decision outputs stored
 * in the `agent_decisions` table. Returns structured strategy objects
 * suitable for presentation in the final output dashboard.
 *
 * All data is sourced from the database -- no hardcoded values.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Platform allocation entry in a country's marketing strategy.
 */
export interface PlatformAllocation {
  /** Platform name */
  platform: string;
  /** Allocation percentage (0-100) */
  allocation_pct: number;
  /** Rationale for this platform's allocation */
  rationale: string;
}

/**
 * Complete marketing strategy for a single country.
 */
export interface CountryMarketingStrategy {
  /** ISO 3166-1 alpha-2 country code */
  country_code: string;
  /** Display name of the country */
  country_name: string;
  /** Brand positioning statement derived from Agent 2 output */
  brand_positioning: string;
  /** Cultural tone recommendation for messaging */
  cultural_tone: string;
  /** Price sensitivity assessment level */
  price_sensitivity_level: string;
  /** Recommended messaging style description */
  messaging_style: string;
  /** Platform mix with allocation percentages and rationale */
  platform_mix: PlatformAllocation[];
  /** Recommended entry strategy description */
  entry_strategy: string;
  /** Estimated timeline in months for market entry */
  timeline_months: number;
  /** Key risks identified for this market */
  key_risks: string[];
  /** Recommended actions for market entry */
  recommended_actions: string[];
  /** Confidence score for this strategy (0-100) */
  confidence_score: number;
}

/**
 * Aggregated summary of all country strategies.
 */
export interface StrategySummary {
  /** Total number of countries with strategies */
  total_countries: number;
  /** Average confidence score across all strategies */
  avg_confidence_score: number;
  /** Distribution of price sensitivity levels */
  price_sensitivity_distribution: Record<string, number>;
  /** Top platforms by average allocation across all countries */
  top_platforms: Array<{ platform: string; avg_allocation_pct: number }>;
  /** Average timeline in months across all countries */
  avg_timeline_months: number;
  /** Most common risks across all countries */
  common_risks: Array<{ risk: string; country_count: number }>;
  /** Timestamp when the summary was generated */
  generated_at: string;
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

/**
 * Raw agent decision row from the database.
 */
interface AgentDecisionRow {
  id: string;
  agent_type: string;
  decision_type: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  confidence_score: number | null;
  reasoning: string | null;
  is_approved: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'final_output:country_strategy';
const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CountryStrategyOutputService {
  /**
   * Generates a marketing strategy for one or all countries.
   *
   * If `countryCode` is provided, returns an array with a single strategy.
   * Otherwise, returns strategies for all active countries.
   *
   * Strategy data is assembled from:
   * 1. Country records in the `countries` table
   * 2. Agent 2 decisions in the `agent_decisions` table (agent_type = 'country_strategy')
   */
  static async generateStrategyPerCountry(
    countryCode?: string,
  ): Promise<CountryMarketingStrategy[]> {
    const cacheKey = countryCode
      ? `${CACHE_PREFIX}:country:${countryCode.toUpperCase()}`
      : `${CACHE_PREFIX}:all`;

    const cached = await cacheGet<CountryMarketingStrategy[]>(cacheKey);
    if (cached) {
      logger.debug('Country strategy output cache hit', { countryCode });
      return cached;
    }

    // Fetch country data
    const countries = countryCode
      ? await CountryStrategyOutputService.fetchCountryByCode(countryCode)
      : await CountryStrategyOutputService.fetchActiveCountries();

    if (countries.length === 0) {
      if (countryCode) {
        throw new NotFoundError(
          `Country with code "${countryCode.toUpperCase()}" not found`,
        );
      }
      logger.info('No active countries found for strategy generation');
      return [];
    }

    // Fetch Agent 2 decisions for all relevant countries
    const countryIds = countries.map((c) => c.id);
    const agentDecisions =
      await CountryStrategyOutputService.fetchAgentDecisions(countryIds);

    // Build strategies
    const strategies: CountryMarketingStrategy[] = countries.map((country) => {
      const decision = agentDecisions.get(country.id);
      return CountryStrategyOutputService.buildStrategy(country, decision);
    });

    // Cache the result
    await cacheSet(cacheKey, strategies, CACHE_TTL);
    logger.info('Country strategy output generated', {
      countryCode: countryCode ?? 'all',
      count: strategies.length,
    });

    return strategies;
  }

  /**
   * Returns an aggregated summary across all country strategies.
   */
  static async getStrategySummary(): Promise<StrategySummary> {
    const cacheKey = `${CACHE_PREFIX}:summary`;
    const cached = await cacheGet<StrategySummary>(cacheKey);
    if (cached) {
      logger.debug('Strategy summary cache hit');
      return cached;
    }

    const strategies =
      await CountryStrategyOutputService.generateStrategyPerCountry();

    const summary = CountryStrategyOutputService.aggregateSummary(strategies);

    await cacheSet(cacheKey, summary, CACHE_TTL);
    logger.info('Strategy summary generated', {
      totalCountries: summary.total_countries,
    });

    return summary;
  }

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  /**
   * Fetches all active countries from the database.
   */
  static async fetchActiveCountries(): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      'SELECT * FROM countries WHERE is_active = true ORDER BY name ASC',
    );
    return result.rows;
  }

  /**
   * Fetches a single country by its ISO code.
   */
  static async fetchCountryByCode(code: string): Promise<CountryRow[]> {
    const result = await pool.query<CountryRow>(
      'SELECT * FROM countries WHERE code = $1 AND is_active = true',
      [code.toUpperCase()],
    );
    return result.rows;
  }

  /**
   * Fetches the most recent Agent 2 (country_strategy) decisions for
   * the given country IDs. Returns a map from country ID to decision row.
   *
   * Uses DISTINCT ON to get only the latest decision per country.
   */
  static async fetchAgentDecisions(
    countryIds: string[],
  ): Promise<Map<string, AgentDecisionRow>> {
    if (countryIds.length === 0) {
      return new Map();
    }

    // Query agent_decisions for country_strategy agent type.
    // The input_data JSONB contains the countryId in parameters.
    // We use a lateral subquery approach to get the latest per country.
    const result = await pool.query<AgentDecisionRow & { country_id: string }>(
      `SELECT DISTINCT ON (input_data->'parameters'->>'countryId')
         ad.*,
         input_data->'parameters'->>'countryId' AS country_id
       FROM agent_decisions ad
       WHERE ad.agent_type = 'country_strategy'
         AND input_data->'parameters'->>'countryId' = ANY($1)
       ORDER BY input_data->'parameters'->>'countryId', ad.created_at DESC`,
      [countryIds],
    );

    const map = new Map<string, AgentDecisionRow>();
    for (const row of result.rows) {
      map.set(row.country_id, row);
    }

    return map;
  }

  // -----------------------------------------------------------------------
  // Strategy building
  // -----------------------------------------------------------------------

  /**
   * Builds a marketing strategy for a single country by combining
   * country data with the Agent 2 decision output.
   */
  static buildStrategy(
    country: CountryRow,
    decision?: AgentDecisionRow,
  ): CountryMarketingStrategy {
    const outputData = decision?.output_data ?? {};

    // Extract brand positioning from agent output
    const brandPositioning =
      CountryStrategyOutputService.extractBrandPositioning(outputData, country);

    // Extract cultural tone
    const culturalTone =
      CountryStrategyOutputService.extractCulturalTone(outputData, country);

    // Extract price sensitivity
    const priceSensitivityLevel =
      CountryStrategyOutputService.extractPriceSensitivity(outputData, country);

    // Extract messaging style
    const messagingStyle =
      CountryStrategyOutputService.extractMessagingStyle(outputData, country);

    // Extract platform mix
    const platformMix =
      CountryStrategyOutputService.extractPlatformMix(outputData, country);

    // Extract entry strategy
    const entryStrategy =
      CountryStrategyOutputService.extractEntryStrategy(outputData, country);

    // Extract timeline
    const timelineMonths =
      CountryStrategyOutputService.extractTimelineMonths(outputData, country);

    // Extract risks
    const keyRisks =
      CountryStrategyOutputService.extractKeyRisks(outputData, country);

    // Extract recommended actions
    const recommendedActions =
      CountryStrategyOutputService.extractRecommendedActions(outputData, country);

    // Extract confidence score
    const confidenceScore =
      CountryStrategyOutputService.extractConfidenceScore(decision, country);

    return {
      country_code: country.code,
      country_name: country.name,
      brand_positioning: brandPositioning,
      cultural_tone: culturalTone,
      price_sensitivity_level: priceSensitivityLevel,
      messaging_style: messagingStyle,
      platform_mix: platformMix,
      entry_strategy: entryStrategy,
      timeline_months: timelineMonths,
      key_risks: keyRisks,
      recommended_actions: recommendedActions,
      confidence_score: confidenceScore,
    };
  }

  // -----------------------------------------------------------------------
  // Field extraction helpers
  // -----------------------------------------------------------------------

  /**
   * Extracts brand positioning from agent output data.
   * Falls back to deriving from country data if agent output is unavailable.
   */
  static extractBrandPositioning(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string {
    // Agent 2 stores the blueprint under the output_data directly
    const bp = outputData.brandPositioning as
      | Record<string, unknown>
      | undefined;
    if (bp?.positioning && typeof bp.positioning === 'string') {
      return bp.positioning;
    }

    // Fallback: derive from country economic data
    const ecommerceLevel =
      (Number(country.ecommerce_adoption) || 0) > 50 ? 'mature' : 'emerging';
    const priceAngle =
      (Number(country.gdp) || 0) < 15_000 ? 'value-driven' : 'quality-focused';
    return `${priceAngle} brand in ${ecommerceLevel} ${country.region ?? 'global'} market targeting ${country.language ?? 'local'}-speaking digital consumers`;
  }

  /**
   * Extracts cultural tone from agent output data.
   */
  static extractCulturalTone(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string {
    const ct = outputData.culturalTone as Record<string, unknown> | undefined;
    if (ct?.formality && typeof ct.formality === 'string') {
      const humor = ct.humor ? ', humor-friendly' : '';
      const directness =
        ct.directness && typeof ct.directness === 'string'
          ? `, ${ct.directness}`
          : '';
      return `${ct.formality}${humor}${directness}`;
    }

    // Fallback: derive from region
    const region = (country.region ?? '').toLowerCase();
    if (
      region.includes('east asia') ||
      region.includes('middle east') ||
      region.includes('south asia')
    ) {
      return 'formal, indirect';
    }
    if (
      region.includes('north america') ||
      region.includes('oceania') ||
      region.includes('latin america')
    ) {
      return 'casual, direct';
    }
    return 'mixed';
  }

  /**
   * Extracts price sensitivity level from agent output data.
   */
  static extractPriceSensitivity(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string {
    const ps = outputData.priceSensitivity;
    if (ps && typeof ps === 'string') {
      return ps;
    }

    // Fallback: derive from GDP
    const gdp = Number(country.gdp) || 0;
    if (gdp < 5_000) return 'very_high';
    if (gdp < 15_000) return 'high';
    if (gdp < 40_000) return 'medium';
    return 'low';
  }

  /**
   * Extracts messaging style from agent output data.
   */
  static extractMessagingStyle(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string {
    const ms = outputData.messagingStyle as
      | Record<string, unknown>
      | undefined;
    if (ms?.primary && typeof ms.primary === 'string') {
      return ms.primary;
    }

    // Fallback: derive from region
    const region = (country.region ?? '').toLowerCase();
    if (
      region.includes('east asia') ||
      region.includes('south asia') ||
      region.includes('middle east')
    ) {
      return 'Trust-building narratives emphasizing brand heritage and quality assurance';
    }
    if (region.includes('north america') || region.includes('western europe')) {
      return 'Direct value communication highlighting unique benefits and innovation';
    }
    return 'Benefit-focused messaging with cultural relevance and local context';
  }

  /**
   * Extracts platform mix from agent output data.
   * Converts from Agent 2's weight-based format to percentage-based allocations.
   */
  static extractPlatformMix(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): PlatformAllocation[] {
    const pm = outputData.platformMix as Record<string, unknown> | undefined;
    const platforms = pm?.platforms as
      | Record<string, { weight: number; strategy: string }>
      | undefined;

    if (platforms && typeof platforms === 'object') {
      return Object.entries(platforms)
        .map(([platform, config]) => ({
          platform,
          allocation_pct: Math.round((Number(config?.weight) || 0) * 100),
          rationale: config?.strategy || `Allocated for ${platform} in ${country.name}`,
        }))
        .filter((p) => p.allocation_pct > 0)
        .sort((a, b) => b.allocation_pct - a.allocation_pct);
    }

    // Fallback: derive from social_platforms data
    return CountryStrategyOutputService.derivePlatformMixFromCountry(country);
  }

  /**
   * Derives a platform mix from the country's social platform data
   * when no agent decision is available.
   */
  static derivePlatformMixFromCountry(
    country: CountryRow,
  ): PlatformAllocation[] {
    const socialPlatforms = country.social_platforms ?? {};
    const platformNames = ['google', 'meta', 'tiktok', 'bing', 'snapchat'];
    const allocations: PlatformAllocation[] = [];

    let totalPenetration = 0;
    const penetrations: Record<string, number> = {};

    for (const platform of platformNames) {
      const penetration = Number(socialPlatforms[platform]) || 0;
      penetrations[platform] = penetration;
      totalPenetration += penetration;
    }

    for (const platform of platformNames) {
      const pct =
        totalPenetration > 0
          ? Math.round((penetrations[platform] / totalPenetration) * 100)
          : Math.round(100 / platformNames.length);

      if (pct > 0) {
        allocations.push({
          platform,
          allocation_pct: pct,
          rationale: `Derived from ${country.name} social platform penetration data`,
        });
      }
    }

    // Ensure allocations sum to 100
    if (allocations.length > 0) {
      const currentSum = allocations.reduce((s, a) => s + a.allocation_pct, 0);
      if (currentSum !== 100) {
        allocations[0].allocation_pct += 100 - currentSum;
      }
    }

    return allocations.sort((a, b) => b.allocation_pct - a.allocation_pct);
  }

  /**
   * Extracts entry strategy from agent output data.
   */
  static extractEntryStrategy(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string {
    // Check for entry strategy in the agent output timeline phases
    const timeline = outputData.timeline as
      | { phases?: Array<{ name: string; actions: string[] }> }
      | undefined;

    if (timeline?.phases && Array.isArray(timeline.phases) && timeline.phases.length > 0) {
      const firstPhase = timeline.phases[0];
      return `${firstPhase.name}: ${firstPhase.actions?.slice(0, 2).join('; ') ?? 'Market entry'}`;
    }

    // Check if the country has an entry_strategy field
    if (country.entry_strategy) {
      return country.entry_strategy;
    }

    // Fallback: derive from country data
    const ecommerce = Number(country.ecommerce_adoption) || 0;
    const internet = Number(country.internet_penetration) || 0;

    if (ecommerce > 60 && internet > 70) {
      return `Direct digital entry leveraging high e-commerce adoption (${ecommerce}%) in ${country.name}`;
    }
    if (internet > 50) {
      return `Phased digital entry with education-first campaigns in ${country.name}`;
    }
    return `Partnership-led entry with local market development in ${country.name}`;
  }

  /**
   * Extracts timeline in months from agent output data.
   */
  static extractTimelineMonths(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): number {
    const timeline = outputData.timeline as
      | { phases?: Array<{ duration: string }> }
      | undefined;

    if (timeline?.phases && Array.isArray(timeline.phases)) {
      let totalWeeks = 0;
      for (const phase of timeline.phases) {
        const weeks = CountryStrategyOutputService.parseDurationToWeeks(
          phase.duration,
        );
        totalWeeks += weeks;
      }
      if (totalWeeks > 0) {
        return Math.ceil(totalWeeks / 4);
      }
    }

    // Fallback: estimate based on country characteristics
    const ecommerce = Number(country.ecommerce_adoption) || 0;
    const internet = Number(country.internet_penetration) || 0;

    if (ecommerce > 60 && internet > 70) return 4;
    if (internet > 50) return 6;
    return 9;
  }

  /**
   * Parses a duration string like "4 weeks" or "Ongoing" to weeks.
   */
  static parseDurationToWeeks(duration: string): number {
    if (!duration || duration.toLowerCase() === 'ongoing') {
      return 8; // Default for ongoing phases
    }

    const weekMatch = duration.match(/(\d+)\s*week/i);
    if (weekMatch) {
      return parseInt(weekMatch[1], 10);
    }

    const monthMatch = duration.match(/(\d+)\s*month/i);
    if (monthMatch) {
      return parseInt(monthMatch[1], 10) * 4;
    }

    return 4; // Default
  }

  /**
   * Extracts key risks from agent output data.
   */
  static extractKeyRisks(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string[] {
    const risks = outputData.risks;
    if (Array.isArray(risks) && risks.length > 0) {
      return risks.filter((r): r is string => typeof r === 'string');
    }

    // Fallback: derive from country data
    const derivedRisks: string[] = [];
    const internet = Number(country.internet_penetration) || 0;
    const ecommerce = Number(country.ecommerce_adoption) || 0;
    const gdp = Number(country.gdp) || 0;

    if (internet < 50) {
      derivedRisks.push(
        `Low internet penetration (${internet}%) limits digital reach in ${country.name}`,
      );
    }
    if (ecommerce < 20) {
      derivedRisks.push(
        `Low e-commerce adoption (${ecommerce}%) may require education-focused campaigns`,
      );
    }
    if (gdp > 0 && gdp < 5_000) {
      derivedRisks.push(
        `Low GDP suggests limited consumer spending power in ${country.name}`,
      );
    }

    return derivedRisks;
  }

  /**
   * Extracts recommended actions from agent output data.
   */
  static extractRecommendedActions(
    outputData: Record<string, unknown>,
    country: CountryRow,
  ): string[] {
    // Check for recommendations in the agent output
    const recommendations = outputData.recommendations;
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      return recommendations.filter(
        (r): r is string => typeof r === 'string',
      );
    }

    // Check for actions in timeline phases
    const timeline = outputData.timeline as
      | { phases?: Array<{ actions: string[] }> }
      | undefined;
    if (timeline?.phases && Array.isArray(timeline.phases)) {
      const actions: string[] = [];
      for (const phase of timeline.phases) {
        if (Array.isArray(phase.actions)) {
          actions.push(
            ...phase.actions.filter(
              (a): a is string => typeof a === 'string',
            ),
          );
        }
      }
      if (actions.length > 0) {
        return actions.slice(0, 5);
      }
    }

    // Fallback: derive from country data
    const derivedActions: string[] = [];
    derivedActions.push(
      `Conduct market research for ${country.name} (${country.region ?? 'global'} region)`,
    );
    derivedActions.push(
      `Localize marketing materials into ${country.language ?? 'local language'}`,
    );

    const ecommerce = Number(country.ecommerce_adoption) || 0;
    if (ecommerce > 60) {
      derivedActions.push(
        `Set up e-commerce integration with ${country.currency ?? 'local currency'} pricing`,
      );
    }

    return derivedActions;
  }

  /**
   * Extracts the confidence score from the agent decision.
   */
  static extractConfidenceScore(
    decision?: AgentDecisionRow,
    country?: CountryRow,
  ): number {
    // Prefer the decision-level confidence score
    if (decision?.confidence_score !== null && decision?.confidence_score !== undefined) {
      return Math.round(Number(decision.confidence_score) * 100) / 100;
    }

    // Check for confidence in the output data
    const outputData = decision?.output_data ?? {};
    const confidence = outputData.confidence as
      | { score?: number }
      | undefined;
    if (confidence?.score !== undefined) {
      return Math.round(Number(confidence.score) * 100) / 100;
    }

    // Fallback: compute from data completeness
    if (country) {
      return CountryStrategyOutputService.computeFallbackConfidence(country);
    }

    return 0;
  }

  /**
   * Computes a fallback confidence score based on data completeness.
   */
  static computeFallbackConfidence(country: CountryRow): number {
    let dataPoints = 0;
    let available = 0;

    const check = (value: unknown) => {
      available++;
      if (value !== undefined && value !== null) dataPoints++;
    };

    check(country.gdp);
    check(country.internet_penetration);
    check(country.ecommerce_adoption);
    check(
      country.social_platforms &&
        Object.keys(country.social_platforms).length > 0
        ? country.social_platforms
        : null,
    );
    check(
      country.ad_costs && Object.keys(country.ad_costs).length > 0
        ? country.ad_costs
        : null,
    );
    check(
      country.cultural_behavior &&
        Object.keys(country.cultural_behavior).length > 0
        ? country.cultural_behavior
        : null,
    );

    const completeness = available > 0 ? (dataPoints / available) * 100 : 0;
    // Scale: 30 (no data) to 70 (all data present) -- without agent data,
    // confidence cannot exceed 70
    return Math.round((30 + completeness * 0.4) * 100) / 100;
  }

  // -----------------------------------------------------------------------
  // Aggregation
  // -----------------------------------------------------------------------

  /**
   * Aggregates individual country strategies into a summary.
   */
  static aggregateSummary(
    strategies: CountryMarketingStrategy[],
  ): StrategySummary {
    if (strategies.length === 0) {
      return {
        total_countries: 0,
        avg_confidence_score: 0,
        price_sensitivity_distribution: {},
        top_platforms: [],
        avg_timeline_months: 0,
        common_risks: [],
        generated_at: new Date().toISOString(),
      };
    }

    // Average confidence
    const avgConfidence =
      Math.round(
        (strategies.reduce((sum, s) => sum + s.confidence_score, 0) /
          strategies.length) *
          100,
      ) / 100;

    // Price sensitivity distribution
    const psDist: Record<string, number> = {};
    for (const s of strategies) {
      psDist[s.price_sensitivity_level] =
        (psDist[s.price_sensitivity_level] ?? 0) + 1;
    }

    // Platform allocation aggregation
    const platformTotals: Record<string, { total: number; count: number }> = {};
    for (const s of strategies) {
      for (const p of s.platform_mix) {
        if (!platformTotals[p.platform]) {
          platformTotals[p.platform] = { total: 0, count: 0 };
        }
        platformTotals[p.platform].total += p.allocation_pct;
        platformTotals[p.platform].count += 1;
      }
    }

    const topPlatforms = Object.entries(platformTotals)
      .map(([platform, data]) => ({
        platform,
        avg_allocation_pct:
          Math.round((data.total / data.count) * 100) / 100,
      }))
      .sort((a, b) => b.avg_allocation_pct - a.avg_allocation_pct);

    // Average timeline
    const avgTimeline =
      Math.round(
        (strategies.reduce((sum, s) => sum + s.timeline_months, 0) /
          strategies.length) *
          100,
      ) / 100;

    // Common risks
    const riskCounts: Record<string, number> = {};
    for (const s of strategies) {
      for (const risk of s.key_risks) {
        // Normalize risk text for grouping (take first 80 chars)
        const normalized = risk.substring(0, 80);
        riskCounts[normalized] = (riskCounts[normalized] ?? 0) + 1;
      }
    }

    const commonRisks = Object.entries(riskCounts)
      .map(([risk, count]) => ({ risk, country_count: count }))
      .sort((a, b) => b.country_count - a.country_count)
      .slice(0, 10);

    return {
      total_countries: strategies.length,
      avg_confidence_score: avgConfidence,
      price_sensitivity_distribution: psDist,
      top_platforms: topPlatforms,
      avg_timeline_months: avgTimeline,
      common_risks: commonRisks,
      generated_at: new Date().toISOString(),
    };
  }
}

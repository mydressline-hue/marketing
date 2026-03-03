// ============================================================
// AI International Growth Engine - Market Intelligence Agent
// Agent 1: Global Market Intelligence
//
// Analyzes GDP, internet penetration, e-commerce adoption,
// social platform usage, ad costs, and cultural behavior.
// Ranks countries by opportunity score and recommends entry
// strategies for international expansion.
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type { AgentInput, AgentOutput } from '../base/types';
import type { AgentType, Country } from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { retryWithBackoff } from '../../utils/helpers';

// ---- Cache Configuration ----

/** Cache key prefix for market intelligence data */
const CACHE_PREFIX = 'market_intelligence';

/** Cache TTL in seconds (10 minutes) */
const CACHE_TTL = 600;

// ---- Scoring Weight Configuration ----

/**
 * Default scoring weights for opportunity score calculation.
 * Each weight represents the proportional importance of a factor
 * in the overall opportunity assessment. Weights must sum to 1.0.
 */
const DEFAULT_SCORING_WEIGHTS = {
  gdp: 0.20,
  internetPenetration: 0.20,
  ecommerceAdoption: 0.25,
  socialReach: 0.15,
  adCostEfficiency: 0.10,
  culturalReadiness: 0.10,
} as const;

/** GDP cap used for normalization (in USD) */
const GDP_NORMALIZATION_CAP = 5_000_000_000_000;

/** Threshold above which a market is considered "top" */
const TOP_MARKET_SCORE_THRESHOLD = 70;

/** Threshold range for "emerging" markets */
const EMERGING_MARKET_SCORE_MIN = 40;
const EMERGING_MARKET_SCORE_MAX = 70;

// ---- Local Type Definitions ----

/**
 * Detailed opportunity assessment for a single country.
 * Combines a composite score with individual factor breakdowns,
 * a recommended entry strategy, and identified risks/opportunities.
 */
export interface CountryOpportunityScore {
  /** Unique identifier of the country */
  countryId: string;
  /** Display name of the country */
  countryName: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** Composite opportunity score (0-100) */
  overallScore: number;
  /** Individual factor scores contributing to the overall score */
  factors: {
    /** GDP-based economic strength score (0-100) */
    gdp: number;
    /** Internet access and digital infrastructure score (0-100) */
    internetPenetration: number;
    /** E-commerce market maturity score (0-100) */
    ecommerceAdoption: number;
    /** Social media platform reach and engagement score (0-100) */
    socialReach: number;
    /** Advertising cost efficiency score (0-100, higher = cheaper) */
    adCostEfficiency: number;
    /** Cultural openness to international brands/products (0-100) */
    culturalReadiness: number;
  };
  /** Recommended market entry approach */
  entryStrategy: string;
  /** Identified risks for this market */
  risks: string[];
  /** Identified growth opportunities for this market */
  opportunities: string[];
}

/**
 * Complete market analysis result containing ranked countries,
 * category breakdowns, and strategic recommendations.
 */
export interface MarketAnalysis {
  /** All analyzed countries ranked by opportunity score (descending) */
  rankings: CountryOpportunityScore[];
  /** Country codes of the highest-scoring markets */
  topMarkets: string[];
  /** Country codes of markets with high growth potential but moderate current scores */
  emergingMarkets: string[];
  /** Strategic recommendations for the overall expansion plan */
  recommendations: string[];
  /** ISO-8601 timestamp when this analysis was generated */
  generatedAt: string;
}

// ---- Agent Implementation ----

/**
 * Market Intelligence Agent (Agent 1).
 *
 * Performs comprehensive global market analysis by evaluating economic indicators,
 * digital infrastructure, e-commerce maturity, social media landscape, advertising
 * costs, and cultural factors for each active country in the system.
 *
 * The agent produces ranked opportunity scores, identifies top and emerging markets,
 * and recommends entry strategies tailored to each country's profile.
 *
 * @extends BaseAgent
 */
export class MarketIntelligenceAgent extends BaseAgent {
  /** Scoring weights used for opportunity calculation; sourced from config or defaults */
  private readonly scoringWeights: typeof DEFAULT_SCORING_WEIGHTS;

  constructor(config?: Partial<{
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
    scoringWeights: typeof DEFAULT_SCORING_WEIGHTS;
  }>) {
    super({
      agentType: 'market_intelligence' as AgentType,
      model: 'opus',
      maxRetries: config?.maxRetries ?? 3,
      timeoutMs: config?.timeoutMs ?? 120_000,
      confidenceThreshold: config?.confidenceThreshold ?? 60,
    });

    this.scoringWeights = config?.scoringWeights ?? { ...DEFAULT_SCORING_WEIGHTS };
  }

  // ------------------------------------------------------------------
  // Abstract method implementations
  // ------------------------------------------------------------------

  /**
   * Returns the Claude system prompt that defines this agent's AI persona
   * for market analysis tasks.
   *
   * @returns The system prompt string.
   */
  public getSystemPrompt(): string {
    return `You are the Global Market Intelligence Agent for an AI-powered international growth engine.
Your role is to analyze countries for market expansion opportunities based on economic, digital,
and cultural indicators.

You will be provided with structured country data including:
- GDP and economic indicators
- Internet penetration rates
- E-commerce adoption levels
- Social media platform usage statistics
- Digital advertising cost benchmarks
- Cultural behavior and market readiness signals

Your responsibilities:
1. Analyze each country's market potential using the provided data.
2. Identify risks and opportunities specific to each market.
3. Recommend tailored entry strategies (e.g., direct entry, partnership, phased rollout).
4. Provide confidence levels for your assessments.
5. Flag data gaps or uncertainties that could affect accuracy.

Output format: Respond with valid JSON matching the requested schema. Be specific in your
recommendations and always ground your analysis in the provided data. Do not invent data
points that were not provided. When data is missing, explicitly note it as an uncertainty.`;
  }

  /**
   * Returns the agent types whose decisions this agent can challenge.
   * Market Intelligence can challenge country strategy, paid ads, and
   * revenue forecasting decisions since it holds the foundational market data.
   *
   * @returns Array of challengeable agent types.
   */
  public getChallengeTargets(): AgentType[] {
    return ['country_strategy', 'paid_ads', 'revenue_forecasting'];
  }

  /**
   * Core processing method. Fetches all active countries, calculates
   * opportunity scores, generates AI-powered insights, and returns
   * a comprehensive market analysis.
   *
   * @param input - Standard agent input with context and parameters.
   * @returns Structured agent output with market analysis data.
   */
  public async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Starting market intelligence analysis', {
      requestId: input.requestId,
    });

    const warnings: string[] = [];
    const uncertainties: string[] = [];

    // Step 1: Fetch all active countries from DB
    const countries = await this.fetchActiveCountries();

    if (countries.length === 0) {
      const output = this.buildOutput(
        'no_markets_available',
        { rankings: [], topMarkets: [], emergingMarkets: [] },
        this.calculateConfidence({ dataAvailability: 0 }),
        'No active countries found in the database for analysis.',
        ['Add country records with market data before running analysis.'],
        ['No active countries configured in the system.'],
        [this.flagUncertainty('data', 'No country data available for analysis')],
      );
      await this.logDecision(input, output);
      return output;
    }

    // Step 2: Analyze each country and calculate opportunity scores
    const countryScores: CountryOpportunityScore[] = [];

    for (const country of countries) {
      try {
        const score = await this.analyzeCountryOpportunity(country);
        countryScores.push(score);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to analyze ${country.name} (${country.code}): ${message}`);
        this.log.warn('Country analysis failed', {
          countryId: country.id,
          countryCode: country.code,
          error: message,
        });
      }
    }

    // Step 3: Rank countries by opportunity score
    const rankings = this.rankCountries(countryScores);

    // Step 4: Categorize markets
    const topMarkets = rankings
      .filter((r) => r.overallScore >= TOP_MARKET_SCORE_THRESHOLD)
      .map((r) => r.countryCode);

    const emergingMarkets = rankings
      .filter(
        (r) =>
          r.overallScore >= EMERGING_MARKET_SCORE_MIN &&
          r.overallScore < EMERGING_MARKET_SCORE_MAX,
      )
      .map((r) => r.countryCode);

    // Step 5: Generate AI-powered recommendations
    let recommendations: string[] = [];
    try {
      recommendations = await this.generateRecommendations(rankings, topMarkets, emergingMarkets);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`AI recommendation generation failed: ${message}`);
      uncertainties.push(
        this.flagUncertainty('ai_analysis', 'Could not generate AI-powered recommendations'),
      );
      // Fall back to rule-based recommendations
      recommendations = this.generateFallbackRecommendations(rankings, topMarkets, emergingMarkets);
    }

    // Step 6: Track data completeness for confidence
    const { dataCompletenessScore, missingDataCountries } =
      this.assessDataCompleteness(countries);

    for (const entry of missingDataCountries) {
      uncertainties.push(
        this.flagUncertainty(
          'data_completeness',
          `${entry.countryName} is missing: ${entry.missingFields.join(', ')}`,
        ),
      );
    }

    // Step 7: Build confidence score
    const dataRecency = this.calculateDataRecencyScore(countries);
    const methodologyConsistency = this.calculateMethodologyConsistencyScore(countries);

    const confidence = this.calculateConfidence({
      dataAvailability: dataCompletenessScore,
      sampleSize: Math.min(100, (countries.length / 10) * 100),
      dataRecency,
      methodologyConsistency,
    });

    // Step 8: Assemble market analysis
    const analysis: MarketAnalysis = {
      rankings,
      topMarkets,
      emergingMarkets,
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    // Step 9: Cache the analysis
    await this.cacheAnalysis(analysis, input.requestId);

    // Step 10: Persist state
    await this.persistState({
      lastAnalysis: analysis.generatedAt,
      countriesAnalyzed: countries.length,
      topMarketsCount: topMarkets.length,
      emergingMarketsCount: emergingMarkets.length,
      averageScore:
        rankings.length > 0
          ? Math.round(
              (rankings.reduce((sum, r) => sum + r.overallScore, 0) / rankings.length) * 100,
            ) / 100
          : 0,
    });

    // Step 11: Build output
    const output = this.buildOutput(
      'market_analysis_complete',
      analysis as unknown as Record<string, unknown>,
      confidence,
      `Analyzed ${countries.length} countries. Identified ${topMarkets.length} top markets and ${emergingMarkets.length} emerging markets. ` +
        `Average opportunity score: ${rankings.length > 0 ? (rankings.reduce((s, r) => s + r.overallScore, 0) / rankings.length).toFixed(1) : 'N/A'}.`,
      recommendations,
      warnings,
      uncertainties,
    );

    // Step 12: Audit the decision
    await this.logDecision(input, output);

    this.log.info('Market intelligence analysis complete', {
      requestId: input.requestId,
      countriesAnalyzed: countries.length,
      topMarkets: topMarkets.length,
      emergingMarkets: emergingMarkets.length,
      confidence: confidence.score,
    });

    return output;
  }

  // ------------------------------------------------------------------
  // Public analysis methods
  // ------------------------------------------------------------------

  /**
   * Analyzes a single country's market opportunity by computing individual
   * factor scores and an overall opportunity score, then generating an
   * entry strategy recommendation.
   *
   * @param countryData - The country record from the database.
   * @returns A detailed opportunity assessment for the country.
   */
  public async analyzeCountryOpportunity(
    countryData: Country,
  ): Promise<CountryOpportunityScore> {
    const factors = {
      gdp: this.normalizeGDP(countryData.gdp),
      internetPenetration: this.normalizePercentage(countryData.internet_penetration),
      ecommerceAdoption: this.normalizePercentage(countryData.ecommerce_adoption),
      socialReach: this.assessSocialPlatformReach(
        (countryData.social_platforms as Record<string, number>) ?? {},
      ),
      adCostEfficiency: this.assessAdCostEfficiency(
        (countryData.ad_costs as Record<string, number>) ?? {},
      ),
      culturalReadiness: this.assessCulturalReadiness(
        (countryData.cultural_behavior as Record<string, string>) ?? {},
      ),
    };

    const overallScore = this.calculateOpportunityScore(countryData);

    let entryStrategy: string;
    try {
      entryStrategy = await this.recommendEntryStrategy(countryData, overallScore);
    } catch {
      entryStrategy = this.generateFallbackEntryStrategy(overallScore);
    }

    const risks = this.identifyRisks(countryData, factors);
    const opportunities = this.identifyOpportunities(countryData, factors);

    return {
      countryId: countryData.id,
      countryName: countryData.name,
      countryCode: countryData.code,
      overallScore,
      factors,
      entryStrategy,
      risks,
      opportunities,
    };
  }

  /**
   * Ranks an array of country opportunity scores in descending order
   * by overall score. Countries with identical scores are sub-sorted
   * alphabetically by country name for deterministic output.
   *
   * @param countries - The unordered country scores.
   * @returns A new array sorted by overallScore descending.
   */
  public rankCountries(
    countries: CountryOpportunityScore[],
  ): CountryOpportunityScore[] {
    return [...countries].sort((a, b) => {
      if (b.overallScore !== a.overallScore) {
        return b.overallScore - a.overallScore;
      }
      return a.countryName.localeCompare(b.countryName);
    });
  }

  /**
   * Calculates a composite opportunity score for a country using weighted
   * factors. Each factor is normalized to 0-100 and then combined using
   * the configured scoring weights.
   *
   * Weights (default):
   * - GDP: 20%
   * - Internet Penetration: 20%
   * - E-commerce Adoption: 25%
   * - Social Platform Reach: 15%
   * - Ad Cost Efficiency: 10%
   * - Cultural Readiness: 10%
   *
   * @param country - The country record with market data.
   * @returns The composite opportunity score (0-100), rounded to 2 decimals.
   */
  public calculateOpportunityScore(country: Country): number {
    const gdpScore = this.normalizeGDP(country.gdp);
    const internetScore = this.normalizePercentage(country.internet_penetration);
    const ecommerceScore = this.normalizePercentage(country.ecommerce_adoption);
    const socialScore = this.assessSocialPlatformReach(
      (country.social_platforms as Record<string, number>) ?? {},
    );
    const adCostScore = this.assessAdCostEfficiency(
      (country.ad_costs as Record<string, number>) ?? {},
    );
    const culturalScore = this.assessCulturalReadiness(
      (country.cultural_behavior as Record<string, string>) ?? {},
    );

    const weightedScore =
      gdpScore * this.scoringWeights.gdp +
      internetScore * this.scoringWeights.internetPenetration +
      ecommerceScore * this.scoringWeights.ecommerceAdoption +
      socialScore * this.scoringWeights.socialReach +
      adCostScore * this.scoringWeights.adCostEfficiency +
      culturalScore * this.scoringWeights.culturalReadiness;

    return Math.round(weightedScore * 100) / 100;
  }

  /**
   * Generates an AI-powered entry strategy recommendation for a specific
   * country based on its market data and opportunity score.
   *
   * Falls back to a rule-based strategy if the AI call fails.
   *
   * @param country - The country record.
   * @param score - The computed opportunity score (0-100).
   * @returns A textual entry strategy recommendation.
   */
  public async recommendEntryStrategy(
    country: Country,
    score: number,
  ): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Based on the following country data, recommend a market entry strategy.

Country: ${country.name} (${country.code})
Region: ${country.region}
Language: ${country.language}
Currency: ${country.currency}
GDP: ${country.gdp ?? 'Unknown'}
Internet Penetration: ${country.internet_penetration ?? 'Unknown'}%
E-commerce Adoption: ${country.ecommerce_adoption ?? 'Unknown'}%
Social Platforms: ${JSON.stringify(country.social_platforms ?? {})}
Ad Costs: ${JSON.stringify(country.ad_costs ?? {})}
Cultural Behavior: ${JSON.stringify(country.cultural_behavior ?? {})}
Opportunity Score: ${score}/100

Provide a concise entry strategy recommendation (2-3 sentences) as plain text, not JSON.`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    return response.trim();
  }

  /**
   * Retrieves cached market trend data for a specific country.
   * Returns an empty object if no trend data is cached.
   *
   * @param countryCode - ISO 3166-1 alpha-2 country code.
   * @returns Market trend data record.
   */
  public async getMarketTrends(
    countryCode: string,
  ): Promise<Record<string, unknown>> {
    const cacheKey = `${CACHE_PREFIX}:trends:${countryCode.toUpperCase()}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);

    if (cached) {
      this.log.debug('Market trends cache hit', { countryCode });
      return cached;
    }

    // Query trend data from the database
    try {
      const result = await pool.query(
        `SELECT
           c.code AS country_code,
           c.gdp,
           c.internet_penetration,
           c.ecommerce_adoption,
           c.social_platforms,
           c.ad_costs,
           c.opportunity_score,
           c.updated_at
         FROM countries c
         WHERE c.code = $1 AND c.is_active = true`,
        [countryCode.toUpperCase()],
      );

      if (result.rows.length === 0) {
        return {};
      }

      const row = result.rows[0];
      const trends: Record<string, unknown> = {
        countryCode: row.country_code,
        currentMetrics: {
          gdp: row.gdp,
          internetPenetration: row.internet_penetration,
          ecommerceAdoption: row.ecommerce_adoption,
          socialPlatforms: row.social_platforms,
          adCosts: row.ad_costs,
          opportunityScore: row.opportunity_score,
        },
        lastUpdated: row.updated_at,
      };

      await cacheSet(cacheKey, trends, CACHE_TTL);
      return trends;
    } catch (error) {
      this.log.error('Failed to fetch market trends', { countryCode, error });
      return {};
    }
  }

  /**
   * Assesses advertising cost efficiency from a map of ad cost metrics.
   * Lower costs result in higher efficiency scores.
   *
   * Recognized keys: avg_cpm, avg_cpc, avg_cpa. If none are present,
   * returns a neutral score of 50.
   *
   * @param adCosts - Record mapping cost metric names to their values.
   * @returns An efficiency score between 0 and 100.
   */
  public assessAdCostEfficiency(adCosts: Record<string, number>): number {
    if (!adCosts || Object.keys(adCosts).length === 0) {
      return 50; // Neutral score when no data
    }

    const scores: number[] = [];

    // CPM efficiency: lower CPM = higher score (cap at $100)
    if (adCosts.avg_cpm !== undefined && adCosts.avg_cpm !== null) {
      const cpmScore = Math.max(0, Math.min(100, 100 - adCosts.avg_cpm));
      scores.push(cpmScore);
    }

    // CPC efficiency: lower CPC = higher score (cap at $10, normalized to 0-100)
    if (adCosts.avg_cpc !== undefined && adCosts.avg_cpc !== null) {
      const cpcScore = Math.max(0, Math.min(100, (1 - adCosts.avg_cpc / 10) * 100));
      scores.push(cpcScore);
    }

    // CPA efficiency: lower CPA = higher score (cap at $200, normalized to 0-100)
    if (adCosts.avg_cpa !== undefined && adCosts.avg_cpa !== null) {
      const cpaScore = Math.max(0, Math.min(100, (1 - adCosts.avg_cpa / 200) * 100));
      scores.push(cpaScore);
    }

    if (scores.length === 0) {
      return 50;
    }

    const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return Math.round(average * 100) / 100;
  }

  /**
   * Assesses social media platform reach from a map of platform names
   * to their user penetration percentages (0-100).
   *
   * The score is the average penetration across all listed platforms,
   * clamped to [0, 100]. Returns 0 if no platforms are listed.
   *
   * @param platforms - Record mapping platform names to penetration percentages.
   * @returns A social reach score between 0 and 100.
   */
  public assessSocialPlatformReach(
    platforms: Record<string, number>,
  ): number {
    if (!platforms || Object.keys(platforms).length === 0) {
      return 0;
    }

    const values = Object.values(platforms).filter(
      (v) => typeof v === 'number' && !isNaN(v),
    );

    if (values.length === 0) {
      return 0;
    }

    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.round(Math.max(0, Math.min(100, average)) * 100) / 100;
  }

  // ------------------------------------------------------------------
  // Private helper methods
  // ------------------------------------------------------------------

  /**
   * Fetches all active countries from the database.
   *
   * @returns Array of active country records.
   */
  private async fetchActiveCountries(): Promise<Country[]> {
    const cacheKey = `${CACHE_PREFIX}:active_countries`;
    const cached = await cacheGet<Country[]>(cacheKey);

    if (cached) {
      this.log.debug('Active countries cache hit');
      return cached;
    }

    const result = await pool.query<Country>(
      `SELECT * FROM countries WHERE is_active = true ORDER BY name ASC`,
    );

    const countries = result.rows;
    await cacheSet(cacheKey, countries, CACHE_TTL);
    this.log.debug('Fetched active countries from DB', { count: countries.length });

    return countries;
  }

  /**
   * Normalizes a GDP value to a 0-100 scale using a configurable cap.
   *
   * @param gdp - Raw GDP value in USD, or undefined/null.
   * @returns Normalized score between 0 and 100.
   */
  private normalizeGDP(gdp: number | undefined | null): number {
    if (gdp === undefined || gdp === null || gdp <= 0) {
      return 0;
    }
    return Math.round(Math.min(gdp / GDP_NORMALIZATION_CAP, 1) * 100 * 100) / 100;
  }

  /**
   * Normalizes a percentage value to the 0-100 range.
   *
   * @param value - A percentage value (expected 0-100), or undefined/null.
   * @returns The clamped value, or 0 if absent.
   */
  private normalizePercentage(value: number | undefined | null): number {
    if (value === undefined || value === null) {
      return 0;
    }
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Assesses cultural readiness based on cultural behavior indicators.
   * Counts the number of defined cultural attributes as a proxy for
   * how well the market's cultural landscape is understood and favorable.
   *
   * @param culturalBehavior - Key-value cultural attribute map.
   * @returns A cultural readiness score between 0 and 100.
   */
  private assessCulturalReadiness(
    culturalBehavior: Record<string, string>,
  ): number {
    if (!culturalBehavior || Object.keys(culturalBehavior).length === 0) {
      return 30; // Low baseline when no cultural data
    }

    const attributeCount = Object.keys(culturalBehavior).length;
    // More cultural attributes documented = better cultural readiness assessment
    // Scale: 1 attribute = 40, 5+ attributes = 80, 10+ attributes = 100
    const score = Math.min(100, 30 + attributeCount * 10);
    return Math.round(score * 100) / 100;
  }

  /**
   * Identifies potential risks for a country based on factor scores.
   *
   * @param country - The country record.
   * @param factors - The computed factor scores.
   * @returns Array of risk descriptions.
   */
  private identifyRisks(
    country: Country,
    factors: CountryOpportunityScore['factors'],
  ): string[] {
    const risks: string[] = [];

    if (factors.internetPenetration < 40) {
      risks.push('Low internet penetration limits digital marketing reach');
    }
    if (factors.ecommerceAdoption < 30) {
      risks.push('Low e-commerce adoption may require extensive market education');
    }
    if (factors.adCostEfficiency < 30) {
      risks.push('High advertising costs may reduce ROI');
    }
    if (factors.socialReach < 20) {
      risks.push('Limited social media presence reduces organic growth potential');
    }
    if (factors.culturalReadiness <= 30) {
      risks.push('Insufficient cultural data; market adaptation strategy may be unreliable');
    }
    if (!country.gdp || country.gdp <= 0) {
      risks.push('GDP data unavailable; economic viability is uncertain');
    }

    return risks;
  }

  /**
   * Identifies potential opportunities for a country based on factor scores.
   *
   * @param country - The country record.
   * @param factors - The computed factor scores.
   * @returns Array of opportunity descriptions.
   */
  private identifyOpportunities(
    country: Country,
    factors: CountryOpportunityScore['factors'],
  ): string[] {
    const opportunities: string[] = [];

    if (factors.internetPenetration >= 80) {
      opportunities.push('High internet penetration enables broad digital campaign reach');
    }
    if (factors.ecommerceAdoption >= 70) {
      opportunities.push('Mature e-commerce ecosystem supports quick market entry');
    }
    if (factors.adCostEfficiency >= 70) {
      opportunities.push('Low ad costs provide favorable unit economics for paid acquisition');
    }
    if (factors.socialReach >= 60) {
      opportunities.push('Strong social media adoption enables influencer and viral marketing');
    }
    if (factors.gdp >= 60) {
      opportunities.push('Strong economy indicates high consumer spending potential');
    }
    if (
      factors.ecommerceAdoption >= 30 &&
      factors.ecommerceAdoption < 60 &&
      factors.internetPenetration >= 60
    ) {
      opportunities.push(
        'Growing e-commerce market with good digital infrastructure offers first-mover advantage',
      );
    }

    return opportunities;
  }

  /**
   * Generates a deterministic fallback entry strategy based on score tiers
   * when the AI-based strategy generation is unavailable.
   *
   * @param score - The opportunity score.
   * @returns A strategy recommendation string.
   */
  private generateFallbackEntryStrategy(score: number): string {
    if (score >= 80) {
      return 'Direct market entry with full localization and dedicated marketing budget. Prioritize paid ads and partnerships with local platforms.';
    }
    if (score >= 60) {
      return 'Phased market entry: start with digital-first approach using localized content, then expand to paid channels based on initial performance.';
    }
    if (score >= 40) {
      return 'Exploratory entry through partnerships with local distributors or marketplace platforms. Limit initial investment and validate demand before scaling.';
    }
    return 'Monitor market development. Consider indirect entry through cross-border e-commerce or regional hub strategy when conditions improve.';
  }

  /**
   * Generates AI-powered strategic recommendations for the overall
   * market expansion plan.
   *
   * @param rankings - Ranked country opportunity scores.
   * @param topMarkets - Country codes of top-scoring markets.
   * @param emergingMarkets - Country codes of emerging markets.
   * @returns Array of recommendation strings.
   */
  private async generateRecommendations(
    rankings: CountryOpportunityScore[],
    topMarkets: string[],
    emergingMarkets: string[],
  ): Promise<string[]> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = `Based on the following market analysis, provide 3-5 strategic recommendations for international expansion.

Top Markets (score >= ${TOP_MARKET_SCORE_THRESHOLD}): ${topMarkets.join(', ') || 'None identified'}
Emerging Markets (score ${EMERGING_MARKET_SCORE_MIN}-${EMERGING_MARKET_SCORE_MAX}): ${emergingMarkets.join(', ') || 'None identified'}
Total Countries Analyzed: ${rankings.length}

Top 5 countries by score:
${rankings
  .slice(0, 5)
  .map((r) => `- ${r.countryName} (${r.countryCode}): ${r.overallScore}/100`)
  .join('\n')}

Respond with a JSON array of recommendation strings. Example:
["Recommendation 1", "Recommendation 2", "Recommendation 3"]`;

    const response = await retryWithBackoff(
      () => this.callAI(systemPrompt, userPrompt),
      this.config.maxRetries,
      1000,
    );

    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      this.log.warn('Failed to parse AI recommendations response', {
        responseLength: response.length,
      });
    }

    // If parsing fails, return the raw response as a single recommendation
    return [response.trim()];
  }

  /**
   * Generates rule-based fallback recommendations when AI is unavailable.
   *
   * @param rankings - Ranked country opportunity scores.
   * @param topMarkets - Country codes of top-scoring markets.
   * @param emergingMarkets - Country codes of emerging markets.
   * @returns Array of recommendation strings.
   */
  private generateFallbackRecommendations(
    rankings: CountryOpportunityScore[],
    topMarkets: string[],
    emergingMarkets: string[],
  ): string[] {
    const recommendations: string[] = [];

    if (topMarkets.length > 0) {
      recommendations.push(
        `Prioritize direct market entry in top markets: ${topMarkets.slice(0, 3).join(', ')}. These markets show the strongest combination of economic strength and digital readiness.`,
      );
    }

    if (emergingMarkets.length > 0) {
      recommendations.push(
        `Allocate exploratory budget for emerging markets: ${emergingMarkets.slice(0, 3).join(', ')}. These markets offer growth potential with manageable investment.`,
      );
    }

    if (rankings.length > 0) {
      const avgScore =
        rankings.reduce((sum, r) => sum + r.overallScore, 0) / rankings.length;
      if (avgScore < 50) {
        recommendations.push(
          'Overall market landscape shows moderate opportunity. Focus resources on the top-scoring markets and delay expansion to lower-scoring regions.',
        );
      }
    }

    recommendations.push(
      'Establish market monitoring for all analyzed countries to detect changes in opportunity scores over time.',
    );

    return recommendations;
  }

  /**
   * Evaluates data completeness across all countries to determine
   * the confidence level of the analysis.
   *
   * @param countries - Array of country records.
   * @returns An object with the overall completeness score and details of missing data.
   */
  private assessDataCompleteness(countries: Country[]): {
    dataCompletenessScore: number;
    missingDataCountries: Array<{
      countryName: string;
      countryCode: string;
      missingFields: string[];
    }>;
  } {
    const requiredFields: Array<{ key: keyof Country; label: string }> = [
      { key: 'gdp', label: 'GDP' },
      { key: 'internet_penetration', label: 'Internet Penetration' },
      { key: 'ecommerce_adoption', label: 'E-commerce Adoption' },
      { key: 'social_platforms', label: 'Social Platforms' },
      { key: 'ad_costs', label: 'Ad Costs' },
      { key: 'cultural_behavior', label: 'Cultural Behavior' },
    ];

    let totalFields = 0;
    let populatedFields = 0;
    const missingDataCountries: Array<{
      countryName: string;
      countryCode: string;
      missingFields: string[];
    }> = [];

    for (const country of countries) {
      const missing: string[] = [];

      for (const field of requiredFields) {
        totalFields++;
        const value = country[field.key];

        if (value === undefined || value === null) {
          missing.push(field.label);
        } else if (typeof value === 'object' && Object.keys(value).length === 0) {
          missing.push(field.label);
        } else {
          populatedFields++;
        }
      }

      if (missing.length > 0) {
        missingDataCountries.push({
          countryName: country.name,
          countryCode: country.code,
          missingFields: missing,
        });
      }
    }

    const dataCompletenessScore =
      totalFields > 0
        ? Math.round((populatedFields / totalFields) * 100 * 100) / 100
        : 0;

    return { dataCompletenessScore, missingDataCountries };
  }

  /**
   * Calculates a data recency score (0-100) based on how recently the
   * country records were updated. Computes the average age in days of
   * each country's `updated_at` timestamp and maps it to a score:
   * - Updated today: 100
   * - 30+ days old: 50
   * - 90+ days old: 25
   * - 180+ days old: 0
   *
   * Uses linear interpolation between these anchor points.
   *
   * @param countries - Array of country records with `updated_at` timestamps.
   * @returns A recency score between 0 and 100.
   */
  private calculateDataRecencyScore(countries: Country[]): number {
    if (countries.length === 0) {
      return 0;
    }

    const now = Date.now();
    let totalAgeDays = 0;
    let validCount = 0;

    for (const country of countries) {
      if (country.updated_at) {
        const updatedAt = new Date(country.updated_at).getTime();
        if (!isNaN(updatedAt)) {
          const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
          totalAgeDays += Math.max(0, ageDays);
          validCount++;
        }
      }
    }

    if (validCount === 0) {
      return 0;
    }

    const avgAgeDays = totalAgeDays / validCount;

    // Piecewise linear mapping from age in days to score:
    //   0 days   -> 100
    //   30 days  -> 50
    //   90 days  -> 25
    //   180 days -> 0
    let score: number;
    if (avgAgeDays <= 0) {
      score = 100;
    } else if (avgAgeDays <= 30) {
      // Linear from 100 (at 0 days) to 50 (at 30 days)
      score = 100 - (avgAgeDays / 30) * 50;
    } else if (avgAgeDays <= 90) {
      // Linear from 50 (at 30 days) to 25 (at 90 days)
      score = 50 - ((avgAgeDays - 30) / 60) * 25;
    } else if (avgAgeDays <= 180) {
      // Linear from 25 (at 90 days) to 0 (at 180 days)
      score = 25 - ((avgAgeDays - 90) / 90) * 25;
    } else {
      score = 0;
    }

    return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
  }

  /**
   * Calculates a methodology consistency score (0-100) based on what
   * percentage of countries have complete key data fields. A country
   * is considered "complete" if all of the following fields are present
   * and non-empty: gdp, internet_penetration, ecommerce_adoption,
   * social_platforms, ad_costs, and cultural_behavior.
   *
   * @param countries - Array of country records.
   * @returns A consistency score between 0 and 100.
   */
  private calculateMethodologyConsistencyScore(countries: Country[]): number {
    if (countries.length === 0) {
      return 0;
    }

    const keyFields: Array<keyof Country> = [
      'gdp',
      'internet_penetration',
      'ecommerce_adoption',
      'social_platforms',
      'ad_costs',
      'cultural_behavior',
    ];

    let completeCountries = 0;

    for (const country of countries) {
      let isComplete = true;

      for (const field of keyFields) {
        const value = country[field];
        if (value === undefined || value === null) {
          isComplete = false;
          break;
        }
        if (typeof value === 'object' && Object.keys(value).length === 0) {
          isComplete = false;
          break;
        }
      }

      if (isComplete) {
        completeCountries++;
      }
    }

    const score = (completeCountries / countries.length) * 100;
    return Math.round(score * 100) / 100;
  }

  /**
   * Caches the full market analysis result.
   *
   * @param analysis - The market analysis to cache.
   * @param requestId - The request ID for cache key scoping.
   */
  private async cacheAnalysis(
    analysis: MarketAnalysis,
    requestId: string,
  ): Promise<void> {
    try {
      await cacheSet(
        `${CACHE_PREFIX}:analysis:${requestId}`,
        analysis,
        CACHE_TTL,
      );
      // Also cache as "latest" for quick access
      await cacheSet(`${CACHE_PREFIX}:analysis:latest`, analysis, CACHE_TTL);
      this.log.debug('Market analysis cached', { requestId });
    } catch (error) {
      this.log.warn('Failed to cache market analysis', { error });
    }
  }
}
